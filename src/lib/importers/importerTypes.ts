/**
 * Types for the CSV workout history import / export pipeline.
 *
 * CSV schema — one row per logged set:
 *   date            YYYY-MM-DD (required)
 *   workout_name    arbitrary string used to group sets into a session
 *   exercise_name   matched against db.exercises (required)
 *   set_number      1-based integer (optional but recommended)
 *   weight          number (optional for bodyweight / time-based)
 *   unit            "lb" | "kg" (falls back to exercise default then user.unit)
 *   reps            integer (optional for time-based)
 *   rpe             number 1–10 (optional)
 *   rir             number 0–4 (optional)
 *   difficulty      "easy" | "moderate" | "hard" | "max" (optional)
 *   notes           free text (optional)
 *   set_type        "working" | "warmup" | "backoff" | "top" | "drop" | "skipped" (optional, default "working")
 *   duration_seconds integer (optional, for time-based exercises)
 *   distance        number (optional, for conditioning)
 *   source          free text tag, default "csv_import"
 */
export interface CSVImportRow {
  date: string;
  workout_name?: string;
  exercise_name: string;
  set_number?: number;
  weight?: number;
  unit?: "lb" | "kg";
  reps?: number;
  rpe?: number;
  rir?: number;
  difficulty?: string;
  notes?: string;
  set_type?: "working" | "warmup" | "backoff" | "top" | "drop" | "skipped";
  duration_seconds?: number;
  distance?: number;
  source?: string;
}

export const CSV_IMPORT_COLUMNS = [
  "date",
  "workout_name",
  "exercise_name",
  "set_number",
  "weight",
  "unit",
  "reps",
  "rpe",
  "rir",
  "difficulty",
  "notes",
  "set_type",
  "duration_seconds",
  "distance",
  "source",
] as const;

export type CSVImportColumn = (typeof CSV_IMPORT_COLUMNS)[number];

export interface CSVParseResult {
  rows: CSVImportRow[];
  warnings: string[];
  errors: string[];
  sourceName: string;
}

/** Confidence level for exercise name matching. */
export type MatchConfidence = "high" | "medium" | "low";

/** Suggested action when a match result is returned. */
export type MatchAction =
  | "use_existing"
  | "create_new"
  | "create_variation"
  | "needs_user_review";

export interface ExerciseMatchResult {
  importedName: string;
  matchedExerciseId?: string;
  matchedExerciseName?: string;
  suggestedParentExerciseId?: string;
  suggestedParentExerciseName?: string;
  confidence: MatchConfidence;
  reason: string;
  needsReview: boolean;
  suggestedAction: MatchAction;
  alternativeIds?: string[];
}

export interface ImportRowGroup {
  date: string;
  workoutName: string;
  exerciseName: string;
  matchResult: ExerciseMatchResult;
  rows: CSVImportRow[];
}

/** Summary shown to the user before they confirm an import. */
export interface ImportReviewSummary {
  totalRows: number;
  workoutsDetected: number;
  exercisesMatched: number;
  exercisesNeedingReview: number;
  rowsWithErrors: number;
  groups: ImportRowGroup[];
  warnings: string[];
  errors: string[];
}

/** Legacy stub type kept for backward compat with nathanielProgramImport. */
export interface ImportRow {
  date: string;
  exercise: string;
  set_number: number;
  reps: number;
  weight: number;
  weight_unit?: "lb" | "kg";
  rpe?: number;
  set_rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  session_label?: string;
}

export interface ImportResult {
  rows: ImportRow[];
  warnings: string[];
  sourceName: string;
}

// ---------------------------------------------------------------------------
// Exercise library / baseline import types
// ---------------------------------------------------------------------------

export type ExerciseImportFormat =
  | "iron_orbit_exercise_csv"
  | "legacy_exercises_csv"
  | "legacy_exercises_workbook";

export interface ImportedExercisePerformance {
  weight?: number;
  sets?: number;
  reps?: number;
  rpe?: number;
  e1rm?: number;
}

export interface ExerciseImportRow {
  rowId: string;
  sourceName: string;
  sourceFormat: ExerciseImportFormat;
  rowNumber: number;
  name: string;
  category?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string[];
  unit?: "lb" | "kg";
  increment?: number;
  source?: string;
  parentExerciseName?: string;
  isVariation?: boolean;
  variationType?: string;
  exerciseFamily?: string;
  movementPattern?: string;
  variationGroup?: string;
  baselineSource?: string;
  baselineUpdatedAt?: string;
  lastPerformance?: ImportedExercisePerformance;
  baselinePerformance?: ImportedExercisePerformance;
  notes?: string;
}

export interface ExerciseImportParseResult {
  format?: ExerciseImportFormat;
  rows: ExerciseImportRow[];
  warnings: string[];
  errors: string[];
  sourceName: string;
}

export type ExerciseImportAction =
  | "update_baseline"
  | "keep_existing_baseline"
  | "replace_baseline"
  | "keep_newer_baseline"
  | "add_historical_data"
  | "create_custom_exercise"
  | "create_variation"
  | "map_to_existing"
  | "skip";

export type BaselineConflictMode =
  | "none"
  | "safe_add"
  | "conflict";

export interface ExerciseImportReviewItem {
  row: ExerciseImportRow;
  matchResult: ExerciseMatchResult;
  matchedExerciseId?: string;
  matchedExerciseName?: string;
  suggestedParentExerciseId?: string;
  suggestedParentExerciseName?: string;
  action: ExerciseImportAction;
  existingBaseline?: ImportedExercisePerformance & {
    updatedAt?: string;
    source?: string;
    notes?: string;
  };
  baselineConflict: BaselineConflictMode;
  willCreateHistory: boolean;
  willAutoFillBaseline: boolean;
  metadataOnly: boolean;
  reason: string;
  needsReview: boolean;
}

export interface ExerciseImportReviewSummary {
  format?: ExerciseImportFormat;
  totalExerciseRows: number;
  rowsWithBaselineData: number;
  matchedExistingExercises: number;
  newCustomExercises: number;
  variationsSuggested: number;
  baselineUpdatesAvailable: number;
  historyRecordsToCreate: number;
  autoFillBaselineRows: number;
  metadataOnlyRows: number;
  baselineConflicts: number;
  skippedOrInvalidRows: number;
  items: ExerciseImportReviewItem[];
  warnings: string[];
  errors: string[];
}

export type UnifiedImportSectionKind = "exercise_baselines" | "workout_history";

export interface UnifiedTrainingDataParseResult {
  sourceName: string;
  detectedSections: UnifiedImportSectionKind[];
  exerciseData?: ExerciseImportParseResult;
  workoutData?: CSVParseResult;
  warnings: string[];
  errors: string[];
}
