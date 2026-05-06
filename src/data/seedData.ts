import { createId, nowIso, todayIso } from "../lib/ids";
import { hashPin } from "../lib/security";
import type {
  Exercise,
  Gym,
  ReadinessCheckIn,
  SplitTemplate,
  TrainingDatabase,
  TrainingGoal,
  UserProfile,
  WorkoutSession,
  WorkoutTemplate
} from "../types/domain";

const builtInExercises: Exercise[] = [
  {
    id: "ex_squat_comp",
    name: "Competition Squat",
    muscleGroup: "quads",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "abs", "upper-back"],
    equipment: ["barbell"],
    movementPattern: "squat",
    tags: ["powerlifting", "powerbuilding"],
    variants: [
      {
        id: "var_pause_squat",
        name: "Paused Squat",
        parentExerciseId: "ex_squat_comp",
        emphasis: "Bottom position strength and control out of the hole.",
        setupCues: ["Brace before descent", "Own the pause", "Drive straight up"],
        substitutionIds: ["ex_front_squat", "ex_leg_press"]
      }
    ],
    substitutionIds: ["ex_front_squat", "ex_leg_press"],
    setupCues: ["Set upper back tight", "Tripod foot", "Brace into belt", "Drive traps into bar"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["competition-lift", "compound"],
    directVolumeMuscles: ["quads", "glutes"],
    indirectVolumeMuscles: ["hamstrings", "abs", "upper-back"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_bench_comp",
    name: "Competition Bench Press",
    muscleGroup: "chest",
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front-delts", "upper-back"],
    equipment: ["barbell"],
    movementPattern: "horizontal-press",
    tags: ["powerlifting", "powerbuilding", "bodybuilding"],
    variants: [
      {
        id: "var_spoto",
        name: "Spoto Press",
        parentExerciseId: "ex_bench_comp",
        emphasis: "Off-chest control without relaxing on the chest.",
        setupCues: ["Pause just above chest", "Keep lats tight", "Press back toward rack"],
        substitutionIds: ["ex_db_incline_press", "ex_machine_chest_press"]
      }
    ],
    substitutionIds: ["ex_close_grip_bench", "ex_db_incline_press", "ex_machine_chest_press"],
    setupCues: ["Set arch", "Pull shoulder blades down", "Touch consistently", "Leg drive through press"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["competition-lift", "compound"],
    directVolumeMuscles: ["chest", "triceps"],
    indirectVolumeMuscles: ["front-delts", "upper-back"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_deadlift_comp",
    name: "Competition Deadlift",
    muscleGroup: "hamstrings",
    primaryMuscles: ["hamstrings", "glutes", "back"],
    secondaryMuscles: ["quads", "forearms", "abs", "upper-back"],
    equipment: ["barbell"],
    movementPattern: "hinge",
    tags: ["powerlifting", "powerbuilding"],
    variants: [
      {
        id: "var_deficit_deadlift",
        name: "Deficit Deadlift",
        parentExerciseId: "ex_deadlift_comp",
        emphasis: "Off-floor strength and patient positioning.",
        setupCues: ["Push floor away", "Keep chest proud", "Do not yank slack"],
        substitutionIds: ["ex_rdl"]
      }
    ],
    substitutionIds: ["ex_rdl", "ex_barbell_row"],
    setupCues: ["Wedge hips to bar", "Pull slack", "Push floor", "Finish with glutes"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["competition-lift", "compound"],
    directVolumeMuscles: ["hamstrings", "glutes", "back"],
    indirectVolumeMuscles: ["quads", "forearms", "abs", "upper-back"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_ohp",
    name: "Overhead Press",
    muscleGroup: "front-delts",
    primaryMuscles: ["front-delts", "triceps"],
    secondaryMuscles: ["side-delts", "abs", "upper-back"],
    equipment: ["barbell", "dumbbell"],
    movementPattern: "vertical-press",
    tags: ["powerbuilding", "bodybuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_db_shoulder_press"],
    setupCues: ["Squeeze glutes", "Ribs down", "Press slightly back"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["compound", "accessory"],
    directVolumeMuscles: ["front-delts", "triceps"],
    indirectVolumeMuscles: ["side-delts", "abs"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_db_incline_press",
    name: "Incline Dumbbell Press",
    muscleGroup: "chest",
    primaryMuscles: ["chest", "front-delts"],
    secondaryMuscles: ["triceps"],
    equipment: ["dumbbell"],
    movementPattern: "horizontal-press",
    tags: ["bodybuilding", "powerbuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_machine_chest_press", "ex_bench_comp"],
    setupCues: ["Low incline", "Control stretch", "Drive biceps together"],
    trackByBodyweight: false,
    trackPerSide: true,
    category: "dumbbell",
    kind: ["accessory", "compound"],
    directVolumeMuscles: ["chest"],
    indirectVolumeMuscles: ["front-delts", "triceps"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_close_grip_bench",
    name: "Close-Grip Bench Press",
    muscleGroup: "triceps",
    primaryMuscles: ["triceps", "chest"],
    secondaryMuscles: ["front-delts"],
    equipment: ["barbell"],
    movementPattern: "horizontal-press",
    tags: ["powerlifting", "powerbuilding"],
    variants: [],
    substitutionIds: ["ex_cable_triceps_pressdown", "ex_machine_chest_press"],
    setupCues: ["Grip just inside shoulders", "Tuck slightly", "Press through triceps"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["variation", "compound"],
    directVolumeMuscles: ["triceps", "chest"],
    indirectVolumeMuscles: ["front-delts"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_front_squat",
    name: "Front Squat",
    muscleGroup: "quads",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "upper-back", "abs"],
    equipment: ["barbell"],
    movementPattern: "squat",
    tags: ["powerlifting", "powerbuilding", "bodybuilding"],
    variants: [],
    substitutionIds: ["ex_squat_comp", "ex_leg_press"],
    setupCues: ["Elbows high", "Sit between hips", "Keep torso tall"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["variation", "compound"],
    directVolumeMuscles: ["quads"],
    indirectVolumeMuscles: ["glutes", "upper-back", "abs"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_rdl",
    name: "Romanian Deadlift",
    muscleGroup: "hamstrings",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["back", "forearms"],
    equipment: ["barbell", "dumbbell"],
    movementPattern: "hinge",
    tags: ["powerlifting", "powerbuilding", "bodybuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_deadlift_comp", "ex_lying_leg_curl"],
    setupCues: ["Soft knees", "Hips back", "Feel hamstrings", "Keep lats locked"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["accessory", "compound"],
    directVolumeMuscles: ["hamstrings", "glutes"],
    indirectVolumeMuscles: ["back", "forearms"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_barbell_row",
    name: "Barbell Row",
    muscleGroup: "back",
    primaryMuscles: ["back", "upper-back", "lats"],
    secondaryMuscles: ["biceps", "hamstrings"],
    equipment: ["barbell"],
    movementPattern: "horizontal-pull",
    tags: ["powerbuilding", "bodybuilding"],
    variants: [],
    substitutionIds: ["ex_chest_supported_row", "ex_cable_row"],
    setupCues: ["Brace hard", "Pull elbows back", "Pause against torso"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "barbell",
    kind: ["accessory", "compound"],
    directVolumeMuscles: ["back", "upper-back", "lats"],
    indirectVolumeMuscles: ["biceps", "hamstrings"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_chest_supported_row",
    name: "Chest-Supported Row",
    muscleGroup: "upper-back",
    primaryMuscles: ["upper-back", "lats"],
    secondaryMuscles: ["biceps", "rear-delts"],
    equipment: ["machine", "dumbbell"],
    movementPattern: "horizontal-pull",
    tags: ["bodybuilding", "powerbuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_cable_row", "ex_barbell_row"],
    setupCues: ["Chest glued to pad", "Lead with elbows", "Hold squeeze"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "machine",
    kind: ["accessory", "compound"],
    directVolumeMuscles: ["upper-back", "lats"],
    indirectVolumeMuscles: ["biceps", "rear-delts"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_cable_row",
    name: "Cable Row",
    muscleGroup: "back",
    primaryMuscles: ["lats", "upper-back"],
    secondaryMuscles: ["biceps", "rear-delts"],
    equipment: ["cable", "machine"],
    movementPattern: "horizontal-pull",
    tags: ["bodybuilding", "powerbuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_chest_supported_row", "ex_barbell_row"],
    setupCues: ["Let shoulder blades reach", "Pull elbows to hips", "Control return"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "cable",
    kind: ["accessory", "compound"],
    directVolumeMuscles: ["lats", "upper-back"],
    indirectVolumeMuscles: ["biceps", "rear-delts"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_lat_pulldown",
    name: "Lat Pulldown",
    muscleGroup: "lats",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper-back"],
    equipment: ["cable", "machine"],
    movementPattern: "vertical-pull",
    tags: ["bodybuilding", "general-health", "powerbuilding"],
    variants: [],
    substitutionIds: ["ex_pull_up", "ex_cable_row"],
    setupCues: ["Chest tall", "Pull elbows down", "Pause at collarbone"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "cable",
    kind: ["accessory", "compound"],
    directVolumeMuscles: ["lats"],
    indirectVolumeMuscles: ["biceps", "upper-back"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_pull_up",
    name: "Pull-Up",
    muscleGroup: "lats",
    primaryMuscles: ["lats", "upper-back"],
    secondaryMuscles: ["biceps", "abs"],
    equipment: ["bodyweight"],
    movementPattern: "vertical-pull",
    tags: ["bodybuilding", "general-health", "powerbuilding"],
    variants: [],
    substitutionIds: ["ex_lat_pulldown"],
    setupCues: ["Start from dead hang", "Drive elbows down", "Control descent"],
    trackByBodyweight: true,
    trackPerSide: false,
    category: "bodyweight",
    kind: ["compound", "accessory"],
    directVolumeMuscles: ["lats", "upper-back"],
    indirectVolumeMuscles: ["biceps", "abs"],
    bestTrackedBy: ["reps", "load"]
  },
  {
    id: "ex_leg_press",
    name: "Leg Press",
    muscleGroup: "quads",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["machine"],
    movementPattern: "squat",
    tags: ["bodybuilding", "general-health", "powerbuilding"],
    variants: [],
    substitutionIds: ["ex_front_squat", "ex_squat_comp"],
    setupCues: ["Deep controlled reps", "Knees track toes", "Do not bounce"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "machine",
    kind: ["compound", "accessory"],
    directVolumeMuscles: ["quads", "glutes"],
    indirectVolumeMuscles: ["hamstrings"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_lying_leg_curl",
    name: "Lying Leg Curl",
    muscleGroup: "hamstrings",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["calves"],
    equipment: ["machine"],
    movementPattern: "isolation",
    tags: ["bodybuilding", "general-health", "powerbuilding"],
    variants: [],
    substitutionIds: ["ex_rdl"],
    setupCues: ["Hips pinned", "Curl hard", "Slow eccentric"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "machine",
    kind: ["isolation"],
    directVolumeMuscles: ["hamstrings"],
    indirectVolumeMuscles: [],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_cable_lateral_raise",
    name: "Cable Lateral Raise",
    muscleGroup: "side-delts",
    primaryMuscles: ["side-delts"],
    secondaryMuscles: ["upper-back"],
    equipment: ["cable"],
    movementPattern: "isolation",
    tags: ["bodybuilding", "powerbuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_db_lateral_raise"],
    setupCues: ["Cuff behind body", "Lead with elbow", "Stop before traps take over"],
    trackByBodyweight: false,
    trackPerSide: true,
    category: "cable",
    kind: ["isolation"],
    directVolumeMuscles: ["side-delts"],
    indirectVolumeMuscles: [],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_db_lateral_raise",
    name: "Dumbbell Lateral Raise",
    muscleGroup: "side-delts",
    primaryMuscles: ["side-delts"],
    secondaryMuscles: ["upper-back"],
    equipment: ["dumbbell"],
    movementPattern: "isolation",
    tags: ["bodybuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_cable_lateral_raise"],
    setupCues: ["Soft elbow", "Raise out and slightly forward", "Own the top"],
    trackByBodyweight: false,
    trackPerSide: true,
    category: "dumbbell",
    kind: ["isolation"],
    directVolumeMuscles: ["side-delts"],
    indirectVolumeMuscles: [],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_incline_curl",
    name: "Incline Dumbbell Curl",
    muscleGroup: "biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    equipment: ["dumbbell"],
    movementPattern: "isolation",
    tags: ["bodybuilding", "powerbuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_cable_curl"],
    setupCues: ["Arms hang behind torso", "Supinate hard", "No shoulder swing"],
    trackByBodyweight: false,
    trackPerSide: true,
    category: "dumbbell",
    kind: ["isolation"],
    directVolumeMuscles: ["biceps"],
    indirectVolumeMuscles: ["forearms"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_cable_curl",
    name: "Cable Curl",
    muscleGroup: "biceps",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    equipment: ["cable"],
    movementPattern: "isolation",
    tags: ["bodybuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_incline_curl"],
    setupCues: ["Elbows pinned", "Curl through pinky", "Control stack"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "cable",
    kind: ["isolation"],
    directVolumeMuscles: ["biceps"],
    indirectVolumeMuscles: ["forearms"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_cable_triceps_pressdown",
    name: "Cable Triceps Pressdown",
    muscleGroup: "triceps",
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["forearms"],
    equipment: ["cable"],
    movementPattern: "isolation",
    tags: ["bodybuilding", "powerbuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_close_grip_bench"],
    setupCues: ["Shoulders down", "Elbows fixed", "Lock out hard"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "cable",
    kind: ["isolation"],
    directVolumeMuscles: ["triceps"],
    indirectVolumeMuscles: ["forearms"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_machine_chest_press",
    name: "Machine Chest Press",
    muscleGroup: "chest",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front-delts"],
    equipment: ["machine"],
    movementPattern: "horizontal-press",
    tags: ["bodybuilding", "general-health"],
    variants: [],
    substitutionIds: ["ex_db_incline_press", "ex_bench_comp"],
    setupCues: ["Seat so handles hit mid chest", "Deep stretch", "Drive handles together"],
    trackByBodyweight: false,
    trackPerSide: false,
    category: "machine",
    kind: ["compound", "accessory"],
    directVolumeMuscles: ["chest"],
    indirectVolumeMuscles: ["triceps", "front-delts"],
    bestTrackedBy: ["load", "reps"]
  },
  {
    id: "ex_plank",
    name: "Plank",
    muscleGroup: "abs",
    primaryMuscles: ["abs"],
    secondaryMuscles: ["glutes", "front-delts"],
    equipment: ["bodyweight"],
    movementPattern: "brace",
    tags: ["general-health", "conditioning", "powerlifting"],
    variants: [],
    substitutionIds: [],
    setupCues: ["Ribs down", "Squeeze glutes", "Breathe behind brace"],
    trackByBodyweight: true,
    trackPerSide: false,
    category: "bodyweight",
    kind: ["accessory"],
    directVolumeMuscles: ["abs"],
    indirectVolumeMuscles: ["glutes"],
    bestTrackedBy: ["time"]
  },
  {
    id: "ex_treadmill_walk",
    name: "Incline Treadmill Walk",
    muscleGroup: "conditioning",
    primaryMuscles: ["conditioning"],
    secondaryMuscles: ["calves", "glutes"],
    equipment: ["cardio"],
    movementPattern: "locomotion",
    tags: ["conditioning", "general-health", "maintenance"],
    variants: [],
    substitutionIds: [],
    setupCues: ["Nasal breathing if possible", "Tall posture", "Do not grip rails"],
    trackByBodyweight: true,
    trackPerSide: false,
    category: "cardio",
    kind: ["conditioning"],
    directVolumeMuscles: ["conditioning"],
    indirectVolumeMuscles: ["calves", "glutes"],
    bestTrackedBy: ["time", "distance"]
  }
];

const splitTemplates: SplitTemplate[] = [
  {
    id: "split_ppl",
    name: "Push/Pull/Legs",
    goal: "bodybuilding",
    daysPerWeek: 6,
    notes: "High frequency hypertrophy with repeated movement patterns.",
    days: [
      { id: "split_ppl_push", name: "Push", focus: "hypertrophy", muscleGroups: ["chest", "front-delts", "side-delts", "triceps"], movementPatterns: ["horizontal-press", "vertical-press", "isolation"], exerciseTargetCount: 6, priorityMuscles: ["chest", "side-delts"], priorityLifts: [], weeklySetTargets: { chest: 8, "side-delts": 6, triceps: 6 } },
      { id: "split_ppl_pull", name: "Pull", focus: "hypertrophy", muscleGroups: ["back", "lats", "upper-back", "rear-delts", "biceps"], movementPatterns: ["horizontal-pull", "vertical-pull", "isolation"], exerciseTargetCount: 6, priorityMuscles: ["lats", "upper-back"], priorityLifts: [], weeklySetTargets: { lats: 8, "upper-back": 6, biceps: 6 } },
      { id: "split_ppl_legs", name: "Legs", focus: "hypertrophy", muscleGroups: ["quads", "hamstrings", "glutes", "calves"], movementPatterns: ["squat", "hinge", "isolation"], exerciseTargetCount: 6, priorityMuscles: ["quads", "hamstrings"], priorityLifts: [], weeklySetTargets: { quads: 8, hamstrings: 8, glutes: 4 } }
    ]
  },
  {
    id: "split_upper_lower",
    name: "Upper/Lower",
    goal: "powerbuilding",
    daysPerWeek: 4,
    notes: "Balanced strength and hypertrophy with simple recovery management.",
    days: [
      { id: "split_ul_upper_strength", name: "Upper Strength", focus: "strength", muscleGroups: ["chest", "back", "triceps", "biceps"], mainLiftFocus: "Bench", movementPatterns: ["horizontal-press", "horizontal-pull"], exerciseTargetCount: 5, priorityMuscles: ["chest", "triceps"], priorityLifts: ["bench"], weeklySetTargets: { chest: 5, back: 5, triceps: 3 } },
      { id: "split_ul_lower_strength", name: "Lower Strength", focus: "strength", muscleGroups: ["quads", "hamstrings", "glutes"], mainLiftFocus: "Squat", movementPatterns: ["squat", "hinge"], exerciseTargetCount: 5, priorityMuscles: ["quads", "hamstrings"], priorityLifts: ["squat", "deadlift"], weeklySetTargets: { quads: 5, hamstrings: 5, glutes: 4 } },
      { id: "split_ul_upper_hyp", name: "Upper Hypertrophy", focus: "hypertrophy", muscleGroups: ["chest", "back", "lats", "side-delts", "rear-delts", "biceps", "triceps"], movementPatterns: ["horizontal-press", "vertical-pull", "isolation"], exerciseTargetCount: 7, priorityMuscles: ["lats", "side-delts", "biceps"], priorityLifts: [], weeklySetTargets: { lats: 5, "side-delts": 5, biceps: 4 } },
      { id: "split_ul_lower_hyp", name: "Lower Hypertrophy", focus: "hypertrophy", muscleGroups: ["quads", "hamstrings", "glutes", "calves"], movementPatterns: ["squat", "hinge", "isolation"], exerciseTargetCount: 6, priorityMuscles: ["hamstrings", "quads"], priorityLifts: [], weeklySetTargets: { quads: 5, hamstrings: 5, calves: 4 } }
    ]
  },
  {
    id: "split_full_body",
    name: "Full Body",
    goal: "general-health",
    daysPerWeek: 3,
    notes: "Efficient general fitness with whole-body practice.",
    days: [
      { id: "split_fb_a", name: "Full Body A", focus: "hybrid", muscleGroups: ["full-body"], movementPatterns: ["squat", "horizontal-press", "horizontal-pull", "brace"], exerciseTargetCount: 5, priorityMuscles: ["full-body"], priorityLifts: [], weeklySetTargets: { "full-body": 10 } },
      { id: "split_fb_b", name: "Full Body B", focus: "hybrid", muscleGroups: ["full-body"], movementPatterns: ["hinge", "vertical-press", "vertical-pull", "locomotion"], exerciseTargetCount: 5, priorityMuscles: ["full-body"], priorityLifts: [], weeklySetTargets: { "full-body": 10 } },
      { id: "split_fb_c", name: "Full Body C", focus: "conditioning", muscleGroups: ["full-body", "conditioning"], movementPatterns: ["single-leg", "horizontal-press", "horizontal-pull", "locomotion"], exerciseTargetCount: 5, priorityMuscles: ["conditioning"], priorityLifts: [], weeklySetTargets: { conditioning: 3 } }
    ]
  },
  {
    id: "split_powerlifting",
    name: "Powerlifting",
    goal: "powerlifting",
    daysPerWeek: 4,
    notes: "Squat, bench, and deadlift frequency with accessories for weak points.",
    days: [
      { id: "split_pl_squat", name: "Squat + Bench Volume", focus: "strength", muscleGroups: ["quads", "chest", "triceps"], mainLiftFocus: "Squat", movementPatterns: ["squat", "horizontal-press"], exerciseTargetCount: 5, priorityMuscles: ["quads", "chest"], priorityLifts: ["squat", "bench"], weeklySetTargets: { quads: 6, chest: 5 } },
      { id: "split_pl_bench", name: "Bench + Upper Back", focus: "strength", muscleGroups: ["chest", "upper-back", "triceps"], mainLiftFocus: "Bench", movementPatterns: ["horizontal-press", "horizontal-pull"], exerciseTargetCount: 6, priorityMuscles: ["chest", "upper-back"], priorityLifts: ["bench"], weeklySetTargets: { chest: 6, "upper-back": 6 } },
      { id: "split_pl_deadlift", name: "Deadlift + Squat Variation", focus: "strength", muscleGroups: ["hamstrings", "glutes", "quads", "back"], mainLiftFocus: "Deadlift", movementPatterns: ["hinge", "squat"], exerciseTargetCount: 5, priorityMuscles: ["hamstrings", "glutes"], priorityLifts: ["deadlift", "squat"], weeklySetTargets: { hamstrings: 6, glutes: 5 } },
      { id: "split_pl_bench_hyp", name: "Bench Hypertrophy + Accessories", focus: "hypertrophy", muscleGroups: ["chest", "triceps", "lats", "side-delts"], mainLiftFocus: "Bench", movementPatterns: ["horizontal-press", "vertical-pull", "isolation"], exerciseTargetCount: 7, priorityMuscles: ["triceps", "lats", "side-delts"], priorityLifts: ["bench"], weeklySetTargets: { triceps: 5, lats: 5, "side-delts": 4 } }
    ]
  },
  {
    id: "split_powerbuilding",
    name: "Powerbuilding",
    goal: "powerbuilding",
    daysPerWeek: 5,
    notes: "Main lift progress first, bodybuilding volume second.",
    days: []
  },
  {
    id: "split_bro",
    name: "Bodybuilding Bro Split",
    goal: "bodybuilding",
    daysPerWeek: 5,
    notes: "High local volume and focused execution for one or two muscles per day.",
    days: []
  },
  {
    id: "split_hybrid",
    name: "Strength/Hypertrophy Hybrid",
    goal: "powerbuilding",
    daysPerWeek: 4,
    notes: "Heavy compounds followed by targeted hypertrophy work.",
    days: []
  },
  {
    id: "split_meet_prep",
    name: "Meet Prep",
    goal: "powerlifting",
    daysPerWeek: 4,
    notes: "Specificity, singles practice, fatigue control, and peaking structure.",
    days: []
  },
  {
    id: "split_offseason",
    name: "Off-Season",
    goal: "powerbuilding",
    daysPerWeek: 4,
    notes: "Build muscle, shore up weak points, and reduce competition lift monotony.",
    days: []
  },
  {
    id: "split_deload",
    name: "Deload/Recovery Week",
    goal: "maintenance",
    daysPerWeek: 3,
    notes: "Reduced volume and intensity while preserving movement practice.",
    days: []
  },
  {
    id: "split_maintenance",
    name: "Maintenance",
    goal: "maintenance",
    daysPerWeek: 3,
    notes: "Minimum effective dose to hold strength, muscle, and routine.",
    days: []
  },
  {
    id: "split_conditioning",
    name: "Conditioning Focused",
    goal: "conditioning",
    daysPerWeek: 4,
    notes: "Aerobic base, intervals, and resilient movement quality.",
    days: []
  }
];

function plannedSet(id: string, reps: number, rpe: number, weight?: number) {
  return { id, kind: "working" as const, targetReps: reps, targetRpe: rpe, plannedWeight: weight };
}

function makeTemplate(userId: string, name: string, goal: TrainingGoal): WorkoutTemplate {
  const now = nowIso();
  return {
    id: createId("template"),
    userId,
    name,
    goal,
    createdAt: now,
    updatedAt: now,
    days: [
      {
        id: createId("day"),
        name: goal === "general-health" ? "Full Body A" : "Squat + Bench Volume",
        focus: goal === "general-health" ? "hybrid" : "strength",
        exercises:
          goal === "general-health"
            ? [
                { id: createId("planned"), exerciseId: "ex_leg_press", required: true, order: 1, plannedSets: [plannedSet(createId("set"), 10, 7), plannedSet(createId("set"), 10, 7)], restSeconds: 120, substitutionIds: ["ex_front_squat"] },
                { id: createId("planned"), exerciseId: "ex_machine_chest_press", required: true, order: 2, plannedSets: [plannedSet(createId("set"), 10, 7), plannedSet(createId("set"), 10, 7)], restSeconds: 90, substitutionIds: ["ex_db_incline_press"] },
                { id: createId("planned"), exerciseId: "ex_lat_pulldown", required: true, order: 3, plannedSets: [plannedSet(createId("set"), 12, 7), plannedSet(createId("set"), 12, 7)], restSeconds: 90, substitutionIds: ["ex_pull_up"] },
                { id: createId("planned"), exerciseId: "ex_treadmill_walk", required: false, order: 4, plannedSets: [{ id: createId("set"), kind: "conditioning", targetReps: 20, notes: "20 minutes zone 2" }], restSeconds: 30, substitutionIds: [] }
              ]
            : [
                { id: createId("planned"), exerciseId: "ex_squat_comp", required: true, order: 1, plannedSets: [plannedSet(createId("set"), 5, 7, 315), plannedSet(createId("set"), 5, 7, 315), plannedSet(createId("set"), 5, 7, 315), plannedSet(createId("set"), 5, 7, 315)], restSeconds: 240, notes: "Competition stance. Last set can float to RPE 8.", substitutionIds: ["ex_front_squat"] },
                { id: createId("planned"), exerciseId: "ex_bench_comp", required: true, order: 2, plannedSets: [plannedSet(createId("set"), 6, 7, 225), plannedSet(createId("set"), 6, 7, 225), plannedSet(createId("set"), 6, 7, 225), plannedSet(createId("set"), 6, 7, 225)], restSeconds: 180, substitutionIds: ["ex_close_grip_bench", "ex_db_incline_press"] },
                { id: createId("planned"), exerciseId: "ex_rdl", required: true, order: 3, plannedSets: [plannedSet(createId("set"), 8, 7, 245), plannedSet(createId("set"), 8, 7, 245), plannedSet(createId("set"), 8, 7, 245)], restSeconds: 150, substitutionIds: ["ex_lying_leg_curl"] },
                { id: createId("planned"), exerciseId: "ex_cable_lateral_raise", required: false, order: 4, plannedSets: [plannedSet(createId("set"), 15, 8, 20), plannedSet(createId("set"), 15, 8, 20), plannedSet(createId("set"), 15, 8, 20)], restSeconds: 60, substitutionIds: ["ex_db_lateral_raise"] }
              ]
      }
    ]
  };
}

function sampleSession(userId: string, gymId: string, templateId: string): WorkoutSession {
  return {
    id: createId("session"),
    userId,
    gymId,
    templateId,
    name: "Squat + Bench Volume",
    status: "completed",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4 + 1000 * 60 * 78).toISOString(),
    recommendations: [],
    loggedExercises: [
      {
        id: createId("logex"),
        exerciseId: "ex_squat_comp",
        order: 1,
        weakPointTags: ["slow-out-of-hole"],
        sets: [
          { id: createId("set"), kind: "working", actualWeight: 315, plannedWeight: 315, plannedReps: 5, actualReps: 5, targetRpe: 7, actualRpe: 7, setRating: "Good", formRating: 4, muscleFeelRating: 3, painRating: 0, completedAt: nowIso() },
          { id: createId("set"), kind: "working", actualWeight: 315, plannedWeight: 315, plannedReps: 5, actualReps: 5, targetRpe: 7, actualRpe: 8, setRating: "Hard", formRating: 3, muscleFeelRating: 3, painRating: 1, completedAt: nowIso(), notes: "Slow out of hole on set 2." }
        ]
      },
      {
        id: createId("logex"),
        exerciseId: "ex_bench_comp",
        order: 2,
        weakPointTags: ["weak-off-chest"],
        sets: [
          { id: createId("set"), kind: "working", actualWeight: 225, plannedWeight: 225, plannedReps: 6, actualReps: 6, targetRpe: 7, actualRpe: 7, setRating: "Good", formRating: 4, muscleFeelRating: 4, painRating: 0, completedAt: nowIso() },
          { id: createId("set"), kind: "working", actualWeight: 225, plannedWeight: 225, plannedReps: 6, actualReps: 5, targetRpe: 7, actualRpe: 9, setRating: "Hard", formRating: 3, muscleFeelRating: 3, painRating: 0, completedAt: nowIso(), notes: "Bench was slow off chest." }
        ]
      }
    ]
  };
}

function makeGyms(userId: string): Gym[] {
  return [
    {
      id: `${userId}_gym_planet`,
      userId,
      name: "Planet Fitness",
      unavailableEquipment: ["barbell"],
      notes: "Use machines and cables. Cable stacks vary by station.",
      equipment: [
        { id: createId("eq"), name: "Dumbbells up to 75", category: "dumbbell" },
        { id: createId("eq"), name: "Smith Machine", category: "machine" },
        { id: createId("eq"), name: "Dual Cable Station", category: "cable" }
      ],
      machines: [
        { id: `${userId}_machine_pf_cable_1`, name: "Cable Station #1", category: "cable", exerciseIds: ["ex_cable_lateral_raise", "ex_cable_row", "ex_cable_curl", "ex_cable_triceps_pressdown"], stackMax: 75, stackIncrement: 5, feels: "lighter", referenceWeights: [{ displayed: 20, perceivedEquivalent: 15 }, { displayed: 50, perceivedEquivalent: 42 }], notes: "Lighter than commercial gym cables." },
        { id: `${userId}_machine_pf_row`, name: "Selectorized Row", category: "selectorized", exerciseIds: ["ex_cable_row", "ex_chest_supported_row"], stackMax: 250, stackIncrement: 10, feels: "normal" }
      ],
      substitutions: [{ id: createId("sub"), exerciseId: "ex_bench_comp", substituteExerciseId: "ex_machine_chest_press", reason: "No free barbells." }],
      exerciseAdjustments: [
        {
          id: createId("adj"),
          userId,
          gymId: `${userId}_gym_planet`,
          exerciseId: "ex_machine_chest_press",
          machineId: `${userId}_machine_pf_cable_1`,
          factor: 0.85,
          source: "manual",
          sampleSize: 2,
          baselineGymId: `${userId}_gym_commercial`,
          notes: "Planet Fitness pressing machines run lighter by feel and history.",
          updatedAt: nowIso()
        }
      ]
    },
    {
      id: `${userId}_gym_commercial`,
      userId,
      name: "Commercial Gym",
      unavailableEquipment: [],
      notes: "Primary powerlifting and bodybuilding gym.",
      equipment: [
        { id: createId("eq"), name: "Power racks", category: "barbell" },
        { id: createId("eq"), name: "Competition bench", category: "barbell" },
        { id: createId("eq"), name: "Cable stacks", category: "cable" },
        { id: createId("eq"), name: "Plate loaded machines", category: "machine" }
      ],
      machines: [
        { id: `${userId}_machine_com_cable_1`, name: "Cable Stack #1", category: "cable", exerciseIds: ["ex_cable_lateral_raise", "ex_cable_row", "ex_cable_curl", "ex_cable_triceps_pressdown"], stackMax: 200, stackIncrement: 10, feels: "heavier", referenceWeights: [{ displayed: 20, perceivedEquivalent: 25 }, { displayed: 80, perceivedEquivalent: 92 }], notes: "Heavier stack, good for rows." },
        { id: `${userId}_machine_leg_press`, name: "45 Degree Leg Press", category: "plate-loaded", exerciseIds: ["ex_leg_press"], feels: "normal", notes: "Track plates plus sled as displayed load." }
      ],
      substitutions: [],
      exerciseAdjustments: []
    }
  ];
}

function makeUser(id: string, username: string, displayName: string, goal: TrainingGoal, pinHash: string): UserProfile {
  return {
    id,
    username,
    displayName,
    pinHash,
    createdAt: nowIso(),
    goal,
    experience: goal === "general-health" ? "beginner" : "advanced",
    unit: "lb",
    availableDaysPerWeek: goal === "general-health" ? 3 : 5,
    preferredWorkoutDurationMin: goal === "general-health" ? 45 : 85,
    trainingPreferences:
      goal === "general-health"
        ? ["simple full-body sessions", "machines welcome", "low intimidation"]
        : ["bench 3x/week", "powerbuilding accessories", "use RPE", "track machine differences"],
    injuryNotes: goal === "general-health" ? [] : ["Watch left hip when squat volume climbs."],
    activeGymId: `${id}_gym_commercial`,
    maxes:
      goal === "general-health"
        ? [
            { id: createId("max"), liftName: "Leg Press", oneRepMax: 220, trainingMax: 190, unit: "lb", date: todayIso(), source: "manual" },
            { id: createId("max"), liftName: "Machine Chest Press", oneRepMax: 100, trainingMax: 85, unit: "lb", date: todayIso(), source: "manual" }
          ]
        : [
            { id: createId("max"), liftName: "Squat", exerciseId: "ex_squat_comp", oneRepMax: 455, trainingMax: 410, unit: "lb", date: todayIso(), source: "manual" },
            { id: createId("max"), liftName: "Bench", exerciseId: "ex_bench_comp", oneRepMax: 315, trainingMax: 285, unit: "lb", date: todayIso(), source: "manual" },
            { id: createId("max"), liftName: "Deadlift", exerciseId: "ex_deadlift_comp", oneRepMax: 545, trainingMax: 490, unit: "lb", date: todayIso(), source: "manual" },
            { id: createId("max"), liftName: "Overhead Press", exerciseId: "ex_ohp", oneRepMax: 205, trainingMax: 185, unit: "lb", date: todayIso(), source: "manual" }
          ],
    bodyweightHistory: [
      { id: createId("bw"), date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10), weight: goal === "general-health" ? 135 : 202, unit: "lb" },
      { id: createId("bw"), date: todayIso(), weight: goal === "general-health" ? 136 : 204, unit: "lb" }
    ],
    settings: {
      darkMode: true,
      conservativeAutoAdjustments: true,
      showCoachingExplanations: true,
      defaultRestSeconds: goal === "general-health" ? 90 : 150,
      fatigueSensitivity: "medium"
    }
  };
}

export async function seedDatabase(): Promise<TrainingDatabase> {
  const nathanHash = await hashPin("2468");
  const avaHash = await hashPin("1357");
  const userPower = makeUser("user_nathan", "nathan", "Nathan", "powerbuilding", nathanHash);
  const userHealth = makeUser("user_ava", "ava", "Ava", "general-health", avaHash);
  const powerTemplate = makeTemplate(userPower.id, "Powerbuilding Base Week", "powerbuilding");
  const healthTemplate = makeTemplate(userHealth.id, "General Health Starter", "general-health");
  const readiness: ReadinessCheckIn[] = [
    {
      id: createId("readiness"),
      userId: userPower.id,
      date: todayIso(),
      sleepQuality: 3,
      stress: 3,
      soreness: 2,
      motivation: 4,
      energy: 4,
      jointPain: 1,
      bodyweight: 204,
      nutritionQuality: 4,
      caffeine: true,
      timeOfDay: "evening",
      readinessScore: 74
    }
  ];

  const session = sampleSession(userPower.id, `${userPower.id}_gym_commercial`, powerTemplate.id);

  return {
    version: 1,
    users: [userPower, userHealth],
    currentUserId: undefined,
    gyms: [...makeGyms(userPower.id), ...makeGyms(userHealth.id)],
    exercises: builtInExercises,
    splitTemplates,
    workoutTemplates: [powerTemplate, healthTemplate],
    programs: [],
    sessions: [session],
    readiness,
    prs: [],
    weakPoints: [
      {
        id: createId("weak"),
        userId: userPower.id,
        type: "powerlifting",
        label: "Bench weak off chest",
        relatedLift: "Bench",
        relatedMuscles: ["chest", "front-delts"],
        evidence: ["Session note: bench was slow off chest.", "Top volume work reached RPE 9 one set early."],
        recommendedExerciseIds: ["ex_bench_comp", "ex_db_incline_press"],
        severity: 3,
        status: "active",
        updatedAt: nowIso()
      },
      {
        id: createId("weak"),
        userId: userPower.id,
        type: "bodybuilding",
        label: "Side delts need more direct volume",
        relatedMuscles: ["side-delts"],
        evidence: ["Only 3 direct sets logged this week."],
        recommendedExerciseIds: ["ex_cable_lateral_raise", "ex_db_lateral_raise"],
        severity: 2,
        status: "watching",
        updatedAt: nowIso()
      }
    ],
    programGaps: [],
    recommendations: []
  };
}

export { builtInExercises, splitTemplates };
