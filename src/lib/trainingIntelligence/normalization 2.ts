import type { Exercise } from "../../types/domain";

export type ReadinessBand = "poor" | "low" | "baseline" | "good" | "great";
export type ConfidenceBand = "low" | "medium" | "high";

export interface ReadinessInput {
  sleepQuality: number;
  motivation: number;
  energy: number;
  nutritionQuality: number;
  soreness: number;
  stress: number;
  jointPain: number;
  bodyweight?: number;
  caffeine?: boolean;
}

export interface ReadinessResult {
  readinessScore: number;
  readinessBand: ReadinessBand;
  loadModifierPct: number;
  volumeModifier: number;
  confidenceModifier: number;
}

export function calculateReadinessState(input: ReadinessInput): ReadinessResult {
  const positive = (input.sleepQuality + input.motivation + input.energy + input.nutritionQuality) / 4;
  const negative = (input.soreness * 0.9 + input.stress + input.jointPain * 1.2) / 3.1;
  const baselineShift = (positive - 3) * 11 - (negative - 1) * 14 + (input.caffeine ? 1.5 : 0);
  const readinessScore = Math.round(Math.max(0, Math.min(100, 60 + baselineShift)));

  if (readinessScore < 40) {
    return { readinessScore, readinessBand: "poor", loadModifierPct: -0.075, volumeModifier: -1, confidenceModifier: -12 };
  }
  if (readinessScore < 53) {
    return { readinessScore, readinessBand: "low", loadModifierPct: -0.04, volumeModifier: -0.5, confidenceModifier: -8 };
  }
  if (readinessScore < 70) {
    return { readinessScore, readinessBand: "baseline", loadModifierPct: 0, volumeModifier: 0, confidenceModifier: 0 };
  }
  if (readinessScore < 83) {
    return { readinessScore, readinessBand: "good", loadModifierPct: 0.01, volumeModifier: 0, confidenceModifier: 2 };
  }
  return { readinessScore, readinessBand: "great", loadModifierPct: 0.025, volumeModifier: 0.5, confidenceModifier: 4 };
}

export function calculateReadinessAdjustment(readinessScore?: number): ReadinessResult {
  const score = readinessScore ?? 60;
  if (score < 40) return { readinessScore: score, readinessBand: "poor", loadModifierPct: -0.075, volumeModifier: -1, confidenceModifier: -12 };
  if (score < 53) return { readinessScore: score, readinessBand: "low", loadModifierPct: -0.04, volumeModifier: -0.5, confidenceModifier: -8 };
  if (score < 70) return { readinessScore: score, readinessBand: "baseline", loadModifierPct: 0, volumeModifier: 0, confidenceModifier: 0 };
  if (score < 83) return { readinessScore: score, readinessBand: "good", loadModifierPct: 0.01, volumeModifier: 0, confidenceModifier: 2 };
  return { readinessScore: score, readinessBand: "great", loadModifierPct: 0.025, volumeModifier: 0.5, confidenceModifier: 4 };
}

export interface RecommendationConfidenceInput {
  hasSameExerciseHistory: boolean;
  historyAgeDays?: number;
  historyCount?: number;
  repDifference?: number;
  rpeDifference?: number;
  conflictingSignals?: boolean;
  readinessScore?: number;
}

export function calculateRecommendationConfidence(input: RecommendationConfidenceInput): {
  confidence: number;
  confidenceBand: ConfidenceBand;
} {
  if (!input.hasSameExerciseHistory) return { confidence: 18, confidenceBand: "low" };

  let confidence = 52;
  confidence += Math.min(18, (input.historyCount ?? 1) * 5);
  confidence -= Math.min(18, Math.abs(input.repDifference ?? 0) * 5);
  confidence -= Math.min(12, Math.abs(input.rpeDifference ?? 0) * 6);

  if ((input.historyAgeDays ?? 999) <= 14) confidence += 16;
  else if ((input.historyAgeDays ?? 999) <= 42) confidence += 8;
  else if ((input.historyAgeDays ?? 999) > 90) confidence -= 12;

  if (input.conflictingSignals) confidence -= 14;

  const readiness = calculateReadinessAdjustment(input.readinessScore);
  confidence += readiness.confidenceModifier;
  const finalConfidence = Math.max(0, Math.min(100, Math.round(confidence)));
  const confidenceBand: ConfidenceBand = finalConfidence >= 75 ? "high" : finalConfidence >= 45 ? "medium" : "low";
  return { confidence: finalConfidence, confidenceBand };
}

export interface NormalizedE1RMInput {
  observedE1RM: number;
  readinessScore?: number;
  setRating?: number;
  actualRpe?: number;
  targetRpe?: number;
  confidence?: number;
  exerciseCategory?: Exercise["exerciseCategory"];
}

export function calculateNormalizedE1RM(input: NormalizedE1RMInput): {
  observedE1RM: number;
  normalizedE1RM: number;
  adjustmentPct: number;
  confidence: number;
  flags: string[];
} {
  const readiness = calculateReadinessAdjustment(input.readinessScore);
  const flags: string[] = [];
  let adjustmentPct = 0;

  if (readiness.readinessBand === "poor") adjustmentPct += 0.025;
  else if (readiness.readinessBand === "low") adjustmentPct += 0.0125;
  else if (readiness.readinessBand === "good") adjustmentPct -= 0.01;
  else if (readiness.readinessBand === "great") adjustmentPct -= 0.02;

  const rpeDelta = (input.actualRpe ?? input.targetRpe ?? 8) - (input.targetRpe ?? input.actualRpe ?? 8);
  if (rpeDelta >= 1.5) {
    adjustmentPct += 0.01;
    flags.push("high_rpe");
  } else if (rpeDelta <= -1) {
    adjustmentPct -= 0.005;
    flags.push("low_rpe");
  }

  if ((input.setRating ?? 3) <= 2) {
    adjustmentPct += 0.005;
    flags.push("hard_set");
  } else if ((input.setRating ?? 3) >= 5) {
    adjustmentPct -= 0.005;
    flags.push("easy_set");
  }

  adjustmentPct = Math.max(-0.03, Math.min(0.03, adjustmentPct));

  if (input.actualRpe !== undefined && input.setRating !== undefined) {
    const mismatch = (input.actualRpe >= (input.targetRpe ?? input.actualRpe) + 1 && input.setRating >= 4)
      || (input.actualRpe <= (input.targetRpe ?? input.actualRpe) - 1 && input.setRating <= 2);
    if (mismatch) flags.push("conflicting_feedback");
  }

  const normalizedE1RM = Number((input.observedE1RM * (1 + adjustmentPct)).toFixed(1));
  const confidence = Math.max(0, Math.min(100, Math.round((input.confidence ?? 60) - (flags.includes("conflicting_feedback") ? 10 : 0))));

  return {
    observedE1RM: Number(input.observedE1RM.toFixed(1)),
    normalizedE1RM,
    adjustmentPct: Number((adjustmentPct * 100).toFixed(2)),
    confidence,
    flags,
  };
}
