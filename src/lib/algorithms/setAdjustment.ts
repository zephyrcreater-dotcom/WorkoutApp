import type { Exercise, LoggedSet, PlannedSet, Recommendation, UserProfile } from "../../types/domain";
import { createId, nowIso } from "../ids";
import { roundToExerciseIncrement } from "./loadPrescription";
import { getExerciseFatigueProfile } from "./trainingRules";

export type SetAdjustmentInput = {
  user: UserProfile;
  exercise: Exercise;
  loggedSet: LoggedSet;
  nextPlannedSet?: PlannedSet;
  setsCompletedThisExercise?: number;
};

export type SetAdjustmentResult = {
  recommendation?: Recommendation;
  fatigueFactor: number;
  adjustedTargetWeight?: number;
  reason: string;
};

export function recommendNextSetAdjustment(input: SetAdjustmentInput): SetAdjustmentResult {
  const { user, exercise, loggedSet, nextPlannedSet, setsCompletedThisExercise = 1 } = input;

  const fatigueProfile = getExerciseFatigueProfile(exercise);
  const targetRpe = loggedSet.targetRpe ?? nextPlannedSet?.targetRpe ?? 8;
  const plannedReps = loggedSet.plannedReps ?? nextPlannedSet?.targetReps ?? loggedSet.actualReps;
  const rpeDelta = (loggedSet.actualRpe ?? targetRpe) - targetRpe;
  const missedReps = loggedSet.actualReps < plannedReps;
  const painHigh = (loggedSet.painRating ?? 0) >= 6;
  const formPoor = (loggedSet.formRating ?? 5) <= 2;
  const setFeel = loggedSet.setRating ?? 3;
  const feelPoorAccessory =
    exercise.kind.includes("isolation") && (loggedSet.muscleFeelRating ?? 4) <= 2;
  const bodyweightMovement = exercise.defaultUnit === "bodyweight"
    || exercise.trackByBodyweight
    || exercise.isBodyweight
    || exercise.category === "bodyweight";

  const fatiguePerSet = fatigueProfile.repDropSensitivity * 0.012;
  const fatigueFactor = Math.max(0.85, 1 - fatiguePerSet * Math.max(0, setsCompletedThisExercise - 1));
  const fatiguedBase = loggedSet.actualWeight * fatigueFactor;
  const currentWeight = loggedSet.actualWeight;
  // Use exercise display unit; fall back to user unit only if exercise has no unit set
  const unitLabel = (exercise.defaultUnit === "lb" || exercise.defaultUnit === "kg") ? exercise.defaultUnit : user.unit;

  if (bodyweightMovement && currentWeight <= 0) {
    return {
      recommendation: undefined,
      fatigueFactor,
      adjustedTargetWeight: 0,
      reason: "Bodyweight set logged without added load.",
    };
  }

  // ── Pain: always stop/substitute ──────────────────────────────────────────
  if (painHigh) {
    return buildRec({
      type: "pain-warning",
      priority: "high",
      title: "Stop or substitute",
      reason: `Pain was high (${loggedSet.painRating}/10). Stop this movement today or switch to a pain-free substitute.`,
      multiplier: 0,
      fatiguedBase,
      exercise,
      user,
      loggedSet,
      fatigueFactor,
      unitLabel,
    });
  }

  // ── setFeel = 5 (Easy) ────────────────────────────────────────────────────
  if (setFeel >= 5) {
    if (rpeDelta <= 0) {
      // Easy AND at/below target RPE → increase (or maintain if no practical increment)
      const multiplier = rpeDelta <= -1.5 ? 1.025 : 1.0125;
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * multiplier, exercise, unitLabel);
      if (suggestedWeight <= currentWeight) {
        return buildMaintain({
          reason: `This felt easy — keep the same load. No practical increase available after rounding to the nearest ${unitLabel} increment.`,
          fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel,
        });
      }
      return buildRec({
        type: "load-change",
        priority: "low",
        title: "Increase next set",
        reason: `This felt easy. A small increase is reasonable — try ${suggestedWeight} ${unitLabel} next set.`,
        multiplier,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        enforceDirectionCheck: "increase",
      });
    }
    if (rpeDelta > 0 && rpeDelta < 2) {
      // Easy feel but slightly above target RPE — keep load steady
      return buildMaintain({
        reason: `This felt easy, but RPE was slightly above target. Keep the same load.`,
        fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel,
      });
    }
    // Easy feel but much higher RPE is a conflict. Respect the RPE gap.
    const reductionPct = getMeaningfulReductionPct({ exercise, currentWeight, actualReps: loggedSet.actualReps, targetReps: plannedReps, rpeDelta });
    const suggestedWeight = getMeaningfulReducedWeight({ exercise, unitLabel, currentWeight, fatiguedBase, reductionPct });
    return buildRec({
      type: "load-change",
      priority: "medium",
      title: "Reduce next set",
      reason: `RPE was higher than target. Reduce to ${suggestedWeight} ${unitLabel} unless that RPE entry was accidental.`,
      multiplier: suggestedWeight / Math.max(fatiguedBase, 1),
      fatiguedBase,
      exercise,
      user,
      loggedSet,
      fatigueFactor,
      unitLabel,
      explicitSuggestedWeight: suggestedWeight,
      enforceDirectionCheck: "decrease",
    });
  }

  // ── setFeel = 4 (Slightly Easy) ───────────────────────────────────────────
  if (setFeel === 4) {
    if (rpeDelta < 0) {
      // Slightly easy AND below target RPE → small increase
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 1.0125, exercise, unitLabel);
      if (suggestedWeight <= currentWeight) {
        return buildMaintain({
          reason: `This felt a bit easy. No practical increase available after rounding — keep the same load.`,
          fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel,
        });
      }
      return buildRec({
        type: "load-change",
        priority: "low",
        title: "Small increase available",
        reason: `This felt a bit easy and RPE was below target. A small increase to ${suggestedWeight} ${unitLabel} is reasonable.`,
        multiplier: 1.0125,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        enforceDirectionCheck: "increase",
      });
    }
    // rpeDelta >= 0: at or above target RPE — never decrease when feel is 4
    if (rpeDelta >= 1.5) {
      const reductionPct = getMeaningfulReductionPct({ exercise, currentWeight, actualReps: loggedSet.actualReps, targetReps: plannedReps, rpeDelta });
      const suggestedWeight = getMeaningfulReducedWeight({ exercise, unitLabel, currentWeight, fatiguedBase, reductionPct });
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Reduce next set",
        reason: `RPE was higher than target. Reduce to ${suggestedWeight} ${unitLabel} for the next set.`,
        multiplier: suggestedWeight / Math.max(fatiguedBase, 1),
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        explicitSuggestedWeight: suggestedWeight,
        enforceDirectionCheck: "decrease",
      });
    }
    return buildMaintain({
      reason: `This felt a bit easy, but RPE was at or above target. Keep the same load.`,
      fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel,
    });
  }

  // ── setFeel = 3 (Moderate) → follow RPE delta ────────────────────────────
  if (setFeel === 3) {
    if (rpeDelta >= 2) {
      const reductionPct = getMeaningfulReductionPct({ exercise, currentWeight, actualReps: loggedSet.actualReps, targetReps: plannedReps, rpeDelta });
      const suggestedWeight = getMeaningfulReducedWeight({ exercise, unitLabel, currentWeight, fatiguedBase, reductionPct });
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `This felt on target, but RPE ran high. No practical reduction available — keep ${currentWeight} ${unitLabel}.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
      }
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Reduce next set",
        reason: `RPE was higher than target. Reduce to ${suggestedWeight} ${unitLabel} for the next set.`,
        multiplier: suggestedWeight / Math.max(fatiguedBase, 1),
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        explicitSuggestedWeight: suggestedWeight,
        enforceDirectionCheck: "decrease",
      });
    }
    if (rpeDelta >= 1 && missedReps) {
      const reductionPct = getMeaningfulReductionPct({ exercise, currentWeight, actualReps: loggedSet.actualReps, targetReps: plannedReps, rpeDelta: Math.max(rpeDelta, 1) });
      const suggestedWeight = getMeaningfulReducedWeight({ exercise, unitLabel, currentWeight, fatiguedBase, reductionPct });
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `Reps were below plan. Keep ${currentWeight} ${unitLabel} and check your setup.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
      }
      return buildRec({
        type: "load-change",
        priority: "low",
        title: "Slight reduction or hold",
        reason: `Target is easier than the last set. Reduce to ${suggestedWeight} ${unitLabel}.`,
        multiplier: suggestedWeight / Math.max(fatiguedBase, 1),
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        explicitSuggestedWeight: suggestedWeight,
        enforceDirectionCheck: "decrease",
      });
    }
    if (formPoor) {
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 0.975, exercise, unitLabel);
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `Form was poor. Keep ${currentWeight} ${unitLabel} and prioritize technique.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
      }
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Protect technique",
        reason: `Form was poor. Reduce to ${suggestedWeight} ${unitLabel} and prioritize movement quality over load.`,
        multiplier: 0.975,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        enforceDirectionCheck: "decrease",
      });
    }
    return {
      recommendation: undefined,
      fatigueFactor,
      adjustedTargetWeight: roundToExerciseIncrement(fatiguedBase, exercise, unitLabel),
      reason: "Set was within tolerance.",
    };
  }

  // ── setFeel = 2 (Hard) → maintain/reduce only if RPE above target ────────
  if (setFeel === 2) {
    if (rpeDelta >= 2 || (missedReps && rpeDelta >= 1)) {
      const reductionPct = getMeaningfulReductionPct({ exercise, currentWeight, actualReps: loggedSet.actualReps, targetReps: plannedReps, rpeDelta: Math.max(rpeDelta, 1.5) });
      const suggestedWeight = getMeaningfulReducedWeight({ exercise, unitLabel, currentWeight, fatiguedBase, reductionPct });
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `This felt harder than planned. Keep ${currentWeight} ${unitLabel} — no practical reduction available after rounding.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
      }
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Reduce next set",
        reason: `RPE was higher than target. Reduce to ${suggestedWeight} ${unitLabel} for the next set.`,
        multiplier: suggestedWeight / Math.max(fatiguedBase, 1),
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        unitLabel,
        explicitSuggestedWeight: suggestedWeight,
        enforceDirectionCheck: "decrease",
      });
    }
    return buildMaintain({
      reason: `This felt harder than planned, but RPE was near target. Keep the same load.`,
      fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel,
    });
  }

  // ── setFeel = 1 (Very Hard / Failed) ────────────────────────────────────
  if (setFeel <= 1) {
    const reductionPct = getMeaningfulReductionPct({ exercise, currentWeight, actualReps: loggedSet.actualReps, targetReps: plannedReps, rpeDelta: Math.max(rpeDelta, 2) });
    const suggestedWeight = getMeaningfulReducedWeight({ exercise, unitLabel, currentWeight, fatiguedBase, reductionPct });
    if (suggestedWeight >= currentWeight) {
      return buildMaintain({ reason: `This felt much harder than planned. Keep ${currentWeight} ${unitLabel} — no practical reduction available after rounding.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
    }
    return buildRec({
      type: "load-change",
      priority: "high",
      title: "Reduce next set",
      reason: `Target is easier than the last set. Reduce to ${suggestedWeight} ${unitLabel}.${missedReps ? " Reps were also missed." : ""}`,
      multiplier: suggestedWeight / Math.max(fatiguedBase, 1),
      fatiguedBase,
      exercise,
      user,
      loggedSet,
      fatigueFactor,
      unitLabel,
      explicitSuggestedWeight: suggestedWeight,
      enforceDirectionCheck: "decrease",
    });
  }

  // ── Accessory muscle feel fallback ────────────────────────────────────────
  if (feelPoorAccessory) {
    return buildRec({
      type: "cue",
      priority: "low",
      title: "Improve stimulus",
      reason: "Muscle feel was poor on this accessory. Try a slower tempo or better mind-muscle connection.",
      multiplier: 1,
      fatiguedBase,
      exercise,
      user,
      loggedSet,
      fatigueFactor,
      unitLabel,
    });
  }

  return {
    recommendation: undefined,
    fatigueFactor,
    adjustedTargetWeight: roundToExerciseIncrement(fatiguedBase, exercise, unitLabel),
    reason: "Set was within tolerance.",
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

type BuildRecInput = {
  type: Recommendation["type"];
  priority: Recommendation["priority"];
  title: string;
  reason: string;
  multiplier: number;
  fatiguedBase: number;
  exercise: Exercise;
  user: UserProfile;
  loggedSet: LoggedSet;
  fatigueFactor: number;
  unitLabel: "lb" | "kg";
  explicitSuggestedWeight?: number;
  enforceDirectionCheck?: "increase" | "decrease";
};

function buildRec(input: BuildRecInput): SetAdjustmentResult {
  const { type, priority, title, reason, multiplier, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel, explicitSuggestedWeight, enforceDirectionCheck } = input;

  const suggestedWeight =
    explicitSuggestedWeight !== undefined
      ? explicitSuggestedWeight
      : multiplier === 0
      ? 0
      : roundToExerciseIncrement(fatiguedBase * multiplier, exercise, unitLabel);

  if (enforceDirectionCheck === "increase" && suggestedWeight <= loggedSet.actualWeight) {
    return buildMaintain({ reason: reason.replace(/Increase next set to.*$/, `but after rounding the next practical jump is not available. Maintain ${loggedSet.actualWeight} ${unitLabel}.`), fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
  }
  if (enforceDirectionCheck === "decrease" && suggestedWeight >= loggedSet.actualWeight) {
    return buildMaintain({ reason: reason.replace(/Reduce next set to.*$/, `but after rounding no practical reduction is available. Maintain ${loggedSet.actualWeight} ${unitLabel}.`), fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel });
  }

  const recommendation: Recommendation = {
    id: createId("rec"),
    userId: user.id,
    type,
    priority,
    title,
    explanation: reason,
    action: {
      exerciseId: exercise.id,
      setId: loggedSet.id,
      suggestedWeight,
    },
    createdAt: nowIso(),
  };

  return { recommendation, fatigueFactor, adjustedTargetWeight: suggestedWeight, reason };
}

function buildMaintain(input: Omit<BuildRecInput, "type" | "priority" | "title" | "multiplier" | "enforceDirectionCheck" | "explicitSuggestedWeight">): SetAdjustmentResult {
  const { reason, fatiguedBase, exercise, user, loggedSet, fatigueFactor, unitLabel } = input;
  const suggestedWeight = roundToExerciseIncrement(fatiguedBase, exercise, unitLabel);
  const recommendation: Recommendation = {
    id: createId("rec"),
    userId: user.id,
    type: "load-change",
    priority: "low",
    title: "Maintain load",
    explanation: reason,
    action: {
      exerciseId: exercise.id,
      setId: loggedSet.id,
    },
    createdAt: nowIso(),
  };
  return {
    recommendation,
    fatigueFactor,
    adjustedTargetWeight: suggestedWeight,
    reason,
  };
}

function getMeaningfulReductionPct(params: {
  exercise: Exercise;
  currentWeight: number;
  actualReps: number;
  targetReps: number;
  rpeDelta: number;
}): number {
  const { exercise, actualReps, targetReps, rpeDelta } = params;
  const isolationBonus = exercise.kind.includes("isolation") || exercise.category === "cable" || exercise.category === "machine" ? 0.02 : 0;
  let basePct = 0;
  if (rpeDelta >= 2) basePct = 0.05;
  else if (rpeDelta >= 1.5) basePct = 0.04;
  else if (rpeDelta >= 1) basePct = 0.025;
  const repIncrease = Math.max(0, targetReps - actualReps);
  const repPct = Math.min(0.05, repIncrease * 0.015);
  return Math.min(0.15, basePct + isolationBonus + repPct);
}

function getIncrementSize(exercise: Exercise, unit: "lb" | "kg"): number {
  const override = exercise.customIncrement ?? exercise.defaultIncrement;
  if (override && override > 0) return override;
  if (exercise.category === "dumbbell" || exercise.trackPerSide) return 2.5;
  return unit === "kg" ? 2.5 : 5;
}

function getMeaningfulReducedWeight(params: {
  exercise: Exercise;
  unitLabel: "lb" | "kg";
  currentWeight: number;
  fatiguedBase: number;
  reductionPct: number;
}): number {
  const { exercise, unitLabel, currentWeight, fatiguedBase, reductionPct } = params;
  const increment = getIncrementSize(exercise, unitLabel);
  const rawWeight = Math.max(0, fatiguedBase * (1 - reductionPct));
  let rounded = roundToExerciseIncrement(rawWeight, exercise, unitLabel);
  if (rounded > rawWeight) rounded = Math.max(0, rounded - increment);
  const maxAllowedWeight = currentWeight * (1 - reductionPct);
  while (rounded > maxAllowedWeight + 0.001 && rounded - increment >= 0) {
    rounded = Math.max(0, rounded - increment);
  }
  return rounded;
}
