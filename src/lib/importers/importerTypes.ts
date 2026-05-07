/**
 * Standard CSV column schema for importing historical workout sessions.
 *
 * Each row represents one logged set. Rows for the same workout share the
 * same date + session identifier. The importer groups rows into sessions,
 * then into loggedExercises, then into sets before writing to TrainingDatabase.
 *
 * Required columns:
 *   date          — ISO date (YYYY-MM-DD) or MM/DD/YYYY
 *   exercise      — Exercise name (matched fuzzy against db.exercises)
 *   set_number    — 1-based integer
 *   reps          — integer
 *   weight        — number (unit from weight_unit column or user default)
 *
 * Optional columns:
 *   weight_unit   — "lb" | "kg" (default: user.unit)
 *   rpe           — number 1–10
 *   set_rating    — 1–5 (1=failed, 5=easy)
 *   notes         — free text
 *   session_label — arbitrary string to group sets into sessions (default: date)
 */
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

/** Result returned by every importer after parsing. */
export interface ImportResult {
  rows: ImportRow[];
  warnings: string[];
  /** Source file name for display purposes. */
  sourceName: string;
}
