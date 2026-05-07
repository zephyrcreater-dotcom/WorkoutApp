export type ID = string;
export type UnitPreference = "lb" | "kg";
export type ExerciseUnit = UnitPreference | "bodyweight" | "assisted" | "distance" | "time" | "reps-only";
export type TrainingGoal =
  | "powerlifting"
  | "bodybuilding"
  | "powerbuilding"
  | "general-health"
  | "conditioning"
  | "maintenance";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "elite";
export type BlockType =
  | "accumulation"
  | "hypertrophy"
  | "strength"
  | "intensification"
  | "peaking"
  | "deload"
  | "pivot"
  | "maintenance"
  | "conditioning"
  | "custom";
export type DayFocus =
  | "strength"
  | "hypertrophy"
  | "technical"
  | "recovery"
  | "conditioning"
  | "hybrid";
export type MuscleGroup =
  | "chest"
  | "upper-chest"
  | "lower-chest"
  | "back"
  | "lats"
  | "upper-back"
  | "mid-back"
  | "traps"
  | "spinal-erectors"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "adductors"
  | "abductors"
  | "biceps"
  | "triceps"
  | "front-delts"
  | "side-delts"
  | "rear-delts"
  | "abs"
  | "obliques"
  | "forearms"
  | "full-body"
  | "conditioning";

// Algorithm-facing exercise classification fields
export type ExerciseCategoryLabel =
  | "sbd"
  | "main_compound"
  | "secondary_compound"
  | "machine_compound"
  | "isolation"
  | "bodyweight"
  | "conditioning";

export type FatigueLevel = "low" | "moderate" | "high" | "very_high";
export type MovementPattern =
  | "squat"
  | "hinge"
  | "horizontal-press"
  | "vertical-press"
  | "horizontal-pull"
  | "vertical-pull"
  | "single-leg"
  | "isolation"
  | "carry"
  | "brace"
  | "locomotion"
  | "mobility";
export type EquipmentCategory =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "bands"
  | "cardio"
  | "other";
export type ExerciseKind =
  | "competition-lift"
  | "variation"
  | "accessory"
  | "isolation"
  | "compound"
  | "conditioning"
  | "mobility";
export type TrackingMetric = "load" | "reps" | "distance" | "time" | "bodyweight";
export type SetKind =
  | "warmup"
  | "working"
  | "top"
  | "backoff"
  | "amrap"
  | "technique"
  | "drop"
  | "conditioning";
export type SetRating = 1 | 2 | 3 | 4 | 5;
export type SetPerformanceStatus = "underperformed" | "matched" | "overperformed" | "skipped" | "added";
export type RecommendationType =
  | "load-change"
  | "volume-change"
  | "deload"
  | "substitution"
  | "cue"
  | "block-adjustment"
  | "pain-warning";
export type ProgramGapSeverity = "low" | "medium" | "high";
export type CompoundRestrictionMode =
  | "normal"
  | "limited"
  | "avoid-heavy"
  | "avoid-barbell"
  | "machine-cable-only";
export type SplitLoopMode = "continuous" | "weekly-reset";
export type ProgramBuildMode = "manual" | "suggested";

export interface CompoundSettings {
  mode: CompoundRestrictionMode;
  avoidExerciseIds: ID[];
  avoidMovementPatterns: MovementPattern[];
  maxCompoundsPerWorkout: number;
  maxHeavyCompoundsPerWeek: number;
  maxLowBackFatigueMovementsPerWeek: number;
}

export interface UserProfile {
  id: ID;
  username: string;
  displayName: string;
  pinHash: string;
  createdAt: string;
  goal: TrainingGoal;
  experience: ExperienceLevel;
  unit: UnitPreference;
  availableDaysPerWeek: number;
  preferredWorkoutDurationMin: number;
  trainingPreferences: string[];
  injuryNotes: string[];
  activeGymId?: ID;
  activeProgramId?: ID;
  activeBlockId?: ID;
  meetDate?: string;
  goalDate?: string;
  maxes: LiftMax[];
  bodyweightHistory: BodyweightEntry[];
  settings: UserSettings;
}

export interface UserSettings {
  darkMode: boolean;
  conservativeAutoAdjustments: boolean;
  showCoachingExplanations: boolean;
  defaultRestSeconds: number;
  fatigueSensitivity: "low" | "medium" | "high";
}

export interface LiftMax {
  id: ID;
  liftName: string;
  exerciseId?: ID;
  oneRepMax: number;
  trainingMax?: number;
  unit: UnitPreference;
  date: string;
  source: "manual" | "estimated" | "meet" | "gym-pr";
}

export interface BodyweightEntry {
  id: ID;
  date: string;
  weight: number;
  unit: UnitPreference;
  note?: string;
}

export interface Gym {
  id: ID;
  userId: ID;
  name: string;
  equipment: Equipment[];
  unavailableEquipment: EquipmentCategory[];
  machines: MachineProfile[];
  substitutions: GymSubstitution[];
  exerciseAdjustments: GymExerciseAdjustment[];
  notes?: string;
}

export interface Equipment {
  id: ID;
  name: string;
  category: EquipmentCategory;
  notes?: string;
}

export interface MachineProfile {
  id: ID;
  name: string;
  category: "cable" | "plate-loaded" | "selectorized" | "smith" | "cardio" | "other";
  exerciseIds: ID[];
  stackMax?: number;
  stackIncrement?: number;
  referenceWeights?: { displayed: number; perceivedEquivalent: number }[];
  feels: "lighter" | "normal" | "heavier";
  notes?: string;
}

export interface GymSubstitution {
  id: ID;
  exerciseId: ID;
  substituteExerciseId: ID;
  reason: string;
}

export interface GymExerciseAdjustment {
  id: ID;
  userId: ID;
  gymId: ID;
  exerciseId: ID;
  machineId?: ID;
  factor: number;
  source: "learned" | "manual";
  sampleSize: number;
  baselineGymId?: ID;
  lastCalculatedFactor?: number;
  confidence?: number;
  userAccepted?: boolean;
  notes?: string;
  updatedAt: string;
}

export interface GymExerciseVariant {
  id: ID;
  gymId: ID;
  exerciseId: ID;
  gymExerciseVariantId?: ID;
  variantName: string;
  unit: ExerciseUnit;
  increment?: number;
  lastUsedWeight?: number;
  adjustmentFactor?: number;
  userOverrideFactor?: number;
  isEquivalentAcrossGyms: boolean;
  updatedAt: string;
}

export interface Exercise {
  id: ID;
  ownerUserId?: ID;
  name: string;
  description?: string;
  muscleGroup: MuscleGroup;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: EquipmentCategory[];
  movementPattern: MovementPattern;
  movementPatterns?: MovementPattern[];
  tags: TrainingGoal[];
  tagLabels?: string[];
  variants: ExerciseVariant[];
  substitutionIds: ID[];
  notes?: string;
  videoUrl?: string;
  setupCues: string[];
  trackByBodyweight: boolean;
  trackPerSide: boolean;
  category: EquipmentCategory;
  kind: ExerciseKind[];
  directVolumeMuscles: MuscleGroup[];
  indirectVolumeMuscles: MuscleGroup[];
  bestTrackedBy: TrackingMetric[];
  fatigueRating?: 1 | 2 | 3 | 4 | 5;
  isCompound?: boolean;
  defaultUnit?: ExerciseUnit;
  allowedUnits?: ExerciseUnit[];
  defaultIncrement?: number;
  customIncrement?: number;
  canBeGymSpecific?: boolean;
  isGymSpecificEnabled?: boolean;
  createdByUser?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Algorithm classification fields (V2 Iteration 1)
  exerciseCategory?: ExerciseCategoryLabel;
  isSBDMainLift?: boolean;
  systemicFatigue?: FatigueLevel;
  localFatigue?: FatigueLevel;
  repDropSensitivity?: FatigueLevel;
  failureTolerance?: "low" | "moderate" | "high";
  // Variation / grouping fields (V2 Iteration 1 — architecture prep)
  parentExerciseId?: ID;
  variationGroupId?: string;
  variationName?: string;
  isVariation?: boolean;
}

export interface ExerciseVariant {
  id: ID;
  name: string;
  parentExerciseId: ID;
  emphasis: string;
  setupCues: string[];
  substitutionIds: ID[];
}

export interface SplitTemplate {
  id: ID;
  ownerUserId?: ID;
  favoriteUserIds?: ID[];
  name: string;
  description?: string;
  goal: TrainingGoal;
  daysPerWeek: number;
  days: SplitDay[];
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SplitDayRequirement {
  id: ID;
  targetMuscle: MuscleGroup;
  movementPattern?: MovementPattern;
  requiredExerciseCount: number;
  priority: number;
  notes?: string;
}

export interface SplitDay {
  id: ID;
  name: string;
  focus: DayFocus;
  optionalTrainingFocus?: DayFocus;
  targetMuscles?: MuscleGroup[];
  muscleGroups: MuscleGroup[];
  optionalMovementPatterns?: MovementPattern[];
  mainLiftFocus?: string;
  movementPatterns: MovementPattern[];
  exerciseTargetCount: number;
  priorityMuscles: MuscleGroup[];
  priorityLifts: string[];
  weeklySetTargets: Partial<Record<MuscleGroup, number>>;
  requirements?: SplitDayRequirement[];
  notes?: string;
}

export interface Program {
  id: ID;
  userId: ID;
  name: string;
  goal: TrainingGoal;
  splitTemplateId?: ID;
  status: "draft" | "active" | "archived";
  buildMode?: ProgramBuildMode;
  acceptedAt?: string;
  blocks: TrainingBlock[];
  sourceProgramId?: ID;
  changeLog: ProgramChangeLogEntry[];
  createdAt: string;
  updatedAt: string;
  progressionRules: string[];
  deloadRules: string[];
}

export interface TrainingBlock {
  id: ID;
  name: string;
  splitTemplateId?: ID;
  blockType?: BlockType;
  goal?: TrainingGoal;
  numberOfWeeks?: number;
  status?: "draft" | "active" | "completed" | "archived";
  loopMode?: SplitLoopMode;
  type: BlockType;
  lengthWeeks: number;
  trainingDaysPerWeek: number;
  currentWeek: number;
  currentWeekIndex?: number;
  currentDayIndex?: number;
  currentWorkoutPointer?: ActiveWorkoutPointer;
  completedWorkoutDayIds?: ID[];
  skippedWorkoutDayIds?: ID[];
  activeWorkoutDayId?: ID;
  nextWorkoutDayId?: ID;
  startDate: string;
  goalDate?: string;
  meetDate?: string;
  targetRpeProgression: number[];
  volumeProgression: number[];
  deloadFrequencyWeeks?: number;
  splitLoopMode?: SplitLoopMode;
  compoundSettings?: CompoundSettings;
  mainLiftFrequency: Record<string, number>;
  priorityLifts: string[];
  priorityExerciseIds: ID[];
  priorityMuscles: MuscleGroup[];
  targetWeeklySets: Partial<Record<MuscleGroup, number>>;
  emphasis: TrainingGoal[];
  weeks: TrainingWeek[];
}

export interface ActiveWorkoutPointer {
  weekIndex: number;
  dayIndex: number;
  workoutDayId?: ID;
}

export interface TrainingWeek {
  id: ID;
  weekNumber: number;
  startDate: string;
  workouts: WorkoutDay[];
  plannedVolume: Partial<Record<MuscleGroup, number>>;
  notes?: string;
}

export interface WorkoutDay {
  id: ID;
  blockId?: ID;
  weekNumber?: number;
  dayIndex?: number;
  calendarDate?: string;
  splitDayId?: ID;
  name: string;
  scheduledDay?: string;
  focus: DayFocus;
  targetMuscles?: MuscleGroup[];
  movementPatterns?: MovementPattern[];
  status?: "planned" | "completed" | "skipped" | "rest";
  exercises: PlannedExercise[];
  notes?: string;
}

export interface ProgramChangeLogEntry {
  id: ID;
  at: string;
  label: string;
  detail: string;
}

export interface WorkoutTemplate {
  id: ID;
  userId: ID;
  name: string;
  goal: TrainingGoal;
  days: WorkoutDay[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannedExercise {
  id: ID;
  exerciseId: ID;
  supersetGroupId?: ID;
  required: boolean;
  order: number;
  plannedSets: PlannedSet[];
  restSeconds: number;
  notes?: string;
  substitutionIds: ID[];
  fulfillsRequirementId?: ID;
}

export interface PlannedSet {
  id: ID;
  kind: SetKind;
  setNumber?: number;
  targetReps: number;
  repRange?: { min: number; max: number };
  targetRpe?: number;
  targetRir?: number;
  percentOfOneRm?: number;
  percentageOfTopSet?: number;
  plannedWeight?: number;
  restSeconds?: number;
  notes?: string;
}

export interface WorkoutSession {
  id: ID;
  userId: ID;
  gymId?: ID;
  programId?: ID;
  blockId?: ID;
  templateId?: ID;
  workoutDayId?: ID;
  name: string;
  status: "planned" | "in-progress" | "completed" | "abandoned";
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
  weekNumber?: number;
  currentExerciseIndex?: number;
  currentSetIndex?: number;
  workoutScore?: number;
  workoutScoreStatus?: "poor" | "mixed" | "solid" | "excellent";
  progressionSuggestions?: string[];
  readiness?: ReadinessCheckIn;
  loggedExercises: LoggedExercise[];
  notes?: string;
  recommendations: Recommendation[];
}

export interface ExercisePerformanceLog {
  id: ID;
  exerciseId: ID;
  userId?: ID;
  sessionId?: ID;
  date: string;
  gymId?: ID;
  workoutDayId?: ID;
  blockId?: ID;
  blockWeek?: number;
  sets: number;
  reps: number;
  weight?: number;
  e1rm?: number;
  averageSetRating?: number;
  unit: ExerciseUnit;
  rpe?: number;
  rir?: number;
  notes?: string;
}

export interface LoggedExercise {
  id: ID;
  exerciseId: ID;
  machineId?: ID;
  plannedExerciseId?: ID;
  order: number;
  sets: LoggedSet[];
  notes?: string;
  weakPointTags: string[];
  offProgram?: boolean;
}

export interface LoggedSet {
  id: ID;
  plannedSetId?: ID;
  kind: SetKind;
  setNumber?: number;
  plannedWeight?: number;
  actualWeight: number;
  plannedReps?: number;
  actualReps: number;
  targetRpe?: number;
  actualRpe?: number;
  setRating: SetRating;
  formRating?: number;
  muscleFeelRating?: number;
  pumpRating?: number;
  painRating?: number;
  sorenessRating?: number;
  restSeconds?: number;
  skipped?: boolean;
  added?: boolean;
  performanceScore?: number;
  performanceStatus?: SetPerformanceStatus;
  completedAt: string;
  notes?: string;
}

export interface ReadinessCheckIn {
  id: ID;
  userId: ID;
  date: string;
  sleepQuality: number;
  stress: number;
  soreness: number;
  motivation: number;
  energy: number;
  jointPain: number;
  bodyweight?: number;
  nutritionQuality: number;
  caffeine: boolean;
  timeOfDay: string;
  limitations?: string;
  readinessScore: number;
}

export interface PR {
  id: ID;
  userId: ID;
  exerciseId: ID;
  gymId?: ID;
  machineId?: ID;
  date: string;
  type: "1rm" | "e1rm" | "rep-pr" | "volume" | "time" | "distance";
  value: number;
  reps?: number;
  unit?: UnitPreference;
  sessionId?: ID;
}

export interface WeakPoint {
  id: ID;
  userId: ID;
  type: "powerlifting" | "bodybuilding" | "recovery" | "technique";
  label: string;
  relatedLift?: string;
  relatedMuscles: MuscleGroup[];
  evidence: string[];
  recommendedExerciseIds: ID[];
  severity: 1 | 2 | 3 | 4 | 5;
  status: "watching" | "active" | "improving" | "resolved";
  updatedAt: string;
}

export interface ProgramGap {
  id: ID;
  type: "volume" | "frequency" | "balance" | "fatigue" | "movement-pattern" | "missing-category";
  issue: string;
  whyItMatters: string;
  severity: ProgramGapSeverity;
  suggestedFix: string;
  relatedMuscles: MuscleGroup[];
  relatedExerciseIds: ID[];
  action?: {
    kind: "add-exercise" | "swap-exercise" | "reduce-volume" | "move-exercise";
    dayId?: ID;
    exerciseId?: ID;
    swapOutExerciseId?: ID;
  };
}

export interface Recommendation {
  id: ID;
  userId: ID;
  type: RecommendationType;
  priority: "low" | "medium" | "high";
  title: string;
  explanation: string;
  action?: {
    exerciseId?: ID;
    setId?: ID;
    suggestedWeight?: number;
    suggestedReps?: number;
    suggestedRpe?: number;
    suggestedVolumeChange?: number;
    substituteExerciseId?: ID;
  };
  createdAt: string;
  accepted?: boolean;
}

export interface DashboardMetric {
  id: ID;
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
  context?: string;
}

export interface TrainingDatabase {
  version: number;
  users: UserProfile[];
  currentUserId?: ID;
  gyms: Gym[];
  exercises: Exercise[];
  splitTemplates: SplitTemplate[];
  workoutTemplates: WorkoutTemplate[];
  programs: Program[];
  sessions: WorkoutSession[];
  exercisePerformanceLogs?: ExercisePerformanceLog[];
  gymExerciseVariants?: GymExerciseVariant[];
  readiness: ReadinessCheckIn[];
  prs: PR[];
  weakPoints: WeakPoint[];
  programGaps?: ProgramGap[];
  recommendations: Recommendation[];
}
