import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft, RefreshCw, Play, GripVertical } from 'lucide-react'
import { usePrograms } from '../hooks/usePrograms'
import { useExercises } from '../hooks/useExercises'
import { startSession } from '../hooks/useSession'
import type { MuscleGroup, WorkoutSlot } from '../lib/types'

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#f97316', back: '#3b82f6', shoulders: '#8b5cf6',
  biceps: '#ec4899', triceps: '#f43f5e', legs: '#22c55e',
  glutes: '#a855f7', core: '#eab308', cardio: '#14b8a6',
  warmup: '#6b7280', other: '#6b7280',
}

const CATEGORY_LABELS: Record<string, string> = {
  vertical_pull: 'Vertical Pull', horizontal_pull: 'Horizontal Pull',
  rear_delt: 'Rear Delt', horizontal_push: 'Flat Push', incline_push: 'Incline Push',
  vertical_push: 'Vertical Push', shoulder_abduction: 'Lateral',
  elbow_flexion: 'Curl', elbow_extension: 'Tricep',
  quad_dominant: 'Quad', hip_hinge: 'Hip Hinge', knee_flexion: 'Knee Flexion',
  hip_extension: 'Hip Extension', trap_shrug: 'Shrug', wrist_work: 'Forearm',
  neck: 'Neck', core: 'Core', warmup: 'Warmup',
}

export default function DayEditorView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { programs, loading, addSlot, deleteSlot, updateSlot, reorderSlots, addAlternative, removeAlternative } = usePrograms()
  const { exercises } = useExercises()

  const day = programs.flatMap(p => p.days ?? []).find(d => d.id === id)

  const [addingSlot, setAddingSlot] = useState(false)
  const [selectedExId, setSelectedExId] = useState('')
  const [filterGroup, setFilterGroup] = useState<MuscleGroup | ''>('')
  const [setsInput, setSetsInput] = useState('3')
  const [repsInput, setRepsInput] = useState('10')
  const [altSlotId, setAltSlotId] = useState<string | null>(null)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editSets, setEditSets] = useState('')
  const [editReps, setEditReps] = useState('')
  const [startingWorkout, setStartingWorkout] = useState(false)
  const [localSlots, setLocalSlots] = useState<WorkoutSlot[] | null>(null)
  const dragIdx = useRef<number | null>(null)
  const dragOverIdx = useRef<number | null>(null)

  if (loading) return <div style={styles.loading}>Loading…</div>
  if (!day) return <div style={styles.loading}>Day not found.</div>

  // localSlots tracks drag-reorder optimistically; falls back to server order
  const slots: WorkoutSlot[] = localSlots ?? (day.slots ?? [])

  const muscleGroups = [...new Set(exercises.map(e => e.muscle_group))] as MuscleGroup[]
  const filteredExercises = exercises.filter(e => !filterGroup || e.muscle_group === filterGroup)

  function onDragStart(i: number) {
    dragIdx.current = i
  }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    dragOverIdx.current = i
    if (dragIdx.current === null || dragIdx.current === i) return
    const reordered = [...slots]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(i, 0, moved)
    dragIdx.current = i
    setLocalSlots(reordered)
  }

  async function onDrop() {
    if (!localSlots) return
    await reorderSlots(localSlots.map(s => s.id))
    setLocalSlots(null)
  }

  function handleExerciseSelect(exId: string) {
    setSelectedExId(exId)
    const ex = exercises.find(e => e.id === exId)
    if (ex) {
      setSetsInput(String(ex.default_sets))
      setRepsInput(String(ex.default_reps))
    }
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedExId || !id) return
    const sets = parseInt(setsInput) || 3
    const reps = parseInt(repsInput) || 10
    await addSlot(id, selectedExId, day!.slots?.length ?? 0, sets, reps)
    setSelectedExId('')
    setSetsInput('3')
    setRepsInput('10')
    setAddingSlot(false)
    setFilterGroup('')
  }

  async function handleStartWorkout() {
    if (!id) return
    setStartingWorkout(true)
    const { data, error } = await startSession(id)
    if (!error && data) navigate(`/workout/${data.id}`)
    else setStartingWorkout(false)
  }

  const selectedEx = exercises.find(e => e.id === selectedExId)

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> <span>Back</span>
      </button>

      <div style={styles.header}>
        <h2 style={styles.title}>{day.name}</h2>
        <button style={styles.startBtn} onClick={handleStartWorkout} disabled={startingWorkout || (day.slots?.length ?? 0) === 0}>
          <Play size={16} />
          {startingWorkout ? 'Starting…' : 'Start'}
        </button>
      </div>

      <div style={styles.slotList}>
        {slots.map((slot, i) => {
          const ex = slot.default_exercise
          const color = MUSCLE_COLORS[ex?.muscle_group ?? ''] ?? '#6b7280'
          return (
            <div
              key={slot.id}
              style={styles.slotCard}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={e => onDragOver(e, i)}
              onDrop={onDrop}
            >
              <div style={styles.slotTop}>
                <span style={styles.gripHandle}><GripVertical size={16} /></span>
                <span style={{ ...styles.dot, background: color }} />
                <div style={styles.slotInfo}>
                  <span style={styles.slotName}>{ex?.name ?? 'Unknown'}</span>
                  {editingSlotId === slot.id ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                      <input
                        style={styles.inlineNumInput}
                        type="number" inputMode="numeric" min="1" max="10"
                        value={editSets}
                        onChange={e => setEditSets(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>×</span>
                      <input
                        style={styles.inlineNumInput}
                        type="number" inputMode="numeric" min="1" max="100"
                        value={editReps}
                        onChange={e => setEditReps(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <button style={styles.inlineSave} onClick={async e => {
                        e.stopPropagation()
                        const s = parseInt(editSets) || slot.sets_target
                        const r = parseInt(editReps) || slot.reps_target
                        await updateSlot(slot.id, s, r)
                        setEditingSlotId(null)
                      }}>✓</button>
                      <button style={styles.inlineCancel} onClick={e => { e.stopPropagation(); setEditingSlotId(null) }}>✕</button>
                    </span>
                  ) : (
                    <span style={styles.slotMeta}>
                      <button style={styles.setsRepsBtn} onClick={e => {
                        e.stopPropagation()
                        setEditingSlotId(slot.id)
                        setEditSets(String(slot.sets_target))
                        setEditReps(String(slot.reps_target))
                      }}>
                        {slot.sets_target} sets × {slot.reps_target} reps
                      </button>
                      {ex?.movement_category && (
                        <span style={styles.catBadge}>{CATEGORY_LABELS[ex.movement_category] ?? ex.movement_category}</span>
                      )}
                    </span>
                  )}
                </div>
                <button style={styles.iconSmall} onClick={() => setAltSlotId(altSlotId === slot.id ? null : slot.id)} title="Add swap alternatives">
                  <RefreshCw size={14} />
                </button>
                <button style={styles.iconSmall} onClick={() => {
                  if (confirm('Remove this exercise?')) deleteSlot(slot.id)
                }}>
                  <Trash2 size={14} color="#ef4444" />
                </button>
              </div>

              {(slot.alternatives ?? []).length > 0 && (
                <div style={styles.alts}>
                  <span style={styles.altsLabel}>Manual swaps:</span>
                  {(slot.alternatives ?? []).map(alt => (
                    <div key={alt.id} style={styles.altChip}>
                      <span>{alt.name}</span>
                      <button style={styles.chipX} onClick={() => removeAlternative(slot.id, alt.id)}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {altSlotId === slot.id && (
                <div style={styles.altPanel}>
                  <p style={styles.altPanelLabel}>Pin extra swap alternatives (same-category shown automatically):</p>
                  <select
                    style={styles.select}
                    onChange={e => { if (e.target.value) { addAlternative(slot.id, e.target.value); e.target.value = '' } }}
                  >
                    <option value="">Add an alternative…</option>
                    {exercises
                      .filter(e => e.id !== slot.default_exercise_id && !(slot.alternatives ?? []).find(a => a.id === e.id))
                      .map(e => <option key={e.id} value={e.id}>{e.name} ({e.muscle_group})</option>)}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {addingSlot ? (
        <form onSubmit={handleAddSlot} style={styles.addForm}>
          <p style={styles.formLabel}>Add exercise</p>

          <select style={styles.select} value={filterGroup} onChange={e => setFilterGroup(e.target.value as MuscleGroup | '')}>
            <option value="">All muscle groups</option>
            {muscleGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <select style={styles.select} value={selectedExId} onChange={e => handleExerciseSelect(e.target.value)} required>
            <option value="">Select exercise…</option>
            {filteredExercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          {selectedEx && (
            <div style={styles.suggestion}>
              <span style={styles.suggestionLabel}>AI suggestion for hypertrophy:</span>
              <span style={styles.suggestionText}>
                {selectedEx.default_sets} sets ×{' '}
                {selectedEx.tracking_type === 'duration'
                  ? `${selectedEx.default_reps}s`
                  : `${selectedEx.default_reps} reps`}
              </span>
              <span style={{ ...styles.catBadge, color: selectedEx.tracking_type === 'duration' ? '#34d399' : selectedEx.tracking_type === 'sets_reps' ? '#60a5fa' : '#f9fafb' }}>
                {selectedEx.tracking_type === 'duration' ? 'duration' : selectedEx.tracking_type === 'sets_reps' ? 'bodyweight' : 'weighted'}
              </span>
            </div>
          )}

          <div style={styles.setsRepsRow}>
            <div style={styles.setsRepsField}>
              <label style={styles.fieldLabel}>Sets</label>
              <input
                style={styles.numInput}
                type="number"
                inputMode="numeric"
                min="1" max="10"
                value={setsInput}
                onChange={e => setSetsInput(e.target.value)}
              />
            </div>
            <span style={styles.timesSign}>×</span>
            <div style={styles.setsRepsField}>
              <label style={styles.fieldLabel}>Reps</label>
              <input
                style={styles.numInput}
                type="number"
                inputMode="numeric"
                min="1" max="100"
                value={repsInput}
                onChange={e => setRepsInput(e.target.value)}
              />
            </div>
          </div>

          <div style={styles.row}>
            <button type="button" style={styles.cancelBtn} onClick={() => { setAddingSlot(false); setSelectedExId('') }}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={!selectedExId}>Add</button>
          </div>
        </form>
      ) : (
        <button style={styles.addSlotBtn} onClick={() => setAddingSlot(true)}>
          <Plus size={16} /> Add Exercise
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '20px', color: '#f9fafb', maxWidth: '480px', margin: '0 auto' },
  loading: { padding: '40px', textAlign: 'center', color: '#9ca3af' },
  back: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0', marginBottom: '16px', fontSize: '14px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '1.5rem', fontWeight: 700 },
  startBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: '#22c55e', border: 'none', borderRadius: '10px', padding: '10px 16px', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer' },
  slotList: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' },
  slotCard: { background: '#1f2937', borderRadius: '12px', padding: '14px', cursor: 'grab' },
  slotTop: { display: 'flex', alignItems: 'center', gap: '8px' },
  gripHandle: { color: '#4b5563', display: 'flex', flexShrink: 0 },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  slotInfo: { flex: 1 },
  slotName: { fontWeight: 600, fontSize: '15px', display: 'block' },
  slotMeta: { fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  catBadge: { background: '#374151', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: '#d1d5db' },
  iconSmall: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: '#9ca3af' },
  alts: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #374151', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  altsLabel: { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100%' },
  altChip: { display: 'flex', alignItems: 'center', gap: '4px', background: '#374151', borderRadius: '20px', padding: '4px 10px', fontSize: '13px' },
  chipX: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0', fontSize: '16px', lineHeight: 1 },
  altPanel: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #374151' },
  altPanelLabel: { fontSize: '12px', color: '#9ca3af', marginBottom: '8px' },
  addForm: { background: '#1f2937', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  formLabel: { fontWeight: 600 },
  select: { padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: '15px' },
  suggestion: { background: '#1e3a5f', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  suggestionLabel: { fontSize: '12px', color: '#93c5fd' },
  suggestionText: { fontWeight: 700, color: '#dbeafe', fontSize: '14px' },
  setsRepsRow: { display: 'flex', alignItems: 'flex-end', gap: '10px' },
  setsRepsField: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' },
  fieldLabel: { fontSize: '12px', color: '#9ca3af' },
  numInput: { padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: '18px', textAlign: 'center', fontWeight: 700 },
  timesSign: { color: '#6b7280', fontSize: '20px', fontWeight: 700, paddingBottom: '10px' },
  row: { display: 'flex', gap: '8px' },
  cancelBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #374151', background: 'none', color: '#9ca3af', cursor: 'pointer' },
  saveBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  addSlotBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px', borderRadius: '12px', border: '2px dashed #374151', background: 'none', color: '#6b7280', fontSize: '15px', cursor: 'pointer' },
  setsRepsBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0', fontSize: '12px', textDecoration: 'underline dotted', textUnderlineOffset: '3px' },
  inlineNumInput: { width: '44px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: '13px', textAlign: 'center' as const, fontWeight: 700 },
  inlineSave: { background: '#16a34a', border: 'none', borderRadius: '6px', padding: '4px 8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700 },
  inlineCancel: { background: '#374151', border: 'none', borderRadius: '6px', padding: '4px 8px', color: '#9ca3af', cursor: 'pointer', fontSize: '13px' },
}
