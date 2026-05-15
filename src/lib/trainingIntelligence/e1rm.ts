import type { Exercise } from "../../types/domain";

export type E1rmFormula = "epley" | "epley-rpe" | "rpe-chart";

export interface ObservedE1RMInput {
  weight: number;
  reps: number;
  actualRpe?: number;
  formula?: E1rmFormula;
  exerciseCategory?: Exercise["exerciseCategory"];
  trackingMetric?: Exercise["bestTrackedBy"][number];
  skipped?: boolean;
  setType?: string;
}

/**
 * Structured result from calculateObservedE1RMResult.
 *
 * TODO — Nominal e1RM (Phase 2) will extend this by normalising for readiness,
 * workout score, fatigue, recent trend, exercise variation, and a confidence
 * score. The observed e1RM here is the raw single-set estimate only.
 */
export interface ObservedE1RMResult {
  e1rm: number;
  formula: E1rmFormula;
  confidence: "high" | "medium" | "low";
  inputs: {
    weight: number;
    reps: number;
    rpe?: number;
    rir?: number;
    effectiveReps?: number;
  };
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

function isNonLoadMetric(metric?: Exercise["bestTrackedBy"][number]): boolean {
  return metric === "time" || metric === "distance" || metric === "reps";
}

function lookupRpePercent(reps: number, rpe = 8): number {
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

export function calculateObservedE1RM(input: ObservedE1RMInput): number | null {
  if (input.skipped || input.setType === "warmup") return null;
  if (input.weight <= 0 || input.reps <= 0) return null;
  if (isNonLoadMetric(input.trackingMetric)) return null;

  const clampedRpe = input.actualRpe !== undefined
    ? Math.max(1, Math.min(10, input.actualRpe))
    : undefined;

  // "epley": plain Epley, no RPE awareness
  if (input.formula === "epley" || clampedRpe === undefined) {
    return Number((input.weight * (1 + input.reps / 30)).toFixed(1));
  }

  // "rpe-chart": table lookup (kept for backward compat)
  if (input.formula === "rpe-chart") {
    const percent = lookupRpePercent(input.reps, clampedRpe);
    if (percent > 0) return Number((input.weight / percent).toFixed(1));
  }

  // Default ("epley-rpe" or unset with RPE): RPE-aware Epley via effective reps.
  // RIR clamped to 0–5 to prevent absurd inflation from low-RPE entries.
  const rir = Math.max(0, Math.min(5, 10 - clampedRpe));
  const effectiveReps = input.reps + rir;
  return Number((input.weight * (1 + effectiveReps / 30)).toFixed(1));
}

export function calculateRpeAdjustedE1RM(input: ObservedE1RMInput): number | null {
  return calculateObservedE1RM({ ...input, formula: "rpe-chart" });
}

/**
 * Structured version of calculateObservedE1RM for use in the live logger
 * prescription pipeline. Returns full metadata alongside the e1RM value.
 *
 * Formula priority:
 *   "epley"     — plain Epley (reps only, ignores RPE)
 *   "rpe-chart" — RPE percentage table lookup
 *   "epley-rpe" — RPE-aware Epley using effective reps (default when RPE present)
 */
export function calculateObservedE1RMResult(input: {
  weight: number;
  reps: number;
  rpe?: number;
  formula?: E1rmFormula;
}): ObservedE1RMResult | null {
  if (input.weight <= 0 || input.reps <= 0) return null;

  const clampedRpe = input.rpe !== undefined
    ? Math.max(1, Math.min(10, input.rpe))
    : undefined;

  // Plain Epley (no RPE)
  if (input.formula === "epley" || clampedRpe === undefined) {
    return {
      e1rm: Number((input.weight * (1 + input.reps / 30)).toFixed(1)),
      formula: "epley",
      confidence: input.reps <= 10 ? "medium" : "low",
      inputs: { weight: input.weight, reps: input.reps },
    };
  }

  // RPE chart (table lookup)
  if (input.formula === "rpe-chart") {
    const percent = lookupRpePercent(input.reps, clampedRpe);
    if (percent > 0) {
      return {
        e1rm: Number((input.weight / percent).toFixed(1)),
        formula: "rpe-chart",
        confidence: input.reps <= 10 ? "high" : "medium",
        inputs: { weight: input.weight, reps: input.reps, rpe: clampedRpe },
      };
    }
  }

  // Default: RPE-aware Epley
  const rir = Math.max(0, Math.min(5, 10 - clampedRpe));
  const effectiveReps = input.reps + rir;
  return {
    e1rm: Number((input.weight * (1 + effectiveReps / 30)).toFixed(1)),
    formula: "epley-rpe",
    confidence: input.reps <= 12 ? "high" : "medium",
    inputs: { weight: input.weight, reps: input.reps, rpe: clampedRpe, rir, effectiveReps },
  };
}
