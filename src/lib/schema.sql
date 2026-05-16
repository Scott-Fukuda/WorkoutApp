-- FRESH START: paste this entire file into Supabase SQL Editor and run it.
-- It drops everything and rebuilds cleanly.

drop table if exists logged_sets cascade;
drop table if exists workout_sessions cascade;
drop table if exists slot_alternatives cascade;
drop table if exists workout_slots cascade;
drop table if exists workout_days cascade;
drop table if exists programs cascade;
drop table if exists exercises cascade;

create extension if not exists "pgcrypto";

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text not null,
  muscle_group text not null,
  movement_category text,
  tracking_type text not null default 'sets_reps_weight',
  -- 'duration'        → time only (warmup cardio, plank)
  -- 'sets_reps'       → sets + reps, no weight (push ups, pull ups, bodyweight)
  -- 'sets_reps_weight'→ sets + weight + reps (everything weighted)
  default_sets int not null default 3,
  default_reps int not null default 10,
  notes text,
  created_at timestamptz default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text not null,
  created_at timestamptz default now()
);

create table workout_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs on delete cascade not null,
  name text not null,
  order_index int not null default 0
);

create table workout_slots (
  id uuid primary key default gen_random_uuid(),
  day_id uuid references workout_days on delete cascade not null,
  order_index int not null default 0,
  default_exercise_id uuid references exercises not null,
  sets_target int not null default 3,
  reps_target int not null default 10
);

create table slot_alternatives (
  slot_id uuid references workout_slots on delete cascade not null,
  exercise_id uuid references exercises not null,
  primary key (slot_id, exercise_id)
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  day_id uuid references workout_days not null,
  started_at timestamptz default now(),
  finished_at timestamptz
);

create table logged_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references workout_sessions on delete cascade not null,
  slot_id uuid references workout_slots not null,
  exercise_id uuid references exercises not null,
  set_number int not null,
  reps int,
  weight numeric,
  rpe numeric,
  notes text,
  logged_at timestamptz default now()
);

-- No RLS needed for solo use
alter table programs disable row level security;
alter table workout_days disable row level security;
alter table workout_slots disable row level security;
alter table slot_alternatives disable row level security;
alter table workout_sessions disable row level security;
alter table logged_sets disable row level security;
alter table exercises disable row level security;

-- ─── EXERCISE LIBRARY ──────────────────────────────────────────────────────
-- default_sets / default_reps tuned for hypertrophy + progressive overload:
--   Compounds (squat, bench, row, pull): 4 sets × 6 reps  → add weight each week
--   Heavy isolation (curls, extensions, hip thrust): 3 sets × 10 reps
--   Medium isolation (lateral, leg curl, pec deck): 3-4 sets × 12 reps
--   High-rep isolation (shrugs, wrist, neck, warmup): 3 sets × 15-20 reps

-- columns: name, muscle_group, movement_category, tracking_type, default_sets, default_reps
insert into exercises (name, muscle_group, movement_category, tracking_type, default_sets, default_reps) values

-- ── BACK / Vertical Pull ─────────────────────────────────────────────────
('Pull Ups',            'back', 'vertical_pull',   'sets_reps',        4, 6),
('Weighted Pull Ups',   'back', 'vertical_pull',   'sets_reps_weight', 4, 6),
('Lat Pulldown',        'back', 'vertical_pull',   'sets_reps_weight', 4, 8),

-- ── BACK / Horizontal Pull ───────────────────────────────────────────────
('Bent Over Row',       'back', 'horizontal_pull', 'sets_reps_weight', 4, 6),
('T-Bar Row',           'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),
('Seated Cable Row',    'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),
('Dumbbell Row',        'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),

-- ── REAR DELT ────────────────────────────────────────────────────────────
('Face Pull',           'back',   'rear_delt', 'sets_reps_weight', 3, 15),
('Reverse Pec Deck',    'back',   'rear_delt', 'sets_reps_weight', 3, 15),
('Band Pull Apart',     'warmup', 'rear_delt', 'sets_reps',        2, 20),

-- ── CHEST / Flat ─────────────────────────────────────────────────────────
('Bench Press',          'chest', 'horizontal_push', 'sets_reps_weight', 4, 6),
('Dumbbell Bench Press', 'chest', 'horizontal_push', 'sets_reps_weight', 4, 8),
('Push Ups',             'chest', 'horizontal_push', 'sets_reps',        3, 12),
('Pec Deck',             'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),
('Cable Crossover',      'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),
('Dumbbell Fly',         'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),

-- ── CHEST / Incline ──────────────────────────────────────────────────────
('Incline Bench Press',    'chest', 'incline_push', 'sets_reps_weight', 4, 8),
('Incline Dumbbell Press', 'chest', 'incline_push', 'sets_reps_weight', 4, 8),
('Incline Dumbbell Fly',   'chest', 'incline_push', 'sets_reps_weight', 3, 12),

-- ── SHOULDERS / Vertical Push ────────────────────────────────────────────
('Overhead Press',         'shoulders', 'vertical_push', 'sets_reps_weight', 4, 6),
('Arnold Press',           'shoulders', 'vertical_push', 'sets_reps_weight', 3, 8),
('Dumbbell Shoulder Press','shoulders', 'vertical_push', 'sets_reps_weight', 3, 8),

-- ── SHOULDERS / Lateral ──────────────────────────────────────────────────
('Lateral Raises',       'shoulders', 'shoulder_abduction', 'sets_reps_weight', 4, 15),
('Cable Lateral Raise',  'shoulders', 'shoulder_abduction', 'sets_reps_weight', 4, 15),
('Front Raises',         'shoulders', 'shoulder_abduction', 'sets_reps_weight', 3, 12),

-- ── BICEPS ───────────────────────────────────────────────────────────────
('Barbell Curl',           'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 8),
('Dumbbell Curl',          'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Hammer Curl',            'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Preacher Curl',          'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Bayesian Curl',          'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),
('Standing Rotating Curl', 'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Concentration Curl',     'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),
('Cable Curl',             'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),

-- ── TRICEPS ──────────────────────────────────────────────────────────────
('Weighted Dips',             'triceps', 'elbow_extension', 'sets_reps_weight', 4, 6),
('Skull Crusher',             'triceps', 'elbow_extension', 'sets_reps_weight', 3, 10),
('Overhead Tricep Extension', 'triceps', 'elbow_extension', 'sets_reps_weight', 3, 10),
('Tricep Pushdown',           'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('Cable Overhead Extension',  'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('Close Grip Bench Press',    'triceps', 'elbow_extension', 'sets_reps_weight', 4, 8),
('Diamond Push Ups',          'triceps', 'elbow_extension', 'sets_reps',        3, 12),

-- ── LEGS / Quad Dominant ─────────────────────────────────────────────────
('Squat',                 'legs', 'quad_dominant', 'sets_reps_weight', 4, 6),
('Leg Press',             'legs', 'quad_dominant', 'sets_reps_weight', 4, 10),
('Leg Extension',         'legs', 'quad_dominant', 'sets_reps_weight', 3, 12),
('Dumbbell Lunges',       'legs', 'quad_dominant', 'sets_reps_weight', 3, 10),
('Bulgarian Split Squat', 'legs', 'quad_dominant', 'sets_reps_weight', 3, 8),

-- ── LEGS / Hip Hinge ─────────────────────────────────────────────────────
('Romanian Deadlift', 'legs', 'hip_hinge', 'sets_reps_weight', 4, 8),
('Good Morning',      'legs', 'hip_hinge', 'sets_reps_weight', 3, 10),

-- ── LEGS / Knee Flexion ──────────────────────────────────────────────────
('Seated Leg Curl', 'legs', 'knee_flexion', 'sets_reps_weight', 3, 10),
('Lying Leg Curl',  'legs', 'knee_flexion', 'sets_reps_weight', 3, 10),
('Nordic Curl',     'legs', 'knee_flexion', 'sets_reps',        3, 8),

-- ── GLUTES / Hip Extension ───────────────────────────────────────────────
('Hip Thrust',    'glutes', 'hip_extension', 'sets_reps_weight', 4, 8),
('Glute Bridge',  'glutes', 'hip_extension', 'sets_reps',        3, 12),
('Cable Kickback','glutes', 'hip_extension', 'sets_reps_weight', 3, 12),

-- ── TRAPS ────────────────────────────────────────────────────────────────
('Dumbbell Shrugs', 'back', 'trap_shrug', 'sets_reps_weight', 4, 12),
('Barbell Shrugs',  'back', 'trap_shrug', 'sets_reps_weight', 4, 12),

-- ── FOREARMS ─────────────────────────────────────────────────────────────
('Wrist Curls',      'other', 'wrist_work',    'sets_reps_weight', 3, 15),
('Wrist Extensions', 'other', 'wrist_work',    'sets_reps_weight', 3, 15),
('Reverse Curl',     'biceps', 'elbow_flexion','sets_reps_weight', 3, 12),

-- ── NECK ─────────────────────────────────────────────────────────────────
('Neck Curls',      'other', 'neck', 'sets_reps', 3, 15),
('Neck Extensions', 'other', 'neck', 'sets_reps', 3, 15),

-- ── CORE ─────────────────────────────────────────────────────────────────
('Hanging Leg Raise', 'core', 'core', 'sets_reps',        3, 10),
('Cable Crunch',      'core', 'core', 'sets_reps_weight', 3, 15),
('Ab Wheel',          'core', 'core', 'sets_reps',        3, 10),
('Plank',             'core', 'core', 'duration',         3, 60),
-- default_reps = 60 seconds for plank

-- ── WARMUP (all duration) ────────────────────────────────────────────────
('Jump Rope',    'warmup', 'warmup', 'duration', 2, 180),
('Light Jog',    'warmup', 'warmup', 'duration', 1, 300),
('Arm Circles',  'warmup', 'warmup', 'duration', 2, 30),
('Hip Circles',  'warmup', 'warmup', 'duration', 2, 30);
