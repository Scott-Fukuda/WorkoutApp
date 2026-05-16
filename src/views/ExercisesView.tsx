import { useState } from 'react'
import { Plus, TrendingUp } from 'lucide-react'
import { useExercises } from '../hooks/useExercises'
import { useExerciseHistory } from '../hooks/useSession'
import type { MuscleGroup } from '../lib/types'

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#f97316', back: '#3b82f6', shoulders: '#8b5cf6',
  biceps: '#ec4899', triceps: '#f43f5e', legs: '#22c55e',
  glutes: '#a855f7', core: '#eab308', cardio: '#14b8a6',
  warmup: '#6b7280', other: '#6b7280',
}

const GROUPS: MuscleGroup[] = ['warmup','chest','back','shoulders','biceps','triceps','legs','glutes','core','cardio','other']

export default function ExercisesView() {
  const { exercises, loading, addExercise } = useExercises()
  const [filter, setFilter] = useState<MuscleGroup | ''>('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState<MuscleGroup>('other')
  const [selectedEx, setSelectedEx] = useState<string | null>(null)

  const filtered = exercises.filter(e => !filter || e.muscle_group === filter)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    await addExercise(newName.trim(), newGroup)
    setNewName('')
    setAdding(false)
  }

  if (loading) return <div style={styles.loading}>Loading…</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Exercises</h2>
        <button style={styles.iconBtn} onClick={() => setAdding(true)}><Plus size={20} /></button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} style={styles.addForm}>
          <input style={styles.input} autoFocus placeholder="Exercise name" value={newName} onChange={e => setNewName(e.target.value)} />
          <select style={styles.select} value={newGroup} onChange={e => setNewGroup(e.target.value as MuscleGroup)}>
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <div style={styles.row}>
            <button type="button" style={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" style={styles.saveBtn}>Add</button>
          </div>
        </form>
      )}

      {/* Filter chips */}
      <div style={styles.chips}>
        <button style={{ ...styles.chip, ...(filter === '' ? styles.chipActive : {}) }} onClick={() => setFilter('')}>All</button>
        {GROUPS.map(g => (
          <button key={g} style={{ ...styles.chip, ...(filter === g ? styles.chipActive : {}), ...(filter === g ? { borderColor: MUSCLE_COLORS[g] } : {}) }} onClick={() => setFilter(g === filter ? '' : g)}>
            {g}
          </button>
        ))}
      </div>

      <div style={styles.list}>
        {filtered.map(ex => (
          <div key={ex.id}>
            <button style={styles.exRow} onClick={() => setSelectedEx(selectedEx === ex.id ? null : ex.id)}>
              <span style={{ ...styles.dot, background: MUSCLE_COLORS[ex.muscle_group] ?? '#6b7280' }} />
              <span style={styles.exName}>{ex.name}</span>
              <TrendingUp size={14} color="#6b7280" />
            </button>
            {selectedEx === ex.id && <ExerciseHistory exerciseId={ex.id} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function ExerciseHistory({ exerciseId }: { exerciseId: string }) {
  const history = useExerciseHistory(exerciseId)

  if (history.length === 0) return <div style={histStyles.empty}>No history yet.</div>

  // Find PR
  const pr = history.reduce((best, s) => {
    if (s.weight != null && (best === null || s.weight > best.weight!)) return s
    return best
  }, null as typeof history[0] | null)

  // Group by session
  const bySession = new Map<string, typeof history>()
  for (const s of history) {
    if (!bySession.has(s.session_id)) bySession.set(s.session_id, [])
    bySession.get(s.session_id)!.push(s)
  }

  return (
    <div style={histStyles.panel}>
      {pr && (
        <div style={histStyles.pr}>
          PR: {pr.weight} lbs × {pr.reps} reps
        </div>
      )}
      {[...bySession.entries()].slice(0, 5).map(([sid, sets]) => (
        <div key={sid} style={histStyles.sessionGroup}>
          <div style={histStyles.sessionDate}>
            {new Date((sets[0] as any).session?.started_at ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          {sets.map(s => (
            <div key={s.id} style={histStyles.setLine}>
              {s.weight != null ? `${s.weight} lbs` : '—'} × {s.reps ?? '—'} reps
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '20px', color: '#f9fafb', maxWidth: '480px', margin: '0 auto' },
  loading: { padding: '40px', textAlign: 'center', color: '#9ca3af' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '1.5rem', fontWeight: 700 },
  iconBtn: { background: '#3b82f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', color: '#fff' },
  addForm: { background: '#1f2937', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: '15px' },
  select: { padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: '15px' },
  row: { display: 'flex', gap: '8px' },
  cancelBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #374151', background: 'none', color: '#9ca3af', cursor: 'pointer' },
  saveBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' },
  chip: { background: 'none', border: '1px solid #374151', borderRadius: '20px', padding: '5px 12px', color: '#9ca3af', fontSize: '12px', cursor: 'pointer' },
  chipActive: { background: '#1f2937', color: '#f9fafb', borderColor: '#3b82f6' },
  list: { display: 'flex', flexDirection: 'column' },
  exRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 0', background: 'none', border: 'none', color: '#f9fafb', cursor: 'pointer', width: '100%', textAlign: 'left', borderBottom: '1px solid #1f2937' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  exName: { flex: 1, fontSize: '15px' },
}

const histStyles: Record<string, React.CSSProperties> = {
  panel: { background: '#1f2937', borderRadius: '10px', padding: '12px', marginBottom: '4px' },
  pr: { background: '#3b82f622', color: '#60a5fa', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', fontWeight: 600, marginBottom: '8px' },
  sessionGroup: { marginBottom: '8px' },
  sessionDate: { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' },
  setLine: { fontSize: '13px', color: '#d1d5db', padding: '2px 0' },
  empty: { color: '#6b7280', fontSize: '13px', padding: '8px 0 12px' },
}
