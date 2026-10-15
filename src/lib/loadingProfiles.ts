import type { EquipmentCategory, Exercise, LoadingProfile, UnitPreference } from "../types/domain";
import { getExerciseIncrement } from "./trainingIntelligence/weightPrescription";
import { convertWeight, roundToIncrement } from "./trainingMath";

export const DEFAULT_LOADING_PROFILES: LoadingProfile[] = [
  {
    id: "lp_dumbbells",
    name: "Dumbbells",
    unit: "lb",
    increment: 5,
    equipmentType: "dumbbell",
    isDefault: true,
  },
  {
    id: "lp_barbell_plates",
    name: "Barbell / Plates",
    unit: "lb",
    increment: 5,
    equipmentType: "barbell",
    isDefault: true,
  },
  {
    id: "lp_main_cable_stack",
    name: "Main Cable Stack",
    unit: "lb",
    increment: 5,
    equipmentType: "cable_stack",
    isDefault: true,
  },
  {
    id: "lp_lat_pulldown_stack",
    name: "Lat Pulldown Stack",
    unit: "lb",
    increment: 10,
    equipmentType: "cable_stack",
    isDefault: true,
  },
  {
    id: "lp_selectorized_machine",
    name: "Selectorized Machine",
    unit: "lb",
    increment: 10,
    equipmentType: "selectorized_machine",
    isDefault: true,
  },
  {
    id: "lp_bodyweight",
    name: "Bodyweight / Added Load",
    unit: "lb",
    increment: 5,
    equipmentType: "bodyweight",
    isDefault: true,
  },
];

export const CUSTOM_INCREMENT_LOADING_PROFILE_ID = "__custom__";

// Equipment-type → default loading profile ID.
// When an exercise has no explicit loadingProfileId, this provides the automatic default.
export const EQUIPMENT_DEFAULT_PROFILE_IDS: Partial<Record<EquipmentCategory, string>> = {
  dumbbell: "lp_dumbbells",
  barbell: "lp_barbell_plates",
  cable: "lp_main_cable_stack",
  machine: "lp_selectorized_machine",
  bodyweight: "lp_bodyweight",
};

// Explicit per-exercise overrides that differ from the equipment-type default.
// Leave empty until a specific exercise needs a non-default profile (e.g., lat pulldown
// on a separate stack). Equipment defaults in EQUIPMENT_DEFAULT_PROFILE_IDS handle the
// common cases automatically without needing entries here.
export const EXERCISE_LOADING_PROFILE_ASSIGNMENTS: Record<string, string> = {};

export interface EffectiveLoading {
  unit: UnitPreference;
  increment: number;
  source: "exercise_profile" | "equipment_default" | "exercise_specific" | "global";
  loadingProfileId?: string;
  loadingProfileName?: string;
}

function profileToEffectiveLoading(
  profile: LoadingProfile,
  unit: UnitPreference,
  source: EffectiveLoading["source"],
): EffectiveLoading {
  // The loading profile is the increment authority (e.g. "this gym's cable stack jumps by 10
  // lb per pin") — but it is NOT the unit authority. It governs plate/pin math, not which unit
  // an exercise displays in; that's exercise.defaultUnit, set per-exercise in the Exercise
  // Library. All DEFAULT_LOADING_PROFILES increments are authored in lb. Returning the
  // profile's own unit here (as this used to do) silently overrode whatever unit the caller
  // asked for — every barbell/dumbbell/cable/machine exercise effectively came back "lb"
  // regardless of its configured defaultUnit, which is what made the Exercise Library's unit
  // picker show "Controlled by {profile}" and lock the user out of setting kg. Convert the
  // increment into the requested unit instead, and always honor that requested unit.
  const profileUnit: UnitPreference =
    profile.unit === "lb" || profile.unit === "kg" ? profile.unit : unit;
  const increment = profileUnit === unit
    ? profile.increment
    : roundToIncrement(convertWeight(profile.increment, profileUnit, unit) ?? profile.increment, unit === "kg" ? 0.5 : 2.5);
  return {
    unit,
    increment,
    source,
    loadingProfileId: profile.id,
    loadingProfileName: profile.name,
  };
}

export function getEffectiveLoading(
  exercise: Pick<Exercise, "defaultIncrement" | "customIncrement" | "trackPerSide" | "category" | "loadingProfileId">,
  loadingProfiles: LoadingProfile[] | undefined,
  unit: UnitPreference,
): EffectiveLoading {
  if (exercise.loadingProfileId === CUSTOM_INCREMENT_LOADING_PROFILE_ID) {
    const increment = getExerciseIncrement(exercise, unit);
    return {
      unit,
      increment,
      source: "exercise_specific",
      loadingProfileId: CUSTOM_INCREMENT_LOADING_PROFILE_ID,
      loadingProfileName: "Custom increment",
    };
  }

  // 1. Explicit exercise-level profile override.
  const profileId = exercise.loadingProfileId;
  if (profileId && loadingProfiles) {
    const profile = loadingProfiles.find((p) => p.id === profileId);
    if (profile) return profileToEffectiveLoading(profile, unit, "exercise_profile");
  }

  // 2. Equipment-type default profile.
  if (loadingProfiles) {
    const defaultId = EQUIPMENT_DEFAULT_PROFILE_IDS[exercise.category];
    if (defaultId) {
      const profile = loadingProfiles.find((p) => p.id === defaultId);
      if (profile) return profileToEffectiveLoading(profile, unit, "equipment_default");
    }
  }

  // 3. Exercise-specific or global increment fallback.
  const increment = getExerciseIncrement(exercise, unit);
  return {
    unit,
    increment,
    source: (exercise.customIncrement || exercise.defaultIncrement) ? "exercise_specific" : "global",
  };
}
