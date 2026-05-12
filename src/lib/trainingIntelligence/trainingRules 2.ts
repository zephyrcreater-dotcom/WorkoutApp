import type { BlockType, Exercise, MuscleGroup, TrainingGoal } from "../../types/domain";

export type IntelligenceGoalType =
  | "powerlifting"
  | "powerbuilding"
  | "bodybuilding"
  | "hypertrophy"
  | "strength"
  | "general-fitness"
  | "maintenance"
  | "conditioning"
  | "custom";

export type IntelligenceBlockType =
  | "accumulation"
  | "intensification"
  | "peaking"
  | "deload"
  | "hypertrophy"
  | "strength"
  | "maintenance"
  | "conditioning"
  | "pivot"
  | "custom";

export type ExerciseBias = "main_lift" | "compound" | "machine" | "isolation" | "general";
export type ProgressionStyle = "load_first" | "reps_first" | "volume_first" | "maintain" | "deload";
export type FatigueTolerance = "low" | "moderate" | "high";
export type Specificity = "low" | "moderate" | "high";

export interface RepRangeTarget {
  min: number;
  max: number;
}

export interface RpeRangeTarget {
  min: number;
  max: number;
}

export interface TrainingTargetProfile {
  mainLiftRepRange: RepRangeTarget;
  accessoryRepRange: RepRangeTarget;
  mainLiftRpeRange: RpeRangeTarget;
  accessoryRpeRange: RpeRangeTarget;
  defaultSetsPerExercise: number;
  weeklyHardSetRangeByMuscle: Partial<Record<MuscleGroup, RepRangeTarget>>;
  exerciseSelectionBias: ExerciseBias;
  progressionStyle: ProgressionStyle;
  fatigueTolerance: FatigueTolerance;
  specificity: Specificity;
  mainLiftExposure: "minimal" | "moderate" | "high";
  accessoryEmphasis: "low" | "moderate" | "high";
  deloadBehavior: "none" | "light" | "moderate" | "aggressive";
  peakingBehavior: "none" | "moderate" | "high";
}

const DEFAULT_WEEKLY_SETS: Partial<Record<MuscleGroup, RepRangeTarget>> = {
  chest: { min: 8, max: 14 },
  back: { min: 10, max: 16 },
  lats: { min: 8, max: 14 },
  "upper-back": { min: 6, max: 12 },
  quads: { min: 8, max: 14 },
  hamstrings: { min: 6, max: 12 },
  glutes: { min: 4, max: 10 },
  calves: { min: 6, max: 12 },
  biceps: { min: 6, max: 12 },
  triceps: { min: 6, max: 12 },
  "side-delts": { min: 6, max: 14 },
  "rear-delts": { min: 6, max: 14 },
  abs: { min: 4, max: 10 },
};

const LOW_VOLUME_SETS: Partial<Record<MuscleGroup, RepRangeTarget>> = Object.fromEntries(
  Object.entries(DEFAULT_WEEKLY_SETS).map(([muscle, range]) => [
    muscle,
    { min: Math.max(2, Math.round(range.min * 0.6)), max: Math.max(4, Math.round(range.max * 0.65)) },
  ])
) as Partial<Record<MuscleGroup, RepRangeTarget>>;

const HIGH_VOLUME_SETS: Partial<Record<MuscleGroup, RepRangeTarget>> = Object.fromEntries(
  Object.entries(DEFAULT_WEEKLY_SETS).map(([muscle, range]) => [
    muscle,
    { min: Math.round(range.min * 1.1), max: Math.round(range.max * 1.2) },
  ])
) as Partial<Record<MuscleGroup, RepRangeTarget>>;

const GOAL_BASE_RULES: Record<IntelligenceGoalType, TrainingTargetProfile> = {
  powerlifting: {
    mainLiftRepRange: { min: 2, max: 6 },
    accessoryRepRange: { min: 6, max: 12 },
    mainLiftRpeRange: { min: 6.5, max: 8.5 },
    accessoryRpeRange: { min: 7, max: 9 },
    defaultSetsPerExercise: 3,
    weeklyHardSetRangeByMuscle: DEFAULT_WEEKLY_SETS,
    exerciseSelectionBias: "main_lift",
    progressionStyle: "load_first",
    fatigueTolerance: "moderate",
    specificity: "high",
    mainLiftExposure: "high",
    accessoryEmphasis: "moderate",
    deloadBehavior: "light",
    peakingBehavior: "moderate",
  },
  powerbuilding: {
    mainLiftRepRange: { min: 3, max: 6 },
    accessoryRepRange: { min: 6, max: 15 },
    mainLiftRpeRange: { min: 6.5, max: 8.5 },
    accessoryRpeRange: { min: 7, max: 9 },
    defaultSetsPerExercise: 3,
    weeklyHardSetRangeByMuscle: DEFAULT_WEEKLY_SETS,
    exerciseSelectionBias: "compound",
    progressionStyle: "load_first",
    fatigueTolerance: "moderate",
    specificity: "moderate",
    mainLiftExposure: "high",
    accessoryEmphasis: "high",
    deloadBehavior: "light",
    peakingBehavior: "moderate",
  },
  bodybuilding: {
    mainLiftRepRange: { min: 5, max: 10 },
    accessoryRepRange: { min: 8, max: 20 },
    mainLiftRpeRange: { min: 7, max: 9 },
    accessoryRpeRange: { min: 7, max: 9.5 },
    defaultSetsPerExercise: 3,
    weeklyHardSetRangeByMuscle: HIGH_VOLUME_SETS,
    exerciseSelectionBias: "isolation",
    progressionStyle: "reps_first",
    fatigueTolerance: "moderate",
    specificity: "low",
    mainLiftExposure: "minimal",
    accessoryEmphasis: "high",
    deloadBehavior: "moderate",
    peakingBehavior: "none",
  },
  hypertrophy: {
    mainLiftRepRange: { min: 5, max: 10 },
    accessoryRepRange: { min: 8, max: 18 },
    mainLiftRpeRange: { min: 6.5, max: 8.5 },
    accessoryRpeRange: { min: 7, max: 9.5 },
    defaultSetsPerExercise: 3,
    weeklyHardSetRangeByMuscle: HIGH_VOLUME_SETS,
    exerciseSelectionBias: "compound",
    progressionStyle: "reps_first",
    fatigueTolerance: "moderate",
    specificity: "low",
    mainLiftExposure: "moderate",
    accessoryEmphasis: "high",
    deloadBehavior: "moderate",
    peakingBehavior: "none",
  },
  strength: {
    mainLiftRepRange: { min: 2, max: 5 },
    accessoryRepRange: { min: 5, max: 10 },
    mainLiftRpeRange: { min: 6.5, max: 8.5 },
    accessoryRpeRange: { min: 6.5, max: 8.5 },
    defaultSetsPerExercise: 3,
    weeklyHardSetRangeByMuscle: DEFAULT_WEEKLY_SETS,
    exerciseSelectionBias: "compound",
    progressionStyle: "load_first",
    fatigueTolerance: "moderate",
    specificity: "moderate",
    mainLiftExposure: "moderate",
    accessoryEmphasis: "moderate",
    deloadBehavior: "light",
    peakingBehavior: "moderate",
  },
  "general-fitness": {
    mainLiftRepRange: { min: 5, max: 8 },
    accessoryRepRange: { min: 8, max: 15 },
    mainLiftRpeRange: { min: 6, max: 8 },
    accessoryRpeRange: { min: 6.5, max: 8.5 },
    defaultSetsPerExercise: 2,
    weeklyHardSetRangeByMuscle: LOW_VOLUME_SETS,
    exerciseSelectionBias: "general",
    progressionStyle: "maintain",
    fatigueTolerance: "low",
    specificity: "low",
    mainLiftExposure: "minimal",
    accessoryEmphasis: "moderate",
    deloadBehavior: "light",
    peakingBehavior: "none",
  },
  maintenance: {
    mainLiftRepRange: { min: 3, max: 8 },
    accessoryRepRange: { min: 6, max: 15 },
    mainLiftRpeRange: { min: 6, max: 8 },
    accessoryRpeRange: { min: 6.5, max: 8.5 },
    defaultSetsPerExercise: 2,
    weeklyHardSetRangeByMuscle: LOW_VOLUME_SETS,
    exerciseSelectionBias: "general",
    progressionStyle: "maintain",
    fatigueTolerance: "low",
    specificity: "moderate",
    mainLiftExposure: "moderate",
    accessoryEmphasis: "low",
    deloadBehavior: "light",
    peakingBehavior: "none",
  },
  conditioning: {
    mainLiftRepRange: { min: 6, max: 10 },
    accessoryRepRange: { min: 10, max: 20 },
    mainLiftRpeRange: { min: 6, max: 7.5 },
    accessoryRpeRange: { min: 6.5, max: 8 },
    defaultSetsPerExercise: 2,
    weeklyHardSetRangeByMuscle: LOW_VOLUME_SETS,
    exerciseSelectionBias: "general",
    progressionStyle: "volume_first",
    fatigueTolerance: "low",
    specificity: "low",
    mainLiftExposure: "minimal",
    accessoryEmphasis: "moderate",
    deloadBehavior: "moderate",
    peakingBehavior: "none",
  },
  custom: {
    mainLiftRepRange: { min: 3, max: 8 },
    accessoryRepRange: { min: 6, max: 15 },
    mainLiftRpeRange: { min: 6.5, max: 8.5 },
    accessoryRpeRange: { min: 7, max: 9 },
    defaultSetsPerExercise: 3,
    weeklyHardSetRangeByMuscle: DEFAULT_WEEKLY_SETS,
    exerciseSelectionBias: "general",
    progressionStyle: "maintain",
    fatigueTolerance: "moderate",
    specificity: "moderate",
    mainLiftExposure: "moderate",
    accessoryEmphasis: "moderate",
    deloadBehavior: "light",
    peakingBehavior: "none",
  },
};

const BLOCK_OVERRIDES: Record<IntelligenceBlockType, Partial<TrainingTargetProfile>> = {
  accumulation: {
    mainLiftRepRange: { min: 3, max: 6 },
    accessoryRepRange: { min: 6, max: 12 },
    mainLiftRpeRange: { min: 6.5, max: 8 },
    accessoryRpeRange: { min: 7, max: 9 },
    progressionStyle: "volume_first",
    fatigueTolerance: "high",
    specificity: "moderate",
  },
  intensification: {
    mainLiftRepRange: { min: 1, max: 5 },
    accessoryRepRange: { min: 5, max: 10 },
    mainLiftRpeRange: { min: 7, max: 9 },
    accessoryRpeRange: { min: 7, max: 8.5 },
    progressionStyle: "load_first",
    fatigueTolerance: "moderate",
    specificity: "high",
  },
  peaking: {
    mainLiftRepRange: { min: 1, max: 3 },
    accessoryRepRange: { min: 4, max: 8 },
    mainLiftRpeRange: { min: 7.5, max: 9.5 },
    accessoryRpeRange: { min: 6.5, max: 8 },
    defaultSetsPerExercise: 2,
    weeklyHardSetRangeByMuscle: LOW_VOLUME_SETS,
    progressionStyle: "load_first",
    fatigueTolerance: "low",
    specificity: "high",
    mainLiftExposure: "high",
    accessoryEmphasis: "low",
    deloadBehavior: "light",
    peakingBehavior: "high",
  },
  deload: {
    mainLiftRepRange: { min: 3, max: 6 },
    accessoryRepRange: { min: 6, max: 12 },
    mainLiftRpeRange: { min: 5.5, max: 7 },
    accessoryRpeRange: { min: 6, max: 7.5 },
    defaultSetsPerExercise: 2,
    weeklyHardSetRangeByMuscle: LOW_VOLUME_SETS,
    progressionStyle: "deload",
    fatigueTolerance: "low",
    specificity: "moderate",
    accessoryEmphasis: "low",
    deloadBehavior: "aggressive",
    peakingBehavior: "none",
  },
  hypertrophy: {
    mainLiftRepRange: { min: 5, max: 10 },
    accessoryRepRange: { min: 8, max: 20 },
    mainLiftRpeRange: { min: 6.5, max: 8.5 },
    accessoryRpeRange: { min: 7, max: 9.5 },
    weeklyHardSetRangeByMuscle: HIGH_VOLUME_SETS,
    progressionStyle: "reps_first",
    specificity: "low",
  },
  strength: {
    mainLiftRepRange: { min: 2, max: 5 },
    accessoryRepRange: { min: 5, max: 10 },
    mainLiftRpeRange: { min: 7, max: 9 },
    accessoryRpeRange: { min: 6.5, max: 8.5 },
    progressionStyle: "load_first",
    specificity: "high",
  },
  maintenance: {
    defaultSetsPerExercise: 2,
    weeklyHardSetRangeByMuscle: LOW_VOLUME_SETS,
    progressionStyle: "maintain",
    fatigueTolerance: "low",
    specificity: "moderate",
    accessoryEmphasis: "low",
  },
  conditioning: {
    mainLiftRepRange: { min: 6, max: 12 },
    accessoryRepRange: { min: 10, max: 20 },
    mainLiftRpeRange: { min: 6, max: 7.5 },
    accessoryRpeRange: { min: 6.5, max: 8 },
    progressionStyle: "volume_first",
    fatigueTolerance: "low",
    specificity: "low",
  },
  pivot: {
    mainLiftRepRange: { min: 4, max: 8 },
    accessoryRepRange: { min: 8, max: 15 },
    mainLiftRpeRange: { min: 6, max: 7.5 },
    accessoryRpeRange: { min: 6.5, max: 8 },
    progressionStyle: "maintain",
    fatigueTolerance: "low",
    specificity: "low",
    accessoryEmphasis: "moderate",
  },
  custom: {},
};

export function getGoalUsed(
  programGoal: TrainingGoal,
  blockGoalOverride?: TrainingGoal,
  splitGoal?: TrainingGoal
): TrainingGoal {
  return blockGoalOverride ?? splitGoal ?? programGoal;
}

export function mapTrainingGoal(goal?: TrainingGoal): IntelligenceGoalType {
  switch (goal) {
    case "powerlifting":
    case "powerbuilding":
    case "bodybuilding":
    case "maintenance":
    case "conditioning":
      return goal;
    case "general-health":
      return "general-fitness";
    default:
      return "custom";
  }
}

export function mapBlockType(blockType?: BlockType): IntelligenceBlockType {
  switch (blockType) {
    case "accumulation":
    case "intensification":
    case "peaking":
    case "deload":
    case "hypertrophy":
    case "strength":
    case "maintenance":
    case "conditioning":
    case "pivot":
    case "custom":
      return blockType;
    default:
      return "custom";
  }
}

function mergeTargets(base: TrainingTargetProfile, override: Partial<TrainingTargetProfile>): TrainingTargetProfile {
  return {
    ...base,
    ...override,
    mainLiftRepRange: override.mainLiftRepRange ?? base.mainLiftRepRange,
    accessoryRepRange: override.accessoryRepRange ?? base.accessoryRepRange,
    mainLiftRpeRange: override.mainLiftRpeRange ?? base.mainLiftRpeRange,
    accessoryRpeRange: override.accessoryRpeRange ?? base.accessoryRpeRange,
    weeklyHardSetRangeByMuscle: override.weeklyHardSetRangeByMuscle ?? base.weeklyHardSetRangeByMuscle,
  };
}

export function getTrainingTargets(
  goalType?: TrainingGoal | IntelligenceGoalType,
  blockType?: BlockType | IntelligenceBlockType,
  exerciseCategory?: Exercise["exerciseCategory"] | "accessory" | "main_lift"
): TrainingTargetProfile & { selectedRepRange: RepRangeTarget; selectedRpeRange: RpeRangeTarget } {
  const mappedGoal = typeof goalType === "string" && goalType in GOAL_BASE_RULES
    ? (goalType as IntelligenceGoalType)
    : mapTrainingGoal(goalType as TrainingGoal | undefined);
  const mappedBlock = typeof blockType === "string" && blockType in BLOCK_OVERRIDES
    ? (blockType as IntelligenceBlockType)
    : mapBlockType(blockType as BlockType | undefined);
  const merged = mergeTargets(GOAL_BASE_RULES[mappedGoal], BLOCK_OVERRIDES[mappedBlock]);
  const useMainLiftRange =
    exerciseCategory === "sbd" ||
    exerciseCategory === "main_compound" ||
    exerciseCategory === "main_lift";

  return {
    ...merged,
    selectedRepRange: useMainLiftRange ? merged.mainLiftRepRange : merged.accessoryRepRange,
    selectedRpeRange: useMainLiftRange ? merged.mainLiftRpeRange : merged.accessoryRpeRange,
  };
}
