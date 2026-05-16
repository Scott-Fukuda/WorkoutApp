import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronRight, ArrowLeft } from 'lucide-react'
import { usePrograms } from '../hooks/usePrograms'

export default function ProgramDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { programs, loading, addDay, deleteDay } = usePrograms()
  const program = programs.find(p => p.id === id)
  const [dayName, setDayName] = useState('')
  const [addingDay, setAddingDay] = useState(false)

  if (loading) return <div style={styles.loading}>Loading…</div>
  if (!program) return <div style={styles.loading}>Program not found.</div>

  async function handleAddDay(e: React.FormEvent) {
    e.preventDefault()
    if (!dayName.trim() || !id) return
    await addDay(id, dayName.trim(), program!.days?.length ?? 0)
    setDayName('')
    setAddingDay(false)
  }

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={() => navigate('/programs')}>
        <ArrowLeft size={18} /> <span>Programs</span>
      </button>
      <div style={styles.header}>
        <h2 style={styles.title}>{program.name}</h2>
        <button style={styles.iconBtn} onClick={() => setAddingDay(true)}>
          <Plus size={22} />
        </button>
      </div>

      {addingDay && (
        <form onSubmit={handleAddDay} style={styles.addForm}>
          <input
            style={styles.input}
            autoFocus
            placeholder="Day name (e.g. Pull, Push A, Legs)"
            value={dayName}
            onChange={e => setDayName(e.target.value)}
          />
          <div style={styles.row}>
            <button type="button" style={styles.cancelBtn} onClick={() => setAddingDay(false)}>Cancel</button>
            <button type="submit" style={styles.saveBtn}>Add Day</button>
          </div>
        </form>
      )}

      {(program.days?.length ?? 0) === 0 && !addingDay && (
        <p style={styles.empty}>No days yet. Tap + to add a workout day.</p>
      )}

      <div style={styles.list}>
        {(program.days ?? []).map(day => (
          <div key={day.id} style={styles.card}>
            <button style={styles.cardMain} onClick={() => navigate(`/day/${day.id}`)}>
              <div>
                <div style={styles.cardTitle}>{day.name}</div>
                <div style={styles.cardSub}>{day.slots?.length ?? 0} exercise{(day.slots?.length ?? 0) !== 1 ? 's' : ''}</div>
              </div>
              <ChevronRight size={18} color="#6b7280" />
            </button>
            <button style={styles.deleteBtn} onClick={() => {
              if (confirm(`Delete "${day.name}"?`)) deleteDay(day.id)
            }}>
              <Trash2 size={16} color="#ef4444" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '20px', color: '#f9fafb', maxWidth: '480px', margin: '0 auto' },
  loading: { padding: '40px', textAlign: 'center', color: '#9ca3af' },
  back: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0', marginBottom: '16px', fontSize: '14px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '1.5rem', fontWeight: 700 },
  iconBtn: { background: '#3b82f6', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#fff' },
  addForm: { background: '#1f2937', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#111827', color: '#f9fafb', fontSize: '15px' },
  row: { display: 'flex', gap: '8px' },
  cancelBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #374151', background: 'none', color: '#9ca3af', cursor: 'pointer' },
  saveBtn: { flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: '60px' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { background: '#1f2937', borderRadius: '12px', display: 'flex', alignItems: 'center', overflow: 'hidden' },
  cardMain: { flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'none', border: 'none', color: '#f9fafb', cursor: 'pointer', textAlign: 'left' },
  cardTitle: { fontWeight: 600, fontSize: '15px' },
  cardSub: { color: '#9ca3af', fontSize: '13px', marginTop: '2px' },
  deleteBtn: { padding: '16px', background: 'none', border: 'none', cursor: 'pointer', borderLeft: '1px solid #374151' },
}
