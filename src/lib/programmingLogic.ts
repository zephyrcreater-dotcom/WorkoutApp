import type {
  BlockType,
  CompoundSettings,
  Exercise,
  MovementPattern,
  MuscleGroup,
  PlannedSet,
  SplitDay,
  SplitLoopMode,
  TrainingGoal
} from "../types/domain";

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
    chest: { min: 8, target: 12, max: 20 },
    lats: { min: 6, target: 10, max: 20 },
    "upper-back": { min: 6, target: 10, max: 20 },
    quads: { min: 8, target: 12, max: 20 },
    hamstrings: { min: 6, target: 10, max: 18 },
    glutes: { min: 4, target: 8, max: 16 },
    calves: { min: 4, target: 8, max: 16 },
    biceps: { min: 6, target: 10, max: 18 },
    triceps: { min: 6, target: 10, max: 18 },
    "side-delts": { min: 6, target: 12, max: 22 },
    "rear-delts": { min: 4, target: 8, max: 16 },
    abs: { min: 4, target: 8, max: 14 }
  },
  powerbuilding: {
    chest: { min: 8, target: 12, max: 18 },
    lats: { min: 6, target: 10, max: 18 },
    "upper-back": { min: 6, target: 10, max: 18 },
    quads: { min: 8, target: 12, max: 18 },
    hamstrings: { min: 6, target: 10, max: 16 },
    glutes: { min: 4, target: 8, max: 16 },
    biceps: { min: 4, target: 8, max: 16 },
    triceps: { min: 6, target: 10, max: 16 },
    "side-delts": { min: 6, target: 10, max: 18 },
    "rear-delts": { min: 4, target: 8, max: 14 },
    calves: { min: 3, target: 6, max: 12 },
    abs: { min: 3, target: 6, max: 12 }
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
    chest: { min: 3, target: 6, max: 10 },
    back: { min: 3, target: 6, max: 10 },
    quads: { min: 3, target: 6, max: 10 },
    hamstrings: { min: 2, target: 4, max: 8 }
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
}): { sets: number; reps: number; rpe: number; restSeconds: number; required: boolean; note: string } {
  const { exercise, goal, blockType, order, isPriority } = params;
  const compound = isCompound(exercise);
  const mainLift = exercise.kind.includes("competition-lift") || isPriority || order === 1;
  const isolation = exercise.kind.includes("isolation");
  const conditioning = exercise.kind.includes("conditioning") || exercise.bestTrackedBy.includes("time");
  const strengthish = goal === "powerlifting" || blockType === "strength" || blockType === "intensification" || blockType === "peaking";

  if (conditioning) {
    return { sets: 1, reps: 20, rpe: 6, restSeconds: 45, required: false, note: "Conditioning target is tracked as time or distance when available." };
  }
  if (strengthish && mainLift) {
    const peaking = blockType === "peaking";
    return {
      sets: peaking ? 3 : 4,
      reps: peaking ? 3 : 5,
      rpe: peaking ? 8 : 7.5,
      restSeconds: 180,
      required: true,
      note: "Strength main lift: mostly 1-6 reps with RPE held below true maxes until testing or peaking."
    };
  }
  if (strengthish && compound) {
    return { sets: 3, reps: 6, rpe: 7, restSeconds: 150, required: true, note: "Secondary compound: moderate load, enough practice without burying recovery." };
  }
  if (goal === "general-health") {
    return { sets: compound ? 2 : 2, reps: compound ? 10 : 12, rpe: 6.5, restSeconds: compound ? 105 : 60, required: order <= 3, note: "General health default: moderate effort, balanced movement, lower fatigue." };
  }
  if (compound) {
    return { sets: mainLift ? 4 : 3, reps: mainLift ? 8 : 10, rpe: 7.5, restSeconds: 120, required: mainLift, note: "Hypertrophy compound: 6-12 reps with 1-3 reps in reserve." };
  }
  return {
    sets: isolation ? 3 : 2,
    reps: isolation ? 15 : 12,
    rpe: isolation ? 8 : 7.5,
    restSeconds: isolation ? 60 : 90,
    required: false,
    note: "Hypertrophy accessory: 10-30 reps, close enough to failure for stimulus while preserving joints."
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
}): { plannedSets: PlannedSet[]; restSeconds: number; required: boolean; note: string } {
  const { exercise, goal, blockType, weekNumber, blockLengthWeeks, order, isPriority } = params;
  const sbd = isSbdExercise(exercise);
  const compound = isCompound(exercise);
  const machineOrCable = exercise.category === "machine" || exercise.category === "cable";
  const isolation = exercise.kind.includes("isolation") || exercise.movementPattern === "isolation";
  const weekBuild = weekNumber <= 1 ? -0.25 : weekNumber >= blockLengthWeeks && blockLengthWeeks >= 4 ? -1 : Math.min(0.75, (weekNumber - 1) * 0.25);

  let sets = 3;
  let reps = 10;
  let rpe = 7.5 + weekBuild;
  let restSeconds = 90;
  let required = order <= 3;
  let note = "Starter prescription. Session 2 will expand this into more adaptive block logic.";

  if (goal === "general-health") {
    sets = 2;
    reps = compound ? 10 : 12;
    rpe = 6.5 + Math.max(0, weekBuild);
    restSeconds = compound ? 105 : 60;
    note = "General health placeholder: moderate effort, simple progression, low friction.";
  } else if (goal === "powerlifting" || goal === "powerbuilding") {
    if (sbd || isPriority) {
      sets = blockType === "peaking" ? 3 : blockType === "accumulation" || blockType === "hypertrophy" ? 4 : 3;
      reps = blockType === "peaking" ? 2 : blockType === "intensification" || blockType === "strength" ? 4 : 5;
      rpe = (blockType === "peaking" ? 8 : blockType === "deload" ? 6 : 7.25) + weekBuild;
      restSeconds = 180;
      required = true;
      note = "SBD/main lift placeholder: lower reps, clear RPE target, future top/backdown logic ready.";
    } else if (compound) {
      sets = blockType === "deload" ? 2 : 3;
      reps = machineOrCable ? 10 : 6;
      rpe = (blockType === "deload" ? 6 : 7) + weekBuild;
      restSeconds = 120;
      note = "Secondary compound placeholder: useful work without taking over SBD fatigue.";
    } else {
      sets = blockType === "deload" ? 2 : 3;
      reps = isolation ? 15 : 12;
      rpe = (blockType === "deload" ? 6 : 7.5) + Math.max(0, weekBuild);
      restSeconds = 60;
      note = "Accessory placeholder: hypertrophy support with editable sets, reps, and RPE.";
    }
  } else if (goal === "bodybuilding") {
    sets = blockType === "deload" ? 2 : isolation ? 3 : 3;
    reps = isolation ? 15 : machineOrCable ? 12 : 8;
    rpe = (blockType === "deload" ? 6 : blockType === "intensification" ? 8 : 7.5) + Math.max(0, weekBuild);
    restSeconds = compound ? 105 : 60;
    note = "Hypertrophy placeholder: enough volume to guide setup, still fully editable.";
  } else if (blockType === "conditioning") {
    sets = 1;
    reps = 20;
    rpe = 6;
    restSeconds = 45;
    required = false;
    note = "Conditioning placeholder: time/distance handling will mature in Session 2.";
  }

  if (blockType === "accumulation") sets += compound ? 1 : 0;
  if (blockType === "intensification") reps = Math.max(4, reps - 2);
  if (blockType === "deload") {
    sets = Math.max(1, sets - 1);
    rpe = Math.min(rpe, 6.5);
  }

  const normalizedRpe = Math.max(6, Math.min(9, Math.round(rpe * 2) / 2));
  const plannedSets = Array.from({ length: Math.max(1, sets) }, (_, index) => ({
    id: `placeholder_${index + 1}`,
    kind: (index === 0 && (sbd || isPriority) ? "top" : "working") as PlannedSet["kind"],
    setNumber: index + 1,
    targetReps: reps,
    repRange: { min: Math.max(1, reps - 2), max: reps + 2 },
    targetRpe: normalizedRpe,
    targetRir: Math.max(0, Math.round(10 - normalizedRpe)),
    percentageOfTopSet: index > 0 && (sbd || isPriority) ? 0.9 : undefined,
    notes: weeklyProgressionSetNote(weekNumber, blockLengthWeeks)
  }));

  return { plannedSets, restSeconds, required, note };
}
