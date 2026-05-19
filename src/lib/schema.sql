-- FRESH START — drop everything and rebuild.
-- Run via: DATABASE_URL="..." npm run db:reset

drop table if exists logged_sets cascade;
drop table if exists workout_sessions cascade;
drop table if exists slot_alternatives cascade;
drop table if exists workout_slots cascade;
drop table if exists workout_days cascade;
drop table if exists programs cascade;
drop table if exists exercises cascade;

create extension if not exists "pgcrypto";

-- ─── SCHEMA ────────────────────────────────────────────────────────────────

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  name text not null,
  muscle_group text not null,
  movement_category text,
  tracking_type text not null default 'sets_reps_weight',
  -- 'duration'         → seconds only  (plank, cardio warmup)
  -- 'sets_reps'        → sets + reps, no weight  (push ups, pull ups, band work)
  -- 'sets_reps_weight' → sets + weight + reps  (everything loaded)
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

alter table programs          disable row level security;
alter table workout_days      disable row level security;
alter table workout_slots     disable row level security;
alter table slot_alternatives disable row level security;
alter table workout_sessions  disable row level security;
alter table logged_sets       disable row level security;
alter table exercises         disable row level security;

-- ─── EXERCISE LIBRARY ──────────────────────────────────────────────────────
-- Hypertrophy defaults:
--   Compounds              → 4 sets × 6 reps  (add weight weekly)
--   Heavy isolation        → 3 sets × 10 reps
--   Medium isolation       → 3–4 sets × 12 reps
--   High-rep / pump work   → 3–4 sets × 15 reps
--   Very high-rep          → 3 sets × 20 reps
--   Duration (plank/cardio)→ default_reps = seconds

insert into exercises (name, muscle_group, movement_category, tracking_type, default_sets, default_reps) values

-- ── BACK / Vertical Pull ─────────────────────────────────────────────────
('Pull Ups',              'back', 'vertical_pull', 'sets_reps',        4, 6),
('Weighted Pull Ups',     'back', 'vertical_pull', 'sets_reps_weight', 4, 6),
('Lat Pulldown',          'back', 'vertical_pull', 'sets_reps_weight', 4, 8),
('Assisted Pull-Up',      'back', 'vertical_pull', 'sets_reps_weight', 4, 6),
('Chin-Ups',              'back', 'vertical_pull', 'sets_reps',        4, 6),

-- ── BACK / Horizontal Pull ───────────────────────────────────────────────
('Bent Over Row',         'back', 'horizontal_pull', 'sets_reps_weight', 4, 6),
('T-Bar Row',             'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),
('Seated Cable Row',      'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),
('Dumbbell Row',          'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),
('Chest-Supported Row',   'back', 'horizontal_pull', 'sets_reps_weight', 4, 8),
('Meadows Row',           'back', 'horizontal_pull', 'sets_reps_weight', 3, 10),

-- ── REAR DELT ────────────────────────────────────────────────────────────
('Face Pull',                   'back',   'rear_delt', 'sets_reps_weight', 3, 15),
('Reverse Pec Deck',            'back',   'rear_delt', 'sets_reps_weight', 3, 15),
('Band Pull Apart',             'warmup', 'rear_delt', 'sets_reps',        2, 20),
('Bent-Over DB Rear Delt Fly',  'back',   'rear_delt', 'sets_reps_weight', 3, 15),

-- ── CHEST / Flat ─────────────────────────────────────────────────────────
('Bench Press',          'chest', 'horizontal_push', 'sets_reps_weight', 4, 6),
('Dumbbell Bench Press', 'chest', 'horizontal_push', 'sets_reps_weight', 4, 8),
('Push Ups',             'chest', 'horizontal_push', 'sets_reps',        3, 12),
('Pec Deck',             'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),
('Cable Crossover',      'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),
('Cable Fly',            'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),
('Dumbbell Fly',         'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),
('Machine Chest Press',  'chest', 'horizontal_push', 'sets_reps_weight', 3, 10),
('Dumbbell Pullover',    'chest', 'horizontal_push', 'sets_reps_weight', 3, 12),

-- ── CHEST / Incline ──────────────────────────────────────────────────────
('Incline Bench Press',     'chest', 'incline_push', 'sets_reps_weight', 4, 8),
('Incline Dumbbell Press',  'chest', 'incline_push', 'sets_reps_weight', 4, 8),
('Incline Dumbbell Fly',    'chest', 'incline_push', 'sets_reps_weight', 3, 12),

-- ── SHOULDERS / Vertical Push ────────────────────────────────────────────
('Overhead Press',          'shoulders', 'vertical_push', 'sets_reps_weight', 4, 6),
('Arnold Press',            'shoulders', 'vertical_push', 'sets_reps_weight', 3, 8),
('Dumbbell Shoulder Press', 'shoulders', 'vertical_push', 'sets_reps_weight', 3, 8),

-- ── SHOULDERS / Lateral ──────────────────────────────────────────────────
('Lateral Raises',         'shoulders', 'shoulder_abduction', 'sets_reps_weight', 4, 15),
('Cable Lateral Raise',    'shoulders', 'shoulder_abduction', 'sets_reps_weight', 4, 15),
('Machine Lateral Raise',  'shoulders', 'shoulder_abduction', 'sets_reps_weight', 3, 15),
('Lean-Away Cable Lateral','shoulders', 'shoulder_abduction', 'sets_reps_weight', 3, 15),
('Front Raises',           'shoulders', 'shoulder_abduction', 'sets_reps_weight', 3, 12),

-- ── BICEPS ───────────────────────────────────────────────────────────────
('Barbell Curl',           'biceps', 'elbow_flexion', 'sets_reps_weight', 3,  8),
('Dumbbell Curl',          'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Hammer Curl',            'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Preacher Curl',          'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Bayesian Curl',          'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),
('Standing Rotating Curl', 'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Concentration Curl',     'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),
('Cable Curl',             'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),
('Incline Dumbbell Curl',  'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 10),
('Spider Curl',            'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),
('Reverse Curl',           'biceps', 'elbow_flexion', 'sets_reps_weight', 3, 12),

-- ── TRICEPS ──────────────────────────────────────────────────────────────
('Weighted Dips',             'triceps', 'elbow_extension', 'sets_reps_weight', 4,  6),
('Dips',                      'triceps', 'elbow_extension', 'sets_reps',        3, 10),
('Skull Crusher',             'triceps', 'elbow_extension', 'sets_reps_weight', 3, 10),
('Overhead Tricep Extension', 'triceps', 'elbow_extension', 'sets_reps_weight', 3, 10),
('Tricep Pushdown',           'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('V-Bar Pushdown',            'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('Single-Arm Pushdown',       'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('Straight-Bar Pushdown',     'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('Cable Overhead Extension',  'triceps', 'elbow_extension', 'sets_reps_weight', 3, 12),
('Close Grip Bench Press',    'triceps', 'elbow_extension', 'sets_reps_weight', 4,  8),
('Diamond Push Ups',          'triceps', 'elbow_extension', 'sets_reps',        3, 12),

-- ── LEGS / Quad Dominant ─────────────────────────────────────────────────
('Squat',                'legs', 'quad_dominant', 'sets_reps_weight', 4,  6),
('Goblet Squat',         'legs', 'quad_dominant', 'sets_reps_weight', 3, 10),
('Hack Squat',           'legs', 'quad_dominant', 'sets_reps_weight', 4,  8),
('Leg Press',            'legs', 'quad_dominant', 'sets_reps_weight', 4, 10),
('High-Foot Leg Press',  'legs', 'quad_dominant', 'sets_reps_weight', 4, 10),
('Leg Extension',        'legs', 'quad_dominant', 'sets_reps_weight', 3, 12),
('Dumbbell Lunges',      'legs', 'quad_dominant', 'sets_reps_weight', 3, 10),
('Bulgarian Split Squat','legs', 'quad_dominant', 'sets_reps_weight', 3,  8),
('Low-Box Step-Up',      'legs', 'quad_dominant', 'sets_reps_weight', 3, 10),
('Step-Up',              'legs', 'quad_dominant', 'sets_reps_weight', 3, 10),

-- ── LEGS / Hip Hinge ─────────────────────────────────────────────────────
('Romanian Deadlift', 'legs', 'hip_hinge', 'sets_reps_weight', 4,  8),
('Dumbbell RDL',      'legs', 'hip_hinge', 'sets_reps_weight', 3, 10),
('Single-Leg RDL',    'legs', 'hip_hinge', 'sets_reps_weight', 3, 10),
('Good Morning',      'legs', 'hip_hinge', 'sets_reps_weight', 3, 10),

-- ── LEGS / Knee Flexion ──────────────────────────────────────────────────
('Seated Leg Curl',  'legs', 'knee_flexion', 'sets_reps_weight', 3, 10),
('Lying Leg Curl',   'legs', 'knee_flexion', 'sets_reps_weight', 3, 10),
('Nordic Curl',      'legs', 'knee_flexion', 'sets_reps',        3,  8),
('TKE with Band',    'legs', 'knee_flexion', 'sets_reps',        3, 15),

-- ── GLUTES / Hip Extension ───────────────────────────────────────────────
('Hip Thrust',          'glutes', 'hip_extension', 'sets_reps_weight', 4,  8),
('Dumbbell Hip Thrust', 'glutes', 'hip_extension', 'sets_reps_weight', 4,  8),
('Glute Bridge',        'glutes', 'hip_extension', 'sets_reps',        3, 12),
('Cable Pull-Through',  'glutes', 'hip_extension', 'sets_reps_weight', 3, 12),
('Cable Kickback',      'glutes', 'hip_extension', 'sets_reps_weight', 3, 12),

-- ── TRAPS ────────────────────────────────────────────────────────────────
('Dumbbell Shrugs',          'back', 'trap_shrug', 'sets_reps_weight', 4, 12),
('Barbell Shrugs',           'back', 'trap_shrug', 'sets_reps_weight', 4, 12),
('Cable Shrugs',             'back', 'trap_shrug', 'sets_reps_weight', 4, 12),
('Behind-Back Machine Shrug','back', 'trap_shrug', 'sets_reps_weight', 4, 12),

-- ── FOREARMS ─────────────────────────────────────────────────────────────
('Wrist Curls',      'other', 'wrist_work', 'sets_reps_weight', 3, 15),
('Wrist Extensions', 'other', 'wrist_work', 'sets_reps_weight', 3, 15),
('Barbell Wrist Curl','other','wrist_work', 'sets_reps_weight', 3, 15),
('Plate Pinch Carry', 'other','wrist_work', 'sets_reps',        3, 15),

-- ── NECK ─────────────────────────────────────────────────────────────────
('Neck Curls',      'other', 'neck', 'sets_reps',        3, 15),
('Neck Extensions', 'other', 'neck', 'sets_reps',        3, 15),
('Neck Harness',    'other', 'neck', 'sets_reps_weight', 3, 15),

-- ── CORE ─────────────────────────────────────────────────────────────────
('Hanging Leg Raise', 'core', 'core', 'sets_reps',        3, 10),
('Cable Crunch',      'core', 'core', 'sets_reps_weight', 3, 15),
('Ab Wheel',          'core', 'core', 'sets_reps',        3, 10),
('Plank',             'core', 'core', 'duration',         3, 60),

-- ── WARMUP ───────────────────────────────────────────────────────────────
('Jump Rope',    'warmup', 'warmup', 'duration', 2, 180),
('Light Jog',    'warmup', 'warmup', 'duration', 1, 300),
('Arm Circles',  'warmup', 'warmup', 'duration', 2,  30),
('Hip Circles',  'warmup', 'warmup', 'duration', 2,  30);


-- ─── SEED: NCSU PROGRAM ────────────────────────────────────────────────────

do $$
declare
  prog uuid;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid; d5 uuid;
  s  uuid;
begin

  insert into programs (name) values ('NCSU') returning id into prog;

  -- ── DAY 1: Push (shoulders + triceps primary, chest secondary) ──────────
  insert into workout_days (program_id, name, order_index)
    values (prog, 'Day 1 — Push', 0) returning id into d1;

  -- 1. Bench Press 3×6
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d1, 0, (select id from exercises where name='Bench Press'), 3, 6)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Incline Bench Press')),
    (s, (select id from exercises where name='Dumbbell Bench Press'));

  -- 2. Pec Deck 2×12
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d1, 1, (select id from exercises where name='Pec Deck'), 2, 12)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Cable Crossover')),
    (s, (select id from exercises where name='Dumbbell Fly'));

  -- 3. Overhead Press 4×7
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d1, 2, (select id from exercises where name='Overhead Press'), 4, 7)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Dumbbell Shoulder Press')),
    (s, (select id from exercises where name='Arnold Press'));

  -- 4. Lateral Raises 3×15
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d1, 3, (select id from exercises where name='Lateral Raises'), 3, 15)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Cable Lateral Raise')),
    (s, (select id from exercises where name='Machine Lateral Raise'));

  -- 5. Weighted Dips 4×8
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d1, 4, (select id from exercises where name='Weighted Dips'), 4, 8)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Overhead Tricep Extension')),
    (s, (select id from exercises where name='Skull Crusher'));

  -- 6. Tricep Pushdown 3×10
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d1, 5, (select id from exercises where name='Tricep Pushdown'), 3, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='V-Bar Pushdown')),
    (s, (select id from exercises where name='Single-Arm Pushdown'));


  -- ── DAY 2: Pull (back, biceps, rear delts) ─────────────────────────────
  insert into workout_days (program_id, name, order_index)
    values (prog, 'Day 2 — Pull', 1) returning id into d2;

  -- 1. Weighted Pull Ups 4×5
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d2, 0, (select id from exercises where name='Weighted Pull Ups'), 4, 5)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Lat Pulldown')),
    (s, (select id from exercises where name='Assisted Pull-Up'));

  -- 2. T-Bar Row 4×7
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d2, 1, (select id from exercises where name='T-Bar Row'), 4, 7)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Bent Over Row')),
    (s, (select id from exercises where name='Seated Cable Row'));

  -- 3. Reverse Pec Deck 3×15
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d2, 2, (select id from exercises where name='Reverse Pec Deck'), 3, 15)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Face Pull')),
    (s, (select id from exercises where name='Bent-Over DB Rear Delt Fly'));

  -- 4. Bayesian Curl 3×10
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d2, 3, (select id from exercises where name='Bayesian Curl'), 3, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Preacher Curl')),
    (s, (select id from exercises where name='Incline Dumbbell Curl'));

  -- 5. Dumbbell Shrugs 3×12
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d2, 4, (select id from exercises where name='Dumbbell Shrugs'), 3, 12)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Barbell Shrugs')),
    (s, (select id from exercises where name='Cable Shrugs'));


  -- ── DAY 3: Legs (knee-safe) ────────────────────────────────────────────
  insert into workout_days (program_id, name, order_index)
    values (prog, 'Day 3 — Legs', 2) returning id into d3;

  -- 1. Seated Leg Curl 4×10 (3-sec eccentric)
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d3, 0, (select id from exercises where name='Seated Leg Curl'), 4, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Lying Leg Curl')),
    (s, (select id from exercises where name='Nordic Curl'));

  -- 2. Romanian Deadlift 3×9
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d3, 1, (select id from exercises where name='Romanian Deadlift'), 3, 9)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Dumbbell RDL')),
    (s, (select id from exercises where name='Single-Leg RDL'));

  -- 3. Hip Thrust 4×10
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d3, 2, (select id from exercises where name='Hip Thrust'), 4, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Dumbbell Hip Thrust')),
    (s, (select id from exercises where name='Cable Pull-Through'));

  -- 4. Leg Extension 3×12 (partial ROM ~60°+)
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d3, 3, (select id from exercises where name='Leg Extension'), 3, 12)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='TKE with Band')),
    (s, (select id from exercises where name='Low-Box Step-Up'));

  -- 5. Goblet Squat 3×10 (to 90°)
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d3, 4, (select id from exercises where name='Goblet Squat'), 3, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Hack Squat')),
    (s, (select id from exercises where name='High-Foot Leg Press'));


  -- ── DAY 4: Accessory A (biceps, triceps, forearms) ─────────────────────
  insert into workout_days (program_id, name, order_index)
    values (prog, 'Day 4 — Accessory A', 3) returning id into d4;

  -- 1. Bayesian Curl 3×10
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d4, 0, (select id from exercises where name='Bayesian Curl'), 3, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Preacher Curl')),
    (s, (select id from exercises where name='Hammer Curl'));

  -- 2. Incline Dumbbell Curl 3×10
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d4, 1, (select id from exercises where name='Incline Dumbbell Curl'), 3, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Spider Curl')),
    (s, (select id from exercises where name='Concentration Curl'));

  -- 3. Overhead Tricep Extension 4×10
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d4, 2, (select id from exercises where name='Overhead Tricep Extension'), 4, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Cable Overhead Extension')),
    (s, (select id from exercises where name='Skull Crusher'));

  -- 4. Tricep Pushdown 3×12
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d4, 3, (select id from exercises where name='Tricep Pushdown'), 3, 12)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='V-Bar Pushdown')),
    (s, (select id from exercises where name='Single-Arm Pushdown'));

  -- 5a. Wrist Curls 2×15
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d4, 4, (select id from exercises where name='Wrist Curls'), 2, 15)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Barbell Wrist Curl'));

  -- 5b. Wrist Extensions 2×15
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d4, 5, (select id from exercises where name='Wrist Extensions'), 2, 15)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Plate Pinch Carry'));


  -- ── DAY 5: Accessory B — optional (shoulders, neck, traps) ────────────
  insert into workout_days (program_id, name, order_index)
    values (prog, 'Day 5 — Accessory B (optional)', 4) returning id into d5;

  -- 1. Lateral Raises 4×15
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d5, 0, (select id from exercises where name='Lateral Raises'), 4, 15)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Cable Lateral Raise')),
    (s, (select id from exercises where name='Lean-Away Cable Lateral'));

  -- 2. Overhead Press 3×10 (lighter / form focus)
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d5, 1, (select id from exercises where name='Overhead Press'), 3, 10)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Dumbbell Shoulder Press')),
    (s, (select id from exercises where name='Arnold Press'));

  -- 3. Face Pull 3×20
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d5, 2, (select id from exercises where name='Face Pull'), 3, 20)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Band Pull Apart'));

  -- 4. Dumbbell Shrugs 3×12
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d5, 3, (select id from exercises where name='Dumbbell Shrugs'), 3, 12)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Barbell Shrugs')),
    (s, (select id from exercises where name='Behind-Back Machine Shrug'));

  -- 5. Neck Curls 2×15
  insert into workout_slots (day_id, order_index, default_exercise_id, sets_target, reps_target)
    values (d5, 4, (select id from exercises where name='Neck Curls'), 2, 15)
    returning id into s;
  insert into slot_alternatives (slot_id, exercise_id) values
    (s, (select id from exercises where name='Neck Harness'));

end;
$$;
