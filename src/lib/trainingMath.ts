import { createId, nowIso } from "./ids";
import type {
  DashboardMetric,
  Exercise,
  ExerciseUnit,
  GymExerciseAdjustment,
  LoggedExercise,
  LoggedSet,
  MuscleGroup,
  PlannedSet,
  ReadinessCheckIn,
  Recommendation,
  SetPerformanceStatus,
  TrainingBlock,
  TrainingDatabase,
  UnitPreference,
  UserProfile,
  WorkoutSession
} from "../types/domain";
import {
  calculateReadinessAdjustment as calculateTrainingIntelligenceReadinessAdjustment,
  calculateReadinessState as calculateTrainingIntelligenceReadinessState,
  calculateSetPerformanceScore as calculateTrainingIntelligenceSetPerformanceScore,
} from "./trainingIntelligence";

/** Round an RPE value to the nearest 0.5 increment and clamp to [6, 10]. */
export function sanitizeRpe(value: number): number {
  return Math.max(6, Math.min(10, Math.round(value * 2) / 2));
}

/**
 * Compute average RPE from a set of LoggedSets.
 * Only uses sets with a positive, finite actualRpe. Each value is sanitized
 * before averaging. The result is clamped to [0, 10].
 */
export function safeAverageRpe(sets: Pick<LoggedSet, "actualRpe">[]): number {
  const valid = sets.map((s) => s.actualRpe).filter((r): r is number => typeof r === "number" && r > 0 && isFinite(r));
  if (!valid.length) return 0;
  const raw = valid.reduce((sum, r) => sum + Math.min(10, Math.max(0, r)), 0) / valid.length;
  return Math.min(10, Number(raw.toFixed(1)));
}

const RPE_PERCENT_TABLE: Record<number, Record<number, number>> = {
  1: { 10: 1, 9.5: 0.978, 9: 0.955, 8.5: 0.939, 8: 0.922, 7.5: 0.907, 7: 0.892, 6.5: 0.878, 6: 0.865 },
  2: { 10: 0.955, 9.5: 0.939, 9: 0.922, 8.5: 0.907, 8: 0.892, 7.5: 0.878, 7: 0.865, 6.5: 0.851, 6: 0.837 },
  3: { 10: 0.922, 9.5: 0.907, 9: 0.892, 8.5: 0.878, 8: 0.865, 7.5: 0.851, 7: 0.837, 6.5: 0.824, 6: 0.811 },
  4: { 10: 0.892, 9.5: 0.878, 9: 0.865, 8.5: 0.851, 8: 0.837, 7.5: 0.824, 7: 0.811, 6.5: 0.798, 6: 0.786 },
  5: { 10: 0.865, 9.5: 0.851, 9: 0.837, 8.5: 0.824, 8: 0.811, 7.5: 0.798, 7: 0.786, 6.5: 0.774, 6: 0.762 },
  6: { 10: 0.837, 9.5: 0.824, 9: 0.811, 8.5: 0.798, 8: 0.786, 7.5: 0.774, 7: 0.762, 6.5: 0.751, 6: 0.74 },
  7: { 10: 0.811, 9.5: 0.798, 9: 0.786, 8.5: 0.774, 8: 0.762, 7.5: 0.751, 7: 0.74, 6.5: 0.723, 6: 0.707 },
  8: { 10: 0.786, 9.5: 0.774, 9: 0.762, 8.5: 0.751, 8: 0.74, 7.5: 0.723, 7: 0.707, 6.5: 0.694, 6: 0.68 },
  9: { 10: 0.762, 9.5: 0.751, 9: 0.74, 8.5: 0.723, 8: 0.707, 7.5: 0.694, 7: 0.68, 6.5: 0.667, 6: 0.653 },
  10: { 10: 0.74, 9.5: 0.723, 9: 0.707, 8.5: 0.694, 8: 0.68, 7.5: 0.667, 7: 0.653, 6.5: 0.64, 6: 0.626 },
  12: { 10: 0.68, 9.5: 0.667, 9: 0.653, 8.5: 0.64, 8: 0.626, 7.5: 0.614, 7: 0.602, 6.5: 0.59, 6: 0.578 },
  15: { 10: 0.626, 9.5: 0.614, 9: 0.602, 8.5: 0.59, 8: 0.578, 7.5: 0.566, 7: 0.555, 6.5: 0.544, 6: 0.533 }
};

export function roundToIncrement(weight: number, increment = 5): number {
  return Math.max(0, Math.round(weight / increment) * increment);
}

export function isWeightUnit(unit?: ExerciseUnit | UnitPreference | null): unit is UnitPreference {
  return unit === "lb" || unit === "kg";
}

export function toKg(value?: number | null, unit?: ExerciseUnit | UnitPreference | null): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  if (!isWeightUnit(unit) || unit === "kg") return value;
  return value * 0.45359237;
}

export function toLb(value?: number | null, unit?: ExerciseUnit | UnitPreference | null): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  if (!isWeightUnit(unit) || unit === "lb") return value;
  return value * 2.2046226218;
}

export function convertWeight(
  value?: number | null,
  fromUnit?: ExerciseUnit | UnitPreference | null,
  toUnit?: ExerciseUnit | UnitPreference | null
): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  if (!isWeightUnit(fromUnit) || !isWeightUnit(toUnit) || fromUnit === toUnit) return value;
  return toUnit === "kg" ? toKg(value, fromUnit) : toLb(value, fromUnit);
}

export function getExerciseDisplayUnit(
  exercise?: Pick<Exercise, "defaultUnit"> | null,
  user?: Pick<UserProfile, "unit"> | null,
  fallbackUnit?: ExerciseUnit | UnitPreference | null,
): UnitPreference {
  if (isWeightUnit(exercise?.defaultUnit)) return exercise.defaultUnit;
  if (user?.unit) return user.unit;
  if (isWeightUnit(fallbackUnit)) return fallbackUnit;
  return "lb";
}

export function formatWeight(value?: number | null, unit?: ExerciseUnit | UnitPreference | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  const digits = unit === "kg" ? 1 : 0;
  const rounded = digits === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits).replace(/\.0$/, "");
}

export function estimateOneRepMax(weight: number, reps: number, rpe = 10): number {
  if (weight <= 0 || reps <= 0) return 0;
  const percentage = lookupRpePercent(reps, rpe);
  if (percentage) return Math.round(weight / percentage);
  return Math.round(weight * (1 + reps / 30));
}

export function calculateE1RMFromSet(set: Pick<LoggedSet, "actualWeight" | "actualReps" | "actualRpe" | "kind" | "skipped" | "e1rm">): number {
  if (typeof set.e1rm === "number" && set.e1rm > 0) return set.e1rm;
  if (set.skipped || set.kind === "warmup" || set.actualWeight <= 0 || set.actualReps <= 0) return 0;
  return estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10);
}

export function calculateSessionExerciseE1RM(loggedExercise: LoggedExercise): number {
  return Math.max(0, ...loggedExercise.sets.map(calculateE1RMFromSet));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function setRatingNumeric(rating?: LoggedSet["setRating"]): number {
  return rating ?? 3;
}

export function calculateSetPerformanceScore(plannedSet: PlannedSet | undefined, actualSet: LoggedSet): {
  score: number;
  status: SetPerformanceStatus;
  reasons: string[];
} {
  const result = calculateTrainingIntelligenceSetPerformanceScore({
    plannedWeight: actualSet.plannedWeight ?? plannedSet?.plannedWeight,
    actualWeight: actualSet.actualWeight,
    plannedReps: actualSet.plannedReps ?? plannedSet?.targetReps,
    actualReps: actualSet.actualReps,
    targetRpe: actualSet.targetRpe ?? plannedSet?.targetRpe,
    actualRpe: actualSet.actualRpe,
    setRating: setRatingNumeric(actualSet.setRating),
    setType: actualSet.kind,
    skipped: actualSet.skipped,
  });
  const reasons = result.flags.length
    ? result.flags.map((flag) => flag.replaceAll("_", " "))
    : [actualSet.added ? "Useful added work." : "Set was close to plan."];
  const status: SetPerformanceStatus = actualSet.added
    ? "added"
    : result.result === "slightly_missed"
      ? "underperformed"
      : (result.result as SetPerformanceStatus);
  return { score: result.setScore, status, reasons };
}

export function calculateWorkoutScore(session: WorkoutSession): {
  score: number;
  status: "poor" | "mixed" | "solid" | "excellent";
  completionPercentage: number;
  averageSetRating: number;
  suggestions: string[];
} {
  const sets = session.loggedExercises.flatMap((exercise) => exercise.sets);
  if (!sets.length) {
    return {
      score: 0,
      status: "poor",
      completionPercentage: 0,
      averageSetRating: 0,
      suggestions: ["No sets were logged."]
    };
  }
  const scored = sets.map((set) => calculateSetPerformanceScore(undefined, set));
  const skipped = sets.filter((set) => set.skipped).length;
  const completed = sets.length - skipped;
  const averagePerformance = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
  const completionPercentage = Math.round((completed / sets.length) * 100);
  const averageSetRating = Number((sets.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / sets.length).toFixed(1));
  const readiness = session.readiness?.readinessScore;
  const readinessEffect = readiness === undefined ? 0 : readiness < 45 ? -4 : readiness > 85 ? 2 : 0;
  const skippedPenalty = skipped ? Math.min(18, skipped * 5) : 0;
  const score = clampScore(averagePerformance * 0.7 + completionPercentage * 0.3 + readinessEffect - skippedPenalty);
  const status = score >= 88 ? "excellent" : score >= 72 ? "solid" : score >= 50 ? "mixed" : "poor";
  const suggestions: string[] = [];
  if (skipped >= 2) suggestions.push("Skipped volume was high; review fatigue or reduce optional sets.");
  if (averageSetRating <= 2) suggestions.push("Sets felt harder than planned (avg feel ≤ 2/5); keep load steady or trim volume.");
  if (score >= 88) suggestions.push("Performance was ahead of plan; a small load increase can be reviewed next time.");
  if (!suggestions.length) suggestions.push("Workout matched the plan closely; continue conservative progression.");
  return { score, status, completionPercentage, averageSetRating, suggestions };
}

export function recommendNextWorkoutAdjustments(completedWorkoutSession: WorkoutSession, activeBlock?: TrainingBlock): string[] {
  const sets = completedWorkoutSession.loggedExercises.flatMap((exercise) => exercise.sets);
  const workingSets = sets.filter((set) => !set.skipped && set.kind !== "warmup");
  const skipped = sets.filter((set) => set.skipped).length;
  const easyAhead = workingSets.filter((set) => {
    const targetRpe = set.targetRpe ?? 8;
    return (set.setRating ?? 3) >= 4 && (set.actualRpe ?? targetRpe) <= targetRpe - 1 && set.actualReps >= (set.plannedReps ?? set.actualReps);
  }).length;
  const hardBehind = workingSets.filter((set) => {
    const targetRpe = set.targetRpe ?? 8;
    return (set.setRating ?? 3) <= 2 || (set.actualRpe ?? targetRpe) >= targetRpe + 1.5 || set.actualReps < (set.plannedReps ?? set.actualReps);
  }).length;
  const suggestions: string[] = [];

  if (skipped >= 2) suggestions.push("Reduce optional volume or review fatigue before the next similar day.");
  if (hardBehind >= Math.max(2, Math.ceil(workingSets.length * 0.35))) suggestions.push("Keep load the same or reduce 2.5-5% on the next exposure.");
  if (easyAhead >= Math.max(2, Math.ceil(workingSets.length * 0.35))) suggestions.push("Review a small load increase next time.");
  if ((completedWorkoutSession.readiness?.readinessScore || 100) < 50) suggestions.push("Readiness was low; consider lower top-set RPE or fewer accessories.");
  if (!suggestions.length) suggestions.push("Keep progression conservative and run the next block day as planned.");
  if (activeBlock?.type === "deload") suggestions.unshift("Respect deload intent; avoid turning easy sets into max-effort work.");
  return suggestions;
}

export function lookupRpePercent(reps: number, rpe = 8): number {
  const closestReps = Object.keys(RPE_PERCENT_TABLE)
    .map(Number)
    .reduce((best, candidate) => (Math.abs(candidate - reps) < Math.abs(best - reps) ? candidate : best), 1);
  const rpeOptions = Object.keys(RPE_PERCENT_TABLE[closestReps]).map(Number);
  const closestRpe = rpeOptions.reduce(
    (best, candidate) => (Math.abs(candidate - rpe) < Math.abs(best - rpe) ? candidate : best),
    rpeOptions[0]
  );
  return RPE_PERCENT_TABLE[closestReps][closestRpe];
}

export function calculateReadinessScore(input: Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">): number {
  return calculateTrainingIntelligenceReadinessState(input).readinessScore;
}

export function readinessAdjustment(readiness?: ReadinessCheckIn): {
  rpeDelta: number;
  accessorySetDelta: number;
  explanation: string;
} {
  if (!readiness) return { rpeDelta: 0, accessorySetDelta: 0, explanation: "No readiness check-in yet." };
  const state = calculateTrainingIntelligenceReadinessAdjustment(readiness.readinessScore);
  if (state.readinessBand === "poor") {
    return {
      rpeDelta: -1,
      accessorySetDelta: -1,
      explanation: "Readiness is poor. Trim load slightly and cut one optional accessory set."
    };
  }
  if (state.readinessBand === "low") {
    return {
      rpeDelta: -0.5,
      accessorySetDelta: 0,
      explanation: "Readiness is low. Keep the day conservative and avoid chasing jumps."
    };
  }
  if (state.readinessBand === "good" || state.readinessBand === "great") {
    return {
      rpeDelta: 0.25,
      accessorySetDelta: 0,
      explanation: "Readiness is good. Run the plan and only take small increases if warmups agree."
    };
  }
  return { rpeDelta: 0, accessorySetDelta: 0, explanation: "Readiness is baseline. Run the plan as written." };
}

export function getRecentExerciseSets(
  sessions: WorkoutSession[],
  userId: string,
  exerciseId: string,
  limit = 8,
  gymId?: string
): LoggedSet[] {
  return sessions
    .filter((session) => session.userId === userId && session.status === "completed" && (!gymId || session.gymId === gymId))
    .flatMap((session) =>
      session.loggedExercises.filter((exercise) => exercise.exerciseId === exerciseId).flatMap((exercise) => exercise.sets)
    )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, limit);
}

export function findGymExerciseAdjustment(params: {
  db: TrainingDatabase;
  userId: string;
  gymId?: string;
  exerciseId: string;
  machineId?: string;
}): GymExerciseAdjustment | undefined {
  const { db, userId, gymId, exerciseId, machineId } = params;
  if (!gymId) return undefined;
  return db.gyms
    .filter((gym) => gym.userId === userId && gym.id === gymId)
    .flatMap((gym) => gym.exerciseAdjustments || [])
    .find((adjustment) => adjustment.exerciseId === exerciseId && (!machineId || adjustment.machineId === machineId));
}

export function suggestPlannedWeight(params: {
  user: UserProfile;
  exercise: Exercise;
  plannedSet: PlannedSet;
  db: TrainingDatabase;
  readiness?: ReadinessCheckIn;
  gymId?: string;
  machineId?: string;
}): { weight: number; explanation: string } {
  const { user, exercise, plannedSet, db, readiness, gymId, machineId } = params;
  const increment = user.unit === "kg" ? 2.5 : exercise.category === "dumbbell" || exercise.trackPerSide ? 2.5 : 5;
  const liftMax = user.maxes.find((max) => max.exerciseId === exercise.id || exercise.name.toLowerCase().includes(max.liftName.toLowerCase()));
  const gymSets = getRecentExerciseSets(db.sessions, user.id, exercise.id, 5, gymId);
  const recentSets = gymSets.length ? gymSets : getRecentExerciseSets(db.sessions, user.id, exercise.id, 5);
  const adjustment = findGymExerciseAdjustment({ db, userId: user.id, gymId, exerciseId: exercise.id, machineId });
  const targetReps = plannedSet.targetReps || 8;
  const targetRpe = plannedSet.targetRpe || 7;
  const candidates: number[] = [];

  if (plannedSet.plannedWeight) candidates.push(plannedSet.plannedWeight);
  if (liftMax) candidates.push((liftMax.trainingMax || liftMax.oneRepMax) * lookupRpePercent(targetReps, targetRpe));
  if (recentSets[0]) {
    const last = recentSets[0];
    const rpeDelta = (last.actualRpe || targetRpe) - targetRpe;
    const repsDelta = last.actualReps - targetReps;
    let recentWeight = last.actualWeight;

    // The model is deliberately moderate: only strong performance signals move the next planned load.
    if ((last.setRating ?? 3) <= 1 || repsDelta < -1 || rpeDelta >= 2 || (last.formRating ?? 4) <= 2) recentWeight *= 0.95;
    else if ((last.setRating ?? 3) >= 5 && rpeDelta <= -1 && repsDelta >= 0) recentWeight *= 1.025;
    else if ((last.setRating ?? 3) <= 2 || rpeDelta >= 1) recentWeight *= 0.985;
    candidates.push(recentWeight);
  }

  if (candidates.length === 0) return { weight: 0, explanation: "No history or max yet. Enter a starting weight manually." };

  const readinessEffect = readinessAdjustment(readiness);
  const readinessMultiplier = readinessEffect.rpeDelta <= -1 ? 0.96 : readinessEffect.rpeDelta < 0 ? 0.985 : 1;
  const blended = candidates.reduce((sum, weight) => sum + weight, 0) / candidates.length;
  const shouldApplyGymFactor = !gymSets.length && Boolean(adjustment) && (exercise.category === "machine" || exercise.category === "cable" || adjustment?.source === "manual");
  const gymMultiplier = shouldApplyGymFactor ? adjustment?.factor || 1 : 1;
  const weight = roundToIncrement(blended * readinessMultiplier * gymMultiplier, increment);
  return {
    weight,
    explanation: `Blends planned load, ${gymSets.length ? "this gym's" : "recent"} ${exercise.name} history, e1RM/RPE chart, readiness, and any machine conversion. ${readinessEffect.explanation}`
  };
}

export function learnGymExerciseAdjustment(params: {
  db: TrainingDatabase;
  user: UserProfile;
  session: WorkoutSession;
  loggedExercise: LoggedExercise;
  loggedSet: LoggedSet;
  exercise: Exercise;
}): void {
  const { db, user, session, loggedExercise, loggedSet, exercise } = params;
  if (!session.gymId || exercise.category === "barbell" || exercise.category === "dumbbell" || exercise.category === "bodyweight") return;
  const currentPerformance = estimateOneRepMax(loggedSet.actualWeight, loggedSet.actualReps, loggedSet.actualRpe || 10);
  if (!currentPerformance) return;

  const reference = db.sessions
    .filter((item) => item.userId === user.id && item.status === "completed" && item.gymId && item.gymId !== session.gymId)
    .flatMap((item) =>
      item.loggedExercises
        .filter((logged) => logged.exerciseId === loggedExercise.exerciseId)
        .flatMap((logged) => logged.sets.map((set) => ({ gymId: item.gymId!, value: estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10) })))
    )
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)[0];

  if (!reference) return;
  const learnedFactor = Math.max(0.5, Math.min(1.5, currentPerformance / reference.value));
  const gym = db.gyms.find((item) => item.id === session.gymId && item.userId === user.id);
  if (!gym) return;
  gym.exerciseAdjustments ||= [];
  const existing = gym.exerciseAdjustments.find(
    (item) => item.exerciseId === loggedExercise.exerciseId && item.machineId === loggedExercise.machineId
  );
  if (existing && existing.source === "manual") return;

  // This is a deliberately simple online update: each comparable set nudges the
  // gym/machine factor toward the observed load relationship without letting one
  // odd set completely rewrite future recommendations.
  if (existing) {
    const nextSampleSize = existing.sampleSize + 1;
    existing.factor = Number(((existing.factor * existing.sampleSize + learnedFactor) / nextSampleSize).toFixed(3));
    existing.sampleSize = nextSampleSize;
    existing.baselineGymId = reference.gymId;
    existing.lastCalculatedFactor = Number(learnedFactor.toFixed(3));
    existing.confidence = Math.min(0.9, nextSampleSize / 6);
    existing.updatedAt = nowIso();
  } else {
    gym.exerciseAdjustments.push({
      id: createId("adj"),
      userId: user.id,
      gymId: session.gymId,
      exerciseId: loggedExercise.exerciseId,
      machineId: loggedExercise.machineId,
      factor: Number(learnedFactor.toFixed(3)),
      source: "learned",
      sampleSize: 1,
      baselineGymId: reference.gymId,
      lastCalculatedFactor: Number(learnedFactor.toFixed(3)),
      confidence: 0.25,
      userAccepted: false,
      notes: "Learned from comparable reps/RPE at another gym.",
      updatedAt: nowIso()
    });
  }
}

export function suggestNextSetAdjustment(params: {
  user: UserProfile;
  exercise: Exercise;
  loggedSet: LoggedSet;
  nextPlannedSet?: PlannedSet;
}): Recommendation | undefined {
  const { user, exercise, loggedSet, nextPlannedSet } = params;
  const targetRpe = loggedSet.targetRpe ?? nextPlannedSet?.targetRpe ?? 8;
  const plannedReps = loggedSet.plannedReps ?? nextPlannedSet?.targetReps ?? loggedSet.actualReps;
  const rpeDelta = (loggedSet.actualRpe ?? targetRpe) - targetRpe;
  const missedReps = loggedSet.actualReps < plannedReps;
  const painHigh = (loggedSet.painRating ?? 0) >= 6;
  const formPoor = (loggedSet.formRating ?? 4) <= 2;
  const feelPoorAccessory = exercise.kind.includes("isolation") && (loggedSet.muscleFeelRating ?? 4) <= 2;
  let multiplier = 1;
  let priority: "low" | "medium" | "high" = "medium";
  let title = "Hold load";
  let explanation = "The set was close enough to target that the plan can stay steady.";
  let type: Recommendation["type"] = "load-change";

  if (painHigh) {
    multiplier = 0;
    priority = "high";
    type = "pain-warning";
    title = "Stop or substitute";
    explanation = "Pain was high. Stop this movement today or switch to a pain-free substitute.";
  } else if ((loggedSet.setRating ?? 3) <= 1 || missedReps) {
    multiplier = 0.92;
    priority = "high";
    title = "Reduce next set";
    explanation = "Planned reps were missed or set feel was 1/5. Reduce the next set by about 5-10%.";
  } else if (rpeDelta >= 2 || (loggedSet.setRating ?? 3) <= 2) {
    multiplier = 0.95;
    title = "Reduce next set";
    explanation = "Actual RPE was well above target or set feel was 2/5. Reduce the next set by about 2.5-7.5%.";
  } else if (formPoor) {
    multiplier = 0.975;
    title = "Protect technique";
    explanation = "Form quality was poor, so hold or slightly reduce load even though the reps were completed.";
  } else if ((loggedSet.setRating ?? 3) >= 5 && rpeDelta <= -1) {
    multiplier = 1.025;
    priority = "low";
    title = "Small increase available";
    explanation = "The set was clearly easier than target (feel 5/5). A small increase is reasonable if warmups and form agree.";
  } else if (feelPoorAccessory) {
    type = "cue";
    priority = "low";
    title = "Improve stimulus";
    explanation = "Muscle feel was poor on an accessory. Try slower tempo, a setup cue, or a substitute next round.";
  }

  if (multiplier === 1 && type === "load-change") return undefined;
  const increment = user.unit === "kg" ? 2.5 : exercise.trackPerSide || exercise.category === "dumbbell" ? 2.5 : 5;
  const suggestedWeight = multiplier === 0 ? 0 : roundToIncrement(loggedSet.actualWeight * multiplier, increment);
  return {
    id: createId("rec"),
    userId: user.id,
    type,
    priority,
    title,
    explanation,
    action: {
      exerciseId: exercise.id,
      setId: loggedSet.id,
      suggestedWeight
    },
    createdAt: nowIso()
  };
}

export function calculateMuscleVolume(sessions: WorkoutSession[], exercises: Exercise[], userId: string): Partial<Record<MuscleGroup, number>> {
  const totals: Partial<Record<MuscleGroup, number>> = {};
  const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
  sessions
    .filter((session) => session.userId === userId && new Date(session.startedAt).getTime() >= sevenDaysAgo)
    .forEach((session) => {
      session.loggedExercises.forEach((logged) => {
        const exercise = exercises.find((item) => item.id === logged.exerciseId);
        if (!exercise) return;
        const hardSets = logged.sets.filter((set) => set.kind !== "warmup").length;
        exercise.directVolumeMuscles.forEach((muscle) => {
          totals[muscle] = (totals[muscle] || 0) + hardSets;
        });
        exercise.indirectVolumeMuscles.forEach((muscle) => {
          totals[muscle] = (totals[muscle] || 0) + hardSets * 0.5;
        });
      });
    });
  return totals;
}

export function calculateSessionTonnage(session: WorkoutSession): number {
  return session.loggedExercises.reduce(
    (exerciseTotal, exercise) =>
      exerciseTotal + exercise.sets.reduce((setTotal, set) => setTotal + (set.skipped ? 0 : set.actualWeight * set.actualReps), 0),
    0
  );
}

export function powerliftingMetrics(db: TrainingDatabase, user: UserProfile): DashboardMetric[] {
  const squat = bestE1rmForExercise(db.sessions, user.id, "ex_squat_comp");
  const bench = bestE1rmForExercise(db.sessions, user.id, "ex_bench_comp");
  const deadlift = bestE1rmForExercise(db.sessions, user.id, "ex_deadlift_comp");
  const fallback = (lift: string) => user.maxes.find((max) => max.liftName.toLowerCase().includes(lift))?.oneRepMax || 0;
  const s = squat || fallback("squat");
  const b = bench || fallback("bench");
  const d = deadlift || fallback("deadlift");
  return [
    { id: "pl_squat", label: "Squat e1RM", value: s || "-", unit: user.unit, trend: "flat" },
    { id: "pl_bench", label: "Bench e1RM", value: b || "-", unit: user.unit, trend: bench ? "up" : "flat" },
    { id: "pl_deadlift", label: "Deadlift e1RM", value: d || "-", unit: user.unit, trend: "flat" },
    { id: "pl_total", label: "Estimated total", value: s + b + d || "-", unit: user.unit, trend: "flat" }
  ];
}

export function bestE1rmForExercise(sessions: WorkoutSession[], userId: string, exerciseId: string): number {
  return Math.max(
    0,
    ...sessions
      .filter((session) => session.userId === userId)
      .flatMap((session) => session.loggedExercises)
      .filter((exercise) => exercise.exerciseId === exerciseId)
      .flatMap((exercise) => exercise.sets)
      .filter((set) => !set.skipped && set.kind !== "warmup")
      .map((set) => estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10))
  );
}

export function recentTopSets(sessions: WorkoutSession[], userId: string): { exerciseId: string; set: LoggedSet }[] {
  return sessions
    .filter((session) => session.userId === userId && session.status === "completed")
    .flatMap((session) =>
      session.loggedExercises.flatMap((exercise) => exercise.sets.map((set) => ({ exerciseId: exercise.exerciseId, set })))
    )
    .filter(({ set }) => !set.skipped && set.kind !== "warmup")
    .sort((a, b) => b.set.completedAt.localeCompare(a.set.completedAt))
    .slice(0, 8);
}

export function detectWeakPointTags(loggedExercise: LoggedExercise): string[] {
  const text = [loggedExercise.notes, ...loggedExercise.sets.map((set) => set.notes)].filter(Boolean).join(" ").toLowerCase();
  const tags: string[] = [];
  if (text.includes("off chest") || text.includes("slow off chest")) tags.push("weak-off-chest");
  if (text.includes("lockout")) tags.push("lockout-weakness");
  if (text.includes("out of hole") || text.includes("hole")) tags.push("squat-out-of-hole");
  if (text.includes("upper back collapse")) tags.push("upper-back-collapse");
  if (text.includes("off floor")) tags.push("deadlift-off-floor");
  if (text.includes("grip")) tags.push("grip-weakness");
  if (text.includes("no pump") || text.includes("poor feel")) tags.push("poor-stimulus");
  return [...new Set([...loggedExercise.weakPointTags, ...tags])];
}

export function summarizeWeek(db: TrainingDatabase, user: UserProfile): {
  completedWorkouts: number;
  missedWorkouts: number;
  volume: Partial<Record<MuscleGroup, number>>;
  tonnage: number;
  recommendations: string[];
} {
  const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const sessions = db.sessions.filter((session) => user.id === session.userId && new Date(session.startedAt).getTime() >= sevenDaysAgo);
  const completed = sessions.filter((session) => session.status === "completed");
  const volume = calculateMuscleVolume(completed, db.exercises, user.id);
  const tonnage = completed.reduce((sum, session) => sum + calculateSessionTonnage(session), 0);
  const highPainSets = completed.flatMap((session) => session.loggedExercises).flatMap((exercise) => exercise.sets).filter((set) => (set.painRating || 0) >= 5).length;
  const hardFailed = completed
    .flatMap((session) => session.loggedExercises)
    .flatMap((exercise) => exercise.sets)
    .filter((set) => (set.setRating ?? 3) <= 2).length;
  const recommendations: string[] = [];
  if (highPainSets) recommendations.push("Pain is showing up. Keep substitutions available and avoid forcing painful patterns.");
  if (hardFailed >= 4) recommendations.push("Several sets were hard or failed. Hold load jumps next week or reduce accessory volume.");
  if ((volume["side-delts"] || 0) < 4 && user.goal !== "general-health") recommendations.push("Side delt direct volume is low. Add 2-4 sets if recovery is normal.");
  if (!recommendations.length) recommendations.push("Training stress looks manageable. Progress the main plan conservatively.");
  return {
    completedWorkouts: completed.length,
    missedWorkouts: Math.max(0, user.availableDaysPerWeek - completed.length),
    volume,
    tonnage,
    recommendations
  };
}

export interface WeekReview {
  weekNumber: number;
  totalWeeks: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  plannedWorkouts: number;
  hardSetsCompleted: number;
  averageRpe: number;
  averageSetRating: number;
  averageReadiness: number | null;
  isAllDone: boolean;
  suggestions: string[];
}

export function isTrainingWeekComplete(week: TrainingBlock["weeks"][number] | undefined, block: TrainingBlock, sessions: WorkoutSession[]): boolean {
  if (!week) return false;
  const trainingDays = week.workouts.filter((day) => day.status !== "rest");
  if (!trainingDays.length) return false;
  return trainingDays.every((day) => {
    const isSkipped = block.skippedWorkoutDayIds?.includes(day.id) || day.status === "skipped";
    const isCompleted = sessions.some((s) => s.workoutDayId === day.id && s.status === "completed");
    return isSkipped || isCompleted;
  });
}

export function isBlockWeekComplete(block: TrainingBlock, sessions: WorkoutSession[]): boolean {
  const currentWeek = block.weeks.find((w) => w.weekNumber === block.currentWeek);
  return isTrainingWeekComplete(currentWeek, block, sessions);
}

export function generateWeekReview(block: TrainingBlock, sessions: WorkoutSession[]): WeekReview {
  const week = block.weeks.find((w) => w.weekNumber === block.currentWeek);
  if (!week) {
    return { weekNumber: block.currentWeek, totalWeeks: block.lengthWeeks, completedWorkouts: 0, skippedWorkouts: 0, plannedWorkouts: 0, hardSetsCompleted: 0, averageRpe: 0, averageSetRating: 0, averageReadiness: null, isAllDone: false, suggestions: [] };
  }

  const weekSessions = sessions.filter((s) => s.workoutDayId && week.workouts.some((d) => d.id === s.workoutDayId));
  const completed = weekSessions.filter((s) => s.status === "completed");
  const skipped = week.workouts.filter((d) => block.skippedWorkoutDayIds?.includes(d.id) || d.status === "skipped").length;
  const allSets = completed.flatMap((s) => s.loggedExercises).flatMap((e) => e.sets);
  const hardSets = allSets.filter((s) => !s.skipped && s.kind !== "warmup");
  const averageRpe = safeAverageRpe(hardSets);
  const averageSetRating = hardSets.length ? Number((hardSets.reduce((sum, s) => sum + (s.setRating ?? 3), 0) / hardSets.length).toFixed(1)) : 0;
  const readinessScores = completed.map((s) => s.readiness?.readinessScore).filter((r): r is number => r !== undefined);
  const averageReadiness = readinessScores.length ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length) : null;
  const isAllDone = isBlockWeekComplete(block, sessions);

  const weekProgress = block.currentWeek / block.lengthWeeks;
  const suggestions: string[] = [];

  if (skipped >= 2) suggestions.push("Multiple workouts were skipped. Consider repeating this week or reducing volume next week to avoid debt.");
  if (averageSetRating < 2.5 && hardSets.length >= 3) suggestions.push("Average set feel was low (≤ 2.5/5). Hold loads steady next week and monitor recovery.");
  else if (averageSetRating >= 4.5 && hardSets.length >= 3) suggestions.push("Sets felt easy (≥ 4.5/5). A conservative load increase next week is reasonable.");
  if (averageRpe > 9 && hardSets.filter((s) => s.actualRpe).length >= 3) suggestions.push("Average RPE exceeded 9 across working sets. Reduce load 2-5% or trim one accessory set next week.");
  if (averageReadiness !== null && averageReadiness < 55) suggestions.push("Readiness averaged below 55 this week. Prioritize sleep, nutrition, and recovery before pushing load next week.");
  if (weekProgress >= 0.75 && block.type !== "deload") suggestions.push(`You are in week ${block.currentWeek} of ${block.lengthWeeks}. Plan a deload after this block finishes.`);
  if (!suggestions.length) suggestions.push("Performance matched expectations. Continue conservative progression into next week.");

  return { weekNumber: block.currentWeek, totalWeeks: block.lengthWeeks, completedWorkouts: completed.length, skippedWorkouts: skipped, plannedWorkouts: week.workouts.length, hardSetsCompleted: hardSets.length, averageRpe, averageSetRating, averageReadiness, isAllDone, suggestions };
}

export interface NextWeekAdjustment {
  exerciseId: string;
  exerciseName: string;
  suggestion: "increase-load" | "decrease-load" | "hold" | "swap";
  reason: string;
}

export function recommendNextWeekAdjustments(block: TrainingBlock, sessions: WorkoutSession[]): NextWeekAdjustment[] {
  const review = generateWeekReview(block, sessions);
  if (!review.isAllDone) return [];
  const adjustments: NextWeekAdjustment[] = [];
  const currentWeek = block.weeks.find((w) => w.weekNumber === block.currentWeek);
  if (!currentWeek) return adjustments;

  const weekSessions = sessions.filter((s) => s.workoutDayId && currentWeek.workouts.some((d) => d.id === s.workoutDayId) && s.status === "completed");
  const allLoggedExercises = weekSessions.flatMap((s) => s.loggedExercises);

  for (const log of allLoggedExercises) {
    const sets = log.sets.filter((s) => !s.skipped && s.kind !== "warmup");
    if (!sets.length) continue;
    const avgRpe = safeAverageRpe(sets);
    const avgFeel = sets.reduce((sum, s) => sum + (s.setRating ?? 3), 0) / sets.length;
    let suggestion: NextWeekAdjustment["suggestion"] = "hold";
    let reason = "Performance matched expectations.";
    if (avgFeel >= 4.5 && avgRpe <= 7.5) {
      suggestion = "increase-load";
      reason = `Sets felt easy (avg ${avgFeel.toFixed(1)}/5) at manageable RPE — a small load increase is warranted.`;
    } else if (avgFeel <= 2 || avgRpe >= 9.5) {
      suggestion = "decrease-load";
      reason = avgRpe >= 9.5 ? `Average RPE hit ${avgRpe.toFixed(1)} — reduce load to stay within target range.` : `Set feel averaged ${avgFeel.toFixed(1)}/5 — hold or reduce to restore quality.`;
    }
    adjustments.push({ exerciseId: log.exerciseId, exerciseName: log.exerciseId, suggestion, reason });
  }

  return adjustments;
}
