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
  } else if (missedReps && rpeDelta < 1) {
    // Reps short but RPE manageable — likely technique, not fatigue
    multiplier = 0.975;
    priority = "low";
    title = "Slight reduction or hold";
    reason = "Reps were below plan but RPE was manageable. Small reduction or hold — check setup and execution.";
    shouldReturn = true;
  } else if (formPoor) {
    multiplier = 0.975;
    title = "Protect technique";
    reason = "Form quality was poor. Hold or slightly reduce load — prioritize movement pattern over load.";
    shouldReturn = true;
  } else if (setFeel >= 5 && rpeDelta <= -1.5) {
    const fatigueAllowsIncrease =
      fatigueProfile.systemicFatigue <= 3 || setsCompletedThisExercise <= 1;
    if (fatigueAllowsIncrease) {
      multiplier = 1.025;
      priority = "low";
      title = "Small increase available";
      reason = `Set feel was 5/5 and RPE was well below target (actual: ${loggedSet.actualRpe ?? "–"}, target: ${targetRpe}). A small increase is reasonable.`;
      shouldReturn = true;
    } else {
      reason =
        "Set feel was 5/5 but this exercise accumulates fatigue quickly — hold load for now.";
    }
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

  const suggestedWeight =
    multiplier === 0
      ? 0
      : roundToExerciseIncrement(fatiguedBase * multiplier, exercise, user.unit);

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
