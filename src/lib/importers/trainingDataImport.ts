import { parseCSVText, parseWorkoutHistoryWorkbook } from "./csvWorkoutImport";
import { parseExerciseImportCSVText, parseLegacyExercisesWorkbook } from "./exerciseLibraryImport";
import type { UnifiedTrainingDataParseResult } from "./importerTypes";

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, "_");
}

function detectSchema(headerLine: string): "exercise_baselines" | "workout_history" | undefined {
  const headers = headerLine.split(",").map(normalizeHeader);
  const headerSet = new Set(headers);
  if (headerSet.has("date") && headerSet.has("exercise_name")) return "workout_history";
  if (
    headerSet.has("name")
    || (headerSet.has("exercise") && (headerSet.has("weight") || headerSet.has("set") || headerSet.has("rep")))
  ) {
    return "exercise_baselines";
  }
  return undefined;
}

function stripSectionLabel(lines: string[]): string[] {
  if (!lines.length) return lines;
  const first = lines[0].trim().toLowerCase();
  if (first.startsWith("section ") || first === "exercises" || first === "workout history") {
    return lines.slice(1);
  }
  return lines;
}

function splitTextSections(text: string): { kind: "exercise_baselines" | "workout_history"; text: string }[] {
  const chunks = text
    .split(/\n\s*\n+/)
    .map((chunk) => stripSectionLabel(chunk.split(/\r?\n/)).join("\n").trim())
    .filter(Boolean);

  const sections = chunks
    .map((chunk) => {
      const firstLine = chunk.split(/\r?\n/).find((line) => line.trim());
      const kind = firstLine ? detectSchema(firstLine) : undefined;
      return kind ? { kind, text: chunk } : undefined;
    })
    .filter((section): section is { kind: "exercise_baselines" | "workout_history"; text: string } => Boolean(section));

  if (sections.length) return sections;

  const lines = stripSectionLabel(text.split(/\r?\n/));
  const firstLine = lines.find((line) => line.trim());
  const kind = firstLine ? detectSchema(firstLine) : undefined;
  return kind ? [{ kind, text: lines.join("\n").trim() }] : [];
}

function mergeMessages(parts: Array<string[] | undefined>): string[] {
  return parts.flatMap((part) => part || []);
}

function dedupeMessages(messages: string[]): string[] {
  return Array.from(new Set(messages.filter(Boolean)));
}

export function parseTrainingDataText(text: string, sourceName: string): UnifiedTrainingDataParseResult {
  const sections = splitTextSections(text);
  if (!sections.length) {
    return {
      sourceName,
      detectedSections: [],
      warnings: [],
      errors: ["Could not detect a supported workout-history or exercise-baseline format."],
    };
  }

  const workoutSection = sections.find((section) => section.kind === "workout_history");
  const exerciseSection = sections.find((section) => section.kind === "exercise_baselines");
  const workoutData = workoutSection ? parseCSVText(workoutSection.text, sourceName) : undefined;
  const exerciseData = exerciseSection ? parseExerciseImportCSVText(exerciseSection.text, sourceName) : undefined;

  return {
    sourceName,
    detectedSections: sections.map((section) => section.kind),
    workoutData,
    exerciseData,
    warnings: dedupeMessages(mergeMessages([workoutData?.warnings, exerciseData?.warnings])),
    errors: dedupeMessages(mergeMessages([workoutData?.errors, exerciseData?.errors])),
  };
}

function isMissingSheetError(errors: string[], sheetName: string): boolean {
  return errors.some((error) => error.includes(`sheet named "${sheetName}"`));
}

export async function parseTrainingDataWorkbook(buffer: ArrayBuffer, sourceName: string): Promise<UnifiedTrainingDataParseResult> {
  const [exerciseData, workoutData] = await Promise.all([
    parseLegacyExercisesWorkbook(buffer, sourceName),
    parseWorkoutHistoryWorkbook(buffer, sourceName),
  ]);

  const hasExerciseData = exerciseData.rows.length > 0;
  const hasWorkoutData = workoutData.rows.length > 0;
  const missingExercises = isMissingSheetError(exerciseData.errors, "Exercises");
  const missingWorkoutHistory = isMissingSheetError(workoutData.errors, "Workout History");

  if (!hasExerciseData && !hasWorkoutData && missingExercises && missingWorkoutHistory) {
    return {
      sourceName,
      detectedSections: [],
      warnings: [],
      errors: ['Workbook does not include a supported "Exercises" or "Workout History" sheet.'],
    };
  }

  return {
    sourceName,
    detectedSections: [
      ...(hasExerciseData ? ["exercise_baselines" as const] : []),
      ...(hasWorkoutData ? ["workout_history" as const] : []),
    ],
    exerciseData: hasExerciseData ? exerciseData : undefined,
    workoutData: hasWorkoutData ? workoutData : undefined,
    warnings: dedupeMessages(mergeMessages([
      hasExerciseData ? exerciseData.warnings : undefined,
      hasWorkoutData ? workoutData.warnings : undefined,
    ])),
    errors: dedupeMessages(mergeMessages([
      hasExerciseData || missingExercises ? undefined : exerciseData.errors,
      hasWorkoutData || missingWorkoutHistory ? undefined : workoutData.errors,
    ])),
  };
}

export async function parseTrainingDataFile(file: File): Promise<UnifiedTrainingDataParseResult> {
  const sourceName = file.name || "training-data-import";
  const lowerName = sourceName.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const text = await file.text();
    return parseTrainingDataText(text, sourceName);
  }
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    const buffer = await file.arrayBuffer();
    return parseTrainingDataWorkbook(buffer, sourceName);
  }
  return {
    sourceName,
    detectedSections: [],
    warnings: [],
    errors: ["Supported training-data imports are CSV, XLSX, and XLSM."],
  };
}
