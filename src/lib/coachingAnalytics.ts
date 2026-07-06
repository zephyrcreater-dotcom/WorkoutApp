// Coaching-oriented analytics layer: turns raw session/set/readiness history into
// decision-focused scores, insights, and recommendations. Pure functions only — no
// React, no persistence. Consumed by the Analytics (ProgressScreen) and per-exercise
// analytics views in App.tsx.
import type {
  Exercise,
  ID,
  LoggedSet,
  MuscleGroup,
  Program,
  ProgramGap,
  ProgramGapSeverity,
  TrainingDatabase,
  UserProfile,
  WorkoutSession,
} from "../types/domain";
import { getEffectiveLoading } from "./loadingProfiles";
import { muscleVolumeTargets } from "./programmingLogic";
import { summarizePlannedVolume } from "./programAnalysis";
import {
  calculateE1RMFromSet,
  calculateMuscleVolume,
  calculateWorkoutScore,
  formatWeight,
  getExerciseLoadUnit,
  isBodyweightExercise,
  safeAverageRpe,
} from "./trainingMath";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isWorkingSet(set: LoggedSet): boolean {
  return !set.skipped && set.kind !== "warmup";
}

function weightedAverage(parts: { value: number | null; weight: number }[]): number | null {
  const available = parts.filter((p) => p.value !== null && p.weight > 0);
  const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
  if (!totalWeight) return null;
  return available.reduce((sum, p) => sum + (p.value as number) * p.weight, 0) / totalWeight;
}

/** Normalizes a 1-5 scale (setRating, mental/physical/recovery scores) to 0-100. */
function scale1to5(value?: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  return clamp(((value - 1) / 4) * 100, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance Score
// ─────────────────────────────────────────────────────────────────────────────

export interface PerformanceSubScores {
  progression: number | null;
  completion: number | null;
  rpeAccuracy: number | null;
  feel: number | null;
}

export interface PerformanceScoreResult {
  score: number | null;
  subScores: PerformanceSubScores;
  sampleNote: string;
}

export interface PerformanceScoreSummary {
  current: PerformanceScoreResult;
  deltaVsPreviousWeek: number | null;
  reason: string;
}

function computeProgressionSubScore(db: TrainingDatabase, user: UserProfile, referenceMs: number): number | null {
  const sessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed");
  const exerciseIds = new Set<ID>();
  sessions.forEach((s) => {
    const age = referenceMs - new Date(s.startedAt).getTime();
    if (age < 0 || age >= 5 * WEEK) return;
    s.loggedExercises.forEach((l) => exerciseIds.add(l.exerciseId));
  });

  const exerciseScores: number[] = [];
  exerciseIds.forEach((exerciseId) => {
    const setsWithAge = sessions
      .flatMap((s) => s.loggedExercises.filter((l) => l.exerciseId === exerciseId).map((l) => ({ l, age: referenceMs - new Date(s.startedAt).getTime() })))
      .filter(({ age }) => age >= 0 && age < 5 * WEEK)
      .flatMap(({ l, age }) => l.sets.filter(isWorkingSet).map((set) => ({ set, age })));

    const currentBest = Math.max(0, ...setsWithAge.filter(({ age }) => age < WEEK).map(({ set }) => calculateE1RMFromSet(set)));
    const bucketBests: number[] = [];
    for (let bucket = 1; bucket <= 4; bucket++) {
      const bucketSets = setsWithAge.filter(({ age }) => age >= bucket * WEEK && age < (bucket + 1) * WEEK);
      const best = Math.max(0, ...bucketSets.map(({ set }) => calculateE1RMFromSet(set)));
      if (best > 0) bucketBests.push(best);
    }
    if (currentBest <= 0 || !bucketBests.length) return; // insufficient data — ignore this exercise
    const comparisonAvg = bucketBests.reduce((a, b) => a + b, 0) / bucketBests.length;
    if (comparisonAvg <= 0) return;
    const pctChange = ((currentBest - comparisonAvg) / comparisonAvg) * 100;
    exerciseScores.push(clamp(75 + pctChange * 6, 0, 100));
  });

  if (!exerciseScores.length) return null;
  return exerciseScores.reduce((a, b) => a + b, 0) / exerciseScores.length;
}

function computeCompletionSubScore(db: TrainingDatabase, user: UserProfile, referenceMs: number): number | null {
  const windowSessions = db.sessions.filter((s) => {
    if (s.userId !== user.id) return false;
    const age = referenceMs - new Date(s.startedAt).getTime();
    return age >= 0 && age < 2 * WEEK;
  });
  if (!windowSessions.length) return 0;
  const completed = windowSessions.filter((s) => s.status === "completed");
  const workoutCompletionRate = clamp(completed.length / Math.max(1, user.availableDaysPerWeek * 2), 0, 1);

  const sets = completed.flatMap((s) => s.loggedExercises).flatMap((l) => l.sets);
  const setCompletionRate = sets.length ? 1 - sets.filter((s) => s.skipped).length / sets.length : 1;

  const requiredSkipped = completed.flatMap((s) => s.loggedExercises).filter((l) => {
    const snapshot = l.plannedExerciseSnapshot;
    if (!snapshot?.required || snapshot.isExtra) return false;
    return !l.sets.some((set) => !set.skipped);
  }).length;

  return clamp(100 * (0.5 * workoutCompletionRate + 0.5 * setCompletionRate) - requiredSkipped * 10, 0, 100);
}

function computeRpeAccuracySubScore(db: TrainingDatabase, user: UserProfile, referenceMs: number): number | null {
  const sets = db.sessions
    .filter((s) => s.userId === user.id && s.status === "completed")
    .filter((s) => {
      const age = referenceMs - new Date(s.startedAt).getTime();
      return age >= 0 && age < 2 * WEEK;
    })
    .flatMap((s) => s.loggedExercises)
    .flatMap((l) => l.sets)
    .filter((set) => isWorkingSet(set) && typeof set.targetRpe === "number" && typeof set.actualRpe === "number");
  if (!sets.length) return null;
  const scores = sets.map((set) => {
    const delta = Math.abs((set.actualRpe as number) - (set.targetRpe as number));
    if (delta <= 0.5) return 100;
    if (delta <= 1) return 80;
    return clamp(80 - (delta - 1) * 20, 0, 100);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function computeFeelSubScore(db: TrainingDatabase, user: UserProfile, referenceMs: number): number | null {
  const sessions = db.sessions.filter((s) => {
    if (s.userId !== user.id) return false;
    const age = referenceMs - new Date(s.startedAt).getTime();
    return age >= 0 && age < 2 * WEEK;
  });
  const readiness = db.readiness.filter((r) => {
    if (r.userId !== user.id) return false;
    const age = referenceMs - new Date(r.date).getTime();
    return age >= 0 && age < 2 * WEEK;
  });

  const mental = readiness.map((r) => scale1to5(r.mentalScore)).filter((v): v is number => v !== undefined);
  const physical = readiness.map((r) => scale1to5(r.physicalScore)).filter((v): v is number => v !== undefined);
  const recovery = readiness.map((r) => scale1to5(r.recoveryScore)).filter((v): v is number => v !== undefined);
  const readinessScoreOnly = readiness.map((r) => r.readinessScore).filter((v): v is number => typeof v === "number");

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const perSessionFeel = completedSessions
    .map((s) => {
      const sets = s.loggedExercises.flatMap((l) => l.sets).filter((set) => !set.skipped);
      if (!sets.length) return undefined;
      const avgRating = sets.reduce((sum, set) => sum + (set.setRating ?? 3), 0) / sets.length;
      return scale1to5(avgRating);
    })
    .filter((v): v is number => v !== undefined);
  const allSetFeel = completedSessions
    .flatMap((s) => s.loggedExercises)
    .flatMap((l) => l.sets)
    .filter((set) => !set.skipped)
    .map((set) => scale1to5(set.setRating ?? 3))
    .filter((v): v is number => v !== undefined);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const readinessComponent = mental.length || physical.length || recovery.length
    ? weightedAverage([
        { value: avg(mental), weight: 1 },
        { value: avg(physical), weight: 1 },
        { value: avg(recovery), weight: 1 },
      ])
    : avg(readinessScoreOnly);
  const workoutFeelComponent = avg(perSessionFeel);
  const setFeelComponent = avg(allSetFeel);

  return weightedAverage([
    { value: readinessComponent, weight: 1 },
    { value: workoutFeelComponent, weight: 1 },
    { value: setFeelComponent, weight: 1 },
  ]);
}

function buildPerformanceScoreResult(db: TrainingDatabase, user: UserProfile, referenceMs: number): PerformanceScoreResult {
  const progression = computeProgressionSubScore(db, user, referenceMs);
  const completion = computeCompletionSubScore(db, user, referenceMs);
  const rpeAccuracy = computeRpeAccuracySubScore(db, user, referenceMs);
  let feel = computeFeelSubScore(db, user, referenceMs);

  // Low readiness that didn't actually hurt performance shouldn't be blindly penalized —
  // soften the feel component's drag on the overall score when the other signals are strong.
  const otherAvg = weightedAverage([
    { value: progression, weight: 1 },
    { value: completion, weight: 1 },
    { value: rpeAccuracy, weight: 1 },
  ]);
  if (feel !== null && otherAvg !== null && otherAvg >= 75 && feel < 50) {
    feel = feel + (75 - feel) * 0.4;
  }

  const score = weightedAverage([
    { value: progression, weight: 0.4 },
    { value: completion, weight: 0.25 },
    { value: rpeAccuracy, weight: 0.2 },
    { value: feel, weight: 0.15 },
  ]);

  const sessionsConsidered = db.sessions.filter((s) => {
    if (s.userId !== user.id || s.status !== "completed") return false;
    const age = referenceMs - new Date(s.startedAt).getTime();
    return age >= 0 && age < 2 * WEEK;
  }).length;
  const sampleNote = sessionsConsidered > 0
    ? `Based on ${sessionsConsidered} session${sessionsConsidered === 1 ? "" : "s"} in the last 2 weeks.`
    : "Log a few completed workouts to unlock this score.";

  return {
    score: score === null ? null : Math.round(clamp(score, 0, 100)),
    subScores: {
      progression: progression === null ? null : Math.round(progression),
      completion: completion === null ? null : Math.round(completion),
      rpeAccuracy: rpeAccuracy === null ? null : Math.round(rpeAccuracy),
      feel: feel === null ? null : Math.round(feel),
    },
    sampleNote,
  };
}

const REASON_PHRASES: Record<keyof PerformanceSubScores, { up: string; down: string }> = {
  progression: { up: "progression improved", down: "progression slipped" },
  completion: { up: "you completed more of your planned work", down: "completion dropped" },
  rpeAccuracy: { up: "RPE accuracy was better", down: "RPE accuracy was worse" },
  feel: { up: "readiness and feel improved", down: "readiness and feel dipped" },
};

export function computePerformanceScore(db: TrainingDatabase, user: UserProfile): PerformanceScoreSummary {
  const now = Date.now();
  const current = buildPerformanceScoreResult(db, user, now);
  const previous = buildPerformanceScoreResult(db, user, now - WEEK);

  const deltaVsPreviousWeek = current.score !== null && previous.score !== null ? current.score - previous.score : null;

  let reason: string;
  if (current.score === null) {
    reason = current.sampleNote;
  } else if (previous.score === null) {
    reason = "Building your baseline — check back after a few more sessions for a week-over-week comparison.";
  } else {
    const deltas = (Object.keys(REASON_PHRASES) as (keyof PerformanceSubScores)[])
      .map((key) => {
        const c = current.subScores[key];
        const p = previous.subScores[key];
        return c !== null && p !== null ? { key, delta: c - p } : null;
      })
      .filter((d): d is { key: keyof PerformanceSubScores; delta: number } => d !== null && Math.abs(d.delta) >= 4)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 2);
    if (!deltas.length) {
      reason = "Performance held steady week over week.";
    } else {
      const phrases = deltas.map((d) => (d.delta > 0 ? REASON_PHRASES[d.key].up : REASON_PHRASES[d.key].down));
      const joined = phrases.join(" and ");
      reason = `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
    }
  }

  return { current, deltaVsPreviousWeek, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise progression + stale-weight / ready-to-progress detection
// ─────────────────────────────────────────────────────────────────────────────

export type ExerciseRecommendationStatus = "increase" | "repeat" | "reduce" | "swap" | "insufficient";

export interface ExerciseProgressionEntry {
  exerciseId: ID;
  exercise?: Exercise;
  lastSet?: LoggedSet;
  lastSessionDate?: string;
  bestE1rm: number;
  currentE1rm: number;
  trendVsLastWeek: number | null;
  trendVs4Weeks: number | null;
  sessionCount: number;
  sameWeightStreak: number;
  status: ExerciseRecommendationStatus;
  statusDetail: string;
}

interface SessionPoint {
  date: string;
  ageMs: number;
  topSet: LoggedSet;
}

function describeStatus(params: {
  status: ExerciseRecommendationStatus;
  exercise?: Exercise;
  user: UserProfile;
  db: TrainingDatabase;
  topSet: LoggedSet;
  sameWeightStreak: number;
  sessionCount: number;
}): string {
  const { status, exercise, user, db, topSet, sameWeightStreak, sessionCount } = params;
  const unit = getExerciseLoadUnit(exercise, user, topSet.unit);
  const weight = topSet.actualWeight;
  switch (status) {
    case "increase": {
      const increment = exercise ? getEffectiveLoading(exercise, db.loadingProfiles, unit).increment : 5;
      const min = weight + increment;
      const max = weight + increment * 2;
      return `${formatWeight(weight)} ${unit} completed cleanly for ${sameWeightStreak} sessions in a row. Increase to ${formatWeight(min)}-${formatWeight(max)} ${unit} next time.`;
    }
    case "repeat":
      return `Same weight (${formatWeight(weight)} ${unit}) for ${sameWeightStreak} sessions, but RPE/feel isn't clean enough to progress yet. Repeat this weight.`;
    case "reduce":
      return "Performance has dropped over the last 2 sessions. Reduce load or take a deload on this exercise.";
    case "swap":
      return "Performance has stalled for several sessions with no rebound. Consider swapping this exercise for a variation.";
    case "insufficient":
    default:
      return sessionCount === 0 ? "No sessions logged yet." : `Needs ${Math.max(0, 3 - sessionCount)} more session${Math.max(0, 3 - sessionCount) === 1 ? "" : "s"} to detect a pattern.`;
  }
}

function classifyExercise(points: SessionPoint[], exercise: Exercise | undefined, user: UserProfile, db: TrainingDatabase): {
  status: ExerciseRecommendationStatus;
  detail: string;
  sameWeightStreak: number;
} {
  const sessionCount = points.length;
  if (sessionCount < 3) {
    return { status: "insufficient", detail: describeStatus({ status: "insufficient", exercise, user, db, topSet: points[0]?.topSet ?? ({} as LoggedSet), sameWeightStreak: 0, sessionCount }), sameWeightStreak: 0 };
  }

  const bodyweightNoAddedLoad = exercise && isBodyweightExercise(exercise) && points[0].topSet.actualWeight <= 0;
  if (bodyweightNoAddedLoad) {
    return { status: "insufficient", detail: "Bodyweight movement — track added load to get weight-progression recommendations.", sameWeightStreak: 0 };
  }

  const weights = points.map((p) => Math.round(p.topSet.actualWeight * 10) / 10);
  let sameWeightStreak = 1;
  while (sameWeightStreak < weights.length && weights[sameWeightStreak] === weights[0]) sameWeightStreak++;

  if (sameWeightStreak >= 3) {
    const qualifying = points.slice(0, sameWeightStreak);
    const allGoodRpe = qualifying.every((p) => {
      const target = p.topSet.targetRpe;
      const actual = p.topSet.actualRpe;
      return target === undefined || actual === undefined || actual <= target + 0.001;
    });
    const allGoodFeel = qualifying.every((p) => (p.topSet.setRating ?? 3) >= 3);
    const allRepsMet = qualifying.every((p) => p.topSet.actualReps >= (p.topSet.plannedReps ?? p.topSet.actualReps));
    const status: ExerciseRecommendationStatus = allGoodRpe && allGoodFeel && allRepsMet ? "increase" : "repeat";
    return {
      status,
      detail: describeStatus({ status, exercise, user, db, topSet: points[0].topSet, sameWeightStreak, sessionCount }),
      sameWeightStreak,
    };
  }

  // Not the same weight repeated — check for a declining e1RM pattern instead.
  const e1rms = points.map((p) => calculateE1RMFromSet(p.topSet));
  let declineStreak = 0;
  for (let i = 0; i < e1rms.length - 1; i++) {
    if (e1rms[i] > 0 && e1rms[i + 1] > 0 && e1rms[i] < e1rms[i + 1] * 0.97) declineStreak++;
    else break;
  }
  if (declineStreak >= 2) {
    const status: ExerciseRecommendationStatus = declineStreak >= 3 && e1rms.length >= 4 ? "swap" : "reduce";
    return { status, detail: describeStatus({ status, exercise, user, db, topSet: points[0].topSet, sameWeightStreak, sessionCount }), sameWeightStreak };
  }

  return { status: "insufficient", detail: "No clear repeat/progression pattern yet — keep logging to build a trend.", sameWeightStreak };
}

export function computeExerciseProgressionEntries(
  db: TrainingDatabase,
  user: UserProfile,
  options?: { limit?: number; onlyExerciseId?: ID }
): ExerciseProgressionEntry[] {
  const now = Date.now();
  const sessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed");
  const byExercise = new Map<ID, { allSets: { set: LoggedSet; ageMs: number }[]; points: SessionPoint[] }>();

  sessions.forEach((session) => {
    const ageMs = now - new Date(session.startedAt).getTime();
    session.loggedExercises.forEach((logged) => {
      if (options?.onlyExerciseId && logged.exerciseId !== options.onlyExerciseId) return;
      const workingSets = logged.sets.filter(isWorkingSet);
      if (!workingSets.length) return;
      const entry = byExercise.get(logged.exerciseId) ?? { allSets: [], points: [] };
      workingSets.forEach((set) => entry.allSets.push({ set, ageMs }));
      const topSet = workingSets.reduce((best, set) => (calculateE1RMFromSet(set) > calculateE1RMFromSet(best) ? set : best));
      entry.points.push({ date: session.completedAt || session.startedAt, ageMs, topSet });
      byExercise.set(logged.exerciseId, entry);
    });
  });

  const results: ExerciseProgressionEntry[] = [];
  byExercise.forEach((data, exerciseId) => {
    const exercise = db.exercises.find((e) => e.id === exerciseId);
    const points = data.points.slice().sort((a, b) => a.ageMs - b.ageMs); // most recent first
    const bestE1rm = Math.max(0, ...data.allSets.map(({ set }) => calculateE1RMFromSet(set)));
    const currentE1rm = Math.max(0, ...data.allSets.filter(({ ageMs }) => ageMs < WEEK).map(({ set }) => calculateE1RMFromSet(set)));
    const week1E1rm = Math.max(0, ...data.allSets.filter(({ ageMs }) => ageMs >= WEEK && ageMs < 2 * WEEK).map(({ set }) => calculateE1RMFromSet(set)));
    const week3E1rm = Math.max(0, ...data.allSets.filter(({ ageMs }) => ageMs >= 3 * WEEK && ageMs < 4 * WEEK).map(({ set }) => calculateE1RMFromSet(set)));
    const trendVsLastWeek = currentE1rm && week1E1rm ? currentE1rm - week1E1rm : null;
    const trendVs4Weeks = currentE1rm && week3E1rm ? currentE1rm - week3E1rm : null;

    const { status, detail, sameWeightStreak } = classifyExercise(points, exercise, user, db);

    results.push({
      exerciseId,
      exercise,
      lastSet: points[0]?.topSet,
      lastSessionDate: points[0]?.date,
      bestE1rm,
      currentE1rm,
      trendVsLastWeek,
      trendVs4Weeks,
      sessionCount: points.length,
      sameWeightStreak,
      status,
      statusDetail: detail,
    });
  });

  const sorted = results.sort((a, b) => (b.currentE1rm || b.bestE1rm) - (a.currentE1rm || a.bestE1rm));
  return options?.limit ? sorted.slice(0, options.limit) : sorted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coach's Notebook
// ─────────────────────────────────────────────────────────────────────────────

export interface CoachInsight {
  id: string;
  text: string;
  tone: "positive" | "warning" | "info";
}

function muscleLabel(m: string): string {
  return m.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function findExceededPlannedRepsInsight(db: TrainingDatabase, user: UserProfile, entries: ExerciseProgressionEntry[]): CoachInsight | undefined {
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.exercise) continue;
    const sessions = db.sessions
      .filter((s) => s.userId === user.id && s.status === "completed")
      .flatMap((s) => s.loggedExercises.filter((l) => l.exerciseId === entry.exerciseId).map((l) => ({ l, ageMs: now - new Date(s.startedAt).getTime() })))
      .sort((a, b) => a.ageMs - b.ageMs);
    let streak = 0;
    for (const { l } of sessions) {
      const topSet = l.sets.filter(isWorkingSet).reduce<LoggedSet | undefined>((best, set) => (!best || calculateE1RMFromSet(set) > calculateE1RMFromSet(best) ? set : best), undefined);
      if (!topSet || topSet.plannedReps === undefined) break;
      if (topSet.actualReps > topSet.plannedReps) streak++;
      else break;
    }
    if (streak >= 3) {
      return {
        id: `exceeded-reps-${entry.exerciseId}`,
        text: `${entry.exercise.name} has exceeded planned reps ${streak} sessions in a row. Increase load or raise the target reps.`,
        tone: "info",
      };
    }
  }
  return undefined;
}

function findRpeOvershootInsight(db: TrainingDatabase, user: UserProfile): CoachInsight | undefined {
  const now = Date.now();
  const byName = new Map<string, { sum: number; count: number; sessions: Set<string> }>();
  db.sessions
    .filter((s) => s.userId === user.id && s.status === "completed" && now - new Date(s.startedAt).getTime() < 4 * WEEK)
    .forEach((s) => {
      const sets = s.loggedExercises.flatMap((l) => l.sets).filter((set) => isWorkingSet(set) && typeof set.targetRpe === "number" && typeof set.actualRpe === "number");
      if (!sets.length) return;
      const entry = byName.get(s.name) ?? { sum: 0, count: 0, sessions: new Set() };
      sets.forEach((set) => {
        entry.sum += (set.actualRpe as number) - (set.targetRpe as number);
        entry.count++;
      });
      entry.sessions.add(s.id);
      byName.set(s.name, entry);
    });

  let worst: { name: string; avgDelta: number } | undefined;
  byName.forEach((entry, name) => {
    if (entry.sessions.size < 3) return;
    const avgDelta = entry.sum / entry.count;
    if (avgDelta >= 1 && (!worst || avgDelta > worst.avgDelta)) worst = { name, avgDelta };
  });
  if (!worst) return undefined;
  return {
    id: `rpe-overshoot-${worst.name}`,
    text: `You consistently overshoot RPE on ${worst.name}. Reduce starting loads by 2.5-5 lb or keep RPE targets lower.`,
    tone: "warning",
  };
}

function findSkippedMuscleInsight(db: TrainingDatabase, user: UserProfile, activeProgram?: Program): CoachInsight | undefined {
  if (!activeProgram) return undefined;
  const plannedVolume = summarizePlannedVolume(activeProgram, db);
  const plannedMuscles = (Object.keys(plannedVolume) as MuscleGroup[]).filter((m) => (plannedVolume[m] || 0) > 0);
  if (!plannedMuscles.length) return undefined;

  const now = Date.now();
  let worst: { muscle: MuscleGroup; misses: number } | undefined;
  plannedMuscles.forEach((muscle) => {
    let misses = 0;
    for (let week = 0; week < 6; week++) {
      const start = now - (week + 1) * WEEK;
      const end = now - week * WEEK;
      const hasSets = db.sessions
        .filter((s) => s.userId === user.id && s.status === "completed")
        .some((s) => {
          const t = new Date(s.startedAt).getTime();
          if (t < start || t >= end) return false;
          return s.loggedExercises.some((l) => {
            if (!l.sets.some(isWorkingSet)) return false;
            const exercise = db.exercises.find((e) => e.id === l.exerciseId);
            return exercise?.directVolumeMuscles.includes(muscle);
          });
        });
      if (!hasSets) misses++;
    }
    if (misses >= 5 && (!worst || misses > worst.misses)) worst = { muscle, misses };
  });
  if (!worst) return undefined;
  return {
    id: `skipped-muscle-${worst.muscle}`,
    text: `You've skipped ${muscleLabel(worst.muscle)} in ${worst.misses} of the last 6 weeks. Consider removing it from this split if that's intentional.`,
    tone: "warning",
  };
}

function findRecoveryPerformanceInsight(db: TrainingDatabase, user: UserProfile): CoachInsight | undefined {
  const now = Date.now();
  const exerciseIds = new Set<ID>();
  db.sessions.filter((s) => s.userId === user.id && s.status === "completed" && s.readiness?.recoveryScore !== undefined).forEach((s) =>
    s.loggedExercises.forEach((l) => exerciseIds.add(l.exerciseId))
  );

  let best: { exercise: Exercise; delta: number } | undefined;
  exerciseIds.forEach((exerciseId) => {
    const exercise = db.exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const rows = db.sessions
      .filter((s) => s.userId === user.id && s.status === "completed" && s.readiness?.recoveryScore !== undefined)
      .filter((s) => now - new Date(s.startedAt).getTime() < 8 * WEEK)
      .flatMap((s) => s.loggedExercises.filter((l) => l.exerciseId === exerciseId).flatMap((l) => l.sets.filter(isWorkingSet).map((set) => ({ set, recovery: s.readiness!.recoveryScore! }))));
    const low = rows.filter((r) => r.recovery < 3);
    const high = rows.filter((r) => r.recovery >= 3);
    if (low.length < 3 || high.length < 3) return;
    const perfScore = (arr: typeof rows) => arr.reduce((sum, r) => sum + calculateE1RMFromSet(r.set), 0) / arr.length;
    const lowAvg = perfScore(low);
    const highAvg = perfScore(high);
    if (lowAvg <= 0 || highAvg <= 0) return;
    const pctWorse = ((highAvg - lowAvg) / highAvg) * 100;
    if (pctWorse >= 5 && (!best || pctWorse > best.delta)) best = { exercise, delta: pctWorse };
  });
  if (!best) return undefined;
  return {
    id: `recovery-perf-${best.exercise.id}`,
    text: `Recovery below 3/5 is associated with worse ${best.exercise.name} performance.`,
    tone: "warning",
  };
}

export function generateCoachNotebookInsights(
  db: TrainingDatabase,
  user: UserProfile,
  progressionEntries: ExerciseProgressionEntry[],
  activeProgram?: Program
): CoachInsight[] {
  const insights: CoachInsight[] = [];

  const readyToProgress = progressionEntries
    .filter((e) => e.status === "increase")
    .sort((a, b) => b.sameWeightStreak - a.sameWeightStreak)
    .slice(0, 2);
  readyToProgress.forEach((entry) => {
    if (!entry.exercise) return;
    insights.push({
      id: `ready-${entry.exerciseId}`,
      text: `You've completed ${entry.exercise.name} at the same weight for ${entry.sameWeightStreak} sessions. Recommend increasing load next time.`,
      tone: "positive",
    });
  });

  const rpeOvershoot = findRpeOvershootInsight(db, user);
  if (rpeOvershoot) insights.push(rpeOvershoot);

  const recoveryInsight = findRecoveryPerformanceInsight(db, user);
  if (recoveryInsight) insights.push(recoveryInsight);

  const skippedMuscle = findSkippedMuscleInsight(db, user, activeProgram);
  if (skippedMuscle) insights.push(skippedMuscle);

  const exceededReps = findExceededPlannedRepsInsight(db, user, progressionEntries);
  if (exceededReps) insights.push(exceededReps);

  return insights.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Readiness analytics
// ─────────────────────────────────────────────────────────────────────────────

export function generateReadinessInsights(db: TrainingDatabase, user: UserProfile): string[] {
  const now = Date.now();
  const sessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed" && s.readiness);
  const insights: string[] = [];
  if (sessions.length < 4) return insights;

  const withRecovery = sessions.filter((s) => s.readiness?.recoveryScore !== undefined);
  if (withRecovery.length >= 4) {
    const high = withRecovery.filter((s) => (s.readiness?.recoveryScore ?? 0) >= 4);
    const low = withRecovery.filter((s) => (s.readiness?.recoveryScore ?? 0) < 4);
    if (high.length >= 2 && low.length >= 2) {
      const avgScore = (arr: WorkoutSession[]) => arr.reduce((sum, s) => sum + calculateWorkoutScore(s).score, 0) / arr.length;
      const highAvg = avgScore(high);
      const lowAvg = avgScore(low);
      if (highAvg - lowAvg >= 6) {
        insights.push(`Best sessions happen when recovery is 4+ (avg score ${Math.round(highAvg)} vs ${Math.round(lowAvg)} on lower-recovery days).`);
      }
    }
  }

  const withPhysical = sessions.filter((s) => s.readiness?.physicalScore !== undefined);
  if (withPhysical.length >= 4) {
    const low = withPhysical.filter((s) => (s.readiness?.physicalScore ?? 0) <= 2);
    const high = withPhysical.filter((s) => (s.readiness?.physicalScore ?? 0) >= 3);
    if (low.length >= 2 && high.length >= 2) {
      const rpeFor = (arr: WorkoutSession[]) => safeAverageRpe(arr.flatMap((s) => s.loggedExercises).flatMap((l) => l.sets).filter(isWorkingSet));
      const lowRpe = rpeFor(low);
      const highRpe = rpeFor(high);
      const delta = lowRpe - highRpe;
      if (delta >= 0.4) insights.push(`Low physical readiness increases average RPE by ${delta.toFixed(1)}.`);
    }
  }

  const recentSessions = sessions
    .filter((s) => now - new Date(s.startedAt).getTime() < 4 * WEEK)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (recentSessions.length >= 6) {
    const half = Math.floor(recentSessions.length / 2);
    const firstHalf = recentSessions.slice(0, half);
    const secondHalf = recentSessions.slice(half);
    const feelFor = (arr: WorkoutSession[]) => {
      const sets = arr.flatMap((s) => s.loggedExercises).flatMap((l) => l.sets).filter((s) => !s.skipped);
      return sets.length ? sets.reduce((sum, s) => sum + (s.setRating ?? 3), 0) / sets.length : 0;
    };
    const volFor = (arr: WorkoutSession[]) => arr.flatMap((s) => s.loggedExercises).flatMap((l) => l.sets).filter((s) => !s.skipped).length;
    const feelFirst = feelFor(firstHalf);
    const feelSecond = feelFor(secondHalf);
    const volFirst = volFor(firstHalf);
    const volSecond = volFor(secondHalf);
    if (feelFirst > 0 && feelSecond < feelFirst - 0.3 && volSecond > volFirst * 1.1) {
      insights.push("Workout feel is trending down despite volume increasing. Consider a deload or recovery week.");
    }
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// Program Gap Analysis — categorized
// ─────────────────────────────────────────────────────────────────────────────

export type GapCategory = "Adherence" | "Progression" | "Volume" | "Recovery" | "Frequency" | "Exercise Selection";

export interface CoachingGap {
  id: string;
  category: GapCategory;
  issue: string;
  whyItMatters: string;
  suggestedFix: string;
  severity: ProgramGapSeverity;
}

export interface CategorizedGaps {
  category: GapCategory;
  gaps: CoachingGap[];
}

const GAP_TYPE_CATEGORY: Record<ProgramGap["type"], GapCategory> = {
  volume: "Volume",
  frequency: "Frequency",
  balance: "Exercise Selection",
  fatigue: "Recovery",
  "movement-pattern": "Exercise Selection",
  "missing-category": "Exercise Selection",
  repetition: "Exercise Selection",
  recoverability: "Recovery",
};

function mapBaseGap(gap: ProgramGap): CoachingGap {
  return {
    id: gap.id,
    category: GAP_TYPE_CATEGORY[gap.type],
    issue: gap.issue,
    whyItMatters: gap.whyItMatters,
    suggestedFix: gap.suggestedFix,
    severity: gap.severity,
  };
}

function computeProgressionStallGaps(entries: ExerciseProgressionEntry[]): CoachingGap[] {
  return entries
    .filter((e) => (e.status === "reduce" || e.status === "swap") && e.sessionCount >= 3)
    .slice(0, 3)
    .map((e) => ({
      id: `progression-stall-${e.exerciseId}`,
      category: "Progression" as const,
      issue: `${e.exercise?.name ?? "An exercise"} has stalled for ${e.sessionCount} recent sessions.`,
      whyItMatters: "Repeated regression without a load or exercise change usually means fatigue is outrunning recovery, or the movement has plateaued.",
      suggestedFix: e.statusDetail,
      severity: e.status === "swap" ? "high" : "moderate",
    }));
}

function computeAdherenceGaps(db: TrainingDatabase, user: UserProfile, activeProgram?: Program): CoachingGap[] {
  const gaps: CoachingGap[] = [];
  const now = Date.now();
  const window2wk = db.sessions.filter((s) => s.userId === user.id && now - new Date(s.startedAt).getTime() < 2 * WEEK);
  const completed2wk = window2wk.filter((s) => s.status === "completed");
  const expectedSessions = user.availableDaysPerWeek * 2;
  if (expectedSessions > 0 && completed2wk.length / expectedSessions < 0.6) {
    gaps.push({
      id: "adherence-completion-rate",
      category: "Adherence",
      issue: `Only ${completed2wk.length} of ~${expectedSessions} planned workouts completed in the last 2 weeks.`,
      whyItMatters: "Consistent adherence is the biggest driver of long-term progress — missed sessions compound quickly.",
      suggestedFix: "Consider shortening sessions or reducing days/week to a level you can consistently hit.",
      severity: completed2wk.length / expectedSessions < 0.4 ? "high" : "moderate",
    });
  }

  const skippedMuscle = findSkippedMuscleInsight(db, user, activeProgram);
  if (skippedMuscle) {
    gaps.push({
      id: skippedMuscle.id,
      category: "Adherence",
      issue: skippedMuscle.text,
      whyItMatters: "Muscles that are planned but consistently skipped won't get the stimulus the program intends.",
      suggestedFix: "Either prioritize this work earlier in the session, or remove it from the split if it's not a training priority.",
      severity: "moderate",
    });
  }

  return gaps;
}

export function buildCategorizedGaps(params: {
  db: TrainingDatabase;
  user: UserProfile;
  activeProgram?: Program;
  baseGaps: ProgramGap[];
  progressionEntries: ExerciseProgressionEntry[];
}): CategorizedGaps[] {
  const { db, user, activeProgram, baseGaps, progressionEntries } = params;
  const all: CoachingGap[] = [
    ...computeAdherenceGaps(db, user, activeProgram),
    ...computeProgressionStallGaps(progressionEntries),
    ...baseGaps.map(mapBaseGap),
  ];

  const order: GapCategory[] = ["Adherence", "Progression", "Volume", "Recovery", "Frequency", "Exercise Selection"];
  const byCategory = new Map<GapCategory, CoachingGap[]>();
  all.forEach((gap) => {
    const list = byCategory.get(gap.category) ?? [];
    list.push(gap);
    byCategory.set(gap.category, list);
  });

  return order
    .map((category) => ({ category, gaps: byCategory.get(category) ?? [] }))
    .filter((group) => group.gaps.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Block-level analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockDayTypeStat {
  name: string;
  avgScore: number;
  sessionCount: number;
}

export interface BlockMuscleFinding {
  muscle: MuscleGroup;
  status: "under" | "over";
  sets: number;
  target: number;
}

export interface BlockAnalytics {
  blockName: string;
  blockType: string;
  weekLabel: string;
  progressPct: number;
  adherencePct: number;
  bestDayType?: BlockDayTypeStat;
  worstDayType?: BlockDayTypeStat;
  addedExercisesCount: number;
  skippedWorkoutCount: number;
  muscleFindings: BlockMuscleFinding[];
}

export function computeBlockAnalytics(db: TrainingDatabase, user: UserProfile, activeProgram?: Program): BlockAnalytics | undefined {
  const block = activeProgram?.blocks.find((b) => b.status === "active") ?? activeProgram?.blocks[0];
  if (!block || !activeProgram) return undefined;

  const blockSessions = db.sessions.filter((s) => s.userId === user.id && s.blockId === block.id);
  const completedBlockSessions = blockSessions.filter((s) => s.status === "completed");

  const byDayName = new Map<string, number[]>();
  completedBlockSessions.forEach((s) => {
    const score = calculateWorkoutScore(s).score;
    const list = byDayName.get(s.name) ?? [];
    list.push(score);
    byDayName.set(s.name, list);
  });
  const dayTypeStats: BlockDayTypeStat[] = Array.from(byDayName.entries())
    .map(([name, scores]) => ({ name, avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), sessionCount: scores.length }))
    .filter((d) => d.sessionCount >= 2);
  const bestDayType = dayTypeStats.length ? dayTypeStats.reduce((a, b) => (b.avgScore > a.avgScore ? b : a)) : undefined;
  const worstDayType = dayTypeStats.length > 1 ? dayTypeStats.reduce((a, b) => (b.avgScore < a.avgScore ? b : a)) : undefined;

  const completedDayIds = new Set(block.completedWorkoutDayIds || []);
  const weeksUpToCurrent = block.weeks.filter((w) => w.weekNumber <= block.currentWeek);
  const scheduledDays = weeksUpToCurrent.flatMap((w) => w.workouts).filter((d) => d.status !== "rest");
  const completedCount = scheduledDays.filter((d) => completedDayIds.has(d.id)).length;
  const adherencePct = scheduledDays.length ? Math.round((completedCount / scheduledDays.length) * 100) : 0;

  const addedExercisesCount = completedBlockSessions.flatMap((s) => s.loggedExercises).filter((l) => l.offProgram).length;
  const skippedWorkoutCount = block.skippedWorkoutDayIds?.length ?? 0;

  const muscleVol = calculateMuscleVolume(blockSessions, db.exercises, user.id);
  const goal = block.goalOverride ?? block.goal ?? activeProgram.goal;
  const targets = muscleVolumeTargets[goal] ?? muscleVolumeTargets.powerbuilding;
  const muscleFindings: BlockMuscleFinding[] = Object.entries(targets)
    .map(([muscle, range]) => {
      const sets = muscleVol[muscle as MuscleGroup] ?? 0;
      if (sets < range.min) return { muscle: muscle as MuscleGroup, status: "under" as const, sets, target: range.target };
      if (sets > range.max) return { muscle: muscle as MuscleGroup, status: "over" as const, sets, target: range.target };
      return undefined;
    })
    .filter((f): f is BlockMuscleFinding => f !== undefined);

  return {
    blockName: block.name,
    blockType: block.type,
    weekLabel: `Week ${block.currentWeek} of ${block.lengthWeeks}`,
    progressPct: Math.round(clamp((block.currentWeek / Math.max(1, block.lengthWeeks)) * 100, 0, 100)),
    adherencePct,
    bestDayType,
    worstDayType: worstDayType && worstDayType.name !== bestDayType?.name ? worstDayType : undefined,
    addedExercisesCount,
    skippedWorkoutCount,
    muscleFindings,
  };
}
