import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Dumbbell, History, ListChecks } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import ProgramsView from './views/ProgramsView'
import ProgramDetailView from './views/ProgramDetailView'
import DayEditorView from './views/DayEditorView'
import WorkoutView from './views/WorkoutView'
import HistoryView from './views/HistoryView'
import SessionDetailView from './views/SessionDetailView'
import ExercisesView from './views/ExercisesView'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div style={shell.loading}>Loading…</div>

  return (
    <div style={shell.app}>
      <div style={shell.content}>
        <Routes>
          <Route path="/" element={<Navigate to="/programs" replace />} />
          <Route path="/programs" element={<ProgramsView />} />
          <Route path="/program/:id" element={<ProgramDetailView />} />
          <Route path="/day/:id" element={<DayEditorView />} />
          <Route path="/workout/:sessionId" element={<WorkoutView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/session/:sessionId" element={<SessionDetailView />} />
          <Route path="/exercises" element={<ExercisesView />} />
        </Routes>
      </div>
      <nav style={shell.nav}>
        <NavLink to="/programs" style={({ isActive }) => ({ ...shell.navItem, color: isActive ? '#3b82f6' : '#6b7280' })}>
          <ListChecks size={22} />
          <span style={shell.navLabel}>Programs</span>
        </NavLink>
        <NavLink to="/history" style={({ isActive }) => ({ ...shell.navItem, color: isActive ? '#3b82f6' : '#6b7280' })}>
          <History size={22} />
          <span style={shell.navLabel}>History</span>
        </NavLink>
        <NavLink to="/exercises" style={({ isActive }) => ({ ...shell.navItem, color: isActive ? '#3b82f6' : '#6b7280' })}>
          <Dumbbell size={22} />
          <span style={shell.navLabel}>Exercises</span>
        </NavLink>
      </nav>
    </div>
  )
}

const shell: Record<string, React.CSSProperties> = {
  app: { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#111827' },
  content: { flex: 1, overflowY: 'auto' },
  nav: {
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    background: '#1f2937', borderTop: '1px solid #374151',
    padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
  },
  navItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', textDecoration: 'none', padding: '6px 20px' },
  navLabel: { fontSize: '11px', fontWeight: 500 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#9ca3af', background: '#111827' },
}
