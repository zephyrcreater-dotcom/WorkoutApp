import type {
  BlockType,
  CompoundSettings,
  DayFocus,
  Exercise,
  ExerciseRole,
  MovementPattern,
  MuscleGroup,
  PlannedSet,
  SplitDay,
  SplitLoopMode,
  TrainingGoal
} from "../types/domain";
import { getPrescriptionForExerciseSlot } from "./trainingIntelligence";

export const defaultCompoundSettings: CompoundSettings = {
  mode: "normal",
  avoidExerciseIds: [],
  avoidMovementPatterns: [],
  maxCompoundsPerWorkout: 3,
  maxHeavyCompoundsPerWeek: 6,
  maxLowBackFatigueMovementsPerWeek: 4
};

export const muscleVolumeTargets: Record<TrainingGoal, Partial<Record<MuscleGroup, { min: number; target: number; max: number }>>> = {
  powerlifting: {
    chest: { min: 6, target: 10, max: 16 },
    lats: { min: 4, target: 8, max: 14 },
    "upper-back": { min: 6, target: 10, max: 16 },
    quads: { min: 6, target: 10, max: 16 },
    hamstrings: { min: 4, target: 8, max: 14 },
    glutes: { min: 4, target: 8, max: 14 },
    triceps: { min: 4, target: 8, max: 14 },
    "rear-delts": { min: 3, target: 6, max: 12 }
  },
  bodybuilding: {
    chest: { min: 8, target: 12, max: 16 },
    back: { min: 10, target: 14, max: 18 },
    lats: { min: 6, target: 10, max: 12 },
    "upper-back": { min: 6, target: 10, max: 12 },
    quads: { min: 8, target: 12, max: 16 },
    hamstrings: { min: 6, target: 9, max: 12 },
    glutes: { min: 6, target: 10, max: 14 },
    calves: { min: 4, target: 6, max: 10 },
    biceps: { min: 6, target: 8, max: 12 },
    triceps: { min: 6, target: 8, max: 12 },
    "side-delts": { min: 6, target: 10, max: 14 },
    "rear-delts": { min: 6, target: 8, max: 14 },
    abs: { min: 4, target: 6, max: 10 }
  },
  powerbuilding: {
    chest: { min: 8, target: 10, max: 14 },
    lats: { min: 6, target: 8, max: 12 },
    "upper-back": { min: 6, target: 8, max: 12 },
    quads: { min: 8, target: 10, max: 14 },
    hamstrings: { min: 6, target: 8, max: 12 },
    glutes: { min: 4, target: 8, max: 12 },
    biceps: { min: 4, target: 6, max: 10 },
    triceps: { min: 6, target: 8, max: 12 },
    "side-delts": { min: 6, target: 8, max: 12 },
    "rear-delts": { min: 4, target: 8, max: 14 },
    calves: { min: 3, target: 5, max: 8 },
    abs: { min: 3, target: 5, max: 8 }
  },
  "general-health": {
    "full-body": { min: 6, target: 10, max: 14 },
    chest: { min: 3, target: 6, max: 10 },
    back: { min: 3, target: 6, max: 10 },
    quads: { min: 3, target: 6, max: 10 },
    hamstrings: { min: 2, target: 4, max: 8 },
    abs: { min: 2, target: 4, max: 8 },
    conditioning: { min: 1, target: 3, max: 5 }
  },
  conditioning: {
    conditioning: { min: 2, target: 4, max: 6 },
    "full-body": { min: 4, target: 8, max: 12 },
    quads: { min: 2, target: 4, max: 8 },
    hamstrings: { min: 2, target: 4, max: 8 },
    abs: { min: 2, target: 4, max: 8 }
  },
  maintenance: {
    "full-body": { min: 4, target: 8, max: 12 },
    chest: { min: 3, target: 5, max: 8 },
    back: { min: 3, target: 5, max: 8 },
    quads: { min: 3, target: 5, max: 8 },
    hamstrings: { min: 2, target: 4, max: 7 }
  }
};

const lowBackPatterns = new Set<MovementPattern>(["squat", "hinge", "carry"]);
const pressPatterns = new Set<MovementPattern>(["horizontal-press", "vertical-press"]);
const pullPatterns = new Set<MovementPattern>(["horizontal-pull", "vertical-pull"]);

export function isCompound(exercise: Exercise): boolean {
  return exercise.kind.includes("compound") || exercise.kind.includes("competition-lift") || exercise.kind.includes("variation");
}

export function isSbdExercise(exercise: Exercise): boolean {
  const name = exercise.name.toLowerCase();
  return exercise.kind.includes("competition-lift") && (name.includes("squat") || name.includes("bench") || name.includes("deadlift"));
}

export function fatigueRatingForExercise(exercise: Exercise): 1 | 2 | 3 | 4 | 5 {
  if (exercise.fatigueRating) return exercise.fatigueRating;
  if (exercise.kind.includes("competition-lift")) return 5;
  if (lowBackPatterns.has(exercise.movementPattern) && isCompound(exercise)) return 4;
  if (isCompound(exercise)) return 3;
  if (exercise.kind.includes("conditioning")) return 2;
  return 1;
}

export function isHeavyCompound(exercise: Exercise): boolean {
  return isCompound(exercise) && fatigueRatingForExercise(exercise) >= 4;
}

export function isLowBackFatigueExercise(exercise: Exercise): boolean {
  return lowBackPatterns.has(exercise.movementPattern) && fatigueRatingForExercise(exercise) >= 3;
}

export function exerciseAllowedByCompoundSettings(exercise: Exercise, settings: CompoundSettings = defaultCompoundSettings): boolean {
  if (settings.avoidExerciseIds.includes(exercise.id)) return false;
  if (settings.avoidMovementPatterns.includes(exercise.movementPattern)) return false;
  if (!isSbdExercise(exercise)) return true;
  if (settings.mode === "avoid-barbell" && exercise.category === "barbell") return false;
  if (settings.mode === "machine-cable-only") return false;
  if (settings.mode === "avoid-heavy" && isHeavyCompound(exercise)) return false;
  return true;
}

export function getExercisePrescription(params: {
  exercise: Exercise;
  goal: TrainingGoal;
  blockType: BlockType;
  order: number;
  isPriority: boolean;
  exerciseRole?: ExerciseRole;
  dayFocus?: DayFocus;
  requirementSlotIndex?: number;
  totalRequiredForMuscle?: number;
}): { sets: number; reps: number; rpe: number; restSeconds: number; required: boolean; note: string } {
  const role = params.exerciseRole
    ?? (params.exercise.isSBDMainLift || params.isPriority || params.order === 1 ? "main_lift" : params.exercise.kind.includes("isolation") ? "isolation" : "secondary_compound");
  const prescription = getPrescriptionForExerciseSlot({
    goalType: params.goal,
    blockType: params.blockType,
    dayFocus: params.dayFocus || "hypertrophy",
    exercise: params.exercise,
    exerciseRole: role,
    requirementSlotIndex: params.requirementSlotIndex ?? Math.max(0, params.order - 1),
    totalRequiredForMuscle: params.totalRequiredForMuscle ?? 1,
    isPriority: params.isPriority,
  });
  return {
    sets: prescription.sets,
    reps: prescription.reps,
    rpe: prescription.targetRpe,
    restSeconds: prescription.restSeconds,
    required: prescription.required,
    note: `Role-based prescription: ${prescription.role.replaceAll("_", " ")} (${prescription.prescriptionReasonCode}).`
  };
}

export function buildSplitSchedule(splitDays: SplitDay[], trainingDaysPerWeek: number, weekIndex: number, loopMode: SplitLoopMode): SplitDay[] {
  if (!splitDays.length) return [];
  const offset = loopMode === "continuous" ? weekIndex * trainingDaysPerWeek : 0;
  return Array.from({ length: trainingDaysPerWeek }, (_, dayIndex) => splitDays[(offset + dayIndex) % splitDays.length]);
}

export function sessionFatigueScore(exercises: Exercise[]): number {
  return exercises.reduce((sum, exercise) => sum + fatigueRatingForExercise(exercise), 0);
}

export function movementBalanceScore(exercises: Exercise[]): { pressing: number; pulling: number; lower: number } {
  return exercises.reduce(
    (totals, exercise) => {
      if (pressPatterns.has(exercise.movementPattern)) totals.pressing += 1;
      if (pullPatterns.has(exercise.movementPattern)) totals.pulling += 1;
      if (lowBackPatterns.has(exercise.movementPattern)) totals.lower += 1;
      return totals;
    },
    { pressing: 0, pulling: 0, lower: 0 }
  );
}

export function weeklyProgressionSetNote(weekNumber: number, blockLengthWeeks: number): string {
  if (weekNumber === blockLengthWeeks && blockLengthWeeks >= 4) return "Deload/recovery week: reduce volume 30-50% and cap most work around RPE 6-7.";
  if (weekNumber >= Math.max(1, blockLengthWeeks - 1)) return "Late block: increase specificity and RPE only if performance is stable.";
  return "Progress by adding small load, reps, or one set when RPE and recovery allow.";
}

export function clonePlannedSetWithProgression(set: PlannedSet, weekNumber: number, blockLengthWeeks: number): PlannedSet {
  const deload = weekNumber === blockLengthWeeks && blockLengthWeeks >= 4;
  return {
    ...set,
    targetRpe: Math.max(6, Math.min(9, (set.targetRpe || 7) + (deload ? -1 : (weekNumber - 1) * 0.25))),
    notes: weeklyProgressionSetNote(weekNumber, blockLengthWeeks)
  };
}

export function getBlockExercisePrescription(params: {
  exercise: Exercise;
  goal: TrainingGoal;
  blockType: BlockType;
  weekNumber: number;
  blockLengthWeeks: number;
  order: number;
  isPriority: boolean;
  dayFocus?: DayFocus;
  exerciseRole?: ExerciseRole;
  requirementSlotIndex?: number;
  totalRequiredForMuscle?: number;
}): { plannedSets: PlannedSet[]; restSeconds: number; required: boolean; note: string } {
  const { weekNumber, blockLengthWeeks } = params;
  const role = params.exerciseRole
    ?? (params.exercise.isSBDMainLift || params.isPriority || params.order === 1 ? "main_lift" : params.exercise.kind.includes("isolation") ? "isolation" : "secondary_compound");
  const prescription = getPrescriptionForExerciseSlot({
    goalType: params.goal,
    blockType: params.blockType,
    dayFocus: params.dayFocus || "hypertrophy",
    exercise: params.exercise,
    exerciseRole: role,
    requirementSlotIndex: params.requirementSlotIndex ?? Math.max(0, params.order - 1),
    totalRequiredForMuscle: params.totalRequiredForMuscle ?? 1,
    weekNumber: params.weekNumber,
    blockLengthWeeks: params.blockLengthWeeks,
    isPriority: params.isPriority,
  });
  const plannedSets = Array.from({ length: Math.max(1, prescription.sets) }, (_, index) => ({
    id: `placeholder_${index + 1}`,
    kind: (index === 0 && (role === "main_lift" || params.isPriority) ? "top" : "working") as PlannedSet["kind"],
    setNumber: index + 1,
    targetReps: prescription.reps,
    repRange: prescription.repRange,
    targetRpe: prescription.targetRpe,
    targetRir: Math.max(0, Math.round(10 - prescription.targetRpe)),
    percentageOfTopSet: index > 0 && role === "main_lift" ? 0.9 : undefined,
    notes: weeklyProgressionSetNote(weekNumber, blockLengthWeeks)
  }));
  return {
    plannedSets,
    restSeconds: prescription.restSeconds,
    required: prescription.required,
    note: `Role-based prescription: ${prescription.role.replaceAll("_", " ")} (${prescription.prescriptionReasonCode}).`
  };
}
