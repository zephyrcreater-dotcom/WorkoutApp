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

  // Expected strength drop per set: high repDropSensitivity = faster attrition
  const fatiguePerSet = fatigueProfile.repDropSensitivity * 0.012;
  const fatigueFactor = Math.max(0.85, 1 - fatiguePerSet * Math.max(0, setsCompletedThisExercise - 1));

  let multiplier = 1;
  let priority: Recommendation["priority"] = "medium";
  let type: Recommendation["type"] = "load-change";
  let title = "Hold load";
  let reason = "The set was close enough to target that the plan can stay steady.";
  let shouldReturn = false;

  if (painHigh) {
    multiplier = 0;
    priority = "high";
    type = "pain-warning";
    title = "Stop or substitute";
    reason = `Pain was high (${loggedSet.painRating}/10). Stop this movement today or switch to a pain-free substitute.`;
    shouldReturn = true;
  } else if (setFeel <= 1 || (missedReps && rpeDelta >= 1)) {
    multiplier = 0.90;
    priority = "high";
    title = "Reduce next set";
    reason = `Feel was 1/5 or reps were missed at high RPE (${loggedSet.actualRpe ?? "–"} vs target ${targetRpe}). Reduce by ~8–10%.`;
    shouldReturn = true;
  } else if (rpeDelta >= 2 || setFeel <= 2) {
    multiplier = 0.95;
    title = "Reduce next set";
    reason = `Actual RPE was ${Math.abs(rpeDelta).toFixed(1)} above target, or set feel was 2/5. Reduce by ~3–5%.`;
    shouldReturn = true;
  } else if (missedReps && rpeDelta < 1 && setFeel < 5) {
    // Reps short but RPE manageable — likely technique, not fatigue.
    // Skipped when setFeel=5: athlete rated it easy despite short reps; hold and reassess.
    multiplier = 0.975;
    priority = "low";
    title = "Slight reduction or hold";
    reason = "Reps were below plan but RPE was manageable. Small reduction or hold — check setup and execution.";
    shouldReturn = true;
  } else if (formPoor && setFeel < 5) {
    // Skip form-reduction when feel is 5 — athlete may have been fine and just tapped wrong.
    multiplier = 0.975;
    title = "Protect technique";
    reason = "Form quality was poor. Hold or slightly reduce load — prioritize movement pattern over load.";
    shouldReturn = true;
  } else if (setFeel >= 5 && rpeDelta <= 0) {
    // Easy (5/5) and actual RPE at or below target → recommend increase
    const fatigueAllowsIncrease =
      fatigueProfile.systemicFatigue <= 3 || setsCompletedThisExercise <= 1;
    if (fatigueAllowsIncrease) {
      multiplier = rpeDelta <= -1.5 ? 1.025 : 1.0125;
      priority = "low";
      title = "Small increase available";
      reason = `Set felt easy (5/5) and actual RPE was ${loggedSet.actualRpe ?? "–"} vs target ${targetRpe}. A small weight increase is reasonable.`;
      shouldReturn = true;
    } else {
      reason = "Set felt easy but this movement builds fatigue quickly — hold load and reassess next set.";
    }
  } else if (setFeel >= 4 && rpeDelta <= -0.5) {
    // A little easy (4/5) and at least 0.5 below target RPE → suggest or maintain
    const fatigueAllowsIncrease =
      fatigueProfile.systemicFatigue <= 3 || setsCompletedThisExercise <= 1;
    if (fatigueAllowsIncrease) {
      multiplier = 1.0125;
      priority = "low";
      title = "Consider a small increase";
      reason = `Set felt slightly easy (4/5) and RPE came in ${Math.abs(rpeDelta).toFixed(1)} below target. Hold or add a small increment next set.`;
      shouldReturn = true;
    } else {
      reason = "Set felt slightly easy but fatigue is building — hold load for now.";
    }
  } else if (setFeel === 4 && rpeDelta > -0.5) {
    // A little easy but RPE matched — note it, no weight change
    reason = `Set felt a little easy (4/5) but actual RPE (${loggedSet.actualRpe ?? "–"}) matched the target. Maintain load.`;
    shouldReturn = false;
  } else if (feelPoorAccessory) {
    type = "cue";
    priority = "low";
    title = "Improve stimulus";
    reason =
      "Muscle feel was poor on an accessory. Try slower tempo, better mind-muscle connection, or a substitute.";
    shouldReturn = true;
  }

  const fatiguedBase = loggedSet.actualWeight * fatigueFactor;

  if (!shouldReturn) {
    const fatigueNote =
      fatigueFactor < 0.97
        ? ` (expected ~${((1 - fatigueFactor) * 100).toFixed(0)}% drop from cumulative fatigue)`
        : "";
    return {
      recommendation: undefined,
      fatigueFactor,
      adjustedTargetWeight: roundToExerciseIncrement(fatiguedBase, exercise, user.unit),
      reason: `Set was within tolerance.${fatigueNote}`,
    };
  }

  if (multiplier === 1 && type === "load-change") {
    return { recommendation: undefined, fatigueFactor, reason };
  }

  let suggestedWeight =
    multiplier === 0
      ? 0
      : roundToExerciseIncrement(fatiguedBase * multiplier, exercise, user.unit);

  // After rounding, if the suggestion equals the actual weight it is not an increase.
  if (
    suggestedWeight > 0 &&
    suggestedWeight === loggedSet.actualWeight &&
    (title === "Small increase available" || title === "Consider a small increase")
  ) {
    title = "Maintain load";
    reason = `After rounding to the nearest increment, the suggested weight matches your current load (${loggedSet.actualWeight} ${user.unit}). No load change needed.`;
    // No suggestedWeight action needed — holding is the message, not an apply button
    suggestedWeight = 0;
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
