import type { Exercise, ExerciseBaseline, TrainingDatabase, UserProfile, WorkoutSession } from "../../types/domain";
import { todayIso } from "../ids";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCSV(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: (string | number | undefined | null)[]): string {
  return values.map(escapeCSV).join(",");
}

// ---------------------------------------------------------------------------
// Exercise CSV export
// ---------------------------------------------------------------------------

export const EXERCISE_CSV_HEADERS = [
  "name",
  "primaryMuscles",
  "secondaryMuscles",
  "equipment",
  "unit",
  "increment",
  "source",
  "parentExerciseName",
  "isVariation",
  "variationType",
  "exerciseFamily",
  "movementPattern",
  "variationGroup",
  "category",
  "baselineWeight",
  "baselineSets",
  "baselineReps",
  "baselineRpe",
  "baselineE1RM",
  "baselineSource",
  "baselineUpdatedAt",
  "notes",
] as const;

function getExerciseExportRows(
  exercises: Exercise[],
  allExercises: Exercise[],
  baselines: ExerciseBaseline[] = []
): (string | number | undefined | null)[][] {
  return exercises.map((ex) => {
    const parent = ex.parentExerciseId
      ? allExercises.find((e) => e.id === ex.parentExerciseId)?.name
      : undefined;
    const baseline = baselines.find((item) => item.exerciseId === ex.id);
    return [
      ex.name,
      ex.primaryMuscles.join("; "),
      ex.secondaryMuscles.join("; "),
      ex.equipment.join("; "),
      ex.defaultUnit ?? "",
      ex.defaultIncrement ?? ex.increment ?? "",
      ex.source ?? (ex.ownerUserId ? "custom" : "default"),
      parent ?? "",
      ex.isVariation ? "true" : "false",
      ex.variationType ?? ex.variationName ?? "",
      ex.exerciseFamily ?? "",
      ex.movementPattern ?? "",
      ex.variationGroup ?? "",
      ex.exerciseCategory ?? ex.category ?? "",
      baseline?.baselineWeight ?? "",
      baseline?.baselineSets ?? "",
      baseline?.baselineReps ?? "",
      baseline?.baselineRpe ?? "",
      baseline?.baselineE1RM ?? "",
      baseline?.source ?? "",
      baseline?.updatedAt ?? "",
      baseline?.notes ?? ex.notes ?? "",
    ];
  });
}

export function exportExercisesCSV(
  exercises: Exercise[],
  allExercises: Exercise[],
  baselines: ExerciseBaseline[] = []
): string {
  const lines: string[] = [EXERCISE_CSV_HEADERS.join(",")];
  for (const row of getExerciseExportRows(exercises, allExercises, baselines)) {
    lines.push(
      csvRow(row)
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Workout history CSV export
// ---------------------------------------------------------------------------

export const WORKOUT_HISTORY_CSV_HEADERS = [
  "date",
  "workout_name",
  "exercise_name",
  "set_number",
  "weight",
  "unit",
  "reps",
  "rpe",
  "e1rm",
  "rir",
  "difficulty",
  "notes",
  "set_type",
  "duration_seconds",
  "distance",
  "source",
] as const;

function getWorkoutHistoryExportRows(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  userId: string
): (string | number | undefined | null)[][] {
  const rows: (string | number | undefined | null)[][] = [];
  const completed = sessions
    .filter((s) => s.userId === userId && s.status === "completed")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  for (const session of completed) {
    const date = session.startedAt.slice(0, 10);
    for (const loggedEx of session.loggedExercises) {
      const exercise = exercises.find((e) => e.id === loggedEx.exerciseId);
      const exerciseName = exercise?.name ?? loggedEx.exerciseId;
      for (const set of loggedEx.sets) {
        rows.push([
          date,
          session.name,
          exerciseName,
          set.setNumber ?? "",
          set.actualWeight !== 0 ? set.actualWeight : "",
          set.unit ?? exercise?.defaultUnit ?? "",
          set.actualReps !== 0 ? set.actualReps : "",
          set.actualRpe ?? "",
          set.e1rm ?? "",
          "",
          "",
          set.notes ?? "",
          set.kind,
          "",
          "",
          session.source ?? "iron_orbit",
        ]);
      }
    }
  }

  return rows;
}

export function exportWorkoutHistoryCSV(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  userId: string
): string {
  const lines: string[] = [WORKOUT_HISTORY_CSV_HEADERS.join(",")];
  for (const row of getWorkoutHistoryExportRows(sessions, exercises, userId)) {
    lines.push(csvRow(row));
  }
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function spreadsheetCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") {
    return "<Cell><Data ss:Type=\"String\"></Data></Cell>";
  }
  if (typeof value === "number") {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  const numeric = Number(value);
  if (value.trim() !== "" && !Number.isNaN(numeric) && !/[^\d.-]/.test(value)) {
    return `<Cell><Data ss:Type="Number">${numeric}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`;
}

export function exportTrainingDataWorkbook(
  exercises: Exercise[],
  allExercises: Exercise[],
  baselines: ExerciseBaseline[],
  sessions: WorkoutSession[],
  user: UserProfile,
): string {
  const sheets = [
    {
      name: "Exercises",
      headers: EXERCISE_CSV_HEADERS as readonly string[],
      rows: getExerciseExportRows(exercises, allExercises, baselines),
    },
    {
      name: "Workout History",
      headers: WORKOUT_HISTORY_CSV_HEADERS as readonly string[],
      rows: getWorkoutHistoryExportRows(sessions, allExercises, user.id),
    },
  ];

  const worksheets = sheets.map((sheet) => {
    const rows = [sheet.headers, ...sheet.rows]
      .map((row) => `<Row>${row.map((cell) => spreadsheetCell(cell)).join("")}</Row>`)
      .join("");
    return `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${rows}</Table></Worksheet>`;
  }).join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets}
</Workbook>`;
}

// ---------------------------------------------------------------------------
// Full backup JSON export
// ---------------------------------------------------------------------------

export function exportFullBackupJSON(db: TrainingDatabase): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: db,
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Download helpers (browser only)
// ---------------------------------------------------------------------------

export function downloadText(filename: string, content: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadExercisesCSV(
  exercises: Exercise[],
  allExercises: Exercise[],
  baselines: ExerciseBaseline[] = []
) {
  downloadText(
    `iron-orbit-exercises-${todayIso()}.csv`,
    exportExercisesCSV(exercises, allExercises, baselines),
    "text/csv"
  );
}

export function downloadWorkoutHistoryCSV(
  db: TrainingDatabase,
  user: UserProfile
) {
  downloadText(
    `iron-orbit-workout-history-${todayIso()}.csv`,
    exportWorkoutHistoryCSV(db.sessions, db.exercises, user.id),
    "text/csv"
  );
}

export function downloadTrainingDataWorkbook(
  db: TrainingDatabase,
  user: UserProfile
) {
  const userExercises = db.exercises.filter((exercise) => !exercise.isArchived && (!exercise.ownerUserId || exercise.ownerUserId === user.id));
  const userBaselines = (db.exerciseBaselines || []).filter((baseline) => baseline.userId === user.id);
  downloadText(
    `iron-orbit-training-data-${todayIso()}.xls`,
    exportTrainingDataWorkbook(userExercises, db.exercises, userBaselines, db.sessions, user),
    "application/vnd.ms-excel"
  );
}

export function downloadFullBackupJSON(db: TrainingDatabase, label = "local") {
  downloadText(
    `iron-orbit-${label}-backup-${todayIso()}.json`,
    exportFullBackupJSON(db),
    "application/json"
  );
}
