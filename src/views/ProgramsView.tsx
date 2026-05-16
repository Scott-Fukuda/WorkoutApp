import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { usePrograms } from '../hooks/usePrograms'

export default function ProgramsView() {
  const { programs, loading, createProgram, deleteProgram } = usePrograms()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createProgram(name.trim())
    setName('')
    setAdding(false)
  }

  if (loading) return <div style={styles.loading}>Loading…</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Programs</h2>
        <button style={styles.iconBtn} onClick={() => setAdding(true)}>
          <Plus size={22} />
        </button>
      </div>

      {adding && (
        <form onSubmit={handleCreate} style={styles.addForm}>
          <input
            style={styles.input}
            autoFocus
            placeholder="Program name (e.g. Push Pull Legs)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div style={styles.row}>
            <button type="button" style={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" style={styles.saveBtn}>Create</button>
          </div>
        </form>
      )}

      {programs.length === 0 && !adding && (
        <p style={styles.empty}>No programs yet. Tap + to create one.</p>
      )}

      <div style={styles.list}>
        {programs.map(p => (
          <div key={p.id} style={styles.card}>
            <button style={styles.cardMain} onClick={() => navigate(`/program/${p.id}`)}>
              <div>
                <div style={styles.cardTitle}>{p.name}</div>
                <div style={styles.cardSub}>{p.days?.length ?? 0} day{(p.days?.length ?? 0) !== 1 ? 's' : ''}</div>
              </div>
              <ChevronRight size={18} color="#6b7280" />
            </button>
            <button style={styles.deleteBtn} onClick={() => {
              if (confirm(`Delete "${p.name}"?`)) deleteProgram(p.id)
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
