import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { LoggedSet } from '../lib/types'

interface GroupedSlot {
  slotId: string
  exerciseName: string
  sets: LoggedSet[]
}

export default function SessionDetailView() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupedSlot[]>([])
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      supabase.from('workout_sessions').select('started_at, day:workout_days(name)').eq('id', sessionId).single(),
      supabase.from('logged_sets')
        .select('*, exercise:exercises(name), slot:workout_slots(order_index)')
        .eq('session_id', sessionId)
        .order('logged_at'),
    ]).then(([sessionRes, setsRes]) => {
      if (sessionRes.data) {
        setDate(new Date(sessionRes.data.started_at).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        }))
      }
      if (setsRes.data) {
        const map = new Map<string, GroupedSlot>()
        for (const s of setsRes.data as any[]) {
          const key = `${s.slot_id}:${s.exercise_id}`
          if (!map.has(key)) {
            map.set(key, { slotId: s.slot_id, exerciseName: s.exercise?.name ?? 'Unknown', sets: [] })
          }
          map.get(key)!.sets.push(s)
        }
        setGroups([...map.values()])
      }
      setLoading(false)
    })
  }, [sessionId])

  if (loading) return <div style={styles.loading}>Loading…</div>

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={() => navigate('/history')}>
        <ArrowLeft size={18} /> <span>History</span>
      </button>
      <h2 style={styles.title}>Session</h2>
      <p style={styles.date}>{date}</p>

      {groups.map((g, i) => (
        <div key={i} style={styles.group}>
          <div style={styles.groupName}>{g.exerciseName}</div>
          <div style={styles.setsTable}>
            <div style={styles.setHeader}>
              <span style={styles.col}>Set</span>
              <span style={styles.col}>Weight</span>
              <span style={styles.col}>Reps</span>
            </div>
            {g.sets.map(s => (
              <div key={s.id} style={styles.setRow}>
                <span style={styles.col}>{s.set_number}</span>
                <span style={styles.col}>{s.weight != null ? `${s.weight} lbs` : '—'}</span>
                <span style={styles.col}>{s.reps ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '20px', color: '#f9fafb', maxWidth: '480px', margin: '0 auto' },
  loading: { padding: '40px', textAlign: 'center', color: '#9ca3af' },
  back: { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0', marginBottom: '16px', fontSize: '14px' },
  title: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '4px' },
  date: { color: '#9ca3af', marginBottom: '20px', fontSize: '14px' },
  group: { background: '#1f2937', borderRadius: '12px', marginBottom: '12px', overflow: 'hidden' },
  groupName: { padding: '12px 16px', fontWeight: 600, borderBottom: '1px solid #374151' },
  setsTable: {},
  setHeader: { display: 'flex', padding: '8px 16px', background: '#111827' },
  setRow: { display: 'flex', padding: '10px 16px', borderTop: '1px solid #374151' },
  col: { flex: 1, fontSize: '14px', color: '#d1d5db' },
}
