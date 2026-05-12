/**
 * Pure helpers for reading and deriving exercise metadata.
 * All functions work safely with incomplete metadata by returning sensible defaults.
 * No side effects — suitable for use in generators, prescriptions, and analysis.
 */
import type {
  Exercise,
  ExerciseFatigueProfile,
  ExercisePrescriptionProfile,
  ExerciseRole,
  ExerciseSpecificity,
  FatigueLevel,
  MovementPattern,
  TrainingGoal,
} from "../types/domain";

// ─── Default values ─────────────────────────────────────────────────────────

const DEFAULT_FATIGUE_PROFILE: Required<ExerciseFatigueProfile> = {
  systemicFatigue: "moderate",
  localFatigue: "moderate",
  jointStress: "low",
  lowBackFatigue: "low",
  pressingFatigue: "low",
  gripFatigue: "low",
  axialFatigue: "low",
};

const DEFAULT_SPECIFICITY: Required<ExerciseSpecificity> = {
  squat: 0,
  bench: 0,
  deadlift: 0,
};

const DEFAULT_PRESCRIPTION_PROFILE: Required<ExercisePrescriptionProfile> = {
  preferredRepRange: { min: 8, max: 12 },
  preferredRpeRange: { min: 7, max: 9 },
  defaultSetRange: { min: 2, max: 4 },
  avoidLowRepLoading: false,
  failureTolerance: "moderate",
};

// ─── Family derivation helpers ───────────────────────────────────────────────

function deriveFamily(exercise: Exercise): string {
  const name = exercise.name.toLowerCase();
  const id = exercise.id;
  if (exercise.isSBDMainLift || id === "ex_squat_comp" || id === "ex_bench_comp" || id === "ex_deadlift_comp") {
    if (id.includes("squat")) return "squat";
    if (id.includes("bench")) return "bench_press";
    if (id.includes("deadlift")) return "deadlift";
  }
  if (name.includes("squat") || name.includes("hack squat")) return "squat";
  if (name.includes("deadlift") || name.includes("rdl") || name.includes("romanian")) return "hip_hinge";
  if (name.includes("bench") && (name.includes("close") || name.includes("cg"))) return "bench_press";
  if (name.includes("bench") || name.includes("chest press")) return "bench_press";
  if (name.includes("incline") && name.includes("press")) return "incline_press";
  if (name.includes("overhead press") || name.includes("ohp") || name.includes("shoulder press")) return "vertical_press";
  if (name.includes("dip")) return "vertical_press";
  if (name.includes("push-up") || name.includes("push up") || name.includes("pushup")) return "horizontal_press";
  if (name.includes("row") && !name.includes("cable crunch")) return "row";
  if (name.includes("pull-up") || name.includes("pull up") || name.includes("chin")) return "vertical_pull";
  if (name.includes("pulldown") || name.includes("straight-arm") || name.includes("straight arm")) return "vertical_pull";
  if (name.includes("pullover")) return "vertical_pull";
  if (name.includes("hip thrust") || name.includes("glute bridge")) return "hip_extension";
  if (name.includes("back extension") || name.includes("hyperextension")) return "spinal_extension";
  if (name.includes("lunge") || name.includes("split squat") || name.includes("step-up")) return "single_leg";
  if (name.includes("leg press")) return "quad_press";
  if (name.includes("leg extension") || name.includes("knee extension")) return "knee_extension";
  if (name.includes("leg curl") || name.includes("hamstring curl")) return "knee_flexion";
  if (name.includes("lateral raise")) return "lateral_raise";
  if (name.includes("face pull") || name.includes("rear delt") || name.includes("reverse fly") || name.includes("pec deck") && name.includes("reverse")) return "rear_delt";
  if (name.includes("curl") && !name.includes("leg curl")) return "curl";
  if (name.includes("pressdown") || name.includes("tricep") || name.includes("skull")) return "triceps_extension";
  if (name.includes("calf")) return "calf";
  if (name.includes("plank") || name.includes("crunch") || name.includes("pallof") || name.includes("ab ") || name.includes("core")) return "core";
  if (name.includes("treadmill") || name.includes("run") || name.includes("bike") || name.includes("row") && exercise.category === "cardio") return "conditioning";
  if (name.includes("fly") || name.includes("pec deck")) return "horizontal_press";
  if (name.includes("adduction")) return "adduction";
  if (name.includes("abduction")) return "abduction";
  const pat = exercise.movementPattern;
  if (pat === "squat") return "squat";
  if (pat === "hinge") return "hip_hinge";
  if (pat === "horizontal-press" || pat === "incline-press") return "horizontal_press";
  if (pat === "vertical-press") return "vertical_press";
  if (pat === "horizontal-pull") return "row";
  if (pat === "vertical-pull") return "vertical_pull";
  if (pat === "knee-flexion") return "knee_flexion";
  if (pat === "elbow-flexion") return "curl";
  if (pat === "elbow-extension") return "triceps_extension";
  if (pat === "knee-extension") return "knee_extension";
  if (pat === "hip-extension") return "hip_extension";
  if (pat === "shoulder-abduction") return "lateral_raise";
  if (pat === "spinal-extension") return "spinal_extension";
  if (pat === "trunk-stability" || pat === "brace") return "core";
  if (pat === "conditioning" || pat === "locomotion") return "conditioning";
  return exercise.category === "barbell" ? "barbell_compound" : "other";
}

function deriveMovementPattern(exercise: Exercise): MovementPattern {
  if (exercise.movementPatterns && exercise.movementPatterns.length > 0) return exercise.movementPatterns[0];
  return exercise.movementPattern;
}

function deriveFatigueProfile(exercise: Exercise): Required<ExerciseFatigueProfile> {
  const base = { ...DEFAULT_FATIGUE_PROFILE };
  const isSBD = exercise.isSBDMainLift || exercise.exerciseCategory === "sbd";
  const isBarbell = exercise.category === "barbell";
  const isHeavyCompound = isBarbell && (exercise.kind.includes("compound") || exercise.kind.includes("competition-lift"));
  const isMachine = exercise.category === "machine";
  const isCable = exercise.category === "cable";
  const isBodyweight = exercise.category === "bodyweight";
  const isIsolation = exercise.kind.includes("isolation") || exercise.exerciseCategory === "isolation";
  const pat = exercise.movementPattern;
  const isHinge = pat === "hinge" || pat === "spinal-extension";
  const isSquat = pat === "squat";
  const isPress = pat === "horizontal-press" || pat === "incline-press" || pat === "vertical-press";
  if (isSBD) {
    base.systemicFatigue = "high";
    base.localFatigue = "high";
    base.jointStress = "high";
    base.axialFatigue = "high";
    if (exercise.id === "ex_deadlift_comp") { base.systemicFatigue = "very_high"; base.lowBackFatigue = "high"; base.gripFatigue = "high"; }
    if (exercise.id === "ex_bench_comp") { base.pressingFatigue = "high"; base.axialFatigue = "low"; base.lowBackFatigue = "low"; }
    if (exercise.id === "ex_squat_comp") { base.lowBackFatigue = "moderate"; }
  } else if (isHeavyCompound) {
    base.systemicFatigue = "moderate";
    base.localFatigue = "high";
    base.jointStress = "moderate";
    if (isHinge) { base.lowBackFatigue = "moderate"; base.axialFatigue = "moderate"; }
    if (isSquat) { base.axialFatigue = "moderate"; base.lowBackFatigue = "moderate"; }
    if (isPress) { base.pressingFatigue = "moderate"; }
  } else if (isMachine || isCable) {
    base.systemicFatigue = "low";
    base.localFatigue = "moderate";
    base.jointStress = "low";
  } else if (isBodyweight) {
    base.systemicFatigue = "low";
    base.localFatigue = "moderate";
    base.jointStress = "low";
  } else if (isIsolation) {
    base.systemicFatigue = "low";
    base.localFatigue = "high";
    base.jointStress = "low";
  }
  if (isHinge && !isSBD) base.lowBackFatigue = "moderate";
  if (isSquat && !isSBD) base.axialFatigue = "moderate";
  if (isPress && !isSBD) base.pressingFatigue = "moderate";
  return base;
}

function deriveSpecificity(exercise: Exercise): Required<ExerciseSpecificity> {
  const id = exercise.id;
  const name = exercise.name.toLowerCase();
  if (id === "ex_squat_comp") return { squat: 1.0, bench: 0.0, deadlift: 0.25 };
  if (id === "ex_bench_comp") return { squat: 0.0, bench: 1.0, deadlift: 0.0 };
  if (id === "ex_deadlift_comp") return { squat: 0.1, bench: 0.0, deadlift: 1.0 };
  if (name.includes("front squat")) return { squat: 0.6, bench: 0.0, deadlift: 0.0 };
  if (name.includes("highbar") || name.includes("high-bar")) return { squat: 0.7, bench: 0.0, deadlift: 0.1 };
  if (name.includes("squat")) return { squat: 0.5, bench: 0.0, deadlift: 0.0 };
  if (name.includes("rdl") || name.includes("romanian")) return { squat: 0.0, bench: 0.0, deadlift: 0.55 };
  if (name.includes("deadlift")) return { squat: 0.0, bench: 0.0, deadlift: 0.6 };
  if (name.includes("close-grip") || name.includes("close grip")) return { squat: 0.0, bench: 0.75, deadlift: 0.0 };
  if (name.includes("incline") && name.includes("barbell")) return { squat: 0.0, bench: 0.45, deadlift: 0.0 };
  if (name.includes("incline") && name.includes("press")) return { squat: 0.0, bench: 0.35, deadlift: 0.0 };
  if (name.includes("bench")) return { squat: 0.0, bench: 0.45, deadlift: 0.0 };
  return { ...DEFAULT_SPECIFICITY };
}

function derivePrescriptionProfile(exercise: Exercise): Required<ExercisePrescriptionProfile> {
  const isSBD = exercise.isSBDMainLift || exercise.exerciseCategory === "sbd";
  const isHeavyBarbell = exercise.category === "barbell" && exercise.kind.includes("compound");
  const isMachine = exercise.category === "machine";
  const isCable = exercise.category === "cable";
  const isBodyweight = exercise.category === "bodyweight";
  const pat = exercise.movementPattern;
  const isIsolation = exercise.kind.includes("isolation") || exercise.exerciseCategory === "isolation";
  const isCore = pat === "trunk-stability" || pat === "brace";
  const isConditioning = pat === "conditioning" || pat === "locomotion" || exercise.kind.includes("conditioning");
  if (isSBD) {
    return { preferredRepRange: { min: 1, max: 5 }, preferredRpeRange: { min: 6.5, max: 9.5 }, defaultSetRange: { min: 2, max: 5 }, avoidLowRepLoading: false, failureTolerance: "low" };
  }
  if (isCore || isConditioning) {
    return { preferredRepRange: { min: 10, max: 20 }, preferredRpeRange: { min: 6, max: 8 }, defaultSetRange: { min: 2, max: 3 }, avoidLowRepLoading: true, failureTolerance: "moderate" };
  }
  if (isIsolation || isMachine || isCable) {
    return { preferredRepRange: { min: 10, max: 20 }, preferredRpeRange: { min: 7, max: 9.5 }, defaultSetRange: { min: 2, max: 4 }, avoidLowRepLoading: true, failureTolerance: "high" };
  }
  if (isBodyweight) {
    return { preferredRepRange: { min: 10, max: 20 }, preferredRpeRange: { min: 7, max: 9 }, defaultSetRange: { min: 2, max: 4 }, avoidLowRepLoading: true, failureTolerance: "moderate" };
  }
  if (isHeavyBarbell) {
    return { preferredRepRange: { min: 4, max: 8 }, preferredRpeRange: { min: 7, max: 8.5 }, defaultSetRange: { min: 3, max: 4 }, avoidLowRepLoading: false, failureTolerance: "low" };
  }
  return { ...DEFAULT_PRESCRIPTION_PROFILE };
}

function deriveRoleForGoal(exercise: Exercise, goalType: TrainingGoal): ExerciseRole {
  const isSBD = exercise.isSBDMainLift || exercise.exerciseCategory === "sbd";
  const isMainCompound = exercise.exerciseCategory === "main_compound";
  const isSecondary = exercise.exerciseCategory === "secondary_compound";
  const isMachineCompound = exercise.exerciseCategory === "machine_compound";
  const isIsolation = exercise.exerciseCategory === "isolation" || exercise.kind.includes("isolation");
  const isConditioning = exercise.kind.includes("conditioning") || exercise.movementPattern === "conditioning";
  const isCore = exercise.movementPattern === "trunk-stability" || exercise.movementPattern === "brace";
  if (isConditioning) return "timed_core";
  if (isCore) return "support_stability";
  if (isSBD) {
    return goalType === "powerlifting" || goalType === "powerbuilding" ? "main_lift" : "primary_compound";
  }
  if (isMainCompound) {
    if (goalType === "powerlifting") return "secondary_compound";
    return "primary_compound";
  }
  if (isSecondary) {
    if (goalType === "bodybuilding" || goalType === "general-health") return "secondary_compound";
    return "secondary_compound";
  }
  if (isMachineCompound) {
    if (goalType === "general-health") return "secondary_compound";
    return "accessory_compound";
  }
  if (isIsolation) {
    if (goalType === "bodybuilding") return "hypertrophy_accessory";
    if (goalType === "powerlifting") return "pump_accessory";
    return "isolation";
  }
  return "secondary_compound";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getExerciseFamily(exercise: Exercise): string {
  return exercise.exerciseFamily ?? deriveFamily(exercise);
}

export function getMovementPattern(exercise: Exercise): MovementPattern {
  return deriveMovementPattern(exercise);
}

export function getFatigueProfile(exercise: Exercise): Required<ExerciseFatigueProfile> {
  if (!exercise.fatigueProfile) return deriveFatigueProfile(exercise);
  return {
    ...DEFAULT_FATIGUE_PROFILE,
    ...exercise.fatigueProfile,
  };
}

export function getSpecificity(exercise: Exercise): Required<ExerciseSpecificity> {
  if (!exercise.specificity) return deriveSpecificity(exercise);
  return {
    squat: exercise.specificity.squat ?? 0,
    bench: exercise.specificity.bench ?? 0,
    deadlift: exercise.specificity.deadlift ?? 0,
  };
}

export function getPrescriptionProfile(exercise: Exercise): Required<ExercisePrescriptionProfile> {
  if (!exercise.prescriptionProfile) return derivePrescriptionProfile(exercise);
  const defaults = derivePrescriptionProfile(exercise);
  return {
    preferredRepRange: exercise.prescriptionProfile.preferredRepRange ?? defaults.preferredRepRange,
    preferredRpeRange: exercise.prescriptionProfile.preferredRpeRange ?? defaults.preferredRpeRange,
    defaultSetRange: exercise.prescriptionProfile.defaultSetRange ?? defaults.defaultSetRange,
    avoidLowRepLoading: exercise.prescriptionProfile.avoidLowRepLoading ?? defaults.avoidLowRepLoading,
    failureTolerance: exercise.prescriptionProfile.failureTolerance ?? defaults.failureTolerance,
  };
}

export function getRoleHint(exercise: Exercise, goalType: TrainingGoal): ExerciseRole {
  const goalRole = exercise.roleHints?.[goalType] ?? exercise.defaultRoleByGoal?.[goalType];
  if (goalRole) return goalRole;
  return deriveRoleForGoal(exercise, goalType);
}

export function isHighFatigueExercise(exercise: Exercise): boolean {
  const fp = getFatigueProfile(exercise);
  return fp.systemicFatigue === "high" || fp.systemicFatigue === "very_high" || (exercise.fatigueRating ?? 0) >= 4;
}

export function isLowBackFatigueExercise(exercise: Exercise): boolean {
  const fp = getFatigueProfile(exercise);
  return fp.lowBackFatigue === "high" || fp.axialFatigue === "high" || fp.axialFatigue === "very_high" ||
    exercise.movementPattern === "squat" || exercise.movementPattern === "hinge" || exercise.movementPattern === "carry";
}

export function isPressingFamily(exercise: Exercise): boolean {
  const family = getExerciseFamily(exercise);
  const pressingFamilies = new Set(["bench_press", "incline_press", "horizontal_press", "vertical_press"]);
  if (pressingFamilies.has(family)) return true;
  const pat = exercise.movementPattern;
  return pat === "horizontal-press" || pat === "incline-press" || pat === "vertical-press";
}

export function isSbdMainLift(exercise: Exercise): boolean {
  return exercise.isSBDMainLift === true || exercise.exerciseCategory === "sbd" ||
    ["ex_squat_comp", "ex_bench_comp", "ex_deadlift_comp"].includes(exercise.id);
}

export function normalizeExerciseMetadata(exercise: Exercise): Exercise {
  const out = { ...exercise };
  if (!out.exerciseFamily) out.exerciseFamily = deriveFamily(exercise);
  if (!out.variationGroup) out.variationGroup = exercise.id.replace("ex_", "");
  if (!out.fatigueProfile) out.fatigueProfile = deriveFatigueProfile(exercise);
  else if (out.fatigueProfile.axialFatigue === undefined) {
    const derived = deriveFatigueProfile(exercise);
    out.fatigueProfile = { ...out.fatigueProfile, axialFatigue: derived.axialFatigue };
  }
  if (!out.specificity) out.specificity = deriveSpecificity(exercise);
  if (!out.prescriptionProfile) out.prescriptionProfile = derivePrescriptionProfile(exercise);
  if (!out.roleHints && out.defaultRoleByGoal) out.roleHints = out.defaultRoleByGoal;
  return out;
}

export function fatigueProfileToTag(fp: Required<ExerciseFatigueProfile>): "low" | "moderate" | "high" {
  const level = (v: FatigueLevel) => v === "very_high" ? 4 : v === "high" ? 3 : v === "moderate" ? 2 : 1;
  const max = Math.max(level(fp.systemicFatigue), level(fp.localFatigue));
  return max >= 3 ? "high" : max >= 2 ? "moderate" : "low";
}
