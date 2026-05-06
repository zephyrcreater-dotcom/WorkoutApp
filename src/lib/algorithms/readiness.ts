export function applyReadinessModifier(
  weight: number,
  readinessScore: number
): { adjustedWeight: number; multiplier: number; explanation: string } {
  let multiplier: number;
  let explanation: string;

  if (readinessScore < 40) {
    multiplier = 0.92;
    explanation = "Readiness is very low (<40). Reducing load by ~8%. Prioritize technique and recovery today.";
  } else if (readinessScore < 55) {
    multiplier = 0.95;
    explanation = "Readiness is low (40–54). Reducing load by ~5%. Avoid pushing for PRs.";
  } else if (readinessScore < 70) {
    multiplier = 0.98;
    explanation = "Readiness is moderate (55–69). Slight conservative reduction. Run the plan at a controlled tempo.";
  } else if (readinessScore < 85) {
    multiplier = 1.00;
    explanation = "Readiness is good (70–84). Run the plan as written.";
  } else if (readinessScore < 95) {
    multiplier = 1.02;
    explanation = "Readiness is high (85–94). Small load increase is reasonable if warmups feel strong.";
  } else {
    multiplier = 1.03;
    explanation = "Readiness is excellent (95+). A slightly larger increase is possible — confirm with warmup feel.";
  }

  return { adjustedWeight: weight * multiplier, multiplier, explanation };
}
