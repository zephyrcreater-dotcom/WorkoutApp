import type { Exercise, LoggedSet, LoggedExercise, WorkoutSession, TrainingDatabase, UserProfile } from "../../types/domain";
import { createId, nowIso } from "../ids";
import type {
  CSVImportRow,
  CSVParseResult,
  ExerciseMatchResult,
  ImportReviewSummary,
  ImportRowGroup,
} from "./importerTypes";
import { CSV_IMPORT_COLUMNS } from "./importerTypes";
import { matchImportedExerciseName } from "./exerciseMatcher";

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeDate(raw: string): string | undefined {
  if (!raw) return undefined;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, "_");
}

/** Parse raw CSV text into structured rows. */
export function parseCSVText(
  text: string,
  sourceName: string
): CSVParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], warnings: [], errors: ["CSV has no data rows."], sourceName };
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));
  const warnings: string[] = [];
  const errors: string[] = [];
  const rows: CSVImportRow[] = [];

  // Warn about missing optional but useful columns
  const knownCols = new Set(CSV_IMPORT_COLUMNS as readonly string[]);
  const unknownCols = headers.filter((h) => !knownCols.has(h));
  if (unknownCols.length) {
    warnings.push(`Unknown columns will be ignored: ${unknownCols.join(", ")}`);
  }

  if (!headers.includes("exercise_name")) {
    errors.push("Missing required column: exercise_name");
  }
  if (!headers.includes("date")) {
    warnings.push("No date column — rows will be imported without a date.");
  }

  if (errors.length) return { rows, warnings, errors, sourceName };

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = values[idx] ?? ""; });

    const exerciseName = raw["exercise_name"]?.trim();
    if (!exerciseName) {
      warnings.push(`Row ${i + 1}: missing exercise_name — skipped.`);
      continue;
    }

    const rawDate = raw["date"]?.trim();
    const date = rawDate ? normalizeDate(rawDate) : undefined;
    if (rawDate && !date) {
      warnings.push(`Row ${i + 1}: unrecognised date "${rawDate}" — row included without date.`);
    }

    const setType = (raw["set_type"]?.trim() || "working") as CSVImportRow["set_type"];
    const validSetTypes = new Set(["working", "warmup", "backoff", "top", "drop", "skipped"]);
    const resolvedSetType = validSetTypes.has(setType ?? "") ? setType : "working";

    rows.push({
      date: date ?? rawDate ?? "",
      workout_name: raw["workout_name"]?.trim() || undefined,
      exercise_name: exerciseName,
      set_number: raw["set_number"] ? Number(raw["set_number"]) : undefined,
      weight: raw["weight"] !== "" ? Number(raw["weight"]) : undefined,
      unit: (raw["unit"] === "kg" ? "kg" : raw["unit"] === "lb" ? "lb" : undefined),
      reps: raw["reps"] !== "" ? Number(raw["reps"]) : undefined,
      rpe: raw["rpe"] !== "" ? Number(raw["rpe"]) : undefined,
      rir: raw["rir"] !== "" ? Number(raw["rir"]) : undefined,
      difficulty: raw["difficulty"]?.trim() || undefined,
      notes: raw["notes"]?.trim() || undefined,
      set_type: resolvedSetType,
      duration_seconds: raw["duration_seconds"] !== "" ? Number(raw["duration_seconds"]) : undefined,
      distance: raw["distance"] !== "" ? Number(raw["distance"]) : undefined,
      source: raw["source"]?.trim() || "csv_import",
    });
  }

  return { rows, warnings, errors, sourceName };
}

function readUInt16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUInt32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function unzipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let eocdOffset = -1;
  for (let index = bytes.length - 22; index >= 0; index--) {
    if (readUInt32(view, index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Unsupported workbook: ZIP footer not found.");

  const centralDirectorySize = readUInt32(view, eocdOffset + 12);
  const centralDirectoryOffset = readUInt32(view, eocdOffset + 16);
  const entries = new Map<string, Uint8Array>();
  let cursor = centralDirectoryOffset;
  const centralEnd = centralDirectoryOffset + centralDirectorySize;

  while (cursor < centralEnd) {
    if (readUInt32(view, cursor) !== 0x02014b50) break;
    const compressionMethod = readUInt16(view, cursor + 10);
    const compressedSize = readUInt32(view, cursor + 20);
    const fileNameLength = readUInt16(view, cursor + 28);
    const extraLength = readUInt16(view, cursor + 30);
    const commentLength = readUInt16(view, cursor + 32);
    const localHeaderOffset = readUInt32(view, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));

    if (readUInt32(view, localHeaderOffset) !== 0x04034b50) {
      throw new Error("Unsupported workbook: ZIP local header missing.");
    }

    const localNameLength = readUInt16(view, localHeaderOffset + 26);
    const localExtraLength = readUInt16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const content = compressionMethod === 0 ? compressed : await inflateRaw(compressed);
    entries.set(name, content);

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function resolveWorkbookPath(basePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseParts = basePath.split("/").slice(0, -1);
  target.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  });
  return baseParts.join("/");
}

function getCellText(cell: Element, sharedStrings: string[]): string {
  const cellType = cell.getAttribute("t");
  if (cellType === "s") {
    const index = Number(cell.querySelector("v")?.textContent || "0");
    return sharedStrings[index] || "";
  }
  if (cellType === "inlineStr") {
    return cell.querySelector("is > t")?.textContent?.trim() || "";
  }
  return cell.querySelector("v")?.textContent?.trim() || "";
}

function columnLetter(cellRef: string): string {
  const match = cellRef.match(/[A-Z]+/i);
  return match?.[0]?.toUpperCase() || "";
}

export async function parseWorkoutHistoryWorkbook(buffer: ArrayBuffer, sourceName: string): Promise<CSVParseResult> {
  const entries = await unzipEntries(buffer);
  const decoder = new TextDecoder();
  const workbookXml = entries.get("xl/workbook.xml");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    return {
      rows: [],
      warnings: [],
      errors: ["Workbook is missing the metadata needed to find the Workout History sheet."],
      sourceName,
    };
  }

  const workbookDoc = parseXml(decoder.decode(workbookXml));
  const relsDoc = parseXml(decoder.decode(relsXml));
  const rels = new Map<string, string>();
  relsDoc.querySelectorAll("Relationship").forEach((node) => {
    const id = node.getAttribute("Id");
    const target = node.getAttribute("Target");
    if (id && target) rels.set(id, resolveWorkbookPath("xl/workbook.xml", target));
  });

  const workoutSheet = Array.from(workbookDoc.querySelectorAll("sheet")).find((sheet) => {
    const normalizedName = sheet.getAttribute("name")?.trim().toLowerCase().replace(/\s+/g, " ");
    return normalizedName === "workout history" || normalizedName === "workout_history";
  });
  if (!workoutSheet) {
    return {
      rows: [],
      warnings: [],
      errors: ['Workbook does not include a sheet named "Workout History".'],
      sourceName,
    };
  }

  const relId = workoutSheet.getAttribute("r:id");
  const sheetPath = relId ? rels.get(relId) : undefined;
  const sheetXml = sheetPath ? entries.get(sheetPath) : undefined;
  if (!sheetXml) {
    return {
      rows: [],
      warnings: [],
      errors: ['Could not open the workbook "Workout History" sheet.'],
      sourceName,
    };
  }

  const sharedStrings = (() => {
    const xml = entries.get("xl/sharedStrings.xml");
    if (!xml) return [] as string[];
    const doc = parseXml(decoder.decode(xml));
    return Array.from(doc.querySelectorAll("si")).map((item) =>
      Array.from(item.querySelectorAll("t")).map((node) => node.textContent || "").join("")
    );
  })();

  const sheetDoc = parseXml(decoder.decode(sheetXml));
  const rows = Array.from(sheetDoc.querySelectorAll("sheetData > row")).map((row) => {
    const cells = new Map<string, string>();
    row.querySelectorAll("c").forEach((cell) => {
      const ref = cell.getAttribute("r");
      if (!ref) return;
      cells.set(columnLetter(ref), getCellText(cell, sharedStrings));
    });
    return [
      cells.get("A") || "",
      cells.get("B") || "",
      cells.get("C") || "",
      cells.get("D") || "",
      cells.get("E") || "",
      cells.get("F") || "",
      cells.get("G") || "",
      cells.get("H") || "",
      cells.get("I") || "",
      cells.get("J") || "",
      cells.get("K") || "",
      cells.get("L") || "",
      cells.get("M") || "",
      cells.get("N") || "",
      cells.get("O") || "",
    ];
  });

  if (!rows.length) {
    return { rows: [], warnings: [], errors: ["Workout History sheet is empty."], sourceName };
  }

  const headers = rows[0].map(normalizeHeader);
  const warnings: string[] = [];
  const errors: string[] = [];
  const parsedRows: CSVImportRow[] = [];

  if (!headers.includes("exercise_name")) {
    errors.push("Missing required column: exercise_name");
  }
  if (!headers.includes("date")) {
    warnings.push("No date column — rows will be imported without a date.");
  }
  if (errors.length) return { rows: [], warnings, errors, sourceName };

  rows.slice(1).forEach((values, index) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      raw[header] = values[headerIndex] ?? "";
    });

    const exerciseName = raw.exercise_name?.trim();
    if (!exerciseName) {
      if ((Object.values(raw) as string[]).some((value) => value?.trim())) {
        warnings.push(`Row ${index + 2}: missing exercise_name — skipped.`);
      }
      return;
    }

    const rawDate = raw.date?.trim();
    const date = rawDate ? normalizeDate(rawDate) : undefined;
    if (rawDate && !date) {
      warnings.push(`Row ${index + 2}: unrecognised date "${rawDate}" — row included without a date.`);
    }

    const setType = (raw.set_type?.trim() || "working") as CSVImportRow["set_type"];
    const validSetTypes = new Set(["working", "warmup", "backoff", "top", "drop", "skipped"]);
    const resolvedSetType = validSetTypes.has(setType ?? "") ? setType : "working";

    parsedRows.push({
      date: date ?? rawDate ?? "",
      workout_name: raw.workout_name?.trim() || undefined,
      exercise_name: exerciseName,
      set_number: raw.set_number ? Number(raw.set_number) : undefined,
      weight: raw.weight !== "" ? Number(raw.weight) : undefined,
      unit: raw.unit === "kg" ? "kg" : raw.unit === "lb" ? "lb" : undefined,
      reps: raw.reps !== "" ? Number(raw.reps) : undefined,
      rpe: raw.rpe !== "" ? Number(raw.rpe) : undefined,
      rir: raw.rir !== "" ? Number(raw.rir) : undefined,
      difficulty: raw.difficulty?.trim() || undefined,
      notes: raw.notes?.trim() || undefined,
      set_type: resolvedSetType,
      duration_seconds: raw.duration_seconds !== "" ? Number(raw.duration_seconds) : undefined,
      distance: raw.distance !== "" ? Number(raw.distance) : undefined,
      source: raw.source?.trim() || "csv_import",
    });
  });

  return { rows: parsedRows, warnings, errors, sourceName };
}

// ---------------------------------------------------------------------------
// Review summary
// ---------------------------------------------------------------------------

type DupKey = string;
const dupKeys = new Set<DupKey>();

function buildDupKey(row: CSVImportRow, exerciseId: string): DupKey {
  return [row.date, exerciseId, row.set_number ?? "", row.weight ?? "", row.unit ?? "", row.reps ?? "", row.rpe ?? ""].join("|");
}

/** Group parsed rows by (date, workoutName, exerciseName) and match exercises. */
export function buildImportReviewSummary(
  parseResult: CSVParseResult,
  exercises: Exercise[]
): ImportReviewSummary {
  const { rows, warnings, errors } = parseResult;

  const byWorkout = new Map<string, Map<string, CSVImportRow[]>>();
  for (const row of rows) {
    const workoutKey = `${row.date}||${row.workout_name || row.date}`;
    if (!byWorkout.has(workoutKey)) byWorkout.set(workoutKey, new Map());
    const byExercise = byWorkout.get(workoutKey)!;
    if (!byExercise.has(row.exercise_name)) byExercise.set(row.exercise_name, []);
    byExercise.get(row.exercise_name)!.push(row);
  }

  const groups: ImportRowGroup[] = [];
  for (const [workoutKey, byExercise] of byWorkout.entries()) {
    const [date, workoutName] = workoutKey.split("||");
    for (const [exerciseName, exerciseRows] of byExercise.entries()) {
      const matchResult = matchImportedExerciseName(exerciseName, exercises);
      groups.push({ date, workoutName, exerciseName, matchResult, rows: exerciseRows });
    }
  }

  const workoutsDetected = byWorkout.size;
  const exercisesMatched = groups.filter((g) => g.matchResult.confidence === "high").length;
  const exercisesNeedingReview = groups.filter((g) => g.matchResult.needsReview).length;

  return {
    totalRows: rows.length,
    workoutsDetected,
    exercisesMatched,
    exercisesNeedingReview,
    rowsWithErrors: errors.length,
    groups,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Importing into the database
// ---------------------------------------------------------------------------

function setKindFromType(setType?: CSVImportRow["set_type"]): LoggedSet["kind"] {
  switch (setType) {
    case "warmup": return "warmup";
    case "backoff": return "backoff";
    case "top": return "top";
    case "drop": return "drop";
    default: return "working";
  }
}

/**
 * Write confirmed import groups into the database. Skips duplicates detected
 * by date + exerciseId + set_number + weight + reps + rpe fingerprint.
 * Imported sessions are tagged with source = "csv_import".
 */
export function applyImportGroups(
  db: TrainingDatabase,
  user: UserProfile,
  groups: ImportRowGroup[],
  exerciseOverrides: Map<string, string>
): { sessionsAdded: number; setsAdded: number; duplicatesSkipped: number } {
  dupKeys.clear();
  for (const session of db.sessions) {
    for (const loggedEx of session.loggedExercises) {
      for (const set of loggedEx.sets) {
        const matchedExercise = db.exercises.find((exercise) => exercise.id === loggedEx.exerciseId);
        dupKeys.add(buildDupKey(
          {
            date: session.startedAt.slice(0, 10),
            exercise_name: loggedEx.exerciseId,
            set_number: set.setNumber,
            weight: set.actualWeight,
            unit: set.unit === "kg" || set.unit === "lb" ? set.unit : matchedExercise?.defaultUnit === "kg" || matchedExercise?.defaultUnit === "lb" ? matchedExercise.defaultUnit : undefined,
            reps: set.actualReps,
            rpe: set.actualRpe,
          } as CSVImportRow,
          loggedEx.exerciseId
        ));
      }
    }
  }

  const byWorkout = new Map<string, ImportRowGroup[]>();
  for (const group of groups) {
    const key = `${group.date}||${group.workoutName}`;
    if (!byWorkout.has(key)) byWorkout.set(key, []);
    byWorkout.get(key)!.push(group);
  }

  let sessionsAdded = 0;
  let setsAdded = 0;
  let duplicatesSkipped = 0;

  for (const [key, workoutGroups] of byWorkout.entries()) {
    const [date, workoutName] = key.split("||");
    const sessionId = createId("session");
    const loggedExercises: LoggedExercise[] = [];

    let order = 0;
    for (const group of workoutGroups) {
      const exerciseId = exerciseOverrides.get(group.exerciseName)
        ?? group.matchResult.matchedExerciseId;
      if (!exerciseId) continue;
      const matchedExercise = db.exercises.find((exercise) => exercise.id === exerciseId);

      const sets: LoggedSet[] = [];
      for (const row of group.rows) {
        const dupKey = buildDupKey(row, exerciseId);
        if (dupKeys.has(dupKey)) {
          duplicatesSkipped++;
          continue;
        }
        dupKeys.add(dupKey);

        const set: LoggedSet = {
          id: createId("set"),
          kind: setKindFromType(row.set_type),
          setNumber: row.set_number,
          actualWeight: row.weight ?? 0,
          unit: row.unit || matchedExercise?.defaultUnit || user.unit,
          actualReps: row.reps ?? 0,
          actualRpe: row.rpe,
          setRating: 3,
          skipped: row.set_type === "skipped",
          completedAt: `${date}T12:00:00.000Z`,
          notes: row.notes
            ? `${row.notes}${row.source ? ` [${row.source}]` : ""}`
            : row.source
            ? `[${row.source}]`
            : undefined,
        };
        sets.push(set);
        setsAdded++;
      }

      if (!sets.length) continue;

      loggedExercises.push({
        id: createId("logex"),
        exerciseId,
        order: order++,
        sets,
        weakPointTags: [],
        offProgram: true,
      });
    }

    if (!loggedExercises.length) continue;

    const session: WorkoutSession = {
      id: sessionId,
      userId: user.id,
      name: workoutName !== date ? workoutName : `Imported — ${date}`,
      status: "completed",
      startedAt: `${date}T12:00:00.000Z`,
      completedAt: `${date}T13:00:00.000Z`,
      updatedAt: nowIso(),
      loggedExercises,
      source: "csv_import",
      recommendations: [],
      offProgram: true,
      notes: "Imported from CSV",
    };

    db.sessions.push(session);
    sessionsAdded++;
  }

  db.updatedAt = nowIso();
  return { sessionsAdded, setsAdded, duplicatesSkipped };
}

/** Override a match result for a single exercise in a group. */
export function applyMatchOverride(
  groups: ImportRowGroup[],
  exerciseName: string,
  override: Partial<ExerciseMatchResult>
): ImportRowGroup[] {
  return groups.map((g) =>
    g.exerciseName === exerciseName
      ? { ...g, matchResult: { ...g.matchResult, ...override, needsReview: false } }
      : g
  );
}
