import type {
  Exercise,
  ExerciseBaseline,
  ExerciseCategoryLabel,
  ExerciseKind,
  ExercisePerformanceLog,
  ExerciseRole,
  ExerciseUnit,
  MovementPattern,
  MuscleGroup,
  TrainingDatabase,
  UserProfile,
} from "../../types/domain";
import { createId, nowIso } from "../ids";
import { calculateObservedE1RM } from "../trainingIntelligence/e1rm";
import { mapLegacyCategoryToMuscles, matchImportedExerciseName, normalizeExerciseName } from "./exerciseMatcher";
import type {
  ExerciseImportAction,
  ExerciseImportFormat,
  ExerciseImportParseResult,
  ExerciseImportReviewItem,
  ExerciseImportReviewSummary,
  ExerciseImportRow,
  ImportedExercisePerformance,
} from "./importerTypes";

const IRON_ORBIT_HEADERS = new Set([
  "name",
  "primarymuscles",
  "secondarymuscles",
  "equipment",
  "unit",
  "increment",
  "source",
  "parentexercisename",
  "isvariation",
  "variationtype",
  "exercisefamily",
  "movementpattern",
  "variationgroup",
  "lastweight",
  "lastsets",
  "lastreps",
  "lastrpe",
  "laste1rm",
  "baselineweight",
  "baselinesets",
  "baselinereps",
  "baselinerpe",
  "baselinee1rm",
  "baselinesource",
  "baselineupdatedat",
  "category",
  "notes",
]);

const LEGACY_EXERCISE_HEADERS = ["exercise", "weight", "set", "rep", "rpe", "e1rm"] as const;

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

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseStringList(value?: string): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return undefined;
}

function hasPerformanceData(perf?: ImportedExercisePerformance): boolean {
  return !!perf && [perf.weight, perf.sets, perf.reps, perf.rpe, perf.e1rm].some((value) => value !== undefined);
}

function normalizeExerciseImportFormat(headers: string[]): ExerciseImportFormat | undefined {
  const normalized = headers.map(normalizeHeader);
  const hasIronOrbitName = normalized.includes("name");
  const hasIronOrbitSignals = normalized.some((header) => IRON_ORBIT_HEADERS.has(header));
  const hasLegacyHeaders = LEGACY_EXERCISE_HEADERS.every((header) => normalized.includes(header));
  if (hasIronOrbitName && hasIronOrbitSignals && normalized.includes("primarymuscles")) {
    return "iron_orbit_exercise_csv";
  }
  if (hasLegacyHeaders) return "legacy_exercises_csv";
  return undefined;
}

function makeImportedPerformance(raw: Record<string, string>, prefix: "last" | "baseline"): ImportedExercisePerformance | undefined {
  const perf: ImportedExercisePerformance = {
    weight: parseNumber(raw[`${prefix}weight`]),
    sets: parseNumber(raw[`${prefix}sets`]),
    reps: parseNumber(raw[`${prefix}reps`]),
    rpe: parseNumber(raw[`${prefix}rpe`]),
    e1rm: parseNumber(raw[`${prefix}e1rm`]),
  };
  return hasPerformanceData(perf) ? perf : undefined;
}

function parseIronOrbitExerciseCSV(text: string, sourceName: string): ExerciseImportParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], warnings: [], errors: ["CSV has no exercise data rows."], sourceName, format: "iron_orbit_exercise_csv" };
  }

  const headers = parseCSVLine(lines[0]).map(normalizeHeader);
  const rows: ExerciseImportRow[] = [];
  const warnings: string[] = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const values = parseCSVLine(lines[rowIndex]);
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => {
      raw[header] = values[index] ?? "";
    });
    const name = raw.name?.trim();
    if (!name) {
      warnings.push(`Row ${rowIndex + 1}: missing name, skipped.`);
      continue;
    }
    rows.push({
      rowId: `exercise-${rowIndex + 1}`,
      sourceName,
      sourceFormat: "iron_orbit_exercise_csv",
      rowNumber: rowIndex + 1,
      name,
      category: raw.category?.trim() || undefined,
      primaryMuscles: parseStringList(raw.primarymuscles),
      secondaryMuscles: parseStringList(raw.secondarymuscles),
      equipment: parseStringList(raw.equipment),
      unit: raw.unit === "kg" ? "kg" : raw.unit === "lb" ? "lb" : undefined,
      increment: parseNumber(raw.increment),
      source: raw.source?.trim() || undefined,
      parentExerciseName: raw.parentexercisename?.trim() || undefined,
      isVariation: parseBoolean(raw.isvariation),
      variationType: raw.variationtype?.trim() || undefined,
      exerciseFamily: raw.exercisefamily?.trim() || undefined,
      movementPattern: raw.movementpattern?.trim() || undefined,
      variationGroup: raw.variationgroup?.trim() || undefined,
      baselineSource: raw.baselinesource?.trim() || raw.source?.trim() || undefined,
      baselineUpdatedAt: raw.baselineupdatedat?.trim() || undefined,
      lastPerformance: makeImportedPerformance(raw, "last"),
      baselinePerformance: makeImportedPerformance(raw, "baseline"),
      notes: raw.notes?.trim() || undefined,
    });
  }

  return {
    format: "iron_orbit_exercise_csv",
    rows,
    warnings,
    errors: [],
    sourceName,
  };
}

function isKnownLegacyCategory(value: string): boolean {
  return mapLegacyCategoryToMuscles(value).length > 0;
}

function parseLegacyExerciseRecords(
  records: { rowNumber: number; exercise?: string; weight?: string; set?: string; rep?: string; rpe?: string; e1rm?: string }[],
  sourceName: string,
  sourceFormat: ExerciseImportFormat
): ExerciseImportParseResult {
  const rows: ExerciseImportRow[] = [];
  const warnings: string[] = [];
  let currentCategory: string | undefined;

  records.forEach((record) => {
    const exercise = record.exercise?.trim();
    const performance = {
      weight: parseNumber(record.weight),
      sets: parseNumber(record.set),
      reps: parseNumber(record.rep),
      rpe: parseNumber(record.rpe),
      e1rm: parseNumber(record.e1rm),
    };
    const hasMetrics = hasPerformanceData(performance);
    if (!exercise) return;

    if (!hasMetrics) {
      if (isKnownLegacyCategory(exercise)) {
        currentCategory = exercise;
        return;
      }
      rows.push({
        rowId: `exercise-${record.rowNumber}`,
        sourceName,
        sourceFormat,
        rowNumber: record.rowNumber,
        name: exercise,
        category: currentCategory,
      });
      return;
    }

    rows.push({
      rowId: `exercise-${record.rowNumber}`,
      sourceName,
      sourceFormat,
      rowNumber: record.rowNumber,
      name: exercise,
      category: currentCategory,
      baselineSource: sourceName,
      baselinePerformance: performance,
      notes: currentCategory ? `Imported from ${currentCategory}` : undefined,
    });
  });

  if (!rows.length) warnings.push("No exercise rows found after parsing category headers.");

  return {
    format: sourceFormat,
    rows,
    warnings,
    errors: [],
    sourceName,
  };
}

export function parseExerciseImportCSVText(text: string, sourceName: string): ExerciseImportParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    return { rows: [], warnings: [], errors: ["No CSV content found."], sourceName };
  }

  const headers = parseCSVLine(lines[0]);
  const format = normalizeExerciseImportFormat(headers);
  if (format === "iron_orbit_exercise_csv") {
    return parseIronOrbitExerciseCSV(text, sourceName);
  }

  if (format === "legacy_exercises_csv") {
    const normalized = headers.map(normalizeHeader);
    const records = lines.slice(1).map((line, index) => {
      const values = parseCSVLine(line);
      const raw: Record<string, string> = {};
      normalized.forEach((header, headerIndex) => {
        raw[header] = values[headerIndex] ?? "";
      });
      return {
        rowNumber: index + 2,
        exercise: raw.exercise,
        weight: raw.weight,
        set: raw.set,
        rep: raw.rep,
        rpe: raw.rpe,
        e1rm: raw.e1rm,
      };
    });
    return parseLegacyExerciseRecords(records, sourceName, "legacy_exercises_csv");
  }

  return {
    rows: [],
    warnings: [],
    errors: ["Could not detect a supported exercise import CSV schema."],
    sourceName,
  };
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

export async function parseLegacyExercisesWorkbook(buffer: ArrayBuffer, sourceName: string): Promise<ExerciseImportParseResult> {
  const entries = await unzipEntries(buffer);
  const decoder = new TextDecoder();
  const workbookXml = entries.get("xl/workbook.xml");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    return {
      rows: [],
      warnings: [],
      errors: ["Workbook is missing the metadata needed to find the Exercises sheet."],
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

  const exerciseSheet = Array.from(workbookDoc.querySelectorAll("sheet")).find(
    (sheet) => sheet.getAttribute("name")?.trim().toLowerCase() === "exercises"
  );
  if (!exerciseSheet) {
    return {
      rows: [],
      warnings: [],
      errors: ['Workbook does not include a sheet named "Exercises".'],
      sourceName,
    };
  }

  const relId = exerciseSheet.getAttribute("r:id");
  const sheetPath = relId ? rels.get(relId) : undefined;
  const sheetXml = sheetPath ? entries.get(sheetPath) : undefined;
  if (!sheetXml) {
    return {
      rows: [],
      warnings: [],
      errors: ['Could not open the workbook "Exercises" sheet.'],
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
  const records = Array.from(sheetDoc.querySelectorAll("sheetData > row")).map((row, index) => {
    const cells = new Map<string, string>();
    row.querySelectorAll("c").forEach((cell) => {
      const ref = cell.getAttribute("r");
      if (!ref) return;
      cells.set(columnLetter(ref), getCellText(cell, sharedStrings));
    });
    return {
      rowNumber: index + 1,
      exercise: cells.get("A"),
      weight: cells.get("B"),
      set: cells.get("C"),
      rep: cells.get("D"),
      rpe: cells.get("E"),
      e1rm: cells.get("F"),
    };
  });

  const maybeHeader = records[0];
  const rows = maybeHeader && normalizeExerciseName(maybeHeader.exercise || "") === "exercise"
    ? records.slice(1)
    : records;

  return parseLegacyExerciseRecords(rows, sourceName, "legacy_exercises_workbook");
}

export async function parseExerciseImportFile(file: File): Promise<ExerciseImportParseResult> {
  const sourceName = file.name || "exercise-import";
  const lowerName = sourceName.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const text = await file.text();
    return parseExerciseImportCSVText(text, sourceName);
  }
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    const buffer = await file.arrayBuffer();
    return parseLegacyExercisesWorkbook(buffer, sourceName);
  }
  return {
    rows: [],
    warnings: [],
    errors: ["Supported exercise import files are CSV, XLSX, and XLSM."],
    sourceName,
  };
}

function findBaseline(db: TrainingDatabase, userId: string, exerciseId: string): ExerciseBaseline | undefined {
  return (db.exerciseBaselines || []).find((baseline) => baseline.userId === userId && baseline.exerciseId === exerciseId);
}

function hasMeaningfulPerformance(perf?: ImportedExercisePerformance | ExerciseImportReviewItem["existingBaseline"]): boolean {
  if (!perf) return false;
  return [perf.weight, perf.sets, perf.reps, perf.rpe, perf.e1rm].some((value) => typeof value === "number" && value > 0);
}

function baselineSnapshot(baseline?: ExerciseBaseline): ExerciseImportReviewItem["existingBaseline"] {
  if (!baseline) return undefined;
  return {
    weight: baseline.baselineWeight,
    sets: baseline.baselineSets,
    reps: baseline.baselineReps,
    rpe: baseline.baselineRpe,
    e1rm: baseline.baselineE1RM,
    updatedAt: baseline.updatedAt,
    source: baseline.source,
    notes: baseline.notes,
  };
}

function resolveImportTimestamp(row: ExerciseImportRow): string {
  const candidate = row.baselineUpdatedAt?.trim();
  if (candidate && !Number.isNaN(Date.parse(candidate))) return candidate;
  return nowIso();
}

function inferMuscles(row: ExerciseImportRow): MuscleGroup[] {
  const fromRow = (row.primaryMuscles || []).map((item) => normalizeExerciseName(item)) as MuscleGroup[];
  if (fromRow.length) return fromRow;
  return mapLegacyCategoryToMuscles(row.category);
}

function inferEquipment(row: ExerciseImportRow): Exercise["equipment"] {
  const first = row.equipment?.[0]?.toLowerCase();
  if (first === "barbell" || first === "dumbbell" || first === "cable" || first === "machine" || first === "bodyweight" || first === "kettlebell" || first === "bands" || first === "cardio") {
    return [first];
  }
  return ["other"];
}

function inferMovementPattern(row: ExerciseImportRow, parent?: Exercise): MovementPattern {
  const raw = row.movementPattern?.toLowerCase();
  const allowed: MovementPattern[] = [
    "squat", "hinge", "horizontal-press", "incline-press", "vertical-press", "horizontal-pull",
    "vertical-pull", "single-leg", "isolation", "knee-flexion", "knee-extension", "hip-extension",
    "elbow-flexion", "elbow-extension", "shoulder-abduction", "spinal-extension", "trunk-stability",
    "trunk-flexion", "ankle-extension", "carry", "brace", "locomotion", "mobility", "conditioning",
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as MovementPattern;
  if (parent?.movementPattern) return parent.movementPattern;
  return "isolation";
}

function inferExerciseCategory(row: ExerciseImportRow, parent?: Exercise): ExerciseCategoryLabel {
  if (parent?.exerciseCategory) return parent.exerciseCategory;
  const equipment = inferEquipment(row)[0];
  if (equipment === "bodyweight") return "bodyweight";
  if (equipment === "machine") return "machine_compound";
  if (equipment === "barbell") return "secondary_compound";
  return "isolation";
}

function inferKind(category: ExerciseCategoryLabel): ExerciseKind[] {
  if (category === "conditioning") return ["conditioning"];
  if (category === "sbd" || category === "main_compound" || category === "secondary_compound" || category === "machine_compound") {
    return ["compound"];
  }
  return ["accessory"];
}

function inferTracking(unit: ExerciseUnit): Exercise["bestTrackedBy"] {
  if (unit === "time") return ["time"];
  if (unit === "distance") return ["distance"];
  if (unit === "reps-only" || unit === "bodyweight") return ["reps"];
  return ["load", "reps"];
}

function createImportedExercise(row: ExerciseImportRow, user: UserProfile, parent?: Exercise): Exercise {
  const primaryMuscles = inferMuscles(row);
  const category = inferExerciseCategory(row, parent);
  const defaultUnit = (row.unit || parent?.defaultUnit || user.unit) as ExerciseUnit;
  const movementPattern = inferMovementPattern(row, parent);
  return {
    id: createId("ex"),
    ownerUserId: user.id,
    name: row.name.trim(),
    description: row.notes,
    muscleGroup: primaryMuscles[0] || parent?.muscleGroup || "chest",
    primaryMuscles: primaryMuscles.length ? primaryMuscles : parent?.primaryMuscles || ["chest"],
    secondaryMuscles: ((row.secondaryMuscles || []) as MuscleGroup[]).length ? (row.secondaryMuscles as MuscleGroup[]) : parent?.secondaryMuscles || [],
    equipment: parent?.equipment || inferEquipment(row),
    movementPattern,
    movementPatterns: parent?.movementPatterns || [movementPattern],
    tags: [user.goal],
    tagLabels: row.category ? [row.category] : [],
    variants: [],
    substitutionIds: [],
    notes: row.notes,
    setupCues: [],
    trackByBodyweight: defaultUnit === "bodyweight",
    trackPerSide: parent?.trackPerSide || false,
    category: (parent?.category || inferEquipment(row)[0]) as Exercise["category"],
    kind: parent?.kind || inferKind(category),
    directVolumeMuscles: primaryMuscles.length ? primaryMuscles : parent?.directVolumeMuscles || ["chest"],
    indirectVolumeMuscles: parent?.indirectVolumeMuscles || [],
    bestTrackedBy: inferTracking(defaultUnit),
    fatigueRating: parent?.fatigueRating || 2,
    isCompound: parent?.isCompound || category !== "isolation" && category !== "bodyweight",
    defaultUnit,
    allowedUnits: parent?.allowedUnits || [defaultUnit],
    defaultIncrement: row.increment || parent?.defaultIncrement || (defaultUnit === "kg" ? 2.5 : 5),
    increment: row.increment || parent?.increment,
    customIncrement: row.increment || parent?.customIncrement || (defaultUnit === "kg" ? 2.5 : 5),
    isBodyweight: parent?.isBodyweight || defaultUnit === "bodyweight",
    source: "custom",
    createdByUser: true,
    isVariation: !!parent || row.isVariation || undefined,
    parentExerciseId: parent?.id,
    variationType: row.variationType || undefined,
    variationGroup: row.variationGroup || parent?.variationGroup,
    variationGroupId: parent?.variationGroupId,
    variationName: row.variationType || undefined,
    exerciseFamily: row.exerciseFamily || parent?.exerciseFamily,
    exerciseCategory: category,
    roleHints: parent?.roleHints as Partial<Record<UserProfile["goal"], ExerciseRole>> | undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function resolveBaselineSource(row: ExerciseImportRow): string {
  return row.baselineSource || row.source || row.sourceName || row.sourceFormat;
}

function getImportedRepresentativePerformance(row: ExerciseImportRow): ImportedExercisePerformance | undefined {
  return row.baselinePerformance || row.lastPerformance;
}

function getImportedE1RM(row: ExerciseImportRow): number | undefined {
  const perf = getImportedRepresentativePerformance(row);
  if (!perf) return undefined;
  if (typeof perf.e1rm === "number" && perf.e1rm > 0) return perf.e1rm;
  const calculated = calculateObservedE1RM({
    weight: perf.weight || 0,
    reps: perf.reps || 0,
    actualRpe: perf.rpe,
    setType: "working",
    skipped: false,
  });
  return calculated ?? undefined;
}

function upsertBaseline(
  db: TrainingDatabase,
  user: UserProfile,
  exerciseId: string,
  row: ExerciseImportRow,
  mode: "safe_add" | "replace"
): void {
  const current = findBaseline(db, user.id, exerciseId);
  const importedBaseline = row.baselinePerformance;
  const importedLast = row.lastPerformance;
  if (!importedBaseline && !importedLast) return;

  if (!current) {
    (db.exerciseBaselines ||= []).push({
      id: createId("baseline"),
      exerciseId,
      userId: user.id,
      baselineWeight: importedBaseline?.weight,
      baselineSets: importedBaseline?.sets,
      baselineReps: importedBaseline?.reps,
      baselineRpe: importedBaseline?.rpe,
      baselineE1RM: importedBaseline?.e1rm,
      lastWeight: importedLast?.weight ?? importedBaseline?.weight,
      lastSets: importedLast?.sets ?? importedBaseline?.sets,
      lastReps: importedLast?.reps ?? importedBaseline?.reps,
      lastRpe: importedLast?.rpe ?? importedBaseline?.rpe,
      lastE1RM: importedLast?.e1rm ?? importedBaseline?.e1rm,
      unit: row.unit || user.unit,
      source: resolveBaselineSource(row),
      category: row.category,
      notes: row.notes,
      importedAt: resolveImportTimestamp(row),
      updatedAt: resolveImportTimestamp(row),
    });
    return;
  }

  if (mode === "replace") {
    current.baselineWeight = importedBaseline?.weight;
    current.baselineSets = importedBaseline?.sets;
    current.baselineReps = importedBaseline?.reps;
    current.baselineRpe = importedBaseline?.rpe;
    current.baselineE1RM = importedBaseline?.e1rm;
    current.lastWeight = importedLast?.weight ?? importedBaseline?.weight;
    current.lastSets = importedLast?.sets ?? importedBaseline?.sets;
    current.lastReps = importedLast?.reps ?? importedBaseline?.reps;
    current.lastRpe = importedLast?.rpe ?? importedBaseline?.rpe;
    current.lastE1RM = importedLast?.e1rm ?? importedBaseline?.e1rm;
  } else {
    if (!current.baselineWeight) current.baselineWeight = importedBaseline?.weight;
    if (!current.baselineSets) current.baselineSets = importedBaseline?.sets;
    if (!current.baselineReps) current.baselineReps = importedBaseline?.reps;
    if (!current.baselineRpe) current.baselineRpe = importedBaseline?.rpe;
    if (!current.baselineE1RM) current.baselineE1RM = importedBaseline?.e1rm;
    if (!current.lastWeight) current.lastWeight = importedLast?.weight ?? importedBaseline?.weight;
    if (!current.lastSets) current.lastSets = importedLast?.sets ?? importedBaseline?.sets;
    if (!current.lastReps) current.lastReps = importedLast?.reps ?? importedBaseline?.reps;
    if (!current.lastRpe) current.lastRpe = importedLast?.rpe ?? importedBaseline?.rpe;
    if (!current.lastE1RM) current.lastE1RM = importedLast?.e1rm ?? importedBaseline?.e1rm;
  }

  current.unit ||= row.unit || user.unit;
  current.source = resolveBaselineSource(row);
  current.category ||= row.category;
  current.notes = row.notes || current.notes;
  current.importedAt = resolveImportTimestamp(row);
  current.updatedAt = resolveImportTimestamp(row);
}

function addHistoricalPerformanceLog(db: TrainingDatabase, user: UserProfile, exerciseId: string, row: ExerciseImportRow): void {
  const perf = getImportedRepresentativePerformance(row);
  if (!perf) return;
  const date = resolveImportTimestamp(row).slice(0, 10);
  const storedUnit = (row.unit || user.unit) as ExerciseUnit;
  const log: ExercisePerformanceLog = {
    id: createId("explog"),
    exerciseId,
    userId: user.id,
    date,
    sets: perf.sets || 1,
    reps: perf.reps || 0,
    weight: perf.weight,
    e1rm: getImportedE1RM(row),
    averageSetRating: undefined,
    unit: storedUnit,
    rpe: perf.rpe,
    source: "exercise_baseline_import",
    notes: row.notes || `Imported baseline from ${resolveBaselineSource(row)}`,
  };
  (db.exercisePerformanceLogs ||= []).push(log);
}

function buildHistorySessionKey(exerciseId: string, row: ExerciseImportRow, setNumber: number): string {
  const perf = getImportedRepresentativePerformance(row);
  return [
    "exercise_baseline_import",
    exerciseId,
    resolveImportTimestamp(row).slice(0, 10),
    setNumber,
    perf?.weight ?? "",
    row.unit ?? "",
    perf?.reps ?? "",
    perf?.rpe ?? "",
    getImportedE1RM(row) ?? "",
  ].join("|");
}

function existingHistoryKeys(db: TrainingDatabase, userId: string): Set<string> {
  const keys = new Set<string>();
  db.sessions
    .filter((session) => session.userId === userId && session.source === "exercise_baseline_import")
    .forEach((session) => {
      const date = session.startedAt.slice(0, 10);
      session.loggedExercises.forEach((exercise) => {
        exercise.sets.forEach((set) => {
          keys.add([
            session.source || "exercise_baseline_import",
            exercise.exerciseId,
            date,
            set.setNumber ?? 1,
            set.actualWeight ?? "",
            set.unit ?? "",
            set.actualReps ?? "",
            set.actualRpe ?? "",
            set.e1rm ?? "",
          ].join("|"));
        });
      });
    });
  return keys;
}

function addHistoricalImportedSession(
  db: TrainingDatabase,
  user: UserProfile,
  exerciseId: string,
  row: ExerciseImportRow,
  seenKeys: Set<string>
): boolean {
  const perf = getImportedRepresentativePerformance(row);
  if (!perf || (!perf.weight && !perf.reps && !perf.rpe && !perf.e1rm)) return false;

  const setNumber = 1;
  const dedupeKey = buildHistorySessionKey(exerciseId, row, setNumber);
  if (seenKeys.has(dedupeKey)) return false;
  seenKeys.add(dedupeKey);

  const importedAt = resolveImportTimestamp(row);
  const date = importedAt.slice(0, 10);
  const sessionName = "Imported Exercise Baselines";
  const sessionTimestamp = `${date}T12:00:00.000Z`;
  let session = db.sessions.find(
    (candidate) =>
      candidate.userId === user.id
      && candidate.source === "exercise_baseline_import"
      && candidate.name === sessionName
      && candidate.startedAt.slice(0, 10) === date
  );

  if (!session) {
    session = {
      id: createId("session"),
      userId: user.id,
      name: sessionName,
      status: "completed",
      startedAt: sessionTimestamp,
      completedAt: sessionTimestamp,
      updatedAt: importedAt,
      source: "exercise_baseline_import",
      loggedExercises: [],
      recommendations: [],
      offProgram: true,
      notes: "Imported from exercise baseline import",
    };
    db.sessions.push(session);
  }

  const setNoteParts = [
    row.notes,
    perf.sets && perf.sets > 1 ? `Representative set from imported ${perf.sets}x${perf.reps || "?"}` : undefined,
    `[${resolveBaselineSource(row)}]`,
  ].filter(Boolean);

  const loggedExercise = {
    id: createId("logex"),
    exerciseId,
    order: session.loggedExercises.length + 1,
    sets: [{
      id: createId("set"),
      kind: "working" as const,
      setNumber,
      actualWeight: perf.weight ?? 0,
      unit: row.unit || user.unit,
      actualReps: perf.reps ?? 0,
      actualRpe: perf.rpe,
      setRating: 3 as const,
      e1rm: getImportedE1RM(row),
      completedAt: sessionTimestamp,
      notes: setNoteParts.join(" "),
    }],
    weakPointTags: [],
    offProgram: true,
    notes: row.notes,
  };

  session.loggedExercises.push(loggedExercise);
  session.updatedAt = importedAt;
  addHistoricalPerformanceLog(db, user, exerciseId, row);
  return true;
}

export function buildExerciseImportReviewSummary(
  parseResult: ExerciseImportParseResult,
  db: TrainingDatabase,
  user: UserProfile
): ExerciseImportReviewSummary {
  const visibleExercises = db.exercises.filter((exercise) => !exercise.ownerUserId || exercise.ownerUserId === user.id);
  const items: ExerciseImportReviewItem[] = parseResult.rows.map((row) => {
    const matchResult = matchImportedExerciseName(row.name, visibleExercises, {
      category: row.category,
      preferredMuscles: inferMuscles(row),
    });
    const matchedExerciseId = matchResult.matchedExerciseId;
    const existingBaseline = matchedExerciseId ? findBaseline(db, user.id, matchedExerciseId) : undefined;
    const hasImportedPerformance = hasPerformanceData(row.baselinePerformance) || hasPerformanceData(row.lastPerformance);

    let action: ExerciseImportAction = "skip";
    let reason = matchResult.reason;
    let baselineConflict: ExerciseImportReviewItem["baselineConflict"] = "none";
    let needsReview = matchResult.needsReview;

    const willCreateHistory = hasImportedPerformance;
    let willAutoFillBaseline = false;
    let metadataOnly = !hasImportedPerformance;

    if (!matchedExerciseId) {
      action = matchResult.suggestedAction === "create_variation" ? "create_variation" : "create_custom_exercise";
      needsReview = true;
      reason = matchResult.suggestedAction === "create_variation"
        ? "Possible variation of an existing exercise"
        : "No match found, create a custom exercise if this is valid.";
    } else if (!hasImportedPerformance) {
      action = "map_to_existing";
      reason = "Matched existing exercise. No baseline data to import.";
    } else if (!existingBaseline || !hasMeaningfulPerformance(baselineSnapshot(existingBaseline))) {
      action = "update_baseline";
      baselineConflict = "safe_add";
      willAutoFillBaseline = true;
      metadataOnly = false;
      reason = "Safe auto-fill: matched exercise has blank or zero baseline data.";
    } else {
      action = "add_historical_data";
      baselineConflict = "conflict";
      needsReview = true;
      metadataOnly = false;
      reason = "Existing meaningful baseline found. Keep it, replace it, or add imported data as history only.";
    }

    return {
      row,
      matchResult,
      matchedExerciseId,
      matchedExerciseName: matchResult.matchedExerciseName,
      suggestedParentExerciseId: matchResult.suggestedParentExerciseId,
      suggestedParentExerciseName: matchResult.suggestedParentExerciseName,
      action,
      existingBaseline: baselineSnapshot(existingBaseline),
      baselineConflict,
      willCreateHistory,
      willAutoFillBaseline,
      metadataOnly,
      reason,
      needsReview,
    };
  });

  return {
    format: parseResult.format,
    totalExerciseRows: items.length,
    rowsWithBaselineData: items.filter((item) => hasPerformanceData(item.row.baselinePerformance) || hasPerformanceData(item.row.lastPerformance)).length,
    matchedExistingExercises: items.filter((item) => item.matchedExerciseId).length,
    newCustomExercises: items.filter((item) => item.action === "create_custom_exercise").length,
    variationsSuggested: items.filter((item) => item.action === "create_variation").length,
    baselineUpdatesAvailable: items.filter((item) => item.action === "update_baseline").length,
    historyRecordsToCreate: items.filter((item) => item.willCreateHistory && item.action !== "skip" && item.action !== "keep_existing_baseline").length,
    autoFillBaselineRows: items.filter((item) => item.willAutoFillBaseline).length,
    metadataOnlyRows: items.filter((item) => item.metadataOnly).length,
    baselineConflicts: items.filter((item) => item.baselineConflict === "conflict").length,
    skippedOrInvalidRows: parseResult.errors.length,
    items,
    warnings: parseResult.warnings,
    errors: parseResult.errors,
  };
}

export function applyExerciseImportReview(
  db: TrainingDatabase,
  user: UserProfile,
  items: ExerciseImportReviewItem[]
): {
  baselinesUpdated: number;
  exercisesCreated: number;
  variationsCreated: number;
  mappedToExisting: number;
  historicalLogsAdded: number;
  skipped: number;
} {
  let baselinesUpdated = 0;
  let exercisesCreated = 0;
  let variationsCreated = 0;
  let mappedToExisting = 0;
  let historicalLogsAdded = 0;
  let skipped = 0;
  const seenHistoryKeys = existingHistoryKeys(db, user.id);

  items.forEach((item) => {
    let exerciseId = item.matchedExerciseId;
    const parent = item.suggestedParentExerciseId
      ? db.exercises.find((exercise) => exercise.id === item.suggestedParentExerciseId)
      : undefined;

    switch (item.action) {
      case "skip":
      case "keep_existing_baseline":
        skipped++;
        return;
      case "create_custom_exercise": {
        const created = createImportedExercise(item.row, user);
        db.exercises.unshift(created);
        exerciseId = created.id;
        exercisesCreated++;
        break;
      }
      case "create_variation": {
        const created = createImportedExercise(item.row, user, parent);
        db.exercises.unshift(created);
        exerciseId = created.id;
        variationsCreated++;
        break;
      }
      case "map_to_existing":
        mappedToExisting++;
        break;
      default:
        break;
    }

    if (!exerciseId) {
      skipped++;
      return;
    }

    if (item.action === "update_baseline" || item.action === "create_custom_exercise" || item.action === "create_variation") {
      if (hasPerformanceData(item.row.baselinePerformance) || hasPerformanceData(item.row.lastPerformance)) {
        upsertBaseline(db, user, exerciseId, item.row, "safe_add");
        baselinesUpdated++;
        if (addHistoricalImportedSession(db, user, exerciseId, item.row, seenHistoryKeys)) {
          historicalLogsAdded++;
        }
      }
      return;
    }

    if (item.action === "replace_baseline") {
      upsertBaseline(db, user, exerciseId, item.row, "replace");
      baselinesUpdated++;
      if (addHistoricalImportedSession(db, user, exerciseId, item.row, seenHistoryKeys)) {
        historicalLogsAdded++;
      }
      return;
    }

    if (item.action === "keep_newer_baseline") {
      const existing = findBaseline(db, user.id, exerciseId);
      const existingTime = existing?.updatedAt ? Date.parse(existing.updatedAt) : 0;
      const importedTime = Date.parse(resolveImportTimestamp(item.row));
      if (!existing || importedTime >= existingTime) {
        upsertBaseline(db, user, exerciseId, item.row, "replace");
        baselinesUpdated++;
      }
      if (addHistoricalImportedSession(db, user, exerciseId, item.row, seenHistoryKeys)) {
        historicalLogsAdded++;
      }
      return;
    }

    if (item.action === "add_historical_data") {
      if (addHistoricalImportedSession(db, user, exerciseId, item.row, seenHistoryKeys)) {
        historicalLogsAdded++;
      }
    }
  });

  db.updatedAt = nowIso();
  return {
    baselinesUpdated,
    exercisesCreated,
    variationsCreated,
    mappedToExisting,
    historicalLogsAdded,
    skipped,
  };
}
