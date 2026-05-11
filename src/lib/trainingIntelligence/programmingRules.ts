import type {
  BlockType,
  DayFocus,
  Exercise,
  ExerciseFatigueTag,
  ExerciseRole,
  FatigueLevel,
  MovementPattern,
  MuscleGroup,
  TrainingGoal,
} from "../../types/domain";
import { getTrainingTargets } from "./trainingRules";

export interface RequirementSlotPlan {
  role: ExerciseRole;
  preferredPatterns: MovementPattern[];
  preferredCategories: NonNullable<Exercise["exerciseCategory"]>[];
  preferredFatigue: ExerciseFatigueTag;
  allowHighFatigue: boolean;
}

export interface DayFatigueBudget {
  sbdMainFatigue: number;
  lowBackFatigue: number;
  pressingFatigue: number;
  hingeFatigue: number;
  axialFatigue: number;
  localIsolationFatigue: number;
}

export interface ExerciseSlotPrescription {
  sets: number;
  reps: number;
  targetRpe: number;
  repRange: { min: number; max: number };
  rpeRange: { min: number; max: number };
  restSeconds: number;
  required: boolean;
  role: ExerciseRole;
  fatigueTag: ExerciseFatigueTag;
  prescriptionReasonCode: string;
}

export interface PrescriptionInput {
  goalType: TrainingGoal;
  blockType: BlockType;
  dayFocus: DayFocus;
  exercise: Exercise;
  exerciseRole: ExerciseRole;
  requirementSlotIndex: number;
  totalRequiredForMuscle: number;
  weekNumber?: number;
  blockLengthWeeks?: number;
  isPriority?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface WeekProgressionModifier {
  rpeAdjust: number;
  repsAdjust: number;
  setsAdjust: number;
}

export function getWeekProgressionModifier(input: {
  goalType: TrainingGoal;
  blockType: BlockType;
  weekIndex: number;
  totalWeeks: number;
  exerciseRole: ExerciseRole;
  fatigueTag: ExerciseFatigueTag;
}): WeekProgressionModifier {
  const { goalType, blockType, weekIndex, totalWeeks, exerciseRole, fatigueTag } = input;
  const isMain = exerciseRole === "main_lift" || exerciseRole === "primary_compound";
  const isDeload = blockType === "deload";
  const isPeaking = blockType === "peaking";
  const isVolume = blockType === "accumulation" || blockType === "hypertrophy";
  const isLastWeek = weekIndex >= totalWeeks - 1;
  const progression = totalWeeks > 1 ? weekIndex / (totalWeeks - 1) : 0;

  if (isDeload) return { rpeAdjust: -1, repsAdjust: 0, setsAdjust: -1 };

  if (isPeaking && isMain) {
    return {
      rpeAdjust: Math.round(progression * 1.5 * 2) / 2,
      repsAdjust: weekIndex >= 2 ? -1 : 0,
      setsAdjust: 0,
    };
  }

  if (goalType === "maintenance" || goalType === "general-health") {
    return { rpeAdjust: 0, repsAdjust: 0, setsAdjust: 0 };
  }

  let rpeAdjust = 0;
  let repsAdjust = 0;
  let setsAdjust = 0;

  if (goalType === "bodybuilding" || goalType === "powerbuilding") {
    rpeAdjust = Math.round(progression * 0.5 * 2) / 2;
    if (isVolume && weekIndex === 0 && !isMain) repsAdjust = 1;
    if (isLastWeek && isVolume && fatigueTag === "high") setsAdjust = -1;
  } else if (goalType === "powerlifting") {
    if (isMain) {
      rpeAdjust = Math.round(progression * 1.0 * 2) / 2;
      repsAdjust = progression > 0.6 ? -1 : 0;
    } else {
      rpeAdjust = Math.round(progression * 0.5 * 2) / 2;
    }
  } else {
    rpeAdjust = Math.round(progression * 0.5 * 2) / 2;
  }

  return { rpeAdjust, repsAdjust, setsAdjust };
}

export function getExerciseFatigueTag(exercise: Exercise): ExerciseFatigueTag {
  if ((exercise.fatigueRating ?? 0) >= 4 || exercise.isSBDMainLift || exercise.exerciseCategory === "sbd") return "high";
  if ((exercise.fatigueRating ?? 0) >= 2 || exercise.exerciseCategory === "main_compound" || exercise.exerciseCategory === "secondary_compound") {
    return "moderate";
  }
  return "low";
}

export function getExerciseRoleForGoal(exercise: Exercise, goalType: TrainingGoal): ExerciseRole {
  const goalRole = exercise.defaultRoleByGoal?.[goalType];
  if (goalRole) return goalRole;
  return inferBaseExerciseRole(exercise);
}

function fatigueLevelToNumber(level: FatigueLevel): number {
  switch (level) {
    case "low": return 1;
    case "moderate": return 2;
    case "high": return 3;
    case "very_high": return 4;
  }
}

export function inferBaseExerciseRole(exercise: Exercise): ExerciseRole {
  const id = exercise.id;
  const name = exercise.name.toLowerCase();
  if (id === "ex_push_up" || name.includes("push-up")) return "accessory_compound";
  if (id === "ex_back_extension" || name.includes("back extension")) return "support_stability";
  if (id === "ex_cable_triceps_pressdown" || name.includes("pressdown")) return "isolation";
  if (id === "ex_cable_lateral_raise" || name.includes("lateral raise")) return "isolation";
  if (id === "ex_rdl" || name.includes("romanian deadlift")) return "secondary_compound";
  if (id === "ex_hip_thrust" || name.includes("hip thrust")) return "secondary_compound";
  if (id === "ex_pull_up" || name.includes("pull-up")) return "primary_compound";
  if (exercise.bestTrackedBy.includes("time") || exercise.exerciseCategory === "conditioning") return "timed_core";
  if (exercise.isSBDMainLift || exercise.exerciseCategory === "sbd") return "main_lift";
  if (exercise.exerciseCategory === "main_compound") return "primary_compound";
  if (exercise.exerciseCategory === "secondary_compound") return "secondary_compound";
  if (exercise.exerciseCategory === "machine_compound") return "accessory_compound";
  if (exercise.exerciseCategory === "isolation") return "isolation";
  if (exercise.movementPattern === "brace") return "support_stability";
  if (exercise.kind.includes("variation")) return "technique_variation";
  if (exercise.kind.includes("isolation")) return "hypertrophy_accessory";
  if (exercise.kind.includes("compound")) return "secondary_compound";
  return "pump_accessory";
}

export function buildFatigueBudget(exercises: Exercise[]): DayFatigueBudget {
  return exercises.reduce<DayFatigueBudget>((budget, exercise) => {
    const fatigue = getExerciseFatigueTag(exercise);
    const role = inferBaseExerciseRole(exercise);
    const isPress = exercise.movementPattern === "horizontal-press" || exercise.movementPattern === "vertical-press";
    const isHinge = exercise.movementPattern === "hinge";
    const isAxial = exercise.movementPattern === "squat" || exercise.movementPattern === "hinge" || exercise.movementPattern === "carry";
    if (exercise.isSBDMainLift || role === "main_lift") budget.sbdMainFatigue += fatigue === "high" ? 2 : 1;
    if (exercise.movementPattern === "hinge" || exercise.id === "ex_back_extension") budget.lowBackFatigue += fatigue === "high" ? 2 : 1;
    if (isPress) budget.pressingFatigue += fatigue === "high" ? 2 : 1;
    if (isHinge) budget.hingeFatigue += fatigue === "high" ? 2 : 1;
    if (isAxial) budget.axialFatigue += fatigue === "high" ? 2 : 1;
    if (role === "isolation" || role === "hypertrophy_accessory" || role === "pump_accessory") budget.localIsolationFatigue += 1;
    return budget;
  }, {
    sbdMainFatigue: 0,
    lowBackFatigue: 0,
    pressingFatigue: 0,
    hingeFatigue: 0,
    axialFatigue: 0,
    localIsolationFatigue: 0,
  });
}

function repeatPenalty(exercise: Exercise, weeklyExerciseCounts?: Record<string, number>): number {
  if (!weeklyExerciseCounts) return 0;
  const exactRepeats = weeklyExerciseCounts[exercise.id] ?? 0;
  let penalty = exactRepeats * 16;
  if (exercise.id === "ex_bench_comp" && exactRepeats <= 2) penalty -= 8;
  if (exercise.id === "ex_close_grip_bench") penalty += exactRepeats * 14;
  return penalty;
}

function similarBenchPenalty(exercise: Exercise, selectedExercises: Exercise[], weeklyExerciseCounts?: Record<string, number>): number {
  const name = exercise.name.toLowerCase();
  const isBenchVariant = name.includes("bench") || exercise.id === "ex_push_up" || exercise.id === "ex_dips";
  if (!isBenchVariant) return 0;
  const sameWeekBenchFamily = Object.entries(weeklyExerciseCounts || {})
    .filter(([id, count]) => count > 0 && (id.includes("bench") || id === "ex_push_up" || id === "ex_dips"))
    .reduce((sum, [, count]) => sum + count, 0);
  const sameDayBenchFamily = selectedExercises.filter((item) => item.name.toLowerCase().includes("bench") || item.id === "ex_push_up" || item.id === "ex_dips").length;
  return sameDayBenchFamily * 18 + Math.max(0, sameWeekBenchFamily - (exercise.id === "ex_bench_comp" ? 2 : 1)) * 10;
}

function fallbackPatternsForMuscle(muscle: MuscleGroup): MovementPattern[] {
  switch (muscle) {
    case "chest":
    case "upper-chest":
    case "lower-chest":
      return ["horizontal-press", "vertical-press"];
    case "back":
    case "lats":
      return ["vertical-pull", "horizontal-pull"];
    case "upper-back":
    case "mid-back":
    case "rear-delts":
      return ["horizontal-pull", "vertical-pull"];
    case "quads":
      return ["squat", "single-leg"];
    case "hamstrings":
    case "glutes":
      return ["hinge", "single-leg"];
    case "biceps":
    case "triceps":
    case "side-delts":
    case "front-delts":
    case "calves":
    case "abs":
    case "obliques":
      return ["isolation"];
    default:
      return [];
  }
}

export function getRequirementSlotPlan(input: {
  targetMuscle: MuscleGroup;
  goalType: TrainingGoal;
  blockType: BlockType;
  dayFocus: DayFocus;
  slotIndex: number;
  totalSlots: number;
  movementPattern?: MovementPattern;
}): RequirementSlotPlan {
  const slot = input.slotIndex + 1;
  const targets = getTrainingTargets(input.goalType, input.blockType);
  const specificGoal = input.goalType === "powerlifting" || input.goalType === "powerbuilding";
  const strengthBlock = input.blockType === "strength" || input.blockType === "intensification" || input.blockType === "peaking";
  const preferredPatterns = input.movementPattern ? [input.movementPattern] : fallbackPatternsForMuscle(input.targetMuscle);

  if (input.targetMuscle === "chest" || input.targetMuscle === "upper-chest" || input.targetMuscle === "lower-chest") {
    if (slot === 1) {
      const wantsMainLift = specificGoal || input.dayFocus === "strength" || strengthBlock;
      return {
        role: wantsMainLift && targets.specificity === "high" ? "main_lift" : "primary_compound",
        preferredPatterns: ["horizontal-press", ...preferredPatterns],
        preferredCategories: wantsMainLift
          ? ["sbd", "main_compound", "secondary_compound"]
          : ["main_compound", "secondary_compound", "sbd"],
        preferredFatigue: wantsMainLift ? "high" : "moderate",
        allowHighFatigue: true,
      };
    }
    if (slot === 2) {
      return {
        role: "secondary_compound",
        preferredPatterns: preferredPatterns,
        preferredCategories: ["secondary_compound", "machine_compound", "main_compound"],
        preferredFatigue: "moderate",
        allowHighFatigue: input.blockType === "peaking" ? false : true,
      };
    }
    return {
      role: input.goalType === "bodybuilding" || input.goalType === "powerbuilding" ? "hypertrophy_accessory" : "isolation",
      preferredPatterns: ["isolation", ...preferredPatterns],
      preferredCategories: ["isolation", "machine_compound", "secondary_compound"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  if (input.targetMuscle === "back" || input.targetMuscle === "lats" || input.targetMuscle === "upper-back") {
    if (slot === 1) {
      return {
        role: "primary_compound",
        preferredPatterns: input.targetMuscle === "upper-back" ? ["horizontal-pull", "vertical-pull"] : preferredPatterns,
        preferredCategories: ["main_compound", "secondary_compound"],
        preferredFatigue: "moderate",
        allowHighFatigue: input.targetMuscle === "back",
      };
    }
    if (slot === 2) {
      return {
        role: "secondary_compound",
        preferredPatterns: preferredPatterns.reverse(),
        preferredCategories: ["secondary_compound", "machine_compound", "main_compound"],
        preferredFatigue: "moderate",
        allowHighFatigue: false,
      };
    }
    return {
      role: "hypertrophy_accessory",
      preferredPatterns: ["horizontal-pull", "isolation", "vertical-pull"],
      preferredCategories: ["isolation", "machine_compound", "secondary_compound"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  if (input.targetMuscle === "quads") {
    if (slot === 1) {
      return {
        role: specificGoal || strengthBlock ? "main_lift" : "primary_compound",
        preferredPatterns: ["squat", "single-leg"],
        preferredCategories: ["sbd", "main_compound", "secondary_compound"],
        preferredFatigue: "high",
        allowHighFatigue: true,
      };
    }
    if (slot === 2) {
      return {
        role: "secondary_compound",
        preferredPatterns: ["single-leg", "squat"],
        preferredCategories: ["secondary_compound", "machine_compound", "main_compound"],
        preferredFatigue: "moderate",
        allowHighFatigue: input.blockType === "accumulation",
      };
    }
    return {
      role: "hypertrophy_accessory",
      preferredPatterns: ["isolation", "single-leg"],
      preferredCategories: ["isolation", "machine_compound"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  if (input.targetMuscle === "hamstrings" || input.targetMuscle === "glutes") {
    if (slot === 1) {
      return {
        role: strengthBlock ? "primary_compound" : "secondary_compound",
        preferredPatterns: ["hinge", "single-leg"],
        preferredCategories: ["secondary_compound", "main_compound", "sbd"],
        preferredFatigue: specificGoal ? "high" : "moderate",
        allowHighFatigue: true,
      };
    }
    return {
      role: "hypertrophy_accessory",
      preferredPatterns: ["isolation", "single-leg", "hinge"],
      preferredCategories: ["isolation", "machine_compound", "secondary_compound"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  if (input.targetMuscle === "triceps") {
    if (slot === 1 && (specificGoal || input.dayFocus === "strength" || strengthBlock)) {
      return {
        role: "secondary_compound",
        preferredPatterns: ["horizontal-press", "vertical-press"],
        preferredCategories: ["secondary_compound", "main_compound"],
        preferredFatigue: "moderate",
        allowHighFatigue: true,
      };
    }
    return {
      role: slot === 1 ? "isolation" : "pump_accessory",
      preferredPatterns: ["isolation"],
      preferredCategories: ["isolation", "machine_compound"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  if (["biceps", "side-delts", "rear-delts", "calves"].includes(input.targetMuscle)) {
    return {
      role: slot === 1 ? "isolation" : "pump_accessory",
      preferredPatterns: ["isolation"],
      preferredCategories: ["isolation", "machine_compound"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  if (["abs", "obliques"].includes(input.targetMuscle)) {
    return {
      role: "support_stability",
      preferredPatterns: ["brace", "isolation"],
      preferredCategories: ["isolation", "bodyweight"],
      preferredFatigue: "low",
      allowHighFatigue: false,
    };
  }

  return {
    role: slot === 1 ? "primary_compound" : "secondary_compound",
    preferredPatterns,
    preferredCategories: ["main_compound", "secondary_compound", "machine_compound", "isolation"],
    preferredFatigue: slot === 1 ? "moderate" : "low",
    allowHighFatigue: slot === 1,
  };
}

function roleFitScore(desired: ExerciseRole, actual: ExerciseRole): number {
  if (desired === actual) return 28;
  const closePairs = new Set([
    "main_lift:primary_compound",
    "primary_compound:secondary_compound",
    "secondary_compound:accessory_compound",
    "secondary_compound:primary_compound",
    "isolation:hypertrophy_accessory",
    "hypertrophy_accessory:pump_accessory",
    "support_stability:timed_core",
  ]);
  return closePairs.has(`${desired}:${actual}`) ? 16 : 0;
}

export function scoreExerciseForSlot(input: {
  exercise: Exercise;
  slotPlan: RequirementSlotPlan;
  targetMuscle: MuscleGroup;
  goalType: TrainingGoal;
  blockType: BlockType;
  dayFocus: DayFocus;
  selectedExercises: Exercise[];
  slotIndex: number;
  totalSlots: number;
  weeklyExerciseCounts?: Record<string, number>;
  dayBudget?: DayFatigueBudget;
}): number {
  const { exercise, slotPlan, selectedExercises, targetMuscle, goalType, blockType, weeklyExerciseCounts, dayBudget } = input;
  const baseRole = getExerciseRoleForGoal(exercise, goalType);
  const fatigue = getExerciseFatigueTag(exercise);
  let score = 40;

  score += roleFitScore(slotPlan.role, baseRole);
  if (slotPlan.preferredPatterns.includes(exercise.movementPattern)) score += 18;
  if (exercise.exerciseCategory && slotPlan.preferredCategories.includes(exercise.exerciseCategory)) score += 14;
  if (exercise.primaryMuscles.includes(targetMuscle) || exercise.directVolumeMuscles.includes(targetMuscle)) score += 12;
  if (fatigue === slotPlan.preferredFatigue) score += 10;
  if (!slotPlan.allowHighFatigue && fatigue === "high") score -= 24;
  if (blockType === "peaking" && fatigue === "high" && slotPlan.role !== "main_lift") score -= 20;
  if (goalType === "bodybuilding" && baseRole === "main_lift") score -= 12;
  if (goalType === "bodybuilding" && input.slotIndex >= 1 &&
    (baseRole === "hypertrophy_accessory" || baseRole === "isolation" || baseRole === "pump_accessory")) score += 10;
  if ((goalType === "maintenance" || goalType === "general-health") && fatigue === "high" && slotPlan.role !== "main_lift") score -= 10;
  if (goalType === "powerbuilding" && input.slotIndex >= 2 &&
    (baseRole === "hypertrophy_accessory" || baseRole === "isolation")) score += 8;

  const sameMovement = selectedExercises.filter((item) => item.movementPattern === exercise.movementPattern).length;
  const sameCategory = selectedExercises.filter((item) => item.exerciseCategory === exercise.exerciseCategory).length;
  const sameEquipment = selectedExercises.filter((item) => item.category === exercise.category).length;
  score -= sameMovement * 14;
  score -= sameCategory * 8;
  score -= sameEquipment * 4;

  if (exercise.exerciseFamily) {
    const sameFamilyCount = selectedExercises.filter(
      (item) => item.exerciseFamily && item.exerciseFamily === exercise.exerciseFamily
    ).length;
    score -= sameFamilyCount * 20;
  }
  if (exercise.variationGroup) {
    const sameVariationCount = selectedExercises.filter(
      (item) => item.variationGroup && item.variationGroup === exercise.variationGroup
    ).length;
    score -= sameVariationCount * 28;
    const weeklyVariationRepeats = Object.entries(weeklyExerciseCounts ?? {})
      .filter(([id, count]) => count > 0 && selectedExercises.find((item) => item.id === id)?.variationGroup === exercise.variationGroup)
      .reduce((sum, [, count]) => sum + count, 0);
    score -= weeklyVariationRepeats * 12;
  }

  if (exercise.fatigueProfile) {
    const fp = exercise.fatigueProfile;
    const budget = dayBudget ?? buildFatigueBudget(selectedExercises);
    const pressingLevel = fatigueLevelToNumber(fp.pressingFatigue);
    const lowBackLevel = fatigueLevelToNumber(fp.lowBackFatigue);
    const systemicLevel = fatigueLevelToNumber(fp.systemicFatigue);
    if (pressingLevel >= 3 && budget.pressingFatigue >= 2 && slotPlan.role !== "main_lift") score -= (pressingLevel - 2) * 14;
    if (lowBackLevel >= 3 && budget.lowBackFatigue >= 2 && slotPlan.role !== "main_lift") score -= (lowBackLevel - 2) * 14;
    if (systemicLevel >= 4 && slotPlan.role !== "main_lift" && selectedExercises.some((item) => getExerciseFatigueTag(item) === "high")) score -= 22;
  }

  const highFatigueCount = selectedExercises.filter((item) => getExerciseFatigueTag(item) === "high").length;
  const lowBackCount = selectedExercises.filter((item) => item.movementPattern === "squat" || item.movementPattern === "hinge").length;
  if (fatigue === "high" && highFatigueCount >= 1 && slotPlan.role !== "main_lift") score -= 26;
  if ((exercise.movementPattern === "squat" || exercise.movementPattern === "hinge") && lowBackCount >= 1 && slotPlan.role !== "main_lift") score -= 18;
  if (selectedExercises.some((item) => item.isSBDMainLift) && exercise.isSBDMainLift && slotPlan.role !== "main_lift") score -= 30;

  if (targetMuscle === "chest" && selectedExercises.some((item) => item.name.toLowerCase().includes("bench")) && exercise.name.toLowerCase().includes("bench") && slotPlan.role !== "main_lift") {
    score -= 22;
  }
  if ((targetMuscle === "back" || targetMuscle === "lats") && selectedExercises.some((item) => item.movementPattern === "vertical-pull") && exercise.movementPattern === "vertical-pull") {
    score -= 10;
  }
  score -= repeatPenalty(exercise, weeklyExerciseCounts);
  score -= similarBenchPenalty(exercise, selectedExercises, weeklyExerciseCounts);

  const budget = dayBudget ?? buildFatigueBudget(selectedExercises);
  if (budget.sbdMainFatigue >= 2 && (exercise.isSBDMainLift || baseRole === "main_lift") && slotPlan.role !== "main_lift") score -= 28;
  if (budget.lowBackFatigue >= 2 && (exercise.movementPattern === "hinge" || exercise.id === "ex_back_extension")) score -= exercise.id === "ex_back_extension" ? 14 : 24;
  if (budget.hingeFatigue >= 2 && exercise.movementPattern === "hinge" && slotPlan.role !== "main_lift") score -= 18;
  if (budget.pressingFatigue >= 3 && (exercise.id === "ex_close_grip_bench" || exercise.name.toLowerCase().includes("bench")) && slotPlan.role !== "main_lift") score -= 20;
  if (exercise.id === "ex_back_extension" && budget.lowBackFatigue >= 1) score -= 16;
  if (exercise.id === "ex_push_up" && (slotPlan.role === "isolation" || slotPlan.role === "hypertrophy_accessory")) score += 6;

  return score;
}

export function getPrescriptionForExerciseSlot(input: PrescriptionInput): ExerciseSlotPrescription {
  const {
    goalType,
    blockType,
    dayFocus,
    exercise,
    exerciseRole,
    requirementSlotIndex,
    totalRequiredForMuscle,
    weekNumber = 1,
    blockLengthWeeks = 4,
    isPriority = false,
  } = input;

  const targets = getTrainingTargets(goalType, blockType, exercise.exerciseCategory);
  const fatigueTag = getExerciseFatigueTag(exercise);
  const weekMod = getWeekProgressionModifier({
    goalType,
    blockType,
    weekIndex: Math.max(0, weekNumber - 1),
    totalWeeks: blockLengthWeeks,
    exerciseRole,
    fatigueTag,
  });
  const intensifying = blockType === "intensification" || blockType === "strength";
  const peaking = blockType === "peaking";
  const deload = blockType === "deload";

  let sets = targets.defaultSetsPerExercise;
  let reps = clamp(Math.round((targets.selectedRepRange.min + targets.selectedRepRange.max) / 2), 3, 20);
  let targetRpe = Number(((targets.selectedRpeRange.min + targets.selectedRpeRange.max) / 2).toFixed(1));
  let restSeconds = 90;
  const reason = `${goalType}_${blockType}_${exerciseRole}`;

  switch (exerciseRole) {
    case "main_lift":
      sets = peaking ? 3 : intensifying ? 4 : 4;
      reps = peaking ? 2 : intensifying ? 4 : 5;
      targetRpe = peaking ? 8.5 : blockType === "accumulation" ? 7.5 : 8;
      restSeconds = 180;
      break;
    case "primary_compound":
      sets = deload ? 2 : blockType === "accumulation" ? 4 : 3;
      reps = goalType === "bodybuilding" ? 8 : intensifying ? 5 : 6;
      targetRpe = deload ? 6 : goalType === "bodybuilding" ? 8 : 7.5;
      restSeconds = 150;
      break;
    case "secondary_compound":
      sets = deload ? 2 : 3;
      reps = peaking ? 6 : goalType === "bodybuilding" ? 10 : 7;
      targetRpe = deload ? 6 : 7.5;
      restSeconds = 120;
      break;
    case "accessory_compound":
      sets = deload ? 2 : 3;
      reps = exercise.id === "ex_push_up" ? 15 : goalType === "powerlifting" ? 8 : 10;
      targetRpe = deload ? 6 : exercise.id === "ex_push_up" ? 8 : 7.5;
      restSeconds = 105;
      break;
    case "isolation":
    case "hypertrophy_accessory":
    case "pump_accessory":
      sets = deload ? 2 : totalRequiredForMuscle >= 3 && requirementSlotIndex >= 2 ? 2 : 3;
      reps = goalType === "powerlifting" ? 12 : 15;
      targetRpe = deload ? 6.5 : goalType === "bodybuilding" ? 8.5 : 8;
      restSeconds = 60;
      break;
    case "technique_variation":
      sets = deload ? 2 : 3;
      reps = peaking ? 3 : 5;
      targetRpe = deload ? 6 : 7;
      restSeconds = 150;
      break;
    case "support_stability":
    case "timed_core":
      sets = exercise.id === "ex_back_extension" ? 3 : 2;
      reps = exercise.id === "ex_back_extension" ? 15 : 12;
      targetRpe = exercise.id === "ex_back_extension" ? 7.5 : 7;
      restSeconds = exercise.id === "ex_back_extension" ? 75 : 45;
      break;
  }

  if (goalType === "bodybuilding") {
    if (exerciseRole === "secondary_compound" || exerciseRole === "accessory_compound") {
      reps = Math.max(reps, 8);
      targetRpe = Math.max(targetRpe, 8);
    }
    if (exerciseRole === "main_lift") {
      targetRpe = Math.min(targetRpe, 8);
      sets = Math.min(sets, 4);
    }
  }

  if (goalType === "powerlifting" && blockType === "accumulation") {
    if (exerciseRole === "main_lift") {
      sets = 4;
      reps = 5;
      targetRpe = 7.5;
    }
    if (exercise.id === "ex_rdl") {
      sets = 3;
      reps = 8;
      targetRpe = 7.5;
    }
    if (exercise.id === "ex_hip_thrust") {
      sets = 3;
      reps = 10;
      targetRpe = 7.5;
    }
    if (exerciseRole === "secondary_compound") {
      reps = 6;
      targetRpe = 7.5;
    }
  }

  if (dayFocus === "strength") {
    if (exerciseRole === "secondary_compound") reps = Math.max(5, reps - 1);
    if (exerciseRole === "accessory_compound") reps = Math.max(6, reps - 1);
  }
  if (dayFocus === "hypertrophy") {
    if (exerciseRole === "secondary_compound") reps += 1;
    if (exerciseRole === "isolation" || exerciseRole === "hypertrophy_accessory" || exerciseRole === "pump_accessory") {
      reps = Math.max(reps, 12);
      targetRpe = Math.max(targetRpe, 8);
    }
  }

  if (dayFocus === "recovery" || deload) {
    sets = Math.max(1, sets - 1);
    targetRpe = Math.min(targetRpe, 6.5);
  }
  if (dayFocus === "technical" && exerciseRole === "main_lift") {
    reps = Math.min(reps, 4);
    targetRpe = Math.min(targetRpe, 7);
  }
  if (!deload) {
    targetRpe = clamp(targetRpe + weekMod.rpeAdjust, 6, peaking ? 9.5 : 9);
    reps = Math.max(1, reps + weekMod.repsAdjust);
    sets = Math.max(1, sets + weekMod.setsAdjust);
  }
  if (fatigueTag === "high" && exerciseRole !== "main_lift") {
    sets = Math.max(2, sets - 1);
  }
  if (isPriority && exerciseRole !== "main_lift") {
    sets = Math.min(sets + 1, 4);
  }

  const pp = exercise.prescriptionProfile;
  if (pp) {
    if (pp.avoidLowRepLoading && pp.preferredRepRange) {
      reps = Math.max(reps, pp.preferredRepRange.min);
    }
    if (pp.preferredRepRange) {
      reps = clamp(reps, pp.preferredRepRange.min, pp.preferredRepRange.max);
    }
    if (pp.preferredRpeRange) {
      targetRpe = clamp(targetRpe, pp.preferredRpeRange.min, pp.preferredRpeRange.max);
    }
    if (pp.defaultSetRange) {
      sets = clamp(sets, pp.defaultSetRange.min, pp.defaultSetRange.max);
    }
  }

  const roundedRpe = clamp(Math.round(targetRpe * 2) / 2, 6, peaking ? 9.5 : 9);
  const repRange = exerciseRole === "main_lift"
    ? { min: Math.max(1, reps - 1), max: reps + 1 }
    : { min: Math.max(1, reps - 2), max: reps + 3 };

  return {
    sets,
    reps,
    targetRpe: roundedRpe,
    repRange,
    rpeRange: exerciseRole === "main_lift" ? targets.mainLiftRpeRange : targets.accessoryRpeRange,
    restSeconds,
    required: exerciseRole === "main_lift" || exerciseRole === "primary_compound" || exerciseRole === "secondary_compound",
    role: exerciseRole,
    fatigueTag,
    prescriptionReasonCode: reason,
  };
}

export function roleLabel(role?: ExerciseRole): string | undefined {
  if (!role) return undefined;
  return role.replaceAll("_", " ");
}
