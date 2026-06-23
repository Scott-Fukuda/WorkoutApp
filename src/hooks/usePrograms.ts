import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Program, WorkoutDay, WorkoutSlot } from '../lib/types'

export function usePrograms() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('programs')
      .select(`
        *,
        days:workout_days(
          *,
          slots:workout_slots(
            *,
            default_exercise:exercises!workout_slots_default_exercise_id_fkey(*),
            alternatives:slot_alternatives(exercise:exercises(*))
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (data) {
      // normalize slot_alternatives join
      const normalized = data.map((p: any) => ({
        ...p,
        days: (p.days ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((d: any) => ({
            ...d,
            slots: (d.slots ?? [])
              .sort((a: any, b: any) => a.order_index - b.order_index)
              .map((s: any) => ({
                ...s,
                alternatives: (s.alternatives ?? []).map((alt: any) => alt.exercise),
              })),
          })),
      }))
      setPrograms(normalized)
    }
    setLoading(false)
  }

  async function createProgram(name: string) {
    const { data, error } = await supabase
      .from('programs')
      .insert({ name })
      .select()
      .single()
    if (!error) await load()
    return { data, error }
  }

  async function deleteProgram(id: string) {
    await supabase.from('programs').delete().eq('id', id)
    setPrograms(prev => prev.filter(p => p.id !== id))
  }

  async function addDay(program_id: string, name: string, order_index: number) {
    const { data, error } = await supabase
      .from('workout_days')
      .insert({ program_id, name, order_index })
      .select()
      .single()
    if (!error) await load()
    return { data, error }
  }

  async function deleteDay(id: string) {
    await supabase.from('workout_days').delete().eq('id', id)
    await load()
  }

  async function addSlot(day_id: string, default_exercise_id: string, order_index: number, sets_target: number, reps_target: number) {
    const { data, error } = await supabase
      .from('workout_slots')
      .insert({ day_id, default_exercise_id, order_index, sets_target, reps_target })
      .select()
      .single()
    if (!error) await load()
    return { data, error }
  }

  async function deleteSlot(id: string) {
    await supabase.from('workout_slots').delete().eq('id', id)
    await load()
  }

  async function updateSlot(id: string, sets_target: number, reps_target: number) {
    const { error } = await supabase
      .from('workout_slots').update({ sets_target, reps_target }).eq('id', id)
    if (!error) await load()
    return { error }
  }

  async function reorderSlots(orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('workout_slots').update({ order_index: i }).eq('id', id)
      )
    )
    await load()
  }

  async function addAlternative(slot_id: string, exercise_id: string) {
    await supabase.from('slot_alternatives').upsert({ slot_id, exercise_id })
    await load()
  }

  async function removeAlternative(slot_id: string, exercise_id: string) {
    await supabase.from('slot_alternatives').delete()
      .eq('slot_id', slot_id).eq('exercise_id', exercise_id)
    await load()
  }

  return {
    programs, loading, load,
    createProgram, deleteProgram,
    addDay, deleteDay,
    addSlot, deleteSlot, updateSlot, reorderSlots,
    addAlternative, removeAlternative,
  }
}

export function useDay(dayId: string | undefined) {
  const [day, setDay] = useState<WorkoutDay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!dayId) return
    supabase
      .from('workout_days')
      .select(`
        *,
        slots:workout_slots(
          *,
          default_exercise:exercises!workout_slots_default_exercise_id_fkey(*),
          alternatives:slot_alternatives(exercise:exercises(*))
        )
      `)
      .eq('id', dayId)
      .single()
      .then(({ data }) => {
        if (data) {
          setDay({
            ...data,
            slots: (data.slots ?? [])
              .sort((a: any, b: any) => a.order_index - b.order_index)
              .map((s: any) => ({
                ...s,
                alternatives: (s.alternatives ?? []).map((alt: any) => alt.exercise),
              })),
          })
        }
        setLoading(false)
      })
  }, [dayId])

  return { day, loading }
}
