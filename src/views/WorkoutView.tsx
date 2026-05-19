import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Check, Plus, ChevronDown, Timer } from 'lucide-react'
import { useActiveSession } from '../hooks/useSession'
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

interface SetRow { reps: string; weight: string; logged: boolean; loggedSetId?: string }
interface SlotState { exercise: Exercise; expanded: boolean; rows: SetRow[] }
type PrevMap = Record<string, { weight: number; reps: number } | null>

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
  const { exercises } = useExercises()

  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>({})
  const [swapSlotId, setSwapSlotId] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [prevMap, setPrevMap] = useState<PrevMap>({})

  // ── Timers ────────────────────────────────────────────────────────────────
  const [workoutSecs, setWorkoutSecs] = useState(0)
  const [restOptionIdx, setRestOptionIdx] = useState(2) // default 90s
  const restDuration = REST_OPTIONS[restOptionIdx]
  const restEnabled = restDuration > 0
  const [restSecs, setRestSecs] = useState(0)

  // Workout elapsed ticker
  useEffect(() => {
    const t = setInterval(() => setWorkoutSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Rest countdown ticker
  useEffect(() => {
    if (restSecs <= 0) return
    const t = setTimeout(() => setRestSecs(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [restSecs])

  function cycleRest() {
    setRestOptionIdx(i => (i + 1) % REST_OPTIONS.length)
    setRestSecs(0) // reset active rest when changing
  }

  function startRest() {
    if (restEnabled) setRestSecs(restDuration)
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
            reps: String(slot.reps_target), weight: '', logged: false,
          })),
        }
      }
      return next
    })
  }, [day])

  // Previous best per exercise
  useEffect(() => {
    if (!day?.slots) return
    const ids = day.slots.map(s => s.default_exercise?.id).filter(Boolean) as string[]
    if (!ids.length) return
    supabase
      .from('logged_sets').select('exercise_id, weight, reps, logged_at')
      .in('exercise_id', ids).not('weight', 'is', null)
      .order('logged_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        const map: PrevMap = {}
        for (const row of data ?? []) {
          if (!map[row.exercise_id]) map[row.exercise_id] = { weight: row.weight, reps: row.reps }
        }
        setPrevMap(map)
      })
  }, [day])

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
          rows[idx] = { reps: String(s.reps ?? ''), weight: String(s.weight ?? ''), logged: true, loggedSetId: s.id }
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

  async function logRow(slot: WorkoutSlot, i: number) {
    const state = slotStates[slot.id]
    if (!state) return
    const row = state.rows[i]
    const result = await logSet({
      slot_id: slot.id, exercise_id: state.exercise.id, set_number: i + 1,
      reps: row.reps ? parseInt(row.reps) : null,
      weight: row.weight ? parseFloat(row.weight) : null,
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
      return { ...prev, [slotId]: { ...state, rows: [...state.rows, { reps: last?.reps ?? '', weight: last?.weight ?? '', logged: false }] } }
    })
  }

  function swapExercise(slot: WorkoutSlot, exercise: Exercise) {
    setSlotStates(prev => ({ ...prev, [slot.id]: { ...prev[slot.id], exercise } }))
    setSwapSlotId(null)
  }

  async function handleFinish() {
    setFinishing(true)
    await finishSession()
    navigate('/history')
  }

  // Rest ring math
  const restProgress = restDuration > 0 ? restSecs / restDuration : 0
  const ringColor = restProgress > 0.5 ? '#22c55e' : restProgress > 0.25 ? '#eab308' : '#ef4444'

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
          const prev = prevMap[exercise?.id ?? '']
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
                    {prev && <div style={styles.prevLabel}>Previous: {prev.weight} lbs × {prev.reps}</div>}
                  </div>
                </div>
                <ChevronDown size={16} color="#6b7280" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
              </button>

              {isExpanded && (
                <div style={styles.cardBody}>
                  <button style={styles.swapBtn} onClick={() => setSwapSlotId(swapSlotId === slot.id ? null : slot.id)}>
                    <RefreshCw size={13} />
                    Swap ({swapCandidates.length + (slot.alternatives?.length ?? 0)} options)
                  </button>

                  {swapSlotId === slot.id && (
                    <SwapPicker
                      slot={slot} currentExerciseId={exercise?.id ?? ''}
                      autoCandidates={swapCandidates}
                      onSwap={ex => swapExercise(slot, ex)}
                      onClose={() => setSwapSlotId(null)}
                    />
                  )}

                  <SetTable
                    slot={slot} exercise={exercise} rows={rows} prev={prev ?? null}
                    onUpdate={(i, f, v) => updateRow(slot.id, i, f, v)}
                    onLog={i => logRow(slot, i)}
                    onUnlog={i => unlogRow(slot, i)}
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
              <button style={styles.skipBtn} onClick={() => setRestSecs(0)}>Skip Rest</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SetTable({ slot, exercise, rows, prev, onUpdate, onLog, onUnlog }: {
  slot: WorkoutSlot; exercise: Exercise | undefined; rows: SetRow[]
  prev: { weight: number; reps: number } | null
  onUpdate: (i: number, field: 'reps' | 'weight', value: string) => void
  onLog: (i: number) => void; onUnlog: (i: number) => void
}) {
  const type: TrackingType = exercise?.tracking_type ?? 'sets_reps_weight'
  const isDuration = type === 'duration'
  const hasWeight = type === 'sets_reps_weight'
  const gridCols = isDuration ? '32px 1fr 1fr 36px' : hasWeight ? '32px 1fr 1fr 1fr 36px' : '32px 1fr 1fr 36px'

  function prevLabel() {
    if (!prev) return '—'
    if (isDuration) return fmtSeconds(prev.reps)
    if (hasWeight) return `${prev.weight}×${prev.reps}`
    return `${prev.reps}`
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
      </div>

      {rows.map((row, i) => (
        <div key={i} style={{ ...styles.setRow, gridTemplateColumns: gridCols, background: row.logged ? '#14532d22' : 'transparent' }}>
          <span style={{ ...styles.colSet, color: row.logged ? '#4ade80' : '#9ca3af' }}>{i + 1}</span>
          <span style={styles.colPrev}>{prevLabel()}</span>

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
  const allChoices = [
    ...(showDefault ? [{ ex: slot.default_exercise!, label: 'default' }] : []),
    ...manualAlts.map(e => ({ ex: e, label: 'pinned' })),
    ...autoCandidates.map(e => ({ ex: e, label: 'similar' })),
  ]

  return (
    <div style={sp.panel}>
      <div style={sp.header}>
        <span style={sp.title}>Swap exercise</span>
        <button style={sp.close} onClick={onClose}>Cancel</button>
      </div>
      {allChoices.length === 0
        ? <p style={sp.empty}>No alternatives found for this movement.</p>
        : allChoices.map(({ ex, label }) => (
          <button key={ex.id} style={sp.choice} onClick={() => onSwap(ex)}>
            <span style={sp.choiceName}>{ex.name}</span>
            <span style={{ ...sp.badge, color: label === 'default' ? '#9ca3af' : label === 'pinned' ? '#60a5fa' : '#a78bfa' }}>
              {label}
            </span>
          </button>
        ))
      }
    </div>
  )
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
  addSetBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px dashed #374151', borderRadius: '8px', padding: '8px 14px', color: '#6b7280', fontSize: '13px', cursor: 'pointer', alignSelf: 'flex-start' },
  // Rest overlay
  restOverlay: { position: 'fixed', bottom: '70px', left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 16px', zIndex: 20, pointerEvents: 'none' },
  restCard: { background: '#1f2937', border: '1px solid #374151', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '20px', maxWidth: '380px', width: '100%', boxShadow: '0 8px 32px #00000060', pointerEvents: 'all' },
  restInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  restLabel: { fontWeight: 700, fontSize: '18px' },
  restSub: { color: '#9ca3af', fontSize: '13px' },
  skipBtn: { marginTop: '8px', background: '#374151', border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#d1d5db', fontSize: '13px', cursor: 'pointer', fontWeight: 600 },
}

const sp: Record<string, React.CSSProperties> = {
  panel: { background: '#111827', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontWeight: 600, fontSize: '13px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  close: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '13px' },
  choice: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '11px 14px', color: '#f9fafb', cursor: 'pointer', fontSize: '14px', fontWeight: 500 },
  choiceName: { textAlign: 'left' },
  badge: { fontSize: '11px', fontWeight: 600 },
  empty: { color: '#6b7280', fontSize: '13px', textAlign: 'center', padding: '8px' },
}
