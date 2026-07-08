import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Exercise } from '../lib/types'

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('exercises')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setExercises(data ?? [])
        setLoading(false)
      })
  }, [])

  async function addExercise(name: string, muscle_group: string) {
    const { data, error } = await supabase
      .from('exercises')
      .insert({ name, muscle_group })
      .select()
      .single()
    if (!error && data) setExercises(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return { data, error }
  }

  async function updateExerciseNote(id: string, notes: string) {
    const { error } = await supabase.from('exercises').update({ notes }).eq('id', id)
    if (!error) setExercises(prev => prev.map(e => e.id === id ? { ...e, notes } : e))
    return { error }
  }

  return { exercises, loading, addExercise, updateExerciseNote }
}
