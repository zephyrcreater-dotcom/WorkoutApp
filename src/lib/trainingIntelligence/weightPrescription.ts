import type { Exercise, LoggedSet, ReadinessCheckIn, UnitPreference, WorkoutSession } from "../../types/domain";
import { calculateObservedE1RM } from "./e1rm";
import {
  calculateNormalizedE1RM,
  calculateReadinessAdjustment,
  calculateRecommendationConfidence,
  type ConfidenceBand,
} from "./normalization";

export interface SameExerciseBaseline {
  baselineWeight: number | null;
  baselineReps: number | null;
  baselineRpe: number | null;
  source: "recent_same_exercise" | "older_same_exercise" | "no_history";
  confidence: number;
  confidenceBand: ConfidenceBand;
  sourceSessionId?: string;
  sourceSetId?: string;
  historyAgeDays?: number;
  observedE1RM?: number;
  normalizedE1RM?: number;
  sourceDate?: string;
}

export interface SameExerciseBaselineInput {
  userId: string;
  exerciseId: string;
  sessions: WorkoutSession[];
  targetReps?: number;
  targetRpe?: number;
  gymId?: string;
}

function daysBetween(laterIso: string, earlierIso: string): number {
  return Math.max(0, Math.round((new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 86400000));
}

type CandidateSet = {
  session: WorkoutSession;
  set: LoggedSet;
  ageDays: number;
  score: number;
};

function collectSameExerciseCandidates(input: SameExerciseBaselineInput): CandidateSet[] {
  const now = new Date().toISOString();
  const targetReps = input.targetReps ?? 8;
  const targetRpe = input.targetRpe ?? 8;

  return input.sessions
    .filter((session) => session.userId === input.userId && session.status === "completed")
    .flatMap((session) =>
      session.loggedExercises
        .filter((exercise) => exercise.exerciseId === input.exerciseId)
        .flatMap((exercise) => exercise.sets.map((set) => ({ session, set })))
    )
    .filter(({ set }) => !set.skipped && set.kind !== "warmup" && set.actualWeight > 0 && set.actualReps > 0)
    .map(({ session, set }) => {
      const ageDays = daysBetween(now, set.completedAt || session.completedAt || session.startedAt);
      const repGap = Math.abs(set.actualReps - targetReps);
      const rpeGap = Math.abs((set.actualRpe ?? targetRpe) - targetRpe);
      const sameGymBonus = input.gymId && session.gymId === input.gymId ? 8 : 0;
      const score = 100 - ageDays * 0.8 - repGap * 8 - rpeGap * 10 - ((set.setRating ?? 3) <= 2 ? 8 : 0) + sameGymBonus;
      return { session, set, ageDays, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function roundToIncrement(weight: number, increment = 5): number {
  if (increment <= 0) return Math.max(0, Math.round(weight));
  return Math.max(0, Math.round(weight / increment) * increment);
}

export function getExerciseIncrement(
  exercise: Pick<Exercise, "defaultIncrement" | "customIncrement" | "trackPerSide" | "category">,
  unit: UnitPreference
): number {
  if (exercise.customIncrement) return exercise.customIncrement;
  if (exercise.defaultIncrement) return exercise.defaultIncrement;
  if (exercise.category === "dumbbell" || exercise.trackPerSide) return 2.5;
  return unit === "kg" ? 2.5 : 5;
}

export function getSameExerciseBaseline(input: SameExerciseBaselineInput): SameExerciseBaseline {
  const candidates = collectSameExerciseCandidates(input);
  if (!candidates.length) {
    return {
      baselineWeight: null,
      baselineReps: null,
      baselineRpe: null,
      source: "no_history",
      confidence: 18,
      confidenceBand: "low",
    };
  }

  const best = candidates[0];
  const confidenceResult = calculateRecommendationConfidence({
    hasSameExerciseHistory: true,
    historyAgeDays: best.ageDays,
    historyCount: Math.min(candidates.length, 6),
    repDifference: Math.abs((best.set.actualReps ?? 0) - (input.targetReps ?? best.set.actualReps ?? 0)),
    rpeDifference: Math.abs((best.set.actualRpe ?? input.targetRpe ?? 8) - (input.targetRpe ?? best.set.actualRpe ?? 8)),
  });
  const observedE1RM = calculateObservedE1RM({
    weight: best.set.actualWeight,
    reps: best.set.actualReps,
    actualRpe: best.set.actualRpe,
    setType: best.set.kind,
    skipped: best.set.skipped,
  }) ?? undefined;
  const normalized = observedE1RM
    ? calculateNormalizedE1RM({
        observedE1RM,
        actualRpe: best.set.actualRpe,
        targetRpe: input.targetRpe,
        setRating: best.set.setRating,
        confidence: confidenceResult.confidence,
      })
    : undefined;

  return {
    baselineWeight: best.set.actualWeight,
    baselineReps: best.set.actualReps,
    baselineRpe: best.set.actualRpe ?? null,
    source: best.ageDays <= 42 ? "recent_same_exercise" : "older_same_exercise",
    confidence: confidenceResult.confidence,
    confidenceBand: confidenceResult.confidenceBand,
    sourceSessionId: best.session.id,
    sourceSetId: best.set.id,
    historyAgeDays: best.ageDays,
    observedE1RM,
    normalizedE1RM: normalized?.normalizedE1RM,
    sourceDate: best.set.completedAt || best.session.completedAt || best.session.startedAt,
  };
}

export interface ExerciseRecommendationInput {
  exercise: Exercise;
  targetReps: number;
  targetRpe: number;
  baseline: SameExerciseBaseline;
  readiness?: ReadinessCheckIn;
  increment: number;
  unit: UnitPreference;
}

export interface ExerciseRecommendation {
  recommendedWeight: number | null;
  confidence: number;
  confidenceBand: ConfidenceBand;
  reasonParts: string[];
  source: SameExerciseBaseline["source"];
  warningFlags: string[];
}

export function buildConciseRecommendationReason(input: {
  baseline?: SameExerciseBaseline;
  targetReps: number;
  targetRpe: number;
  unit: UnitPreference;
  rounded?: boolean;
  increment?: number;
}): string[] {
  const parts: string[] = [];
  if (input.baseline?.baselineWeight && input.baseline.baselineReps) {
    const baselineRpe = input.baseline.baselineRpe ? ` @ ${input.baseline.baselineRpe}` : "";
    parts.push(`Last time: ${input.baseline.baselineWeight} ${input.unit} x ${input.baseline.baselineReps}${baselineRpe}.`);
  }
  parts.push(`Target today: ${input.targetReps} reps @ ${input.targetRpe}.`);
  if (input.rounded && input.increment) {
    parts.push(`Rounded to nearest ${input.increment} ${input.unit}.`);
  }
  return parts.slice(0, 3);
}

export function recommendWeightForExercise(input: ExerciseRecommendationInput): ExerciseRecommendation {
  if (!input.baseline.baselineWeight || !input.baseline.baselineReps) {
    return {
      recommendedWeight: null,
      confidence: input.baseline.confidence,
      confidenceBand: input.baseline.confidenceBand,
      reasonParts: ["No recent history. Enter starting weight."],
      source: "no_history",
      warningFlags: ["no_history"],
    };
  }

  const baselineWeight = input.baseline.baselineWeight;
  const baselineReps = input.baseline.baselineReps;
  const baselineRpe = input.baseline.baselineRpe ?? input.targetRpe;
  const repDelta = input.targetReps - baselineReps;
  const rpeDelta = input.targetRpe - baselineRpe;
  const readiness = calculateReadinessAdjustment(input.readiness?.readinessScore);

  let multiplier = 1;
  multiplier *= 1 - repDelta * 0.015;
  multiplier *= 1 + rpeDelta * 0.0125;
  multiplier *= 1 + readiness.loadModifierPct;

  const warningFlags: string[] = [];
  if (Math.abs(repDelta) >= 4) warningFlags.push("rep_gap_large");
  if (Math.abs(rpeDelta) >= 1.5) warningFlags.push("rpe_gap_large");
  if (input.baseline.historyAgeDays !== undefined && input.baseline.historyAgeDays > 90) warningFlags.push("history_old");

  const rawWeight = baselineWeight * Math.max(0.88, Math.min(1.12, multiplier));
  const recommendedWeight = roundToIncrement(rawWeight, input.increment);
  const reasonParts = buildConciseRecommendationReason({
    baseline: input.baseline,
    targetReps: input.targetReps,
    targetRpe: input.targetRpe,
    unit: input.unit,
    rounded: recommendedWeight !== rawWeight,
    increment: input.increment,
  });

  return {
    recommendedWeight,
    confidence: input.baseline.confidence,
    confidenceBand: input.baseline.confidenceBand,
    reasonParts,
    source: input.baseline.source,
    warningFlags,
  };
}
