import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LoggedSet, WorkoutSession } from '../lib/types'

export function useActiveSession(sessionId: string | null) {
  const [sets, setSets] = useState<LoggedSet[]>([])
  const [session, setSession] = useState<WorkoutSession | null>(null)

  useEffect(() => {
    if (!sessionId) return
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => setSession(data))

    supabase
      .from('logged_sets')
      .select('*')
      .eq('session_id', sessionId)
      .order('logged_at')
      .then(({ data }) => setSets(data ?? []))
  }, [sessionId])

  async function logSet(params: {
    slot_id: string
    exercise_id: string
    set_number: number
    reps: number | null
    weight: number | null
    rpe?: number | null
  }) {
    if (!sessionId) return
    const { data, error } = await supabase
      .from('logged_sets')
      .insert({ ...params, session_id: sessionId })
      .select()
      .single()
    if (!error && data) setSets(prev => [...prev, data])
    return { data, error }
  }

  async function deleteSet(id: string) {
    await supabase.from('logged_sets').delete().eq('id', id)
    setSets(prev => prev.filter(s => s.id !== id))
  }

  async function finishSession() {
    if (!sessionId) return
    await supabase
      .from('workout_sessions')
      .update({ finished_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  return { session, sets, logSet, deleteSet, finishSession }
}

export function useHistory() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('workout_sessions')
      .select(`*, day:workout_days(name)`)
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setSessions(data ?? [])
        setLoading(false)
      })
  }, [])

  return { sessions, loading }
}

export async function startSession(day_id: string) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({ day_id })
    .select()
    .single()
  return { data, error }
}

export function usePRs(exercise_id: string | null) {
  const [pr, setPr] = useState<{ weight: number; reps: number } | null>(null)

  useEffect(() => {
    if (!exercise_id) return
    supabase
      .from('logged_sets')
      .select('weight, reps')
      .eq('exercise_id', exercise_id)
      .not('weight', 'is', null)
      .order('weight', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) setPr({ weight: data[0].weight, reps: data[0].reps })
      })
  }, [exercise_id])

  return pr
}

export function useExerciseHistory(exercise_id: string | null) {
  const [history, setHistory] = useState<LoggedSet[]>([])

  useEffect(() => {
    if (!exercise_id) return
    supabase
      .from('logged_sets')
      .select('*, session:workout_sessions(started_at)')
      .eq('exercise_id', exercise_id)
      .order('logged_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setHistory(data ?? []))
  }, [exercise_id])

  return history
}
