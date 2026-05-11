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

  const fatiguePerSet = fatigueProfile.repDropSensitivity * 0.012;
  const fatigueFactor = Math.max(0.85, 1 - fatiguePerSet * Math.max(0, setsCompletedThisExercise - 1));
  const fatiguedBase = loggedSet.actualWeight * fatigueFactor;
  const currentWeight = loggedSet.actualWeight;
  const unitLabel = user.unit;

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
          reason: `You rated this set Easy and matched/below target RPE, but after rounding the next practical jump is not available. Maintain ${currentWeight} ${unitLabel}.`,
          fatiguedBase, exercise, user, loggedSet, fatigueFactor,
        });
      }
      return buildRec({
        type: "load-change",
        priority: "low",
        title: "Increase next set",
        reason: `You rated this set Easy and actual RPE (${loggedSet.actualRpe ?? "–"}) was at or below target ${targetRpe}. Increase next set to ${suggestedWeight} ${unitLabel}.`,
        multiplier,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        enforceDirectionCheck: "increase",
      });
    }
    if (rpeDelta > 0 && rpeDelta < 2) {
      // Easy but slightly above target RPE → conflicting feedback, maintain
      return buildMaintain({
        reason: `You rated this set Easy but actual RPE (${loggedSet.actualRpe ?? "–"}) was slightly above target ${targetRpe}. Maintain ${currentWeight} ${unitLabel}.`,
        fatiguedBase, exercise, user, loggedSet, fatigueFactor,
      });
    }
    // rpeDelta >= 2 but still rated 5 — rare, trust feel rating → maintain
    return buildMaintain({
      reason: `You rated this set Easy despite elevated RPE. Maintain ${currentWeight} ${unitLabel} and reassess.`,
      fatiguedBase, exercise, user, loggedSet, fatigueFactor,
    });
  }

  // ── setFeel = 4 (Slightly Easy) ───────────────────────────────────────────
  if (setFeel === 4) {
    if (rpeDelta < 0) {
      // Slightly easy AND below target RPE → small increase
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 1.0125, exercise, unitLabel);
      if (suggestedWeight <= currentWeight) {
        return buildMaintain({
          reason: `Set felt slightly easy and RPE came in ${Math.abs(rpeDelta).toFixed(1)} below target, but after rounding the next practical jump is not available. Maintain ${currentWeight} ${unitLabel}.`,
          fatiguedBase, exercise, user, loggedSet, fatigueFactor,
        });
      }
      return buildRec({
        type: "load-change",
        priority: "low",
        title: "Small increase available",
        reason: `Set felt slightly easy (4/5) and actual RPE (${loggedSet.actualRpe ?? "–"}) came in ${Math.abs(rpeDelta).toFixed(1)} below target ${targetRpe}. Increase next set to ${suggestedWeight} ${unitLabel}.`,
        multiplier: 1.0125,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        enforceDirectionCheck: "increase",
      });
    }
    // rpeDelta >= 0: at or above target RPE — never decrease when feel is 4
    return buildMaintain({
      reason: `Set felt slightly easy (4/5) but actual RPE (${loggedSet.actualRpe ?? "–"}) matched or exceeded target ${targetRpe}. Maintain ${currentWeight} ${unitLabel}.`,
      fatiguedBase, exercise, user, loggedSet, fatigueFactor,
    });
  }

  // ── setFeel = 3 (Moderate) → follow RPE delta ────────────────────────────
  if (setFeel === 3) {
    if (rpeDelta >= 2) {
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 0.95, exercise, unitLabel);
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `Actual RPE exceeded the target by ${rpeDelta.toFixed(1)} but after rounding no practical reduction is available. Maintain ${currentWeight} ${unitLabel}.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor });
      }
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Reduce next set",
        reason: `Actual RPE exceeded the target by ${rpeDelta.toFixed(1)}. Reduce next set to ${suggestedWeight} ${unitLabel}.`,
        multiplier: 0.95,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        enforceDirectionCheck: "decrease",
      });
    }
    if (rpeDelta >= 1 && missedReps) {
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 0.975, exercise, unitLabel);
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `Reps were below plan but RPE was manageable. After rounding, hold ${currentWeight} ${unitLabel} and check setup.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor });
      }
      return buildRec({
        type: "load-change",
        priority: "low",
        title: "Slight reduction or hold",
        reason: `Reps were below plan and RPE was slightly above target. Reduce next set to ${suggestedWeight} ${unitLabel} or hold and check execution.`,
        multiplier: 0.975,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        enforceDirectionCheck: "decrease",
      });
    }
    if (formPoor) {
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 0.975, exercise, unitLabel);
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `Form quality was poor. Hold ${currentWeight} ${unitLabel} and prioritize movement pattern.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor });
      }
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Protect technique",
        reason: `Form quality was poor. Reduce next set to ${suggestedWeight} ${unitLabel} — prioritize movement pattern over load.`,
        multiplier: 0.975,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
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
      const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 0.95, exercise, unitLabel);
      if (suggestedWeight >= currentWeight) {
        return buildMaintain({ reason: `Set was hard and RPE exceeded target by ${rpeDelta.toFixed(1)}. After rounding, hold ${currentWeight} ${unitLabel}.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor });
      }
      return buildRec({
        type: "load-change",
        priority: "medium",
        title: "Reduce next set",
        reason: `Actual RPE exceeded the target by ${rpeDelta.toFixed(1)}. Reduce next set to ${suggestedWeight} ${unitLabel}.`,
        multiplier: 0.95,
        fatiguedBase,
        exercise,
        user,
        loggedSet,
        fatigueFactor,
        enforceDirectionCheck: "decrease",
      });
    }
    return buildMaintain({
      reason: `Set was hard (2/5) but RPE was near target. Maintain ${currentWeight} ${unitLabel}.`,
      fatiguedBase, exercise, user, loggedSet, fatigueFactor,
    });
  }

  // ── setFeel = 1 (Very Hard / Failed) ────────────────────────────────────
  if (setFeel <= 1) {
    const suggestedWeight = roundToExerciseIncrement(fatiguedBase * 0.90, exercise, unitLabel);
    if (suggestedWeight >= currentWeight) {
      return buildMaintain({ reason: `Set was very hard (1/5). After rounding, hold ${currentWeight} ${unitLabel}.`, fatiguedBase, exercise, user, loggedSet, fatigueFactor });
    }
    return buildRec({
      type: "load-change",
      priority: "high",
      title: "Reduce next set",
      reason: `Set feel was 1/5${missedReps ? " and reps were missed" : ""}. Reduce next set to ${suggestedWeight} ${unitLabel}.`,
      multiplier: 0.90,
      fatiguedBase,
      exercise,
      user,
      loggedSet,
      fatigueFactor,
      enforceDirectionCheck: "decrease",
    });
  }

  // ── Accessory muscle feel fallback ────────────────────────────────────────
  if (feelPoorAccessory) {
    return buildRec({
      type: "cue",
      priority: "low",
      title: "Improve stimulus",
      reason: "Muscle feel was poor on an accessory. Try slower tempo, better mind-muscle connection, or a substitute.",
      multiplier: 1,
      fatiguedBase,
      exercise,
      user,
      loggedSet,
      fatigueFactor,
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
  enforceDirectionCheck?: "increase" | "decrease";
};

function buildRec(input: BuildRecInput): SetAdjustmentResult {
  const { type, priority, title, reason, multiplier, fatiguedBase, exercise, user, loggedSet, fatigueFactor, enforceDirectionCheck } = input;

  const suggestedWeight =
    multiplier === 0
      ? 0
      : roundToExerciseIncrement(fatiguedBase * multiplier, exercise, user.unit);

  if (enforceDirectionCheck === "increase" && suggestedWeight <= loggedSet.actualWeight) {
    return buildMaintain({ reason: reason.replace(/Increase next set to.*$/, `but after rounding the next practical jump is not available. Maintain ${loggedSet.actualWeight} ${user.unit}.`), fatiguedBase, exercise, user, loggedSet, fatigueFactor });
  }
  if (enforceDirectionCheck === "decrease" && suggestedWeight >= loggedSet.actualWeight) {
    return buildMaintain({ reason: reason.replace(/Reduce next set to.*$/, `but after rounding no practical reduction is available. Maintain ${loggedSet.actualWeight} ${user.unit}.`), fatiguedBase, exercise, user, loggedSet, fatigueFactor });
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

function buildMaintain(input: Omit<BuildRecInput, "type" | "priority" | "title" | "multiplier" | "enforceDirectionCheck">): SetAdjustmentResult {
  const { reason, fatiguedBase, exercise, user, loggedSet, fatigueFactor } = input;
  const suggestedWeight = roundToExerciseIncrement(fatiguedBase, exercise, user.unit);
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
