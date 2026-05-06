import type {
  BlockType,
  Exercise,
  ExercisePerformanceLog,
  PlannedSet,
  ReadinessCheckIn,
  UnitPreference,
} from "../../types/domain";
import { calculateConfidence, estimateBaselineE1RM, getRepRPEPercent } from "./e1rm";
import { applyReadinessModifier } from "./readiness";
import { BLOCK_TYPE_RULES } from "./trainingRules";

export function roundToExerciseIncrement(
  weight: number,
  exercise: Pick<Exercise, "category" | "trackPerSide" | "defaultIncrement" | "customIncrement">,
  unit: UnitPreference
): number {
  const override = exercise.customIncrement ?? exercise.defaultIncrement;
  if (override) return Math.max(0, Math.round(weight / override) * override);

  const isKg = unit === "kg";
  if (exercise.category === "barbell") {
    const inc = isKg ? 2.5 : 5;
    return Math.max(0, Math.round(weight / inc) * inc);
  }
  if (exercise.category === "dumbbell" || exercise.trackPerSide) {
    return Math.max(0, Math.round(weight / 2.5) * 2.5);
  }
  const inc = isKg ? 2.5 : 5;
  return Math.max(0, Math.round(weight / inc) * inc);
}

export function applyBlockModifier(
  weight: number,
  blockType: BlockType,
  weekNumber: number,
  totalWeeks: number
): { adjustedWeight: number; multiplier: number; description: string } {
  const rules = BLOCK_TYPE_RULES[blockType] ?? BLOCK_TYPE_RULES.custom;
  const progressionBump = rules.weeklyProgressionFactor * (weekNumber - 1);
  const multiplier = rules.intensityFactor + progressionBump;

  return {
    adjustedWeight: weight * multiplier,
    multiplier: Number(multiplier.toFixed(4)),
    description: `${blockType} block (week ${weekNumber}/${totalWeeks}): ${rules.description} Load factor: ${(multiplier * 100).toFixed(1)}%.`,
  };
}

export type WeightRecommendationInput = {
  exercise: Pick<
    Exercise,
    "category" | "trackPerSide" | "defaultIncrement" | "customIncrement" | "kind" | "movementPattern"
  >;
  plannedSet: Pick<PlannedSet, "targetReps" | "targetRpe" | "targetRir" | "plannedWeight" | "kind">;
  performanceHistory: ExercisePerformanceLog[];
  readiness?: ReadinessCheckIn;
  blockType?: BlockType;
  weekNumber?: number;
  totalWeeks?: number;
  unit: UnitPreference;
  manualE1RM?: number;
  gymAdjustmentFactor?: number;
};

export type WeightRecommendation = {
  weight: number;
  confidence: number;
  baselineE1RM: number;
  rpePercent: number;
  blockMultiplier: number;
  readinessMultiplier: number;
  gymMultiplier: number;
  reasoning: string[];
  sources: ("history" | "manual-max" | "gym-factor" | "block-rule" | "readiness" | "no-data")[];
};

export function recommendPlannedWeight(input: WeightRecommendationInput): WeightRecommendation {
  const {
    exercise,
    plannedSet,
    performanceHistory,
    readiness,
    blockType = "accumulation",
    weekNumber = 1,
    totalWeeks = 4,
    unit,
    manualE1RM,
    gymAdjustmentFactor,
  } = input;

  const targetReps = plannedSet.targetReps || 8;
  const targetRpe =
    plannedSet.targetRpe ?? (plannedSet.targetRir !== undefined ? 10 - plannedSet.targetRir : 8);
  const reasoning: string[] = [];
  const sources: WeightRecommendation["sources"] = [];

  // Step 1: baseline e1RM
  let baselineE1RM = 0;
  const historyConfidence = calculateConfidence(performanceHistory);

  if (performanceHistory.length > 0) {
    const historyE1RM = estimateBaselineE1RM(performanceHistory);
    if (historyE1RM > 0) {
      baselineE1RM = historyE1RM;
      sources.push("history");
      reasoning.push(
        `Estimated 1RM from ${performanceHistory.length} logged session(s): ${historyE1RM} ${unit}.`
      );
    }
  }

  if (manualE1RM && manualE1RM > 0) {
    if (baselineE1RM === 0) {
      baselineE1RM = manualE1RM;
      sources.push("manual-max");
      reasoning.push(`Using manual 1RM entry: ${manualE1RM} ${unit}.`);
    } else {
      // Blend history with manual max; trust history more when confidence is high
      const blended = Math.round(
        baselineE1RM * historyConfidence + manualE1RM * (1 - historyConfidence)
      );
      baselineE1RM = blended;
      sources.push("manual-max");
      reasoning.push(
        `Blended history e1RM with manual max (confidence ${(historyConfidence * 100).toFixed(0)}%): ${blended} ${unit}.`
      );
    }
  }

  if (baselineE1RM === 0) {
    return {
      weight: 0,
      confidence: 0,
      baselineE1RM: 0,
      rpePercent: 0,
      blockMultiplier: 1,
      readinessMultiplier: 1,
      gymMultiplier: gymAdjustmentFactor ?? 1,
      reasoning: ["No history or manual max available. Enter a starting weight manually."],
      sources: ["no-data"],
    };
  }

  // Step 2: rep/RPE percentage
  const rpePercent = getRepRPEPercent(targetReps, targetRpe);
  let rawWeight = baselineE1RM * rpePercent;
  reasoning.push(
    `${targetReps} reps @ RPE ${targetRpe} = ${(rpePercent * 100).toFixed(1)}% of e1RM → ${Math.round(rawWeight)} ${unit}.`
  );

  // Step 3: block type modifier
  const blockResult = applyBlockModifier(rawWeight, blockType, weekNumber, totalWeeks);
  rawWeight = blockResult.adjustedWeight;
  sources.push("block-rule");
  reasoning.push(blockResult.description);

  // Step 4: readiness modifier
  let readinessMultiplier = 1;
  if (readiness) {
    const readinessResult = applyReadinessModifier(rawWeight, readiness.readinessScore);
    rawWeight = readinessResult.adjustedWeight;
    readinessMultiplier = readinessResult.multiplier;
    sources.push("readiness");
    reasoning.push(readinessResult.explanation);
  }

  // Step 5: gym adjustment factor
  const gymMultiplier = gymAdjustmentFactor ?? 1;
  if (gymMultiplier !== 1) {
    rawWeight *= gymMultiplier;
    sources.push("gym-factor");
    reasoning.push(`Gym machine conversion factor applied: ${gymMultiplier.toFixed(3)}×.`);
  }

  // Step 6: round to exercise-appropriate increment
  const finalWeight = roundToExerciseIncrement(rawWeight, exercise, unit);

  const confidence = Math.min(1, historyConfidence + (manualE1RM ? 0.2 : 0));

  return {
    weight: finalWeight,
    confidence: Number(confidence.toFixed(2)),
    baselineE1RM,
    rpePercent,
    blockMultiplier: blockResult.multiplier,
    readinessMultiplier,
    gymMultiplier,
    reasoning,
    sources,
  };
}
