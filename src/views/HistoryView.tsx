import { useNavigate } from 'react-router-dom'
import { useHistory } from '../hooks/useSession'
import { Calendar, Clock } from 'lucide-react'

export default function HistoryView() {
  const { sessions, loading } = useHistory()
  const navigate = useNavigate()

  if (loading) return <div style={styles.loading}>Loading…</div>

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  function duration(start: string, end?: string) {
    if (!end) return ''
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>History</h2>

      {sessions.length === 0 && (
        <p style={styles.empty}>No completed workouts yet.</p>
      )}

      <div style={styles.list}>
        {sessions.map(s => (
          <button key={s.id} style={styles.card} onClick={() => navigate(`/session/${s.id}`)}>
            <div style={styles.cardLeft}>
              <div style={styles.cardTitle}>{(s.day as any)?.name ?? 'Workout'}</div>
              <div style={styles.cardMeta}>
                <Calendar size={12} />
                <span>{formatDate(s.started_at)}</span>
                <Clock size={12} style={{ marginLeft: '8px' }} />
                <span>{formatTime(s.started_at)}</span>
                {s.finished_at && <span style={styles.dur}>{duration(s.started_at, s.finished_at)}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '20px', color: '#f9fafb', maxWidth: '480px', margin: '0 auto' },
  loading: { padding: '40px', textAlign: 'center', color: '#9ca3af' },
  title: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '20px' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: '60px' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { background: '#1f2937', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', color: '#f9fafb', cursor: 'pointer', width: '100%', textAlign: 'left' },
  cardLeft: { display: 'flex', flexDirection: 'column', gap: '6px' },
  cardTitle: { fontWeight: 600, fontSize: '15px' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af', fontSize: '13px' },
  dur: { marginLeft: '8px', background: '#374151', borderRadius: '4px', padding: '2px 6px', fontSize: '12px' },
}
