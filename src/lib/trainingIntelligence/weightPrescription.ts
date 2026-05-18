import type { Exercise, ExerciseUnit, LoggedSet, ReadinessCheckIn, UnitPreference, WorkoutSession } from "../../types/domain";
import { calculateObservedE1RM, type ObservedE1RMResult } from "./e1rm";
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
  desiredUnit?: UnitPreference;
  exerciseDefaultUnit?: ExerciseUnit;
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

function isWeightUnit(unit?: ExerciseUnit | UnitPreference | null): unit is UnitPreference {
  return unit === "lb" || unit === "kg";
}

function convertWeight(
  value?: number | null,
  fromUnit?: ExerciseUnit | UnitPreference | null,
  toUnit?: UnitPreference | null,
): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  if (!isWeightUnit(fromUnit) || !toUnit || fromUnit === toUnit) return value;
  return toUnit === "kg" ? value * 0.45359237 : value * 2.2046226218;
}

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
  const sourceUnit = isWeightUnit(best.set.unit)
    ? best.set.unit
    : isWeightUnit(input.exerciseDefaultUnit)
      ? input.exerciseDefaultUnit
      : input.desiredUnit;
  const baselineWeight = convertWeight(best.set.actualWeight, sourceUnit, input.desiredUnit) ?? best.set.actualWeight;
  const convertedObservedE1RM = observedE1RM
    ? (convertWeight(observedE1RM, sourceUnit, input.desiredUnit) ?? observedE1RM)
    : undefined;
  const normalized = convertedObservedE1RM
    ? calculateNormalizedE1RM({
        observedE1RM: convertedObservedE1RM,
        actualRpe: best.set.actualRpe,
        targetRpe: input.targetRpe,
        setRating: best.set.setRating,
        confidence: confidenceResult.confidence,
      })
    : undefined;

  return {
    baselineWeight,
    baselineReps: best.set.actualReps,
    baselineRpe: best.set.actualRpe ?? null,
    source: best.ageDays <= 42 ? "recent_same_exercise" : "older_same_exercise",
    confidence: confidenceResult.confidence,
    confidenceBand: confidenceResult.confidenceBand,
    sourceSessionId: best.session.id,
    sourceSetId: best.set.id,
    historyAgeDays: best.ageDays,
    observedE1RM: convertedObservedE1RM,
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
  recommendedWeight?: number;
}): string[] {
  const parts: string[] = [];
  if (input.baseline?.observedE1RM && input.baseline.baselineWeight && input.baseline.baselineReps) {
    const baselineRpe = input.baseline.baselineRpe ? ` @ RPE ${input.baseline.baselineRpe}` : "";
    parts.push(
      `Observed e1RM: ${Math.round(input.baseline.observedE1RM)} ${input.unit}.`
    );
    parts.push(`Recent: ${input.baseline.baselineWeight} ${input.unit} × ${input.baseline.baselineReps}${baselineRpe}.`);
  } else if (input.baseline?.baselineWeight && input.baseline.baselineReps) {
    const baselineRpe = input.baseline.baselineRpe ? ` @ RPE ${input.baseline.baselineRpe}` : "";
    parts.push(`Recent: ${input.baseline.baselineWeight} ${input.unit} × ${input.baseline.baselineReps}${baselineRpe}.`);
  }
  if (input.recommendedWeight && input.recommendedWeight > 0) {
    parts.push(`Conservative target: ${input.recommendedWeight} ${input.unit} for ${input.targetReps} reps @ RPE ${input.targetRpe}.`);
  } else {
    parts.push(`Target today: ${input.targetReps} reps @ RPE ${input.targetRpe}.`);
  }
  if (input.rounded && input.increment) {
    parts.push(`Rounded to nearest ${input.increment} ${input.unit}.`);
  }
  return parts.slice(0, 3);
}

export function recommendWeightForExercise(input: ExerciseRecommendationInput): ExerciseRecommendation {
  const bodyweightMovement = input.exercise.defaultUnit === "bodyweight"
    || input.exercise.trackByBodyweight
    || input.exercise.isBodyweight
    || input.exercise.category === "bodyweight";
  if (!input.baseline.baselineWeight || !input.baseline.baselineReps) {
    return {
      recommendedWeight: null,
      confidence: input.baseline.confidence,
      confidenceBand: input.baseline.confidenceBand,
      reasonParts: [bodyweightMovement ? "No recent added load. Use bodyweight or enter added load." : "No recent entry. Enter starting weight."],
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

  let rawWeight = baselineWeight * Math.max(0.88, Math.min(1.12, multiplier));

  // ── Sanity guardrails ──────────────────────────────────────────────────────
  // If going to more reps at lower or equal RPE, load must be lower than baseline.
  if (repDelta > 0 && rpeDelta <= 0) {
    rawWeight = Math.min(rawWeight, baselineWeight * 0.97);
    warningFlags.push("guardrail_more_reps_lower_rpe");
  }
  // Cap at observed e1RM — prescribed load should never exceed theoretical max.
  if (input.baseline.observedE1RM && rawWeight > input.baseline.observedE1RM) {
    rawWeight = input.baseline.observedE1RM * 0.9;
    warningFlags.push("guardrail_capped_at_e1rm");
  }
  // Clamp to a sane range of the baseline weight (prevent 2–3× jumps from stale data).
  rawWeight = Math.min(rawWeight, baselineWeight * 1.15);

  const recommendedWeight = roundToIncrement(Math.max(0, rawWeight), input.increment);
  const reasonParts = buildConciseRecommendationReason({
    baseline: input.baseline,
    targetReps: input.targetReps,
    targetRpe: input.targetRpe,
    unit: input.unit,
    rounded: recommendedWeight !== rawWeight,
    increment: input.increment,
    recommendedWeight,
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

// ─── Phase 1: Observed e1RM prescription pipeline ────────────────────────────
//
// These functions form the live logger recommendation pipeline:
//   actual set → deriveActualRpeFromFeel → calculateObservedE1RMResult
//     → adjustTargetRpeForReadiness → prescribeLoadFromObservedE1RM
//
// TODO — Nominal e1RM (Phase 2) will sit between the observed e1RM and
// prescription steps. It will normalise observed e1RM for readiness,
// workout score, fatigue, trend, and exercise variation before computing
// the target weight. For now, observed e1RM is used directly.

/**
 * Convert a subjective feel rating (1–5 scale) into an actual RPE estimate.
 *
 * The feel rating is interpreted relative to the target RPE for the completed
 * set. If the user also entered an explicit actualRpe, that wins.
 *
 *   feel 1 (much harder than planned) → targetRpe + 1.0
 *   feel 2 (a bit hard)               → targetRpe + 0.5
 *   feel 3 (as planned)               → targetRpe
 *   feel 4 (a bit easy)               → targetRpe − 0.5
 *   feel 5 (very easy)                → targetRpe − 1.0
 */
export function deriveActualRpeFromFeel(input: {
  targetRpe: number;
  feelRating?: number;
  explicitActualRpe?: number;
  actualReps?: number;
  targetReps?: number;
}): {
  actualRpe: number;
  source: "explicit_rpe" | "feel_adjusted" | "target_fallback" | "higher_effort_conflict";
  adjustment: number;
} {
  const feelMap: Record<number, number> = { 1: 1.0, 2: 0.5, 3: 0, 4: -0.5, 5: -1.0 };
  const feel = input.feelRating !== undefined
    ? Math.round(Math.max(1, Math.min(5, input.feelRating)))
    : undefined;
  const feelAdjustment = feel !== undefined ? (feelMap[feel] ?? 0) : 0;
  const feelDerivedRpe = Math.max(5, Math.min(10, input.targetRpe + feelAdjustment));

  if (input.explicitActualRpe !== undefined) {
    const explicit = Math.max(5, Math.min(10, input.explicitActualRpe));
    const missedTargetReps =
      input.actualReps !== undefined
      && input.targetReps !== undefined
      && input.actualReps < input.targetReps;
    const harderFeelConflict = feel !== undefined && feel <= 2 && feelDerivedRpe > explicit;
    if (missedTargetReps && harderFeelConflict) {
      return {
        actualRpe: feelDerivedRpe,
        source: "higher_effort_conflict",
        adjustment: feelDerivedRpe - input.targetRpe,
      };
    }
    return { actualRpe: explicit, source: "explicit_rpe", adjustment: explicit - input.targetRpe };
  }

  if (feel === undefined) {
    return { actualRpe: Math.max(5, Math.min(10, input.targetRpe)), source: "target_fallback", adjustment: 0 };
  }

  return {
    actualRpe: feelDerivedRpe,
    source: "feel_adjusted",
    adjustment: feelAdjustment,
  };
}

/**
 * Apply a small readiness-based modifier to today's target RPE.
 *
 * Readiness 70 = baseline (no change).
 * Higher readiness → slightly higher tolerated target RPE.
 * Lower readiness  → slightly lower target RPE.
 *
 * This is NOT used to inflate weight directly. It shifts the RPE target
 * used in the reverse Epley prescription so the prescribed load changes
 * proportionally. Clamped to [6, 9.5].
 */
export function adjustTargetRpeForReadiness(input: {
  targetRpe: number;
  readinessScore?: number;
}): {
  adjustedTargetRpe: number;
  modifier: number;
  reason: string;
} {
  const score = input.readinessScore ?? 70;
  let modifier: number;
  let reason: string;

  if (score >= 90)      { modifier =  0.75; reason = "High readiness — slightly higher RPE target tolerated."; }
  else if (score >= 80) { modifier =  0.5;  reason = "Good readiness — small increase in target RPE."; }
  else if (score >= 70) { modifier =  0;    reason = "Baseline readiness — run as planned."; }
  else if (score >= 60) { modifier = -0.25; reason = "Slightly low readiness — modest RPE reduction."; }
  else if (score >= 50) { modifier = -0.5;  reason = "Low readiness — conservative RPE target."; }
  else                  { modifier = -0.75; reason = "Very low readiness — reduced RPE target today."; }

  return {
    adjustedTargetRpe: Math.max(6, Math.min(9.5, input.targetRpe + modifier)),
    modifier,
    reason,
  };
}

export interface PrescriptionResult {
  prescribedWeight: number;
  roundedWeight: number;
  unit: UnitPreference;
  observedE1RM: number;
  confidence: "high" | "medium" | "low";
  reason: string;
  guardrailsApplied: string[];
  wasRounded: boolean;
}

/**
 * Prescribe a target load from an observed e1RM using reverse Epley.
 *
 * Formula:
 *   targetRIR           = 10 − targetRpe  (clamped 0–5)
 *   targetEffectiveReps = targetReps + targetRIR
 *   targetWeight        = observedE1RM / (1 + targetEffectiveReps / 30)
 *
 * Guardrails applied in order:
 *   A. prescribedWeight must be < observedE1RM
 *   B. prescribedWeight must not exceed recentActualWeight × 1.25
 *
 * Note: the "more reps at lower/equal RPE → lower weight" invariant is
 * mathematically guaranteed by the Epley formula and does not need a
 * separate guardrail here.
 */
export function prescribeLoadFromObservedE1RM(input: {
  observedE1RM: number;
  targetReps: number;
  targetRpe: number;
  exercise: Pick<Exercise, "category" | "trackPerSide" | "defaultIncrement" | "customIncrement">;
  unit: UnitPreference;
  recentActualWeight?: number;
  increment?: number;
}): PrescriptionResult {
  const { observedE1RM, exercise, unit, recentActualWeight } = input;
  const guardrailsApplied: string[] = [];

  const targetReps = Math.max(1, input.targetReps);
  const targetRpe  = Math.max(5, Math.min(10, input.targetRpe));
  const targetRir  = Math.max(0, Math.min(5, 10 - targetRpe));
  const targetEffectiveReps = targetReps + targetRir;

  // Reverse Epley
  let prescribedWeight = observedE1RM / (1 + targetEffectiveReps / 30);

  // Guardrail A: must be below observed e1RM
  if (prescribedWeight >= observedE1RM) {
    prescribedWeight = observedE1RM * 0.95;
    guardrailsApplied.push("capped_below_e1rm");
  }

  // Guardrail B: cap absurd jumps above recent actual load
  if (recentActualWeight && recentActualWeight > 0 && prescribedWeight > recentActualWeight * 1.25) {
    prescribedWeight = recentActualWeight * 1.10;
    guardrailsApplied.push("absurd_jump_capped");
  }

  if (prescribedWeight <= 0) {
    return {
      prescribedWeight: 0, roundedWeight: 0, unit, observedE1RM,
      confidence: "low",
      reason: "No valid weight computed — enter starting weight manually.",
      guardrailsApplied: ["invalid_weight"],
      wasRounded: false,
    };
  }

  const increment = input.increment ?? getExerciseIncrement(exercise, unit);
  const roundedWeight = roundToIncrement(prescribedWeight, increment);
  const wasRounded = Math.abs(roundedWeight - prescribedWeight) > 0.01;

  return {
    prescribedWeight,
    roundedWeight,
    unit,
    observedE1RM,
    confidence: guardrailsApplied.length > 0 ? "medium" : "high",
    reason: `e1RM ${Math.round(observedE1RM)} ${unit}; reverse Epley for ${targetReps} reps @ RPE ${targetRpe}.`,
    guardrailsApplied,
    wasRounded,
  };
}

// Re-export ObservedE1RMResult so consumers can import from weightPrescription
export type { ObservedE1RMResult };

export interface SetRecommendationProfile {
  category: "main_compound" | "secondary_compound" | "isolation_accessory";
  e1rmConfidence: "high" | "medium" | "low";
  feelWeight: number;
  maxIncrementJumps: number;
}

export function getSetRecommendationProfile(
  exercise: Pick<Exercise, "category" | "kind" | "exerciseCategory" | "isSBDMainLift">,
  targetReps?: number,
): SetRecommendationProfile {
  const kinds = exercise.kind ?? [];
  const isMainCompound =
    exercise.isSBDMainLift === true
    || exercise.exerciseCategory === "sbd"
    || exercise.exerciseCategory === "main_compound"
    || kinds.includes("competition-lift");
  if (isMainCompound) {
    return {
      category: "main_compound",
      e1rmConfidence: "high",
      feelWeight: 0.35,
      maxIncrementJumps: 1,
    };
  }

  const isIsolationAccessory =
    exercise.exerciseCategory === "isolation"
    || kinds.includes("isolation")
    || (
      (exercise.category === "cable" || exercise.category === "machine")
      && !kinds.includes("compound")
      && exercise.exerciseCategory !== "secondary_compound"
      && exercise.exerciseCategory !== "machine_compound"
    );
  if (isIsolationAccessory) {
    return {
      category: "isolation_accessory",
      e1rmConfidence: targetReps !== undefined && targetReps >= 12 ? "low" : "medium",
      feelWeight: 0.8,
      maxIncrementJumps: targetReps !== undefined && targetReps >= 15 ? 2 : 1,
    };
  }

  return {
    category: "secondary_compound",
    e1rmConfidence: exercise.category === "cable" && targetReps !== undefined && targetReps >= 12 ? "low" : "medium",
    feelWeight: 0.55,
    maxIncrementJumps: 2,
  };
}

export function isMeaningfulWeightChange(
  currentWeight: number | null | undefined,
  recommendedWeight: number | null | undefined,
  increment: number,
): boolean {
  if (currentWeight === null || currentWeight === undefined || recommendedWeight === null || recommendedWeight === undefined) {
    return false;
  }
  return Math.abs(currentWeight - recommendedWeight) >= Math.max(0.001, increment / 2);
}
