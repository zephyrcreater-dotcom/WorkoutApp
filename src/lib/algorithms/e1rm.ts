import type { ExercisePerformanceLog } from "../../types/domain";
export { lookupRpePercent as getRepRPEPercent } from "../trainingMath";

export function estimateBaselineE1RM(history: ExercisePerformanceLog[]): number {
  const valid = history
    .filter((log) => log.e1rm && log.e1rm > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!valid.length) return 0;

  const sixWeeksAgo = Date.now() - 1000 * 60 * 60 * 24 * 42;
  const recent = valid.filter((log) => new Date(log.date).getTime() >= sixWeeksAgo);
  const older = valid.filter((log) => new Date(log.date).getTime() < sixWeeksAgo);

  if (recent.length) {
    const slice = recent.slice(0, 5);
    const recentAvg = slice.reduce((sum, log) => sum + log.e1rm!, 0) / slice.length;
    const recentMax = Math.max(...recent.map((log) => log.e1rm!));
    const blended = recentMax * 0.6 + recentAvg * 0.4;

    if (older.length) {
      const olderMax = Math.max(...older.map((log) => log.e1rm!));
      if (olderMax > recentMax) {
        // Athlete has been stronger before — acknowledge lightly
        return Math.round(blended * 0.97 + olderMax * 0.03);
      }
    }
    return Math.round(blended);
  }

  // Only old data available — apply a conservative aging discount
  const olderMax = Math.max(...older.slice(0, 10).map((log) => log.e1rm!));
  return Math.round(olderMax * 0.95);
}

export function calculateConfidence(history: ExercisePerformanceLog[]): number {
  const valid = history.filter((log) => log.e1rm && log.e1rm > 0);
  if (!valid.length) return 0;

  const sixWeeksAgo = Date.now() - 1000 * 60 * 60 * 24 * 42;
  const recentCount = valid.filter((log) => new Date(log.date).getTime() >= sixWeeksAgo).length;
  const totalCount = valid.length;

  const dataScore = Math.min(1, recentCount / 5) * 0.5 + Math.min(1, totalCount / 10) * 0.2;

  const recentValues = valid
    .filter((log) => new Date(log.date).getTime() >= sixWeeksAgo)
    .slice(0, 8)
    .map((log) => log.e1rm!);

  let consistencyScore = 0;
  if (recentValues.length >= 2) {
    const avg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
    const variance = recentValues.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / recentValues.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
    consistencyScore = Math.max(0, 0.3 * (1 - cv / 0.15));
  }

  return Math.min(1, Math.round((dataScore + consistencyScore) * 100) / 100);
}
