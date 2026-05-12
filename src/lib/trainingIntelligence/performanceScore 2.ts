import type { Exercise, LoggedSet, SetPerformanceStatus } from "../../types/domain";

export interface SetPerformanceInput {
  plannedWeight?: number;
  actualWeight?: number;
  plannedReps?: number;
  actualReps?: number;
  targetRpe?: number;
  actualRpe?: number;
  setRating?: number;
  setType?: LoggedSet["kind"];
  skipped?: boolean;
  exerciseCategory?: Exercise["exerciseCategory"];
}

export interface SetPerformanceResult {
  setScore: number;
  result: SetPerformanceStatus | "slightly_missed";
  rpeDelta: number;
  repsDelta: number;
  loadDelta: number;
  flags: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateSetPerformanceScore(input: SetPerformanceInput): SetPerformanceResult {
  if (input.skipped) {
    return {
      setScore: 0,
      result: "skipped",
      rpeDelta: 0,
      repsDelta: 0,
      loadDelta: 0,
      flags: ["skipped"],
    };
  }

  const plannedReps = input.plannedReps ?? input.actualReps ?? 0;
  const actualReps = input.actualReps ?? 0;
  const plannedWeight = input.plannedWeight ?? input.actualWeight ?? 0;
  const actualWeight = input.actualWeight ?? 0;
  const targetRpe = input.targetRpe ?? input.actualRpe ?? 8;
  const actualRpe = input.actualRpe ?? targetRpe;
  const setRating = clamp(input.setRating ?? 3, 1, 5);
  const repsDelta = actualReps - plannedReps;
  const rpeDelta = Number((actualRpe - targetRpe).toFixed(2));
  const loadDelta = plannedWeight > 0 ? Number((((actualWeight - plannedWeight) / plannedWeight) * 100).toFixed(2)) : 0;
  const flags: string[] = [];

  let score = 78;
  score += clamp(repsDelta * 9, -24, 18);
  score += clamp(loadDelta * 0.8, -12, 10);
  score += clamp(-rpeDelta * 8, -18, 16);
  score += (setRating - 3) * 4;

  if ((input.setType ?? "working") === "warmup") {
    score = clamp(score, 55, 80);
    flags.push("warmup");
  }

  if (repsDelta < 0) flags.push("missed_reps");
  if (rpeDelta >= 1.5) flags.push("high_rpe");
  if (rpeDelta <= -1 && repsDelta >= 0) flags.push("ahead_of_target");
  if (setRating <= 2) flags.push("felt_hard");
  if (setRating >= 4 && rpeDelta <= 0) flags.push("felt_strong");

  const setScore = Math.round(clamp(score, 0, 100));
  let result: SetPerformanceResult["result"] = "matched";
  if (setScore >= 86 && repsDelta >= 0 && rpeDelta <= 0.5) result = "overperformed";
  else if (setScore >= 68) result = "matched";
  else if (setScore >= 52) result = "slightly_missed";
  else result = "underperformed";

  return { setScore, result, rpeDelta, repsDelta, loadDelta, flags };
}

export function calculateSessionPerformanceScore(sets: SetPerformanceInput[]): {
  sessionScore: number;
  result: "poor" | "mixed" | "solid" | "excellent";
} {
  if (!sets.length) return { sessionScore: 0, result: "poor" };
  const scores = sets.map(calculateSetPerformanceScore);
  const avg = scores.reduce((sum, item) => sum + item.setScore, 0) / scores.length;
  const sessionScore = Math.round(avg);
  const result = sessionScore >= 88 ? "excellent" : sessionScore >= 72 ? "solid" : sessionScore >= 50 ? "mixed" : "poor";
  return { sessionScore, result };
}
