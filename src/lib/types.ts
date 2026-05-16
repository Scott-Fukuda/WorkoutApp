export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'legs' | 'glutes' | 'core' | 'cardio' | 'warmup' | 'other'

export type TrackingType = 'duration' | 'sets_reps' | 'sets_reps_weight'

export interface Exercise {
  id: string
  name: string
  muscle_group: MuscleGroup
  movement_category?: string
  tracking_type: TrackingType
  default_sets: number
  default_reps: number
  notes?: string
}

export interface WorkoutSlot {
  id: string
  day_id: string
  order_index: number
  default_exercise_id: string
  sets_target: number
  reps_target: number
  default_exercise?: Exercise
  alternatives?: Exercise[]
}

export interface WorkoutDay {
  id: string
  program_id: string
  name: string       // e.g. "Push A", "Pull", "Legs"
  order_index: number
  slots?: WorkoutSlot[]
}

export interface Program {
  id: string
  user_id: string
  name: string
  created_at: string
  days?: WorkoutDay[]
}

// One completed set within an active workout
export interface LoggedSet {
  id: string
  session_id: string
  slot_id: string
  exercise_id: string  // the actual exercise used (may differ from default if swapped)
  set_number: number
  reps: number | null
  weight: number | null  // lbs or kg
  rpe?: number | null
  notes?: string
}

// One completed workout session
export interface WorkoutSession {
  id: string
  user_id: string
  day_id: string
  day?: WorkoutDay
  started_at: string
  finished_at?: string
  sets?: LoggedSet[]
}

// The last used exercise per slot (for swap memory)
export interface SlotOverride {
  slot_id: string
  exercise_id: string
}
