import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Check, Plus, ChevronDown, Timer, MessageSquare, BarChart2, X } from 'lucide-react'
import { useActiveSession, useExerciseHistory } from '../hooks/useSession'
import { useDay } from '../hooks/usePrograms'
import { useExercises } from '../hooks/useExercises'
import { supabase } from '../lib/supabase'
import type { Exercise, WorkoutSlot, TrackingType } from '../lib/types'

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#f97316', back: '#3b82f6', shoulders: '#8b5cf6',
  biceps: '#ec4899', triceps: '#f43f5e', legs: '#22c55e',
  glutes: '#a855f7', core: '#eab308', cardio: '#14b8a6',
  warmup: '#6b7280', other: '#6b7280',
}

// Cycle: 45s → 60s → 90s → 2m → 3m → off → 45s …
const REST_OPTIONS = [45, 60, 90, 120, 180, 0]
const REST_LABELS: Record<number, string> = { 0: 'Off', 45: '45s', 60: '1m', 90: '1:30', 120: '2m', 180: '3m' }
const RING_R = 44
const RING_C = 2 * Math.PI * RING_R

interface SetRow { reps: string; weight: string; logged: boolean; loggedSetId?: string; note: string; showNote: boolean }
interface SlotState { exercise: Exercise; expanded: boolean; rows: SetRow[] }
type SetHistory = { weight: number | null; reps: number | null } | null
type PrevMap = Record<string, SetHistory[] | null>

function fmtElapsed(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
function fmtSeconds(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim()
}

export default function WorkoutView() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { session, sets, logSet, deleteSet, finishSession } = useActiveSession(sessionId ?? null)
  const { day, loading } = useDay(session?.day_id)
  const { exercises, updateExerciseNote } = useExercises()
  const [editNoteExId, setEditNoteExId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')

  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>({})
  const [swapSlotId, setSwapSlotId] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [prevMap, setPrevMap] = useState<PrevMap>({})
  const [historyExId, setHistoryExId] = useState<string | null>(null)
  const [historyExName, setHistoryExName] = useState('')

  // ── Timers ────────────────────────────────────────────────────────────────
  const [workoutSecs, setWorkoutSecs] = useState(0)
  const [restOptionIdx, setRestOptionIdx] = useState(2) // default 90s
  const restDuration = REST_OPTIONS[restOptionIdx]
  const restEnabled = restDuration > 0
  const [activeRest, setActiveRest] = useState<{ endTime: number; duration: number } | null>(null)
  const [, setRestTick] = useState(0) // drives re-renders during countdown

  const restStorageKey = sessionId ? `rest_end_${sessionId}` : null

  // Derived rest values — always computed from real end time, never drift
  const restSecs = activeRest ? Math.max(0, Math.ceil((activeRest.endTime - Date.now()) / 1000)) : 0
  const restProgress = activeRest ? restSecs / activeRest.duration : 0
  const ringColor = restProgress > 0.5 ? '#22c55e' : restProgress > 0.25 ? '#eab308' : '#ef4444'

  // Workout elapsed — derived from real start time so reload/reopen stays accurate
  useEffect(() => {
    if (!session?.started_at) return
    const startMs = new Date(session.started_at).getTime()
    const tick = () => setWorkoutSecs(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [session?.started_at])

  // Rest — interval fires every 500ms; clears when expired to stop ticking
  useEffect(() => {
    if (!activeRest) return
    const t = setInterval(() => {
      if (Date.now() >= activeRest.endTime) {
        setActiveRest(null)
        if (restStorageKey) localStorage.removeItem(restStorageKey)
      } else {
        setRestTick(n => n + 1)
      }
    }, 500)
    return () => clearInterval(t)
  }, [activeRest, restStorageKey])

  // Restore rest from localStorage if app was closed mid-rest
  useEffect(() => {
    if (!restStorageKey) return
    const stored = localStorage.getItem(restStorageKey)
    if (stored) {
      try {
        const { endTime, duration } = JSON.parse(stored)
        if (endTime > Date.now()) setActiveRest({ endTime, duration })
        else localStorage.removeItem(restStorageKey)
      } catch { localStorage.removeItem(restStorageKey) }
    }
  }, [restStorageKey])

  function cycleRest() {
    setRestOptionIdx(i => (i + 1) % REST_OPTIONS.length)
    setActiveRest(null)
    if (restStorageKey) localStorage.removeItem(restStorageKey)
  }

  function startRest() {
    if (!restEnabled) return
    const endTime = Date.now() + restDuration * 1000
    setActiveRest({ endTime, duration: restDuration })
    if (restStorageKey) localStorage.setItem(restStorageKey, JSON.stringify({ endTime, duration: restDuration }))
  }

  // ── Slot init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!day?.slots) return
    setSlotStates(prev => {
      const next = { ...prev }
      for (const slot of day.slots!) {
        if (next[slot.id]) continue
        const ex = slot.default_exercise
        if (!ex) continue
        next[slot.id] = {
          exercise: ex,
          expanded: true,
          rows: Array.from({ length: slot.sets_target }, () => ({
            reps: String(slot.reps_target), weight: '', logged: false, note: '', showNote: false,
          })),
        }
      }
      return next
    })
  }, [day])

  // Per-set history from last session — keyed by exercise_id, includes all alternatives
  useEffect(() => {
    if (!day?.slots) return
    const ids = new Set<string>()
    for (const s of day.slots) {
      if (s.default_exercise?.id) ids.add(s.default_exercise.id)
      for (const alt of s.alternatives ?? []) ids.add(alt.id)
    }
    if (!ids.size) return
    supabase
      .from('logged_sets')
      .select('exercise_id, set_number, weight, reps, session_id, logged_at')
      .in('exercise_id', [...ids])
      .order('logged_at', { ascending: false })
      .limit(1000)
      .then(({ data }) => {
        // Find most recent session_id per exercise, then collect that session's sets
        const latestSession: Record<string, string> = {}
        for (const row of data ?? []) {
          if (!latestSession[row.exercise_id]) latestSession[row.exercise_id] = row.session_id
        }
        const map: PrevMap = {}
        for (const row of data ?? []) {
          if (row.session_id !== latestSession[row.exercise_id]) continue
          if (!map[row.exercise_id]) map[row.exercise_id] = []
          const arr = map[row.exercise_id]!
          const idx = row.set_number - 1
          while (arr.length <= idx) arr.push(null)
          if (arr[idx] === null) arr[idx] = { weight: row.weight, reps: row.reps }
        }
        setPrevMap(map)
      })
  }, [day])

  // Auto-fill rows with per-set prev values once history loads
  useEffect(() => {
    if (!Object.keys(prevMap).length) return
    setSlotStates(prev => {
      const next = { ...prev }
      for (const [slotId, state] of Object.entries(next)) {
        const history = prevMap[state.exercise.id]
        if (!history?.length) continue
        next[slotId] = {
          ...state,
          rows: state.rows.map((row, idx) => {
            if (row.logged) return row
            const setData = history[idx] ?? history[history.length - 1]
            if (!setData) return row
            return {
              ...row,
              weight: setData.weight != null ? String(setData.weight) : row.weight,
              reps: setData.reps != null ? String(setData.reps) : row.reps,
            }
          }),
        }
      }
      return next
    })
  }, [prevMap])

  // Sync logged sets → row state
  useEffect(() => {
    if (!sets.length) return
    setSlotStates(prev => {
      const next = { ...prev }
      for (const s of sets) {
        if (!next[s.slot_id]) continue
        const rows = next[s.slot_id].rows
        const idx = s.set_number - 1
        if (rows[idx] !== undefined) {
          rows[idx] = { reps: String(s.reps ?? ''), weight: String(s.weight ?? ''), logged: true, loggedSetId: s.id, note: (s as any).notes ?? '', showNote: false }
        }
      }
      return next
    })
  }, [sets])

  if (loading || !day) return <div style={styles.loading}>Loading workout…</div>

  function updateRow(slotId: string, i: number, field: 'reps' | 'weight', value: string) {
    setSlotStates(prev => {
      const rows = [...prev[slotId].rows]
      rows[i] = { ...rows[i], [field]: value }
      return { ...prev, [slotId]: { ...prev[slotId], rows } }
    })
  }

  function toggleNote(slotId: string, i: number) {
    setSlotStates(prev => {
      const rows = [...prev[slotId].rows]
      rows[i] = { ...rows[i], showNote: !rows[i].showNote }
      return { ...prev, [slotId]: { ...prev[slotId], rows } }
    })
  }

  function updateNote(slotId: string, i: number, note: string) {
    setSlotStates(prev => {
      const rows = [...prev[slotId].rows]
      rows[i] = { ...rows[i], note }
      return { ...prev, [slotId]: { ...prev[slotId], rows } }
    })
  }

  async function logRow(slot: WorkoutSlot, i: number) {
    const state = slotStates[slot.id]
    if (!state) return
    const row = state.rows[i]
    const result = await logSet({
      slot_id: slot.id, exercise_id: state.exercise.id, set_number: i + 1,
      reps: row.reps ? parseInt(row.reps) : null,
      weight: row.weight ? parseFloat(row.weight) : null,
      notes: row.note || undefined,
    })
    if (result && !result.error && result.data) {
      setSlotStates(prev => {
        const rows = [...prev[slot.id].rows]
        rows[i] = { ...rows[i], logged: true, loggedSetId: result.data.id }
        return { ...prev, [slot.id]: { ...prev[slot.id], rows } }
      })
      startRest()
    }
  }

  async function unlogRow(slot: WorkoutSlot, i: number) {
    const row = slotStates[slot.id]?.rows[i]
    if (!row?.loggedSetId) return
    await deleteSet(row.loggedSetId)
    setSlotStates(prev => {
      const rows = [...prev[slot.id].rows]
      rows[i] = { ...rows[i], logged: false, loggedSetId: undefined }
      return { ...prev, [slot.id]: { ...prev[slot.id], rows } }
    })
  }

  function addRow(slotId: string) {
    setSlotStates(prev => {
      const state = prev[slotId]
      const last = state.rows[state.rows.length - 1]
      return { ...prev, [slotId]: { ...state, rows: [...state.rows, { reps: last?.reps ?? '', weight: last?.weight ?? '', logged: false, note: '', showNote: false }] } }
    })
  }

  function swapExercise(slot: WorkoutSlot, exercise: Exercise) {
    const history = prevMap[exercise.id]
    setSlotStates(prev => ({
      ...prev,
      [slot.id]: {
        ...prev[slot.id],
        exercise,
        rows: prev[slot.id].rows.map((row, idx) => {
          if (row.logged) return row
          const setData = history?.[idx] ?? history?.[history.length - 1]
          return {
            ...row,
            weight: setData?.weight != null ? String(setData.weight) : '',
            reps: setData?.reps != null ? String(setData.reps) : '',
          }
        }),
      },
    }))
    setSwapSlotId(null)
  }

  async function handleFinish() {
    setFinishing(true)
    await finishSession()
    navigate('/history')
  }

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <button style={styles.backBtn} onClick={() => {
          if (confirm('Leave this workout? Your logged sets are saved but the session will remain open.')) navigate(-1)
        }}><ArrowLeft size={18} /></button>
        <h2 style={styles.dayName}>{day.name}</h2>

        {/* Elapsed timer */}
        <span style={styles.elapsed}>{fmtElapsed(workoutSecs)}</span>

        {/* Rest toggle — tap to cycle duration */}
        <button
          style={{ ...styles.restToggle, background: restEnabled ? '#1e3a5f' : '#1f2937', color: restEnabled ? '#60a5fa' : '#6b7280' }}
          onClick={cycleRest}
          title="Tap to change rest duration"
        >
          <Timer size={14} />
          <span>{REST_LABELS[restDuration]}</span>
        </button>

        <button style={styles.finishBtn} onClick={handleFinish} disabled={finishing}>
          {finishing ? 'Saving…' : 'Finish'}
        </button>
      </div>

      {/* Exercise slots */}
      <div style={styles.slotList}>
        {(day.slots ?? []).map(slot => {
          const state = slotStates[slot.id]
          const exercise = state?.exercise ?? slot.default_exercise
          const isSwapped = exercise?.id !== slot.default_exercise_id
          const color = MUSCLE_COLORS[exercise?.muscle_group ?? ''] ?? '#6b7280'
          const prevHistory = prevMap[exercise?.id ?? ''] ?? null
          const firstPrev = prevHistory?.[0] ?? null
          const isExpanded = state?.expanded !== false
          const rows = state?.rows ?? []
          const swapCandidates = exercises.filter(e =>
            e.id !== exercise?.id && e.movement_category && e.movement_category === exercise?.movement_category
          )

          return (
            <div key={slot.id} style={styles.card}>
              <button
                style={styles.cardHeader}
                onClick={() => setSlotStates(prev => ({
                  ...prev,
                  [slot.id]: { ...prev[slot.id], exercise: exercise!, expanded: !isExpanded },
                }))}
              >
                <div style={styles.headerLeft}>
                  <span style={{ ...styles.dot, background: color }} />
                  <div>
                    <span style={styles.exName}>{exercise?.name}</span>
                    {isSwapped && <span style={styles.swappedBadge}>swapped</span>}
                    <div style={styles.prevLabel}>
                      <span style={{ color: '#6b7280' }}>Target: {slot.sets_target}×{slot.reps_target}{exercise?.tracking_type === 'duration' ? 's' : ''}</span>
                      {firstPrev && (
                        <span style={{ marginLeft: 8 }}>
                          {exercise?.tracking_type === 'duration'
                            ? `· Last: ${fmtSeconds(firstPrev.reps ?? 0)}`
                            : exercise?.tracking_type === 'sets_reps'
                            ? `· Last: ${firstPrev.reps} reps`
                            : firstPrev.weight != null
                            ? `· Last: ${firstPrev.weight}×${firstPrev.reps}`
                            : `· Last: ${firstPrev.reps} reps`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronDown size={16} color="#6b7280" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
              </button>

              {isExpanded && (
                <div style={styles.cardBody}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={styles.swapBtn} onClick={() => setSwapSlotId(swapSlotId === slot.id ? null : slot.id)}>
                      <RefreshCw size={13} />
                      Swap ({swapCandidates.length + (slot.alternatives?.length ?? 0)} options)
                    </button>
                    <button style={styles.swapBtn} onClick={() => {
                      setHistoryExId(exercise?.id ?? null)
                      setHistoryExName(exercise?.name ?? '')
                    }}>
                      <BarChart2 size={13} />
                      History
                    </button>
                  </div>

                  {swapSlotId === slot.id && (
                    <SwapPicker
                      slot={slot} currentExerciseId={exercise?.id ?? ''}
                      autoCandidates={swapCandidates}
                      onSwap={ex => swapExercise(slot, ex)}
                      onClose={() => setSwapSlotId(null)}
                    />
                  )}

                  {/* Per-exercise persistent note */}
                  {(() => {
                    const exId = exercise?.id ?? ''
                    const liveNote = exercises.find(e => e.id === exId)?.notes ?? ''
                    const isEditing = editNoteExId === exId
                    if (isEditing) return (
                      <div style={styles.exNoteEdit}>
                        <textarea
                          style={styles.exNoteTextarea}
                          autoFocus
                          rows={3}
                          value={editNoteText}
                          onChange={e => setEditNoteText(e.target.value)}
                          placeholder="Notes for this exercise (cues, form reminders…)"
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button style={styles.exNoteCancel} onClick={() => setEditNoteExId(null)}>Cancel</button>
                          <button style={styles.exNoteSave} onClick={async () => {
                            await updateExerciseNote(exId, editNoteText.trim())
                            setEditNoteExId(null)
                          }}>Save</button>
                        </div>
                      </div>
                    )
                    return (
                      <button style={styles.exNoteDisplay} onClick={() => {
                        setEditNoteExId(exId)
                        setEditNoteText(liveNote)
                      }}>
                        {liveNote
                          ? <span style={styles.exNoteText}>{liveNote}</span>
                          : <span style={styles.exNotePlaceholder}>Add exercise note…</span>}
                        <span style={styles.exNoteEditHint}>Edit</span>
                      </button>
                    )
                  })()}

                  <SetTable
                    slot={slot} exercise={exercise} rows={rows} prevHistory={prevHistory}
                    onUpdate={(i, f, v) => updateRow(slot.id, i, f, v)}
                    onLog={i => logRow(slot, i)}
                    onUnlog={i => unlogRow(slot, i)}
                    onNoteToggle={i => toggleNote(slot.id, i)}
                    onNoteChange={(i, n) => updateNote(slot.id, i, n)}
                  />

                  <button style={styles.addSetBtn} onClick={() => addRow(slot.id)}>
                    <Plus size={14} /> Add Set
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ height: restSecs > 0 ? 200 : 80 }} />

      {/* Rest timer overlay */}
      {historyExId && (
        <ExerciseHistoryModal
          exerciseId={historyExId}
          exerciseName={historyExName}
          onClose={() => setHistoryExId(null)}
        />
      )}

      {restSecs > 0 && (
        <div style={styles.restOverlay}>
          <div style={styles.restCard}>
            {/* SVG ring */}
            <svg width="110" height="110" style={{ flexShrink: 0 }}>
              <circle cx="55" cy="55" r={RING_R} fill="none" stroke="#374151" strokeWidth="6" />
              <circle
                cx="55" cy="55" r={RING_R} fill="none"
                stroke={ringColor} strokeWidth="6"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - restProgress)}
                strokeLinecap="round"
                transform="rotate(-90 55 55)"
                style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.5s' }}
              />
              <text x="55" y="60" textAnchor="middle" fill="#f9fafb" fontSize="22" fontWeight="700">
                {restSecs}
              </text>
            </svg>

            <div style={styles.restInfo}>
              <div style={styles.restLabel}>Rest</div>
              <div style={styles.restSub}>Next set in {fmtSeconds(restSecs)}</div>
              <button style={styles.skipBtn} onClick={() => {
                setActiveRest(null)
                if (restStorageKey) localStorage.removeItem(restStorageKey)
              }}>Skip Rest</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SetTable({ slot, exercise, rows, prevHistory, onUpdate, onLog, onUnlog, onNoteToggle, onNoteChange }: {
  slot: WorkoutSlot; exercise: Exercise | undefined; rows: SetRow[]
  prevHistory: SetHistory[] | null
  onUpdate: (i: number, field: 'reps' | 'weight', value: string) => void
  onLog: (i: number) => void; onUnlog: (i: number) => void
  onNoteToggle: (i: number) => void; onNoteChange: (i: number, note: string) => void
}) {
  const type: TrackingType = exercise?.tracking_type ?? 'sets_reps_weight'
  const isDuration = type === 'duration'
  const hasWeight = type === 'sets_reps_weight'
  const gridCols = isDuration ? '28px 1fr 1fr 32px 28px' : hasWeight ? '28px 1fr 1fr 1fr 32px 28px' : '28px 1fr 1fr 32px 28px'

  function prevLabel(i: number) {
    const p = prevHistory?.[i] ?? prevHistory?.[prevHistory.length - 1] ?? null
    if (!p) return '—'
    if (isDuration) return fmtSeconds(p.reps ?? 0)
    if (hasWeight) return p.weight != null ? `${p.weight}×${p.reps}` : `${p.reps}`
    return `${p.reps ?? '—'}`
  }

  return (
    <div style={styles.setTable}>
      <div style={{ ...styles.setHeaderRow, gridTemplateColumns: gridCols }}>
        <span style={styles.colSet}>Set</span>
        <span style={styles.colPrev}>Prev</span>
        {isDuration ? <span style={styles.colInput}>Secs</span>
          : hasWeight ? <><span style={styles.colInput}>lbs</span><span style={styles.colInput}>Reps</span></>
          : <span style={styles.colInput}>Reps</span>}
        <span style={styles.colCheck} />
        <span />
      </div>

      {rows.map((row, i) => (
        <div key={i}>
          <div style={{ ...styles.setRow, gridTemplateColumns: gridCols, background: row.logged ? '#14532d22' : 'transparent' }}>
            <span style={{ ...styles.colSet, color: row.logged ? '#4ade80' : '#9ca3af' }}>{i + 1}</span>
            <span style={styles.colPrev}>{prevLabel(i)}</span>

            {isDuration ? (
              <input style={{ ...styles.setInput, opacity: row.logged ? 0.5 : 1 }}
                type="number" inputMode="numeric" placeholder="—"
                value={row.reps} onChange={e => onUpdate(i, 'reps', e.target.value)} disabled={row.logged} />
            ) : hasWeight ? (
              <>
                <input style={{ ...styles.setInput, opacity: row.logged ? 0.5 : 1 }}
                  type="number" inputMode="decimal" placeholder="—"
                  value={row.weight} onChange={e => onUpdate(i, 'weight', e.target.value)} disabled={row.logged} />
                <input style={{ ...styles.setInput, opacity: row.logged ? 0.5 : 1 }}
                  type="number" inputMode="numeric" placeholder="—"
                  value={row.reps} onChange={e => onUpdate(i, 'reps', e.target.value)} disabled={row.logged} />
              </>
            ) : (
              <input style={{ ...styles.setInput, opacity: row.logged ? 0.5 : 1 }}
                type="number" inputMode="numeric" placeholder="—"
                value={row.reps} onChange={e => onUpdate(i, 'reps', e.target.value)} disabled={row.logged} />
            )}

            <button
              style={{ ...styles.checkBtn, background: row.logged ? '#16a34a' : '#374151' }}
              onClick={() => row.logged ? onUnlog(i) : onLog(i)}
            >
              <Check size={14} color={row.logged ? '#fff' : '#9ca3af'} />
            </button>
            <button
              style={{ ...styles.noteIconBtn, color: row.showNote || row.note ? '#60a5fa' : '#4b5563' }}
              onClick={() => onNoteToggle(i)}
              title="Add note"
            >
              <MessageSquare size={12} />
            </button>
          </div>

          {row.showNote && (
            <div style={styles.noteExpansion}>
              {row.logged
                ? <p style={styles.noteReadOnly}>{row.note || <span style={{ color: '#4b5563' }}>No note</span>}</p>
                : <textarea
                    style={styles.noteInput}
                    placeholder="Add a note for this set…"
                    value={row.note}
                    onChange={e => onNoteChange(i, e.target.value)}
                    rows={2}
                  />
              }
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SwapPicker({ slot, currentExerciseId, autoCandidates, onSwap, onClose }: {
  slot: WorkoutSlot; currentExerciseId: string; autoCandidates: Exercise[]
  onSwap: (ex: Exercise) => void; onClose: () => void
}) {
  const manualAlts = (slot.alternatives ?? []).filter(a => a.id !== currentExerciseId && !autoCandidates.find(c => c.id === a.id))
  const showDefault = currentExerciseId !== slot.default_exercise_id && slot.default_exercise
  const hasAny = showDefault || manualAlts.length > 0 || autoCandidates.length > 0

  function Section({ label, color, exercises }: { label: string; color: string; exercises: Exercise[] }) {
    if (!exercises.length) return null
    return (
      <div style={sp.section}>
        <div style={{ ...sp.sectionLabel, color }}>{label}</div>
        {exercises.map(ex => (
          <button key={ex.id} style={sp.choice} onClick={() => onSwap(ex)}>
            {ex.name}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={sp.panel}>
      <div style={sp.header}>
        <span style={sp.title}>Swap exercise</span>
        <button style={sp.close} onClick={onClose}>Cancel</button>
      </div>
      {!hasAny
        ? <p style={sp.empty}>No alternatives found for this movement.</p>
        : <>
            {showDefault && (
              <div style={sp.section}>
                <div style={{ ...sp.sectionLabel, color: '#9ca3af' }}>Default</div>
                <button style={sp.choice} onClick={() => onSwap(slot.default_exercise!)}>
                  {slot.default_exercise!.name}
                </button>
              </div>
            )}
            <Section label="Pinned swaps" color="#60a5fa" exercises={manualAlts} />
            <Section label="Similar — same movement pattern" color="#a78bfa" exercises={autoCandidates} />
          </>
      }
    </div>
  )
}

// ── Exercise history chart ────────────────────────────────────────────────────

interface ChartPoint { x: number; y: number; value: number; shortDate: string }

function HistoryChart({ points, yMin, yMax, yLabel, hoveredIdx, onHover }: {
  points: ChartPoint[]; yMin: number; yMax: number; yLabel: string
  hoveredIdx: number | null; onHover: (i: number | null) => void
}) {
  const W = 320, H = 148
  const PAD = { l: 42, r: 14, t: 18, b: 26 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const BLUE = '#60a5fa', SURFACE = '#1f2937', GRID = '#374151', MUTED = '#6b7280'

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath}L${points[points.length - 1].x},${PAD.t + plotH}L${PAD.l},${PAD.t + plotH}Z`

  const yTicks = [0, 1, 2, 3].map(i => yMin + (i / 3) * (yMax - yMin))
  const showX = (i: number) => points.length <= 5 || i === 0 || i === points.length - 1 || (points.length <= 9 && i % 2 === 0)
  const last = points[points.length - 1]
  const hov = hoveredIdx != null ? points[hoveredIdx] : null

  return (
    <div style={{ position: 'relative', padding: '0 16px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {/* Y gridlines + labels */}
        {yTicks.map((v, i) => {
          const cy = PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH
          return (
            <g key={i}>
              <line x1={PAD.l} y1={cy} x2={W - PAD.r} y2={cy} stroke={GRID} strokeWidth="1" />
              <text x={PAD.l - 5} y={cy + 4} textAnchor="end" fill={MUTED} fontSize="10" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(v)}
              </text>
            </g>
          )
        })}

        {/* Unit label */}
        <text x={PAD.l - 5} y={PAD.t - 5} textAnchor="end" fill={MUTED} fontSize="9">{yLabel}</text>

        {/* Area fill — series hue at 10% */}
        <path d={areaPath} fill={BLUE} fillOpacity="0.10" />

        {/* 2px line, round joins */}
        <path d={linePath} fill="none" stroke={BLUE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots: surface ring (r=7) then filled dot (r=5) */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={7} fill={SURFACE} />
            <circle cx={p.x} cy={p.y} r={5} fill={BLUE} />
          </g>
        ))}

        {/* Hovered state: larger ring + vertical crosshair */}
        {hov && (
          <g>
            <line x1={hov.x} y1={PAD.t} x2={hov.x} y2={PAD.t + plotH} stroke={BLUE} strokeWidth="1" strokeDasharray="3 2" opacity="0.35" />
            <circle cx={hov.x} cy={hov.y} r={9} fill={SURFACE} />
            <circle cx={hov.x} cy={hov.y} r={6} fill={BLUE} />
          </g>
        )}

        {/* Direct label on most-recent point only */}
        <text
          x={last.x} y={last.y - 11}
          textAnchor={last.x > W - PAD.r - 24 ? 'end' : 'middle'}
          fill="#f9fafb" fontSize="11" fontWeight="600"
        >
          {Math.round(last.value)}
        </text>

        {/* X axis date labels */}
        {points.map((p, i) => showX(i) && (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" fill={MUTED} fontSize="9">{p.shortDate}</text>
        ))}

        {/* Wide invisible hit targets */}
        {points.map((p, i) => (
          <rect key={i}
            x={p.x - 22} y={PAD.t} width={44} height={plotH + 4}
            fill="transparent" style={{ cursor: 'crosshair' }}
            onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}
            onTouchStart={e => { e.preventDefault(); onHover(hoveredIdx === i ? null : i) }}
          />
        ))}
      </svg>

      {/* Floating tooltip */}
      {hov && (
        <div style={{
          position: 'absolute', top: 6,
          left: `calc(${(hov.x / W) * 100}% - 8px)`,
          transform: hov.x > W * 0.6 ? 'translateX(-90%)' : 'translateX(-10%)',
          background: '#374151', border: '1px solid #4b5563', borderRadius: '8px',
          padding: '5px 10px', fontSize: '12px', color: '#f9fafb',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 700 }}>{Math.round(hov.value)} {yLabel}</div>
          <div style={{ color: '#9ca3af', fontSize: '11px' }}>{hov.shortDate}</div>
        </div>
      )}
    </div>
  )
}

function ExerciseHistoryModal({ exerciseId, exerciseName, onClose }: {
  exerciseId: string; exerciseName: string; onClose: () => void
}) {
  const history = useExerciseHistory(exerciseId)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Group by session_id, most recent first
  const sessions: { sessionId: string; date: string; shortDate: string; sets: typeof history }[] = []
  const seen = new Set<string>()
  for (const row of history) {
    if (!seen.has(row.session_id)) {
      seen.add(row.session_id)
      const d = (row as any).session?.started_at ? new Date((row as any).session.started_at) : new Date()
      sessions.push({
        sessionId: row.session_id,
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sets: [],
      })
    }
    sessions.find(s => s.sessionId === row.session_id)!.sets.push(row)
  }
  for (const s of sessions) s.sets.sort((a, b) => a.set_number - b.set_number)

  // Build chart: last 10 sessions oldest→newest
  const isWeighted = sessions.some(s => s.sets.some(set => (set as any).weight != null && (set as any).weight > 0))
  const yLabel = isWeighted ? 'lbs' : 'reps'
  const chartSessions = sessions.slice(0, 10).reverse()

  let chartPoints: ChartPoint[] = []
  if (chartSessions.length >= 2) {
    const W = 320, PAD = { l: 42, r: 14, t: 18, b: 26 }
    const plotW = W - PAD.l - PAD.r, plotH = 148 - PAD.t - PAD.b
    const vals = chartSessions.map(s =>
      Math.max(...s.sets.map(set => isWeighted ? ((set as any).weight ?? 0) : ((set as any).reps ?? 0)))
    )
    const rawMin = Math.min(...vals), rawMax = Math.max(...vals)
    const pad = rawMax - rawMin ? (rawMax - rawMin) * 0.25 : rawMax * 0.2 || 5
    const yMin = Math.max(0, rawMin - pad), yMax = rawMax + pad
    chartPoints = chartSessions.map((s, i) => ({
      x: PAD.l + (chartSessions.length > 1 ? (i / (chartSessions.length - 1)) * plotW : plotW / 2),
      y: PAD.t + plotH - ((vals[i] - yMin) / (yMax - yMin)) * plotH,
      value: vals[i],
      shortDate: s.shortDate,
      yMin, yMax,
    } as ChartPoint & { yMin: number; yMax: number }))
    const { yMin: chartYMin, yMax: chartYMax } = chartPoints[0] as any

    return (
      <div style={hm.backdrop} onClick={onClose}>
        <div style={hm.sheet} onClick={e => e.stopPropagation()}>
          <div style={hm.header}>
            <span style={hm.title}>{exerciseName}</span>
            <button style={hm.close} onClick={onClose}><X size={18} /></button>
          </div>
          <HistoryChart points={chartPoints} yMin={chartYMin} yMax={chartYMax} yLabel={yLabel} hoveredIdx={hoveredIdx} onHover={setHoveredIdx} />
          <div style={hm.divider} />
          <div style={hm.body}>
            {sessions.map(s => (
              <div key={s.sessionId} style={hm.session}>
                <div style={hm.sessionDate}>{s.date}</div>
                {s.sets.map(set => (
                  <div key={set.id} style={hm.setLine}>
                    <span style={hm.setNum}>Set {set.set_number}</span>
                    <span style={hm.setVal}>
                      {(set as any).weight != null ? `${(set as any).weight} lbs × ${set.reps} reps`
                        : set.reps != null ? `${set.reps} reps` : '—'}
                    </span>
                    {(set as any).notes && <span style={hm.setNote}>{(set as any).notes}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={hm.backdrop} onClick={onClose}>
      <div style={hm.sheet} onClick={e => e.stopPropagation()}>
        <div style={hm.header}>
          <span style={hm.title}>{exerciseName}</span>
          <button style={hm.close} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={hm.body}>
          {sessions.length === 0
            ? <p style={hm.empty}>No history yet for this exercise.</p>
            : sessions.map(s => (
              <div key={s.sessionId} style={hm.session}>
                <div style={hm.sessionDate}>{s.date}</div>
                {s.sets.map(set => (
                  <div key={set.id} style={hm.setLine}>
                    <span style={hm.setNum}>Set {set.set_number}</span>
                    <span style={hm.setVal}>
                      {(set as any).weight != null ? `${(set as any).weight} lbs × ${set.reps} reps`
                        : set.reps != null ? `${set.reps} reps` : '—'}
                    </span>
                    {(set as any).notes && <span style={hm.setNote}>{(set as any).notes}</span>}
                  </div>
                ))}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

const hm: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: '#00000080', zIndex: 50, display: 'flex', alignItems: 'flex-end' },
  sheet: { background: '#1f2937', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px', borderBottom: '1px solid #374151' },
  title: { fontWeight: 700, fontSize: '16px', color: '#f9fafb' },
  close: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px', display: 'flex' },
  divider: { height: '1px', background: '#374151', margin: '0 16px' },
  body: { overflowY: 'auto', padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' },
  empty: { color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  session: { display: 'flex', flexDirection: 'column', gap: '4px' },
  sessionDate: { fontSize: '12px', fontWeight: 700, color: '#60a5fa', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  setLine: { display: 'flex', alignItems: 'baseline', gap: '8px', paddingLeft: '8px' },
  setNum: { fontSize: '12px', color: '#6b7280', minWidth: '36px' },
  setVal: { fontSize: '14px', color: '#f9fafb', fontWeight: 500 },
  setNote: { fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' },
}

const styles: Record<string, React.CSSProperties> = {
  page: { background: '#111827', minHeight: '100vh', color: '#f9fafb' },
  loading: { padding: '40px', textAlign: 'center', color: '#9ca3af' },
  topBar: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: '#1f2937', borderBottom: '1px solid #374151', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { background: 'none', border: 'none', color: '#f9fafb', cursor: 'pointer', padding: '4px', display: 'flex' },
  dayName: { flex: 1, fontSize: '1rem', fontWeight: 700 },
  elapsed: { fontVariantNumeric: 'tabular-nums', fontSize: '14px', color: '#9ca3af', fontWeight: 600, minWidth: '40px', textAlign: 'center' },
  restToggle: { display: 'flex', alignItems: 'center', gap: '4px', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  finishBtn: { background: '#22c55e', border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  slotList: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px', margin: '0 auto' },
  card: { background: '#1f2937', borderRadius: '14px', overflow: 'hidden' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'none', border: 'none', color: '#f9fafb', cursor: 'pointer', width: '100%', textAlign: 'left', gap: '8px' },
  headerLeft: { display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
  exName: { fontWeight: 600, fontSize: '15px' },
  swappedBadge: { marginLeft: '8px', fontSize: '10px', background: '#7c3aed22', color: '#a78bfa', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 },
  prevLabel: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  cardBody: { padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  swapBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: '#374151', border: 'none', borderRadius: '8px', padding: '8px 12px', color: '#d1d5db', fontSize: '13px', cursor: 'pointer', alignSelf: 'flex-start' },
  setTable: { background: '#111827', borderRadius: '10px', overflow: 'hidden' },
  setHeaderRow: { display: 'grid', padding: '8px 10px', gap: '6px', borderBottom: '1px solid #1f2937' },
  setRow: { display: 'grid', padding: '6px 10px', gap: '6px', alignItems: 'center', borderBottom: '1px solid #1f2937' },
  colSet: { fontSize: '13px', fontWeight: 700, textAlign: 'center' },
  colPrev: { fontSize: '12px', color: '#6b7280', textAlign: 'center' },
  colInput: { fontSize: '12px', color: '#6b7280', textAlign: 'center' },
  colCheck: {},
  setInput: { background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', color: '#f9fafb', fontSize: '14px', padding: '7px 4px', textAlign: 'center', width: '100%' },
  checkBtn: { width: '32px', height: '32px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noteIconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noteExpansion: { padding: '6px 10px 8px', borderBottom: '1px solid #1f2937', background: '#0d1117' },
  noteInput: { width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', color: '#f9fafb', fontSize: '13px', padding: '8px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const },
  noteReadOnly: { fontSize: '13px', color: '#d1d5db', margin: 0, fontStyle: 'italic' },
  addSetBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px dashed #374151', borderRadius: '8px', padding: '8px 14px', color: '#6b7280', fontSize: '13px', cursor: 'pointer', alignSelf: 'flex-start' },
  exNoteDisplay: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '9px 12px', width: '100%', cursor: 'pointer', textAlign: 'left' },
  exNoteText: { fontSize: '13px', color: '#d1d5db', lineHeight: 1.4, flex: 1 },
  exNotePlaceholder: { fontSize: '13px', color: '#4b5563', fontStyle: 'italic', flex: 1 },
  exNoteEditHint: { fontSize: '11px', color: '#6b7280', flexShrink: 0, marginTop: '1px' },
  exNoteEdit: { background: '#111827', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' },
  exNoteTextarea: { width: '100%', background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', color: '#f9fafb', fontSize: '13px', padding: '8px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, lineHeight: 1.4 },
  exNoteCancel: { background: 'none', border: '1px solid #374151', borderRadius: '6px', padding: '6px 12px', color: '#9ca3af', cursor: 'pointer', fontSize: '13px' },
  exNoteSave: { background: '#3b82f6', border: 'none', borderRadius: '6px', padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  // Rest overlay
  restOverlay: { position: 'fixed', bottom: '70px', left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 16px', zIndex: 20, pointerEvents: 'none' },
  restCard: { background: '#1f2937', border: '1px solid #374151', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '20px', maxWidth: '380px', width: '100%', boxShadow: '0 8px 32px #00000060', pointerEvents: 'all' },
  restInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  restLabel: { fontWeight: 700, fontSize: '18px' },
  restSub: { color: '#9ca3af', fontSize: '13px' },
  skipBtn: { marginTop: '8px', background: '#374151', border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#d1d5db', fontSize: '13px', cursor: 'pointer', fontWeight: 600 },
}

const sp: Record<string, React.CSSProperties> = {
  panel: { background: '#111827', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontWeight: 600, fontSize: '13px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  close: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '13px' },
  section: { display: 'flex', flexDirection: 'column', gap: '4px' },
  sectionLabel: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '2px', paddingBottom: '2px' },
  choice: { display: 'flex', alignItems: 'center', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '11px 14px', color: '#f9fafb', cursor: 'pointer', fontSize: '14px', fontWeight: 500, textAlign: 'left', width: '100%' },
  empty: { color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '8px' },
}
