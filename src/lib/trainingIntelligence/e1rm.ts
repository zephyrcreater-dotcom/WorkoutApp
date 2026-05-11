import type { Exercise } from "../../types/domain";

export type E1rmFormula = "epley" | "rpe-chart";

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

  if ((input.formula ?? "rpe-chart") === "epley" || input.actualRpe === undefined) {
    return Number((input.weight * (1 + input.reps / 30)).toFixed(1));
  }

  const percent = lookupRpePercent(input.reps, input.actualRpe);
  if (percent > 0) return Number((input.weight / percent).toFixed(1));
  return Number((input.weight * (1 + input.reps / 30)).toFixed(1));
}

export function calculateRpeAdjustedE1RM(input: ObservedE1RMInput): number | null {
  return calculateObservedE1RM({ ...input, formula: "rpe-chart" });
}
