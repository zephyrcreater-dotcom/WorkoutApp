import type { BlockType, EquipmentCategory, ExerciseKind, MovementPattern } from "../../types/domain";

export type VolumeLandmark = { mev: number; mav: number; mrv: number };

export const VOLUME_LANDMARKS: Partial<Record<string, VolumeLandmark>> = {
  chest:       { mev: 8,  mav: 16, mrv: 22 },
  back:        { mev: 10, mav: 18, mrv: 25 },
  lats:        { mev: 8,  mav: 14, mrv: 20 },
  "upper-back":{ mev: 6,  mav: 12, mrv: 20 },
  quads:       { mev: 8,  mav: 16, mrv: 20 },
  hamstrings:  { mev: 6,  mav: 12, mrv: 18 },
  glutes:      { mev: 4,  mav: 10, mrv: 16 },
  calves:      { mev: 8,  mav: 16, mrv: 20 },
  biceps:      { mev: 6,  mav: 14, mrv: 20 },
  triceps:     { mev: 6,  mav: 14, mrv: 20 },
  "front-delts":{ mev: 0, mav: 8,  mrv: 14 },
  "side-delts":{ mev: 6,  mav: 16, mrv: 22 },
  "rear-delts":{ mev: 6,  mav: 16, mrv: 22 },
  abs:         { mev: 0,  mav: 12, mrv: 20 },
  forearms:    { mev: 0,  mav: 8,  mrv: 14 },
};

export type BlockTypeModifiers = {
  volumeFactor: number;
  intensityFactor: number;
  weeklyProgressionFactor: number;
  description: string;
};

export const BLOCK_TYPE_RULES: Record<BlockType, BlockTypeModifiers> = {
  accumulation: {
    volumeFactor: 1.1,
    intensityFactor: 0.93,
    weeklyProgressionFactor: 0.02,
    description: "Higher volume, moderate intensity. Build work capacity.",
  },
  hypertrophy: {
    volumeFactor: 1.0,
    intensityFactor: 0.90,
    weeklyProgressionFactor: 0.02,
    description: "Moderate-high volume, moderate intensity. Maximize muscle stimulus.",
  },
  strength: {
    volumeFactor: 0.85,
    intensityFactor: 0.96,
    weeklyProgressionFactor: 0.025,
    description: "Lower volume, higher intensity. Build maximal strength.",
  },
  intensification: {
    volumeFactor: 0.80,
    intensityFactor: 0.975,
    weeklyProgressionFactor: 0.025,
    description: "Low volume, high intensity. Convert volume gains to strength.",
  },
  peaking: {
    volumeFactor: 0.65,
    intensityFactor: 1.0,
    weeklyProgressionFactor: 0.03,
    description: "Very low volume, near-maximal specificity and intensity.",
  },
  deload: {
    volumeFactor: 0.60,
    intensityFactor: 0.88,
    weeklyProgressionFactor: 0,
    description: "Reduced volume and intensity. Recover without losing adaptation.",
  },
  maintenance: {
    volumeFactor: 0.80,
    intensityFactor: 0.90,
    weeklyProgressionFactor: 0,
    description: "Maintain current capacity without accumulating fatigue.",
  },
  conditioning: {
    volumeFactor: 1.0,
    intensityFactor: 0.80,
    weeklyProgressionFactor: 0.01,
    description: "Cardiovascular and muscular endurance focus.",
  },
  pivot: {
    volumeFactor: 0.85,
    intensityFactor: 0.88,
    weeklyProgressionFactor: 0.01,
    description: "Transition block between training phases.",
  },
  custom: {
    volumeFactor: 1.0,
    intensityFactor: 1.0,
    weeklyProgressionFactor: 0,
    description: "Custom programming — no automatic modifiers applied.",
  },
};

export type ExerciseFatigueProfile = {
  systemicFatigue: number;
  localFatigue: number;
  repDropSensitivity: number;
  failureTolerance: number;
  intraSetRestMultiplier: number;
};

export function getExerciseFatigueProfile(exercise: {
  category: EquipmentCategory;
  kind: ExerciseKind[];
  isCompound?: boolean;
  fatigueRating?: 1 | 2 | 3 | 4 | 5;
  movementPattern: MovementPattern;
}): ExerciseFatigueProfile {
  const { category, kind, isCompound, fatigueRating, movementPattern } = exercise;

  let systemicFatigue = 2;
  let localFatigue = 2;
  let repDropSensitivity = 2;
  let failureTolerance = 3;
  let intraSetRestMultiplier = 1.0;

  if (category === "barbell") {
    systemicFatigue = 4;
    localFatigue = 3;
    repDropSensitivity = 3;
    failureTolerance = 2;
    intraSetRestMultiplier = 1.3;
  } else if (category === "dumbbell") {
    systemicFatigue = 2;
    localFatigue = 3;
    repDropSensitivity = 3;
    failureTolerance = 4;
    intraSetRestMultiplier = 1.0;
  } else if (category === "cable" || category === "machine") {
    systemicFatigue = 1;
    localFatigue = 3;
    repDropSensitivity = 4;
    failureTolerance = 5;
    intraSetRestMultiplier = 0.8;
  } else if (category === "bodyweight") {
    systemicFatigue = 2;
    localFatigue = 2;
    repDropSensitivity = 2;
    failureTolerance = 5;
    intraSetRestMultiplier = 0.8;
  }

  if (isCompound || kind.includes("compound") || kind.includes("competition-lift")) {
    systemicFatigue = Math.min(5, systemicFatigue + 1);
    intraSetRestMultiplier = Math.max(intraSetRestMultiplier, 1.2);
  }

  if (movementPattern === "squat" || movementPattern === "hinge") {
    systemicFatigue = Math.min(5, systemicFatigue + 1);
    repDropSensitivity = Math.min(5, repDropSensitivity + 1);
    failureTolerance = Math.max(1, failureTolerance - 1);
    intraSetRestMultiplier = Math.max(intraSetRestMultiplier, 1.4);
  }

  if (kind.includes("isolation")) {
    systemicFatigue = Math.max(1, systemicFatigue - 1);
    localFatigue = Math.min(5, localFatigue + 1);
    repDropSensitivity = Math.min(5, repDropSensitivity + 1);
    failureTolerance = Math.min(5, failureTolerance + 1);
  }

  if (fatigueRating !== undefined) {
    systemicFatigue = Math.round((systemicFatigue + fatigueRating) / 2);
    localFatigue = Math.round((localFatigue + fatigueRating) / 2);
  }

  return { systemicFatigue, localFatigue, repDropSensitivity, failureTolerance, intraSetRestMultiplier };
}
