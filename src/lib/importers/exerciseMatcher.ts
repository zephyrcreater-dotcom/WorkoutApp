import type { Exercise, MuscleGroup } from "../../types/domain";
import type { ExerciseMatchResult, MatchAction, MatchConfidence } from "./importerTypes";

export function normalizeExerciseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMMON_ALIASES: Record<string, string[]> = {
  "competition squat": ["comp squat", "comp sq", "meet squat", "low bar squat", "lowbar squat"],
  "paused squat": ["low bar squat paused", "low bar squat paused squat", "paused low bar squat", "low bar squat paused)"],
  "tempo squat": ["low bar squat tempo", "tempo low bar squat", "low bar squat tempo squat"],
  "high bar squat": ["hb squat", "highbar squat"],
  "competition deadlift": ["comp deadlift", "comp dl", "deadlift", "barbell deadlift", "dl"],
  "sumo deadlift": ["sumo dl"],
  "paused deadlift": ["paused deadlifts", "paused dl", "paused descent deadlifts"],
  "tempo deadlift": ["tempo deadlift", "paused descent deadlift"],
  "beltless sumo deadlift": ["beltless sumo", "beltless sumo dl"],
  "romanian deadlift": ["rdl", "romanian dl", "barbell rdl"],
  "dumbbell romanian deadlift": ["db rdl", "dumbbell rdl"],
  "competition bench press": ["comp bench", "comp bench press", "bench", "bench press", "bb bench", "barbell bench press"],
  "paused bench press": ["paused bench"],
  "tempo bench press": ["tempo press", "2 1 0 bench press", "2-1-0 bench press"],
  "larsen press": ["larsen bench", "larsen"],
  "flat dumbbell press": ["db press", "dumbbell bench press", "flat db press"],
  "incline dumbbell press": ["db incline press", "incline db press", "incline dumbbell", "db incline"],
  "dumbbell shoulder press": ["db shoulder press"],
  "lat pulldown": ["lat pull", "lat pulldowns", "pulldown"],
  "pull-up": ["pullup", "pull up", "pull ups", "pull ups"],
  "one-arm dumbbell row": ["db row", "one arm db row", "single arm dumbbell row"],
  "back extension": ["back extensions"],
  "dumbbell curl": ["db curl", "db curls", "dumbbell curls"],
  "hammer curl": ["db hammer curl", "hammer curls"],
  "preacher curl": ["preacher curls"],
  "cable curl": ["cable curls"],
  "overhead cable triceps extension": ["overhead cable tricep extension"],
  "cable triceps extension": ["cable tricep extension"],
  "cable triceps pressdown": ["cable pushdown", "tricep pressdown", "v bar tricep pushdowns", "v-bar triceps pressdown"],
  "skull crusher": ["skullcrushers", "skull crushers"],
  "cable crunch": ["cable ab crunch"],
  "overhead press": ["ohp", "barbell ohp", "strict press", "military press"],
  "pendlay row": ["pendlay rows"],
};

const VARIATION_HINTS = [
  "paused",
  "tempo",
  "beltless",
  "sumo",
  "deficit",
  "pin",
  "box",
  "close grip",
  "wide grip",
  "larsen",
  "touch and go",
  "touch n go",
  "descent",
];

const LEGACY_CATEGORY_MUSCLES: Record<string, MuscleGroup[]> = {
  quads: ["quads"],
  hamstrings: ["hamstrings", "glutes"],
  shoulders: ["front-delts", "side-delts", "rear-delts"],
  chest: ["chest", "upper-chest", "lower-chest"],
  "biceps long": ["biceps"],
  "biceps short": ["biceps"],
  "biceps overall brachialis": ["biceps", "forearms"],
  triceps: ["triceps"],
  "back lats": ["lats", "back"],
  "back upper": ["upper-back", "mid-back", "traps"],
  abs: ["abs", "obliques"],
};

function cleanCategory(category?: string): string | undefined {
  if (!category) return undefined;
  return normalizeExerciseName(category).replace(/\b(and|overall)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function mapLegacyCategoryToMuscles(category?: string): MuscleGroup[] {
  const cleaned = cleanCategory(category);
  if (!cleaned) return [];
  return LEGACY_CATEGORY_MUSCLES[cleaned] || [];
}

function buildAliasMap(exercises: Exercise[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const exercise of exercises) {
    const norm = normalizeExerciseName(exercise.name);
    map.set(norm, exercise.id);
    for (const [canonical, aliases] of Object.entries(COMMON_ALIASES)) {
      if (normalizeExerciseName(canonical) !== norm) continue;
      aliases.forEach((alias) => {
        const aliasNorm = normalizeExerciseName(alias);
        if (!map.has(aliasNorm)) map.set(aliasNorm, exercise.id);
      });
    }
  }
  return map;
}

function wordOverlapScore(a: string, b: string): number {
  const left = new Set(normalizeExerciseName(a).split(" "));
  const right = new Set(normalizeExerciseName(b).split(" "));
  let shared = 0;
  left.forEach((word) => {
    if (right.has(word)) shared++;
  });
  return shared / Math.max(left.size, right.size, 1);
}

function muscleHintScore(exercise: Exercise, preferredMuscles: MuscleGroup[]): number {
  if (!preferredMuscles.length) return 0;
  const pool = new Set([...exercise.primaryMuscles, ...exercise.secondaryMuscles, exercise.muscleGroup]);
  return preferredMuscles.reduce((score, muscle) => score + (pool.has(muscle) ? 1 : 0), 0);
}

function deriveVariationParent(
  importedName: string,
  exercises: Exercise[],
  preferredMuscles: MuscleGroup[]
): Exercise | undefined {
  const norm = normalizeExerciseName(importedName);
  const candidates = exercises
    .filter((exercise) => {
      const name = normalizeExerciseName(exercise.name);
      return VARIATION_HINTS.some((hint) => norm.includes(hint)) && (
        norm.includes(name) ||
        name.includes(norm.replace(/\b(paused|tempo|beltless|sumo|descent|close grip|wide grip)\b/g, "").trim())
      );
    })
    .sort((a, b) => {
      const overlapDiff = wordOverlapScore(importedName, b.name) - wordOverlapScore(importedName, a.name);
      if (overlapDiff !== 0) return overlapDiff > 0 ? 1 : -1;
      return muscleHintScore(b, preferredMuscles) - muscleHintScore(a, preferredMuscles);
    });
  return candidates[0];
}

function buildResult(
  importedName: string,
  match: Exercise | undefined,
  confidence: MatchConfidence,
  reason: string,
  suggestedAction: MatchAction,
  needsReview: boolean,
  alternativeIds?: string[],
  suggestedParent?: Exercise
): ExerciseMatchResult {
  return {
    importedName,
    matchedExerciseId: match?.id,
    matchedExerciseName: match?.name,
    suggestedParentExerciseId: suggestedParent?.id,
    suggestedParentExerciseName: suggestedParent?.name,
    confidence,
    reason,
    needsReview,
    suggestedAction,
    alternativeIds,
  };
}

export function matchImportedExerciseName(
  importedName: string,
  existingExercises: Exercise[],
  context?: { category?: string; preferredMuscles?: MuscleGroup[] }
): ExerciseMatchResult {
  const norm = normalizeExerciseName(importedName);
  const preferredMuscles = context?.preferredMuscles?.length
    ? context.preferredMuscles
    : mapLegacyCategoryToMuscles(context?.category);
  const aliasMap = buildAliasMap(existingExercises);

  const exactId = aliasMap.get(norm);
  if (exactId) {
    const match = existingExercises.find((exercise) => exercise.id === exactId);
    return buildResult(importedName, match, "high", "Exact or alias match", "use_existing", false);
  }

  const variationParent = deriveVariationParent(importedName, existingExercises, preferredMuscles);
  if (variationParent) {
    return buildResult(
      importedName,
      variationParent,
      "medium",
      "Looks like a named variation of an existing exercise",
      "create_variation",
      true,
      undefined,
      variationParent
    );
  }

  const substringMatches = existingExercises
    .filter((exercise) => normalizeExerciseName(exercise.name).includes(norm) || norm.includes(normalizeExerciseName(exercise.name)))
    .sort((a, b) => muscleHintScore(b, preferredMuscles) - muscleHintScore(a, preferredMuscles));
  if (substringMatches.length === 1) {
    const match = substringMatches[0];
    const confidence: MatchConfidence = norm.length > 5 ? "high" : "medium";
    return buildResult(importedName, match, confidence, "Partial name match", "use_existing", confidence !== "high");
  }

  const scored = existingExercises
    .map((exercise) => {
      const overlap = wordOverlapScore(importedName, exercise.name);
      const muscleBonus = muscleHintScore(exercise, preferredMuscles) * 0.08;
      return { exercise, score: overlap + muscleBonus };
    })
    .filter((entry) => entry.score > 0.34)
    .sort((left, right) => right.score - left.score);

  if (scored.length > 0) {
    const [top, ...rest] = scored;
    const confidence: MatchConfidence = top.score >= 0.9 ? "high" : top.score >= 0.72 ? "medium" : "low";
    const alternatives = rest.slice(0, 3).map((entry) => entry.exercise.id);
    const suggestedAction: MatchAction = confidence === "low" ? "needs_user_review" : "use_existing";
    return buildResult(
      importedName,
      top.exercise,
      confidence,
      `Closest name overlap${preferredMuscles.length ? " with category context" : ""}`,
      suggestedAction,
      confidence !== "high",
      alternatives
    );
  }

  return buildResult(importedName, undefined, "low", "No strong match found", "create_new", true);
}
