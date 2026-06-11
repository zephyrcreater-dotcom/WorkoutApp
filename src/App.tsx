import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Copy,
  Dumbbell,
  Eye,
  FileDown,
  FileUp,
  Gauge,
  GitBranch,
  Home,
  EyeOff,
  Library,
  LogOut,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
  Shuffle,
  SlidersHorizontal,
  Star,
  Timer,
  Trash2,
  UserRound,
  Wand2,
  X,
  Zap
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTrainingDb } from "./hooks/useTrainingDb";
import type { SnapshotSummary } from "./lib/cloudSync";
import {
  advanceActiveBlockAfterWorkoutCompletion,
  getCurrentWorkoutForUser,
  markRestDayComplete,
  moveActiveBlockPointer,
  skipActiveWorkout,
  syncActiveBlockProgress
} from "./lib/blockProgression";
import { builtInExercises, splitTemplates as seedSplitTemplates } from "./data/seedData";
import { createId, nowIso, todayIso } from "./lib/ids";
import {
  analyzeProgramGaps,
  buildHypertrophyDashboard,
  estimateWorkoutDuration,
  summarizePlannedVolume
} from "./lib/programAnalysis";
import { generateProgram, generateSplitFromText, type ProgramRequest } from "./lib/programGenerator";
import {
  buildSplitSchedule,
  defaultCompoundSettings,
  fatigueRatingForExercise,
  getBlockExercisePrescription,
  isCompound,
  isSbdExercise,
  orderExercisesForDay,
  sessionFatigueScore
} from "./lib/programmingLogic";
import {
  buildFatigueBudget,
  classifyExerciseRole,
  getExerciseFatigueTag,
  getGoalUsed,
  getSameExerciseBaseline,
  getRequirementSlotPlan,
  getTrainingTargets,
  inferBaseExerciseRole,
  inferWorkoutDayType,
  mapBlockType,
  mapTrainingGoal,
  recommendWeightForExercise,
  scoreExerciseForSlot,
  calculateObservedE1RMResult,
  prescribeLoadFromObservedE1RM,
  deriveActualRpeFromFeel,
  adjustTargetRpeForReadiness,
  getSetRecommendationProfile,
  isMeaningfulWeightChange,
} from "./lib/trainingIntelligence";
import {
  calculateMuscleVolume,
  calculateReadinessScore,
  calculateE1RMFromSet,
  calculateSessionExerciseE1RM,
  calculateSetPerformanceScore,
  calculateWorkoutScore,
  convertWeight,
  detectWeakPointTags,
  estimateOneRepMax,
  formatWeight,
  getExerciseDisplayUnit,
  getExerciseLoadUnit,
  isBodyweightExercise,
  isWeightUnit,
  learnGymExerciseAdjustment,
  powerliftingMetrics,
  readinessAdjustment,
  recommendNextWorkoutAdjustments,
  recentTopSets,
  setRatingNumeric,
  summarizeWeek,
  sanitizeRpe,
  safeAverageRpe,
  isBlockWeekComplete,
  isTrainingWeekComplete,
  generateWeekReview
} from "./lib/trainingMath";
import { parseCSVText, buildImportReviewSummary, applyImportGroups, applyMatchOverride } from "./lib/importers/csvWorkoutImport";
import { CUSTOM_INCREMENT_LOADING_PROFILE_ID, EQUIPMENT_DEFAULT_PROFILE_IDS, getEffectiveLoading } from "./lib/loadingProfiles";
import { downloadExercisesCSV, downloadFullBackupJSON, downloadTrainingDataWorkbook, downloadWorkoutHistoryCSV } from "./lib/importers/exporters";
import {
  buildExerciseImportReviewSummary,
  parseExerciseImportCSVText,
  parseExerciseImportFile,
  applyExerciseImportReview,
} from "./lib/importers/exerciseLibraryImport";
import {
  AI_CSV_PROMPT,
  CSV_COLUMN_HEADERS,
  EXERCISE_IMPORT_AI_PROMPT,
  EXERCISE_IMPORT_COLUMN_HEADERS,
  LEGACY_EXERCISE_SHEET_AI_PROMPT,
  TRAINING_DATA_AI_PROMPT,
  TRAINING_DATA_HEADER_SECTIONS,
} from "./lib/importers/importPrompts";
import { parseTrainingDataFile, parseTrainingDataText } from "./lib/importers/trainingDataImport";
import type {
  ExerciseImportAction,
  ExerciseImportReviewItem,
  ExerciseImportReviewSummary,
  ImportReviewSummary,
  ImportRowGroup,
  UnifiedTrainingDataParseResult,
} from "./lib/importers/importerTypes";
import type {
  BlockType,
  CompoundSettings,
  DayFocus,
  EquipmentCategory,
  Exercise,
  LoadingProfile,
  LoadingProfileEquipmentType,
  ExerciseBaseline,
  ExerciseCategoryLabel,
  ExerciseRole,
  ExerciseUnit,
  ID,
  LoggedExercise,
  LoggedSet,
  MovementPattern,
  MuscleGroup,
  PlannedExercise,
  PlannedSet,
  Program,
  ProgramBuildMode,
  ProgramGap,
  ReadinessCheckIn,
  Recommendation,
  SetKind,
  SetRating,
  SplitDay,
  UnitPreference,
  SplitDayRequirement,
  SplitLoopMode,
  SplitTemplate,
  TrainingBlock,
  TrainingDatabase,
  TrainingGoal,
  UserProfile,
  WorkoutDay,
  WorkoutTemplate,
  WorkoutSession
} from "./types/domain";

type Screen =
  | "today"
  | "logger"
  | "completed-review"
  | "exercise-analytics"
  | "programs"
  | "library"
  | "week"
  | "progress"
  | "settings";

type CompletedReviewState = {
  sessionId: string;
  returnScreen: "today" | "week";
};

type LoggerNavigationState = {
  previousScreen: "today" | "week" | "programs" | "library" | "progress" | "settings";
  completedReviewState?: CompletedReviewState;
  loggerMode?: "active-logger" | "completed-edit";
};

type TodayExerciseDetailState = {
  plannedExerciseId: string;
  fromEditMode: boolean;
};

type ExerciseAnalyticsState = {
  exerciseId?: string;
  exerciseName?: string;
  sessionId?: string;
  workoutDayId?: string;
  returnScreen: Screen;
  returnCompletedReviewState?: CompletedReviewState;
};

const navItems: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: "today", label: "Today", icon: Dumbbell },
  { id: "week", label: "Week", icon: ClipboardList },
  { id: "programs", label: "Block", icon: CalendarDays },
  { id: "library", label: "Library", icon: Library },
  { id: "progress", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
];

const mobileNavItems = navItems.filter((item) => item.id !== "progress");

const muscleOptions: MuscleGroup[] = [
  "chest",
  "upper-chest",
  "lower-chest",
  "back",
  "lats",
  "upper-back",
  "mid-back",
  "traps",
  "spinal-erectors",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
  "abductors",
  "biceps",
  "triceps",
  "front-delts",
  "side-delts",
  "rear-delts",
  "abs",
  "obliques",
  "forearms",
  "conditioning"
];

const LIBRARY_MUSCLE_GROUPS: {
  id: "chest" | "back" | "shoulders" | "arms" | "legs" | "core" | "conditioning";
  label: string;
  broadValue?: MuscleGroup;
  muscles: MuscleGroup[];
}[] = [
  { id: "chest", label: "Chest", broadValue: "chest", muscles: ["chest", "upper-chest", "lower-chest"] },
  { id: "back", label: "Back", broadValue: "back", muscles: ["back", "lats", "upper-back", "mid-back", "traps", "spinal-erectors"] },
  { id: "shoulders", label: "Shoulders", muscles: ["front-delts", "side-delts", "rear-delts"] },
  { id: "arms", label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { id: "legs", label: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"] },
  { id: "core", label: "Core", muscles: ["abs", "obliques"] },
  { id: "conditioning", label: "Conditioning", broadValue: "conditioning", muscles: ["conditioning"] },
];

const LIBRARY_BLUE = "#0a84ff";
const LIBRARY_BLUE_BORDER = "border-[#0a84ff]/30";
const LIBRARY_BLUE_TEXT = "text-[#8fb9ff]";
const LIBRARY_BLUE_FILL = "bg-[#0a84ff]/[0.1]";

function titleCaseLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEquipmentLabel(value?: string): string {
  if (!value) return "equipment";
  return titleCaseLabel(value);
}

function formatMuscleLabel(value: MuscleGroup): string {
  return titleCaseLabel(value);
}

function summarizeMuscleList(muscles: MuscleGroup[], fallback = "None selected"): string {
  if (!muscles.length) return fallback;
  return muscles.map(formatMuscleLabel).join(" · ");
}

function summarizeExerciseListMuscles(exercise: Exercise): string {
  const summary = [...exercise.primaryMuscles];
  exercise.secondaryMuscles.forEach((muscle) => {
    if (!summary.includes(muscle) && summary.length < 4) summary.push(muscle);
  });
  return summary.length ? summary.map((muscle) => muscle.toLowerCase()).join(" · ") : "unassigned";
}

function inferCompactExerciseType(exercise: Exercise): string {
  if (exercise.exerciseCategory === "conditioning") return "conditioning";
  if (isCompound(exercise)) return "compound";
  if (exercise.isVariation) return "variation";
  return "accessory";
}

function getLibraryMuscleGroupForMuscle(muscle: MuscleGroup) {
  return LIBRARY_MUSCLE_GROUPS.find((group) => group.muscles.includes(muscle));
}

const REQUIREMENT_AUTOFILL_DEBUG = false;

function normalizeMuscleKey(value: string): string {
  const withCamelSpacing = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const normalized = withCamelSpacing
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    upperchest: "upper-chest",
    lowerchest: "lower-chest",
    sidedelts: "side-delts",
    reardelts: "rear-delts",
    frontdelts: "front-delts",
    upperback: "upper-back",
    midback: "mid-back",
    spinalerectors: "spinal-erectors",
    fullbody: "full-body",
  };
  const compact = normalized.replace(/\s+/g, "");
  if (aliases[compact]) return aliases[compact];
  return normalized.replace(/\s+/g, "-");
}

function collectNormalizedMuscleKeys(values: unknown[]): string[] {
  const keys = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = normalizeMuscleKey(value);
    if (normalized) keys.add(normalized);
  });
  return [...keys];
}

function getExerciseMuscleKeys(
  exercise: unknown,
  context?: {
    exerciseById?: Map<ID, Exercise>;
    sourceExerciseId?: ID;
    parentExerciseId?: ID;
  }
): string[] {
  const candidate = (exercise || {}) as Record<string, unknown>;
  const localKeys = collectNormalizedMuscleKeys([
    candidate.primaryMuscle,
    candidate.primary,
    candidate.muscleGroup,
    ...(Array.isArray(candidate.primaryMuscles) ? candidate.primaryMuscles : []),
    ...(Array.isArray(candidate.secondaryMuscles) ? candidate.secondaryMuscles : []),
    ...(Array.isArray(candidate.muscles) ? candidate.muscles : []),
    ...(Array.isArray(candidate.targetMuscles) ? candidate.targetMuscles : []),
    ...(Array.isArray(candidate.muscleGroups) ? candidate.muscleGroups : []),
    ...(Array.isArray(candidate.directVolumeMuscles) ? candidate.directVolumeMuscles : []),
    ...(Array.isArray(candidate.indirectVolumeMuscles) ? candidate.indirectVolumeMuscles : []),
    ...(Array.isArray(candidate.secondary) ? candidate.secondary : []),
    ...(Array.isArray(candidate.canonicalMuscleKeys) ? candidate.canonicalMuscleKeys : []),
    ...(Array.isArray(candidate.exerciseMuscleKeys) ? candidate.exerciseMuscleKeys : []),
  ]);
  const keys = new Set(localKeys);
  const exerciseById = context?.exerciseById;
  const sourceExerciseId =
    context?.sourceExerciseId
    || (typeof candidate.exerciseId === "string" ? candidate.exerciseId as ID : undefined)
    || (typeof candidate.sourceExerciseId === "string" ? candidate.sourceExerciseId as ID : undefined)
    || (typeof candidate.originalExerciseId === "string" ? candidate.originalExerciseId as ID : undefined);
  if (exerciseById && sourceExerciseId) {
    const source = exerciseById.get(sourceExerciseId);
    if (source) {
      collectNormalizedMuscleKeys([
        source.muscleGroup,
        ...source.primaryMuscles,
        ...source.secondaryMuscles,
        ...source.directVolumeMuscles,
        ...source.indirectVolumeMuscles,
      ]).forEach((key) => keys.add(key));
    }
  }
  const parentExerciseId =
    context?.parentExerciseId
    || (typeof candidate.parentExerciseId === "string" ? candidate.parentExerciseId as ID : undefined);
  if (exerciseById && parentExerciseId && keys.size === 0) {
    const parent = exerciseById.get(parentExerciseId);
    if (parent) {
      collectNormalizedMuscleKeys([
        parent.muscleGroup,
        ...parent.primaryMuscles,
        ...parent.secondaryMuscles,
        ...parent.directVolumeMuscles,
        ...parent.indirectVolumeMuscles,
      ]).forEach((key) => keys.add(key));
    }
  }
  return [...keys];
}

function getExercisePrimaryMuscleKeys(
  exercise: unknown,
  context?: {
    exerciseById?: Map<ID, Exercise>;
    sourceExerciseId?: ID;
    parentExerciseId?: ID;
  }
): string[] {
  const candidate = (exercise || {}) as Record<string, unknown>;
  const primary = collectNormalizedMuscleKeys([
    candidate.primaryMuscle,
    candidate.primary,
    candidate.muscleGroup,
    ...(Array.isArray(candidate.primaryMuscles) ? candidate.primaryMuscles : []),
    ...(Array.isArray(candidate.directVolumeMuscles) ? candidate.directVolumeMuscles : []),
  ]);
  const keys = new Set(primary);
  if (!keys.size) {
    getExerciseMuscleKeys(exercise, context).forEach((key) => keys.add(key));
  }
  return [...keys];
}

function getExerciseSecondaryMuscleKeys(
  exercise: unknown,
  context?: {
    exerciseById?: Map<ID, Exercise>;
    sourceExerciseId?: ID;
    parentExerciseId?: ID;
  }
): string[] {
  const allKeys = new Set(getExerciseMuscleKeys(exercise, context));
  getExercisePrimaryMuscleKeys(exercise, context).forEach((key) => allKeys.delete(key));
  return [...allKeys];
}

function exerciseMatchesMuscleFilter(exercise: Exercise, muscleFilter: string): boolean {
  if (muscleFilter === "all") return true;
  const normalizedFilter = normalizeMuscleKey(muscleFilter);
  if (!normalizedFilter) return true;
  const primaryMuscles = new Set(getExercisePrimaryMuscleKeys(exercise));
  primaryMuscles.add(normalizeMuscleKey(exercise.muscleGroup));
  return primaryMuscles.has(normalizedFilter);
}

function exerciseMatchesRequirementTarget(exercise: Exercise, targetMuscle: MuscleGroup): boolean {
  return exerciseFulfillsRequirement(exercise, {
    id: `debug_req_${targetMuscle}`,
    targetMuscle,
    requiredExerciseCount: 1,
    priority: 1,
  });
}

type SharedExerciseLibrarySourceFilter = "all" | "default" | "custom" | "archived";

function buildExerciseSearchText(exercise: Exercise, exerciseById?: Map<ID, Exercise>): string {
  const parent = exercise.parentExerciseId ? exerciseById?.get(exercise.parentExerciseId) : undefined;
  return [
    exercise.id,
    exercise.name,
    exercise.variationType,
    exercise.variationName,
    exercise.variationGroup,
    parent?.name,
    exercise.muscleGroup,
    ...exercise.primaryMuscles,
    ...exercise.secondaryMuscles,
    ...exercise.directVolumeMuscles,
    ...exercise.indirectVolumeMuscles,
    ...exercise.equipment,
    exercise.movementPattern,
    ...(exercise.movementPatterns || []),
    ...(exercise.tagLabels || []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function matchesExerciseSearch(exercise: Exercise, query: string, exerciseById?: Map<ID, Exercise>): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (exercise.id.toLowerCase().includes(normalizedQuery)) return true;
  return buildExerciseSearchText(exercise, exerciseById).includes(normalizedQuery);
}

function getSharedExerciseLibrarySource(
  exercises: Exercise[],
  userId: ID,
  options?: {
    query?: string;
    sourceFilter?: SharedExerciseLibrarySourceFilter;
    includeVariations?: boolean;
  }
): Exercise[] {
  const sourceFilter = options?.sourceFilter ?? "all";
  const includeVariations = options?.includeVariations ?? true;
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise] as const));

  return exercises.filter((exercise) => {
    if (exercise.ownerUserId && exercise.ownerUserId !== userId) return false;
    if (exercise.isArchived) {
      return sourceFilter === "archived" && matchesExerciseSearch(exercise, options?.query || "", exerciseById);
    }
    if (sourceFilter === "custom" && !exercise.ownerUserId) return false;
    if (sourceFilter === "default" && !!exercise.ownerUserId) return false;
    if (!includeVariations && exercise.isVariation) return false;
    return matchesExerciseSearch(exercise, options?.query || "", exerciseById);
  });
}

function getRequirementPickerVisibleExercises(
  exercises: Exercise[],
  userId: ID,
  targetMuscle: MuscleGroup,
  query = ""
): Exercise[] {
  return getSharedExerciseLibrarySource(exercises, userId, {
    query,
    includeVariations: true,
  }).filter((exercise) => exerciseMatchesRequirementTarget(exercise, targetMuscle));
}

function shouldDebugRequirementAutofill(requirement: SplitDayRequirement | undefined): boolean {
  return REQUIREMENT_AUTOFILL_DEBUG && normalizeMuscleKey(requirement?.targetMuscle ?? "") === "upper-chest";
}

function debugRequirementAutofill(context: {
  mode: "slot" | "remaining";
  selectedRequirement: SplitDayRequirement | undefined;
  pickerVisibleResults: Exercise[];
  autofillCandidates: Exercise[];
  rejectedCandidates: { exercise: Exercise; reason: string }[];
  existingSelectedExercises: Exercise[];
  usedIds: Iterable<string>;
  requirementStatusBefore: { fulfilled: number; needed: number };
  requirementStatusAfter?: { fulfilled: number; needed: number };
}) {
  if (!shouldDebugRequirementAutofill(context.selectedRequirement)) return;
  const describeExercise = (exercise: Exercise) => ({
    id: exercise.id,
    name: exercise.name,
    muscleKeys: getExerciseMuscleKeys(exercise),
  });
  console.groupCollapsed(`[RequirementAutofillDebug:${context.mode}] ${context.selectedRequirement?.targetMuscle}`);
  console.log("selectedRequirement", context.selectedRequirement);
  console.log("normalized requirement key", normalizeMuscleKey(context.selectedRequirement?.targetMuscle ?? ""));
  console.log("picker visible results", context.pickerVisibleResults.map(describeExercise));
  console.log("autofill candidates", context.autofillCandidates.map(describeExercise));
  console.log(
    "rejected candidates",
    context.rejectedCandidates.map(({ exercise, reason }) => ({
      ...describeExercise(exercise),
      reason,
    }))
  );
  console.log("existing selected exercises", context.existingSelectedExercises.map(describeExercise));
  console.log("used/excluded ids", [...context.usedIds]);
  console.log("requirement status before autofill", context.requirementStatusBefore);
  console.log("requirement status after simulation", context.requirementStatusAfter ?? context.requirementStatusBefore);
  console.groupEnd();
}

// Parent muscle groups: broad categories whose requirements can be satisfied by specific child muscles.
// Specific child muscles (lats, upper-back, etc.) must match EXACTLY — no fallback alias expansion.
const PARENT_MUSCLE_CHILDREN: Record<string, string[]> = {
  "back": ["lats", "upper-back", "mid-back", "traps", "spinal-erectors"],
  "chest": ["upper-chest", "lower-chest"],
  "shoulders": ["front-delts", "side-delts", "rear-delts"],
};

// Whether a requirement muscle is a broad parent category.
function isParentMuscle(muscle: MuscleGroup): boolean {
  return normalizeMuscleKey(muscle) in PARENT_MUSCLE_CHILDREN;
}

function getParentMuscle(muscle: MuscleGroup): MuscleGroup | undefined {
  const normalized = normalizeMuscleKey(muscle);
  const parent = Object.entries(PARENT_MUSCLE_CHILDREN).find(([key, children]) => key !== normalized && children.includes(normalized))?.[0];
  return parent as MuscleGroup | undefined;
}

function getMuscleSpecificityDepth(muscle: MuscleGroup): number {
  let depth = 0;
  let current = muscle;
  const visited = new Set<MuscleGroup>();
  while (true) {
    if (visited.has(current)) return depth;
    visited.add(current);
    const parent = getParentMuscle(current);
    if (!parent) return depth;
    depth += 1;
    current = parent;
  }
}

function compareRequirementsBySpecificity(a: SplitDayRequirement, b: SplitDayRequirement): number {
  const depthDelta = getMuscleSpecificityDepth(b.targetMuscle) - getMuscleSpecificityDepth(a.targetMuscle);
  if (depthDelta !== 0) return depthDelta;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id.localeCompare(b.id);
}

type RequirementMatchKind =
  | "exact-primary"
  | "exact-secondary"
  | "child-primary"
  | "child-secondary";

interface RequirementMatchDetails {
  kind: RequirementMatchKind;
  rank: number;
  childBiasPenalty: number;
}

function getRequirementMatchDetails(
  exercise: unknown,
  req: SplitDayRequirement,
  context?: {
    exerciseById?: Map<ID, Exercise>;
    sourceExerciseId?: ID;
    parentExerciseId?: ID;
  }
): RequirementMatchDetails | null {
  const reqTarget = normalizeMuscleKey(req.targetMuscle);
  const primary = new Set(getExercisePrimaryMuscleKeys(exercise, context));
  const secondary = new Set(getExerciseSecondaryMuscleKeys(exercise, context));
  const childMuscles = PARENT_MUSCLE_CHILDREN[reqTarget] ?? [];
  const childBiasPenalty = childMuscles.filter((muscle) => primary.has(muscle) || secondary.has(muscle)).length;

  if (primary.has(reqTarget)) {
    return { kind: "exact-primary", rank: 0, childBiasPenalty };
  }
  if (secondary.has(reqTarget)) {
    return { kind: "exact-secondary", rank: 1, childBiasPenalty };
  }
  if (childMuscles.some((muscle) => primary.has(muscle))) {
    return { kind: "child-primary", rank: 2, childBiasPenalty };
  }
  if (childMuscles.some((muscle) => secondary.has(muscle))) {
    return { kind: "child-secondary", rank: 3, childBiasPenalty };
  }
  return null;
}

function exerciseFulfillsRequirement(exercise: Exercise, req: SplitDayRequirement): boolean {
  return getRequirementMatchDetails(exercise, req) !== null;
}

interface RequirementAllocationSlot {
  req: SplitDayRequirement;
  slotIndex: number;
  plannedExerciseId?: ID;
  exerciseId?: ID;
  explicit: boolean;
  matchReason?: RequirementMatchKind | "fallback";
}

interface RequirementExerciseAssignment {
  plannedExerciseId: ID;
  exerciseId: ID;
  assignedRequirementId: ID;
  assignedRequirementMuscle: MuscleGroup;
  matchReason: RequirementMatchKind | "fallback";
}

interface RequirementAllocationResult {
  slots: RequirementAllocationSlot[];
  exerciseAssignments: RequirementExerciseAssignment[];
  assignmentByPlannedExerciseId: Map<ID, RequirementExerciseAssignment>;
  fulfilledByRequirementId: Map<ID, number>;
  missingByRequirementId: Map<ID, number>;
  allRequirementsMet: boolean;
}

function allocateExercisesToRequirements(
  plannedExercises: PlannedExercise[],
  requirements: SplitDayRequirement[],
  exerciseById: Map<ID, Exercise>
): RequirementAllocationResult {
  const sortedRequirements = requirements.slice().sort(compareRequirementsBySpecificity);
  const slots: RequirementAllocationSlot[] = sortedRequirements.flatMap((req) =>
    Array.from({ length: req.requiredExerciseCount }, (_, slotIndex): RequirementAllocationSlot => ({
      req,
      slotIndex,
      explicit: false,
    }))
  );
  const slotsByRequirementId = new Map<ID, RequirementAllocationSlot[]>();
  slots.forEach((slot) => {
    const list = slotsByRequirementId.get(slot.req.id) ?? [];
    list.push(slot);
    slotsByRequirementId.set(slot.req.id, list);
  });

  const remainingByRequirementId = new Map<ID, number>();
  requirements.forEach((req) => {
    remainingByRequirementId.set(req.id, req.requiredExerciseCount);
  });
  const exerciseAssignments: RequirementExerciseAssignment[] = [];
  const assignedPlannedExerciseIds = new Set<ID>();

  const assignToRequirement = (
    planned: PlannedExercise,
    req: SplitDayRequirement,
    options?: {
      explicit?: boolean;
      matchReason?: RequirementMatchKind | "fallback";
    }
  ) => {
    const reqSlots = slotsByRequirementId.get(req.id) ?? [];
    const openSlot = reqSlots.find((slot) => !slot.plannedExerciseId);
    if (!openSlot) return false;
    const matchReason = options?.matchReason ?? "fallback";
    openSlot.plannedExerciseId = planned.id;
    openSlot.exerciseId = planned.exerciseId;
    openSlot.explicit = options?.explicit ?? false;
    openSlot.matchReason = matchReason;
    remainingByRequirementId.set(req.id, Math.max(0, (remainingByRequirementId.get(req.id) ?? 0) - 1));
    exerciseAssignments.push({
      plannedExerciseId: planned.id,
      exerciseId: planned.exerciseId,
      assignedRequirementId: req.id,
      assignedRequirementMuscle: req.targetMuscle,
      matchReason,
    });
    assignedPlannedExerciseIds.add(planned.id);
    return true;
  };

  plannedExercises.forEach((planned) => {
    if (planned.isExtra || !planned.fulfillsRequirementId) return;
    const explicitReq = requirements.find((req) => req.id === planned.fulfillsRequirementId);
    if (!explicitReq) return;
    const explicitMatch = getRequirementMatchDetails(planned, explicitReq, {
      exerciseById,
      sourceExerciseId: planned.exerciseId,
    });
    assignToRequirement(planned, explicitReq, {
      explicit: true,
      matchReason: explicitMatch?.kind ?? "fallback",
    });
  });

  plannedExercises.forEach((planned, order) => {
    if (planned.isExtra || assignedPlannedExerciseIds.has(planned.id)) return;
    const plannedMuscles = getExerciseMuscleKeys(planned, { exerciseById, sourceExerciseId: planned.exerciseId });
    if (!plannedMuscles.length) return;

    const matches = sortedRequirements
      .filter((req) => (remainingByRequirementId.get(req.id) ?? 0) > 0)
      .map((req) => {
        const match = getRequirementMatchDetails(planned, req, {
          exerciseById,
          sourceExerciseId: planned.exerciseId,
        });
        if (!match) return null;
        return { req, match };
      })
      .filter((item): item is { req: SplitDayRequirement; match: RequirementMatchDetails } => Boolean(item))
      .sort((a, b) => {
        const specificityDelta = compareRequirementsBySpecificity(a.req, b.req);
        if (specificityDelta !== 0) return specificityDelta;
        const explicitDelta = Number(b.req.id === planned.fulfillsRequirementId) - Number(a.req.id === planned.fulfillsRequirementId);
        if (explicitDelta !== 0) return explicitDelta;
        const rankDelta = a.match.rank - b.match.rank;
        if (rankDelta !== 0) return rankDelta;
        const childBiasDelta = a.match.childBiasPenalty - b.match.childBiasPenalty;
        if (childBiasDelta !== 0) return childBiasDelta;
        if (a.req.priority !== b.req.priority) return a.req.priority - b.req.priority;
        return order;
      });
    const chosen = matches[0];
    if (!chosen) return;
    assignToRequirement(planned, chosen.req, {
      explicit: planned.fulfillsRequirementId === chosen.req.id,
      matchReason: chosen.match.kind,
    });
  });

  const fulfilledByRequirementId = new Map<ID, number>();
  const missingByRequirementId = new Map<ID, number>();
  requirements.forEach((req) => {
    const fulfilled = slots.filter((slot) => slot.req.id === req.id && slot.plannedExerciseId).length;
    fulfilledByRequirementId.set(req.id, fulfilled);
    missingByRequirementId.set(req.id, Math.max(0, req.requiredExerciseCount - fulfilled));
  });
  const assignmentByPlannedExerciseId = new Map(exerciseAssignments.map((assignment) => [assignment.plannedExerciseId, assignment] as const));

  return {
    slots,
    exerciseAssignments,
    assignmentByPlannedExerciseId,
    fulfilledByRequirementId,
    missingByRequirementId,
    allRequirementsMet: requirements.every((req) => (fulfilledByRequirementId.get(req.id) ?? 0) >= req.requiredExerciseCount),
  };
}

function findNextUnmetRequirementIndex(
  requirements: SplitDayRequirement[],
  allocation: RequirementAllocationResult
): number {
  const sortedBySpecificity = requirements
    .map((req, index) => ({ req, index }))
    .sort((a, b) => compareRequirementsBySpecificity(a.req, b.req));
  const next = sortedBySpecificity.find(({ req }) => (allocation.fulfilledByRequirementId.get(req.id) ?? 0) < req.requiredExerciseCount);
  return next ? next.index : -1;
}

function deriveRequirements(day: WorkoutDay, splitDays: SplitDay[]): SplitDayRequirement[] {
  const splitDay = splitDays.find((sd) => sd.id === day.splitDayId);
  if (splitDay?.requirements?.length) return splitDay.requirements;
  const muscles = day.targetMuscles?.length ? day.targetMuscles : (splitDay?.muscleGroups ?? []);
  return muscles.map((muscle, i) => ({
    id: `auto_${muscle}_${i}`,
    targetMuscle: muscle,
    requiredExerciseCount: 1,
    priority: i + 1,
  }));
}

// ── Week planned-state source of truth ───────────────────────────────────────
// These functions are the single canonical check used by Today, WeekEditor, and
// any future screen that needs to know whether a week is safe to train on.

function isWeekDraft(week: { isDraft?: boolean } | undefined): boolean {
  return week?.isDraft === true;
}

function isWorkoutDayPlanned(day: { status?: string; exercises: { id: string }[] } | undefined): boolean {
  if (!day) return false;
  if (day.status === "rest") return true;
  return day.exercises.length > 0;
}

function isWeekPlanned(week: { isDraft?: boolean; workouts: { status?: string; exercises: { id: string }[] }[] } | undefined): boolean {
  if (!week) return false;
  if (isWeekDraft(week)) return false;
  const trainingDays = week.workouts.filter((day) => day.status !== "rest");
  if (!trainingDays.length) return false;
  return trainingDays.every((day) => isWorkoutDayPlanned(day));
}

type ResumeWorkoutState =
  | { kind: "missing"; reason: string }
  | { kind: "invalid"; session: WorkoutSession; reason: string }
  | { kind: "no-exercises"; session: WorkoutSession }
  | {
      kind: "ready";
      session: WorkoutSession;
      activeExerciseIndex: number;
      activeExerciseId: string;
      currentSetIndex: number;
      repaired: boolean;
    };

function getLoggedExercisePlannedSets(log?: LoggedExercise, planned?: PlannedExercise): PlannedSet[] {
  const deletedIds = new Set(log?.deletedPlannedSetIds || []);
  const sourceSets = planned?.plannedSets || log?.offProgramPlannedSets || [];
  if (!deletedIds.size) return sourceSets;
  return sourceSets.filter((set) => !deletedIds.has(set.id));
}

function getResumeSetIndex(log: LoggedExercise, plannedSets: PlannedSet[]): number {
  if (!plannedSets.length) return log.sets.length;
  for (let index = 0; index < plannedSets.length; index += 1) {
    const plannedSet = plannedSets[index];
    if (!log.sets.some((set) => set.plannedSetId === plannedSet.id)) return index;
  }
  return plannedSets.length;
}

type LoggerLineupItem = {
  key: string;
  displayIndex: number;
  plannedIndex?: number;
  plannedSet?: PlannedSet;
  actualIndex?: number;
  actualSet?: LoggedSet;
  isExtra: boolean;
};

function buildLoggerLineupItems(log: LoggedExercise, plannedSets: PlannedSet[]): LoggerLineupItem[] {
  const matchedActualSetIds = new Set<string>();
  const plannedItems = plannedSets.map((plannedSet, plannedIndex) => {
    const actualIndex = log.sets.findIndex((set) => set.plannedSetId === plannedSet.id);
    const actualSet = actualIndex >= 0 ? log.sets[actualIndex] : undefined;
    if (actualSet) matchedActualSetIds.add(actualSet.id);
    return {
      key: `planned:${plannedSet.id}`,
      displayIndex: plannedIndex,
      plannedIndex,
      plannedSet,
      actualIndex: actualIndex >= 0 ? actualIndex : undefined,
      actualSet,
      isExtra: false,
    };
  });

  const extraItems = log.sets
    .map((actualSet, actualIndex) => ({ actualSet, actualIndex }))
    .filter(({ actualSet }) => !matchedActualSetIds.has(actualSet.id))
    .map(({ actualSet, actualIndex }, extraIndex) => ({
      key: `extra:${actualSet.id}`,
      displayIndex: plannedItems.length + extraIndex,
      actualIndex,
      actualSet,
      isExtra: true,
    }));

  return [...plannedItems, ...extraItems];
}

function resolveWorkoutResumeState(
  db: TrainingDatabase,
  userId: string,
  sessionId?: string,
  preferredExerciseId?: string,
  allowCompleted = false
): ResumeWorkoutState {
  const session = sessionId
    ? db.sessions.find((candidate) => candidate.id === sessionId && candidate.userId === userId)
    : db.sessions.find((candidate) => candidate.userId === userId && (candidate.status === "in-progress" || candidate.status === "review"));

  if (!session) return { kind: "missing", reason: "session-missing" };
  if (session.status !== "in-progress" && session.status !== "review" && (!allowCompleted || session.status !== "completed")) {
    return { kind: "invalid", session, reason: "session-not-in-progress" };
  }
  if (!session.loggedExercises.length) return { kind: "no-exercises", session };

  const hasExerciseDefinition = (log?: LoggedExercise) => !!log && db.exercises.some((exercise) => exercise.id === log.exerciseId);
  const findFallbackIndex = (preferIncomplete: boolean): number => {
    for (let index = 0; index < session.loggedExercises.length; index += 1) {
      const log = session.loggedExercises[index];
      if (!hasExerciseDefinition(log)) continue;
      if (!preferIncomplete || !isLoggedExerciseComplete(log, db, session)) return index;
    }
    return -1;
  };
  const firstValidIncompleteIndex = findFallbackIndex(true);
  const firstValidExerciseIndex = findFallbackIndex(false);
  const preferredIndex = preferredExerciseId
    ? session.loggedExercises.findIndex((log) => log.id === preferredExerciseId)
    : -1;
  const fallbackIndex = firstValidIncompleteIndex >= 0
    ? firstValidIncompleteIndex
    : firstValidExerciseIndex >= 0
      ? firstValidExerciseIndex
      : -1;
  if (fallbackIndex < 0) return { kind: "invalid", session, reason: "no-valid-exercises" };

  let activeExerciseIndex = preferredIndex >= 0
    ? preferredIndex
    : Math.min(Math.max(session.currentExerciseIndex ?? fallbackIndex, 0), session.loggedExercises.length - 1);

  const currentLog = session.loggedExercises[activeExerciseIndex];
  if (!currentLog) {
    const fallbackLog = session.loggedExercises[fallbackIndex];
    if (!fallbackLog) return { kind: "invalid", session, reason: "active-exercise-missing" };
    activeExerciseIndex = fallbackIndex;
  }

  if (preferredExerciseId && preferredIndex < 0) activeExerciseIndex = fallbackIndex;
  if (!hasExerciseDefinition(session.loggedExercises[activeExerciseIndex])) activeExerciseIndex = fallbackIndex;
  // Only auto-redirect to the first incomplete exercise during initial resume (no explicit user choice).
  // When the user explicitly clicks a completed exercise, respect their selection.
  if (preferredIndex < 0 && firstValidIncompleteIndex >= 0 && isLoggedExerciseComplete(session.loggedExercises[activeExerciseIndex], db, session)) {
    activeExerciseIndex = firstValidIncompleteIndex;
  }

  const activeLog = session.loggedExercises[activeExerciseIndex];
  if (!activeLog) return { kind: "invalid", session, reason: "active-exercise-missing" };

  const planned = findPlannedExercise(db, session, activeLog);
  const plannedSets = getLoggedExercisePlannedSets(activeLog, planned);
  const expectedSetIndex = getResumeSetIndex(activeLog, plannedSets);
  const currentSetIndex = session.currentSetIndex ?? expectedSetIndex;
  const clampedSetIndex = Math.min(Math.max(currentSetIndex, 0), expectedSetIndex);

  return {
    kind: "ready",
    session,
    activeExerciseIndex,
    activeExerciseId: activeLog.id,
    currentSetIndex: clampedSetIndex,
    repaired:
      activeExerciseIndex !== (session.currentExerciseIndex ?? fallbackIndex)
      || activeLog.id !== preferredExerciseId && !!preferredExerciseId
      || clampedSetIndex !== currentSetIndex,
  };
}

function isSessionResumableOnTodayCard(db: TrainingDatabase, userId: string, session?: WorkoutSession): boolean {
  if (!session) return false;
  return resolveWorkoutResumeState(db, userId, session.id).kind === "ready";
}

// localStorage-backed builder form draft per user
const builderDraftKey = (userId: string) => `iron_orbit_builder_draft_${userId}`;
const BLOCK_BUILDER_DEBUG = false;
interface BuilderFormSnapshot {
  selectedSplitId: string;
  buildMode: ProgramBuildMode;
  requestName: string;
  requestGoal: TrainingGoal;
  requestDaysPerWeek: number;
  requestBlockType: BlockType;
  requestBlockLengthWeeks: number;
  requestSplitLoopMode: SplitLoopMode;
  requestNotes: string;
  savedAt: string;
}
function loadBuilderDraft(userId: string): BuilderFormSnapshot | null {
  try {
    const raw = localStorage.getItem(builderDraftKey(userId));
    return raw ? (JSON.parse(raw) as BuilderFormSnapshot) : null;
  } catch { return null; }
}
function saveBuilderDraft(userId: string, snap: BuilderFormSnapshot): void {
  try { localStorage.setItem(builderDraftKey(userId), JSON.stringify(snap)); } catch { /* ignore quota */ }
}
function clearBuilderDraft(userId: string): void {
  localStorage.removeItem(builderDraftKey(userId));
}

function blockBuilderDebug(label: string, payload: Record<string, unknown>): void {
  if (!BLOCK_BUILDER_DEBUG) return;
  console.log(`[BLOCK_BUILDER_DEBUG] ${label}`, payload);
}

function builderRequestBasicsEqual(a: ProgramRequest, b: ProgramRequest): boolean {
  return (
    a.name === b.name &&
    a.goal === b.goal &&
    a.daysPerWeek === b.daysPerWeek &&
    a.blockType === b.blockType &&
    a.blockLengthWeeks === b.blockLengthWeeks &&
    a.splitTemplateId === b.splitTemplateId &&
    a.splitLoopMode === b.splitLoopMode &&
    a.notes === b.notes
  );
}

type LoggerSetDraftState = {
  draftKey: string;
  kind: SetKind;
  actualWeight: string;
  actualReps: string;
  actualRpe: string;
  setRating: SetRating;
  formRating: string;
  muscleFeelRating: string;
  pumpRating: string;
  painRating: string;
  sorenessRating: string;
  notes: string;
};

type ReadinessFormDraft = Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">;

type ActiveWorkoutSessionDraft = {
  sessionId: string;
  workoutDayId?: string;
  activeExerciseId?: string;
  activeSetActualId?: string | null;
  activeSetPlannedId?: string | null;
  activeSetPlannedIndex?: number | null;
  selectionMode?: "editing" | "actual" | "planned";
  setDraft?: LoggerSetDraftState;
  draftDirty?: boolean;
  showSetNotes?: boolean;
  readinessDraft?: ReadinessFormDraft;
  lastLocalMutationAt: string;
};

type TodayWorkspaceMode =
  | "scheduled-overview"
  | "programmed-workout"
  | "off-program-builder"
  | "off-program-workout";

type AppUiSnapshot = {
  todaySelectedDayId: string | null;
  lastActiveLoggerSessionId?: string;
  todayWorkspaceMode?: TodayWorkspaceMode;
};

// Shared type for persisted off-program builder draft items (mirrors the
// inline OffProgramExerciseDraft type inside TodayScreen).
type PersistedOffProgramBuilderItem = {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  targetRpe: number;
  plannedWeight?: number;
};
// Shared alias used by both App (state owner) and TodayScreen (render/handlers).
type OffProgramExerciseDraft = PersistedOffProgramBuilderItem;
type OffProgramBuilderState = { active: boolean; exercises: OffProgramExerciseDraft[] };

const workoutDraftKey = (userId: string, sessionId: string) => `iron_orbit_active_workout_draft_${userId}_${sessionId}`;
const appUiSnapshotKey = (userId: string) => `iron_orbit_app_ui_${userId}`;
const offProgramBuilderDraftKey = (userId: string) => `iron_orbit_off_program_builder_draft_${userId}`;

function loadOffProgramBuilderDraft(userId: string): PersistedOffProgramBuilderItem[] | null {
  try {
    const raw = localStorage.getItem(offProgramBuilderDraftKey(userId));
    return raw ? (JSON.parse(raw) as PersistedOffProgramBuilderItem[]) : null;
  } catch { return null; }
}
function saveOffProgramBuilderDraft(userId: string, items: PersistedOffProgramBuilderItem[]): void {
  try { localStorage.setItem(offProgramBuilderDraftKey(userId), JSON.stringify(items)); } catch { /* ignore quota */ }
}
function clearOffProgramBuilderDraft(userId: string): void {
  try { localStorage.removeItem(offProgramBuilderDraftKey(userId)); } catch { /* ignore */ }
}

function createDefaultReadinessDraft(): ReadinessFormDraft {
  return {
    sleepQuality: 3,
    stress: 1,
    soreness: 1,
    motivation: 3,
    energy: 3,
    jointPain: 1,
    bodyweight: 0,
    nutritionQuality: 3,
    caffeine: false,
    timeOfDay: "evening",
    limitations: "",
  };
}

function normalizeReadinessDraft(value?: Partial<ReadinessFormDraft> | null): ReadinessFormDraft {
  const base = createDefaultReadinessDraft();
  if (!value) return base;
  return {
    ...base,
    ...value,
    bodyweight: typeof value.bodyweight === "number" ? value.bodyweight : 0,
    caffeine: value.caffeine === true,
    limitations: typeof value.limitations === "string" ? value.limitations : "",
  };
}

function loadActiveWorkoutSessionDraft(userId: string, sessionId?: string): ActiveWorkoutSessionDraft | undefined {
  if (!sessionId) return undefined;
  try {
    const raw = localStorage.getItem(workoutDraftKey(userId, sessionId));
    return raw ? JSON.parse(raw) as ActiveWorkoutSessionDraft : undefined;
  } catch {
    return undefined;
  }
}

function saveActiveWorkoutSessionDraft(userId: string, sessionId: string, snapshot: ActiveWorkoutSessionDraft): void {
  try {
    localStorage.setItem(workoutDraftKey(userId, sessionId), JSON.stringify(snapshot));
  } catch {
    // Ignore localStorage quota issues; the active session DB remains the durable fallback.
  }
}

function clearActiveWorkoutSessionDraft(userId: string, sessionId?: string): void {
  if (!sessionId) return;
  try {
    localStorage.removeItem(workoutDraftKey(userId, sessionId));
  } catch {
    // Ignore localStorage errors during cleanup.
  }
}

const VALID_TODAY_WORKSPACE_MODES: TodayWorkspaceMode[] = [
  "scheduled-overview", "programmed-workout", "off-program-builder", "off-program-workout",
];

function loadAppUiSnapshot(userId: string): AppUiSnapshot {
  try {
    const raw = localStorage.getItem(appUiSnapshotKey(userId));
    if (!raw) return { todaySelectedDayId: null };
    const parsed = JSON.parse(raw) as Partial<AppUiSnapshot>;
    const todayWorkspaceMode = VALID_TODAY_WORKSPACE_MODES.includes(parsed.todayWorkspaceMode as TodayWorkspaceMode)
      ? (parsed.todayWorkspaceMode as TodayWorkspaceMode)
      : undefined;
    return {
      todaySelectedDayId: typeof parsed.todaySelectedDayId === "string" ? parsed.todaySelectedDayId : null,
      lastActiveLoggerSessionId: typeof parsed.lastActiveLoggerSessionId === "string" ? parsed.lastActiveLoggerSessionId : undefined,
      todayWorkspaceMode,
    };
  } catch {
    return { todaySelectedDayId: null };
  }
}

function saveAppUiSnapshot(userId: string, snapshot: AppUiSnapshot): void {
  try {
    localStorage.setItem(appUiSnapshotKey(userId), JSON.stringify(snapshot));
  } catch {
    // Ignore localStorage quota issues; this is navigation convenience state only.
  }
}

const equipmentOptions: EquipmentCategory[] = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "cardio", "bands"];
const movementOptions: MovementPattern[] = ["squat", "hinge", "horizontal-press", "vertical-press", "horizontal-pull", "vertical-pull", "single-leg", "isolation", "carry", "brace", "locomotion", "mobility"];
const dayFocusOptions: DayFocus[] = ["strength", "hypertrophy", "technical", "recovery", "conditioning", "hybrid"];
const exerciseUnitOptions: ExerciseUnit[] = ["lb", "kg", "bodyweight", "assisted", "distance", "time", "reps-only"];
const exerciseCategoryOptions: ExerciseCategoryLabel[] = ["sbd", "main_compound", "secondary_compound", "machine_compound", "isolation", "bodyweight", "conditioning"];

function formatDateTime(value?: string): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderCloudStatusLabel(status: "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed"): string {
  switch (status) {
    case "disabled":
      return "Cloud Off";
    case "not-signed-in":
      return "Local Only";
    case "hydrating":
      return "Hydrating";
    case "syncing":
      return "Syncing";
    case "synced":
      return "Synced";
    case "failed":
      return "Sync Failed";
    default:
      return "Cloud";
  }
}

function editSaveContext(authMode: "unknown" | "local" | "cloud", cloudStatus: "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed"): string {
  if (authMode !== "cloud") return "Changes are saved locally.";
  switch (cloudStatus) {
    case "syncing":
    case "hydrating":
      return "Syncing to cloud…";
    case "synced":
      return "Saved to cloud.";
    case "failed":
      return "Sync failed — changes are queued locally.";
    default:
      return "Changes are saved locally.";
  }
}

function SnapshotSummaryCard({
  title,
  tone = "neutral",
  summary,
}: {
  title: string;
  tone?: "neutral" | "cloud" | "local";
  summary: SnapshotSummary;
}) {
  const toneClass = tone === "cloud"
    ? "border-sky-500/30 bg-sky-500/10"
    : tone === "local"
      ? "border-volt/30 bg-volt/10"
      : "border-white/10 bg-white/5";

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs text-iron-300">Last updated {formatDateTime(summary.updatedAt)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-iron-300">
        <p>Exercises: {summary.exerciseCount}</p>
        <p>Splits: {summary.splitCount}</p>
        <p>Blocks: {summary.blockCount}</p>
        <p>Sessions: {summary.workoutSessionCount}</p>
        <p>Completed: {summary.completedSessionCount}</p>
      </div>
    </div>
  );
}

function ModeGate({
  cloud,
}: {
  cloud: {
    configured: boolean;
    status: "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed";
    message: string;
    lastError?: string;
    continueLocalOnly: () => void;
    signIn: (email: string, password: string) => Promise<unknown>;
    signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  };
}) {
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | undefined>();
  const [authError, setAuthError] = useState<string | undefined>();
  const [authLoading, setAuthLoading] = useState<"signup" | "signin" | undefined>();

  async function handleSignUp() {
    setAuthLoading("signup");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      const result = await cloud.signUp(authEmail, authPassword);
      setAuthMessage(
        result.needsEmailConfirmation
          ? "Check your email to confirm your account before signing in."
          : "Account created. Loading your account data..."
      );
      if (!result.needsEmailConfirmation) {
        setAuthPassword("");
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setAuthLoading("signin");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      await cloud.signIn(authEmail, authPassword);
      setAuthMessage("Signed in. Checking your cloud data...");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="panel w-full max-w-4xl p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-volt text-iron-950">
                <Dumbbell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-iron-400">Iron Orbit</p>
                <h1 className="text-xl font-bold text-white">Choose how you want to train</h1>
              </div>
            </div>
            <div className="mt-5 rounded-md border border-volt/30 bg-volt/10 p-4">
              <p className="text-sm font-semibold text-white">Continue Local Only</p>
              <p className="mt-1 text-sm text-iron-200">Saved on this device only. Nothing is sent to the cloud until you intentionally sign in later.</p>
              <button className="btn-primary mt-4 w-full sm:w-auto" onClick={cloud.continueLocalOnly}>
                <ChevronRight className="h-4 w-4" />
                Continue Local Only
              </button>
            </div>
            <div className="mt-4 rounded-md border border-white/10 bg-iron-950/50 p-4 text-sm text-iron-300">
              <p className="font-semibold text-white">Account mode</p>
              <p className="mt-1">Sign in to sync across devices. Local-only data stays separate unless you explicitly import it later.</p>
            </div>
          </section>

          <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-white">Sign In / Sign Up</p>
            <p className="mt-1 text-sm text-iron-300">Sync across devices with your Supabase account.</p>
            <form className="mt-5 space-y-3" onSubmit={handleSignIn}>
              <TextField label="Email" type="email" value={authEmail} onChange={setAuthEmail} />
              <TextField label="Password" type="password" value={authPassword} onChange={setAuthPassword} />
              <div className="rounded-md border border-white/10 bg-iron-950/50 p-3 text-xs text-iron-400">
                <p>{cloud.message}</p>
                {cloud.lastError && <p className="mt-2 text-orange-100">{cloud.lastError}</p>}
              </div>
              {authMessage && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">{authMessage}</p>}
              {authError && <p className="rounded-lg border border-ember/30 bg-ember/10 p-3 text-xs text-orange-100">{authError}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="btn-primary w-full" type="submit" disabled={!cloud.configured || authLoading !== undefined || !authEmail || !authPassword}>
                  <UserRound className="h-4 w-4" />
                  {authLoading === "signin" ? "Signing In..." : "Sign In"}
                </button>
                <button className="btn-secondary w-full" type="button" disabled={!cloud.configured || authLoading !== undefined || !authEmail || !authPassword} onClick={() => void handleSignUp()}>
                  <Plus className="h-4 w-4" />
                  {authLoading === "signup" ? "Creating..." : "Sign Up"}
                </button>
              </div>
              <p className="text-xs text-iron-500">If email confirmation is enabled in Supabase, confirm your email before trying to sign in.</p>
              {!cloud.configured && <p className="text-xs text-orange-100">Cloud sync is currently unavailable in this environment. Local-only mode still works.</p>}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

function App() {
  const { db, currentUser, loading, error, authMode, updateDb, importDb, reseed, cloud } = useTrainingDb();
  const [screen, setScreen] = useState<Screen>("today");
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [resumeMessage, setResumeMessage] = useState<string | undefined>();
  const [completedReviewState, setCompletedReviewState] = useState<CompletedReviewState | undefined>();
  const [loggerNavigation, setLoggerNavigation] = useState<LoggerNavigationState>({ previousScreen: "today" });
  const [planWeekRequest, setPlanWeekRequest] = useState<number | undefined>();
  // Persists the Week Editor open state across tab navigation so editing is not lost on screen switch.
  const [editingWeekNumber, setEditingWeekNumber] = useState<number | undefined>();
  const [exerciseAnalyticsState, setExerciseAnalyticsState] = useState<ExerciseAnalyticsState | undefined>();
  // Today timeline: which workout day (by ID) the user has navigated to on the Today screen.
  // null = show the current block day (default). Persists across screen changes so Today retains
  // context when returning from the logger or completed-review.
  const [todaySelectedDayId, setTodaySelectedDayId] = useState<string | null>(null);
  // Tracks what Today was last showing so refresh/navigation restores the right workspace.
  const [todayWorkspaceMode, setTodayWorkspaceMode] = useState<TodayWorkspaceMode>("scheduled-overview");
  // Off-program builder state lives in App (not TodayScreen) so it survives tab navigation.
  // TodayScreen unmounts/remounts on tab switches; App persists across the entire session.
  const [offProgramBuilder, setOffProgramBuilder] = useState<OffProgramBuilderState>({ active: false, exercises: [] });
  const [hydratedUiUserId, setHydratedUiUserId] = useState<string | undefined>();
  const currentUserId = currentUser?.id;
  const persistedActiveSession = db && currentUserId
    ? db.sessions.find((session) => session.userId === currentUserId && (session.status === "in-progress" || session.status === "review"))
    : undefined;
  const activeSession = db
    ? (activeSessionId
      ? db.sessions.find((session) => session.id === activeSessionId) || persistedActiveSession
      : persistedActiveSession)
    : undefined;

  useEffect(() => {
    if (!db || !currentUserId) return;
    if (hydratedUiUserId === currentUserId) return;
    const snapshot = loadAppUiSnapshot(currentUserId);
    setTodaySelectedDayId(snapshot.todaySelectedDayId);
    if (snapshot.todayWorkspaceMode) {
      setTodayWorkspaceMode(snapshot.todayWorkspaceMode);
    }
    // Restore off-program builder draft from localStorage on app boot.
    if (snapshot.todayWorkspaceMode === "off-program-builder") {
      const persisted = loadOffProgramBuilderDraft(currentUserId);
      setOffProgramBuilder({ active: true, exercises: persisted ?? [] });
    }
    // Only auto-restore the logger on refresh if the last Today workspace was actually
    // an active workout session (not a builder draft or scheduled overview).
    const wasActiveLogger =
      snapshot.todayWorkspaceMode === "programmed-workout" ||
      snapshot.todayWorkspaceMode === "off-program-workout" ||
      // Legacy snapshots without todayWorkspaceMode: only restore non-off-program sessions
      // to avoid surfacing stale off-program sessions for users upgrading.
      (!snapshot.todayWorkspaceMode && !persistedActiveSession?.offProgram);
    if (wasActiveLogger && snapshot.lastActiveLoggerSessionId && activeSession?.id === snapshot.lastActiveLoggerSessionId) {
      setLoggerNavigation({ previousScreen: "today", loggerMode: "active-logger" });
      setActiveSessionId(activeSession.id);
      setScreen("logger");
    }
    setHydratedUiUserId(currentUserId);
  }, [activeSession?.id, currentUserId, db, hydratedUiUserId, persistedActiveSession?.offProgram]);

  // Persist off-program builder draft whenever exercises change.
  useEffect(() => {
    if (!currentUserId) return;
    if (offProgramBuilder.active && offProgramBuilder.exercises.length > 0) {
      saveOffProgramBuilderDraft(currentUserId, offProgramBuilder.exercises);
    } else if (!offProgramBuilder.active) {
      clearOffProgramBuilderDraft(currentUserId);
    }
  }, [currentUserId, offProgramBuilder.active, offProgramBuilder.exercises]);

  useEffect(() => {
    if (!db || !currentUserId) return;
    if (hydratedUiUserId !== currentUserId) return;
    saveAppUiSnapshot(currentUserId, {
      todaySelectedDayId,
      lastActiveLoggerSessionId: activeSession?.id,
      todayWorkspaceMode,
    });
  }, [activeSession?.id, currentUserId, db, hydratedUiUserId, todaySelectedDayId, todayWorkspaceMode]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-sm p-6 text-center">
          <Gauge className="mx-auto mb-4 h-10 w-10 text-volt" />
          <h1 className="text-xl font-black">Loading Iron Orbit</h1>
          <p className="mt-2 text-sm text-iron-300">Opening the local training database.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-sm p-6">
          <ShieldAlert className="mb-4 h-10 w-10 text-ember" />
          <h1 className="text-xl font-black">Could not load the app</h1>
          <p className="mt-2 text-sm text-iron-300">{error}</p>
        </div>
      </main>
    );
  }

  if (authMode === "unknown" && cloud.session && (cloud.status === "hydrating" || cloud.status === "syncing")) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-sm p-6 text-center">
          <RefreshCcw className="mx-auto mb-4 h-10 w-10 text-sky-200" />
          <h1 className="text-xl font-black">Checking your cloud data</h1>
          <p className="mt-2 text-sm text-iron-300">{cloud.message}</p>
        </div>
      </main>
    );
  }

  if (authMode === "unknown") {
    return <ModeGate cloud={cloud} />;
  }

  if (!db) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-sm p-6 text-center">
          <Gauge className="mx-auto mb-4 h-10 w-10 text-volt" />
          <h1 className="text-xl font-black">Preparing your workspace</h1>
          <p className="mt-2 text-sm text-iron-300">
            {authMode === "cloud"
              ? "Opening your cloud account data on this device."
              : "Opening your local-only training data."}
          </p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-sm p-6">
          <ShieldAlert className="mb-4 h-10 w-10 text-ember" />
          <h1 className="text-xl font-black">Could not open a profile</h1>
          <p className="mt-2 text-sm text-iron-300">The local profile did not initialize correctly.</p>
        </div>
      </main>
    );
  }

  const appDb = db;
  const resolvedCurrentUserId = currentUser.id;

  function openCompletedSessionReview(sessionId: string, returnScreen: CompletedReviewState["returnScreen"]) {
    setCompletedReviewState({ sessionId, returnScreen });
    setResumeMessage(undefined);
    setScreen("completed-review");
  }

  function openExerciseAnalytics(state: ExerciseAnalyticsState) {
    setExerciseAnalyticsState(state);
    setResumeMessage(undefined);
    setScreen("exercise-analytics");
  }

  function openLoggerSession(
    sessionId: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) {
    setLoggerNavigation({
      previousScreen: options?.previousScreen || (screen === "week" ? "week" : "today"),
      completedReviewState: options?.completedReviewState,
      loggerMode: options?.loggerMode || "active-logger",
    });
    setResumeMessage(undefined);
    setActiveSessionId(sessionId);
    // Track workspace mode so refresh knows whether to restore the logger.
    const session = appDb?.sessions.find((s) => s.id === sessionId);
    setTodayWorkspaceMode(session?.offProgram ? "off-program-workout" : "programmed-workout");
    setScreen("logger");
  }

  function navigateToScreen(nextScreen: Screen) {
    if (nextScreen === "today" && activeSession?.id) {
      // Only auto-restore the logger if the workspace mode explicitly says it was
      // an active logger session. This prevents stale off-program sessions (or any
      // session the user never explicitly started this visit) from hijacking Today.
      const sessionIsActiveLogger =
        todayWorkspaceMode === "programmed-workout" ||
        todayWorkspaceMode === "off-program-workout" ||
        // For programmed (non-off-program) sessions with no workspace mode set yet
        // (e.g., first visit after upgrade), preserve the old restoration behavior.
        (todayWorkspaceMode === "scheduled-overview" && !activeSession.offProgram && activeSessionId != null);
      if (sessionIsActiveLogger) {
        setResumeMessage(undefined);
        setLoggerNavigation((current) => ({
          previousScreen: "today",
          completedReviewState: current.completedReviewState,
          loggerMode: current.loggerMode || "active-logger",
        }));
        setActiveSessionId(activeSession.id);
        setScreen("logger");
        return;
      }
    }
    setScreen(nextScreen);
  }

  async function resumeWorkoutSession(
    requestedSessionId?: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) {
    const requestedSession = requestedSessionId
      ? appDb.sessions.find((candidate) => candidate.id === requestedSessionId && candidate.userId === resolvedCurrentUserId)
      : undefined;
    const navigationState: LoggerNavigationState = {
      previousScreen: options?.previousScreen || (screen === "week" ? "week" : "today"),
      completedReviewState: options?.completedReviewState,
      loggerMode: options?.loggerMode || "active-logger",
    };
    setLoggerNavigation(navigationState);

    if (requestedSession?.status === "completed") {
      setResumeMessage(undefined);
      setActiveSessionId(requestedSession.id);
      setTodayWorkspaceMode(requestedSession.offProgram ? "off-program-workout" : "programmed-workout");
      setScreen("logger");
      return;
    }

    const resumeState = resolveWorkoutResumeState(appDb, resolvedCurrentUserId, requestedSessionId);
    if (resumeState.kind === "ready" || resumeState.kind === "no-exercises") {
      setResumeMessage(undefined);
      setActiveSessionId(resumeState.session.id);
      setTodayWorkspaceMode(resumeState.session.offProgram ? "off-program-workout" : "programmed-workout");
      setScreen("logger");
      return;
    }

    console.error("Workout resume failed", {
      userId: resolvedCurrentUserId,
      requestedSessionId,
      reason: resumeState.reason,
      activeSessionId,
    });
    setActiveSessionId(undefined);
    setResumeMessage("That workout could not be resumed.");
    setScreen("today");
  }

  return (
    <div className={`min-h-dvh max-w-full text-white ${screen !== "logger" ? "pb-32 lg:pb-0" : ""}`}>
      <header className={`safe-top sticky top-0 z-30 backdrop-blur-xl ${screen === "logger" ? "bg-iron-950/95" : "border-b border-white/[0.08] bg-iron-950/90 px-4"}`}>
        {screen !== "logger" && (
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 py-3">
            <button className="flex min-w-0 items-center gap-2.5 text-left" onClick={() => (screen === "today" ? setScreen("today") : navigateToScreen("today"))}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-volt text-iron-950">
                <Dumbbell className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">Iron Orbit</p>
                <p className="truncate text-xs text-iron-500">
                  {authMode === "cloud" && cloud.userEmail
                    ? `${currentUser.displayName} · ${cloud.userEmail}`
                    : `${currentUser.displayName} · Local only`}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <button
                className={`hidden rounded-full border px-3 py-1 text-xs font-bold sm:inline-flex ${
                  cloud.status === "synced"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : cloud.status === "syncing" || cloud.status === "hydrating"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                      : cloud.status === "failed"
                        ? "border-ember/30 bg-ember/10 text-orange-100"
                        : "border-white/10 bg-white/5 text-iron-300"
                }`}
                onClick={() => setScreen("settings")}
                title={cloud.message}
              >
                {renderCloudStatusLabel(cloud.status)}
              </button>
              {activeSession && (
                <button className="btn-primary hidden sm:inline-flex" onClick={() => void resumeWorkoutSession(activeSession.id)}>
                  <Timer className="h-4 w-4" />
                  Live
                </button>
              )}
              <button
                className="tap-highlight inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.02] text-iron-300 transition hover:bg-white/[0.06] hover:text-white"
                onClick={() => setScreen("settings")}
                aria-label="Open settings"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="native-sidebar">
          {navItems.map((item, index) => (
            <div key={item.id}>
              {index > 0 && <div className="native-divider" />}
              <button
                className={`relative flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                  screen === item.id
                    ? "font-semibold text-volt"
                    : "font-medium text-iron-400 hover:bg-white/[0.05] hover:text-iron-200"
                }`}
                onClick={() => navigateToScreen(item.id)}
              >
                {screen === item.id && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-volt" />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            </div>
          ))}
        </aside>

        <section className="min-w-0">
          {screen === "today" && (
            <TodayScreen
              db={db}
              user={currentUser}
              updateDb={updateDb}
              setScreen={setScreen}
              editingWeekNumber={editingWeekNumber}
              onPlanWeek={(n) => { setPlanWeekRequest(n); setScreen("week"); }}
              onResumeWorkout={resumeWorkoutSession}
              onOpenLoggerSession={openLoggerSession}
              onOpenCompletedSessionReview={openCompletedSessionReview}
              onOpenExerciseAnalytics={openExerciseAnalytics}
              resumeMessage={resumeMessage}
              clearResumeMessage={() => setResumeMessage(undefined)}
              todaySelectedDayId={todaySelectedDayId}
              setTodaySelectedDayId={setTodaySelectedDayId}
              todayWorkspaceMode={todayWorkspaceMode}
              onTodayWorkspaceModeChange={setTodayWorkspaceMode}
              offProgramBuilder={offProgramBuilder}
              setOffProgramBuilder={setOffProgramBuilder}
            />
          )}
          {screen === "logger" && (
            <LiveLogger
              db={db}
              user={currentUser}
              updateDb={updateDb}
              sessionId={activeSession?.id}
              setActiveSessionId={setActiveSessionId}
              setScreen={setScreen}
              navigation={loggerNavigation}
              onOpenCompletedSessionReview={openCompletedSessionReview}
            />
          )}
          {screen === "completed-review" && completedReviewState && (() => {
            const reviewSession = db.sessions.find((session) => session.id === completedReviewState.sessionId && session.userId === currentUser.id);
            if (!reviewSession) {
              return (
                <Panel title="Workout not found" icon={ShieldAlert}>
                  <EmptyState title="That workout could not be opened" detail="The session may have been deleted or changed." />
                  <button className="btn-secondary mt-4 w-full" onClick={() => setScreen(completedReviewState.returnScreen)}>
                    {completedReviewState.returnScreen === "week" ? "Back to Week" : "Back to Today"}
                  </button>
                </Panel>
              );
            }
            return (
              <CompletedWorkoutReview
                db={db}
                user={currentUser}
                session={reviewSession}
                onBack={() => setScreen(completedReviewState.returnScreen)}
                onOpenExerciseAnalytics={(exerciseId, exerciseName) => openExerciseAnalytics({
                  exerciseId,
                  exerciseName,
                  sessionId: reviewSession.id,
                  workoutDayId: reviewSession.workoutDayId,
                  returnScreen: "completed-review",
                  returnCompletedReviewState: completedReviewState,
                })}
                onEditWorkout={() => void resumeWorkoutSession(completedReviewState.sessionId, {
                  previousScreen: completedReviewState.returnScreen,
                  completedReviewState,
                  loggerMode: "completed-edit",
                })}
                backLabel={completedReviewState.returnScreen === "week" ? "Back to Week" : "Back to Today"}
              />
            );
          })()}
          {screen === "exercise-analytics" && exerciseAnalyticsState && (() => {
            const contextSession = exerciseAnalyticsState.sessionId
              ? db.sessions.find((session) => session.id === exerciseAnalyticsState.sessionId && session.userId === currentUser.id)
              : undefined;
            const contextDay = contextSession
              ? findWorkoutDayForSession(db, contextSession)
              : (exerciseAnalyticsState.workoutDayId
                ? db.programs
                  .flatMap((program) => program.blocks)
                  .flatMap((block) => block.weeks)
                  .flatMap((week) => week.workouts)
                  .find((day) => day.id === exerciseAnalyticsState.workoutDayId)
                : undefined);
            const exercise = exerciseAnalyticsState.exerciseId
              ? db.exercises.find((item) => item.id === exerciseAnalyticsState.exerciseId)
              : undefined;
            return (
              <ExerciseAnalyticsView
                db={db}
                user={currentUser}
                exercise={exercise}
                exerciseId={exerciseAnalyticsState.exerciseId}
                exerciseName={exerciseAnalyticsState.exerciseName}
                contextSession={contextSession}
                contextDay={contextDay}
                onBack={() => {
                  if (exerciseAnalyticsState.returnScreen === "completed-review" && exerciseAnalyticsState.returnCompletedReviewState) {
                    setCompletedReviewState(exerciseAnalyticsState.returnCompletedReviewState);
                    setScreen("completed-review");
                    return;
                  }
                  setScreen(exerciseAnalyticsState.returnScreen);
                }}
              />
            );
          })()}
          {screen === "programs" && <BuilderScreen db={db} user={currentUser} updateDb={updateDb} setScreen={setScreen} />}
          {screen === "library" && <LibraryScreen db={db} user={currentUser} updateDb={updateDb} authMode={authMode} cloudStatus={cloud.status} />}
          {screen === "week" && <WeekProgressScreen db={db} user={currentUser} setScreen={setScreen} planWeekRequest={planWeekRequest} onPlanWeekRequestHandled={() => setPlanWeekRequest(undefined)} editingWeekNumber={editingWeekNumber} onEditingWeekNumberChange={setEditingWeekNumber} updateDb={updateDb} onResumeWorkout={resumeWorkoutSession} onOpenCompletedSessionReview={openCompletedSessionReview} onOpenExerciseAnalytics={openExerciseAnalytics} />}
          {screen === "progress" && <ProgressScreen db={db} user={currentUser} updateDb={updateDb} />}
          {screen === "settings" && <SettingsScreen db={db} user={currentUser} updateDb={updateDb} importDb={importDb} reseed={reseed} cloud={cloud} authMode={authMode} />}
        </section>
      </main>

      <nav className={`safe-bottom fixed inset-x-0 bottom-0 z-40 px-3 py-3 lg:hidden ${screen === "logger" ? "hidden" : ""}`}>
        <div className="mx-auto max-w-md rounded-[1.15rem] border border-white/[0.08] bg-[#0b1018]/88 px-1.5 py-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-1">
            {mobileNavItems.map((item) => (
              <button
                key={item.id}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[0.9rem] px-1 text-[0.62rem] font-medium transition ${
                  screen === item.id ? "bg-[#101b2c] text-[#6ab2ff]" : "text-iron-500"
                }`}
                onClick={() => navigateToScreen(item.id)}
              >
                <item.icon className={`h-5 w-5 ${screen === item.id ? "text-[#6ab2ff]" : "text-iron-500"}`} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}

function TodayScreen({
  db,
  user,
  updateDb,
  setScreen,
  editingWeekNumber,
  onPlanWeek,
  onResumeWorkout,
  onOpenLoggerSession,
  onOpenCompletedSessionReview,
  onOpenExerciseAnalytics,
  resumeMessage,
  clearResumeMessage,
  todaySelectedDayId,
  setTodaySelectedDayId,
  todayWorkspaceMode,
  onTodayWorkspaceModeChange,
  offProgramBuilder,
  setOffProgramBuilder,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  setScreen: (screen: Screen) => void;
  editingWeekNumber?: number;
  onPlanWeek: (weekNumber: number) => void;
  onResumeWorkout: (
    sessionId?: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) => Promise<void> | void;
  onOpenLoggerSession: (
    sessionId: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) => void;
  onOpenCompletedSessionReview: (sessionId: string, returnScreen: CompletedReviewState["returnScreen"]) => void;
  onOpenExerciseAnalytics: (state: ExerciseAnalyticsState) => void;
  resumeMessage?: string;
  clearResumeMessage: () => void;
  todaySelectedDayId: string | null;
  setTodaySelectedDayId: (id: string | null) => void;
  todayWorkspaceMode: TodayWorkspaceMode;
  onTodayWorkspaceModeChange: (mode: TodayWorkspaceMode) => void;
  offProgramBuilder: OffProgramBuilderState;
  setOffProgramBuilder: React.Dispatch<React.SetStateAction<OffProgramBuilderState>>;
}) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const todayPlan = getCurrentWorkoutForUser(db, user.id);
  const selectedDay = todayPlan?.day;
  const activeBlock = activeProgram?.blocks[0];
  const selectedDaySession = selectedDay
    ? db.sessions.find((session) => session.userId === user.id && (session.status === "in-progress" || session.status === "review") && session.workoutDayId === selectedDay.id)
    : undefined;
  const recentCompletedSessions = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed" && (session.completedAt || session.updatedAt || "").startsWith(todayIso()))
    .sort((a, b) => (b.completedAt || b.updatedAt || b.startedAt).localeCompare(a.completedAt || a.updatedAt || a.startedAt))
    .slice(0, 3);
  const resumableSelectedDaySession = isSessionResumableOnTodayCard(db, user.id, selectedDaySession) ? selectedDaySession : undefined;
  const otherInProgressSession = selectedDay
    ? db.sessions.find((session) => {
        if (session.userId !== user.id || (session.status !== "in-progress" && session.status !== "review") || session.workoutDayId === selectedDay.id) return false;
        return isSessionResumableOnTodayCard(db, user.id, session);
      })
    : undefined;
  const [showEditDay, setShowEditDay] = useState(false);
  const [showPlanPreview, setShowPlanPreview] = useState(false);
  const [editDraft, setEditDraft] = useState<WorkoutDay | null>(null);
  const [showInlineAddExercise, setShowInlineAddExercise] = useState(false);
  const [activeEditExerciseId, setActiveEditExerciseId] = useState<string | null>(null);
  const [exerciseDetail, setExerciseDetail] = useState<TodayExerciseDetailState | null>(null);
  const todayPageClassName = "mx-auto max-w-[54rem] space-y-5 xl:mx-0";

  useEffect(() => {
    setShowEditDay(false);
    setShowPlanPreview(false);
    setEditDraft(null);
    setShowInlineAddExercise(false);
    setActiveEditExerciseId(null);
    setExerciseDetail(null);
  }, [selectedDay?.id]);

  useEffect(() => {
    if (!editDraft || !activeEditExerciseId) return;
    if (!editDraft.exercises.some((item) => item.id === activeEditExerciseId)) {
      setActiveEditExerciseId(null);
    }
  }, [editDraft, activeEditExerciseId]);

  function getGoBackCompletedSession(): WorkoutSession | undefined {
    if (!activeBlock || !selectedDay) return undefined;
    const orderedWorkoutDays = activeBlock.weeks
      .flatMap((week) => week.workouts)
      .filter((day) => day.status !== "rest");
    const currentIndex = orderedWorkoutDays.findIndex((day) => day.id === selectedDay.id);
    const priorWorkoutDayIds = new Set(
      orderedWorkoutDays
        .slice(0, currentIndex >= 0 ? currentIndex : orderedWorkoutDays.length)
        .map((day) => day.id)
    );
    const completedSessionsInBlock = db.sessions
      .filter((session) => session.userId === user.id && session.status === "completed" && session.blockId === activeBlock.id);

    const sameDayPriorSessions = completedSessionsInBlock
      .filter((session) => !!session.workoutDayId && priorWorkoutDayIds.has(session.workoutDayId))
      .filter((session) => (session.completedAt || session.updatedAt || "").startsWith(todayIso()))
      .sort((a, b) => (b.completedAt || b.updatedAt || b.startedAt).localeCompare(a.completedAt || a.updatedAt || a.startedAt));
    if (sameDayPriorSessions.length > 0) return sameDayPriorSessions[0];

    const priorSessions = completedSessionsInBlock
      .filter((session) => !!session.workoutDayId && priorWorkoutDayIds.has(session.workoutDayId))
      .sort((a, b) => (b.completedAt || b.updatedAt || b.startedAt).localeCompare(a.completedAt || a.updatedAt || a.startedAt));
    return priorSessions[0];
  }

  // Week-lock: Today is trainable only when the current week is saved/planned.
  const currentWeekNumber = selectedDay?.weekNumber ?? todayPlan?.week?.weekNumber ?? 1;
  const weekBeingEdited = editingWeekNumber !== undefined && editingWeekNumber === currentWeekNumber;
  const weekPlanned = isWeekPlanned(todayPlan?.week);
  const weekLocked = !!(selectedDay && (weekBeingEdited || isWeekDraft(todayPlan?.week) || !weekPlanned));

  // --- Today timeline: ordered workout days the user can navigate ---
  // Includes: interacted days (completed/skipped/in-progress) + all days of the current active
  // week when not locked, plus a plan-wall entry when the week is locked or block is complete.
  type TodayTimelineEntry = { type: "day"; dayId: string } | { type: "plan-wall" };
  const blockOrderedDays = (activeBlock?.weeks ?? [])
    .flatMap((week) => week.workouts)
    .filter((day) => day.status !== "rest");
  const doneDayIds = new Set([
    ...(activeBlock?.completedWorkoutDayIds ?? []),
    ...(activeBlock?.skippedWorkoutDayIds ?? []),
  ]);
  const inProgressBlockDayIds = new Set(
    db.sessions
      .filter(
        (s) =>
          s.userId === user.id &&
          s.blockId === activeBlock?.id &&
          (s.status === "in-progress" || s.status === "review")
      )
      .map((s) => s.workoutDayId)
      .filter((id): id is string => !!id)
  );
  const timelineDaySet = new Set<string>();
  blockOrderedDays.forEach((d) => {
    if (doneDayIds.has(d.id) || inProgressBlockDayIds.has(d.id)) timelineDaySet.add(d.id);
    if (!weekLocked && d.weekNumber === currentWeekNumber) timelineDaySet.add(d.id);
  });
  const timelineDays = blockOrderedDays.filter((d) => timelineDaySet.has(d.id));
  const todayTimeline: TodayTimelineEntry[] = [
    ...timelineDays.map((d): TodayTimelineEntry => ({ type: "day", dayId: d.id })),
    ...((!selectedDay || weekLocked) && !!activeProgram
      ? ([{ type: "plan-wall" }] as TodayTimelineEntry[])
      : []),
  ];
  // Current position in the timeline
  const todayCurrentEntry: TodayTimelineEntry = todaySelectedDayId
    ? { type: "day", dayId: todaySelectedDayId }
    : !selectedDay || weekLocked
      ? { type: "plan-wall" }
      : { type: "day", dayId: selectedDay.id };
  const currentTimelineIndex = todayTimeline.findIndex(
    (entry) =>
      entry.type === todayCurrentEntry.type &&
      (entry.type === "plan-wall" ||
        (entry as { type: "day"; dayId: string }).dayId ===
          (todayCurrentEntry as { type: "day"; dayId: string }).dayId)
  );
  const canGoBack = currentTimelineIndex > 0;
  const canGoNext =
    currentTimelineIndex >= 0 && currentTimelineIndex < todayTimeline.length - 1;
  // The workout day currently being displayed (may differ from the block's active day)
  const viewingDay = todaySelectedDayId
    ? (blockOrderedDays.find((d) => d.id === todaySelectedDayId) ?? selectedDay)
    : selectedDay;
  // The session for the viewing day (most recent relevant one)
  const viewingDaySession = viewingDay
    ? db.sessions.find(
        (s) =>
          s.workoutDayId === viewingDay.id &&
          s.userId === user.id &&
          (s.status === "completed" || s.status === "in-progress" || s.status === "review")
      )
    : undefined;
  const viewingDayIsCompleted = viewingDaySession?.status === "completed";
  const viewingDayIsInProgress =
    viewingDaySession?.status === "in-progress" || viewingDaySession?.status === "review";

  function handleTodayBack() {
    if (!canGoBack) return;
    const prev = todayTimeline[currentTimelineIndex - 1];
    if (prev.type === "day") setTodaySelectedDayId(prev.dayId);
  }

  function handleTodayNext() {
    if (!canGoNext) return;
    const next = todayTimeline[currentTimelineIndex + 1];
    // If the viewing day is in-progress (reopened but not finished), safely re-complete before
    // advancing so no data is lost and status is clean.
    if (todaySelectedDayId && viewingDayIsInProgress && viewingDaySession) {
      const sessionId = viewingDaySession.id;
      const dayId = todaySelectedDayId;
      void updateDb((draft) => {
        const target = draft.sessions.find((s) => s.id === sessionId);
        if (target) {
          target.status = "completed";
          target.completedAt = target.completedAt || nowIso();
          target.updatedAt = nowIso();
        }
        const targetProgram = draft.programs.find((p) => p.id === activeProgram?.id);
        const targetBlock = targetProgram?.blocks[0];
        if (targetBlock) {
          targetBlock.completedWorkoutDayIds = Array.from(
            new Set([...(targetBlock.completedWorkoutDayIds ?? []), dayId])
          );
          syncActiveBlockProgress(
            targetBlock,
            draft.sessions.filter(
              (s) => s.userId === user.id && s.blockId === targetBlock!.id
            )
          );
        }
        if (targetProgram) targetProgram.updatedAt = nowIso();
        return draft;
      });
    }
    // Navigate forward in the timeline
    if (next.type === "plan-wall") {
      setTodaySelectedDayId(null);
    } else if (next.dayId === selectedDay?.id && !weekLocked) {
      setTodaySelectedDayId(null); // Return to the current default day
    } else {
      setTodaySelectedDayId(next.dayId);
    }
  }

  // offProgramBuilder and setOffProgramBuilder come from App props — state lives in App
  // so it persists across TodayScreen unmount/remount on tab navigation.
  const [showOffProgramPicker, setShowOffProgramPicker] = useState(false);

  function startWorkout(day?: WorkoutDay) {
    if (!day) return;
    const sameDaySession = db.sessions.find((session) => session.userId === user.id && (session.status === "in-progress" || session.status === "review") && session.workoutDayId === day.id);
    if (sameDaySession) {
      void onResumeWorkout(sameDaySession.id);
      return;
    }
    // Check for any other in-progress/review session (different day) and confirm before archiving it
    const otherInProgress = db.sessions.find((session) => session.userId === user.id && (session.status === "in-progress" || session.status === "review") && session.workoutDayId !== day.id);
    if (otherInProgress) {
      const completedCount = otherInProgress.loggedExercises.flatMap((e) => e.sets).filter((s) => !s.skipped).length;
      if (!confirm(`Starting a new workout will archive the current in-progress session (${completedCount} completed set${completedCount !== 1 ? "s" : ""} saved). Continue?`)) return;
      void updateDb((draft) => {
        const target = draft.sessions.find((s) => s.id === otherInProgress.id);
        if (target) { target.status = "abandoned"; target.updatedAt = nowIso(); }
        return draft;
      });
      clearActiveWorkoutSessionDraft(user.id, otherInProgress.id);
    }
    const session: WorkoutSession = {
      id: createId("session"),
      userId: user.id,
      gymId: user.activeGymId,
      programId: activeProgram?.id,
      blockId: activeProgram?.blocks[0]?.id,
      workoutDayId: day.id,
      name: day.name,
      status: "in-progress",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      weekNumber: day.weekNumber,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      loggedExercises: day.exercises.map((exercise, index) => ({
        id: createId("logex"),
        exerciseId: exercise.exerciseId,
        plannedExerciseId: exercise.id,
        plannedExerciseSnapshot: clonePlannedExerciseSnapshot(exercise),
        order: index + 1,
        sets: [],
        weakPointTags: []
      })),
      recommendations: []
    };
    void updateDb((draft) => {
      draft.sessions.unshift(session);
      return draft;
    });
    onOpenLoggerSession(session.id, { previousScreen: "today" });
  }

  function updateActiveBlockProgress(action: "skip" | "rest-complete" | "next" | "previous") {
    if (!activeBlock) return;
    if (action === "skip" && selectedDay && !confirm(`Skip "${selectedDay.name}" and move to the next block day?`)) return;
    if (action === "previous") {
      const previousCompletedSession = getGoBackCompletedSession();
      if (previousCompletedSession) {
        onOpenCompletedSessionReview(previousCompletedSession.id, "today");
        return;
      }
    }
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === activeProgram?.id);
      const targetBlock = targetProgram?.blocks.find((block) => block.id === activeBlock.id) || targetProgram?.blocks[0];
      if (!targetBlock) return draft;
      if (action === "skip") {
        const skippedWorkoutDayId = selectedDay?.id;
        skipActiveWorkout(targetBlock, skippedWorkoutDayId);
        draft.sessions.forEach((session) => {
          if (
            skippedWorkoutDayId &&
            session.userId === user.id &&
            (session.status === "in-progress" || session.status === "review") &&
            session.workoutDayId === skippedWorkoutDayId
          ) {
            session.status = "abandoned";
            session.updatedAt = nowIso();
            session.notes = session.notes
              ? `${session.notes}\nSkipped workout; in-progress session archived.`
              : "Skipped workout; in-progress session archived.";
          }
        });
      }
      if (action === "rest-complete") markRestDayComplete(targetBlock, selectedDay?.id);
      if (action === "next") moveActiveBlockPointer(targetBlock, "next");
      if (action === "previous") moveActiveBlockPointer(targetBlock, "previous");
      syncActiveBlockProgress(targetBlock, draft.sessions.filter((session) => session.userId === user.id && session.blockId === targetBlock.id));
      if (targetProgram) targetProgram.updatedAt = nowIso();
      return draft;
    });
  }

  function goOffProgram() {
    // App-level state already holds any previous exercises; just activate the builder.
    setOffProgramBuilder((prev) => ({ ...prev, active: true }));
    setShowOffProgramPicker(false);
    onTodayWorkspaceModeChange("off-program-builder");
  }

  function finishActiveBlock() {
    if (!activeProgram) return;
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === activeProgram.id);
      if (targetProgram) {
        targetProgram.status = "archived";
        targetProgram.updatedAt = nowIso();
        targetProgram.changeLog ||= [];
        targetProgram.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Finished block", detail: "Archived after block completion." });
      }
      const targetUser = draft.users.find((item) => item.id === user.id);
      if (targetUser) {
        targetUser.activeProgramId = undefined;
        targetUser.activeBlockId = undefined;
      }
      return draft;
    });
    setScreen("programs");
  }

  function repeatActiveBlock() {
    if (!activeProgram) return;
    const clone = cloneProgramAsActive(activeProgram);
    void updateDb((draft) => {
      draft.programs.forEach((item) => {
        if (item.userId === user.id && item.status === "active") item.status = "archived";
      });
      draft.programs.unshift(clone);
      const targetUser = draft.users.find((item) => item.id === user.id);
      if (targetUser) {
        targetUser.activeProgramId = clone.id;
        targetUser.activeBlockId = clone.blocks[0]?.id;
      }
      draft.programGaps = analyzeProgramGaps(clone, draft);
      return draft;
    });
    setScreen("today");
  }

  function startOffProgramSession() {
    // Archive any existing in-progress session
    const otherInProgress = db.sessions.find((s) => s.userId === user.id && (s.status === "in-progress" || s.status === "review"));
    if (otherInProgress) {
      const completedCount = otherInProgress.loggedExercises.flatMap((e) => e.sets).filter((s) => !s.skipped).length;
      if (!confirm(`Starting a new workout will archive the current in-progress session (${completedCount} completed set${completedCount !== 1 ? "s" : ""} saved). Continue?`)) return;
      void updateDb((draft) => {
        const target = draft.sessions.find((s) => s.id === otherInProgress.id);
        if (target) { target.status = "abandoned"; target.updatedAt = nowIso(); }
        return draft;
      });
      clearActiveWorkoutSessionDraft(user.id, otherInProgress.id);
    }
    const session: WorkoutSession = {
      id: createId("session"),
      userId: user.id,
      gymId: user.activeGymId,
      name: "Off-Program Workout",
      status: "in-progress",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      loggedExercises: offProgramBuilder.exercises.map((item, index) => {
        const exercise = db.exercises.find((candidate) => candidate.id === item.exerciseId);
        const targetReps = item.targetReps || 8;
        const targetRpe = item.targetRpe || 7;
        const plannedWeight = item.plannedWeight ?? getOffProgramStartingWeight({ db, user, exercise, targetReps, targetRpe });
        return {
          id: createId("logex"),
          exerciseId: item.exerciseId,
          order: index + 1,
          sets: [],
          weakPointTags: [],
          offProgram: true,
          offProgramPlannedSets: buildOffProgramPlannedSets(item.targetSets || 3, targetReps, targetRpe, plannedWeight),
        };
      }),
      recommendations: [],
      offProgram: true,
    };
    void updateDb((draft) => {
      draft.sessions.unshift(session);
      return draft;
    });
    setOffProgramBuilder({ active: false, exercises: [] });
    onOpenLoggerSession(session.id, { previousScreen: "today" });
  }

  function beginInlineEdit() {
    if (!selectedDay) return;
    setShowPlanPreview(false);
    setShowInlineAddExercise(false);
    setEditDraft(structuredClone(selectedDay));
    setActiveEditExerciseId(null);
    setShowEditDay(true);
  }

  function cancelInlineEdit() {
    setShowEditDay(false);
    setEditDraft(null);
    setShowInlineAddExercise(false);
    setActiveEditExerciseId(null);
  }

  async function saveInlineEdit() {
    if (!activeProgram || !selectedDay || !editDraft) return;
    const draftCopy = structuredClone(editDraft);
    draftCopy.exercises = draftCopy.exercises.map((exercise, index) => ({
      ...exercise,
      order: index + 1,
      plannedSets: normalizeTodayInlinePlannedSets(exercise.plannedSets),
    }));
    await updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === activeProgram.id);
      const targetDay = targetProgram?.blocks
        .flatMap((block) => block.weeks)
        .flatMap((week) => week.workouts)
        .find((workout) => workout.id === selectedDay.id);
      if (targetProgram && targetDay) {
        Object.assign(targetDay, draftCopy);
        targetProgram.updatedAt = nowIso();
        targetProgram.changeLog ||= [];
        targetProgram.changeLog.unshift({
          id: createId("change"),
          at: nowIso(),
          label: "Edited workout day",
          detail: `Updated ${draftCopy.name}.`,
        });
        draft.programGaps = analyzeProgramGaps(targetProgram, draft);
      }
      return draft;
    });
    setShowEditDay(false);
    setEditDraft(null);
    setShowInlineAddExercise(false);
    setActiveEditExerciseId(null);
  }

  function openExerciseDetail(plannedExerciseId: string, fromEditMode = false) {
    const sourceDay = showEditDay && editDraft ? editDraft : selectedDay;
    const planned = sourceDay?.exercises.find((item) => item.id === plannedExerciseId)
      || selectedDay?.exercises.find((item) => item.id === plannedExerciseId);
    const exercise = planned ? db.exercises.find((item) => item.id === planned.exerciseId) : undefined;
    if (planned && exercise) {
      onOpenExerciseAnalytics({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sessionId: selectedDaySession?.id,
        workoutDayId: selectedDay?.id,
        returnScreen: "today",
      });
      return;
    }
    setExerciseDetail({ plannedExerciseId, fromEditMode });
  }

  if (offProgramBuilder.active) {
    return (
      <div className={todayPageClassName}>
        <PageTitle eyebrow="Off-Program Builder" title="Build your individual workout before starting." />
        <section className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-volt">Selected exercises</p>
              <p className="text-xs text-iron-400">Tap an exercise below to add it. Weight targets come from your training history.</p>
            </div>
            <button className="btn-ghost" onClick={() => { setOffProgramBuilder({ active: false, exercises: [] }); onTodayWorkspaceModeChange("scheduled-overview"); }}>Cancel</button>
          </div>
          {offProgramBuilder.exercises.length > 0 ? (
            <div className="mb-4 space-y-3">
              {offProgramBuilder.exercises.map((item, idx) => {
                const ex = db.exercises.find((e) => e.id === item.exerciseId);
                const suggestedWeight = getOffProgramStartingWeight({ db, user, exercise: ex, targetReps: item.targetReps, targetRpe: item.targetRpe });
                const lastLog = getLatestExercisePerformanceLog(db, user.id, item.exerciseId);
                const exDisplayUnit = getExerciseDisplayUnit(ex, user);
                return (
                  <div key={item.exerciseId} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{idx + 1}. {ex?.name}</p>
                        {lastLog && <p className="text-xs text-iron-400">Last logged: {lastLog.weight} {lastLog.unit ?? exDisplayUnit} × {lastLog.reps}</p>}
                        {suggestedWeight ? <p className="text-xs text-volt">Starting weight: {suggestedWeight} {exDisplayUnit}</p> : <p className="text-xs text-iron-500">No saved starting weight yet.</p>}
                      </div>
                      <button className="btn-ghost text-orange-200 text-xs" onClick={() => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.filter((_, i) => i !== idx) }))}>Remove</button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[0.65rem] font-medium text-iron-500">Sets</p>
                        <input className="field mt-1 py-1 text-center text-sm" type="number" min={1} value={item.targetSets} onChange={(e) => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.map((ex2, i) => i === idx ? { ...ex2, targetSets: Math.max(1, Number(e.target.value) || 1) } : ex2) }))} />
                      </div>
                      <div>
                        <p className="text-[0.65rem] font-medium text-iron-500">Reps</p>
                        <input className="field mt-1 py-1 text-center text-sm" type="number" min={1} value={item.targetReps} onChange={(e) => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.map((ex2, i) => i === idx ? { ...ex2, targetReps: Math.max(1, Number(e.target.value) || 1) } : ex2) }))} />
                      </div>
                      <div>
                        <p className="text-[0.65rem] font-medium text-iron-500">RPE</p>
                        <input className="field mt-1 py-1 text-center text-sm" type="number" min={1} max={10} step={0.5} value={item.targetRpe} onChange={(e) => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.map((ex2, i) => i === idx ? { ...ex2, targetRpe: Math.min(10, Math.max(1, Number(e.target.value) || 7)) } : ex2) }))} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mb-4 text-sm text-iron-400">No exercises added yet. Search below to add some.</p>
          )}
          <button className="btn-ghost mb-3 w-full" onClick={() => setShowOffProgramPicker((v) => !v)}>
            <Plus className="h-4 w-4" /> {showOffProgramPicker ? "Hide Exercise Search" : "Add Exercise"}
          </button>
          {showOffProgramPicker && (
            <div className="mb-4 rounded-lg border border-white/10 bg-iron-950/45 p-3">
              <ExercisePicker
                db={db}
                user={user}
                updateDb={updateDb}
                selectedIds={offProgramBuilder.exercises.map((e) => e.exerciseId)}
                alreadyAddedIds={offProgramBuilder.exercises.map((e) => e.exerciseId)}
                onPick={(exercise) => {
                  if (offProgramBuilder.exercises.some((e) => e.exerciseId === exercise.id)) return;
                  const suggestedWeight = getOffProgramStartingWeight({ db, user, exercise, targetReps: 8, targetRpe: 7 });
                  setOffProgramBuilder((b) => ({
                    ...b,
                    exercises: [...b.exercises, { exerciseId: exercise.id, targetSets: 3, targetReps: 8, targetRpe: 7, plannedWeight: suggestedWeight }],
                  }));
                }}
              />
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="btn-primary"
              disabled={offProgramBuilder.exercises.length === 0}
              onClick={startOffProgramSession}
            >
              <Timer className="h-4 w-4" />
              Start Workout ({offProgramBuilder.exercises.length} exercise{offProgramBuilder.exercises.length !== 1 ? "s" : ""})
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                const session: WorkoutSession = {
                  id: createId("session"),
                  userId: user.id,
                  gymId: user.activeGymId,
                  name: "Off-Program Workout",
                  status: "in-progress",
                  startedAt: nowIso(),
                  updatedAt: nowIso(),
                  currentExerciseIndex: 0,
                  currentSetIndex: 0,
                  loggedExercises: [],
                  recommendations: [],
                  offProgram: true,
                };
                void updateDb((draft) => { draft.sessions.unshift(session); return draft; });
                setOffProgramBuilder({ active: false, exercises: [] });
                onOpenLoggerSession(session.id, { previousScreen: "today" });
              }}
            >
              Start Empty Session
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (exerciseDetail && selectedDay) {
    const detailSourceDay = showEditDay && editDraft ? editDraft : selectedDay;
    const planned = detailSourceDay.exercises.find((item) => item.id === exerciseDetail.plannedExerciseId)
      || selectedDay.exercises.find((item) => item.id === exerciseDetail.plannedExerciseId);
    const exercise = planned ? db.exercises.find((item) => item.id === planned.exerciseId) : undefined;
    if (planned && exercise) {
      return (
        <div className={todayPageClassName}>
          <TodayExerciseDetailView
            db={db}
            user={user}
            day={selectedDay}
            planned={planned}
            exercise={exercise}
            onBack={() => setExerciseDetail(null)}
            onEditExercise={() => {
              setExerciseDetail(null);
              if (!showEditDay) beginInlineEdit();
              setActiveEditExerciseId(planned.id);
            }}
          />
        </div>
      );
    }
    return (
      <div className={todayPageClassName}>
        <section className="space-y-4">
          <button className="inline-flex items-center gap-2 text-sm text-iron-400 transition hover:text-iron-100" onClick={() => setExerciseDetail(null)}>
            <ChevronLeft className="h-4 w-4" />
            Back to Today
          </button>
          <Panel title="Exercise not found" icon={ShieldAlert}>
            <EmptyState title="That exercise could not be opened" detail="The workout may have changed while you were editing." />
          </Panel>
        </section>
      </div>
    );
  }

  return (
    <div className={todayPageClassName}>
      {resumeMessage && (
        <section className="rounded-lg border border-ember/40 bg-ember/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-orange-50">Workout could not be resumed</p>
              <p className="mt-1 text-sm text-orange-100">{resumeMessage}</p>
            </div>
            <button className="btn-ghost shrink-0" onClick={clearResumeMessage}>Dismiss</button>
          </div>
        </section>
      )}
      {!activeProgram && (
        <Panel title="No Active Block" icon={CalendarDays}>
          <EmptyState title="No active block yet" detail="Build and activate a block before starting scheduled training." />
          <button className="btn-primary mt-4 w-full" onClick={() => setScreen("programs")}>Open Block Builder</button>
          <button className="btn-secondary mt-2 w-full" onClick={goOffProgram}>
            <Shuffle className="h-4 w-4" />
            Start Individual Workout
          </button>
        </Panel>
      )}
      {/* Selected workout from timeline — user navigated Back/Next to a specific day */}
      {activeProgram && todaySelectedDayId && viewingDay && (
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-[1.95rem] font-semibold tracking-[-0.045em] text-white sm:text-[2.2rem]">Today</p>
            <h2 className="text-[1.22rem] font-semibold tracking-[-0.03em] text-iron-100 sm:text-[1.42rem]">
              {viewingDay.name}
            </h2>
            <p className="text-sm text-iron-500">
              {[
                `Week ${viewingDay.weekNumber ?? "?"}`,
                `Day ${viewingDay.dayIndex ?? "?"}`,
                viewingDay.focus,
              ]
                .filter(Boolean)
                .join(" · ")}
              {viewingDayIsCompleted && (
                <span className="ml-2 text-xs font-semibold text-emerald-400">Completed</span>
              )}
              {viewingDayIsInProgress && (
                <span className="ml-2 text-xs font-semibold text-amber-400">In Progress</span>
              )}
            </p>
          </div>

          {/* Primary action */}
          {viewingDaySession ? (
            <button
              className="apollo-primary-btn w-full sm:w-auto"
              onClick={() =>
                void onResumeWorkout(viewingDaySession.id, {
                  previousScreen: "today",
                  loggerMode: viewingDayIsCompleted ? "completed-edit" : "active-logger",
                })
              }
            >
              {viewingDayIsInProgress ? "Resume" : "Resume / Edit"}
            </button>
          ) : (
            <button
              className="apollo-primary-btn w-full sm:w-auto"
              onClick={() => startWorkout(viewingDay)}
            >
              Start
            </button>
          )}

          {/* Navigation row */}
          <div className="compact-actions">
            {canGoBack && (
              <button className="btn-compact" onClick={handleTodayBack}>← Back</button>
            )}
            {canGoNext && (
              <button className="btn-compact" onClick={handleTodayNext}>Next Day →</button>
            )}
            {viewingDayIsCompleted && viewingDaySession && (
              <button
                className="btn-compact"
                onClick={() => onOpenCompletedSessionReview(viewingDaySession.id, "today")}
              >
                View Results
              </button>
            )}
            <button className="btn-compact ml-auto" onClick={() => setTodaySelectedDayId(null)}>
              Current Day
            </button>
          </div>

          {/* Exercise list (read-only reference) */}
          {viewingDay.exercises.length > 0 && (
            <div className="mt-1">
              <div className="flex items-center justify-between pb-1.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">
                  Workout
                </p>
                <p className="text-xs text-iron-500">
                  {viewingDay.exercises.length} exercises ·{" "}
                  {viewingDay.exercises.reduce((sum, ex) => sum + ex.plannedSets.length, 0)} sets
                </p>
              </div>
              <div className="list-section overflow-hidden rounded-sm">
                {viewingDay.exercises.map((planned, idx) => {
                  const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
                  const rpeText = planned.plannedSets[0]?.targetRpe
                    ? ` · RPE ${planned.plannedSets[0].targetRpe}`
                    : "";
                  const openFromList = () => {
                    onOpenExerciseAnalytics({
                      exerciseId: planned.exerciseId,
                      exerciseName: exercise?.name || "Exercise",
                      sessionId: viewingDaySession?.id,
                      workoutDayId: viewingDay.id,
                      returnScreen: "today",
                    });
                  };
                  return (
                    <div key={planned.id}>
                      {idx > 0 && <div className="list-divider" />}
                      <div
                        className="list-row cursor-pointer transition hover:bg-white/[0.03]"
                        onClick={openFromList}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openFromList();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open exercise analytics for ${exercise?.name || "exercise"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="native-row-title">
                            {exercise?.name ?? "Unknown exercise"}
                          </p>
                          <p className="native-row-subtitle">
                            {planned.plannedSets.length} set{planned.plannedSets.length !== 1 ? "s" : ""}
                            {planned.plannedSets[0]?.targetReps
                              ? ` · ${planned.plannedSets[0].targetReps} reps`
                              : ""}
                            {rpeText}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {activeProgram && !selectedDay && !todaySelectedDayId && (
        <Panel title="Block Complete" icon={CheckCircle2}>
          <EmptyState
            title="This block is complete"
            detail="All planned training days in the active block are done or skipped. Review it, archive it, repeat it, or start a new block."
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary w-full" onClick={() => setScreen("week")}>Review Block</button>
            <button className="btn-secondary w-full" onClick={finishActiveBlock}>Archive Block / Finish Block</button>
            <button className="btn-secondary w-full" onClick={repeatActiveBlock}>Repeat Block</button>
            <button className="btn-primary w-full" onClick={() => setScreen("programs")}>Start New Block</button>
          </div>
          <button className="btn-secondary mt-2 w-full" onClick={goOffProgram}>
            <Shuffle className="h-4 w-4" />
            Go Off Program
          </button>
        </Panel>
      )}
      {/* Week locked: current week is being planned — hide workout card entirely */}
      {activeProgram && selectedDay && weekLocked && !todaySelectedDayId && (
        <section className="panel border-amber-500/20 p-4">
          <p className="text-xs font-semibold text-amber-400">Week {currentWeekNumber} not ready</p>
          <h2 className="mt-1 font-semibold">{isWeekDraft(todayPlan?.week) || weekBeingEdited ? "Planning in progress" : "Plan this week before training"}</h2>
          <p className="mt-1 text-sm text-iron-400">
            Finish planning and save Week {currentWeekNumber} before starting this workout.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="apollo-primary-btn" onClick={() => onPlanWeek(currentWeekNumber)}>
              <CalendarDays className="h-4 w-4" /> Plan Week {currentWeekNumber}
            </button>
            <button className="apollo-secondary-btn" onClick={goOffProgram}>
              <Shuffle className="h-3.5 w-3.5" /> Off Program
            </button>
          </div>
          {canGoBack && (
            <div className="compact-actions">
              <button className="btn-compact" onClick={handleTodayBack}>← Back</button>
            </div>
          )}
        </section>
      )}
      {/* Week ready: show normal workout card */}
      {activeProgram && selectedDay && !weekLocked && !todaySelectedDayId && (
        (() => {
          const latestReadiness = [...db.readiness]
            .filter((item) => item.userId === user.id)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
          const readiness = resumableSelectedDaySession?.readiness ?? latestReadiness;
          const dayNumber = selectedDay.dayIndex || (todayPlan ? todayPlan.dayIndex + 1 : 1);
          const plannedExerciseCount = selectedDay.exercises.length;
          const activeExerciseIndex = resumableSelectedDaySession?.currentExerciseIndex ?? 0;
          const metadata = [
            `Week ${todayPlan?.week?.weekNumber ?? currentWeekNumber}`,
            `Day ${dayNumber}`,
            selectedDay.focus,
            plannedExerciseCount ? `~${estimateWorkoutDuration(selectedDay)} min` : null,
          ].filter(Boolean).join(" · ");
          const readinessMetrics = [
            {
              key: "sleep",
              label: "Sleep",
              state: readiness ? ["Poor", "Fair", "Good", "Great", "Excellent"][Math.max(0, Math.min(4, readiness.sleepQuality - 1))] : "No check-in",
              value: readiness ? `${readiness.sleepQuality}/5` : "—",
            },
            {
              key: "stress",
              label: "Stress",
              state: readiness ? ["Low", "Steady", "Medium", "High", "Very high"][Math.max(0, Math.min(4, readiness.stress - 1))] : "No check-in",
              value: readiness ? `${readiness.stress}/5` : "—",
            },
            {
              key: "soreness",
              label: "Soreness",
              state: readiness ? ["None", "Mild", "Moderate", "High", "Severe"][Math.max(0, Math.min(4, readiness.soreness - 1))] : "No check-in",
              value: readiness ? `${readiness.soreness}/5` : "—",
            },
            {
              key: "motivation",
              label: "Motivation",
              state: readiness ? ["Low", "Steady", "Good", "High", "All in"][Math.max(0, Math.min(4, readiness.motivation - 1))] : "No check-in",
              value: readiness ? `${readiness.motivation}/5` : "—",
            },
          ];
          const readinessStatus = readiness ? "baseline" : "awaiting check-in";
          const showInlineEditActions = selectedDay.status !== "rest" && selectedDay.exercises.length > 0;
          const displayDay = showEditDay && editDraft ? editDraft : selectedDay;
          const displayExerciseCount = displayDay.exercises.length;
          const displaySetCount = displayDay.exercises.reduce((sum, exercise) => sum + exercise.plannedSets.length, 0);

          return (
            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[1.95rem] font-semibold tracking-[-0.045em] text-white sm:text-[2.2rem]">Today</p>
                <h2 className="text-[1.22rem] font-semibold tracking-[-0.03em] text-iron-100 sm:text-[1.42rem]">
                  {selectedDay.name}
                </h2>
                <p className="text-sm text-iron-500">{metadata}</p>
              </div>

              {selectedDay.status === "rest" ? (
                <button
                  className="apollo-primary-btn w-full sm:w-auto"
                  onClick={() => updateActiveBlockProgress("rest-complete")}
                >
                  Mark Rest
                </button>
              ) : selectedDay.exercises.length ? (
                <button
                  className="apollo-primary-btn w-full sm:w-auto"
                  onClick={() => startWorkout(selectedDay)}
                >
                  Resume
                </button>
              ) : (
                <button
                  className="apollo-primary-btn w-full sm:w-auto"
                  onClick={() => onPlanWeek(currentWeekNumber)}
                >
                  Plan Week
                </button>
              )}

              <div className="border-b border-white/[0.07] pb-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-iron-500">
                  <button className="transition hover:text-iron-100" onClick={handleTodayBack}>Back</button>
                  <span className="text-iron-700">|</span>
                  <button className="transition hover:text-iron-100" onClick={handleTodayNext}>Next Day</button>
                  <span className="text-iron-700">|</span>
                  <button className="text-orange-300 transition hover:text-orange-200" onClick={() => updateActiveBlockProgress("skip")}>Skip</button>
                  {showInlineEditActions && (
                    <>
                      <span className="text-iron-700">|</span>
                      <button className="transition hover:text-iron-100" onClick={() => {
                        if (showEditDay) {
                          cancelInlineEdit();
                          return;
                        }
                        beginInlineEdit();
                      }}>
                        Edit
                      </button>
                      <span className="text-iron-700">|</span>
                      <button className="transition hover:text-iron-100" onClick={goOffProgram}>Off Program</button>
                    </>
                  )}
                </div>
                {otherInProgressSession && (
                  <button
                    className="mt-2 text-xs text-iron-500 transition hover:text-iron-200"
                    onClick={() => void onResumeWorkout(otherInProgressSession.id, { previousScreen: "today" })}
                  >
                    Resume other workout
                  </button>
                )}
              </div>

              {selectedDay.exercises.length > 0 && (
                <>
                  <div className="space-y-2 border-b border-white/[0.06] pb-2">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">Workout</p>
                    <div className="flex items-center justify-between gap-3 text-sm text-iron-400">
                      <p>{displayExerciseCount} exercises · {displaySetCount} sets</p>
                    {showEditDay ? (
                      <div className="flex items-center gap-3 text-xs">
                        <button className="text-[#6ab2ff] transition hover:text-[#8fc4ff]" onClick={() => void saveInlineEdit()}>
                          Save changes
                        </button>
                        <button className="text-iron-500 transition hover:text-iron-200" onClick={cancelInlineEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="inline-flex items-center gap-1 text-xs text-iron-500 transition hover:text-iron-200"
                        onClick={() => setShowPlanPreview((value) => !value)}
                      >
                        {showPlanPreview ? "Hide details" : "Show details"}
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showPlanPreview ? "rotate-90" : ""}`} />
                      </button>
                    )}
                    </div>
                  </div>

                  {!showEditDay && !showPlanPreview && (
                    <section className="overflow-hidden border-b border-white/[0.08] bg-transparent">
                      {selectedDay.exercises.map((planned, index) => {
                        const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
                        const latestHistory = getLatestExercisePerformanceLog(db, user.id, planned.exerciseId);
                        const displayUnit = getExerciseDisplayUnit(
                          exercise,
                          user,
                          isWeightUnit(latestHistory?.unit) ? latestHistory.unit : undefined,
                        );
                        const recommendation = getExerciseRecommendation({
                          db,
                          user,
                          exercise,
                          plannedSet: planned.plannedSets[0],
                          readiness,
                          goal: user.goal,
                          gymId: user.activeGymId,
                        });
                        const weightLabel = getPlannedExerciseBadgeText({
                          exercise,
                          displayUnit,
                          recommendationWeight: recommendation?.recommendedWeight,
                          plannedWeight: planned.plannedSets[0]?.plannedWeight,
                        });
                        const repTargets = planned.plannedSets
                          .map((set) => set.targetReps)
                          .filter((value): value is number => typeof value === "number" && value > 0);
                        const repMin = repTargets.length ? Math.min(...repTargets) : undefined;
                        const repMax = repTargets.length ? Math.max(...repTargets) : undefined;
                        const prescription = `${planned.plannedSets.length} sets${repMin ? ` · ${repMin}${repMax && repMax !== repMin ? `-${repMax}` : ""} reps` : ""}`;
                        const isActiveExercise = activeExerciseIndex === index;

                        return (
                          <button
                            key={planned.id}
                            className={`group relative flex w-full items-center gap-3 px-0 py-3 text-left transition ${index > 0 ? "border-t border-white/[0.06]" : ""} ${isActiveExercise ? "bg-[#0d1522]/55" : "hover:bg-white/[0.02]"}`}
                            onClick={() => openExerciseDetail(planned.id)}
                          >
                            <span className={`absolute inset-y-2 left-0 w-[2px] ${isActiveExercise ? "bg-[#0a84ff]" : "bg-transparent group-hover:bg-[#0a84ff]/45"}`} />
                            <div className="min-w-0 flex-1 pl-4 pr-2">
                              <p className="truncate text-sm font-medium text-iron-100 sm:text-[0.97rem]">{exercise?.name || "Exercise"}</p>
                              <p className="mt-0.5 text-xs text-iron-500">{prescription}</p>
                            </div>
                            <div className="flex items-center gap-3 pl-2 pr-1">
                              <p className="text-right text-sm font-semibold text-iron-200">{weightLabel || "—"}</p>
                              <ChevronRight className="h-4 w-4 text-iron-700 transition group-hover:text-iron-500" />
                            </div>
                          </button>
                        );
                      })}
                    </section>
                  )}

                  {!showEditDay && showPlanPreview && (
                    <section className="overflow-hidden border-b border-white/[0.08] bg-transparent">
                      {selectedDay.exercises.map((planned, index) => {
                        const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
                        const latestHistory = getLatestExercisePerformanceLog(db, user.id, planned.exerciseId);
                        const displayUnit = getExerciseDisplayUnit(
                          exercise,
                          user,
                          isWeightUnit(latestHistory?.unit) ? latestHistory.unit : undefined,
                        );
                        const recommendation = getExerciseRecommendation({
                          db,
                          user,
                          exercise,
                          plannedSet: planned.plannedSets[0],
                          readiness,
                          goal: user.goal,
                          gymId: user.activeGymId,
                        });
                        const weightLabel = getPlannedExerciseBadgeText({
                          exercise,
                          displayUnit,
                          recommendationWeight: recommendation?.recommendedWeight,
                          plannedWeight: planned.plannedSets[0]?.plannedWeight,
                        });
                        const recent = getLatestExercisePreviewHistory(db, user, exercise, displayUnit);
                        const repTargets = planned.plannedSets
                          .map((set) => set.targetReps)
                          .filter((value): value is number => typeof value === "number" && value > 0);
                        const repMin = repTargets.length ? Math.min(...repTargets) : undefined;
                        const repMax = repTargets.length ? Math.max(...repTargets) : undefined;
                        const targetRpe = planned.plannedSets[0]?.targetRpe;
                        const detailLine = [
                          `${planned.plannedSets.length} sets`,
                          repMin ? `${repMin}${repMax && repMax !== repMin ? `-${repMax}` : ""} reps` : undefined,
                          targetRpe ? `RPE ${targetRpe}` : undefined,
                        ].filter(Boolean).join(" · ");
                        const contextLine = [
                          formatExerciseRoleLabel(planned.exerciseRole),
                          formatFatigueTagLabel(planned.fatigueTag ?? (exercise ? getExerciseFatigueTag(exercise) : undefined)),
                        ].filter(Boolean).join(" · ");
                        const recentLine = recent
                          ? `Recent: ${formatExerciseLoadText({ exercise, user, weight: recent.weight, unit: recent.unit })} × ${recent.reps}${recent.rpe ? ` @ ${recent.rpe}` : ""}`
                          : "No recent history";

                        return (
                          <button
                            key={planned.id}
                            className={`w-full px-0 py-3 text-left transition hover:bg-white/[0.02] ${index > 0 ? "border-t border-white/[0.06]" : ""}`}
                            onClick={() => openExerciseDetail(planned.id)}
                          >
                            <div className="flex items-start justify-between gap-4 pl-4 pr-1">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-iron-100 sm:text-[0.97rem]">{exercise?.name || "Exercise"}</p>
                                <p className="mt-0.5 text-xs text-iron-400">{detailLine}</p>
                                <p className="mt-1 text-xs text-iron-500">{recentLine}</p>
                                {contextLine && <p className="mt-1 text-xs text-iron-600">{contextLine}</p>}
                              </div>
                              <p className="shrink-0 text-right text-sm font-semibold text-iron-200">{weightLabel || "—"}</p>
                            </div>
                          </button>
                        );
                      })}
                    </section>
                  )}

                  {showEditDay && editDraft && (
                    <section className="overflow-hidden border-b border-white/[0.08] bg-transparent">
                      {editDraft.exercises.map((planned, index) => {
                        const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
                        const latestHistory = getLatestExercisePerformanceLog(db, user.id, planned.exerciseId);
                        const displayUnit = getExerciseDisplayUnit(
                          exercise,
                          user,
                          isWeightUnit(latestHistory?.unit) ? latestHistory.unit : undefined,
                        );
                        const weightValue = planned.plannedSets[0]?.plannedWeight;
                        const isExpanded = activeEditExerciseId === planned.id;
                        return (
                          <div key={planned.id} className={`px-4 py-3.5 ${index > 0 ? "border-t border-white/[0.06]" : ""}`}>
                            <button
                              className="flex w-full items-center gap-3 text-left transition hover:bg-white/[0.02]"
                              onClick={() => setActiveEditExerciseId((current) => current === planned.id ? null : planned.id)}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-iron-100">{exercise?.name || "Exercise"}</p>
                                <p className="mt-0.5 text-xs text-iron-500">
                                  {planned.plannedSets.length} sets · {planned.plannedSets[0]?.targetReps || 8} reps
                                </p>
                              </div>
                              <div className="flex items-center gap-3 pl-2">
                                <p className="text-right text-sm font-semibold text-iron-200">{weightValue ? `${formatWeight(weightValue, displayUnit)} ${displayUnit}` : "—"}</p>
                                <ChevronRight className={`h-4 w-4 text-iron-700 transition ${isExpanded ? "rotate-90 text-iron-500" : ""}`} />
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="mt-3 border-t border-white/[0.06] pt-3">
                                <div className="mb-3 flex items-center justify-end">
                                  <button
                                    className="text-xs text-orange-300 transition hover:text-orange-200"
                                    onClick={() => {
                                      if (!confirm("Remove exercise from this workout?")) return;
                                      setEditDraft((current) => current ? ({
                                        ...current,
                                        exercises: current.exercises
                                          .filter((item) => item.id !== planned.id)
                                          .map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })),
                                      }) : current);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                  <TodayInlineStepper
                                    label="Sets"
                                    value={planned.plannedSets.length}
                                    min={1}
                                    step={1}
                                    onChange={(nextValue) => setEditDraft((current) => current ? ({
                                      ...current,
                                      exercises: current.exercises.map((item) => item.id === planned.id
                                        ? { ...item, plannedSets: resizeTodayInlinePlannedSets(item.plannedSets, Math.max(1, Math.round(nextValue))) }
                                        : item),
                                    }) : current)}
                                  />
                                  <TodayInlineNumberField
                                    label="Reps"
                                    value={planned.plannedSets[0]?.targetReps || 8}
                                    min={1}
                                    step={1}
                                    onChange={(nextValue) => setEditDraft((current) => current ? ({
                                      ...current,
                                      exercises: current.exercises.map((item) => item.id === planned.id
                                        ? { ...item, plannedSets: item.plannedSets.map((set) => ({ ...set, targetReps: Math.max(1, Math.round(nextValue)) })) }
                                        : item),
                                    }) : current)}
                                  />
                                  <TodayInlineNumberField
                                    label="RPE"
                                    value={planned.plannedSets[0]?.targetRpe || 7}
                                    min={1}
                                    max={10}
                                    step={0.5}
                                    onChange={(nextValue) => setEditDraft((current) => current ? ({
                                      ...current,
                                      exercises: current.exercises.map((item) => item.id === planned.id
                                        ? { ...item, plannedSets: item.plannedSets.map((set) => ({ ...set, targetRpe: sanitizeRpe(nextValue) })) }
                                        : item),
                                    }) : current)}
                                  />
                                  <TodayInlineNumberField
                                    label="Weight"
                                    value={weightValue ?? ""}
                                    min={0}
                                    step={displayUnit === "kg" ? 2.5 : 5}
                                    suffix={exercise ? displayUnit : undefined}
                                    placeholder="—"
                                    onChange={(nextValue) => setEditDraft((current) => current ? ({
                                      ...current,
                                      exercises: current.exercises.map((item) => item.id === planned.id
                                        ? {
                                            ...item,
                                            plannedSets: item.plannedSets.map((set) => ({
                                              ...set,
                                              plannedWeight: nextValue <= 0 ? undefined : nextValue,
                                            })),
                                          }
                                        : item),
                                    }) : current)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="border-t border-white/[0.06] px-4 py-3">
                        <button
                          className="text-sm text-[#6ab2ff] transition hover:text-[#8fc4ff]"
                          onClick={() => setShowInlineAddExercise((value) => !value)}
                        >
                          + Add exercise
                        </button>
                      </div>
                      {showInlineAddExercise && (
                        <div className="border-t border-white/[0.06] bg-[#09101a] px-4 py-4">
                          <ExercisePicker
                            db={db}
                            user={user}
                            updateDb={updateDb}
                            alreadyAddedIds={editDraft.exercises.map((item) => item.exerciseId)}
                            variant="week-inline"
                            title="Add exercise"
                            onClose={() => setShowInlineAddExercise(false)}
                            onPick={(exercise) => {
                              const planned = buildPlannedExerciseFromExercise({
                                db,
                                user,
                                program: activeProgram,
                                day: editDraft,
                                exercise,
                                order: editDraft.exercises.length + 1,
                              });
                              setEditDraft((current) => current ? ({
                                ...current,
                                exercises: [
                                  ...current.exercises,
                                  {
                                    ...planned,
                                    plannedSets: normalizeTodayInlinePlannedSets(planned.plannedSets),
                                  },
                                ],
                              }) : current);
                              setShowInlineAddExercise(false);
                            }}
                          />
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}

              <section className="space-y-2.5">
                <div className="space-y-1">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">Readiness</p>
                  <p className="text-base font-semibold text-iron-100">
                    {readiness ? `${readiness.readinessScore}/100` : "No check-in"}
                    <span className="ml-2 text-sm font-medium text-iron-500">· {readinessStatus}</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 overflow-hidden border border-white/[0.07] bg-[#0a1018] sm:grid-cols-4">
                  {readinessMetrics.map((metric, index) => (
                    <div
                      key={metric.key}
                      className={`px-4 py-3 ${index >= 2 ? "border-t border-white/[0.06] sm:border-t-0" : ""} ${index % 2 === 1 ? "border-l border-white/[0.06] sm:border-l-0" : ""} ${index > 0 ? "sm:border-l sm:border-white/[0.06]" : ""}`}
                    >
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-iron-600">{metric.label}</p>
                      <p className="mt-2 text-sm font-medium text-iron-100">{metric.state}</p>
                      <p className="mt-1 text-xs text-iron-500">{metric.value}</p>
                    </div>
                  ))}
                </div>
                {!readiness && <p className="text-xs text-iron-600">Readiness will appear here after your next check-in.</p>}
              </section>

              {recentCompletedSessions.length > 0 && (
                <section className="rounded-sm border border-white/[0.06] bg-white/[0.03] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Completed Today</p>
                  <div className="mt-3 space-y-2">
                    {recentCompletedSessions.map((session) => (
                      <button
                        key={session.id}
                        className="flex w-full items-center justify-between gap-3 rounded-sm border border-white/[0.05] bg-white/[0.02] px-3 py-3 text-left transition hover:bg-white/[0.05]"
                        onClick={() => onOpenCompletedSessionReview(session.id, "today")}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-iron-100">{session.name}</p>
                          <p className="mt-1 text-xs text-iron-500">
                            {formatDateTime(session.completedAt || session.updatedAt || session.startedAt)} · {countSessionCompletedSets(session)} sets
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-iron-600" />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </section>
          );
        })()
      )}
    </div>
  );
}

function normalizeTodayInlinePlannedSets(plannedSets: PlannedSet[]): PlannedSet[] {
  const normalized = plannedSets.length ? plannedSets : [{ id: createId("pset"), kind: "working" as const, targetReps: 8, targetRpe: 7 }];
  return normalized.map((set, index) => ({
    ...set,
    id: set.id || createId("pset"),
    kind: set.kind || "working",
    setNumber: index + 1,
    targetReps: Math.max(1, Math.round(set.targetReps || 8)),
    targetRpe: sanitizeRpe(set.targetRpe || 7),
  }));
}

function resizeTodayInlinePlannedSets(plannedSets: PlannedSet[], count: number): PlannedSet[] {
  const normalized = normalizeTodayInlinePlannedSets(plannedSets);
  const base = normalized[0];
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    ...(normalized[index] || { ...base, id: createId("pset") }),
    id: normalized[index]?.id || createId("pset"),
    setNumber: index + 1,
  }));
}

function formatExerciseRoleLabel(role?: ExerciseRole): string | undefined {
  if (!role) return undefined;
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFatigueTagLabel(tag?: string): string | undefined {
  if (!tag) return undefined;
  return `${tag} fatigue`;
}

function TodayInlineStepper({
  label,
  value,
  min = 1,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (nextValue: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-iron-500">{label}</p>
      <div className="flex min-h-10 items-center justify-between border border-white/[0.08] bg-[#09101a] px-2">
        <button
          className="tap-highlight inline-flex h-8 w-8 items-center justify-center text-iron-400 transition hover:bg-white/[0.06] hover:text-iron-100"
          onClick={() => onChange(Math.max(min, value - step))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-iron-100">{value}</span>
        <button
          className="tap-highlight inline-flex h-8 w-8 items-center justify-center text-iron-400 transition hover:bg-white/[0.06] hover:text-iron-100"
          onClick={() => onChange(value + step)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TodayInlineNumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder,
}: {
  label: string;
  value: number | string;
  onChange: (nextValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-iron-500">{label}</p>
      <div className="flex min-h-10 items-center gap-2 border border-white/[0.08] bg-[#09101a] px-3">
        <input
          className="w-full bg-transparent text-sm text-iron-100 outline-none placeholder:text-iron-600"
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
        />
        {suffix && <span className="shrink-0 text-xs text-iron-500">{suffix}</span>}
      </div>
    </label>
  );
}

function TodayExerciseDetailView({
  db,
  user,
  day,
  planned,
  exercise,
  onBack,
  onEditExercise,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  day: WorkoutDay;
  planned: PlannedExercise;
  exercise: Exercise;
  onBack: () => void;
  onEditExercise: () => void;
}) {
  const latestHistory = getLatestExercisePerformanceLog(db, user.id, exercise.id);
  const displayUnit = getExerciseDisplayUnit(
    exercise,
    user,
    isWeightUnit(latestHistory?.unit) ? latestHistory.unit : undefined,
  );
  const historyEntries = collectExerciseHistoryEntries({ db, user, exerciseIds: [exercise.id] });
  const recentHistory = getLatestExercisePreviewHistory(db, user, exercise, displayUnit);
  const bestRecentE1rm = Math.max(
    0,
    ...historyEntries.map((entry) => getEntryDisplayValues(entry, displayUnit).e1rm || 0),
  );
  const detailSets = planned.plannedSets;
  const repTargets = detailSets.map((set) => set.targetReps).filter((value): value is number => value > 0);
  const repMin = repTargets.length ? Math.min(...repTargets) : undefined;
  const repMax = repTargets.length ? Math.max(...repTargets) : undefined;
  const targetRpe = detailSets[0]?.targetRpe;
  const targetWeight = getPlannedExerciseBadgeText({
    exercise,
    displayUnit,
    plannedWeight: detailSets[0]?.plannedWeight,
  });

  const recentLoggedSets = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed")
    .flatMap((session) =>
      session.loggedExercises
        .filter((logged) => logged.exerciseId === exercise.id)
        .flatMap((logged) =>
          logged.sets
            .filter((set) => isCompletedValidSet(set))
            .map((set) => ({
              id: `${session.id}:${logged.id}:${set.id}`,
              date: set.completedAt || session.completedAt || session.startedAt,
              label: new Date(set.completedAt || session.completedAt || session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              set,
            }))
        )
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const avgFeel = recentLoggedSets.length
    ? (recentLoggedSets.reduce((sum, item) => sum + setRatingNumeric(item.set.setRating), 0) / recentLoggedSets.length).toFixed(1)
    : undefined;
  const avgRpe = recentLoggedSets.length
    ? safeAverageRpe(recentLoggedSets.map((item) => item.set))
    : undefined;
  const hardSets = recentLoggedSets.filter((item) => isHardSet(item.set)).length;
  const chartPoints = historyEntries
    .filter((entry) => (getEntryDisplayValues(entry, displayUnit).e1rm || 0) > 0)
    .map((entry) => ({
      label: entry.label,
      value: getEntryDisplayValues(entry, displayUnit).e1rm as number,
      date: entry.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="space-y-4">
      <button className="inline-flex items-center gap-2 text-sm text-iron-400 transition hover:text-iron-100" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" />
        Today
      </button>

      <div className="space-y-1">
        <h2 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-iron-100">{exercise.name}</h2>
        <p className="text-sm text-iron-500">
          {day.name} · Week {day.weekNumber} Day {day.dayIndex || 1} · {day.focus}
        </p>
      </div>

      <section className="space-y-2 border-b border-white/[0.06] pb-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">Planned today</p>
        <p className="text-sm text-iron-200">
          {detailSets.length} sets
          {repMin ? ` · ${repMin}${repMax && repMax !== repMin ? `-${repMax}` : ""} reps` : ""}
          {targetRpe ? ` · RPE ${targetRpe}` : ""}
        </p>
        <p className="text-sm text-iron-500">Target: {targetWeight || "—"}</p>
      </section>

      <section className="space-y-2 border-b border-white/[0.06] pb-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">Recent</p>
        {recentHistory ? (
          <>
            <p className="text-sm text-iron-200">
              Last: {formatExerciseLoadText({ exercise, user, weight: recentHistory.weight, unit: recentHistory.unit })} × {recentHistory.reps}
              {recentHistory.rpe ? ` @ ${recentHistory.rpe}` : ""}
            </p>
            <p className="text-sm text-iron-500">
              Best recent e1RM: {bestRecentE1rm > 0 ? `${formatWeight(bestRecentE1rm, displayUnit)} ${displayUnit}` : "No recent e1RM"}
            </p>
          </>
        ) : (
          <p className="text-sm text-iron-500">No recent history yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">History</p>
        {recentLoggedSets.length > 0 ? (
          <div className="overflow-hidden border border-white/[0.07] bg-[#0a1018]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[0.68rem] text-iron-600">
                    <th className="px-4 py-2 font-medium">Set</th>
                    <th className="px-4 py-2 font-medium">Load</th>
                    <th className="px-4 py-2 font-medium">Reps</th>
                    <th className="px-4 py-2 font-medium">RPE</th>
                    <th className="px-4 py-2 font-medium">Feel</th>
                    <th className="px-4 py-2 font-medium">e1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoggedSets.map((item) => (
                    <tr key={item.id} className="border-t border-white/[0.05]">
                      <td className="px-4 py-2 text-iron-400">{item.label}</td>
                      <td className="px-4 py-2 text-iron-200">{formatExerciseLoadText({ exercise, user, weight: item.set.actualWeight, unit: item.set.unit || displayUnit })}</td>
                      <td className="px-4 py-2 text-iron-200">{item.set.actualReps}</td>
                      <td className="px-4 py-2 text-iron-200">{item.set.actualRpe || "—"}</td>
                      <td className="px-4 py-2 text-iron-200">{item.set.setRating ? `${item.set.setRating}/5` : "—"}</td>
                      <td className="px-4 py-2 text-iron-200">
                        {calculateE1RMFromSet(item.set) ? `${formatWeight(calculateE1RMFromSet(item.set) || 0, item.set.unit || displayUnit)} ${item.set.unit || displayUnit}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : historyEntries.length > 0 ? (
          <div className="overflow-hidden border border-white/[0.07] bg-[#0a1018]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[0.68rem] text-iron-600">
                    <th className="px-4 py-2 font-medium">Set</th>
                    <th className="px-4 py-2 font-medium">Load</th>
                    <th className="px-4 py-2 font-medium">Reps</th>
                    <th className="px-4 py-2 font-medium">RPE</th>
                    <th className="px-4 py-2 font-medium">Feel</th>
                    <th className="px-4 py-2 font-medium">e1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEntries.slice(0, 8).map((entry) => {
                    const displayValues = getEntryDisplayValues(entry, displayUnit);
                    return (
                      <tr key={entry.id} className="border-t border-white/[0.05]">
                        <td className="px-4 py-2 text-iron-400">{entry.label}</td>
                        <td className="px-4 py-2 text-iron-200">{formatExerciseLoadText({ exercise, user, weight: displayValues.weight ?? entry.weight, unit: displayUnit })}</td>
                        <td className="px-4 py-2 text-iron-200">{entry.reps ?? "—"}</td>
                        <td className="px-4 py-2 text-iron-200">{entry.rpe ?? "—"}</td>
                        <td className="px-4 py-2 text-iron-500">—</td>
                        <td className="px-4 py-2 text-iron-200">{displayValues.e1rm ? `${formatWeight(displayValues.e1rm, displayUnit)} ${displayUnit}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-iron-500">No recent history yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">Ratings</p>
        {recentLoggedSets.length > 0 ? (
          <div className="grid grid-cols-3 overflow-hidden border border-white/[0.07] bg-[#0a1018]">
            <div className="px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-iron-600">Average feel</p>
              <p className="mt-2 text-sm font-medium text-iron-100">{avgFeel ? `${avgFeel}/5` : "—"}</p>
            </div>
            <div className="border-l border-white/[0.06] px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-iron-600">Average RPE</p>
              <p className="mt-2 text-sm font-medium text-iron-100">{avgRpe ? avgRpe.toFixed(1) : "—"}</p>
            </div>
            <div className="border-l border-white/[0.06] px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-iron-600">Hard sets</p>
              <p className="mt-2 text-sm font-medium text-iron-100">{hardSets}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-iron-500">No ratings yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">e1RM Trend</p>
        {chartPoints.length >= 2 ? (
          <ExerciseE1rmChart points={chartPoints.map(({ label, value }) => ({ label, value }))} unit={displayUnit} title="e1RM trend" strokeColor="#0a84ff" />
        ) : (
          <div className="border border-white/[0.07] bg-[#0a1018] px-4 py-4 text-sm text-iron-500">
            Not enough data for chart yet.
          </div>
        )}
      </section>

      {(exercise.notes || exercise.description) && (
        <section className="space-y-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-600">Notes</p>
          <div className="border border-white/[0.07] bg-[#0a1018] px-4 py-4 text-sm text-iron-300">
            {exercise.notes || exercise.description}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="btn-secondary" onClick={onEditExercise}>Edit exercise</button>
        <button className="btn-secondary" onClick={onBack}>Back to Today</button>
      </div>
    </section>
  );
}

function LiveLogger({
  db,
  user,
  updateDb,
  sessionId,
  setActiveSessionId,
  setScreen,
  navigation,
  onOpenCompletedSessionReview
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  sessionId?: string;
  setActiveSessionId: (id: string | undefined) => void;
  setScreen: (screen: Screen) => void;
  navigation: LoggerNavigationState;
  onOpenCompletedSessionReview: (sessionId: string, returnScreen: CompletedReviewState["returnScreen"]) => void;
}) {
  const LOGGER_DEBUG = false;
  const sessionRecord = db.sessions.find((item) => item.id === sessionId && item.userId === user.id);
  const storedSessionDraft = useMemo(
    () => loadActiveWorkoutSessionDraft(user.id, sessionId),
    [sessionId, user.id]
  );
  const [activeExerciseId, setActiveExerciseId] = useState(
    storedSessionDraft?.activeExerciseId
    || sessionRecord?.loggedExercises[sessionRecord.currentExerciseIndex || 0]?.id
    || sessionRecord?.loggedExercises[0]?.id
  );
  const resumeState = useMemo(
    () => resolveWorkoutResumeState(db, user.id, sessionId, activeExerciseId, true),
    [activeExerciseId, db, sessionId, user.id]
  );
  const session = resumeState.kind === "ready" || resumeState.kind === "no-exercises" ? resumeState.session : sessionRecord;
  const editingCompletedWorkout = navigation.loggerMode === "completed-edit";
  const preserveCompletedStatus = (target?: WorkoutSession) => editingCompletedWorkout && target?.status === "completed";
  const finishWorkoutLabel = editingCompletedWorkout ? "Save Workout" : "Finish Workout";
  const confirmLeaveCompletedEdit = () => {
    if (!editingCompletedWorkout || !draftDirty) return true;
    return confirm("Leave editing? Unsaved changes may be lost.");
  };
  const backToToday = () => {
    if (!confirmLeaveCompletedEdit()) return;
    setActiveSessionId(undefined);
    setScreen("today");
  };
  const backToSummary = () => {
    if (!confirmLeaveCompletedEdit()) return;
    if (navigation.completedReviewState && sessionId) {
      onOpenCompletedSessionReview(sessionId, navigation.completedReviewState.returnScreen);
      return;
    }
    setActiveSessionId(undefined);
    setScreen(navigation.previousScreen);
  };
  const activeExerciseLog = resumeState.kind === "ready"
    ? session?.loggedExercises[resumeState.activeExerciseIndex]
    : session?.loggedExercises.find((item) => item.id === activeExerciseId) || session?.loggedExercises[session.currentExerciseIndex || 0] || session?.loggedExercises[0];
  const activeExerciseIndex = resumeState.kind === "ready"
    ? resumeState.activeExerciseIndex
    : session?.loggedExercises.findIndex((item) => item.id === activeExerciseLog?.id) ?? 0;
  const exercise = db.exercises.find((item) => item.id === activeExerciseLog?.exerciseId);
  const foundPlanned = findPlannedExercise(db, session, activeExerciseLog);
  // Synthesize a PlannedExercise for off-program exercises that have offProgramPlannedSets
  const planned = foundPlanned ?? (activeExerciseLog?.offProgramPlannedSets?.length
    ? { id: "", exerciseId: activeExerciseLog.exerciseId, required: false, order: 0, plannedSets: activeExerciseLog.offProgramPlannedSets, restSeconds: 90, substitutionIds: [] } as PlannedExercise
    : undefined);
  const plannedSets = getLoggedExercisePlannedSets(activeExerciseLog, planned);
  const currentSetIndex = resumeState.kind === "ready"
    ? Math.min(resumeState.currentSetIndex, plannedSets.length)
    : activeExerciseLog ? getResumeSetIndex(activeExerciseLog, plannedSets) : 0;
  const [selectedLoggingIndex, setSelectedLoggingIndex] = useState<number | null>(null);
  const [focusedActualSetId, setFocusedActualSetId] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const lineupItems = useMemo(
    () => activeExerciseLog ? buildLoggerLineupItems(activeExerciseLog, plannedSets) : [],
    [activeExerciseLog, plannedSets]
  );
  const activeActualSetId = editingSetId ?? focusedActualSetId;
  const selectedActualLineupItem = activeActualSetId ? lineupItems.find((item) => item.actualSet?.id === activeActualSetId) : undefined;
  const editingLineupItem = editingSetId ? selectedActualLineupItem : undefined;
  const effectiveSetIndex = selectedActualLineupItem
    ? (selectedActualLineupItem.plannedIndex ?? currentSetIndex)
    : (selectedLoggingIndex ?? currentSetIndex);
  const currentPlannedSet = selectedActualLineupItem?.plannedSet ?? plannedSets[effectiveSetIndex];
  const lastSet = activeExerciseLog?.sets.at(-1);
  const selectedActualSet = selectedActualLineupItem?.actualSet;
  const previousCompletedSet = activeExerciseLog ? findPreviousCompletedSet(activeExerciseLog.sets, effectiveSetIndex) : undefined;
  const draftKey = selectedActualSet
    ? `${editingSetId ? "edit" : "view"}:${selectedActualSet.id}`
    : `${activeExerciseLog?.id || "none"}:${effectiveSetIndex}`;
  const [setDraft, setSetDraft] = useState(() => buildDraftFromSet({
    actualSet: selectedActualSet,
    plannedSet: currentPlannedSet,
    previousCompletedSet,
    draftKey,
  }));
  const [draftDirty, setDraftDirty] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showAddExercisePicker, setShowAddExercisePicker] = useState(false);
  const [showSkipExerciseConfirm, setShowSkipExerciseConfirm] = useState(false);
  const [showSetNotes, setShowSetNotes] = useState(storedSessionDraft?.showSetNotes ?? false);
  const [showCompletionSummary, setShowCompletionSummary] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<{ score: number; status: string; hardSets: number; skippedSets: number; completedSets: number; suggestions: string[] } | null>(null);
  const [pendingRemoveExerciseLogId, setPendingRemoveExerciseLogId] = useState<string | null>(null);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<{ actualSetId?: string; plannedSetId?: string; lineupKey: string } | null>(null);
  const [openSwipeSetId, setOpenSwipeSetId] = useState<string | undefined>();
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  });
  const SWIPE_DELETE_WIDTH = 96;
  const SWIPE_OPEN_THRESHOLD = 52;
  // swipeDrag: visual drag state — only set after horizontal gesture confirmed, drives translateX + delete opacity.
  const [swipeDrag, setSwipeDrag] = useState<{ setId: string; offsetX: number } | null>(null);
  // swipeGestureRef: raw gesture tracking — mutated directly, never triggers re-renders, invisible to rendering.
  const swipeGestureRef = useRef<{
    setId: string;
    startX: number;
    startY: number;
    initialOffset: number;
    mode: "undecided" | "horizontal" | "vertical";
    currentOffsetX: number;
  } | null>(null);
  const [pendingOffProgramExercise, setPendingOffProgramExercise] = useState<Exercise | undefined>();
  const [recentlyAppliedRecommendationKey, setRecentlyAppliedRecommendationKey] = useState<string | null>(null);
  const setLineupRef = useRef<HTMLDivElement | null>(null);
  const skipSetLongPressTriggeredRef = useRef(false);
  const swipeSkipHoldTimerRef = useRef<number | null>(null);
  // Prevents the synthesized click that fires after touchend from immediately closing a just-opened swipe row.
  const swipeJustOpenedRef = useRef(false);
  const [setContextMenuId, setSetContextMenuId] = useState<string | null>(null);
  const [exerciseContextMenuId, setExerciseContextMenuId] = useState<string | null>(null);
  const exerciseLongPressTimerRef = useRef<number | null>(null);
  const pendingUiDraftHydrationRef = useRef<string | null>(sessionId || null);
  const activeGym = db.gyms.find((gym) => gym.id === session?.gymId && gym.userId === user.id);
  const compatibleMachines = activeGym?.machines.filter((machine) => machine.exerciseIds.includes(activeExerciseLog?.exerciseId || "") || !machine.exerciseIds.length) || [];
  const [readinessDraft, setReadinessDraft] = useState<ReadinessFormDraft>(() => normalizeReadinessDraft(storedSessionDraft?.readinessDraft));

  const activeLoggerProgram = db.programs.find((p) => p.id === session?.programId && p.userId === user.id);
  const activeLoggerBlock = activeLoggerProgram?.blocks.find((b) => b.id === session?.blockId);
  const weightRec = getExerciseRecommendation({
    db,
    user,
    exercise,
    plannedSet: currentPlannedSet,
    readiness: session?.readiness,
    blockType: activeLoggerBlock?.type,
    goal: activeLoggerProgram?.goal || activeLoggerBlock?.goal || user.goal,
    gymId: session?.gymId,
  });
  const selectionDraftSeed = useMemo(() => buildDraftFromSet({
    actualSet: selectedActualSet,
    plannedSet: currentPlannedSet,
    previousCompletedSet,
    draftKey,
  }), [currentPlannedSet, draftKey, previousCompletedSet, selectedActualSet]);

  function persistActiveWorkoutDraftImmediately(
    overrides: Partial<ActiveWorkoutSessionDraft> & {
      activeExerciseId?: string;
      activeSetActualId?: string | null;
      activeSetPlannedId?: string | null;
      activeSetPlannedIndex?: number | null;
      selectionMode?: ActiveWorkoutSessionDraft["selectionMode"];
      setDraft?: LoggerSetDraftState;
      draftDirty?: boolean;
      showSetNotes?: boolean;
      readinessDraft?: ReadinessFormDraft;
    } = {}
  ) {
    if (!session?.id || pendingUiDraftHydrationRef.current === session.id) return;
    const snapshot: ActiveWorkoutSessionDraft = {
      sessionId: session.id,
      workoutDayId: session.workoutDayId,
      activeExerciseId: overrides.activeExerciseId ?? activeExerciseId,
      activeSetActualId: overrides.activeSetActualId ?? (editingSetId ?? selectedActualSet?.id ?? null),
      activeSetPlannedId: overrides.activeSetPlannedId ?? (selectedActualLineupItem?.plannedSet?.id ?? currentPlannedSet?.id ?? null),
      activeSetPlannedIndex: overrides.activeSetPlannedIndex ?? (selectedActualLineupItem?.plannedIndex ?? (selectedLoggingIndex ?? effectiveSetIndex)),
      selectionMode: overrides.selectionMode ?? (editingSetId ? "editing" : selectedActualSet?.id ? "actual" : "planned"),
      setDraft: overrides.setDraft ?? setDraft,
      draftDirty: overrides.draftDirty ?? draftDirty,
      showSetNotes: overrides.showSetNotes ?? showSetNotes,
      readinessDraft: overrides.readinessDraft ?? readinessDraft,
      lastLocalMutationAt: nowIso(),
    };
    saveActiveWorkoutSessionDraft(user.id, session.id, snapshot);
  }

  function updateSetDraftImmediately(
    updater: LoggerSetDraftState | ((current: LoggerSetDraftState) => LoggerSetDraftState),
    options?: {
      draftDirty?: boolean;
      clearRecommendation?: boolean;
      showSetNotes?: boolean;
    }
  ) {
    const nextDirty = options?.draftDirty ?? true;
    if (options?.clearRecommendation !== false) setRecentlyAppliedRecommendationKey(null);
    setSetDraft((current) => {
      const nextDraft = typeof updater === "function" ? updater(current) : updater;
      persistActiveWorkoutDraftImmediately({
        setDraft: nextDraft,
        draftDirty: nextDirty,
        showSetNotes: options?.showSetNotes,
      });
      return nextDraft;
    });
    setDraftDirty(nextDirty);
  }

  function updateReadinessDraftImmediately(
    updater: ReadinessFormDraft | ((current: ReadinessFormDraft) => ReadinessFormDraft)
  ) {
    setReadinessDraft((current) => {
      const nextDraft = typeof updater === "function" ? updater(current) : updater;
      persistActiveWorkoutDraftImmediately({ readinessDraft: nextDraft });
      return nextDraft;
    });
  }

  useEffect(() => {
    pendingUiDraftHydrationRef.current = sessionId || null;
  }, [sessionId]);

  useEffect(() => {
    if (!session?.id || pendingUiDraftHydrationRef.current !== session.id) return;
    const storedDraft = loadActiveWorkoutSessionDraft(user.id, session.id);
    const normalizedReadinessDraft = normalizeReadinessDraft(storedDraft?.readinessDraft);

    if (!storedDraft) {
      setReadinessDraft(normalizedReadinessDraft);
      setShowSetNotes(false);
      setDraftDirty(false);
      setSetDraft(selectionDraftSeed);
      pendingUiDraftHydrationRef.current = null;
      return;
    }

    if (
      storedDraft.activeExerciseId
      && session.loggedExercises.some((item) => item.id === storedDraft.activeExerciseId)
      && storedDraft.activeExerciseId !== activeExerciseLog?.id
    ) {
      setActiveExerciseId(storedDraft.activeExerciseId);
      return;
    }

    setReadinessDraft(normalizedReadinessDraft);

    let resolvedSelection = false;
    if (storedDraft.selectionMode === "editing" && storedDraft.activeSetActualId) {
      const target = lineupItems.find((item) => item.actualSet?.id === storedDraft.activeSetActualId);
      if (target?.actualSet) {
        setEditingSetId(target.actualSet.id);
        setFocusedActualSetId(target.actualSet.id);
        setSelectedLoggingIndex(null);
        resolvedSelection = true;
      }
    }

    if (!resolvedSelection && storedDraft.selectionMode === "actual" && storedDraft.activeSetActualId) {
      const target = lineupItems.find((item) => item.actualSet?.id === storedDraft.activeSetActualId);
      if (target?.actualSet) {
        setEditingSetId(null);
        setFocusedActualSetId(target.actualSet.id);
        setSelectedLoggingIndex(null);
        resolvedSelection = true;
      }
    }

    if (!resolvedSelection) {
      const target = lineupItems.find((item) => {
        if (storedDraft.activeSetPlannedId && item.plannedSet?.id === storedDraft.activeSetPlannedId) return true;
        return storedDraft.activeSetPlannedIndex !== undefined
          && storedDraft.activeSetPlannedIndex !== null
          && item.plannedIndex === storedDraft.activeSetPlannedIndex;
      });
      if (target?.plannedIndex !== undefined) {
        setEditingSetId(null);
        setFocusedActualSetId(null);
        setSelectedLoggingIndex(target.plannedIndex);
        resolvedSelection = true;
      }
    }

    if (storedDraft.draftDirty && storedDraft.setDraft && resolvedSelection) {
      setSetDraft(storedDraft.setDraft);
      setDraftDirty(true);
      setShowSetNotes(storedDraft.showSetNotes ?? !!storedDraft.setDraft.notes);
    } else {
      setDraftDirty(false);
      setSetDraft(selectionDraftSeed);
      setShowSetNotes(storedDraft.showSetNotes ?? false);
    }

    pendingUiDraftHydrationRef.current = null;
  }, [activeExerciseLog?.id, lineupItems, selectionDraftSeed, session, sessionId, user.id]);

  function loggerDebugSnapshot() {
    const activeExerciseName = exercise?.name || "(unknown)";
    const setIds = plannedSets.map((set) => set.id);
    const effectiveItem = lineupItems.find((item) => item.plannedIndex === effectiveSetIndex || item.actualSet?.id === activeActualSetId);
    return {
      sessionId: session?.id,
      activeExerciseId,
      activeExerciseIndex,
      activeExerciseName,
      activeSetId: selectedActualSet?.id ?? null,
      activeSetIndex: effectiveSetIndex,
      plannedSetIds: setIds,
      plannedSetCount: plannedSets.length,
      actualSetIds: liveExerciseLog?.sets.map((set) => set.id) || [],
      actualSetCount: liveExerciseLog?.sets.length || 0,
      currentSetIndex,
      selectedLoggingIndex,
      focusedActualSetId,
      editingSetId,
      dirty: draftDirty,
      primaryActionLabel,
      primaryAction: derivedPrimaryAction,
      effectiveLineupKey: effectiveItem?.key,
      sessionStatus: session?.status,
    };
  }

  function loggerDebug(label: string, extra?: Record<string, unknown>) {
    if (!LOGGER_DEBUG) return;
    console.log(`[LOGGER_DEBUG] ${label}`, { ...loggerDebugSnapshot(), ...(extra || {}) });
  }

  const needsRuntimePlannedSetNormalization = !!session?.id && session.loggedExercises.some((log) => {
    const hasProgramPlannedExercise = !!findPlannedExercise(db, session, log);
    if (hasProgramPlannedExercise) return false;
    const needsNormalization = !log.offProgramPlannedSets?.length
      || log.offProgramPlannedSets.some((set, index) => !set.id || set.setNumber !== index + 1);
    return needsNormalization;
  });
  const needsPlannedExerciseSnapshotBackfill = !!session?.id && session.loggedExercises.some((log) => {
    if (!log.plannedExerciseId || log.plannedExerciseSnapshot) return false;
    return !!findLivePlannedExercise(db, session, log);
  });

  useEffect(() => {
    if (!session?.id || !needsPlannedExerciseSnapshotBackfill) return;
    loggerDebug("BACKFILL_PLANNED_EXERCISE_SNAPSHOTS_START");
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === session.id);
      if (!target) return draft;
      let changed = false;
      target.loggedExercises.forEach((log) => {
        if (!log.plannedExerciseId || log.plannedExerciseSnapshot) return;
        const livePlanned = findLivePlannedExercise(draft, target, log);
        if (!livePlanned) return;
        log.plannedExerciseSnapshot = clonePlannedExerciseSnapshot(livePlanned);
        changed = true;
      });
      if (changed) target.updatedAt = nowIso();
      return draft;
    });
    loggerDebug("BACKFILL_PLANNED_EXERCISE_SNAPSHOTS_END");
  }, [needsPlannedExerciseSnapshotBackfill, session, updateDb]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
    const syncSwipeCapability = () => setIsSwipeEnabled(mediaQuery.matches);
    syncSwipeCapability();
    mediaQuery.addEventListener("change", syncSwipeCapability);
    return () => mediaQuery.removeEventListener("change", syncSwipeCapability);
  }, []);

  useEffect(() => {
    if (draftDirty) return;
    loggerDebug("HYDRATE_ACTIVE_SET_START", { source: "selectionDraftSeed" });
    setSetDraft(selectionDraftSeed);
    setShowSetNotes(false);
    loggerDebug("HYDRATE_ACTIVE_SET_END", { source: "selectionDraftSeed" });
  }, [draftDirty, selectionDraftSeed]);

  useEffect(() => {
    loggerDebug("DIRTY_STATE_CHANGE", { dirty: draftDirty });
  }, [draftDirty]);

  useEffect(() => {
    loggerDebug("ACTIVE_SET_CHANGE", {
      activeSetId: selectedActualSet?.id ?? null,
      effectiveSetIndex,
      selectedLoggingIndex,
      focusedActualSetId,
      editingSetId,
    });
  }, [selectedActualSet?.id, effectiveSetIndex, selectedLoggingIndex, focusedActualSetId, editingSetId]);

  useEffect(() => {
    if (!session?.id || pendingUiDraftHydrationRef.current === session.id) return;
    const selectionMode: ActiveWorkoutSessionDraft["selectionMode"] = editingSetId
      ? "editing"
      : selectedActualSet?.id
        ? "actual"
        : "planned";
    const snapshot: ActiveWorkoutSessionDraft = {
      sessionId: session.id,
      workoutDayId: session.workoutDayId,
      activeExerciseId,
      activeSetActualId: editingSetId ?? selectedActualSet?.id ?? null,
      activeSetPlannedId: selectedActualLineupItem?.plannedSet?.id ?? currentPlannedSet?.id ?? null,
      activeSetPlannedIndex: selectedActualLineupItem?.plannedIndex ?? (selectedLoggingIndex ?? effectiveSetIndex),
      selectionMode,
      setDraft,
      draftDirty,
      showSetNotes,
      readinessDraft,
      lastLocalMutationAt: nowIso(),
    };
    saveActiveWorkoutSessionDraft(user.id, session.id, snapshot);
  }, [
    activeExerciseId,
    currentPlannedSet?.id,
    draftDirty,
    editingSetId,
    effectiveSetIndex,
    readinessDraft,
    selectedActualLineupItem?.plannedIndex,
    selectedActualLineupItem?.plannedSet?.id,
    selectedActualSet?.id,
    selectedLoggingIndex,
    session?.id,
    session?.workoutDayId,
    setDraft,
    showSetNotes,
    user.id,
  ]);

  useEffect(() => {
    const ref = swipeSkipHoldTimerRef;
    return () => {
      if (ref.current !== null) window.clearTimeout(ref.current);
    };
  }, []);

  useEffect(() => {
    setRecentlyAppliedRecommendationKey(null);
  }, [draftKey]);

  useEffect(() => {
    loggerDebug("ACTIVE_EXERCISE_CHANGE", { effect: "reset-ui-on-activeExerciseId" });
    // Reset set navigation and UI state when switching exercises
    setSelectedLoggingIndex(null);
    setFocusedActualSetId(null);
    setEditingSetId(null);
    setDraftDirty(false);
    setPendingDeleteTarget(null);
    setShowSetNotes(false);
    setShowSkipExerciseConfirm(false);
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
  }, [activeExerciseId]);

  useEffect(() => {
    loggerDebug("EFFECT_SESSION_ID_CHANGE_START", { effect: "reset-ui-on-sessionId" });
    setPendingDeleteTarget(null);
    setSelectedLoggingIndex(null);
    setFocusedActualSetId(null);
    setEditingSetId(null);
    setDraftDirty(false);
    setShowSkipExerciseConfirm(false);
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
    loggerDebug("EFFECT_SESSION_ID_CHANGE_END", { effect: "reset-ui-on-sessionId" });
  }, [sessionId]);

  useEffect(() => {
    if (isSwipeEnabled) return;
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
  }, [isSwipeEnabled]);

  useEffect(() => {
    const activeExists = !!session?.loggedExercises.some((item) => item.id === activeExerciseId);
    if (resumeState.kind === "ready" && (!activeExerciseId || !activeExists) && activeExerciseId !== resumeState.activeExerciseId) {
      loggerDebug("EFFECT_HYDRATE_ACTIVE_EXERCISE_START", {
        reason: !activeExerciseId ? "missing-active-id" : "active-id-not-found",
        nextActiveExerciseId: resumeState.activeExerciseId,
      });
      setActiveExerciseId(resumeState.activeExerciseId);
      loggerDebug("EFFECT_HYDRATE_ACTIVE_EXERCISE_END", { nextActiveExerciseId: resumeState.activeExerciseId });
      return;
    }
    if (session && !activeExerciseId) {
      const nextId = session.loggedExercises[session.currentExerciseIndex || 0]?.id;
      loggerDebug("EFFECT_HYDRATE_ACTIVE_EXERCISE_START", { reason: "session-fallback", nextActiveExerciseId: nextId });
      setActiveExerciseId(nextId);
      loggerDebug("EFFECT_HYDRATE_ACTIVE_EXERCISE_END", { nextActiveExerciseId: nextId });
    }
  }, [activeExerciseId, resumeState, session]);

  useEffect(() => {
    // Intentionally no DB synchronization from resumeState here.
    // Current set/exercise persistence must come from explicit user actions only.
  }, [resumeState]);

  useEffect(() => {
    if (!session?.id || !needsRuntimePlannedSetNormalization) return;
    loggerDebug("NORMALIZE_WORKOUT_START", { effect: "normalize-off-program-planned-sets" });
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === session.id);
      if (!target) return draft;
      let changed = false;
      for (const log of target.loggedExercises) {
        const hasProgramPlannedExercise = !!findPlannedExercise(draft, target, log);
        const shouldUseRuntimePlan = !hasProgramPlannedExercise;
        if (!shouldUseRuntimePlan) continue;
        const exerciseDef = draft.exercises.find((ex) => ex.id === log.exerciseId);
        const existingFirstWeight = log.offProgramPlannedSets?.[0]?.plannedWeight;
        const fallbackWeight = typeof existingFirstWeight === "number"
          ? existingFirstWeight
          : getOffProgramStartingWeight({
            db: draft,
            user,
            exercise: exerciseDef,
            targetReps: 8,
            targetRpe: 7,
          });
        const normalized = normalizeLoggerRuntimePlannedSets(log.offProgramPlannedSets, 1, 8, 7, fallbackWeight);
        const needsNormalization = !log.offProgramPlannedSets?.length
          || log.offProgramPlannedSets.some((set, index) => !set.id || set.setNumber !== index + 1);
        if (needsNormalization) {
          log.offProgramPlannedSets = normalized;
          log.offProgram = true;
          changed = true;
        }
      }
      if (changed) target.updatedAt = nowIso();
      return draft;
    });
    loggerDebug("NORMALIZE_WORKOUT_END", { effect: "normalize-off-program-planned-sets" });
  }, [db, needsRuntimePlannedSetNormalization, session, updateDb, user]);

  useEffect(() => {
    if (resumeState.kind === "ready" || resumeState.kind === "no-exercises") return;
    console.error("Workout could not be resumed", {
      sessionId,
      userId: user.id,
      reason: resumeState.reason,
      activeExerciseId,
    });
  }, [activeExerciseId, resumeState, sessionId, user.id]);

  useEffect(() => {
    if (!isSwipeEnabled || !openSwipeSetId) return undefined;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`[data-swipe-row-id="${openSwipeSetId}"]`)) return;
      setOpenSwipeSetId(undefined);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isSwipeEnabled, openSwipeSetId]);

  useEffect(() => {
    if (!openSwipeSetId) return;
    // swipeRowId is actual?.id ?? plannedSet?.id — check both so pending rows (no actual yet)
    // are not incorrectly closed because their planned-set id never appears in activeExerciseLog.sets.
    const openRowStillExists = lineupItems.some((item) => {
      const rowId = item.actualSet?.id ?? item.plannedSet?.id;
      return rowId === openSwipeSetId;
    });
    if (!openRowStillExists) {
      setOpenSwipeSetId(undefined);
      swipeGestureRef.current = null;
      setSwipeDrag(null);
    }
  }, [lineupItems, openSwipeSetId]);

  useEffect(() => {
    if (!editingSetId) return;
    const editingSetStillExists = lineupItems.some((item) => item.actualSet?.id === editingSetId);
    if (!editingSetStillExists) setEditingSetId(null);
  }, [editingSetId, lineupItems]);

  useEffect(() => {
    if (!focusedActualSetId) return;
    const focusedSetStillExists = lineupItems.some((item) => item.actualSet?.id === focusedActualSetId);
    if (!focusedSetStillExists) setFocusedActualSetId(null);
  }, [focusedActualSetId, lineupItems]);

  useEffect(() => {
    if (!pendingDeleteTarget) return;
    const targetStillExists = lineupItems.some((item) => {
      if (pendingDeleteTarget.actualSetId && item.actualSet?.id === pendingDeleteTarget.actualSetId) return true;
      if (pendingDeleteTarget.plannedSetId && item.plannedSet?.id === pendingDeleteTarget.plannedSetId) return true;
      return item.key === pendingDeleteTarget.lineupKey;
    });
    if (!targetStillExists) setPendingDeleteTarget(null);
  }, [lineupItems, pendingDeleteTarget]);

  if (resumeState.kind === "missing" || resumeState.kind === "invalid") {
    const recoverableSession = resumeState.kind === "invalid" ? resumeState.session : undefined;
    const isCompletedToday = recoverableSession?.status === "completed"
      && (recoverableSession.completedAt || recoverableSession.updatedAt || "").startsWith(todayIso());
    return (
      <Panel title={isCompletedToday ? "Workout complete" : "Workout could not be resumed"} icon={ShieldAlert}>
        <p className="text-sm text-iron-300">
          {isCompletedToday
            ? "This workout was completed. You can go back to add exercises or edit sets."
            : "The saved workout state was incomplete or stale."}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {isCompletedToday && (
            <button
              className="apollo-primary-btn col-span-2"
              onClick={() => {
                setActiveSessionId(recoverableSession!.id);
                setScreen("logger");
              }}
            >
              Edit Workout
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={() => {
              setActiveSessionId(undefined);
              setScreen("today");
            }}
          >
            Return to Today
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (recoverableSession) {
                void updateDb((draft) => {
                  const target = draft.sessions.find((item) => item.id === recoverableSession.id);
                  if (target) {
                    target.status = "abandoned";
                    target.updatedAt = nowIso();
                  }
                  return draft;
                });
                clearActiveWorkoutSessionDraft(user.id, recoverableSession.id);
              }
              setActiveSessionId(undefined);
              setScreen("today");
            }}
          >
            Abandon Workout
          </button>
        </div>
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel title="No Active Workout" icon={Timer}>
        <EmptyState title="Start a workout first" detail="Open Today and start one of your templates or generated program days." />
      </Panel>
    );
  }

  // Off-program or brand-new empty session: no exercises yet — let the user add them
  if (resumeState.kind === "no-exercises" || !activeExerciseLog || !exercise) {
    const isEmptySession = !session.loggedExercises.length;
    return (
      <div className="space-y-5">
        <PageTitle eyebrow="Today" title={isEmptySession ? "Workout could not be resumed" : "No exercise selected"} />
        {isEmptySession && (
          <Panel title="Build your workout" icon={Dumbbell}>
            <p className="mb-3 text-sm text-iron-300">
              This in-progress workout has no exercises.
            </p>
            <EmptyState title="Add an exercise to continue" detail="Open Today to return safely, abandon this workout, or add an exercise below." />
          </Panel>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="btn-secondary" onClick={backToToday}>
            Back to Today
          </button>
          <button className="btn-primary" onClick={() => setShowAddExercisePicker(true)}>
            <Plus className="h-4 w-4" /> Add Exercise
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              void updateDb((draft) => {
                const target = draft.sessions.find((item) => item.id === session.id);
                if (target) { target.status = "abandoned"; target.updatedAt = nowIso(); }
                return draft;
              });
              clearActiveWorkoutSessionDraft(user.id, session.id);
              setActiveSessionId(undefined);
              setScreen("today");
            }}
          >
            Cancel
          </button>
        </div>
        {showAddExercisePicker && (
          <ExercisePicker
            db={db}
            user={user}
            updateDb={updateDb}
            variant="week-sheet"
            title="Add exercise"
            onClose={() => setShowAddExercisePicker(false)}
            onPick={(ex) => {
              setShowAddExercisePicker(false);
              setPendingOffProgramExercise(ex);
            }}
          />
        )}
        {pendingOffProgramExercise && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
            <div className="panel w-full max-w-sm space-y-4 p-6">
              <h3 className="text-xl font-black">Add {pendingOffProgramExercise.name}</h3>
              <div className="space-y-2">
                <button
                  className="apollo-primary-btn w-full"
                  onClick={() => {
                    const ex = pendingOffProgramExercise;
                    void updateDb((draft) => {
                      const target = draft.sessions.find((item) => item.id === session.id);
                      if (!target) return draft;
                      const plannedWeight = getOffProgramStartingWeight({ db: draft, user, exercise: ex, targetReps: 8, targetRpe: 7 });
                      const newLog: LoggedExercise = {
                        id: createId("logex"),
                        exerciseId: ex.id,
                        order: target.loggedExercises.length + 1,
                        sets: [],
                        weakPointTags: [],
                        offProgram: true,
                        offProgramPlannedSets: buildOffProgramPlannedSets(3, 8, 7, plannedWeight),
                      };
                      target.loggedExercises.push(newLog);
                      target.currentExerciseIndex = target.loggedExercises.length - 1;
                      target.currentSetIndex = 0;
                      target.updatedAt = nowIso();
                      return draft;
                    });
                    setActiveExerciseId(undefined);
                    setPendingOffProgramExercise(undefined);
                  }}
                >
                  Add to Session
                </button>
                <button className="btn-ghost w-full" onClick={() => setPendingOffProgramExercise(undefined)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const liveSession = session;
  const liveExerciseLog = activeExerciseLog;
  const liveExercise = exercise;
  // Use exercise display unit everywhere in the logger — do NOT default to user.unit alone
  const rawExerciseUnit = getExerciseLoadUnit(liveExercise, user, liveExerciseLog.sets.find((set) => isWeightUnit(set.unit))?.unit);
  const bodyweightMovement = isBodyweightExercise(liveExercise);
  const _eff = getEffectiveLoading(liveExercise, db.loadingProfiles, rawExerciseUnit);
  // Loading profile is unit authority: use its unit when a profile is active.
  const exerciseUnit =
    (_eff.source === "exercise_profile" || _eff.source === "equipment_default")
      ? _eff.unit
      : rawExerciseUnit;
  const exerciseIncrement = _eff.increment;
  const isEditingLoggedSet = !!editingLineupItem?.actualSet;
  const sourceSetIndex = findRecommendationSourceIndex(liveExerciseLog.sets, effectiveSetIndex);
  const sourceSet = sourceSetIndex >= 0 ? liveExerciseLog.sets[sourceSetIndex] : undefined;
  const recommendation = sourceSet
    ? buildSetRecommendation({
        user,
        exercise: liveExercise,
        sourceSet,
        sourceSetIndex,
        targetSetIndex: effectiveSetIndex,
        sourceExerciseIndex: activeExerciseIndex,
        targetExerciseIndex: activeExerciseIndex,
        nextPlannedSet: currentPlannedSet,
        setsCompletedThisExercise: countCompletedThroughIndex(liveExerciseLog.sets, sourceSetIndex),
        readiness: liveSession.readiness,
        unit: exerciseUnit,
        loadingProfiles: db.loadingProfiles,
      })
    : undefined;
  const recommendationKey = recommendation
    ? `${recommendation.action?.setId ?? "none"}:${recommendation.action?.targetExerciseIndex ?? -1}:${recommendation.action?.targetSetIndex ?? -1}:${recommendation.action?.suggestedWeight ?? "none"}:${recommendation.action?.suggestedReps ?? "none"}:${recommendation.action?.suggestedRpe ?? "none"}`
    : null;
  const recommendationApplied = draftMatchesRecommendation({
    draft: setDraft,
    recommendation,
    increment: exerciseIncrement,
  });
  const recentlyAppliedForCurrentRecommendation =
    !!recommendationKey
    && recentlyAppliedRecommendationKey === recommendationKey
    && recommendationApplied;
  const showRecommendationCard = shouldRenderSuggestionCard({
    recommendation,
    draftMatches: recommendationApplied,
  });
  const recommendationFeedbackText = recommendationApplied
    ? recentlyAppliedForCurrentRecommendation
      ? "Applied to current set."
      : "Current set already matches the recommendation."
    : null;
  const lastSetWasSkipped = lastSet?.skipped === true;
  const isPastLastPlannedSet = plannedSets.length > 0 && effectiveSetIndex >= plannedSets.length;
  // Planned sets that have no logged set yet (supports out-of-order completion)
  const loggedPlannedSetIds = new Set(liveExerciseLog.sets.map((s) => s.plannedSetId).filter(Boolean));
  const uncoveredPlannedSets = plannedSets.filter((ps) => !loggedPlannedSetIds.has(ps.id));
  const allPlannedSetsCovered = uncoveredPlannedSets.length === 0;
  // True if any exercise other than the current one is still incomplete
  const hasMoreExercises = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex) !== undefined;
  // Whether the current on-screen planned set has not yet been logged (pending/incomplete)
  const currentPendingSetIsUncovered = !!currentPlannedSet && !loggedPlannedSetIds.has(currentPlannedSet.id);
  // Draft is considered valid/saveable if it has weight (or reps on bodyweight) and the set is pending
  const draftWeight = Number(setDraft.actualWeight) || 0;
  const draftReps = Number(setDraft.actualReps) || 0;
  const hasDraftValidValues = !isEditingLoggedSet && !isPastLastPlannedSet && currentPendingSetIsUncovered
    && (draftWeight > 0 || (liveExercise.category === "bodyweight" && draftReps > 0));
  const currentSetWouldCompleteExercise = currentPendingSetIsUncovered && uncoveredPlannedSets.length <= 1;
  const currentSetWouldCompleteWorkout = currentSetWouldCompleteExercise && !hasMoreExercises;
  const activeLineupIndex = editingLineupItem
    ? lineupItems.findIndex((item) => item.key === editingLineupItem.key)
    : selectedActualLineupItem
      ? lineupItems.findIndex((item) => item.key === selectedActualLineupItem.key)
      : selectedLoggingIndex !== null
      ? lineupItems.findIndex((item) => item.plannedIndex === selectedLoggingIndex)
      : lineupItems.findIndex((item) => item.plannedIndex === effectiveSetIndex);
  const clampedActiveLineupIndex = activeLineupIndex >= 0
    ? activeLineupIndex
    : (lineupItems.length ? Math.min(effectiveSetIndex, lineupItems.length - 1) : -1);
  const activeLineupItem = clampedActiveLineupIndex >= 0 ? lineupItems[clampedActiveLineupIndex] : undefined;
  const hasNextSetInExercise = clampedActiveLineupIndex >= 0 && clampedActiveLineupIndex < lineupItems.length - 1;
  const dirtySetIsValid = draftDirty && hasDraftValidValues;
  // State machine: only editing a completed set shows Save Changes; pending/current sets always show
  // Next Set / Finish Exercise / Finish Workout regardless of whether the user has changed values.
  const derivedPrimaryAction: "save-changes" | "next-set" | "finish-exercise" | "finish-workout" = isEditingLoggedSet
    ? "save-changes"
    : hasNextSetInExercise
      ? "next-set"
      : currentSetWouldCompleteWorkout
        ? "finish-workout"
        : "finish-exercise";
  const primaryActionLabel = derivedPrimaryAction === "save-changes"
    ? selectedActualSet?.skipped && (Number(setDraft.actualWeight) > 0 || Number(setDraft.actualReps) > 0) ? "Log Set" : "Save Changes"
    : derivedPrimaryAction === "next-set"
      ? "Next Set"
      : derivedPrimaryAction === "finish-workout"
        ? "Finish Workout"
        : "Finish Exercise";
  const plannedLineupItems = lineupItems.filter((item) => !item.isExtra);
  const completedPlannedCount = plannedLineupItems.filter((item) => !!item.actualSet).length;
  const totalPlannedCount = plannedLineupItems.length;
  const allExercisesComplete = liveSession.loggedExercises.every((logged) => {
    return isLoggedExerciseComplete(logged, db, liveSession);
  });

  function addReadiness(input: Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">) {
    const nextDraft = normalizeReadinessDraft(input);
    setReadinessDraft(nextDraft);
    persistActiveWorkoutDraftImmediately({ readinessDraft: nextDraft });
    const readiness: ReadinessCheckIn = {
      ...input,
      id: createId("readiness"),
      userId: user.id,
      date: todayIso(),
      readinessScore: calculateReadinessScore(input)
    };
    void updateDb((draft) => {
      draft.readiness.unshift(readiness);
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (target) target.readiness = readiness;
      return draft;
    });
  }

  function startSetSwipe(setId: string, clientX: number, clientY: number) {
    if (!isSwipeEnabled) return;
    // Record coordinates only — NO visual change, NO setState, NO openSwipeSetId change.
    // Dragging is confirmed only after horizontal movement exceeds threshold in moveSetSwipe.
    swipeGestureRef.current = {
      setId,
      startX: clientX,
      startY: clientY,
      initialOffset: openSwipeSetId === setId ? -SWIPE_DELETE_WIDTH : 0,
      mode: "undecided",
      currentOffsetX: openSwipeSetId === setId ? -SWIPE_DELETE_WIDTH : 0,
    };
  }

  function moveSetSwipe(clientX: number, clientY: number) {
    if (!isSwipeEnabled) return;
    const g = swipeGestureRef.current;
    if (!g) return;
    const dx = clientX - g.startX;
    const dy = clientY - g.startY;
    if (g.mode === "undecided") {
      // Wait until movement clears threshold before deciding direction.
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        g.mode = "vertical"; // vertical scroll wins — no visual change ever
        return;
      }
      // Horizontal left swipe confirmed — now it's safe to start visual drag.
      g.mode = "horizontal";
      // Close any other open row at this moment (not on touchstart).
      setOpenSwipeSetId((current) => current === g.setId ? current : undefined);
    }
    if (g.mode !== "horizontal") return;
    const clampedOffset = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, g.initialOffset + dx));
    g.currentOffsetX = clampedOffset;
    setSwipeDrag({ setId: g.setId, offsetX: clampedOffset });
  }

  function endSetSwipe() {
    if (!isSwipeEnabled) return;
    const g = swipeGestureRef.current;
    swipeGestureRef.current = null;
    if (!g || g.mode !== "horizontal") {
      // Tap or vertical scroll: no snap needed; onClick handles tap-to-close.
      return;
    }
    const finalOffset = g.currentOffsetX;
    setSwipeDrag(null);
    if (finalOffset <= -SWIPE_OPEN_THRESHOLD) {
      setOpenSwipeSetId(g.setId);
      // Suppress the synthesized click that browsers fire after touchend — it would
      // otherwise immediately re-close the row via the onClick handler.
      swipeJustOpenedRef.current = true;
    } else {
      setOpenSwipeSetId((current) => current === g.setId ? undefined : current);
    }
  }

  function cancelSetSwipe() {
    if (!isSwipeEnabled) return;
    const g = swipeGestureRef.current;
    swipeGestureRef.current = null;
    setSwipeDrag(null);
    // On cancel: close the row if it was being dragged open (wasn't snapped open before).
    if (g && g.mode === "horizontal" && g.initialOffset === 0) {
      setOpenSwipeSetId((current) => current === g.setId ? undefined : current);
    }
  }

  function buildSessionPreviewForSummary(updatedLoggedExercises: LoggedExercise[]) {
    return {
      ...liveSession,
      loggedExercises: updatedLoggedExercises,
    };
  }

  function logSet(rating: SetRating = setDraft.setRating, afterAction: "stay" | "next-set" | "next-exercise" | "finish-workout" = "stay") {
    loggerDebug("SAVE_SET_START", { rating, afterAction, isEditingLoggedSet });
    const actualWeight = Number(setDraft.actualWeight) || 0;
    const actualReps = Number(setDraft.actualReps) || 0;
    // Zero weight on a weight-based exercise is not a completed working set — skip it instead.
    const isWeightBased = liveExercise.category !== "bodyweight" && !liveExercise.bestTrackedBy.includes("time");
    if (isWeightBased && actualWeight === 0 && !isEditingLoggedSet) {
      skipSet();
      return;
    }

    if (isEditingLoggedSet && editingLineupItem?.actualSet) {
      const editingActualSet = editingLineupItem.actualSet;
      const editingActualIndex = editingLineupItem.actualIndex ?? liveExerciseLog.sets.findIndex((set) => set.id === editingActualSet.id);
      const updatedSet: LoggedSet = {
        ...editingActualSet,
        kind: setDraft.kind,
        plannedSetId: currentPlannedSet?.id ?? editingActualSet?.plannedSetId,
        plannedWeight: currentPlannedSet?.plannedWeight ?? editingActualSet?.plannedWeight,
        plannedReps: currentPlannedSet?.targetReps ?? editingActualSet?.plannedReps,
        actualWeight,
        unit: editingActualSet?.unit || exerciseUnit,
        actualReps,
        targetRpe: currentPlannedSet?.targetRpe ?? editingActualSet?.targetRpe,
        actualRpe: setDraft.actualRpe ? Math.min(10, Math.max(0, Number(setDraft.actualRpe))) || undefined : undefined,
        setRating: rating,
        formRating: Number(setDraft.formRating) || editingActualSet?.formRating,
        muscleFeelRating: Number(setDraft.muscleFeelRating) || editingActualSet?.muscleFeelRating,
        pumpRating: Number(setDraft.pumpRating) || editingActualSet?.pumpRating,
        painRating: Number(setDraft.painRating) || editingActualSet?.painRating,
        sorenessRating: Number(setDraft.sorenessRating) || editingActualSet?.sorenessRating,
        notes: setDraft.notes,
        skipped: false,
        completedAt: nowIso()
      };
      const performance = calculateSetPerformanceScore(currentPlannedSet, updatedSet);
      updatedSet.performanceScore = performance.score;
      updatedSet.performanceStatus = performance.status;
      const nextTargetIndex = (editingLineupItem.plannedIndex ?? effectiveSetIndex) + 1;
      const rec = buildSetRecommendation({
        user,
        exercise: liveExercise,
        sourceSet: updatedSet,
        sourceSetIndex: editingActualIndex,
        targetSetIndex: nextTargetIndex,
        sourceExerciseIndex: activeExerciseIndex,
        targetExerciseIndex: activeExerciseIndex,
        nextPlannedSet: plannedSets[nextTargetIndex],
        setsCompletedThisExercise: countCompletedThroughIndex(
          liveExerciseLog.sets.map((set, index) => index === editingActualIndex ? updatedSet : set),
          editingActualIndex
        ),
        readiness: liveSession.readiness,
        unit: exerciseUnit,
      });
      void updateDb((draft) => {
        const target = draft.sessions.find((item) => item.id === liveSession.id);
        const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
        // Skipped-set edits must target exactly this set by id — never bulk-apply to all skipped sets.
        // Double-check by id in case editingActualIndex is stale relative to the current DB state.
        const exactDbIndex = log?.sets.findIndex((s) => s.id === editingActualSet.id) ?? -1;
        const safeIndex = exactDbIndex >= 0 ? exactDbIndex : editingActualIndex;
        if (log && safeIndex >= 0 && log.sets[safeIndex]) {
          log.sets[safeIndex] = updatedSet;
          log.weakPointTags = detectWeakPointTags(log);
        }
        if (target) {
          if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) target.status = "in-progress";
          target.updatedAt = nowIso();
          if (rec) upsertRecommendation(target.recommendations, rec);
        }
        if (rec) upsertRecommendation(draft.recommendations, rec);
        return draft;
      });
      setEditingSetId(null);
      setFocusedActualSetId(updatedSet.id);
      setSelectedLoggingIndex(null);
      setDraftDirty(false);
      loggerDebug("SAVE_SET_END", { mode: "edit-existing", updatedSetId: updatedSet.id });
      // After saving an edit, re-anchor to the first planned set not yet covered.
      // loggedPlannedSetIds reflects pre-save state; editing an existing set doesn't change coverage.
      const firstUncoveredIdx = plannedSets.findIndex((ps) => !loggedPlannedSetIds.has(ps.id));
      if (firstUncoveredIdx >= 0) {
        setSelectedLoggingIndex(firstUncoveredIdx);
        setTimeout(() => {
          const el = setLineupRef.current?.querySelector<HTMLElement>('[data-is-current-set="true"]');
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
      } else if (editingActualSet.skipped && liveExerciseLog.sets.some((s, i) => s.skipped && i !== editingActualIndex)) {
        // This was a skipped set being converted to logged. Other skipped sets remain in this exercise —
        // stay so the user can address them rather than navigating away mid-exercise.
        // (loggedPlannedSetIds is stale here: skipped sets are counted as "covered", so firstUncoveredIdx
        //  is always -1 when all planned positions have a logged or skipped set.)
        setSelectedLoggingIndex(null);
      } else {
        // All sets covered and no remaining skipped sets — navigate to next exercise (exercise is done).
        setTimeout(() => navigateToNextExercise(), 50);
      }
      return;
    }

    const loggedSet: LoggedSet = {
      id: createId("set"),
      kind: setDraft.kind,
      setNumber: effectiveSetIndex + 1,
      plannedSetId: currentPlannedSet?.id,
      plannedWeight: currentPlannedSet?.plannedWeight,
      plannedReps: currentPlannedSet?.targetReps,
      actualWeight,
      unit: exerciseUnit,
      actualReps,
      targetRpe: currentPlannedSet?.targetRpe,
      actualRpe: setDraft.actualRpe ? Math.min(10, Math.max(0, Number(setDraft.actualRpe))) || undefined : undefined,
      setRating: rating,
      formRating: Number(setDraft.formRating) || undefined,
      muscleFeelRating: Number(setDraft.muscleFeelRating) || undefined,
      pumpRating: Number(setDraft.pumpRating) || undefined,
      painRating: Number(setDraft.painRating) || undefined,
      sorenessRating: Number(setDraft.sorenessRating) || undefined,
      restSeconds: planned?.restSeconds,
      added: currentPlannedSet?.notes?.toLowerCase().includes("added set") || effectiveSetIndex >= plannedSets.length,
      notes: setDraft.notes,
      completedAt: nowIso()
    };
    const performance = calculateSetPerformanceScore(currentPlannedSet, loggedSet);
    loggedSet.performanceScore = performance.score;
    loggedSet.performanceStatus = performance.status;
    const targetPlannedSet = plannedSets[effectiveSetIndex + 1];
    const rec = buildSetRecommendation({
      user,
      exercise: liveExercise,
      sourceSet: loggedSet,
      sourceSetIndex: effectiveSetIndex,
      targetSetIndex: effectiveSetIndex + 1,
      sourceExerciseIndex: activeExerciseIndex,
      targetExerciseIndex: activeExerciseIndex,
      nextPlannedSet: targetPlannedSet,
      setsCompletedThisExercise: liveExerciseLog.sets.filter((s) => !s.skipped).length + 1,
      readiness: liveSession.readiness,
      unit: exerciseUnit,
    });
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log) {
        log.sets.push(loggedSet);
        log.weakPointTags = detectWeakPointTags(log);
      }
      if (target) {
        if (!preserveCompletedStatus(target) && target.status === "completed") target.status = "in-progress";
        if (afterAction === "next-exercise" && hasMoreExercises) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
          target.currentSetIndex = 0;
        } else {
          target.currentExerciseIndex = activeExerciseIndex;
          target.currentSetIndex = log ? getResumeSetIndex(log, plannedSets) : 0;
        }
        target.updatedAt = nowIso();
      }
      if (target && log) learnGymExerciseAdjustment({ db: draft, user, session: target, loggedExercise: log, loggedSet, exercise: liveExercise });
      if (target && rec) upsertRecommendation(target.recommendations, rec);
      if (rec) upsertRecommendation(draft.recommendations, rec);
      if (target && afterAction === "finish-workout") {
        // Move to review state — actual finalization (scores, perf logs, block progression)
        // only happens when user explicitly confirms "Finish Workout" in the review summary.
        if (target.status === "in-progress") target.status = "review";
        target.updatedAt = nowIso();
      }
      return draft;
    });
    const optimisticNextUncoveredIndex = getResumeSetIndex({ ...liveExerciseLog, sets: [...liveExerciseLog.sets, loggedSet] }, plannedSets);
    setSelectedLoggingIndex(afterAction === "stay" ? effectiveSetIndex : afterAction === "next-set" ? optimisticNextUncoveredIndex : null);
    setEditingSetId(null);
    setFocusedActualSetId(afterAction === "stay" ? loggedSet.id : null);
    setDraftDirty(false);
    setRestRemaining(planned?.restSeconds || user.settings.defaultRestSeconds);
    // Coverage-based: pre-compute where getResumeSetIndex will land after this set is pushed,
    // so the draft key matches the effect's expected key and avoids a stale intermediate render.
    const nextUncoveredIndex = optimisticNextUncoveredIndex;
    setSetDraft(emptySetDraft(plannedSets[nextUncoveredIndex] ?? null, loggedSet, `${liveExerciseLog.id}:${nextUncoveredIndex}`));
    if (afterAction === "next-set") {
      setTimeout(() => {
        const nextItem = lineupItems.find((item) => item.plannedIndex === nextUncoveredIndex);
        if (nextItem) focusLineupItem(nextItem);
      }, 0);
    }
    if (afterAction === "next-exercise") {
      const targetIdx = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex);
      const nextLog = targetIdx !== undefined ? liveSession.loggedExercises[targetIdx] : undefined;
      if (nextLog) {
        setActiveExerciseId(nextLog.id);
      } else {
        const summarySession = buildSessionPreviewForSummary(
          liveSession.loggedExercises.map((logged) => (
            logged.id === liveExerciseLog.id
              ? { ...logged, sets: [...logged.sets, loggedSet] }
              : logged
          ))
        );
        // No more incomplete exercises after this save — present the review screen.
        void updateDb((draft) => {
          const target = draft.sessions.find((s) => s.id === liveSession.id);
          if (target && target.status === "in-progress") { target.status = "review"; target.updatedAt = nowIso(); }
          return draft;
        });
        const summary = buildCompletionSummary(summarySession);
        setCompletionSummary(summary);
        setShowCompletionSummary(true);
      }
    }
    if (afterAction === "finish-workout") {
      const summarySession = buildSessionPreviewForSummary(
        liveSession.loggedExercises.map((logged) => (
          logged.id === liveExerciseLog.id
            ? { ...logged, sets: [...logged.sets, loggedSet] }
            : logged
        ))
      );
      const summary = buildCompletionSummary(summarySession);
      setCompletionSummary(summary);
      setShowCompletionSummary(true);
    }
    loggerDebug("SAVE_SET_END", { mode: "create-new", afterAction });
  }

  function skipSet() {
    if (isPastLastPlannedSet) return;
    const shouldAdvanceExercise = currentSetWouldCompleteExercise && hasMoreExercises;
    const shouldFinishWorkout = currentSetWouldCompleteWorkout;
    const skippedSet: LoggedSet = {
      id: createId("set"),
      kind: currentPlannedSet?.kind || "working",
      setNumber: effectiveSetIndex + 1,
      plannedSetId: currentPlannedSet?.id,
      plannedWeight: currentPlannedSet?.plannedWeight,
      plannedReps: currentPlannedSet?.targetReps,
      actualWeight: 0,
      unit: exerciseUnit,
      actualReps: 0,
      targetRpe: currentPlannedSet?.targetRpe,
      setRating: 1 as SetRating,
      skipped: true,
      notes: setDraft.notes || "Skipped set.",
      completedAt: nowIso()
    };
    const performance = calculateSetPerformanceScore(currentPlannedSet, skippedSet);
    skippedSet.performanceScore = performance.score;
    skippedSet.performanceStatus = performance.status;
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log) log.sets.push(skippedSet);
      if (target) {
        if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) target.status = "in-progress";
        if (shouldAdvanceExercise) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
          target.currentSetIndex = 0;
        } else {
          target.currentExerciseIndex = activeExerciseIndex;
          target.currentSetIndex = log ? getResumeSetIndex(log, plannedSets) : 0;
        }
        target.updatedAt = nowIso();
        if (shouldFinishWorkout) finishWorkoutInDraft(draft, user, target);
      }
      return draft;
    });
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    const nextUncoveredIndex = getResumeSetIndex({ ...liveExerciseLog, sets: [...liveExerciseLog.sets, skippedSet] }, plannedSets);
    setSetDraft(emptySetDraft(plannedSets[nextUncoveredIndex] ?? null, skippedSet, `${liveExerciseLog.id}:${nextUncoveredIndex}`));
    if (shouldAdvanceExercise) {
      const targetIdx = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex);
      const nextLog = targetIdx !== undefined ? liveSession.loggedExercises[targetIdx] : undefined;
      if (nextLog) setActiveExerciseId(nextLog.id);
    }
    if (shouldFinishWorkout) {
      const summarySession = buildSessionPreviewForSummary(
        liveSession.loggedExercises.map((logged) => (
          logged.id === liveExerciseLog.id
            ? { ...logged, sets: [...logged.sets, skippedSet] }
            : logged
        ))
      );
      const summary = buildCompletionSummary(summarySession);
      setCompletionSummary(summary);
      setShowCompletionSummary(true);
    }
  }

  function selectExactLineupItemForEditing(lineupItem?: (typeof lineupItems)[number]) {
    if (!lineupItem) return;
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
    setPendingDeleteTarget(null);
    if (lineupItem.actualSet?.id) {
      setFocusedActualSetId(lineupItem.actualSet.id);
      setSelectedLoggingIndex(null);
      setEditingSetId(lineupItem.actualSet.id);
      persistActiveWorkoutDraftImmediately({
        activeSetActualId: lineupItem.actualSet.id,
        activeSetPlannedId: lineupItem.plannedSet?.id ?? null,
        activeSetPlannedIndex: lineupItem.plannedIndex ?? null,
        selectionMode: "editing",
      });
      return;
    }
    if (lineupItem.plannedIndex !== undefined) {
      setFocusedActualSetId(null);
      setEditingSetId(null);
      setSelectedLoggingIndex(lineupItem.plannedIndex);
      persistActiveWorkoutDraftImmediately({
        activeSetActualId: null,
        activeSetPlannedId: lineupItem.plannedSet?.id ?? null,
        activeSetPlannedIndex: lineupItem.plannedIndex,
        selectionMode: "planned",
      });
    }
  }

  function focusLineupItem(lineupItem?: (typeof lineupItems)[number]) {
    if (!lineupItem) return;
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
    setPendingDeleteTarget(null);
    setEditingSetId(null);
    if (lineupItem.actualSet?.id) {
      setFocusedActualSetId(lineupItem.actualSet.id);
      setSelectedLoggingIndex(null);
      persistActiveWorkoutDraftImmediately({
        activeSetActualId: lineupItem.actualSet.id,
        activeSetPlannedId: lineupItem.plannedSet?.id ?? null,
        activeSetPlannedIndex: lineupItem.plannedIndex ?? null,
        selectionMode: "actual",
      });
      return;
    }
    setFocusedActualSetId(null);
    if (lineupItem.plannedIndex !== undefined) {
      setSelectedLoggingIndex(lineupItem.plannedIndex);
      persistActiveWorkoutDraftImmediately({
        activeSetActualId: null,
        activeSetPlannedId: lineupItem.plannedSet?.id ?? null,
        activeSetPlannedIndex: lineupItem.plannedIndex,
        selectionMode: "planned",
      });
    }
  }

  // Skips a specific planned set by index — used by swipe-to-skip on set rows.
  // Targets the swiped row regardless of which set is currently selected.
  function skipAtPlannedIndex(targetIndex: number) {
    const targetPlannedSet = plannedSets[targetIndex];
    if (!targetPlannedSet || loggedPlannedSetIds.has(targetPlannedSet.id)) return;
    const remainingUncovered = uncoveredPlannedSets.filter((ps) => ps.id !== targetPlannedSet.id);
    const wouldCompleteExercise = remainingUncovered.length === 0;
    const wouldFinishWorkout = wouldCompleteExercise && !hasMoreExercises;
    const wouldAdvanceExercise = wouldCompleteExercise && hasMoreExercises;
    const skippedSet: LoggedSet = {
      id: createId("set"),
      kind: targetPlannedSet.kind || "working",
      setNumber: targetIndex + 1,
      plannedSetId: targetPlannedSet.id,
      plannedWeight: targetPlannedSet.plannedWeight,
      plannedReps: targetPlannedSet.targetReps,
      actualWeight: 0,
      unit: exerciseUnit,
      actualReps: 0,
      targetRpe: targetPlannedSet.targetRpe,
      setRating: 1 as SetRating,
      skipped: true,
      notes: "Skipped set.",
      completedAt: nowIso()
    };
    const performance = calculateSetPerformanceScore(targetPlannedSet, skippedSet);
    skippedSet.performanceScore = performance.score;
    skippedSet.performanceStatus = performance.status;
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log) log.sets.push(skippedSet);
      if (target) {
        if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) target.status = "in-progress";
        if (wouldAdvanceExercise) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
          target.currentSetIndex = 0;
        } else {
          target.currentExerciseIndex = activeExerciseIndex;
          target.currentSetIndex = log ? getResumeSetIndex(log, plannedSets) : 0;
        }
        target.updatedAt = nowIso();
        if (wouldFinishWorkout) finishWorkoutInDraft(draft, user, target);
      }
      return draft;
    });
    setOpenSwipeSetId(undefined);
    setSwipeDrag(null);
    swipeGestureRef.current = null;
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    const nextUncoveredIndex = getResumeSetIndex({ ...liveExerciseLog, sets: [...liveExerciseLog.sets, skippedSet] }, plannedSets);
    setSetDraft(emptySetDraft(plannedSets[nextUncoveredIndex] ?? null, skippedSet, `${liveExerciseLog.id}:${nextUncoveredIndex}`));
    if (wouldAdvanceExercise) {
      const targetIdx = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex);
      const nextLog = targetIdx !== undefined ? liveSession.loggedExercises[targetIdx] : undefined;
      if (nextLog) setActiveExerciseId(nextLog.id);
    }
    if (wouldFinishWorkout) {
      const summarySession = buildSessionPreviewForSummary(
        liveSession.loggedExercises.map((logged) => (
          logged.id === liveExerciseLog.id
            ? { ...logged, sets: [...logged.sets, skippedSet] }
            : logged
        ))
      );
      const summary = buildCompletionSummary(summarySession);
      setCompletionSummary(summary);
      setShowCompletionSummary(true);
    }
  }

  function addSet(targetLogId?: string) {
    loggerDebug("ADD_SET_START", { targetLogId });
    const targetExerciseLogId = targetLogId || liveExerciseLog.id;
    const isAddingToActiveExercise = targetExerciseLogId === liveExerciseLog.id;
    const nextSetIndex = isAddingToActiveExercise ? plannedSets.length : undefined;
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === liveSession.programId);
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === targetExerciseLogId);
      const targetPlanned = targetProgram?.blocks
        .flatMap((block) => block.weeks)
        .flatMap((week) => week.workouts)
        .flatMap((day) => day.exercises)
        .find((item) => item.id === log?.plannedExerciseId);
      if (targetPlanned) {
        const base = targetPlanned.plannedSets.at(-1) || targetPlanned.plannedSets[0] || { id: createId("pset"), kind: "working" as const, targetReps: 8, targetRpe: 7 };
        const extra: PlannedSet = {
          ...base,
          id: createId("pset"),
          kind: "working",
          setNumber: targetPlanned.plannedSets.length + 1,
          percentageOfTopSet: base.percentageOfTopSet,
          notes: "Added set."
        };
        targetPlanned.plannedSets.push(extra);
      }
      if (log && !targetPlanned) {
        const exerciseDef = draft.exercises.find((ex) => ex.id === log.exerciseId);
        const baseSet = normalizeLoggerRuntimePlannedSets(log.offProgramPlannedSets, 1, 8, 7)[0];
        const runtimeExtra: PlannedSet = {
          ...baseSet,
          id: createId("pset"),
          setNumber: Math.max(1, (log.offProgramPlannedSets?.length || 0) + 1),
          notes: "Added set.",
          plannedWeight: baseSet.plannedWeight ?? getOffProgramStartingWeight({
            db: draft,
            user,
            exercise: exerciseDef,
            targetReps: baseSet.targetReps || 8,
            targetRpe: baseSet.targetRpe || 7,
          }),
        };
        log.offProgramPlannedSets = normalizeLoggerRuntimePlannedSets([...(log.offProgramPlannedSets || []), runtimeExtra], 1, 8, 7);
        log.offProgram = true;
      }
      if (target) {
        if (editingCompletedWorkout && target.status === "completed") {
          target.status = "in-progress";
        } else if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) {
          target.status = "in-progress";
        }
        if (log) {
          const logIndex = target.loggedExercises.findIndex((item) => item.id === log.id);
          if (logIndex >= 0) {
            target.currentExerciseIndex = logIndex;
            const updatedPlanned = findPlannedExercise(draft, target, log);
            const updatedPlannedSets = getLoggedExercisePlannedSets(log, updatedPlanned);
            target.currentSetIndex = Math.max(0, updatedPlannedSets.length - 1);
          }
        }
        target.updatedAt = nowIso();
      }
      return draft;
    });
    setDraftDirty(false);
    setEditingSetId(null);
    setFocusedActualSetId(null);
    if (isAddingToActiveExercise && nextSetIndex !== undefined) {
      setSelectedLoggingIndex(nextSetIndex);
    }
    loggerDebug("ADD_SET_END", { targetExerciseLogId, nextSetIndex });
  }


  function adjustWeight(delta: number) {
    updateSetDraftImmediately((d) => ({ ...d, actualWeight: String(Math.max(0, Math.round(((Number(d.actualWeight) || 0) + delta) * 1000) / 1000)) }));
  }
  function adjustReps(delta: number) {
    updateSetDraftImmediately((d) => ({ ...d, actualReps: String(Math.max(0, (Number(d.actualReps) || 0) + delta)) }));
  }
  function adjustRpe(delta: number) {
    updateSetDraftImmediately((d) => ({ ...d, actualRpe: String(Math.max(0, Math.min(10, Number(((Number(d.actualRpe) || 0) + delta).toFixed(1))))) }));
  }

  function navigateToNextExercise() {
    // Route to the earliest INCOMPLETE exercise, not simply the next in sequence.
    // This ensures jumping ahead and back doesn't leave exercises orphaned.
    const targetIndex = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex);
    const targetLog = targetIndex !== undefined ? liveSession.loggedExercises[targetIndex] : undefined;
    if (targetLog) {
      setActiveExerciseId(targetLog.id);
      void updateDb((draft) => {
        const target = draft.sessions.find((item) => item.id === liveSession.id);
        if (target) {
          target.currentExerciseIndex = targetIndex!;
          target.currentSetIndex = 0;
          target.updatedAt = nowIso();
        }
        return draft;
      });
    }
  }

  function skipRemainingAndNavigate() {
    const activeDraftWeight = Number(setDraft.actualWeight) || 0;
    const activeDraftReps = Number(setDraft.actualReps) || 0;
    const isWeightBased = liveExercise.category !== "bodyweight" && !liveExercise.bestTrackedBy.includes("time");
    // Determine if the active pending set draft has saveable data that should be
    // committed before the remaining sets are skipped.
    const shouldSaveActiveDraft = !isEditingLoggedSet
      && !isPastLastPlannedSet
      && currentPendingSetIsUncovered
      && (activeDraftWeight > 0 || (!isWeightBased && activeDraftReps > 0));
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log && plannedSets.length) {
        // Save the active set first if it has valid data — no entered data should be lost on Finish.
        if (shouldSaveActiveDraft && currentPlannedSet) {
          const savedSet: LoggedSet = {
            id: createId("set"),
            kind: setDraft.kind,
            setNumber: log.sets.length + 1,
            plannedSetId: currentPlannedSet.id,
            plannedWeight: currentPlannedSet.plannedWeight,
            plannedReps: currentPlannedSet.targetReps,
            actualWeight: activeDraftWeight,
            unit: exerciseUnit,
            actualReps: activeDraftReps,
            targetRpe: currentPlannedSet.targetRpe,
            actualRpe: setDraft.actualRpe ? Math.min(10, Math.max(0, Number(setDraft.actualRpe))) || undefined : undefined,
            setRating: setDraft.setRating,
            notes: setDraft.notes,
            completedAt: nowIso()
          };
          const perf = calculateSetPerformanceScore(currentPlannedSet, savedSet);
          savedSet.performanceScore = perf.score;
          savedSet.performanceStatus = perf.status;
          log.sets.push(savedSet);
        }
        // Skip only planned sets that have no logged set yet (supports out-of-order completion).
        const loggedPlannedSetIds = new Set(log.sets.map((s) => s.plannedSetId).filter(Boolean));
        const setsToSkip = plannedSets.filter((ps) => !loggedPlannedSetIds.has(ps.id));
        for (const ps of setsToSkip) {
          log.sets.push({
            id: createId("set"),
            kind: ps.kind || "working",
            setNumber: log.sets.length + 1,
            plannedSetId: ps.id,
            plannedReps: ps.targetReps,
            actualWeight: 0,
            unit: exerciseUnit,
            actualReps: 0,
            targetRpe: ps.targetRpe,
            setRating: 1 as SetRating,
            skipped: true,
            notes: "Skipped — exercise finished early.",
            completedAt: nowIso()
          });
        }
      }
      if (target) {
        target.currentExerciseIndex = activeExerciseIndex + 1;
        target.currentSetIndex = 0;
        target.updatedAt = nowIso();
      }
      return draft;
    });
    setShowFinishConfirm(false);
    // Navigate to earliest incomplete exercise, not just the next index
    const targetIndex = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex);
    const targetLog = targetIndex !== undefined ? liveSession.loggedExercises[targetIndex] : undefined;
    if (targetLog) setActiveExerciseId(targetLog.id);
  }

  function skipEntireExercise() {
    const setsToSkip = plannedSets.filter((ps) => !loggedPlannedSetIds.has(ps.id));
    const skippedSets = setsToSkip.map((plannedSet, index) => {
      const skippedSet: LoggedSet = {
        id: createId("set"),
        kind: plannedSet.kind || "working",
        setNumber: liveExerciseLog.sets.length + index + 1,
        plannedSetId: plannedSet.id,
        plannedWeight: plannedSet.plannedWeight,
        plannedReps: plannedSet.targetReps,
        actualWeight: 0,
        unit: exerciseUnit,
        actualReps: 0,
        targetRpe: plannedSet.targetRpe,
        setRating: 1 as SetRating,
        skipped: true,
        notes: "Skipped exercise.",
        completedAt: nowIso()
      };
      const performance = calculateSetPerformanceScore(plannedSet, skippedSet);
      skippedSet.performanceScore = performance.score;
      skippedSet.performanceStatus = performance.status;
      return skippedSet;
    });
    const shouldAdvanceExercise = hasMoreExercises;
    const shouldFinishWorkout = !hasMoreExercises;

    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log && skippedSets.length) {
        log.sets.push(...skippedSets);
      }
      if (target) {
        if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) target.status = "in-progress";
        if (shouldAdvanceExercise) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
          target.currentSetIndex = 0;
        } else {
          target.currentExerciseIndex = activeExerciseIndex;
          target.currentSetIndex = log ? getResumeSetIndex(log, plannedSets) : 0;
        }
        target.updatedAt = nowIso();
        if (shouldFinishWorkout) finishWorkoutInDraft(draft, user, target);
      }
      return draft;
    });

    setShowSkipExerciseConfirm(false);
    setShowFinishConfirm(false);
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    setDraftDirty(false);
    skipSetLongPressTriggeredRef.current = false;

    if (shouldAdvanceExercise) {
      const targetIndex = findEarliestIncompleteExerciseIndex(liveSession, db, activeExerciseIndex);
      const targetLog = targetIndex !== undefined ? liveSession.loggedExercises[targetIndex] : undefined;
      if (targetLog) {
        setActiveExerciseId(targetLog.id);
      }
      return;
    }

    if (shouldFinishWorkout) {
      const summarySession = buildSessionPreviewForSummary(
        liveSession.loggedExercises.map((logged) => (
          logged.id === liveExerciseLog.id
            ? { ...logged, sets: [...logged.sets, ...skippedSets] }
            : logged
        ))
      );
      const summary = buildCompletionSummary(summarySession);
      setCompletionSummary(summary);
      setShowCompletionSummary(true);
    }
  }

  function finishExercise() {
    loggerDebug("FINISH_EXERCISE_START");
    // If the user is mid-edit of a logged/skipped set with unsaved changes, save first.
    if (isEditingLoggedSet && draftDirty) {
      logSet(setDraft.setRating, "stay");
      return;
    }
    // Hard guard: if the current on-screen pending set has valid draft values, save it first.
    // This fires from the smart primary action and from past-the-end navigation.
    const currentDraftWeight = Number(setDraft.actualWeight) || 0;
    const currentDraftReps = Number(setDraft.actualReps) || 0;
    const hasValidUnsavedValues = !isEditingLoggedSet && !isPastLastPlannedSet
      && currentPendingSetIsUncovered
      && (currentDraftWeight > 0 || (!liveExercise.bestTrackedBy.includes("time") && currentDraftReps > 0));
    if (hasValidUnsavedValues) {
      // Save the active set first, then navigate after the save resolves.
      // Use next-exercise/finish-workout only when this is the sole remaining uncovered set;
      // otherwise save-and-stay so the user can address remaining uncovered sets.
      const afterSave = uncoveredPlannedSets.length <= 1
        ? (hasMoreExercises ? "next-exercise" : "finish-workout")
        : "stay";
      logSet(setDraft.setRating, afterSave);
      return;
    }
    // If the user selected a different pending set via row action, ensure we still save
    // that exact selected pending set before finishing/advancing.
    if (draftDirty && !isEditingLoggedSet && selectedLoggingIndex !== null) {
      const selectedPlanned = plannedSets[selectedLoggingIndex];
      const selectedIsUncovered = !!selectedPlanned && !loggedPlannedSetIds.has(selectedPlanned.id);
      if (selectedIsUncovered) {
        const selectedHasValidValues = currentDraftWeight > 0 || (!liveExercise.bestTrackedBy.includes("time") && currentDraftReps > 0);
        if (selectedHasValidValues) {
          const remainingAfterSave = uncoveredPlannedSets.filter((ps) => ps.id !== selectedPlanned.id);
          const afterSave = remainingAfterSave.length === 0
            ? (hasMoreExercises ? "next-exercise" : "finish-workout")
            : "stay";
          logSet(setDraft.setRating, afterSave);
          return;
        }
      }
    }
    // If any planned sets are still uncovered (no logged set matched), confirm skip.
    if (!allPlannedSetsCovered) {
      setShowFinishConfirm(true);
      loggerDebug("FINISH_EXERCISE_END", { result: "show-skip-confirm" });
      return;
    }
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    if (!hasMoreExercises) {
      // All exercises covered — present review screen instead of dead-ending on last exercise.
      finishWorkout();
    } else {
      navigateToNextExercise();
    }
    loggerDebug("FINISH_EXERCISE_END", { result: hasMoreExercises ? "next-exercise" : "finish-workout" });
  }

  function removeExerciseFromSession(logId: string) {
    const removalIndex = liveSession.loggedExercises.findIndex((logged) => logged.id === logId);
    if (removalIndex < 0) return;
    const removingActiveExercise = liveExerciseLog.id === logId;
    const previousLog = removalIndex > 0 ? liveSession.loggedExercises[removalIndex - 1] : undefined;
    const nextLog = liveSession.loggedExercises[removalIndex + 1];
    const fallbackLog = previousLog || nextLog;

    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (!target) return draft;
      const targetRemovalIndex = target.loggedExercises.findIndex((logged) => logged.id === logId);
      if (targetRemovalIndex < 0) return draft;
      target.loggedExercises.splice(targetRemovalIndex, 1);
      target.loggedExercises.forEach((logged, index) => {
        logged.order = index + 1;
      });
      if (editingCompletedWorkout && target.status === "completed") {
        target.status = "in-progress";
      } else if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) {
        target.status = "in-progress";
      }
      if (!target.loggedExercises.length) {
        target.currentExerciseIndex = 0;
        target.currentSetIndex = 0;
      } else if (removingActiveExercise) {
        const fallbackIndex = fallbackLog ? target.loggedExercises.findIndex((logged) => logged.id === fallbackLog.id) : 0;
        target.currentExerciseIndex = fallbackIndex >= 0 ? fallbackIndex : 0;
        target.currentSetIndex = 0;
      } else {
        const activeIndex = target.loggedExercises.findIndex((logged) => logged.id === liveExerciseLog.id);
        target.currentExerciseIndex = activeIndex >= 0 ? activeIndex : Math.max(0, Math.min(targetRemovalIndex, target.loggedExercises.length - 1));
        target.currentSetIndex = 0;
      }
      target.updatedAt = nowIso();
      return draft;
    });

    setPendingRemoveExerciseLogId(null);
    setExerciseContextMenuId(null);
    setOpenSwipeSetId(undefined);
    setSwipeDrag(null);
    swipeGestureRef.current = null;
    setPendingDeleteTarget(null);
    setEditingSetId(null);
    setFocusedActualSetId(null);
    setSelectedLoggingIndex(null);

    if (removingActiveExercise) {
      setActiveExerciseId(fallbackLog?.id);
    }
  }

  function abandonWorkout() {
    if (!confirm("Abandon this in-progress workout? Logged data for this session will stay marked abandoned.")) return;
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (target) {
        target.status = "abandoned";
        target.updatedAt = nowIso();
      }
      return draft;
    });
    clearActiveWorkoutSessionDraft(user.id, liveSession.id);
    setActiveSessionId(undefined);
    setScreen("today");
  }

  function applySuggestion(nextRecommendation?: Recommendation) {
    if (!nextRecommendation?.action?.suggestedWeight) return;
    const suggestedWeight = nextRecommendation.action.suggestedWeight;
    updateSetDraftImmediately(
      (current) => applyRecommendationToCurrentDraft(current, nextRecommendation, currentPlannedSet),
      { draftDirty: true, clearRecommendation: false }
    );
    setRecentlyAppliedRecommendationKey(
      `${nextRecommendation.action?.setId ?? "none"}:${nextRecommendation.action?.targetExerciseIndex ?? -1}:${nextRecommendation.action?.targetSetIndex ?? -1}:${nextRecommendation.action?.suggestedWeight ?? "none"}:${nextRecommendation.action?.suggestedReps ?? "none"}:${nextRecommendation.action?.suggestedRpe ?? "none"}`
    );
    const targetId = nextRecommendation.action.targetPlannedSetId ?? currentPlannedSet?.id;
    void updateDb((draft) => {
      const sessionTarget = draft.sessions.find((s) => s.id === liveSession.id);
      if (sessionTarget) {
        upsertRecommendation(sessionTarget.recommendations, nextRecommendation);
        sessionTarget.loggedExercises
          .flatMap((logged) => logged.offProgramPlannedSets || [])
          .forEach((set) => { if (set.id === targetId) set.plannedWeight = suggestedWeight; });
      }
      upsertRecommendation(draft.recommendations, nextRecommendation);
      // Update the planned weight for the target set
      if (targetId && liveSession.programId) {
        const program = draft.programs.find((p) => p.id === liveSession.programId);
        if (program) {
          program.blocks
            .flatMap((b) => b.weeks)
            .flatMap((w) => w.workouts)
            .flatMap((d) => d.exercises)
            .flatMap((e) => e.plannedSets)
            .forEach((ps) => { if (ps.id === targetId) ps.plannedWeight = suggestedWeight; });
        }
      }
      return draft;
    });
  }

  function finishWorkout() {
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      // Move to review — actual finalization happens when user confirms in the summary overlay.
      if (target && target.status === "in-progress") {
        target.status = "review";
        target.updatedAt = nowIso();
      }
      return draft;
    });
    const summary = buildCompletionSummary(liveSession);
    setCompletionSummary(summary);
    setShowCompletionSummary(true);
  }

  function confirmAddOffProgramExercise(exercise: Exercise) {
    const newLogId = createId("logex");
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (!target) return draft;
      const plannedWeight = getOffProgramStartingWeight({ db: draft, user, exercise, targetReps: 8, targetRpe: 7 });
      const runtimePlannedSets = normalizeLoggerRuntimePlannedSets(
        buildOffProgramPlannedSets(3, 8, 7, plannedWeight),
        3,
        8,
        7,
        plannedWeight
      );
      target.loggedExercises.push({
        id: newLogId,
        exerciseId: exercise.id,
        plannedExerciseId: undefined,
        order: target.loggedExercises.length + 1,
        sets: [],
        weakPointTags: [],
        offProgram: true,
        offProgramPlannedSets: runtimePlannedSets,
      });
      if (editingCompletedWorkout && target.status === "completed") {
        target.status = "in-progress";
      } else if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) {
        target.status = "in-progress";
      }
      target.updatedAt = nowIso();
      return draft;
    });
    setPendingOffProgramExercise(undefined);
    setActiveExerciseId(newLogId);
  }

  return (
    <div className="space-y-5">
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
          <div className="panel w-full max-w-sm space-y-4 p-6">
            <h3 className="text-lg font-semibold">Finish exercise early?</h3>
            <p className="text-sm text-iron-300">
              {uncoveredPlannedSets.length} set{uncoveredPlannedSets.length !== 1 ? "s" : ""} remaining will be marked as skipped.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-secondary" onClick={() => setShowFinishConfirm(false)}>Cancel</button>
              <button className="tap-highlight inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#0a84ff] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.97]" onClick={skipRemainingAndNavigate}>Skip & Finish</button>
            </div>
          </div>
        </div>
      )}
      {showSkipExerciseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
          <div className="panel w-full max-w-sm space-y-4 p-6">
            <h3 className="text-lg font-semibold">Skip entire exercise?</h3>
            <p className="text-sm text-iron-300">
              This will mark every unfinished set in this exercise as skipped. Completed sets will stay logged.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-secondary" onClick={() => setShowSkipExerciseConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={skipEntireExercise}>Skip Exercise</button>
            </div>
          </div>
        </div>
      )}
      {pendingRemoveExerciseLogId && (() => {
        const targetLog = session.loggedExercises.find((logged) => logged.id === pendingRemoveExerciseLogId);
        const targetExercise = targetLog ? db.exercises.find((item) => item.id === targetLog.exerciseId) : undefined;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
            <div className="panel w-full max-w-sm space-y-4 p-6">
              <h3 className="text-lg font-semibold">Remove exercise from this workout?</h3>
              <p className="text-sm text-iron-300">
                {targetExercise?.name ? `${targetExercise.name} will be removed from this workout only.` : "This exercise will be removed from this workout only."} It will stay in your Library.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button className="btn-secondary" onClick={() => setPendingRemoveExerciseLogId(null)}>Cancel</button>
                <button className="btn-danger" onClick={() => removeExerciseFromSession(pendingRemoveExerciseLogId)}>Remove Exercise</button>
              </div>
            </div>
          </div>
        );
      })()}
      {pendingDeleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
          <div className="panel w-full max-w-sm space-y-4 p-6">
            <h3 className="text-lg font-semibold">Delete this set?</h3>
            <p className="text-sm text-iron-300">
              Delete this set? Use Delete for entry mistakes or removing an unwanted planned set. Use Skip to record a missed set.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-secondary" onClick={() => { setPendingDeleteTarget(null); setOpenSwipeSetId(undefined); swipeGestureRef.current = null; setSwipeDrag(null); }}>Cancel</button>
              <button
                className="btn-danger"
                onClick={() => {
                  loggerDebug("DELETE_SET_START", { pendingDeleteTarget });
                  const targetDelete = pendingDeleteTarget;
                  const deletingLineupIndex = targetDelete
                    ? lineupItems.findIndex((item) => {
                      if (targetDelete.actualSetId && item.actualSet?.id === targetDelete.actualSetId) return true;
                      if (targetDelete.plannedSetId && item.plannedSet?.id === targetDelete.plannedSetId) return true;
                      return item.key === targetDelete.lineupKey;
                    })
                    : -1;
                  const previousLineupItem = deletingLineupIndex > 0 ? lineupItems[deletingLineupIndex - 1] : undefined;
                  const nextLineupItem = deletingLineupIndex >= 0 ? lineupItems[deletingLineupIndex + 1] : undefined;
                  setPendingDeleteTarget(null);
                  void updateDb((draft) => {
                    const target = draft.sessions.find((item) => item.id === liveSession.id);
                    const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
                    if (log && targetDelete) {
                      if (targetDelete.actualSetId) {
                        const deletedIndex = log.sets.findIndex((set) => set.id === targetDelete.actualSetId);
                        const deletedSet = deletedIndex >= 0 ? log.sets[deletedIndex] : undefined;
                        if (deletedIndex >= 0) log.sets.splice(deletedIndex, 1);
                        if (deletedSet?.plannedSetId && deletedSet.added) {
                          log.deletedPlannedSetIds = Array.from(new Set([...(log.deletedPlannedSetIds || []), deletedSet.plannedSetId]));
                        }
                      } else if (targetDelete.plannedSetId) {
                        log.deletedPlannedSetIds = Array.from(new Set([...(log.deletedPlannedSetIds || []), targetDelete.plannedSetId]));
                      }
                      log.sets.forEach((s, i) => { s.setNumber = i + 1; });
                      log.weakPointTags = detectWeakPointTags(log);
                    }
                    if (target) {
                      if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) target.status = "in-progress";
                      const logIndex = target.loggedExercises.findIndex((item) => item.id === liveExerciseLog.id);
                      if (logIndex >= 0 && target.currentExerciseIndex === logIndex && log) {
                        const updatedPlanned = findPlannedExercise(draft, target, log);
                        const updatedPlannedSets = getLoggedExercisePlannedSets(log, updatedPlanned);
                        target.currentSetIndex = getResumeSetIndex(log, updatedPlannedSets);
                      }
                      target.updatedAt = nowIso();
                    }
                    return draft;
                  });
                  setOpenSwipeSetId(undefined);
                  swipeGestureRef.current = null;
                  setSwipeDrag(null);
                  if (targetDelete?.actualSetId && editingSetId === targetDelete.actualSetId) setEditingSetId(null);
                  if (targetDelete?.actualSetId && focusedActualSetId === targetDelete.actualSetId) {
                    setFocusedActualSetId(null);
                  }
                  if (previousLineupItem) {
                    focusLineupItem(previousLineupItem);
                  } else if (nextLineupItem) {
                    focusLineupItem(nextLineupItem);
                  } else {
                    setSelectedLoggingIndex(null);
                    setFocusedActualSetId(null);
                    setEditingSetId(null);
                  }
                  loggerDebug("DELETE_SET_END", { deletedActualSetId: targetDelete?.actualSetId, deletedPlannedSetId: targetDelete?.plannedSetId });
                }}
              >
                Delete Set
              </button>
            </div>
          </div>
        </div>
      )}
      {exerciseContextMenuId && (() => {
        const menuLog = session.loggedExercises.find((l) => l.id === exerciseContextMenuId);
        const menuExercise = menuLog ? db.exercises.find((e) => e.id === menuLog.exerciseId) : undefined;
        return (
          <ActionSheet
            title={menuExercise?.name}
            onDismiss={() => setExerciseContextMenuId(null)}
            items={[
              {
                label: "Add Set",
                icon: <Plus className="h-4 w-4" />,
                onClick: () => {
                  if (menuLog) {
                    if (menuLog.id !== activeExerciseLog.id) {
                      setActiveExerciseId(menuLog.id);
                      setSelectedLoggingIndex(null);
                      setEditingSetId(null);
                    }
                    addSet(menuLog.id);
                    return;
                  }
                  addSet();
                },
              },
              {
                label: "Skip Entire Exercise",
                icon: <X className="h-4 w-4" />,
                destructive: true,
                onClick: () => {
                  if (menuLog && menuLog.id !== activeExerciseLog.id) {
                    setActiveExerciseId(menuLog.id);
                  }
                  setShowSkipExerciseConfirm(true);
                },
              },
              {
                label: "Remove Exercise",
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                onClick: () => {
                  if (!menuLog) return;
                  setPendingRemoveExerciseLogId(menuLog.id);
                },
              },
            ]}
          />
        );
      })()}
      {setContextMenuId && (() => {
        const menuActual = liveExerciseLog.sets.find((s) => s.id === setContextMenuId);
        const menuLineup = lineupItems.find((item) =>
          item.actualSet?.id === setContextMenuId
          || item.plannedSet?.id === setContextMenuId
          || item.key === setContextMenuId
        );
        const canSkip = !isPastLastPlannedSet && !isEditingLoggedSet;
        return (
          <ActionSheet
            title={`Set ${(menuLineup?.displayIndex ?? 0) + 1}`}
            onDismiss={() => setSetContextMenuId(null)}
            items={[
              {
                label: menuActual ? "Edit Set" : "Jump to Set",
                icon: <Pencil className="h-4 w-4" />,
                onClick: () => {
                  selectExactLineupItemForEditing(menuLineup);
                },
              },
              {
                label: "Skip Set",
                icon: <X className="h-4 w-4" />,
                destructive: true,
                disabled: !canSkip,
                onClick: () => {
                  if (menuLineup?.plannedIndex !== undefined) {
                    skipAtPlannedIndex(menuLineup.plannedIndex);
                    return;
                  }
                  skipSet();
                },
              },
              {
                label: "Delete Set",
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                onClick: () => {
                  setPendingDeleteTarget({
                    actualSetId: menuActual?.id,
                    plannedSetId: menuLineup?.plannedSet?.id,
                    lineupKey: menuLineup?.key ?? setContextMenuId,
                  });
                },
              },
            ]}
          />
        );
      })()}
      {showCompletionSummary && completionSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/90 px-4">
          <div className="panel w-full max-w-sm space-y-4 p-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-volt">{completionSummary.score}<span className="text-base font-normal text-iron-500">/100</span></p>
              <p className="mt-1 text-sm capitalize text-iron-300">{completionSummary.status} · workout complete</p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/[0.04] p-3">
              <div className="text-center">
                <p className="text-lg font-bold">{completionSummary.hardSets}</p>
                <p className="text-xs text-iron-500">Hard sets</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{completionSummary.completedSets}</p>
                <p className="text-xs text-iron-500">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{completionSummary.skippedSets}</p>
                <p className="text-xs text-iron-500">Skipped</p>
              </div>
            </div>
            {completionSummary.suggestions.slice(0, 2).map((s, i) => (
              <p key={i} className="text-xs text-iron-400">{s}</p>
            ))}
            <div className="space-y-2">
              <button
                className="apollo-primary-btn w-full"
                onClick={() => {
                  // Real finalization: compute scores, create perf logs, advance block.
                  void updateDb((draft) => {
                    const target = draft.sessions.find((item) => item.id === liveSession.id);
                    if (target) finishWorkoutInDraft(draft, user, target);
                    return draft;
                  });
                  clearActiveWorkoutSessionDraft(user.id, liveSession.id);
                  setShowCompletionSummary(false);
                  setActiveSessionId(undefined);
                  if (editingCompletedWorkout) {
                    backToSummary();
                  } else {
                    setScreen("today");
                  }
                }}
              >
                {finishWorkoutLabel}
              </button>
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  setShowCompletionSummary(false);
                  setShowAddExercisePicker(true);
                }}
              >
                Add Exercise
              </button>
              <button
                className="btn-ghost w-full"
                onClick={() => {
                  setShowCompletionSummary(false);
                }}
              >
                Continue Editing
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Compact logger header — replaces Iron Orbit app header during logging */}
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 flex-1">
          <button
            className="tap-highlight mb-1 flex items-center gap-0.5 text-xs text-iron-500 transition hover:text-iron-300 active:scale-[0.97]"
            onClick={backToToday}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {navigation.previousScreen === "week" ? "Week" : "Today"}
          </button>
          <h1 className="truncate text-lg font-black leading-tight">{session.name}</h1>
          {session.readiness && (
            <p className="mt-0.5 text-xs text-iron-500">
              Readiness <span className="font-medium text-iron-400">{session.readiness.readinessScore}/100</span>
              {" · "}{readinessAdjustment(session.readiness).explanation}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 mt-1">
          {!isPastLastPlannedSet && !isEditingLoggedSet && (
            <button
              className="tap-highlight px-2 py-1 text-xs font-medium text-orange-400/70 transition hover:text-orange-300 active:scale-[0.97]"
              onClick={() => { setShowSkipExerciseConfirm(true); setShowFinishConfirm(false); }}
            >
              Skip Exercise
            </button>
          )}
          <button
            className="tap-highlight rounded-md p-1.5 text-iron-500 transition hover:bg-white/[0.07] hover:text-iron-300 active:scale-[0.97]"
            onClick={() => setScreen("settings")}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
      {editingCompletedWorkout && (
        <div className="flex items-center gap-3 border-l-2 border-[#0a84ff]/60 pl-3 py-1">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-[#0a84ff]">Editing completed workout</span>
            <span className="mx-1.5 text-iron-700">·</span>
            <span className="text-xs text-iron-500">Edit sets or add exercises, then save.</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {navigation.completedReviewState && (
              <button className="btn-compact" onClick={backToSummary}>Summary</button>
            )}
            <button className="btn-compact" onClick={backToToday}>Back to Today</button>
          </div>
        </div>
      )}
      {!session.readiness && (
        <ReadinessCard
          draft={readinessDraft}
          onDraftChange={updateReadinessDraftImmediately}
          onSubmit={addReadiness}
          user={user}
        />
      )}

      {/* Exercise tab strip — all screen sizes */}
      {session.loggedExercises.length > 1 && (
        <div className="scrollbar-none -mx-3 flex overflow-x-auto border-b border-white/[0.06] sm:-mx-4">
          {session.loggedExercises.map((logged) => {
            const item = db.exercises.find((candidate) => candidate.id === logged.exerciseId);
            const isActive = activeExerciseLog.id === logged.id;
            const hardSets = logged.sets.filter(isHardSet).length;
            const totalSets = logged.sets.length;
            return (
              <button
                key={logged.id}
                className={`logger-tab ${isActive ? "logger-tab-active" : "logger-tab-inactive"}`}
                onClick={() => {
                  setActiveExerciseId(logged.id);
                  setSelectedLoggingIndex(null);
                  setEditingSetId(null);
                  setOpenSwipeSetId(undefined);
                  swipeGestureRef.current = null;
                  setSwipeDrag(null);
                  setPendingDeleteTarget(null);
                  persistActiveWorkoutDraftImmediately({
                    activeExerciseId: logged.id,
                    activeSetActualId: null,
                    activeSetPlannedId: null,
                    activeSetPlannedIndex: 0,
                    selectionMode: "planned",
                  });
                }}
                onPointerDown={() => {
                  if (exerciseLongPressTimerRef.current) clearTimeout(exerciseLongPressTimerRef.current);
                  exerciseLongPressTimerRef.current = window.setTimeout(() => {
                    exerciseLongPressTimerRef.current = null;
                    setExerciseContextMenuId(logged.id);
                  }, 500);
                }}
                onPointerUp={() => { if (exerciseLongPressTimerRef.current) { clearTimeout(exerciseLongPressTimerRef.current); exerciseLongPressTimerRef.current = null; } }}
                onPointerLeave={() => { if (exerciseLongPressTimerRef.current) { clearTimeout(exerciseLongPressTimerRef.current); exerciseLongPressTimerRef.current = null; } }}
                onPointerCancel={() => { if (exerciseLongPressTimerRef.current) { clearTimeout(exerciseLongPressTimerRef.current); exerciseLongPressTimerRef.current = null; } }}
              >
                <span className={`block min-h-[2.2rem] max-w-[7rem] line-clamp-2 text-xs font-medium leading-snug ${isActive ? "text-white" : "text-iron-300"}`}>{item?.name}</span>
                <span className={`text-[0.65rem] ${isActive ? "text-[#0a84ff]/70" : "text-iron-600"}`}>{hardSets}/{totalSets}</span>
              </button>
            );
          })}
        </div>
      )}

      <section className="min-w-0 space-y-4 pb-6 max-xl:pb-24">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] py-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold leading-tight text-iron-200">{exercise.name}</h3>
                {exercise.setupCues.length > 0 && (
                  <p className="text-xs text-iron-400">{exercise.setupCues.slice(0, 2).join(" · ")}</p>
                )}
                {activeGym?.name && (
                  <p className="text-xs text-iron-600">{activeGym.name}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <RestTimer seconds={restRemaining} setSeconds={setRestRemaining} />
                <button
                  className="tap-highlight rounded-md p-1.5 text-iron-500 transition hover:bg-white/[0.07] hover:text-iron-300 active:scale-[0.97]"
                  onClick={() => setExerciseContextMenuId(activeExerciseLog.id)}
                  aria-label="Exercise actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
            {compatibleMachines.length > 0 && (
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-2.5">
                <span className="shrink-0 text-sm text-iron-400">Machine</span>
                <select
                  className="cursor-pointer appearance-none bg-transparent text-right text-sm text-iron-200 outline-none"
                  value={activeExerciseLog.machineId || ""}
                  onChange={(event) =>
                    updateDb((draft) => {
                      const target = draft.sessions.find((item) => item.id === liveSession.id);
                      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
                      if (log) log.machineId = event.target.value || undefined;
                      return draft;
                    })
                  }
                >
                  <option value="">Select station ›</option>
                  {compatibleMachines.map((machine) => (
                    <option key={machine.id} value={machine.id}>{machine.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_21rem] xl:gap-6 xl:items-start">
              <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-iron-400">Set lineup</p>
                <p className="text-xs font-medium text-iron-500">{completedPlannedCount} / {totalPlannedCount || lineupItems.length} planned</p>
              </div>
              <div ref={setLineupRef} className="list-section">
                {lineupItems.map((lineupItem, lineupIndex) => {
                  const set = lineupItem.plannedSet;
                  const actual = lineupItem.actualSet;
                  const isEditingThisRow = !!actual && editingSetId === actual.id;
                  const isSelected = isEditingThisRow
                    || (!!actual && focusedActualSetId === actual.id)
                    || (!selectedActualLineupItem && !isEditingLoggedSet && lineupItem.plannedIndex !== undefined && effectiveSetIndex === lineupItem.plannedIndex);
                  const isLoggedSet = !!actual;
                  const statusLabel = isEditingThisRow ? "Editing" : actual?.skipped ? "Skipped" : actual ? "Done" : isSelected ? "Current" : "Pending";
                  // Pending rows use planned set id so they can also be swiped.
                  const swipeRowId = actual?.id ?? set?.id;
                  const isSwipeOpen = isSwipeEnabled && !!swipeRowId && openSwipeSetId === swipeRowId;
                  // translateX is derived solely from confirmed drag or snapped-open state —
                  // never from touch start, press, or hold.
                  const isDraggingThisRow = isSwipeEnabled && !!swipeRowId && swipeDrag?.setId === swipeRowId;
                  const translateX = isDraggingThisRow
                    ? swipeDrag!.offsetX
                    : isSwipeOpen
                      ? -SWIPE_DELETE_WIDTH
                      : 0;
                  // Reveal opacity and pointer-events are fully derived from translateX.
                  const deleteOpacity = Math.min(1, Math.abs(translateX) / SWIPE_DELETE_WIDTH);
                  // Pending (unlogged) non-extra rows reveal Skip; logged rows reveal Delete.
                  const isPendingRow = !actual && !!set && !lineupItem.isExtra;
                  const showSwipeSkipReveal = isSwipeEnabled && isPendingRow;
                  const showSwipeDeleteReveal = isSwipeEnabled && !!actual;
                  const plannedWeightText = bodyweightMovement
                    ? formatExerciseLoadText({ exercise: liveExercise, user, weight: set?.plannedWeight, unit: exerciseUnit })
                    : set?.plannedWeight && set.plannedWeight > 0
                      ? `${formatWeight(set.plannedWeight, exerciseUnit)} ${exerciseUnit}`
                      : lineupItem.isExtra ? "Extra set" : "Enter starting weight";
                  const actualWeightText = actual && !actual.skipped
                    ? formatExerciseLoadText({ exercise: liveExercise, user, weight: actual.actualWeight, unit: actual.unit || exerciseUnit })
                    : undefined;
                  // No active: classes — content must never become transparent on press/touch.
                  const rowBg = isEditingThisRow
                    ? "bg-[#0a84ff]/[0.07]"
                    : isSelected
                      ? "bg-[#0a84ff]/[0.04]"
                      : actual
                        ? "bg-iron-900/40"
                        : "bg-transparent";
                  const menuRowId = actual?.id ?? set?.id ?? lineupItem.key;
                  return (
                    <div
                      key={lineupItem.key}
                      data-swipe-row-id={swipeRowId}
                      data-is-current-set={isSelected && !isEditingThisRow && !actual ? "true" : undefined}
                      className="relative overflow-hidden"
                    >
                      {lineupIndex > 0 && (
                        <div className="absolute inset-x-0 top-0 h-px bg-white/[0.05]" style={{ transform: isSwipeEnabled && translateX !== 0 ? `translateX(${translateX}px)` : undefined }} />
                      )}
                      {(showSwipeSkipReveal || showSwipeDeleteReveal) && (
                        <div
                          className={`absolute inset-y-0 right-0 z-0 flex w-24 items-stretch justify-center ${showSwipeSkipReveal ? "bg-orange-600/80" : "bg-ember/90"}`}
                          style={{ opacity: deleteOpacity, pointerEvents: isSwipeOpen ? "auto" : "none" }}
                        >
                          {showSwipeSkipReveal ? (
                            <button
                              className="flex w-full items-center justify-center px-4 text-sm font-black text-orange-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (lineupItem.plannedIndex !== undefined) {
                                  skipAtPlannedIndex(lineupItem.plannedIndex);
                                  setOpenSwipeSetId(undefined);
                                }
                              }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                if (swipeSkipHoldTimerRef.current) clearTimeout(swipeSkipHoldTimerRef.current);
                                swipeSkipHoldTimerRef.current = window.setTimeout(() => {
                                  swipeSkipHoldTimerRef.current = null;
                                  setPendingDeleteTarget({ plannedSetId: set?.id, lineupKey: lineupItem.key });
                                }, 600);
                              }}
                              onPointerUp={() => { if (swipeSkipHoldTimerRef.current) { clearTimeout(swipeSkipHoldTimerRef.current); swipeSkipHoldTimerRef.current = null; } }}
                              onPointerLeave={() => { if (swipeSkipHoldTimerRef.current) { clearTimeout(swipeSkipHoldTimerRef.current); swipeSkipHoldTimerRef.current = null; } }}
                              onPointerCancel={() => { if (swipeSkipHoldTimerRef.current) { clearTimeout(swipeSkipHoldTimerRef.current); swipeSkipHoldTimerRef.current = null; } }}
                              title="Skip this set · hold to delete"
                            >
                              Skip
                            </button>
                          ) : (
                            <button
                              className="flex w-full items-center justify-center px-4 text-sm font-black text-orange-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteTarget({ actualSetId: actual?.id, plannedSetId: set?.id, lineupKey: lineupItem.key });
                              }}
                              title="Delete this set (entry mistake only)"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                      {(isEditingThisRow || isSelected) && (
                        <div className={`absolute inset-y-0 left-0 w-0.5 ${isEditingThisRow ? "bg-[#0a84ff]/80" : "bg-[#0a84ff]/50"}`} />
                      )}
                      <div
                        className={`relative z-10 px-3 py-2.5 cursor-pointer ${rowBg}`}
                        role="button"
                        tabIndex={0}
                        style={{
                          transform: isSwipeEnabled && translateX !== 0 ? `translateX(${translateX}px)` : undefined,
                          touchAction: isSwipeEnabled ? "pan-y" : undefined,
                          transition: isDraggingThisRow ? undefined : "transform 200ms ease",
                        }}
                        onClick={() => {
                          // Ignore the synthesized click that fires immediately after a swipe gesture ends.
                          if (swipeJustOpenedRef.current) {
                            swipeJustOpenedRef.current = false;
                            return;
                          }
                          if (isSwipeOpen) {
                            setOpenSwipeSetId(undefined);
                            return;
                          }
                          selectExactLineupItemForEditing(lineupItem);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                        onTouchStart={(event) => {
                          if (!isSwipeEnabled || !swipeRowId) return;
                          startSetSwipe(swipeRowId, event.touches[0].clientX, event.touches[0].clientY);
                        }}
                        onTouchMove={(event) => {
                          if (!isSwipeEnabled) return;
                          moveSetSwipe(event.touches[0].clientX, event.touches[0].clientY);
                        }}
                        onTouchEnd={() => {
                          if (!isSwipeEnabled) return;
                          endSetSwipe();
                        }}
                        onTouchCancel={() => cancelSetSwipe()}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold">Set {lineupItem.displayIndex + 1}</span>
                              {!(actual && !actual.skipped && !isEditingThisRow) && (
                                <span className={`text-xs font-medium ${isSelected && !isEditingThisRow ? "text-[#0a84ff]" : actual?.skipped ? "text-orange-400/70" : "text-iron-600"}`}>{statusLabel}</span>
                              )}
                              {(set?.kind || actual?.kind) && (set?.kind || actual?.kind) !== "working" && (
                                <span className="text-xs text-iron-600">{set?.kind || actual?.kind}</span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs">
                              {set && !actual && (
                                <span className="text-iron-500">{plannedWeightText} × {set.targetReps}{set.targetRpe ? ` @ ${set.targetRpe}` : ""}</span>
                              )}
                              {!set && !actual && <span className="text-iron-600">Extra set</span>}
                              {actual && !actual.skipped && (
                                <span className={isLoggedSet && !isEditingThisRow ? "text-[#0a84ff]/90 font-medium" : "text-iron-400"}>
                                  {actualWeightText || getBodyweightPreviewLabel(liveExercise)} × {actual.actualReps}{actual.actualRpe ? ` @ ${actual.actualRpe}` : ""}
                                </span>
                              )}
                              {actual?.skipped && <span className="text-orange-400/60">Skipped</span>}
                              {actual && set && !actual.skipped && (
                                <span className="text-iron-700">· planned {plannedWeightText} × {set.targetReps}</span>
                              )}
                            </div>
                          </div>
                          {actual && !actual.skipped && !isEditingThisRow ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-[#0a84ff]/60" />
                          ) : !isSwipeEnabled ? (
                            <button
                              className="shrink-0 rounded p-1 text-iron-600 transition hover:bg-white/[0.08] hover:text-iron-300 active:scale-95"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSetContextMenuId(menuRowId);
                              }}
                              title="Set options"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!lineupItems.length && (
                  <div className="px-4 py-6">
                    <EmptyState title="No planned sets" detail="Add a set or pick a planned exercise before logging." />
                  </div>
                )}
              </div>
              </div>
              <div>
            <div className="logger-input-list">
              <div className="logger-input-row">
                <label className="logger-input-label" htmlFor="li-weight">
                  {bodyweightMovement ? "Added load" : "Weight"}
                </label>
                <div className="flex items-center gap-2">
                  <button className="logger-step-btn" onClick={() => adjustWeight(-exerciseIncrement)}><Minus className="h-3.5 w-3.5" /></button>
                  <div className="logger-input-control">
                    <input
                      id="li-weight"
                      className="logger-input-value"
                      inputMode="decimal"
                      type="number"
                      step="1"
                      value={setDraft.actualWeight}
                      placeholder={bodyweightMovement ? "BW" : undefined}
                      onChange={(e) => updateSetDraftImmediately((draft) => ({ ...draft, actualWeight: e.target.value }))}
                    />
                    <span className="logger-input-unit">{exerciseUnit}</span>
                  </div>
                  <button className="logger-step-btn" onClick={() => adjustWeight(exerciseIncrement)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="logger-input-divider" />
              <div className="logger-input-row">
                <label className="logger-input-label" htmlFor="li-reps">Reps</label>
                <div className="flex items-center gap-2">
                  <button className="logger-step-btn" onClick={() => adjustReps(-1)}><Minus className="h-3.5 w-3.5" /></button>
                  <div className="logger-input-control">
                    <input
                      id="li-reps"
                      className="logger-input-value"
                      inputMode="decimal"
                      type="number"
                      step="1"
                      value={setDraft.actualReps}
                      onChange={(e) => updateSetDraftImmediately((draft) => ({ ...draft, actualReps: e.target.value }))}
                    />
                  </div>
                  <button className="logger-step-btn" onClick={() => adjustReps(1)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="logger-input-divider" />
              <div className="logger-input-row">
                <label className="logger-input-label" htmlFor="li-rpe">RPE</label>
                <div className="flex items-center gap-2">
                  <button className="logger-step-btn" onClick={() => adjustRpe(-0.5)}><Minus className="h-3.5 w-3.5" /></button>
                  <div className="logger-input-control">
                    <input
                      id="li-rpe"
                      className="logger-input-value"
                      inputMode="decimal"
                      type="number"
                      step="0.5"
                      value={setDraft.actualRpe}
                      onChange={(e) => updateSetDraftImmediately((draft) => ({ ...draft, actualRpe: e.target.value }))}
                    />
                  </div>
                  <button className="logger-step-btn" onClick={() => adjustRpe(0.5)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
            <p className="logger-input-meta mt-1.5">{bodyweightMovement ? `Added-load increment: ${exerciseIncrement} ${exerciseUnit}` : `Increment: ${exerciseIncrement} ${exerciseUnit}`}</p>
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-iron-500">Difficulty <span className="text-iron-600">· 1 harder · 3 as planned · 5 easy</span></p>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as SetRating[]).map((rating) => {
                const labels: Record<number, string> = { 1: "1\nHarder", 2: "2\nA bit hard", 3: "3\nAs planned", 4: "4\nA bit easy", 5: "5\nEasy" };
                return (
                  <button key={rating} className={`min-h-10 rounded-sm text-[0.62rem] font-semibold leading-tight transition ${setDraft.setRating === rating ? "bg-[#0a84ff] text-white" : "bg-white/[0.06] text-iron-400 hover:bg-white/10 hover:text-iron-200"}`} onClick={() => updateSetDraftImmediately((draft) => ({ ...draft, setRating: rating }))}>
                    {labels[rating].split("\n").map((line, i) => <span key={i} className={i === 0 ? "block text-xs" : "block opacity-70"}>{line}</span>)}
                  </button>
                );
              })}
            </div>
            {/* Notes: collapsed by default to reduce friction. Data is preserved. */}
            <div className="mt-4">
              {!showSetNotes && !setDraft.notes
                ? (
                  <button className="text-xs font-bold text-iron-500 hover:text-iron-300" onClick={() => { setShowSetNotes(true); persistActiveWorkoutDraftImmediately({ showSetNotes: true }); }}>
                    + Add note
                  </button>
                ) : (
                  <div>
                    {!showSetNotes && setDraft.notes && (
                      <button className="mb-1 text-xs font-bold text-iron-400 hover:text-iron-200" onClick={() => { setShowSetNotes(true); persistActiveWorkoutDraftImmediately({ showSetNotes: true }); }}>
                        Note: {setDraft.notes.slice(0, 60)}{setDraft.notes.length > 60 ? "…" : ""} (tap to edit)
                      </button>
                    )}
                    {showSetNotes && (
                      <textarea
                        className="field min-h-14"
                        placeholder="Optional set notes..."
                        value={setDraft.notes}
                        onChange={(event) => updateSetDraftImmediately((draft) => ({ ...draft, notes: event.target.value }), { showSetNotes: true })}
                      />
                    )}
                  </div>
                )
              }
            </div>
            {lastSetWasSkipped && (
              <p className="mt-3 text-xs text-iron-600">Last set skipped — no recommendation.</p>
            )}
            {!showRecommendationCard && !selectedActualSet && recommendationFeedbackText && (
              <p className="mt-3 text-xs text-iron-500">{recommendationFeedbackText}</p>
            )}
            {showRecommendationCard && !selectedActualSet && recommendation && (() => {
              const suggestedWeight = recommendation.action?.suggestedWeight;
              const sourceSetNum = sourceSet?.setNumber;
              if (!suggestedWeight && !recommendation.title) return null;
              return (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-2">
                  <p className="text-xs text-iron-500">
                    <span className="text-iron-400">Suggested:</span>{" "}
                    {suggestedWeight
                      ? `${formatExerciseLoadText({ exercise: liveExercise, user, weight: suggestedWeight, unit: exerciseUnit })} · based on ${sourceSetNum ? `set ${sourceSetNum}` : "history"}`
                      : recommendation.title}
                  </p>
                  {suggestedWeight && (
                    <button
                      className="shrink-0 text-xs font-semibold text-[#0a84ff] transition hover:text-[#0a84ff]/70 active:scale-95"
                      onClick={() => applySuggestion(recommendation)}
                    >
                      Apply
                    </button>
                  )}
                </div>
              );
            })()}
            {/* Truly floating bottom action bar: fixed on mobile, sticky on desktop */}
            <div className="safe-bottom max-xl:fixed max-xl:bottom-0 max-xl:left-0 max-xl:right-0 max-xl:z-20 max-xl:border-t max-xl:border-white/[0.08] max-xl:bg-iron-950/90 max-xl:px-4 max-xl:py-3 max-xl:backdrop-blur-xl xl:mt-5 xl:border-t xl:border-white/[0.06] xl:pt-4">
              <div className="mx-auto flex max-w-7xl items-center gap-2 xl:max-w-none">
                {isEditingLoggedSet && (
                  <button className="tap-highlight shrink-0 inline-flex min-h-10 items-center justify-center rounded px-3 py-2 text-sm font-medium text-iron-400 transition hover:text-iron-200 active:scale-[0.97]" onClick={() => setEditingSetId(null)}>Cancel</button>
                )}
                <button
                  className="tap-highlight flex flex-1 items-center justify-center gap-2 rounded bg-[#0a84ff] px-4 py-2.5 text-sm font-bold text-white transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    if (isEditingLoggedSet) {
                      logSet(setDraft.setRating, "stay");
                      return;
                    }
                    if (derivedPrimaryAction === "next-set") {
                      loggerDebug("NEXT_SET_START", { fromLineupIndex: clampedActiveLineupIndex });
                      if (hasDraftValidValues && currentPendingSetIsUncovered && !isPastLastPlannedSet) {
                        logSet(setDraft.setRating, "next-set");
                        loggerDebug("NEXT_SET_END", { mode: "commit-and-advance" });
                        return;
                      }
                      focusLineupItem(activeLineupItem ? lineupItems[clampedActiveLineupIndex + 1] : undefined);
                      loggerDebug("NEXT_SET_END", { mode: "advance-only", toLineupIndex: clampedActiveLineupIndex + 1 });
                      return;
                    }
                    // "finish-exercise" and "finish-workout" both go through finishExercise(),
                    // which saves the active dirty set first and then navigates accordingly.
                    finishExercise();
                  }}
                >
                  <Check className="h-4 w-4" /> {primaryActionLabel}
                </button>
                <button className="tap-highlight shrink-0 inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/[0.1] bg-white/[0.07] px-4 py-2 text-sm font-medium text-iron-100 transition hover:bg-white/[0.1] active:scale-[0.97]" onClick={() => addSet()}>+ Set</button>
              </div>
            </div>
              </div>
            </div>

          <LoggedSetsTable logged={activeExerciseLog} exercise={exercise} user={user} displayUnit={exerciseUnit} />
          <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <button className="tap-highlight inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded border border-white/[0.1] bg-white/[0.07] px-3 py-2 text-sm font-medium text-iron-100 transition hover:bg-white/[0.1] active:scale-[0.97]" onClick={() => setShowAddExercisePicker(true)}>+ Add Exercise</button>
            <button className="tap-highlight inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded border border-ember/30 bg-ember/[0.07] px-3 py-2 text-sm font-medium text-orange-300 transition hover:bg-ember/[0.14] active:scale-[0.97]" onClick={abandonWorkout}>Abandon</button>
            <button
              className="tap-highlight ml-auto inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded border border-[#0a84ff]/40 bg-[#0a84ff]/[0.09] px-3 py-2 text-sm font-semibold text-[#0a84ff] transition hover:bg-[#0a84ff]/[0.16] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={finishWorkout}
              disabled={!allExercisesComplete}
            >
              {finishWorkoutLabel}
            </button>
          </div>
          {showAddExercisePicker && (
            <ExercisePicker
              db={db}
              user={user}
              updateDb={updateDb}
              variant="week-sheet"
              title="Add exercise"
              onClose={() => setShowAddExercisePicker(false)}
              onPick={(exercise) => {
                setShowAddExercisePicker(false);
                setPendingOffProgramExercise(exercise);
              }}
            />
          )}
          {pendingOffProgramExercise && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
              <div className="panel w-full max-w-sm space-y-4 p-6">
                <h3 className="text-xl font-black">Add {pendingOffProgramExercise.name}</h3>
                <p className="text-sm text-iron-300">Where should this exercise be added?</p>
                <div className="space-y-2">
                  <button
                    className="tap-highlight w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#0a84ff] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.97]"
                    onClick={() => confirmAddOffProgramExercise(pendingOffProgramExercise)}
                  >
                    This session only
                  </button>
                  <button
                    className="btn-secondary w-full cursor-not-allowed opacity-50"
                    disabled
                    title="Coming soon"
                  >
                    Future planned workouts
                    <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest">Soon</span>
                  </button>
                  <p className="text-xs text-iron-500">Updating future weeks from the logger is coming soon. Changes to future blocks can be made in the Block tab.</p>
                  <button className="btn-ghost w-full" onClick={() => setPendingOffProgramExercise(undefined)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
      </section>
    </div>
  );
}

function BuilderScreen({
  db,
  user,
  updateDb,
  setScreen
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  setScreen: (screen: Screen) => void;
}) {
  type TemplateLaunchMeta = {
    id: string;
    name: string;
    splitPreview: string;
    daysPerWeek: number;
    goalFocus: string;
    suitability: string;
    goodFor: string;
    includesSBD: boolean;
    estimatedSessions: number;
  };

  const splitTemplates = db.splitTemplates.filter((split) => !split.ownerUserId || split.ownerUserId === user.id);

  const defaultSplitId = splitTemplates[0]?.id || db.splitTemplates[0]?.id || "";
  const defaultRequest: ProgramRequest = {
    name: "",
    goal: user.goal,
    daysPerWeek: user.availableDaysPerWeek,
    blockType: "hypertrophy",
    blockLengthWeeks: 6,
    priorityMuscles: user.goal === "general-health" ? ["full-body" as MuscleGroup] : ["chest", "quads", "side-delts"],
    priorityExerciseIds: [],
    splitTemplateId: defaultSplitId,
    splitLoopMode: "continuous",
    compoundSettings: defaultCompoundSettings,
    buildMode: "manual",
    notes: ""
  };

  const savedDraft = loadBuilderDraft(user.id);
  const [selectedSplitId, setSelectedSplitId] = useState(savedDraft?.selectedSplitId || defaultSplitId);
  const [generationState, setGenerationState] = useState<{ status: "idle" | "loading" | "success" | "error"; message?: string }>({ status: "idle" });
  const [buildMode, setBuildMode] = useState<ProgramBuildMode>(savedDraft?.buildMode || "manual");
  const [showSbdAdvanced, setShowSbdAdvanced] = useState(false);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [showBlockTypeMenu, setShowBlockTypeMenu] = useState(false);
  const hydratedDraftProgramIdRef = useRef<string | null>(null);
  const [request, setRequest] = useState<ProgramRequest>(savedDraft ? {
    ...defaultRequest,
    name: savedDraft.requestName,
    goal: savedDraft.requestGoal,
    daysPerWeek: savedDraft.requestDaysPerWeek,
    blockType: savedDraft.requestBlockType,
    blockLengthWeeks: savedDraft.requestBlockLengthWeeks,
    splitTemplateId: savedDraft.selectedSplitId,
    splitLoopMode: savedDraft.requestSplitLoopMode,
    notes: savedDraft.requestNotes,
  } : defaultRequest);

  useEffect(() => {
    saveBuilderDraft(user.id, {
      selectedSplitId,
      buildMode,
      requestName: request.name,
      requestGoal: request.goal,
      requestDaysPerWeek: request.daysPerWeek,
      requestBlockType: request.blockType,
      requestBlockLengthWeeks: request.blockLengthWeeks,
      requestSplitLoopMode: request.splitLoopMode,
      requestNotes: request.notes,
      savedAt: new Date().toISOString(),
    });
  }, [user.id, selectedSplitId, buildMode, request.name, request.goal, request.daysPerWeek, request.blockType, request.blockLengthWeeks, request.splitLoopMode, request.notes]);

  function resetBuilderForm() {
    if (!confirm("Reset the form to defaults? This clears your draft selections.")) return;
    clearBuilderDraft(user.id);
    setSelectedSplitId(defaultSplitId);
    setBuildMode("manual");
    setShowSbdAdvanced(false);
    setRequest(defaultRequest);
    setGenerationState({ status: "idle" });
    void updateDb((draft) => {
      draft.programs = draft.programs.filter((program) => !(program.userId === user.id && program.status === "draft"));
      const targetActiveProgram = draft.programs.find((program) => program.userId === user.id && program.status === "active");
      draft.programGaps = targetActiveProgram ? analyzeProgramGaps(targetActiveProgram, draft) : [];
      return draft;
    });
  }
  const selectedSplit = useMemo(
    () => db.splitTemplates.find((split) => split.id === selectedSplitId),
    [db.splitTemplates, selectedSplitId]
  );
  const generatedSplit = useMemo(() => {
    const splitDays = selectedSplit?.days.length ? selectedSplit.days : [];
    return splitDays.length ? splitDays : generateSplitFromText({ daysPerWeek: request.daysPerWeek, goal: request.goal, text: request.notes });
  }, [request.daysPerWeek, request.goal, request.notes, selectedSplit]);
  const [blocksView, setBlocksView] = useState<"home" | "builder">("home");
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const draftProgram = db.programs.find((program) => program.userId === user.id && program.status === "draft");
  const workingProgram = draftProgram || activeProgram;
  const schedulePreview = useMemo(
    () => [0, 1].map((weekIndex) => buildSplitSchedule(generatedSplit, request.daysPerWeek, weekIndex, request.splitLoopMode)),
    [generatedSplit, request.daysPerWeek, request.splitLoopMode]
  );
  const archivedPrograms = db.programs.filter((p) => p.userId === user.id && p.status !== "active" && p.status !== "draft");
  const archivedCount = archivedPrograms.length;

  useEffect(() => {
    if (blocksView !== "builder") return;
    blockBuilderDebug("BUILDER_MOUNT", {
      selectedSplitId,
      blockNameInput: request.name,
      suggestedBlockName: `${selectedSplit?.name || "Custom"} Block`,
      hasCustomBlockName: request.name.trim().length > 0,
      daysCount: generatedSplit.length,
      requirementsCount: draftProgram?.blocks[0]?.weeks[0]?.workouts.reduce((sum, workout) => sum + deriveRequirements(workout, db.splitTemplates.flatMap((split) => split.days)).length, 0) ?? 0,
    });
  }, [blocksView, db.splitTemplates, draftProgram, generatedSplit.length, request.name, selectedSplit?.name, selectedSplitId]);

  useEffect(() => {
    if (blocksView !== "builder" || !draftProgram) return;
    if (hydratedDraftProgramIdRef.current === draftProgram.id) return;

    const draftBlock = draftProgram.blocks[0];
    const nextSplitId = draftProgram.splitTemplateId || draftBlock?.splitTemplateId || "";
    const nextRequest: ProgramRequest = {
      ...request,
      name: draftProgram.name || "",
      goal: draftProgram.goal,
      daysPerWeek: draftBlock?.trainingDaysPerWeek ?? request.daysPerWeek,
      blockType: draftBlock?.type ?? request.blockType,
      blockLengthWeeks: draftBlock?.lengthWeeks ?? draftBlock?.numberOfWeeks ?? request.blockLengthWeeks,
      splitTemplateId: nextSplitId || undefined,
      splitLoopMode: draftBlock?.loopMode ?? request.splitLoopMode,
    };

    blockBuilderDebug("DRAFT_LOADED", {
      selectedSplitId: nextSplitId,
      blockNameInput: nextRequest.name,
      suggestedBlockName: `${db.splitTemplates.find((split) => split.id === nextSplitId)?.name || "Custom"} Block`,
      hasCustomBlockName: nextRequest.name.trim().length > 0,
      daysCount: draftBlock?.weeks[0]?.workouts.length ?? 0,
      requirementsCount: draftBlock?.weeks[0]?.workouts.reduce((sum, workout) => sum + deriveRequirements(workout, db.splitTemplates.flatMap((split) => split.days)).length, 0) ?? 0,
    });

    hydratedDraftProgramIdRef.current = draftProgram.id;
    setSelectedSplitId((current) => current === nextSplitId ? current : nextSplitId);
    setRequest((current) => builderRequestBasicsEqual(current, nextRequest) ? current : nextRequest);
  }, [blocksView, db.splitTemplates, draftProgram, request]);

  function duplicate(program: Program) {
    const clone = cloneProgramAsActive(program);
    void updateDb((draft) => {
      draft.programs.forEach((item) => {
        if (item.userId === user.id && item.status === "active") item.status = "archived";
      });
      draft.programs.unshift(clone);
      const target = draft.users.find((item) => item.id === user.id);
      if (target) {
        target.activeProgramId = clone.id;
        target.activeBlockId = clone.blocks[0]?.id;
      }
      draft.programGaps = analyzeProgramGaps(clone, draft);
      return draft;
    });
  }

  const sbdExerciseIds = new Set(["ex_squat_comp", "ex_bench_comp", "ex_deadlift_comp", "ex_paused_squat", "ex_box_squat", "ex_paused_bench", "ex_deficit_deadlift"]);

  function hasSbdName(name?: string): boolean {
    if (!name) return false;
    const lowered = name.toLowerCase();
    return lowered.includes("squat") || lowered.includes("bench") || lowered.includes("deadlift");
  }

  function getTemplatePreview(split: SplitTemplate): string {
    if (split.days?.length) return split.days.map((day) => day.name).join(" · ");
    return `${split.daysPerWeek} day split`;
  }

  function getTemplateBestFor(split: SplitTemplate): string | undefined {
    const source = split.description?.trim() || split.notes?.trim();
    if (!source) return undefined;
    const sentence = source.split(/[.!?]/)[0]?.trim();
    return sentence || undefined;
  }

  function deriveTemplateMeta(split: SplitTemplate): TemplateLaunchMeta {
    const preview = getTemplatePreview(split);
    const includesSBD = split.days.some((day) => hasSbdName(day.mainLiftFocus) || hasSbdName(day.name) || day.movementPatterns.some((pattern) => pattern === "squat" || pattern === "hinge"))
      || hasSbdName(split.name)
      || split.goal === "powerlifting"
      || split.goal === "powerbuilding";

    const known: Record<string, Pick<TemplateLaunchMeta, "suitability" | "goodFor">> = {
      split_bodybuilding_ppl_3: {
        suitability: "beginner/intermediate friendly",
        goodFor: "simple structure, lower time commitment",
      },
      split_bodybuilding_ppl_6: {
        suitability: "intermediate/advanced",
        goodFor: "higher frequency and more weekly volume",
      },
      split_upper_lower_4: {
        suitability: "beginner/intermediate friendly",
        goodFor: "balanced recovery and predictable scheduling",
      },
      split_powerbuilding_ul_4: {
        suitability: "intermediate friendly",
        goodFor: "SBD exposure with bodybuilding accessories",
      },
      split_full_body_3: {
        suitability: "beginner/intermediate friendly",
        goodFor: "simple full-body progression and busy schedules",
      },
    };

    const fallbackSuitability =
      split.daysPerWeek >= 6 ? "intermediate/advanced" :
      split.daysPerWeek <= 3 ? "beginner/intermediate friendly" :
      "intermediate friendly";

    const fallbackGoodFor = getTemplateBestFor(split)
      || (split.goal === "powerbuilding"
        ? "balanced strength and hypertrophy work"
        : split.goal === "bodybuilding"
          ? "hypertrophy progress with clear weekly structure"
          : "simple full-body progression and busy schedules");

    return {
      id: split.id,
      name: split.name,
      splitPreview: preview,
      daysPerWeek: split.daysPerWeek,
      goalFocus: split.goal === "powerbuilding" ? "strength + hypertrophy" : split.goal,
      suitability: known[split.id]?.suitability ?? fallbackSuitability,
      goodFor: known[split.id]?.goodFor ?? fallbackGoodFor,
      includesSBD,
      estimatedSessions: split.daysPerWeek * request.blockLengthWeeks,
    };
  }

  const templateLaunchList = useMemo(
    () => splitTemplates.map(deriveTemplateMeta),
    [splitTemplates, request.blockLengthWeeks]
  );

  const hasSbdExposure = useMemo(() => {
    const fromActive = !!activeProgram?.blocks.some((block) =>
      block.weeks.some((week) => week.workouts.some((day) =>
        day.exercises.some((planned) => sbdExerciseIds.has(planned.exerciseId))
      ))
    );
    if (fromActive) return true;
    const fromHistory = db.sessions
      .filter((session) => session.userId === user.id && session.status === "completed")
      .some((session) => session.loggedExercises.some((logged) => sbdExerciseIds.has(logged.exerciseId)));
    return fromHistory;
  }, [activeProgram, db.sessions, user.id]);

  const recommendedTemplateMeta = useMemo(() => {
    const powerbuilding4 = templateLaunchList.find((template) => template.id === "split_powerbuilding_ul_4")
      || templateLaunchList.find((template) => template.name.toLowerCase().includes("powerbuilding") && template.daysPerWeek === 4);
    const fallback = templateLaunchList.find((template) => template.id === "split_bodybuilding_ppl_3")
      || templateLaunchList.find((template) => template.id === "split_upper_lower_4")
      || templateLaunchList[0];
    return hasSbdExposure && powerbuilding4 ? powerbuilding4 : fallback;
  }, [hasSbdExposure, templateLaunchList]);

  async function createProgram(mode: ProgramBuildMode, options?: { replaceExistingDraft?: boolean; splitIdOverride?: string; successMessage?: string }) {
    if (request.daysPerWeek < 1 || request.daysPerWeek > 7) {
      setGenerationState({ status: "error", message: "Choose between 1 and 7 training days per week." });
      return;
    }
    setBuildMode(mode);
    setGenerationState({ status: "loading", message: mode === "manual" ? "Creating a manual block draft..." : "Suggesting a complete program draft..." });
    try {
      const resolvedSplitId = options?.splitIdOverride ?? selectedSplitId;
      const resolvedSplit = db.splitTemplates.find((split) => split.id === resolvedSplitId);
      const splitDays = resolvedSplit?.days.length ? resolvedSplit.days : generatedSplit;
      const resolvedProgramName = request.name.trim() || `${resolvedSplit?.name || "Custom"} Block`;
      const draftRequest = {
        ...request,
        name: resolvedProgramName,
        buildMode: mode,
        splitTemplateId: resolvedSplitId,
        daysPerWeek: resolvedSplit?.daysPerWeek ?? request.daysPerWeek,
        splitDays
      };
      const program = generateProgram(user, db, draftRequest);
      program.blocks = program.blocks.map((block) => ({
        ...block,
        splitTemplateId: resolvedSplitId || undefined,
        blockType: draftRequest.blockType,
        goal: draftRequest.goal,
        numberOfWeeks: draftRequest.blockLengthWeeks,
        status: "draft",
        loopMode: draftRequest.splitLoopMode,
        weeks: block.weeks.map((week) => ({
          ...week,
          workouts: week.workouts.map((workout, dayIndex) => {
            const splitOffset = draftRequest.splitLoopMode === "weekly-reset" ? dayIndex : ((week.weekNumber - 1) * draftRequest.daysPerWeek) + dayIndex;
            const splitDay = splitDays.find((item) => workout.name.toLowerCase().includes(item.name.toLowerCase())) || splitDays[splitOffset % splitDays.length];
            return {
              ...workout,
              blockId: block.id,
              weekNumber: week.weekNumber,
              dayIndex: dayIndex + 1,
              splitDayId: splitDay?.id,
              targetMuscles: workout.targetMuscles || splitDay?.muscleGroups || [],
              movementPatterns: workout.movementPatterns || splitDay?.movementPatterns || [],
              status: "planned"
            };
          })
        }))
      }));
      await updateDb((draft) => {
        if (options?.replaceExistingDraft !== false) {
          draft.programs = draft.programs.filter((item) => !(item.userId === user.id && item.status === "draft"));
        }
        draft.programs.unshift(program);
        draft.programGaps = analyzeProgramGaps(program, draft);
        return draft;
      });
      setGenerationState({ status: "success", message: options?.successMessage || (mode === "manual" ? "Draft saved. Fill requirement slots in the day editor, then deploy when ready." : "Suggested draft created. Review and edit it before activating.") });
    } catch (error) {
      setGenerationState({ status: "error", message: error instanceof Error ? error.message : "Program generation failed." });
    }
  }

  function syncDraftProgramBasics() {
    if (!draftProgram) return;
    const resolvedName = request.name.trim() || `${selectedSplit?.name || "Custom"} Block`;
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === draftProgram.id);
      if (!targetProgram) return draft;
      targetProgram.name = resolvedName;
      targetProgram.goal = request.goal;
      targetProgram.splitTemplateId = selectedSplitId || undefined;
      targetProgram.updatedAt = nowIso();
      targetProgram.changeLog ||= [];
      targetProgram.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Updated draft basics", detail: "Updated block name, goal, and template selection." });
      const targetBlock = targetProgram.blocks[0];
      if (targetBlock) {
        targetBlock.goal = request.goal;
        targetBlock.splitTemplateId = selectedSplitId || undefined;
        targetBlock.trainingDaysPerWeek = request.daysPerWeek;
        targetBlock.lengthWeeks = request.blockLengthWeeks;
      }
      draft.programGaps = analyzeProgramGaps(targetProgram, draft);
      return draft;
    });
  }

  async function startNewBlock(splitId?: string, blank = false) {
    const hasExistingDraft = !!draftProgram;
    if (hasExistingDraft && !confirm("Start a new block draft? Your current draft will be replaced unless you resume it first.")) return;
    const chosenSplitId = blank ? "" : (splitId ?? selectedSplitId);
    const chosenSplit = db.splitTemplates.find((item) => item.id === chosenSplitId);
    hydratedDraftProgramIdRef.current = null;
    blockBuilderDebug("NEW_BLOCK_CLICK", {
      selectedSplitId: chosenSplitId,
      blockNameInput: request.name,
      suggestedBlockName: `${chosenSplit?.name || "Custom"} Block`,
      hasCustomBlockName: request.name.trim().length > 0,
      daysCount: chosenSplit?.days.length ?? 0,
    });
    setSelectedSplitId(chosenSplitId || "");
    setRequest((current) => ({
      ...defaultRequest,
      goal: chosenSplit?.goal ?? current.goal,
      splitTemplateId: chosenSplitId || undefined,
      daysPerWeek: chosenSplit?.daysPerWeek ?? defaultRequest.daysPerWeek,
      name: "",
    }));
    setBlocksView("builder");
    await createProgram("manual", {
      replaceExistingDraft: true,
      splitIdOverride: chosenSplitId || undefined,
      successMessage: blank
        ? "Custom draft started. Build your split and requirement slots manually."
        : "New draft started. Select a day to fill requirement slots."
    });
  }

  function activateProgram(program?: Program) {
    if (!program) return;
    if (activeProgram && activeProgram.id !== program.id && !confirm("Replace the current active block for this user? The old active block will move to history.")) return;
    void updateDb((draft) => {
      // Archive any in-progress/review workout sessions so Today starts clean
      draft.sessions.forEach((session) => {
        if (session.userId === user.id && (session.status === "in-progress" || session.status === "review")) {
          session.status = "abandoned";
          session.updatedAt = nowIso();
        }
      });
      draft.programs.forEach((item) => {
        if (item.userId === user.id && item.status === "active") {
          item.status = "archived";
          item.changeLog ||= [];
          item.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Archived", detail: "Replaced by an activated block." });
        }
      });
      const targetProgram = draft.programs.find((item) => item.id === program.id);
      if (targetProgram) {
        targetProgram.status = "active";
        targetProgram.blocks.forEach((block) => {
          block.status = "active";
          block.completedWorkoutDayIds = [];
          block.skippedWorkoutDayIds = [];
          syncActiveBlockProgress(block, []);
        });
        targetProgram.acceptedAt = nowIso();
        targetProgram.updatedAt = nowIso();
        targetProgram.changeLog ||= [];
        targetProgram.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Activated block", detail: "Block is now feeding Today and Analytics." });
        draft.programGaps = analyzeProgramGaps(targetProgram, draft);
        const targetUser = draft.users.find((item) => item.id === user.id);
        if (targetUser) {
          targetUser.activeProgramId = targetProgram.id;
          targetUser.activeBlockId = targetProgram.blocks[0]?.id;
        }
      }
      return draft;
    });
  }

  if (blocksView === "home") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Blocks</h1>
            <p className="mt-1 text-sm text-iron-500">
              {[activeProgram && "1 active", draftProgram && "1 draft", archivedCount > 0 && `${archivedCount} archived`].filter(Boolean).join(" · ") || "No blocks yet"}
            </p>
          </div>
          <button className="apollo-primary-btn" onClick={() => void startNewBlock()}>
            <Plus className="h-4 w-4" />
            New block
          </button>
        </div>

        {/* Draft in progress banner */}
        {draftProgram && (
          <div className="flex items-center gap-3 border border-[#c65f12]/40 bg-[#2a1500]/60 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#c65f12]/20 text-[#f4842a]">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Draft in progress</p>
              <p className="text-xs text-iron-400">{draftProgram.name || "Unnamed block"} · {draftProgram.blocks[0]?.lengthWeeks ?? request.blockLengthWeeks} weeks</p>
            </div>
            <button className="text-sm font-semibold text-[#f4842a]" onClick={() => {
              blockBuilderDebug("RESUME_BLOCK_CLICK", {
                selectedSplitId,
                blockNameInput: request.name,
                suggestedBlockName: `${selectedSplit?.name || "Custom"} Block`,
                hasCustomBlockName: request.name.trim().length > 0,
                daysCount: draftProgram.blocks[0]?.weeks[0]?.workouts.length ?? 0,
              });
              setBlocksView("builder");
            }}>Resume</button>
          </div>
        )}

        {/* Active block */}
        {activeProgram && (
          <section>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Active block</p>
            <div className="border border-white/[0.08] bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.06]">
                    <Dumbbell className="h-4 w-4 text-iron-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{activeProgram.name}</p>
                    <p className="mt-0.5 text-xs text-iron-400">
                      {activeProgram.goal} · {activeProgram.blocks[0]?.type} · {activeProgram.blocks[0]?.trainingDaysPerWeek ?? request.daysPerWeek}d/wk · started {activeProgram.acceptedAt ? new Date(activeProgram.acceptedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-sm border border-[#0a84ff]/30 bg-[#0a84ff]/10 px-2 py-0.5 text-xs font-semibold text-[#8fb9ff]">
                  Week {activeProgram.blocks[0]?.currentWeek ?? 1}
                </span>
              </div>
              <button className="mt-3 border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs text-iron-300 transition hover:bg-white/[0.07]" onClick={() => setScreen("week")}>
                View current week →
              </button>
            </div>
          </section>
        )}

        {/* Recommended for you */}
        {recommendedTemplateMeta && (
          <section>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Recommended for you</p>
            <div className="border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#8fb9ff]">Recommended</p>
              <p className="mt-1 text-base font-semibold text-white">{recommendedTemplateMeta.name}</p>
              <p className="mt-1 text-xs text-iron-300">
                {recommendedTemplateMeta.goalFocus === "strength + hypertrophy"
                  ? "Balanced for strength + hypertrophy"
                  : `Built for ${recommendedTemplateMeta.goalFocus}`}
              </p>
              <p className="mt-1 text-xs text-iron-500">
                {hasSbdExposure
                  ? "Fits your recent training: squat, bench, and deadlift exposure."
                  : "Safe default recommendation based on your current setup."}
              </p>
              <button
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#0a84ff] transition hover:text-[#8fb9ff]"
                onClick={() => void startNewBlock(recommendedTemplateMeta.id)}
              >
                Use template
              </button>
            </div>
          </section>
        )}

        {/* Start from template */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Start from template</p>
          </div>
          <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {templateLaunchList.slice(0, 8).map((template) => (
              <div key={template.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.04]">
                    <ClipboardList className="h-3.5 w-3.5 text-iron-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{template.name}</p>
                    <p className="mt-0.5 truncate text-xs text-iron-400">{template.splitPreview}</p>
                    <p className="mt-0.5 text-xs text-iron-500">
                      {template.daysPerWeek} days/week · {template.goalFocus} · {template.suitability}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-iron-500">Good for: {template.goodFor}</p>
                  </div>
                </div>
                <button
                  className="shrink-0 text-sm font-semibold text-[#0a84ff] transition hover:text-[#8fb9ff]"
                  onClick={() => void startNewBlock(template.id)}
                >
                  Use template
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Custom block */}
        <section>
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Custom block</p>
          <div className="flex items-center justify-between gap-3 border-y border-white/[0.06] py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Custom Block</p>
              <p className="mt-0.5 text-xs text-iron-500">Start blank and build your own split, requirements, and exercise slots.</p>
            </div>
            <button className="shrink-0 text-sm font-semibold text-[#0a84ff] transition hover:text-[#8fb9ff]" onClick={() => void startNewBlock(undefined, true)}>
              Start blank
            </button>
          </div>
        </section>

        {/* Archived */}
        {archivedPrograms.length > 0 && (
          <section>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Archived / Previous blocks · {archivedPrograms.length}</p>
            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {archivedPrograms.map((program) => (
                <div key={program.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/[0.08] bg-white/[0.02] opacity-60">
                      <Dumbbell className="h-3.5 w-3.5 text-iron-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-iron-300">{program.name}</p>
                      <p className="mt-0.5 text-xs text-iron-500">
                        {program.goal} · {program.blocks[0]?.lengthWeeks ?? "?"}wk · {program.status === "draft" ? "draft" : "completed"}
                      </p>
                    </div>
                  </div>
                  <button
                    className="shrink-0 border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-xs text-iron-400 transition hover:text-iron-200"
                    onClick={() => { duplicate(program); }}
                  >
                    Reuse
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <section className="border-b border-white/[0.06] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="btn-compact -ml-2" onClick={() => setBlocksView("home")}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Blocks
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="apollo-secondary-btn"
              onClick={() => {
                if (draftProgram) {
                  syncDraftProgramBasics();
                  setGenerationState({ status: "success", message: "Draft saved." });
                  return;
                }
                setBuildMode("manual");
                void createProgram("manual", { replaceExistingDraft: true, successMessage: "Draft saved." });
              }}
              disabled={generationState.status === "loading"}
            >
              Save Draft
            </button>
            <button
              className="apollo-primary-btn"
              onClick={() => {
                if (draftProgram) {
                  syncDraftProgramBasics();
                  activateProgram(draftProgram);
                }
              }}
              disabled={generationState.status === "loading" || !draftProgram}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Deploy Block</span>
            </button>
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-white">Build training block</h1>
        <p className="mt-0.5 text-sm text-iron-400">Select a template, then fill requirement slots manually or with Choose for me.</p>
        {/* Progress indicator */}
        {(() => {
          const steps = [
            !!request.name,
            !!request.goal,
            !!selectedSplitId,
            request.blockLengthWeeks > 0,
            request.daysPerWeek > 0,
            !!(draftProgram?.blocks[0]?.weeks[0]?.workouts.some(w => w.exercises.length > 0)),
          ];
          const done = steps.filter(Boolean).length;
          return (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex flex-1 gap-1">
                {steps.map((complete, i) => (
                  <div key={i} className={`h-0.5 flex-1 rounded-full transition ${complete ? "bg-[#0a84ff]" : "bg-white/[0.12]"}`} />
                ))}
              </div>
              <span className="shrink-0 text-xs text-iron-500">{done} of {steps.length}</span>
            </div>
          );
        })()}
      </section>

      {generationState.message && (
        <div className={`mt-4 border px-3 py-2 text-sm ${
          generationState.status === "error" ? "border-ember/40 bg-ember/10 text-orange-100" :
          generationState.status === "success" ? "border-[#0a84ff]/40 bg-[#0a84ff]/10 text-[#8fb9ff]" :
          "border-white/[0.08] bg-white/[0.04] text-iron-200"
        }`}>
          {generationState.message}
        </div>
      )}
      {/* Two-column layout on desktop */}
      <div className="mt-4 lg:grid lg:grid-cols-3 lg:gap-6">
        {/* Left: form */}
        <div className="lg:col-span-2 space-y-0">
          {/* Basics */}
          <section className="border-b border-white/[0.06] pb-5">
            <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Basics</p>
            <div className="divide-y divide-white/[0.06]">
              {/* Block name */}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-iron-300">Name</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-right text-sm text-white placeholder-iron-600 outline-none"
                  placeholder={`${selectedSplit?.name || "Custom"} Block`}
                  value={request.name}
                  onChange={(e) => setRequest((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              {/* Goal */}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-iron-300">Goal</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#f4842a]" />
                  <div className="apollo-inline-select-wrap">
                    <select
                      className="apollo-inline-select"
                      value={request.goal}
                      onChange={(e) => setRequest((d) => ({ ...d, goal: e.target.value as TrainingGoal }))}
                      aria-label="Block goal"
                    >
                      {["powerlifting","bodybuilding","powerbuilding","general-health","conditioning","maintenance"].map(g => (
                        <option key={g} value={g} className="bg-iron-900">{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                      ))}
                    </select>
                    <ChevronDown className="apollo-inline-select-chevron" />
                  </div>
                </div>
              </div>
              {/* Template */}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-iron-300">Template</span>
                <div className="apollo-inline-select-wrap">
                  <select
                    className="apollo-inline-select"
                    value={selectedSplitId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      blockBuilderDebug("TEMPLATE_SELECTED", {
                        selectedSplitId: newId,
                        blockNameInput: request.name,
                        suggestedBlockName: `${db.splitTemplates.find((split) => split.id === newId)?.name || "Custom"} Block`,
                        hasCustomBlockName: request.name.trim().length > 0,
                      });
                      void startNewBlock(newId);
                    }}
                    aria-label="Block template"
                  >
                    {db.splitTemplates.map((split) => (
                      <option key={split.id} value={split.id} className="bg-iron-900">{split.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="apollo-inline-select-chevron" />
                </div>
              </div>
            </div>
          </section>

          {/* Volume */}
          <section className="border-b border-white/[0.06] py-5">
            <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Volume</p>
            <div className="divide-y divide-white/[0.06]">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-iron-200">Duration</p>
                  <p className="text-xs text-iron-500">How many training weeks</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex h-7 w-7 items-center justify-center border border-white/[0.12] bg-white/[0.04] text-iron-300 hover:bg-white/[0.07]" onClick={() => setRequest((d) => ({ ...d, blockLengthWeeks: Math.max(1, d.blockLengthWeeks - 1) }))}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-semibold text-white">{request.blockLengthWeeks} wk</span>
                  <button className="flex h-7 w-7 items-center justify-center border border-white/[0.12] bg-white/[0.04] text-iron-300 hover:bg-white/[0.07]" onClick={() => setRequest((d) => ({ ...d, blockLengthWeeks: Math.min(24, d.blockLengthWeeks + 1) }))}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-iron-200">Days / week</p>
                  <p className="text-xs text-iron-500">Affects split &amp; recovery</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex h-7 w-7 items-center justify-center border border-white/[0.12] bg-white/[0.04] text-iron-300 hover:bg-white/[0.07]" onClick={() => setRequest((d) => ({ ...d, daysPerWeek: Math.max(1, d.daysPerWeek - 1) }))}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-semibold text-white">{request.daysPerWeek} d</span>
                  <button className="flex h-7 w-7 items-center justify-center border border-white/[0.12] bg-white/[0.04] text-iron-300 hover:bg-white/[0.07]" onClick={() => setRequest((d) => ({ ...d, daysPerWeek: Math.min(7, d.daysPerWeek + 1) }))}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Planning Rules */}
          <section className="border-b border-white/[0.06] py-5">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-sm px-1 py-1 text-left transition hover:bg-white/[0.03]"
              onClick={() => setShowAdvancedRules((v) => !v)}
              aria-expanded={showAdvancedRules}
              aria-controls="builder-planning-rules"
            >
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Planning rules</p>
                {!showAdvancedRules && (
                  <p className="mt-0.5 text-xs text-iron-400">
                    {request.blockType.charAt(0).toUpperCase() + request.blockType.slice(1)}
                    {" · "}
                    {request.splitLoopMode === "weekly-reset" ? "Restart" : "Continuous"}
                    {request.compoundSettings ? " · Custom progression" : ""}
                  </p>
                )}
              </div>
              <ChevronRight className={`h-4 w-4 text-iron-500 transition ${showAdvancedRules ? "rotate-90" : ""}`} />
            </button>
            {showAdvancedRules && (
              <div id="builder-planning-rules" className="mt-3 space-y-4">
                {/* Block type */}
                <div>
                  <p className="mb-2 text-xs text-iron-400">Block type</p>
                  <div className="relative flex gap-1 border border-white/[0.08] bg-white/[0.02] p-0.5">
                    {(["hypertrophy","strength","peaking"] as BlockType[]).map((bt) => (
                      <button
                        type="button"
                        key={bt}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${request.blockType === bt ? "bg-white/[0.12] text-white" : "text-iron-400 hover:text-iron-200"}`}
                        onClick={() => { setRequest((d) => ({ ...d, blockType: bt })); setShowBlockTypeMenu(false); }}
                      >
                        {bt.charAt(0).toUpperCase() + bt.slice(1)}
                      </button>
                    ))}
                    {!["hypertrophy","strength","peaking"].includes(request.blockType) && (
                      <span
                        aria-disabled="true"
                        title="Current block type"
                        className="inline-flex items-center bg-white/[0.12] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        {request.blockType.charAt(0).toUpperCase() + request.blockType.slice(1)}
                      </span>
                    )}
                    <button
                      type="button"
                      className="px-2 py-1.5 text-xs text-iron-400 hover:text-iron-200"
                      onClick={() => setShowBlockTypeMenu((v) => !v)}
                      aria-expanded={showBlockTypeMenu}
                      aria-label="More block types"
                    >
                      •••
                    </button>
                    {showBlockTypeMenu && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 border border-white/[0.12] bg-[#151515] py-1 shadow-xl">
                        {(["accumulation","intensification","deload","pivot","maintenance","conditioning","custom"] as BlockType[]).map((bt) => (
                          <button
                            type="button"
                            key={bt}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${request.blockType === bt ? "text-white" : "text-iron-400 hover:text-iron-200"}`}
                            onClick={() => { setRequest((d) => ({ ...d, blockType: bt })); setShowBlockTypeMenu(false); }}
                          >
                            {bt.charAt(0).toUpperCase() + bt.slice(1)}
                            {request.blockType === bt && <span className="h-1.5 w-1.5 rounded-full bg-[#0a84ff]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Split loop */}
                <div>
                  <p className="mb-2 text-xs text-iron-400">Split loop</p>
                  <div className="flex gap-1 border border-white/[0.08] bg-white/[0.02] p-0.5">
                    {([{v:"continuous",l:"Continuous"},{v:"weekly-reset",l:"Restart"}] as {v: SplitLoopMode, l: string}[]).map(({v,l}) => (
                      <button
                        type="button"
                        key={v}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition ${request.splitLoopMode === v ? "bg-white/[0.12] text-white" : "text-iron-400 hover:text-iron-200"}`}
                        onClick={() => setRequest((d) => ({ ...d, splitLoopMode: v }))}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Progression rules */}
                <button
                  type="button"
                  className="flex w-full items-center justify-between border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.05]"
                  onClick={() => setShowSbdAdvanced((v) => !v)}
                  aria-expanded={showSbdAdvanced}
                  aria-controls="builder-progression-rules"
                >
                  <div>
                    <p className="text-sm text-iron-200">Progression &amp; fatigue rules</p>
                    <p className="mt-0.5 text-xs text-iron-500">RPE caps, deload triggers, autoregulation</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-iron-500 transition ${showSbdAdvanced ? "rotate-90" : ""}`} />
                </button>
                {showSbdAdvanced && (
                  <div id="builder-progression-rules" className="space-y-4">
                    <SbdSettingsEditor
                      db={db}
                      user={user}
                      settings={request.compoundSettings}
                      selectedIds={request.priorityExerciseIds}
                      onSelectedChange={(priorityExerciseIds) => setRequest((d) => ({ ...d, priorityExerciseIds }))}
                      onChange={(compoundSettings) => setRequest((d) => ({ ...d, compoundSettings }))}
                    />
                    <CompoundSettingsEditor
                      db={db}
                      user={user}
                      settings={request.compoundSettings}
                      onChange={(compoundSettings) => setRequest((d) => ({ ...d, compoundSettings }))}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Weekly split + day editor */}
          {draftProgram ? (
            <section className="border-b border-white/[0.06] py-5">
              <WeeklyOverview db={db} user={user} program={draftProgram} updateDb={updateDb} editable />
            </section>
          ) : (
            <section className="border-b border-white/[0.06] py-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Weekly split &amp; exercises</p>
              <p className="mt-2 text-sm text-iron-500">Start a new block or choose a template to open the day editor and requirement slots.</p>
            </section>
          )}

          {/* Reset */}
          <div className="flex justify-end pt-3">
            <button className="btn-ghost text-xs text-iron-500" onClick={resetBuilderForm}>
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset form
            </button>
          </div>
        </div>

        {/* Right: preview */}
        <div className="mt-6 lg:mt-0 lg:col-span-1">
          <div className="border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="font-semibold text-white">{request.name || "Unnamed block"}</p>
            <p className="mt-0.5 text-xs text-iron-400">
              {request.blockLengthWeeks} weeks · {request.daysPerWeek} days/week · {request.blockLengthWeeks * request.daysPerWeek} sessions
            </p>
            <div className="mt-3 space-y-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Weekly schedule</p>
              {schedulePreview[0]?.map((day, i) => (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-iron-400">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</span>
                  <span className="text-xs text-iron-200">{day.name}</span>
                </div>
              ))}
            </div>
            {workingProgram && (() => {
              const vol = summarizePlannedVolume(workingProgram, db);
              const sorted = Object.entries(vol).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,8);
              // Derive required muscles from all split days in the working program
              const splitTemplate = db.splitTemplates.find((s) => s.id === workingProgram.splitTemplateId);
              const requiredMuscles = new Set<string>([
                ...(splitTemplate?.days.flatMap((sd) => sd.targetMuscles ?? sd.muscleGroups ?? []) ?? []),
                ...(splitTemplate?.days.flatMap((sd) => (sd.requirements ?? []).map((req) => req.targetMuscle)) ?? [])
              ]);
              const coveredMuscles = sorted.filter(([m]) => requiredMuscles.has(m)).map(([m]) => m);
              const extraMuscles = sorted.filter(([m]) => !requiredMuscles.has(m)).map(([m]) => m);
              return (
                <>
                  {(coveredMuscles.length > 0 || extraMuscles.length > 0) && (
                    <div className="mt-4">
                      <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Muscle coverage</p>
                      <div className="flex flex-wrap gap-1">
                        {coveredMuscles.map((m) => (
                          <span key={m} className="rounded border border-[#0a84ff]/30 bg-[#0a84ff]/8 px-2 py-0.5 text-[0.65rem] capitalize text-[#8fb9ff]">
                            {m.replace(/-/g," ")}
                          </span>
                        ))}
                        {extraMuscles.map((m) => (
                          <span key={m} className="rounded border border-[#f4842a]/30 bg-[#f4842a]/8 px-2 py-0.5 text-[0.65rem] capitalize text-[#f4842a]">
                            {m.replace(/-/g," ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {sorted.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Volume forecast</p>
                      {sorted.map(([muscle, sets]) => (
                        <div key={muscle} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 text-xs capitalize text-iron-400">{muscle.replace(/-/g," ")}</span>
                          <div className="flex-1 h-1 bg-white/[0.06] overflow-hidden">
                            <div className="h-full bg-[#0a84ff]" style={{ width: `${Math.min(100, (sets / 24) * 100)}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs text-iron-400">{sets} set</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sorted.length === 0 && (
                    <div className="mt-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Planned requirement groups</p>
                      {requiredMuscles.size > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[...requiredMuscles].map((muscle) => (
                            <span key={muscle} className="rounded border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[0.65rem] capitalize text-iron-300">
                              {muscle.replace(/-/g, " ")}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-iron-500">No requirement groups defined yet.</p>
                      )}
                      <p className="mt-2 text-xs text-iron-500">No exercises selected yet.</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          {workingProgram && (
            <div className="mt-4">
              <ProgramGapPanel db={db} user={user} program={workingProgram} updateDb={updateDb} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SbdSettingsEditor({
  db,
  settings,
  selectedIds,
  onSelectedChange,
  onChange
}: {
  db: TrainingDatabase;
  user: UserProfile;
  settings: CompoundSettings;
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onChange: (settings: CompoundSettings) => void;
}) {
  const sbdExercises = ["ex_squat_comp", "ex_bench_comp", "ex_deadlift_comp"]
    .map((id) => db.exercises.find((exercise) => exercise.id === id))
    .filter(Boolean) as Exercise[];
  const updateAvoid = (exerciseId: string, avoided: boolean) => {
    onChange({
      ...settings,
      avoidExerciseIds: avoided
        ? Array.from(new Set([...settings.avoidExerciseIds, exerciseId]))
        : settings.avoidExerciseIds.filter((id) => id !== exerciseId)
    });
    if (avoided) onSelectedChange(selectedIds.filter((id) => id !== exerciseId));
  };
  const toggleEmphasis = (exerciseId: string) => {
    if (settings.avoidExerciseIds.includes(exerciseId)) return;
    onSelectedChange(selectedIds.includes(exerciseId) ? selectedIds.filter((id) => id !== exerciseId) : [...selectedIds, exerciseId]);
  };

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <p className="text-sm font-semibold text-white">SBD settings</p>
      <p className="mt-1 text-xs text-iron-400">Controls squat, bench, and deadlift exposure only.</p>
      <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {sbdExercises.map((exercise) => {
          const avoided = settings.avoidExerciseIds.includes(exercise.id);
          const emphasized = selectedIds.includes(exercise.id);
          return (
            <div key={exercise.id} className="flex flex-wrap items-center justify-between gap-2 px-1 py-2.5">
              <p className="text-sm font-medium text-iron-100">{exercise.name.replace("Competition ", "")}</p>
              <div className="flex items-center gap-2">
                <button
                  className={`border px-2.5 py-1 text-xs transition ${
                    emphasized && !avoided
                      ? "border-[#0a84ff]/50 bg-[#0a84ff]/15 text-[#8fb9ff]"
                      : "border-white/[0.12] bg-white/[0.03] text-iron-300 hover:bg-white/[0.06]"
                  }`}
                  onClick={() => toggleEmphasis(exercise.id)}
                  disabled={avoided}
                >
                  Include
                </button>
                <label className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs transition ${
                  avoided
                    ? "border-ember/40 bg-ember/10 text-orange-200"
                    : "border-white/[0.12] bg-white/[0.03] text-iron-300"
                }`}>
                  <input type="checkbox" checked={avoided} onChange={(event) => updateAvoid(exercise.id, event.target.checked)} />
                  Avoid this block
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SelectField
          label="SBD emphasis"
          value={settings.mode}
          options={["normal", "limited", "avoid-heavy"]}
          labels={{ normal: "Normal", limited: "Limit SBD frequency", "avoid-heavy": "Avoid heavy SBD" }}
          onChange={(mode) => onChange({ ...settings, mode: mode as CompoundSettings["mode"] })}
        />
        <NumberField label="Heavy SBD/week cap" value={settings.maxHeavyCompoundsPerWeek} onChange={(maxHeavyCompoundsPerWeek) => onChange({ ...settings, maxHeavyCompoundsPerWeek })} />
      </div>
    </div>
  );
}

function CompoundSettingsEditor({
  db,
  user,
  settings,
  onChange
}: {
  db: TrainingDatabase;
  user: UserProfile;
  settings: CompoundSettings;
  onChange: (settings: CompoundSettings) => void;
}) {
  const avoided = settings.avoidExerciseIds.map((id) => db.exercises.find((exercise) => exercise.id === id)).filter(Boolean) as Exercise[];
  const [showAvoidPicker, setShowAvoidPicker] = useState(false);
  const update = (patch: Partial<CompoundSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <p className="text-sm font-semibold text-white">Exercise Avoider</p>
      <p className="mt-1 text-xs text-iron-400">Used only when the app suggests exercises.</p>
      <div className="mt-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Avoid movement patterns</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {movementOptions.map((pattern) => (
            <button
              key={pattern}
              className={`border px-2.5 py-1 text-xs transition ${
                settings.avoidMovementPatterns.includes(pattern)
                  ? "border-ember/40 bg-ember/10 text-orange-200"
                  : "border-white/[0.12] bg-white/[0.03] text-iron-300 hover:bg-white/[0.06]"
              }`}
              onClick={() => update({
                avoidMovementPatterns: settings.avoidMovementPatterns.includes(pattern)
                  ? settings.avoidMovementPatterns.filter((item) => item !== pattern)
                  : [...settings.avoidMovementPatterns, pattern]
              })}
            >
              {pattern}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Avoid specific exercises</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {avoided.map((exercise) => (
            <button key={exercise.id} className="border border-ember/30 bg-ember/10 px-2 py-1 text-xs text-orange-200" onClick={() => update({ avoidExerciseIds: settings.avoidExerciseIds.filter((id) => id !== exercise.id) })}>
              {exercise.name} remove
            </button>
          ))}
          {!avoided.length && <p className="text-sm text-iron-400">No specific exercises avoided.</p>}
        </div>
        <button
          className="mt-2 border border-[#0a84ff]/40 bg-[#0a84ff]/10 px-3 py-1.5 text-xs font-medium text-[#8fb9ff] transition hover:bg-[#0a84ff]/20"
          onClick={() => setShowAvoidPicker((v) => !v)}
        >
          {showAvoidPicker ? "Hide exercises" : "Choose exercises"}
        </button>
        {showAvoidPicker && (
          <ExercisePicker
            db={db}
            user={user}
            selectedIds={settings.avoidExerciseIds}
            onPick={(exercise) => {
              if (!settings.avoidExerciseIds.includes(exercise.id)) update({ avoidExerciseIds: [...settings.avoidExerciseIds, exercise.id] });
            }}
            variant="week-inline"
          />
        )}
      </div>
    </div>
  );
}

function WeeklyOverview({
  db,
  user,
  program,
  updateDb,
  editable = false
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program?: Program;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  editable?: boolean;
}) {
  const week = program?.blocks[0]?.weeks.find((item) => item.weekNumber === program.blocks[0].currentWeek) || program?.blocks[0]?.weeks[0];
  const [selectedDayId, setSelectedDayId] = useState<string | undefined>(week?.workouts[0]?.id);
  const selectedDay = week?.workouts.find((day) => day.id === selectedDayId);
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  useEffect(() => {
    if (week?.workouts.length && !week.workouts.some((day) => day.id === selectedDayId)) {
      setSelectedDayId(week.workouts[0].id);
    }
  }, [selectedDayId, week]);

  if (!program || !week) {
    return (
      <Panel title="Weekly Overview" icon={CalendarDays}>
        <EmptyState title="No active weekly plan" detail="Generate a program to see training days, rest days, durations, and muscle focus." />
      </Panel>
    );
  }

  if (editable) {
    const workoutDays = week.workouts.filter((d) => d.exercises.length > 0 || d.splitDayId);
    const displayDays = workoutDays.length > 0 ? workoutDays : week.workouts;
    const selectedEdDay = displayDays.find((d) => d.id === selectedDayId) ?? displayDays[0];
    return (
      <section className="space-y-0">
        <div className="mb-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Weekly split</p>
        </div>
        <WeekDayCardSelector
          db={db}
          days={displayDays}
          selectedDayId={selectedEdDay?.id}
          compact
          onSelect={(day) => setSelectedDayId(day.id)}
        />
        {selectedEdDay && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedEdDay.name}</h3>
                <p className="mt-0.5 text-xs text-iron-500">
                  {program.blocks[0]?.weeks.find(w => w.workouts.some(d => d.id === selectedEdDay.id)) && `Week ${program.blocks[0].weeks.find(w => w.workouts.some(d => d.id === selectedEdDay.id))?.weekNumber}`}
                  {selectedEdDay.focus ? ` · ${selectedEdDay.focus}` : ""}
                </p>
              </div>
            </div>
            <WorkoutDayEditor key={selectedEdDay.id} db={db} user={user} program={program} day={selectedEdDay} updateDb={updateDb} variant="week" />
          </div>
        )}
      </section>
    );
  }

  return (
    <Panel title="Weekly Overview" icon={CalendarDays}>
      <div className="grid gap-2 md:grid-cols-7">
        {dayNames.map((name, index) => {
          const day = week.workouts.find((workout) => workout.scheduledDay === name) || week.workouts[index];
          const keyExercises = day?.exercises.slice(0, 3).map((planned) => db.exercises.find((exercise) => exercise.id === planned.exerciseId)?.name).filter(Boolean);
          const dayExerciseModels = day?.exercises.map((planned) => db.exercises.find((exercise) => exercise.id === planned.exerciseId)).filter(Boolean) as Exercise[] | undefined;
          const fatigue = dayExerciseModels?.length ? sessionFatigueScore(dayExerciseModels) : 0;
          const completed = day ? db.sessions.some((session) => session.userId === user.id && session.workoutDayId === day.id && session.status === "completed") : false;
          const muscles = new Set<MuscleGroup>();
          day?.exercises.forEach((planned) => db.exercises.find((exercise) => exercise.id === planned.exerciseId)?.directVolumeMuscles.forEach((muscle) => muscles.add(muscle)));
          return (
            <button
              key={name}
              className={`min-h-36 rounded-lg border p-3 text-left transition ${
                day && selectedDayId === day.id ? "border-[#0a84ff]/40 bg-[#0a84ff]/5" : "border-white/10 bg-white/[0.045]"
              }`}
              onClick={() => day && setSelectedDayId(day.id)}
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-iron-500">{name.slice(0, 3)}</p>
              {day ? (
                <>
                  <p className="mt-2 font-black text-white">{day.name}</p>
                  <p className="mt-1 text-xs text-iron-400">{day.focus} · ~{estimateWorkoutDuration(day)} min</p>
                  <p className="mt-2 line-clamp-2 text-xs text-iron-300">{keyExercises?.join(", ")}</p>
                  <p className="mt-2 line-clamp-2 text-[0.7rem] text-iron-500">{[...muscles].slice(0, 4).join(", ")}</p>
                  <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-iron-500">{completed ? "completed" : "planned"} - fatigue {fatigue}</p>
                </>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-white/10 p-3 text-center text-xs font-bold text-iron-500">Rest</div>
              )}
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <div className="mt-4">
          <WorkoutDayView db={db} user={user} day={selectedDay} />
        </div>
      )}
    </Panel>
  );
}

function WeekDayCardSelector({
  db,
  days,
  selectedDayId,
  compact = false,
  onSelect,
}: {
  db: TrainingDatabase;
  days: WorkoutDay[];
  selectedDayId?: string;
  compact?: boolean;
  onSelect: (day: WorkoutDay) => void;
}) {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const hasScheduledDays = days.some((day) => !!day.scheduledDay);
  return (
    <div className={compact ? "-mx-4 overflow-x-auto px-4 scrollbar-none" : "grid gap-2 md:grid-cols-7"}>
      <div className={compact ? "flex min-w-max gap-2" : "contents"}>
      {dayNames.map((name, index) => {
        const day = hasScheduledDays ? days.find((workout) => workout.scheduledDay === name) : days[index];
        const selected = day?.id === selectedDayId;
        const restDay = day?.status === "rest";
        const keyExercises = day?.exercises
          .slice(0, 2)
          .map((planned) => db.exercises.find((exercise) => exercise.id === planned.exerciseId)?.name)
          .filter(Boolean);
        return (
          <button
            key={name}
            type="button"
            disabled={!day}
            className={compact
              ? `shrink-0 border-b-2 px-3 py-2 text-left transition ${
                day
                  ? selected
                    ? "border-[#0a84ff] text-[#8fb9ff]"
                    : "border-transparent text-iron-400 hover:text-iron-200"
                  : "cursor-default border-transparent text-iron-600"
                }`
              : `min-h-32 rounded-lg border p-3 text-left transition ${
                day
                  ? selected
                    ? "border-[#0a84ff]/40 bg-[#0a84ff]/5"
                    : "border-white/10 bg-white/[0.045] hover:bg-white/[0.07]"
                  : "cursor-default border-dashed border-white/10 bg-white/[0.02]"
              }`}
            onClick={() => day && onSelect(day)}
          >
            {compact ? (
              day && !restDay ? (
                <>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-iron-500">{name.slice(0, 3)}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white leading-tight">{day.name}</p>
                </>
              ) : (
                <>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-iron-600">{name.slice(0, 3)}</p>
                  <p className="mt-0.5 text-sm text-iron-600">Rest</p>
                </>
              )
            ) : (
              day && !restDay ? (
                <>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-iron-500">{name.slice(0, 3)}</p>
                  <p className="mt-2 font-black text-white">{day.name}</p>
                  <p className="mt-1 text-xs text-iron-400">{day.focus} · ~{estimateWorkoutDuration(day)} min</p>
                  {keyExercises?.length ? (
                    <p className="mt-2 line-clamp-2 text-xs text-iron-300">{keyExercises.join(", ")}</p>
                  ) : (
                    <p className="mt-2 text-xs text-iron-500">Draft day</p>
                  )}
                </>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-white/10 p-3 text-center text-xs font-bold text-iron-500">Rest</div>
              )
            )}
          </button>
        );
      })}
      </div>
    </div>
  );
}

function WorkoutDayEditor({
  db,
  user,
  program,
  day,
  updateDb,
  showNameFocusFields = true,
  variant = "default",
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program: Program;
  day: WorkoutDay;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  showNameFocusFields?: boolean;
  variant?: "default" | "week";
}) {
  const weekVariant = variant === "week";
  const allSplitDays = useMemo(() => db.splitTemplates.flatMap((split) => split.days), [db.splitTemplates]);
  const requirements = useMemo(() => deriveRequirements(day, allSplitDays), [allSplitDays, day]);
  const exerciseById = useMemo(() => new Map(db.exercises.map((exercise) => [exercise.id, exercise] as const)), [db.exercises]);
  const requirementAllocation = useMemo(
    () => allocateExercisesToRequirements(day.exercises, requirements, exerciseById),
    [day.exercises, requirements, exerciseById]
  );

  const reqProgress = useMemo(
    () => requirements.map((req) => ({
      req,
      fulfilled: Math.min(requirementAllocation.fulfilledByRequirementId.get(req.id) ?? 0, req.requiredExerciseCount),
      needed: req.requiredExerciseCount,
    })),
    [requirementAllocation.fulfilledByRequirementId, requirements]
  );
  const allReqsMet = requirementAllocation.allRequirementsMet;
  const firstUnmetIndex = findNextUnmetRequirementIndex(requirements, requirementAllocation);

  const [currentReqIndex, setCurrentReqIndex] = useState<number>(firstUnmetIndex >= 0 ? firstUnmetIndex : 0);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [chooserWarning, setChooserWarning] = useState("");
  const [showRequirementWarning, setShowRequirementWarning] = useState(false);
  const [showPrescription, setShowPrescription] = useState(allReqsMet);
  const [showPicker, setShowPicker] = useState(!weekVariant && day.exercises.length === 0);
  const [pendingExtraExercise, setPendingExtraExercise] = useState<Exercise | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | undefined>(day.exercises[0]?.id);
  const [swappingExerciseId, setSwappingExerciseId] = useState<string | undefined>();
  const [inlineReqPickerOpen, setInlineReqPickerOpen] = useState(false);
  const [daySettingsOpen, setDaySettingsOpen] = useState(false);
  const lastAutoOpenedRequirementKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (showAllExercises) return;
    if (firstUnmetIndex < 0) return;
    if (firstUnmetIndex === currentReqIndex) return;
    blockBuilderDebug("REQUIREMENT_AUTO_SELECTED", {
      selectedDayId: day.id,
      selectedRequirement: requirements[firstUnmetIndex]?.id,
      requirementsCount: requirements.length,
    });
    setCurrentReqIndex(firstUnmetIndex);
  }, [currentReqIndex, day.id, firstUnmetIndex, requirements, showAllExercises]);

  useEffect(() => {
    if (!weekVariant || showAllExercises || firstUnmetIndex < 0) return;
    const currentRequirement = requirements[firstUnmetIndex];
    if (!currentRequirement) return;
    const nextAutoOpenKey = `${day.id}:${currentRequirement.id}:${day.exercises.length}`;
    if (lastAutoOpenedRequirementKeyRef.current === nextAutoOpenKey || inlineReqPickerOpen) return;
    lastAutoOpenedRequirementKeyRef.current = nextAutoOpenKey;
    blockBuilderDebug("INLINE_PICKER_OPENED", {
      selectedDayId: day.id,
      selectedRequirement: currentRequirement.id,
      requirementsCount: requirements.length,
      pickerMode: "week-inline",
    });
    setCurrentReqIndex((current) => current === firstUnmetIndex ? current : firstUnmetIndex);
    setInlineReqPickerOpen(true);
  }, [day.exercises.length, day.id, firstUnmetIndex, inlineReqPickerOpen, requirements, showAllExercises, weekVariant]);

  useEffect(() => {
    if (!day.exercises.length) {
      setEditingExerciseId(undefined);
      setSwappingExerciseId(undefined);
      if (!weekVariant) setShowPicker(true);
      return;
    }
    if (editingExerciseId && !day.exercises.some((planned) => planned.id === editingExerciseId)) {
      setEditingExerciseId(day.exercises[0]?.id);
    }
    if (swappingExerciseId && !day.exercises.some((planned) => planned.id === swappingExerciseId)) {
      setSwappingExerciseId(undefined);
    }
  }, [day.exercises, editingExerciseId, swappingExerciseId]);

  const currentReq = requirements[currentReqIndex] as SplitDayRequirement | undefined;
  const alreadyAddedIds = day.exercises.map((planned) => planned.exerciseId);
  const existingSelectedExercises = day.exercises
    .map((planned) => db.exercises.find((item) => item.id === planned.exerciseId))
    .filter((item): item is Exercise => Boolean(item));
  const findNextUnmetForExercises = (exercises: { exerciseId: string; fulfillsRequirementId?: string; isExtra?: boolean }[]) => {
    const allocation = allocateExercisesToRequirements(exercises as typeof day.exercises, requirements, exerciseById);
    return findNextUnmetRequirementIndex(requirements, allocation);
  };
  const isUserEditedPrescription = (planned: PlannedExercise) => planned.userEditedPrescription === true;
  const isUserEditedOrder = (exercises: PlannedExercise[]) => exercises.some((planned) => planned.userEditedOrder);
  const missingRequirementSummary = reqProgress
    .filter((item) => item.fulfilled < item.needed)
    .map((item) => `${item.req.targetMuscle} ${item.fulfilled}/${item.needed}`)
    .join(", ");
  const requirementWarningText = showRequirementWarning && missingRequirementSummary
    ? `Could not fill every requirement: ${missingRequirementSummary}. Fill the missing slots manually.`
    : "";

  function coachOrderDayExercises(exercises: PlannedExercise[]): PlannedExercise[] {
    const exerciseMap = new Map(db.exercises.map((exercise) => [exercise.id, exercise] as const));
    const sortableItems = exercises.reduce<{ planned: PlannedExercise; exercise: Exercise; exerciseRole?: ExerciseRole }[]>((items, planned) => {
      const exercise = exerciseMap.get(planned.exerciseId);
      if (exercise) items.push({ planned, exercise, exerciseRole: planned.exerciseRole });
      return items;
    }, []);
    const ordered = orderExercisesForDay(
      sortableItems,
      {
        splitDay: {
          name: day.name,
          muscleGroups: day.targetMuscles || [],
          movementPatterns: day.movementPatterns || [],
        },
        blockType: program.blocks[0]?.type || "hypertrophy",
      }
    );
    const orderedIds = ordered.map((item) => item.planned.id);
    return exercises
      .slice()
      .sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
      .map((planned, index) => ({ ...planned, order: index + 1 }));
  }

  function refreshAutoPrescriptions(target: WorkoutDay): void {
    const requirementOrdinal = new Map<string, number>();
    target.exercises = target.exercises.map((planned, index) => {
      if (planned.userEditedPrescription) {
        return { ...planned, order: index + 1 };
      }
      const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
      if (!exercise) return { ...planned, order: index + 1 };
      const req = planned.fulfillsRequirementId ? requirements.find((item) => item.id === planned.fulfillsRequirementId) : undefined;
      const slotIndex = req
        ? requirementOrdinal.get(req.id) ?? 0
        : Math.max(0, index);
      if (req) {
        requirementOrdinal.set(req.id, slotIndex + 1);
      }
      const rebuilt = buildPlannedExerciseFromExercise({
        db,
        user,
        program,
        day: target,
        exercise,
        order: index + 1,
        exerciseRole: planned.exerciseRole,
        requirementSlotIndex: req ? slotIndex : undefined,
        totalRequiredForMuscle: req?.requiredExerciseCount,
      });
      return {
        ...planned,
        order: index + 1,
        exerciseRole: rebuilt.exerciseRole,
        fatigueTag: rebuilt.fatigueTag,
        required: rebuilt.required,
        plannedSets: rebuilt.plannedSets.map((set, setIndex) => ({
          ...set,
          id: planned.plannedSets[setIndex]?.id || set.id,
          plannedWeight: planned.plannedSets[setIndex]?.plannedWeight ?? set.plannedWeight,
        })),
        restSeconds: rebuilt.restSeconds,
        notes: rebuilt.notes,
      };
    });
  }

  function updateDay(mutator: (target: WorkoutDay) => void) {
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((item) => item.id === program.id);
      const targetDay = targetProgram?.blocks.flatMap((block) => block.weeks).flatMap((week) => week.workouts).find((workout) => workout.id === day.id);
      if (targetDay && targetProgram) {
        mutator(targetDay);
        targetProgram.updatedAt = nowIso();
        targetProgram.changeLog ||= [];
        targetProgram.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Edited workout day", detail: `Updated ${targetDay.name}.` });
        draft.programGaps = analyzeProgramGaps(targetProgram, draft);
      }
      return draft;
    });
  }

  function addExercise(exercise: Exercise, asExtra = false, explicitRequirementId?: string | null) {
    // Anti-spam: block duplicate exercise on this day
    if (alreadyAddedIds.includes(exercise.id)) return;
    const reqId = explicitRequirementId === null
      ? undefined
      : explicitRequirementId ?? (showAllExercises ? undefined : currentReq?.id);
    const targetRequirement = reqId ? requirements.find((item) => item.id === reqId) : undefined;
    const currentProgress = reqId ? reqProgress.find((r) => r.req.id === reqId) : undefined;
    const reqFull = Boolean(reqId && currentProgress && currentProgress.fulfilled >= currentProgress.needed);

    if (reqFull && !asExtra) {
      // Requirement is full — ask user to confirm adding as extra
      setPendingExtraExercise(exercise);
      return;
    }

    const isExtraFlag = asExtra || !reqId;
    const slotIndex = reqId ? Math.max(0, currentProgress?.fulfilled ?? 0) : undefined;
    const totalRequiredForMuscle = reqId ? currentProgress?.needed : undefined;
    const slotPlan = targetRequirement && !isExtraFlag
      ? getRequirementSlotPlan({
          targetMuscle: targetRequirement.targetMuscle,
          goalType: program.goal,
          blockType: program.blocks[0]?.type || "hypertrophy",
          dayFocus: day.focus,
          slotIndex: slotIndex ?? 0,
          totalSlots: totalRequiredForMuscle ?? 1,
          movementPattern: targetRequirement.movementPattern,
        })
      : undefined;
    updateDay((target) => {
      const planned = buildPlannedExerciseFromExercise({
        db,
        user,
        program,
        day: target,
        exercise,
        order: target.exercises.length + 1,
        exerciseRole: isExtraFlag ? inferBaseExerciseRole(exercise) : slotPlan?.role,
        requirementSlotIndex: slotIndex,
        totalRequiredForMuscle,
      });
      planned.fulfillsRequirementId = isExtraFlag ? undefined : reqId;
      planned.isExtra = isExtraFlag || undefined;
      planned.userEditedOrder = target.exercises.some((item) => item.userEditedOrder) || undefined;
      target.exercises.push(planned);
      if (!isUserEditedOrder(target.exercises)) {
        target.exercises = coachOrderDayExercises(target.exercises);
        refreshAutoPrescriptions(target);
      }
    });
    setPendingExtraExercise(null);
    setChooserWarning("");

    // Advance to next unfulfilled requirement (only for non-extra exercises)
    if (!asExtra && reqId && !showAllExercises && requirements.length > 0) {
      const updatedExercises = [...day.exercises, { exerciseId: exercise.id, fulfillsRequirementId: reqId, isExtra: false } as typeof day.exercises[number]];
      const nextUnmet = findNextUnmetForExercises(updatedExercises);
      if (nextUnmet >= 0) {
        setCurrentReqIndex(nextUnmet);
      } else {
        setInlineReqPickerOpen(false);
      }
    }
  }

  function swapExercise(plannedExerciseId: string, replacement: Exercise) {
    const currentPlanned = day.exercises.find((item) => item.id === plannedExerciseId);
    if (!currentPlanned || currentPlanned.exerciseId === replacement.id) {
      setSwappingExerciseId(undefined);
      return;
    }
    const duplicate = day.exercises.some((item) => item.id !== plannedExerciseId && item.exerciseId === replacement.id);
    if (duplicate) {
      setChooserWarning(`${replacement.name} is already in this workout. Pick a different exercise to swap.`);
      return;
    }

    const req = currentPlanned.fulfillsRequirementId
      ? requirements.find((item) => item.id === currentPlanned.fulfillsRequirementId)
      : undefined;
    const compatibleWithRequirement = req ? exerciseFulfillsRequirement(replacement, req) : true;

    updateDay((target) => {
      const targetExercise = target.exercises.find((item) => item.id === plannedExerciseId);
      if (!targetExercise) return;
      const replacementPlanned = buildPlannedExerciseFromExercise({
        db,
        user,
        program,
        day: target,
        exercise: replacement,
        order: targetExercise.order,
        exerciseRole: targetExercise.exerciseRole,
      });
      replacementPlanned.id = targetExercise.id;
      replacementPlanned.order = targetExercise.order;
      replacementPlanned.required = targetExercise.required;
      if (isUserEditedPrescription(targetExercise)) {
        replacementPlanned.plannedSets = structuredClone(targetExercise.plannedSets);
        replacementPlanned.restSeconds = targetExercise.restSeconds;
      }
      replacementPlanned.userEditedPrescription = targetExercise.userEditedPrescription;
      replacementPlanned.userEditedOrder = targetExercise.userEditedOrder;
      replacementPlanned.fulfillsRequirementId = compatibleWithRequirement ? targetExercise.fulfillsRequirementId : undefined;
      replacementPlanned.isExtra = targetExercise.isExtra || !compatibleWithRequirement || undefined;
      replacementPlanned.originalExerciseId = targetExercise.originalExerciseId ?? targetExercise.exerciseId;
      replacementPlanned.replacementExerciseId = replacement.id;
      replacementPlanned.swappedAt = nowIso();
      replacementPlanned.swapScope = "day";
      Object.assign(targetExercise, replacementPlanned);
    });

    if (!compatibleWithRequirement && req) {
      setChooserWarning(`${replacement.name} does not satisfy the ${req.targetMuscle} requirement, so it was kept as an extra and the slot is now open.`);
    } else {
      setChooserWarning("");
    }
    setSwappingExerciseId(undefined);
    setEditingExerciseId(plannedExerciseId);
  }

  function chooseForCurrentRequirement() {
    if (!currentReq) return;
    const currentFulfilled = Math.min(requirementAllocation.fulfilledByRequirementId.get(currentReq.id) ?? 0, currentReq.requiredExerciseCount);
    const slotPlan = getRequirementSlotPlan({
      targetMuscle: currentReq.targetMuscle,
      goalType: program.goal,
      blockType: program.blocks[0]?.type || "hypertrophy",
      dayFocus: day.focus,
      slotIndex: currentFulfilled,
      totalSlots: currentReq.requiredExerciseCount,
      movementPattern: currentReq.movementPattern,
    });
    const pickerVisibleResults = getRequirementPickerVisibleExercises(db.exercises, user.id, currentReq.targetMuscle);
    const rejectedCandidates: { exercise: Exercise; reason: string }[] = [];
    const candidates = pickerVisibleResults
      .filter((exercise) => {
        if (alreadyAddedIds.includes(exercise.id)) {
          rejectedCandidates.push({ exercise, reason: "duplicate-already-selected" });
          return false;
        }
        return true;
      })
      .map((exercise) => ({
        exercise,
        score: scoreExerciseForSlot({
          exercise,
          slotPlan,
          targetMuscle: currentReq.targetMuscle,
          goalType: program.goal,
          blockType: program.blocks[0]?.type || "hypertrophy",
          dayFocus: day.focus,
          selectedExercises: existingSelectedExercises,
          slotIndex: currentFulfilled,
          totalSlots: currentReq.requiredExerciseCount,
        }),
      }))
      .sort((a, b) => b.score - a.score);
    const pick = candidates[0]?.exercise;
    const allVisibleMatchesAlreadySelected =
      pickerVisibleResults.length > 0 &&
      !candidates.length &&
      rejectedCandidates.length === pickerVisibleResults.length &&
      rejectedCandidates.every((item) => item.reason === "duplicate-already-selected");
    debugRequirementAutofill({
      mode: "slot",
      selectedRequirement: currentReq,
      pickerVisibleResults,
      autofillCandidates: candidates.map((item) => item.exercise),
      rejectedCandidates,
      existingSelectedExercises,
      usedIds: alreadyAddedIds,
      requirementStatusBefore: { fulfilled: currentFulfilled, needed: currentReq.requiredExerciseCount },
      requirementStatusAfter: {
        fulfilled: Math.min(currentReq.requiredExerciseCount, currentFulfilled + (pick ? 1 : 0)),
        needed: currentReq.requiredExerciseCount,
      },
    });
    if (!pick) {
      setChooserWarning(
        allVisibleMatchesAlreadySelected
          ? `All visible ${titleCaseLabel(currentReq.targetMuscle)} matches are already selected. Add one manually only if you want a duplicate.`
          : `No matching option found for ${titleCaseLabel(currentReq.targetMuscle)}. Pick manually for this slot.`
      );
      return;
    }
    setChooserWarning("");
    setShowRequirementWarning(false);
    addExercise(pick);
  }

  function chooseForMe() {
    const targetMuscles = day.targetMuscles?.length ? day.targetMuscles : allSplitDays.find((sd) => sd.id === day.splitDayId)?.muscleGroups || [];
    const targetPatterns = day.movementPatterns || [];
    const dayReqs = requirements;
    const block = program.blocks[0];
    const goalUsed = getGoalUsed(program.goal, block?.goalOverride ?? block?.goal);
    const currentWeek = block?.weeks.find((week) => week.workouts.some((workout) => workout.id === day.id));
    const weeklyExerciseCounts: Record<string, number> = {};
    currentWeek?.workouts
      .filter((workout) => workout.id !== day.id)
      .forEach((workout) => {
        workout.exercises.forEach((planned) => {
          weeklyExerciseCounts[planned.exerciseId] = (weeklyExerciseCounts[planned.exerciseId] ?? 0) + 1;
        });
      });

    // Track { exercise, reqId } pairs so we can tag fulfillsRequirementId correctly
    const selected: {
      exercise: Exercise;
      reqId: string | undefined;
      slotIndex?: number;
      totalRequiredForMuscle?: number;
      exerciseRole?: ExerciseRole;
    }[] = [];
    const usedIds = new Set<string>(day.exercises.map((planned) => planned.exerciseId));
    const unfilledReasonMessages: string[] = [];

    if (dayReqs.length > 0) {
      const orderedRequirements = dayReqs.slice().sort(compareRequirementsBySpecificity);
      // Fill each requirement slot — exactly requiredExerciseCount exercises per slot, no more
      for (const req of orderedRequirements) {
        const currentFulfilled = Math.min(requirementAllocation.fulfilledByRequirementId.get(req.id) ?? 0, req.requiredExerciseCount);
        let filled = currentFulfilled;
        for (let slot = currentFulfilled; slot < req.requiredExerciseCount; slot += 1) {
          const slotPlan = getRequirementSlotPlan({
            targetMuscle: req.targetMuscle,
            goalType: goalUsed,
            blockType: block?.type || "hypertrophy",
            dayFocus: day.focus,
            slotIndex: slot,
            totalSlots: req.requiredExerciseCount,
            movementPattern: req.movementPattern,
          });
          const pickerVisibleResults = getRequirementPickerVisibleExercises(db.exercises, user.id, req.targetMuscle);
          const rejectedCandidates: { exercise: Exercise; reason: string }[] = [];
          const selectedExercisesForScoring = [...existingSelectedExercises, ...selected.map((item) => item.exercise)];
          const rankedCandidates = pickerVisibleResults
            .filter((exercise) => {
              if (usedIds.has(exercise.id)) {
                rejectedCandidates.push({ exercise, reason: "duplicate-already-selected" });
                return false;
              }
              return true;
            })
            .map((exercise) => ({
              exercise,
              match: getRequirementMatchDetails(exercise, req),
              score: scoreExerciseForSlot({
                exercise,
                slotPlan,
                targetMuscle: req.targetMuscle,
                goalType: goalUsed,
                blockType: block?.type || "hypertrophy",
                dayFocus: day.focus,
                selectedExercises: selectedExercisesForScoring,
                slotIndex: slot,
                totalSlots: req.requiredExerciseCount,
                weeklyExerciseCounts,
                dayBudget: buildFatigueBudget(selectedExercisesForScoring),
              }),
            }))
            .sort((a, b) => {
              const rankDelta = (a.match?.rank ?? Number.MAX_SAFE_INTEGER) - (b.match?.rank ?? Number.MAX_SAFE_INTEGER);
              if (rankDelta !== 0) return rankDelta;
              const childBiasDelta = (a.match?.childBiasPenalty ?? Number.MAX_SAFE_INTEGER) - (b.match?.childBiasPenalty ?? Number.MAX_SAFE_INTEGER);
              if (childBiasDelta !== 0) return childBiasDelta;
              return b.score - a.score;
            });
          const pick = rankedCandidates[0];
          const allVisibleMatchesAlreadySelected =
            pickerVisibleResults.length > 0 &&
            !rankedCandidates.length &&
            rejectedCandidates.length === pickerVisibleResults.length &&
            rejectedCandidates.every((item) => item.reason === "duplicate-already-selected");
          debugRequirementAutofill({
            mode: "remaining",
            selectedRequirement: req,
            pickerVisibleResults,
            autofillCandidates: rankedCandidates.map((item) => item.exercise),
            rejectedCandidates,
            existingSelectedExercises,
            usedIds,
            requirementStatusBefore: { fulfilled: filled, needed: req.requiredExerciseCount },
            requirementStatusAfter: {
              fulfilled: Math.min(req.requiredExerciseCount, filled + (pick ? 1 : 0)),
              needed: req.requiredExerciseCount,
            },
          });
          if (!pick) {
            if (allVisibleMatchesAlreadySelected) {
              unfilledReasonMessages.push(`All visible ${titleCaseLabel(req.targetMuscle)} matches are already selected.`);
            }
            continue;
          }
          selected.push({ exercise: pick.exercise, reqId: req.id, slotIndex: slot, totalRequiredForMuscle: req.requiredExerciseCount, exerciseRole: slotPlan.role });
          usedIds.add(pick.exercise.id);
          weeklyExerciseCounts[pick.exercise.id] = (weeklyExerciseCounts[pick.exercise.id] ?? 0) + 1;
          filled += 1;
        }
      }
      const simulatedExercises = [
        ...day.exercises,
        ...selected.map((item, index) => ({
          id: `autofill-${index}`,
          exerciseId: item.exercise.id,
          fulfillsRequirementId: item.reqId,
          isExtra: false,
        })),
      ] as typeof day.exercises;
      const postAllocation = allocateExercisesToRequirements(simulatedExercises, requirements, exerciseById);
      setShowRequirementWarning(!postAllocation.allRequirementsMet);
      setChooserWarning(!postAllocation.allRequirementsMet ? unfilledReasonMessages.join(" ") : "");
    } else {
      // No requirements: spread across muscles, max 2 per primary muscle
      const muscleCount: Record<string, number> = {};
      const maxPerMuscle = 2;
      const limit = Math.max(3, Math.min(6, targetMuscles.length + 2));
      const candidates = getSharedExerciseLibrarySource(db.exercises, user.id, {
        includeVariations: true,
      })
        .filter((ex) => {
          const muscleMatch = targetMuscles.length === 0 || ex.primaryMuscles.some((m) => targetMuscles.includes(m));
          const patternMatch = targetPatterns.length === 0 || targetPatterns.includes(ex.movementPattern) || ex.movementPatterns?.some((p) => targetPatterns.includes(p));
          return muscleMatch && patternMatch;
        });
      for (const ex of candidates) {
        if (selected.length >= limit) break;
        const primary = ex.primaryMuscles[0] ?? "other";
        if ((muscleCount[primary] ?? 0) < maxPerMuscle) {
          selected.push({ exercise: ex, reqId: undefined, exerciseRole: inferBaseExerciseRole(ex) });
          usedIds.add(ex.id);
          weeklyExerciseCounts[ex.id] = (weeklyExerciseCounts[ex.id] ?? 0) + 1;
          muscleCount[primary] = (muscleCount[primary] ?? 0) + 1;
        }
      }
    }

    if (!selected.length) {
      setShowRequirementWarning(false);
      setChooserWarning(unfilledReasonMessages[0] || "No new matching exercises found. Fill the missing requirement slots manually.");
      return;
    }
    updateDay((target) => {
      const orderedSelections = orderExercisesForDay(
        selected
          .map((item, index) => ({
            ...item,
            exerciseRole: classifyExerciseRole({
              exercise: item.exercise,
              dayType: inferWorkoutDayType({
                name: target.name,
                targetMuscles: target.targetMuscles,
                movementPatterns: target.movementPatterns,
              }),
              blockType: program.blocks[0]?.type || "hypertrophy",
              dayFocus: target.focus,
              orderHint: target.exercises.length + index + 1,
              explicitRole: item.exerciseRole,
              isPriority: Boolean(program.blocks[0]?.priorityExerciseIds.includes(item.exercise.id) || isSbdExercise(item.exercise)),
            }),
          })),
        {
          splitDay: {
            name: target.name,
            muscleGroups: target.targetMuscles || [],
            movementPatterns: target.movementPatterns || [],
          },
          blockType: program.blocks[0]?.type || "hypertrophy",
        }
      );
      const nextOrderStart = target.exercises.length + 1;
      const additions = orderedSelections.map((item, index) => {
        const planned = buildPlannedExerciseFromExercise({
          db,
          user,
          program,
          day: target,
          exercise: item.exercise,
          order: nextOrderStart + index,
          exerciseRole: item.exerciseRole,
          requirementSlotIndex: item.slotIndex,
          totalRequiredForMuscle: item.totalRequiredForMuscle,
        });
        planned.fulfillsRequirementId = item.reqId;
        return planned;
      });
      target.exercises.push(...additions);
      if (!isUserEditedOrder(target.exercises)) {
        target.exercises = coachOrderDayExercises(target.exercises);
        refreshAutoPrescriptions(target);
      } else {
        target.exercises = target.exercises.map((item, index) => ({ ...item, order: index + 1 }));
      }
    });
  }

  const pickerTargetMuscles = showAllExercises || !currentReq
    ? []
    : [currentReq.targetMuscle];

  if (weekVariant) {
    return (
      <div className="space-y-5">
        {showNameFocusFields && (
          <div className="border-b border-white/[0.06] pb-4">
            <button
              type="button"
              className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500 transition hover:text-iron-300"
              onClick={() => setDaySettingsOpen((v) => !v)}
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${daySettingsOpen ? "rotate-90" : ""}`} />
              Day settings
            </button>
            {daySettingsOpen && (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <TextField label="Day name" value={day.name} onChange={(name) => updateDay((target) => { target.name = name; })} />
                <SelectField label="Focus" value={day.focus} options={["strength", "hypertrophy", "technical", "recovery", "conditioning", "hybrid"]} onChange={(focus) => updateDay((target) => { target.focus = focus as WorkoutDay["focus"]; })} />
              </div>
            )}
          </div>
        )}

        {requirements.length > 0 && (
          <section className="border-b border-white/[0.06] pb-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Requirements</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reqProgress.map((item, idx) => {
                const done = item.fulfilled >= item.needed;
                const active = idx === currentReqIndex && !showAllExercises;
                return (
                  <button
                    key={item.req.id}
                    className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-[#0a84ff]/40 bg-[#0a84ff]/10 text-[#8fb9ff]"
                        : done
                          ? "border-white/[0.08] bg-white/[0.04] text-iron-300"
                          : "border-white/[0.08] bg-transparent text-iron-500"
                    }`}
                    onClick={() => { setCurrentReqIndex(idx); setShowAllExercises(false); setInlineReqPickerOpen((open) => idx === currentReqIndex ? !open : true); setShowPicker(false); }}
                  >
                    {titleCaseLabel(item.req.targetMuscle)} {item.fulfilled}/{item.needed}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-compact" onClick={chooseForCurrentRequirement} disabled={!currentReq}>
                <Wand2 className="h-3.5 w-3.5" />
                Choose for this slot
              </button>
              <button className="btn-compact" onClick={chooseForMe}>
                <Wand2 className="h-3.5 w-3.5" />
                Auto-fill remaining
              </button>
            </div>
            {requirementWarningText && <p className="mt-3 text-sm text-orange-300">{requirementWarningText}</p>}
            {chooserWarning && <p className="mt-3 text-sm text-orange-300">{chooserWarning}</p>}
            {allReqsMet && requirements.length > 0 && !inlineReqPickerOpen && !requirementWarningText && !chooserWarning && (
              <p className="mt-2 text-xs font-semibold text-emerald-400">All requirements filled</p>
            )}
            {inlineReqPickerOpen && currentReq && (
              <ExercisePicker
                db={db}
                user={user}
                updateDb={updateDb}
                onPick={(exercise) => {
                  const reqId = currentReq.id;
                  addExercise(exercise, false, reqId);
                  // Simulate post-add state to keep chip/title/filter/results in sync immediately.
                  const simulated = [...day.exercises, { exerciseId: exercise.id, fulfillsRequirementId: reqId, isExtra: false } as typeof day.exercises[number]];
                  const nextUnmet = findNextUnmetForExercises(simulated);
                  if (nextUnmet >= 0) {
                    setCurrentReqIndex(nextUnmet);
                    setInlineReqPickerOpen(true);
                  } else {
                    setInlineReqPickerOpen(false);
                  }
                }}
                alreadyAddedIds={alreadyAddedIds}
                targetMuscles={[currentReq.targetMuscle]}
                grouped
                variant="week-inline"
                title={`Add ${currentReq.targetMuscle} exercise`}
                requirementStatusLabel={`${titleCaseLabel(currentReq.targetMuscle)} ${reqProgress.find((item) => item.req.id === currentReq.id)?.fulfilled ?? 0}/${currentReq.requiredExerciseCount}`}
                onClose={() => setInlineReqPickerOpen(false)}
              />
            )}
          </section>
        )}

        <section className="border-b border-white/[0.06] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Exercises</p>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-compact" onClick={chooseForMe}>
                <Wand2 className="h-3.5 w-3.5" />
                Auto-fill remaining
              </button>
              <button className="btn-compact text-[#8fb9ff]" onClick={() => { setSwappingExerciseId(undefined); setShowPicker((value) => !value); }}>
                <Plus className="h-3.5 w-3.5" />
                Add Exercise
              </button>
            </div>
          </div>

          <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {day.exercises.map((planned, index) => {
              const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
              const displayUnit = exercise ? getExerciseDisplayUnit(exercise, user) : user.unit;
              const plannedWeightText = getPlannedExerciseBadgeText({
                exercise,
                displayUnit,
                plannedWeight: planned.plannedSets[0]?.plannedWeight,
              }) || "—";
              const assignment = requirementAllocation.assignmentByPlannedExerciseId.get(planned.id);
              const reqBadge = assignment
                ? requirements.find((req) => req.id === assignment.assignedRequirementId)
                : undefined;
              const isSwappingExercise = swappingExerciseId === planned.id;

              return (
                <div key={planned.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/[0.1] bg-white/[0.04] text-xs font-bold text-iron-400">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white leading-snug">{exercise?.name || "Unknown exercise"}</p>
                      <p className="mt-0.5 text-xs text-iron-500">
                        {planned.plannedSets.length} × {planned.plannedSets[0]?.targetReps || 8} · RPE {planned.plannedSets[0]?.targetRpe || 7}
                        {reqBadge && <> · <span className="text-[#8fb9ff]">{titleCaseLabel(reqBadge.targetMuscle)}</span></>}
                        {planned.isExtra && <> · <span className="text-iron-600">extra</span></>}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-iron-400">{plannedWeightText}</span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <WeekEditorStepper
                      label="Sets"
                      value={planned.plannedSets.length}
                      step={1}
                      min={1}
                      onChange={(count) => updateDay((target) => {
                        const targetExercise = target.exercises.find((item) => item.id === planned.id);
                        if (!targetExercise) return;
                        const base = targetExercise.plannedSets[0] || { id: createId("pset"), kind: "working" as SetKind, targetReps: 8, targetRpe: 7 };
                        targetExercise.plannedSets = Array.from({ length: Math.max(1, Math.round(count)) }, () => ({ ...base, id: createId("pset") }));
                        targetExercise.userEditedPrescription = true;
                      })}
                    />
                    <WeekEditorStepper
                      label="Reps"
                      value={planned.plannedSets[0]?.targetReps || 8}
                      step={1}
                      min={1}
                      onChange={(reps) => updateDay((target) => {
                        const targetExercise = target.exercises.find((item) => item.id === planned.id);
                        targetExercise?.plannedSets.forEach((set) => { set.targetReps = Math.max(1, Math.round(reps)); });
                        if (targetExercise) targetExercise.userEditedPrescription = true;
                      })}
                    />
                    <WeekEditorStepper
                      label="RPE"
                      value={planned.plannedSets[0]?.targetRpe || 7}
                      step={0.5}
                      min={1}
                      max={10}
                      onChange={(rpe) => updateDay((target) => {
                        const targetExercise = target.exercises.find((item) => item.id === planned.id);
                        targetExercise?.plannedSets.forEach((set) => { set.targetRpe = sanitizeRpe(rpe); });
                        if (targetExercise) targetExercise.userEditedPrescription = true;
                      })}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">
                    <button className={`btn-compact ${isSwappingExercise ? "text-[#8fb9ff]" : ""}`} onClick={() => { setShowPicker(false); setSwappingExerciseId((current) => current === planned.id ? undefined : planned.id); }}>
                      <RefreshCcw className="h-3.5 w-3.5" />
                      {isSwappingExercise ? "Done" : "Swap exercise"}
                    </button>
                    <button
                      className="btn-compact text-orange-300 hover:text-orange-200"
                      onClick={() => updateDay((target) => {
                        target.exercises = target.exercises.filter((item) => item.id !== planned.id).map((item, nextIndex) => ({ ...item, order: nextIndex + 1 }));
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {showPicker && (
          <ExercisePicker
            db={db}
            user={user}
            updateDb={updateDb}
            onPick={(exercise) => {
              addExercise(exercise, false, null);
              setShowPicker(false);
            }}
            alreadyAddedIds={alreadyAddedIds}
            targetMuscles={[]}
            targetPatterns={[]}
            grouped={false}
            variant="week-sheet"
            title={allReqsMet ? "Add exercise" : "Add exercise"}
            onClose={() => setShowPicker(false)}
          />
        )}

        {swappingExerciseId && (
          <ExercisePicker
            db={db}
            user={user}
            updateDb={updateDb}
            onPick={(replacement) => swapExercise(swappingExerciseId, replacement)}
            alreadyAddedIds={day.exercises.filter((item) => item.id !== swappingExerciseId).map((item) => item.exerciseId)}
            selectedIds={(() => {
              const selectedPlanned = day.exercises.find((item) => item.id === swappingExerciseId);
              return selectedPlanned ? [selectedPlanned.exerciseId] : [];
            })()}
            targetMuscles={(() => {
              const selectedPlanned = day.exercises.find((item) => item.id === swappingExerciseId);
              const assignment = selectedPlanned ? requirementAllocation.assignmentByPlannedExerciseId.get(selectedPlanned.id) : undefined;
              const req = assignment ? requirements.find((item) => item.id === assignment.assignedRequirementId) : undefined;
              const exercise = selectedPlanned ? db.exercises.find((item) => item.id === selectedPlanned.exerciseId) : undefined;
              return req ? [req.targetMuscle] : exercise?.primaryMuscles || [];
            })()}
            targetPatterns={day.movementPatterns || []}
            grouped
            variant="week-sheet"
            title="Swap exercise"
            onClose={() => setSwappingExerciseId(undefined)}
          />
        )}

        {pendingExtraExercise && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
            <div className="panel w-full max-w-sm space-y-4 p-6">
              <h3 className="text-lg font-black">Add extra exercise?</h3>
              <p className="text-sm text-iron-300">
                <span className="font-bold text-white">{pendingExtraExercise.name}</span> would be added beyond the requirement for{" "}
                <span className="font-bold text-[#8fb9ff]">{currentReq?.targetMuscle}</span>.
              </p>
              <div className="flex gap-3">
                <button className="apollo-primary-btn flex-1" onClick={() => addExercise(pendingExtraExercise, true)}>
                  Add Extra
                </button>
                <button className="apollo-secondary-btn" onClick={() => setPendingExtraExercise(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {showNameFocusFields && (
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Day name" value={day.name} onChange={(name) => updateDay((target) => { target.name = name; })} />
          <SelectField label="Focus" value={day.focus} options={["strength", "hypertrophy", "technical", "recovery", "conditioning", "hybrid"]} onChange={(focus) => updateDay((target) => { target.focus = focus as WorkoutDay["focus"]; })} />
        </div>
      )}
      <button className="btn-secondary w-full" onClick={chooseForMe}><Wand2 className="h-4 w-4" /> Choose For Me</button>
      {requirementWarningText && <div className="rounded-lg border border-ember/40 bg-ember/10 p-3 text-sm text-orange-100">{requirementWarningText}</div>}
      {chooserWarning && <div className="rounded-lg border border-ember/40 bg-ember/10 p-3 text-sm text-orange-100">{chooserWarning}</div>}

      {/* Requirement progress badges */}
      {requirements.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label">Requirements</span>
            {reqProgress.map((item, idx) => {
              const done = item.fulfilled >= item.needed;
              const active = idx === currentReqIndex && !showAllExercises;
              return (
                <button
                  key={item.req.id}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    active ? "bg-volt text-iron-950" :
                    done ? "bg-volt/20 text-volt" :
                    "bg-white/10 text-iron-300"
                  }`}
                  onClick={() => { setCurrentReqIndex(idx); setShowAllExercises(false); }}
                >
                  {item.req.targetMuscle} {item.fulfilled}/{item.needed}
                </button>
              );
            })}
          </div>
          {allReqsMet && !showPrescription && (
            <button className="btn-primary w-full mt-2" onClick={() => setShowPrescription(true)}>
              <CheckCircle2 className="h-4 w-4" /> All requirements met — Continue to prescription
            </button>
          )}
        </div>
      )}

      {/* Exercise picker — hidden after all requirements met unless user wants more */}
      {(!allReqsMet || !showPrescription) && (
        <div className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
          <label className="mb-3 flex items-center gap-2 text-sm font-bold text-iron-200">
            <input type="checkbox" checked={showAllExercises} onChange={(event) => setShowAllExercises(event.target.checked)} />
            Override: show all exercises
          </label>
          <ExercisePicker
            db={db}
            user={user}
            updateDb={updateDb}
            onPick={addExercise}
            alreadyAddedIds={alreadyAddedIds}
            targetMuscles={pickerTargetMuscles}
            targetPatterns={showAllExercises ? [] : day.movementPatterns || []}
            grouped={!showAllExercises}
          />
        </div>
      )}

      {/* Prescription list */}
      <div className="space-y-2">
        {day.exercises.map((planned) => {
          const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
          const isEditingExercise = editingExerciseId === planned.id;
          const isSwappingExercise = swappingExerciseId === planned.id;
          // Badge: use fulfillsRequirementId as primary signal, fall back to muscle match for legacy
          const assignment = requirementAllocation.assignmentByPlannedExerciseId.get(planned.id);
          const reqBadge = assignment
            ? requirements.find((req) => req.id === assignment.assignedRequirementId)
            : undefined;
          return (
            <div key={planned.id} className={`rounded-lg border p-3 ${planned.isExtra ? "border-white/10 bg-white/[0.03]" : "border-white/10 bg-white/[0.06]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black">{planned.order}. {exercise?.name}</p>
                  <p className="text-xs text-iron-400">
                    {planned.plannedSets.length} sets · {planned.plannedSets[0]?.targetReps} reps · RPE {planned.plannedSets[0]?.targetRpe}
                    {reqBadge && <span className="ml-2 rounded-full bg-volt/15 px-2 py-0.5 text-volt">{reqBadge.targetMuscle}</span>}
                    {planned.exerciseRole && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-iron-300">{planned.exerciseRole.replaceAll("_", " ")}</span>}
                    {planned.fatigueTag === "high" && <span className="ml-2 rounded-full bg-ember/15 px-2 py-0.5 text-orange-100">high fatigue</span>}
                    {planned.isExtra && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-iron-400">extra</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost text-xs" onClick={() => setEditingExerciseId((current) => current === planned.id ? undefined : planned.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {isEditingExercise ? "Done Editing" : "Edit Exercise"}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => setSwappingExerciseId((current) => current === planned.id ? undefined : planned.id)}>
                    <RefreshCcw className="h-3.5 w-3.5" />
                    {isSwappingExercise ? "Cancel Swap" : "Swap Exercise"}
                  </button>
                  <button className="btn-ghost text-xs text-orange-100" onClick={() => updateDay((target) => {
                    target.exercises = target.exercises.filter((item) => item.id !== planned.id).map((item, index) => ({ ...item, order: index + 1 }));
                  })}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Exercise
                  </button>
                </div>
              </div>
              {isEditingExercise && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <NumberField label="Sets" value={planned.plannedSets.length} onChange={(count) => updateDay((target) => {
                    const targetExercise = target.exercises.find((item) => item.id === planned.id);
                    if (!targetExercise) return;
                    const base = targetExercise.plannedSets[0] || { id: createId("pset"), kind: "working" as SetKind, targetReps: 8, targetRpe: 7 };
                    targetExercise.plannedSets = Array.from({ length: Math.max(1, count) }, () => ({ ...base, id: createId("pset") }));
                    targetExercise.userEditedPrescription = true;
                  })} />
                  <NumberField label="Reps" value={planned.plannedSets[0]?.targetReps || 8} onChange={(reps) => updateDay((target) => {
                    const targetExercise = target.exercises.find((item) => item.id === planned.id);
                    targetExercise?.plannedSets.forEach((set) => { set.targetReps = reps; });
                    if (targetExercise) targetExercise.userEditedPrescription = true;
                  })} />
                  <NumberField label="RPE" step={0.5} value={planned.plannedSets[0]?.targetRpe || 7} onChange={(rpe) => updateDay((target) => {
                    const targetExercise = target.exercises.find((item) => item.id === planned.id);
                    targetExercise?.plannedSets.forEach((set) => { set.targetRpe = sanitizeRpe(rpe); });
                    if (targetExercise) targetExercise.userEditedPrescription = true;
                  })} />
                </div>
              )}
              {isSwappingExercise && (
                <div className="mt-3 rounded-lg border border-white/10 bg-iron-950/40 p-3">
                  <p className="label mb-2 text-volt">Swap exercise</p>
                  <ExercisePicker
                    db={db}
                    user={user}
                    updateDb={updateDb}
                    onPick={(replacement) => swapExercise(planned.id, replacement)}
                    alreadyAddedIds={day.exercises.filter((item) => item.id !== planned.id).map((item) => item.exerciseId)}
                    selectedIds={exercise ? [exercise.id] : []}
                    targetMuscles={reqBadge ? [reqBadge.targetMuscle] : exercise?.primaryMuscles || []}
                    targetPatterns={day.movementPatterns || []}
                    grouped
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Extra Anyway modal */}
      {pendingExtraExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
          <div className="panel w-full max-w-sm space-y-4 p-6">
            <h3 className="text-lg font-black">Add extra exercise?</h3>
            <p className="text-sm text-iron-300">
              <span className="font-bold text-white">{pendingExtraExercise.name}</span> would be added beyond the requirement for{" "}
              <span className="font-bold text-volt">{currentReq?.targetMuscle}</span> ({reqProgress.find((r) => r.req.id === currentReq?.id)?.fulfilled}/{currentReq?.requiredExerciseCount} already filled).
            </p>
            <p className="text-xs text-iron-400">Extra exercises are visible in the plan but do not count toward requirement slots.</p>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={() => addExercise(pendingExtraExercise, true)}>
                Add Extra Anyway
              </button>
              <button className="btn-secondary" onClick={() => setPendingExtraExercise(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExercisePicker({
  db,
  user,
  onPick,
  selectedIds = [],
  alreadyAddedIds = [],
  compoundFilter = "all",
  targetMuscles = [],
  targetPatterns = [],
  grouped = false,
  variant = "default",
  title,
  requirementStatusLabel,
  onClose,
  updateDb,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  onPick: (exercise: Exercise) => void;
  selectedIds?: string[];
  alreadyAddedIds?: string[];
  compoundFilter?: "all" | "compound" | "isolation";
  targetMuscles?: MuscleGroup[];
  targetPatterns?: MovementPattern[];
  grouped?: boolean;
  variant?: "default" | "week-sheet" | "week-inline";
  title?: string;
  requirementStatusLabel?: string;
  onClose?: () => void;
  updateDb?: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const weekSheet = variant === "week-sheet";
  const weekInline = variant === "week-inline";
  const defaultIncrement = user.unit === "kg" ? 2.5 : 5;
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [pattern, setPattern] = useState("all");
  const [fatigue, setFatigue] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState<{
    name: string;
    muscle: MuscleGroup;
    equipment: EquipmentCategory;
    movementPattern: MovementPattern;
    isVariation: boolean;
    parentExerciseId: string;
    variationType: string;
  }>({
    name: "",
    muscle: "chest",
    equipment: "barbell",
    movementPattern: "isolation",
    isVariation: false,
    parentExerciseId: "",
    variationType: "",
  });
  const [parentSearch, setParentSearch] = useState("");
  const requirementMode = grouped && targetMuscles.length > 0;
  const requirementMuscle = requirementMode ? targetMuscles[0] : undefined;
  const [manualMuscleOverride, setManualMuscleOverride] = useState(false);
  const effectiveMuscleFilter = requirementMode && !manualMuscleOverride
    ? requirementMuscle ?? "all"
    : muscle;

  useEffect(() => {
    if (requirementMode) {
      setManualMuscleOverride(false);
      setMuscle(requirementMuscle ?? "all");
    } else {
      setManualMuscleOverride(false);
    }
  }, [requirementMode, requirementMuscle]);

  function handleMuscleFilterChange(nextValue: string) {
    if (requirementMode) {
      setManualMuscleOverride(true);
    }
    setMuscle(nextValue);
  }

  function resetCreateForm() {
    setShowCreateForm(false);
    setParentSearch("");
    setCreateDraft({
      name: "",
      muscle: requirementMuscle ?? "chest",
      equipment: "barbell",
      movementPattern: "isolation",
      isVariation: false,
      parentExerciseId: "",
      variationType: "",
    });
  }

  const visibleExercises = useMemo(
    () => getSharedExerciseLibrarySource(db.exercises, user.id, {
      query,
      includeVariations: true,
    }),
    [db.exercises, query, user.id]
  );
  const parentExerciseOptions = useMemo(
    () => getSharedExerciseLibrarySource(db.exercises, user.id, {
      query: parentSearch,
      includeVariations: false,
    }).filter((exercise) => !exercise.isVariation),
    [db.exercises, parentSearch, user.id]
  );
  const selectedParentExercise = createDraft.parentExerciseId
    ? db.exercises.find((exercise) => exercise.id === createDraft.parentExerciseId)
    : undefined;

  function handleQuickCreate() {
    const parent = createDraft.parentExerciseId
      ? db.exercises.find((exercise) => exercise.id === createDraft.parentExerciseId)
      : undefined;
    const isVariation = createDraft.isVariation && !!parent;
    const trimmedName = createDraft.name.trim();
    const variationType = createDraft.variationType.trim();
    const resolvedName = trimmedName || (isVariation && parent ? `${parent.name} ${variationType || "Variation"}` : "");
    if (!resolvedName || !updateDb || (createDraft.isVariation && !parent)) return;

    const resolvedMuscle = parent?.primaryMuscles[0] || createDraft.muscle;
    const resolvedEquipment = parent?.equipment[0] || createDraft.equipment;
    const resolvedPattern = parent?.movementPatterns?.[0] || parent?.movementPattern || createDraft.movementPattern;
    const exercise: Exercise = {
      id: createId("ex"),
      ownerUserId: user.id,
      name: resolvedName,
      description: "",
      muscleGroup: resolvedMuscle,
      primaryMuscles: parent?.primaryMuscles?.length ? structuredClone(parent.primaryMuscles) : [resolvedMuscle],
      secondaryMuscles: parent?.secondaryMuscles?.length ? structuredClone(parent.secondaryMuscles) : [],
      equipment: [resolvedEquipment],
      exerciseCategory: parent?.exerciseCategory || "isolation",
      movementPattern: resolvedPattern,
      movementPatterns: parent?.movementPatterns?.length ? structuredClone(parent.movementPatterns) : [resolvedPattern],
      tags: [user.goal],
      tagLabels: [],
      variants: [],
      substitutionIds: [],
      notes: "",
      setupCues: [],
      trackByBodyweight: resolvedEquipment === "bodyweight",
      trackPerSide: parent?.trackPerSide || resolvedEquipment === "dumbbell" || resolvedEquipment === "cable",
      category: resolvedEquipment,
      kind: parent?.kind?.length ? structuredClone(parent.kind) : ["accessory"],
      directVolumeMuscles: parent?.directVolumeMuscles?.length ? structuredClone(parent.directVolumeMuscles) : [resolvedMuscle],
      indirectVolumeMuscles: parent?.indirectVolumeMuscles?.length ? structuredClone(parent.indirectVolumeMuscles) : [],
      bestTrackedBy: ["load", "reps"],
      fatigueRating: parent?.fatigueRating || 2,
      isCompound: parent?.isCompound || false,
      defaultUnit: user.unit as ExerciseUnit,
      allowedUnits: parent?.allowedUnits?.length ? structuredClone(parent.allowedUnits) : [user.unit as ExerciseUnit],
      defaultIncrement: parent?.defaultIncrement || defaultIncrement,
      customIncrement: parent?.customIncrement || defaultIncrement,
      loadingProfileId: parent?.loadingProfileId,
      canBeGymSpecific: parent?.canBeGymSpecific || false,
      isGymSpecificEnabled: parent?.isGymSpecificEnabled || false,
      createdByUser: true,
      source: "custom" as const,
      isVariation: isVariation || undefined,
      parentExerciseId: isVariation ? parent.id : undefined,
      variationType: isVariation && variationType ? variationType : undefined,
      variationName: isVariation && variationType ? variationType : undefined,
      variationGroup: isVariation ? (parent.variationGroup || parent.id) : undefined,
      variationGroupId: isVariation ? (parent.variationGroupId || parent.id) : undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    void updateDb((data) => {
      data.exercises.unshift(exercise);
      if (isVariation) {
        const parentTarget = data.exercises.find((item) => item.id === parent.id);
        if (parentTarget) parentTarget.hasVariations = true;
      }
      return data;
    });
    resetCreateForm();
    onPick(exercise);
  }
  const allMatches = visibleExercises
    .filter((exercise) => {
      const targetPatternMatch = !targetPatterns.length || targetPatterns.includes(exercise.movementPattern) || exercise.movementPatterns?.some((patternItem) => targetPatterns.includes(patternItem));
      const muscleFilterMatch = requirementMode && !manualMuscleOverride && requirementMuscle
        ? exerciseMatchesRequirementTarget(exercise, requirementMuscle)
        : exerciseMatchesMuscleFilter(exercise, effectiveMuscleFilter);
      return (
        muscleFilterMatch &&
        (equipment === "all" || exercise.equipment.includes(equipment as EquipmentCategory)) &&
        (pattern === "all" || exercise.movementPattern === pattern || exercise.movementPatterns?.includes(pattern as MovementPattern)) &&
        (fatigue === "all" || String(fatigueRatingForExercise(exercise)) === fatigue) &&
        (compoundFilter === "all" || (compoundFilter === "compound" ? isCompound(exercise) : exercise.kind.includes("isolation"))) &&
        // In grouped mode, only gate by movement pattern when targetMuscles is non-empty
        // (i.e. grouped sections will render). When targetMuscles=[]/flat-list mode, show all
        // exercises so the picker functions as a full library browse, not a pattern-restricted subset.
        (!grouped || !targetMuscles.length || query || effectiveMuscleFilter !== "all" || pattern !== "all" || targetPatternMatch)
      );
    });
  // Grouped + target muscles → 36-item fallback (mostly hidden by grouped sections above).
  // Grouped, no target muscles → show all matching exercises (full-library flat browse,
  //   rendered in a scrollable sheet — no artificial cap).
  // Non-grouped default (inline embed) → 50, enough to browse without searching.
  const matches = allMatches.slice(0,
    grouped && targetMuscles.length ? 36
    : grouped ? allMatches.length
    : 50
  );
  const groupedMuscles = targetMuscles.filter((item, index) => targetMuscles.indexOf(item) === index);
  // For grouped muscle sections, query by primaryMuscles directly (not filtered by movement pattern)
  // so that exercises like Leg Extension always appear for quads regardless of day movement patterns.
  const muscleOnlyPool = grouped && groupedMuscles.length
    ? visibleExercises
    : visibleExercises;
  const groupedSections = grouped && !query && effectiveMuscleFilter === "all" && groupedMuscles.length
    ? groupedMuscles.map((targetMuscle) => ({
        muscle: targetMuscle,
        exercises: muscleOnlyPool
          .filter((exercise) => exerciseMatchesRequirementTarget(exercise, targetMuscle))
          .slice(0, 5)
      })).filter((section) => section.exercises.length)
    : [];

  const renderExerciseButton = (exercise: Exercise) => {
    const isSelected = selectedIds.includes(exercise.id);
    const isAlreadyAdded = alreadyAddedIds.includes(exercise.id);
    return (
      <button
        key={exercise.id}
        disabled={isAlreadyAdded}
        className={weekSheet || weekInline
          ? `w-full border-b border-white/[0.06] px-0 py-3 text-left transition ${
            isAlreadyAdded ? "cursor-not-allowed opacity-45" :
            isSelected ? "bg-[#0a84ff]/[0.08]" :
            "hover:bg-white/[0.03]"
          }`
          : `w-full border-b border-white/[0.06] px-0 py-3 text-left transition ${
            isAlreadyAdded ? "cursor-not-allowed opacity-45" :
            isSelected ? "bg-[#0a84ff]/[0.08]" :
            "hover:bg-white/[0.03]"
          }`}
        onClick={() => !isAlreadyAdded && onPick(exercise)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`${weekSheet || weekInline ? "text-sm font-medium text-white" : "text-sm font-medium text-white"}`}>{exercise.name}</p>
            <p className="mt-1 text-xs text-iron-400">
              {exercise.primaryMuscles.slice(0, 2).join(" · ")}{exercise.equipment[0] ? ` · ${exercise.equipment[0]}` : ""}
            </p>
            <p className={`mt-1 ${weekSheet || weekInline ? "text-[0.68rem] uppercase tracking-[0.12em] text-iron-500" : "text-[0.68rem] font-bold uppercase tracking-[0.12em] text-iron-500"}`}>
              {isCompound(exercise) ? "compound" : "isolation"} · fatigue {fatigueRatingForExercise(exercise)}/5
            </p>
          </div>
          {isAlreadyAdded
            ? <span className={`${weekSheet || weekInline ? "rounded-sm border border-white/[0.08] px-2 py-0.5 text-[0.65rem] font-medium text-iron-500" : "rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-bold text-iron-400"}`}>Added</span>
            : isSelected
              ? <Check className="h-4 w-4 text-[#8fb9ff]" />
              : null}
        </div>
      </button>
    );
  };

  const pickerBody = (
    <>
      {weekSheet || weekInline ? (
        <div className={`border-b border-white/[0.06] px-4 py-4 ${weekSheet ? "sticky top-0 z-10 bg-[#0d1016]/95 backdrop-blur" : "bg-iron-950"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-white">{title || "Add exercise"}</p>
            {onClose && <button className="btn-compact" onClick={onClose}>Cancel</button>}
          </div>
          <div className="mt-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Search</p>
            <input className="field mt-2" placeholder="Search exercises..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {requirementMode && (
            <div className="mt-4 space-y-2">
              <div className="rounded-sm border border-[#0a84ff]/20 bg-[#0a84ff]/6 px-3 py-2 text-sm text-iron-200">
                <span className="text-iron-400">Target slot:</span>{" "}
                <span className="font-medium text-white">{requirementStatusLabel || titleCaseLabel(requirementMuscle || "all")}</span>
              </div>
              <p className="text-xs text-iron-400">
                {manualMuscleOverride
                  ? `Manual filter override. Results are showing ${titleCaseLabel(effectiveMuscleFilter)} exercises, but selected picks will still fill the ${titleCaseLabel(requirementMuscle || "all")} slot.`
                  : "Filtered for this requirement. Change muscle to search outside this slot."}
              </p>
            </div>
          )}
          <div className="mt-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Filters</p>
            <div className="-mx-4 mt-2 overflow-x-auto px-4 scrollbar-none">
              <div className="flex min-w-max gap-2">
                <select className="field min-w-[8.5rem]" value={effectiveMuscleFilter} onChange={(event) => handleMuscleFilterChange(event.target.value)}>
                  <option value="all">Muscle</option>
                  {muscleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field min-w-[8.5rem]" value={equipment} onChange={(event) => setEquipment(event.target.value)}>
                  <option value="all">Equipment</option>
                  {equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field min-w-[8.5rem]" value={pattern} onChange={(event) => setPattern(event.target.value)}>
                  <option value="all">Pattern</option>
                  {movementOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field min-w-[8rem]" value={fatigue} onChange={(event) => setFatigue(event.target.value)}>
                  <option value="all">Fatigue</option>
                  {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}/5</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#8fb9ff]" />
            <p className="text-sm font-semibold text-white">Exercise picker</p>
          </div>
          <p className="mb-3 text-xs text-iron-400">Search and select exercises from the exercise library.</p>
          <input className="field" placeholder="Search name, muscle, equipment, movement pattern..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <button
            className="mt-2 flex w-full items-center justify-between border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs text-iron-300 transition hover:bg-white/[0.06]"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters
            <ChevronRight className={`h-3.5 w-3.5 text-iron-500 transition ${showFilters ? "rotate-90" : ""}`} />
          </button>
        </>
      )}
      {!weekSheet && !weekInline && showFilters && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className="field" value={effectiveMuscleFilter} onChange={(event) => handleMuscleFilterChange(event.target.value)}>
            <option value="all">Muscle</option>
            {muscleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="field" value={equipment} onChange={(event) => setEquipment(event.target.value)}>
            <option value="all">Equipment</option>
            {equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="field" value={pattern} onChange={(event) => setPattern(event.target.value)}>
            <option value="all">Pattern</option>
            {movementOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="field" value={fatigue} onChange={(event) => setFatigue(event.target.value)}>
            <option value="all">Fatigue</option>
            {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}/5</option>)}
          </select>
        </div>
      )}
      {groupedSections.length ? (
        <div className={weekSheet ? "min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]" : weekInline ? "min-h-0 max-h-[min(60dvh,28rem)] overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] scrollbar-none" : "mt-3 space-y-3"}>
          {groupedSections.map((section) => (
            <div key={section.muscle} className={weekSheet || weekInline ? "mb-4" : "mb-4"}>
              <p className={`${weekSheet || weekInline ? "mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500" : "label mb-2"}`}>{section.muscle}</p>
              <div className={weekSheet || weekInline ? "divide-y divide-white/[0.06] border-t border-white/[0.06]" : "divide-y divide-white/[0.06] border-y border-white/[0.06]"}>{section.exercises.map(renderExerciseButton)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={weekSheet ? "min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]" : weekInline ? "min-h-0 max-h-[min(60dvh,28rem)] overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] scrollbar-none" : "mt-3"}>
          <div className={weekSheet || weekInline ? "divide-y divide-white/[0.06] border-t border-white/[0.06]" : "divide-y divide-white/[0.06] border-y border-white/[0.06]"}>{matches.map(renderExerciseButton)}</div>
        </div>
      )}
      {!matches.length && !groupedSections.length && <EmptyState title="No exercises found" detail="Try a broader muscle, equipment, or movement filter." />}
      {updateDb && (
        <div className={weekSheet || weekInline ? "border-t border-white/[0.06] px-4 py-3" : "mt-3 border-t border-white/[0.06] pt-3"}>
          {!showCreateForm ? (
            <button
              className="btn-compact w-full text-[#8fb9ff]"
              onClick={() => {
                setShowCreateForm(true);
                setCreateDraft((current) => ({
                  ...current,
                  muscle: requirementMuscle ?? current.muscle,
                }));
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create exercise or variation
            </button>
          ) : (
            <div className="space-y-3 rounded-sm border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">New exercise</p>
                <button
                  className="btn-compact"
                  onClick={() => setCreateDraft((current) => ({
                    ...current,
                    isVariation: !current.isVariation,
                    parentExerciseId: current.isVariation ? "" : current.parentExerciseId,
                    variationType: current.isVariation ? "" : current.variationType,
                  }))}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {createDraft.isVariation ? "Variation on" : "Make variation"}
                </button>
              </div>
              <input
                className="field"
                style={{ fontSize: "16px" }}
                placeholder={createDraft.isVariation ? "Variation name" : "Exercise name"}
                value={createDraft.name}
                onChange={(e) => setCreateDraft((current) => ({ ...current, name: e.target.value }))}
                autoFocus
              />
              {createDraft.isVariation ? (
                <div className="space-y-3">
                  {selectedParentExercise ? (
                    <div className={`rounded-sm border px-3 py-2 ${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL}`}>
                      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${LIBRARY_BLUE_TEXT}`}>Parent exercise</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-medium text-white">{selectedParentExercise.name}</p>
                        <button
                          className="text-iron-300 transition hover:text-white"
                          onClick={() => {
                            setParentSearch("");
                            setCreateDraft((current) => ({ ...current, parentExerciseId: "" }));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        className="field"
                        style={{ fontSize: "16px" }}
                        placeholder="Search parent exercise"
                        value={parentSearch}
                        onChange={(event) => setParentSearch(event.target.value)}
                      />
                      {parentSearch.trim() ? (
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-sm border border-white/[0.08] bg-iron-950/80">
                          {parentExerciseOptions.length ? parentExerciseOptions.map((exercise) => (
                            <button
                              key={exercise.id}
                              className="flex w-full items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2 text-left text-sm text-iron-200 transition last:border-b-0 hover:bg-white/[0.05]"
                              onClick={() => {
                                setParentSearch(exercise.name);
                                setCreateDraft((current) => ({
                                  ...current,
                                  parentExerciseId: exercise.id,
                                  muscle: exercise.primaryMuscles[0] || current.muscle,
                                  equipment: exercise.equipment[0] || current.equipment,
                                  movementPattern: exercise.movementPatterns?.[0] || exercise.movementPattern || current.movementPattern,
                                }));
                              }}
                            >
                              <span className="truncate">{exercise.name}</span>
                              <ChevronRight className="h-4 w-4 text-iron-600" />
                            </button>
                          )) : <p className="px-3 py-2 text-xs text-iron-500">No parent exercises found.</p>}
                        </div>
                      ) : null}
                    </div>
                  )}
                  <input
                    className="field"
                    style={{ fontSize: "16px" }}
                    placeholder="Variation type (optional)"
                    value={createDraft.variationType}
                    onChange={(event) => setCreateDraft((current) => ({ ...current, variationType: event.target.value }))}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select className="field" style={{ fontSize: "16px" }} value={createDraft.muscle} onChange={(e) => setCreateDraft((current) => ({ ...current, muscle: e.target.value as MuscleGroup }))}>
                    {muscleOptions.map((m) => <option key={m} value={m}>{titleCaseLabel(m)}</option>)}
                  </select>
                  <select className="field" style={{ fontSize: "16px" }} value={createDraft.equipment} onChange={(e) => setCreateDraft((current) => ({ ...current, equipment: e.target.value as EquipmentCategory }))}>
                    {equipmentOptions.map((eq) => <option key={eq} value={eq}>{formatEquipmentLabel(eq)}</option>)}
                  </select>
                  <select className="field" style={{ fontSize: "16px" }} value={createDraft.movementPattern} onChange={(e) => setCreateDraft((current) => ({ ...current, movementPattern: e.target.value as MovementPattern }))}>
                    {movementOptions.map((item) => <option key={item} value={item}>{titleCaseLabel(item)}</option>)}
                  </select>
                </div>
              )}
              {createDraft.isVariation && !selectedParentExercise ? (
                <p className="text-xs text-iron-500">Pick a parent exercise to keep the variation attached to the same family everywhere in the app.</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  className="apollo-primary-btn flex-1 text-xs"
                  disabled={(!(createDraft.name.trim() || createDraft.variationType.trim())) || (createDraft.isVariation && !selectedParentExercise)}
                  onClick={handleQuickCreate}
                >
                  Save &amp; add
                </button>
                <button
                  className="apollo-secondary-btn text-xs"
                  onClick={resetCreateForm}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return weekSheet ? (
    <div className="apollo-picker-sheet">
      <div className="apollo-picker-panel">{pickerBody}</div>
    </div>
  ) : weekInline ? (
    <div className="mt-3 flex max-h-[min(72dvh,36rem)] flex-col overflow-hidden rounded-sm border border-white/[0.08] bg-iron-950">{pickerBody}</div>
  ) : (
    <div className="border border-white/[0.08] bg-iron-950/45 p-3">{pickerBody}</div>
  );
}

function BlockHistory({
  db,
  user,
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const historical = db.programs.filter((program) => program.userId === user.id && program.status !== "active");
  const [openProgramId, setOpenProgramId] = useState<string | undefined>();
  const openProgram = historical.find((program) => program.id === openProgramId);

  function duplicate(program: Program) {
    const clone = cloneProgramAsActive(program);
    void updateDb((draft) => {
      draft.programs.forEach((item) => {
        if (item.userId === user.id && item.status === "active") item.status = "archived";
      });
      draft.programs.unshift(clone);
      const target = draft.users.find((item) => item.id === user.id);
      if (target) {
        target.activeProgramId = clone.id;
        target.activeBlockId = clone.blocks[0]?.id;
      }
      draft.programGaps = analyzeProgramGaps(clone, draft);
      return draft;
    });
  }

  function deleteProgram(program: Program) {
    if (!confirm(`Delete previous block "${program.name}"? This removes the local saved block but not completed workout sessions.`)) return;
    void updateDb((draft) => {
      draft.programs = draft.programs.filter((item) => item.id !== program.id);
      if (openProgramId === program.id) setOpenProgramId(undefined);
      return draft;
    });
  }

  return (
    <Panel title="Previous Blocks" icon={Eye}>
      {historical.length ? (
        <div className="space-y-3">
          {historical.map((program) => {
            const block = program.blocks[0];
            const weeklyVolume = summarizePlannedVolume(program, db);
            const totalSets = Object.values(weeklyVolume).reduce((sum, value) => sum + value, 0);
            return (
              <div key={program.id} className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{program.name}</p>
                    <p className="text-xs text-iron-400">{program.goal} - {block?.type} - {block?.trainingDaysPerWeek} days/week - {block?.lengthWeeks} weeks - {new Date(program.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setOpenProgramId(openProgramId === program.id ? undefined : program.id)}>Open</button>
                    <button className="btn-secondary" onClick={() => duplicate(program)}>Duplicate</button>
                    <button className="btn-ghost text-orange-100" onClick={() => deleteProgram(program)}><Trash2 className="h-4 w-4" /> Delete</button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-iron-400">{Math.round(totalSets)} planned weekly hard-set equivalents - {program.changeLog?.[0]?.detail || "No changes recorded."}</p>
              </div>
            );
          })}
          {openProgram && (
            <div className="mt-4 rounded-lg border border-volt/30 bg-volt/10 p-3">
              <p className="font-black">{openProgram.name} read-only preview</p>
              <WeeklyOverview db={db} user={user} program={openProgram} updateDb={updateDb} />
            </div>
          )}
        </div>
      ) : (
        <EmptyState title="No previous blocks yet" detail="Generate a new active block and older blocks will appear here." />
      )}
    </Panel>
  );
}

function ProgramGapPanel({
  db,
  user,
  program,
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program?: Program;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const gaps = analyzeProgramGaps(program, db);
  const criticalGaps = gaps.filter((gap) => gap.severity === "high");
  const secondaryGaps = gaps.filter((gap) => gap.severity !== "high");
  const visibleGaps = showAll ? gaps : criticalGaps;

  function applyGap(gap: ProgramGap) {
    if (!program || !gap.action?.exerciseId || !gap.action.dayId) return;
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((item) => item.id === program.id);
      const targetDay = targetProgram?.blocks.flatMap((block) => block.weeks).flatMap((week) => week.workouts).find((day) => day.id === gap.action?.dayId);
      const exercise = draft.exercises.find((item) => item.id === gap.action?.exerciseId);
      if (targetProgram && targetDay && exercise) {
        targetDay.exercises.push(buildPlannedExerciseFromExercise({ db: draft, user, program: targetProgram, day: targetDay, exercise, order: targetDay.exercises.length + 1 }));
        targetProgram.updatedAt = nowIso();
        targetProgram.changeLog ||= [];
        targetProgram.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Applied program gap fix", detail: `${gap.issue}: added ${exercise.name} to ${targetDay.name}.` });
        draft.programGaps = analyzeProgramGaps(targetProgram, draft);
      }
      return draft;
    });
  }

  return (
    <section className="border-t border-white/[0.06] pt-3">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-sm font-semibold text-white">Program Gap Analysis</span>
        <ChevronRight className={`h-4 w-4 text-iron-500 transition ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Needs attention</p>
            {visibleGaps.length > 0 ? (
              <div className="mt-2 divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {visibleGaps.map((gap) => {
                  const exercise = gap.action?.exerciseId ? db.exercises.find((item) => item.id === gap.action?.exerciseId) : undefined;
                  return (
                    <div key={gap.id} className="py-2.5">
                      <p className="text-sm text-orange-200">{gap.issue}</p>
                      <p className="mt-1 text-xs text-iron-500">{gap.type}</p>
                      {exercise && gap.action?.kind === "add-exercise" && (
                        <button className="mt-2 border border-[#0a84ff]/40 bg-[#0a84ff]/10 px-2.5 py-1 text-xs text-[#8fb9ff]" onClick={() => applyGap(gap)}>
                          Add {exercise.name}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-iron-400">None.</p>
            )}
          </div>

          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Covered</p>
            <p className="mt-2 text-sm text-iron-400">
              {gaps.length === 0 ? "Current plan passes volume, balance, frequency, and fatigue checks." : "Use this checklist to clear remaining items."}
            </p>
          </div>

          {secondaryGaps.length > 0 && (
            <button
              className="flex w-full items-center justify-between border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs text-iron-300 transition hover:bg-white/[0.06]"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Hide secondary warnings" : `Show ${secondaryGaps.length} secondary warning${secondaryGaps.length > 1 ? "s" : ""}`}
              <ChevronRight className={`h-3.5 w-3.5 text-iron-500 transition ${showAll ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TemplateEditor({
  db,
  user,
  templates,
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  templates: WorkoutTemplate[];
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const template = templates.find((item) => item.id === templateId);
  const day = template?.days[0];
  const [draggedId, setDraggedId] = useState<string | undefined>();

  function reorder(targetId: string) {
    if (!draggedId || draggedId === targetId || !template || !day) return;
    void updateDb((draft) => {
      const targetTemplate = draft.workoutTemplates.find((item) => item.id === template.id);
      const targetDay = targetTemplate?.days[0];
      if (!targetDay) return draft;
      const from = targetDay.exercises.findIndex((item) => item.id === draggedId);
      const to = targetDay.exercises.findIndex((item) => item.id === targetId);
      const [moved] = targetDay.exercises.splice(from, 1);
      targetDay.exercises.splice(to, 0, moved);
      targetDay.exercises.forEach((item, index) => {
        item.order = index + 1;
        item.userEditedOrder = true;
      });
      targetTemplate.updatedAt = nowIso();
      return draft;
    });
  }

  function addExercise(exerciseId: string) {
    if (!template || !day) return;
    const exercise = db.exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    const planned = buildPlannedExerciseFromExercise({ db, user, exercise, order: day.exercises.length + 1 });
    void updateDb((draft) => {
      const targetTemplate = draft.workoutTemplates.find((item) => item.id === template.id);
      targetTemplate?.days[0].exercises.push(planned);
      if (targetTemplate) targetTemplate.updatedAt = nowIso();
      return draft;
    });
  }

  if (!template || !day) return <EmptyState title="No templates yet" detail="Generate a program or seed/reset the app to create templates." />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-iron-300">Workout Template Builder: Create a reusable single-session workout template that can be inserted into a block.</p>
      <select className="field" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
        {templates.map((item) => <option key={item.id} value={item.id}>{item.name.includes("Base") || item.name.includes("Starter") ? `Default: ${item.name}` : item.name}</option>)}
      </select>
      <ExercisePicker db={db} user={user} updateDb={updateDb} onPick={(exercise) => addExercise(exercise.id)} />
      <div className="space-y-2">
        {day.exercises.map((planned) => {
          const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
          return (
            <div
              key={planned.id}
              draggable
              onDragStart={() => setDraggedId(planned.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => reorder(planned.id)}
              className="rounded-lg border border-white/10 bg-white/[0.06] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black">{planned.order}. {exercise?.name}</p>
                  <p className="text-xs text-iron-400">{planned.plannedSets.length} sets - {planned.plannedSets[0]?.targetReps} reps - RPE {planned.plannedSets[0]?.targetRpe}</p>
                </div>
                <button
                  className="btn-ghost text-orange-100"
                  onClick={() =>
                    updateDb((draft) => {
                      const targetTemplate = draft.workoutTemplates.find((item) => item.id === template.id);
                      const targetDay = targetTemplate?.days[0];
                      if (targetDay) targetDay.exercises = targetDay.exercises.filter((item) => item.id !== planned.id);
                      return draft;
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

TemplateEditor.displayName = "DeferredWorkoutTemplateEditor";

function LibraryScreen({
  db,
  user,
  updateDb,
  authMode,
  cloudStatus,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  authMode: "unknown" | "local" | "cloud";
  cloudStatus: "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed";
}) {
  const [section, setSection] = useState<"exercises" | "splits">("exercises");
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const patternFilter = "all";
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [gymSpecificFilter, setGymSpecificFilter] = useState<string>("all");
  const [progressExerciseId, setProgressExerciseId] = useState<string | undefined>();
  const [editingExerciseId, setEditingExerciseId] = useState<string | undefined>();
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [showAdvancedExercise, setShowAdvancedExercise] = useState(false);
  const [musclePickerRole, setMusclePickerRole] = useState<"primaryMuscles" | "secondaryMuscles" | undefined>();
  const [parentSearch, setParentSearch] = useState("");
  const [showVariations, setShowVariations] = useState(false);
  const [expandedVariantParentIds, setExpandedVariantParentIds] = useState<Set<string>>(new Set());
  const emptyDraft = {
    name: "",
    notes: "",
    primaryMuscles: ["chest"] as MuscleGroup[],
    secondaryMuscles: [] as MuscleGroup[],
    movementPatterns: ["horizontal-press"] as MovementPattern[],
    equipment: "dumbbell" as EquipmentCategory,
    exerciseCategory: "isolation" as ExerciseCategoryLabel,
    defaultUnit: user.unit as ExerciseUnit,
    allowedUnits: [user.unit] as ExerciseUnit[],
    defaultIncrement: user.unit === "kg" ? 2.5 : 5,
    customIncrement: user.unit === "kg" ? 2.5 : 5,
    loadingProfileId: "",
    fatigueRating: 2,
    isCompound: false,
    canBeGymSpecific: false,
    isGymSpecificEnabled: false,
    tags: "",
    isVariation: false,
    parentExerciseId: "",
    variationType: "",
  };
  const [draft, setDraft] = useState(emptyDraft);
  const selectedExercise = editingExerciseId ? db.exercises.find((exercise) => exercise.id === editingExerciseId) : undefined;
  const inspectorTitle = editingExerciseId ? "Exercise Inspector" : "Add Exercise";
  const isMobileInspectorOpen = Boolean(editingExerciseId || isCreatingExercise);
  const filterMuscleOptions = [
    { id: "all", label: "All muscles" },
    ...LIBRARY_MUSCLE_GROUPS.map((group) => ({ id: group.id, label: group.label })),
  ];

  function buildDraftFromExercise(exercise: Exercise) {
    return {
      name: exercise.name,
      notes: exercise.notes || exercise.description || "",
      primaryMuscles: exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
      movementPatterns: exercise.movementPatterns || (exercise.movementPattern ? [exercise.movementPattern] : ["isolation"]),
      equipment: exercise.equipment[0] || "dumbbell",
      exerciseCategory: exercise.exerciseCategory || (isCompound(exercise) ? "secondary_compound" : "isolation"),
      defaultUnit: exercise.defaultUnit || user.unit,
      allowedUnits: exercise.allowedUnits || [user.unit],
      defaultIncrement: exercise.defaultIncrement || (user.unit === "kg" ? 2.5 : 5),
      customIncrement: exercise.customIncrement || (user.unit === "kg" ? 2.5 : 5),
      loadingProfileId: exercise.loadingProfileId ?? "",
      fatigueRating: exercise.fatigueRating || 2,
      isCompound: exercise.isCompound || false,
      canBeGymSpecific: exercise.canBeGymSpecific || false,
      isGymSpecificEnabled: exercise.isGymSpecificEnabled || false,
      tags: exercise.tagLabels?.join(", ") || "",
      isVariation: exercise.isVariation || false,
      parentExerciseId: exercise.parentExerciseId || "",
      variationType: exercise.variationType || exercise.variationName || "",
    };
  }

  function closeInspector() {
    setEditingExerciseId(undefined);
    setIsCreatingExercise(false);
    setDraft(emptyDraft);
    setShowAdvancedExercise(false);
    setParentSearch("");
    setMusclePickerRole(undefined);
  }

  function startAddExercise() {
    setEditingExerciseId(undefined);
    setIsCreatingExercise(true);
    setDraft(emptyDraft);
    setShowAdvancedExercise(false);
    setParentSearch("");
    setMusclePickerRole(undefined);
  }

  function startEditExercise(exercise: Exercise) {
    setEditingExerciseId(exercise.id);
    setIsCreatingExercise(false);
    setDraft(buildDraftFromExercise(exercise));
    setShowAdvancedExercise(false);
    setParentSearch("");
    setMusclePickerRole(undefined);
  }

  function startAddVariation(parent: Exercise) {
    setEditingExerciseId(undefined);
    setIsCreatingExercise(true);
    setDraft({
      name: `${parent.name} (Variation)`,
      notes: "",
      primaryMuscles: parent.primaryMuscles,
      secondaryMuscles: parent.secondaryMuscles,
      movementPatterns: parent.movementPatterns || (parent.movementPattern ? [parent.movementPattern] : ["isolation"]),
      equipment: parent.equipment[0] || "dumbbell",
      exerciseCategory: parent.exerciseCategory || (isCompound(parent) ? "secondary_compound" : "isolation"),
      defaultUnit: parent.defaultUnit || user.unit,
      allowedUnits: parent.allowedUnits || [user.unit],
      defaultIncrement: parent.defaultIncrement || (user.unit === "kg" ? 2.5 : 5),
      customIncrement: parent.customIncrement || (user.unit === "kg" ? 2.5 : 5),
      loadingProfileId: parent.loadingProfileId ?? "",
      fatigueRating: parent.fatigueRating || 2,
      isCompound: parent.isCompound || false,
      canBeGymSpecific: parent.canBeGymSpecific || false,
      isGymSpecificEnabled: parent.isGymSpecificEnabled || false,
      tags: parent.tagLabels?.join(", ") || "",
      isVariation: true,
      parentExerciseId: parent.id,
      variationType: "",
    });
    setShowAdvancedExercise(false);
    setParentSearch(parent.name);
    setMusclePickerRole(undefined);
  }

  const exercises = getSharedExerciseLibrarySource(db.exercises, user.id, {
    query,
    sourceFilter: sourceFilter as SharedExerciseLibrarySourceFilter,
    includeVariations: showVariations || Boolean(query.trim()),
  }).filter((exercise) => {
    const groupedMuscles = muscle === "all"
      ? []
      : LIBRARY_MUSCLE_GROUPS.find((group) => group.id === muscle)?.muscles || [muscle as MuscleGroup];
    const matchesMuscle = muscle === "all" || exercise.primaryMuscles.some((item) => groupedMuscles.includes(item));
    const matchesEquipment = equipmentFilter === "all" || exercise.equipment.includes(equipmentFilter as EquipmentCategory);
    const matchesPattern = patternFilter === "all" || exercise.movementPattern === patternFilter || exercise.movementPatterns?.includes(patternFilter as MovementPattern);
    const matchesKind = kindFilter === "all" || (kindFilter === "compound" ? isCompound(exercise) : exercise.kind.includes("isolation") || !isCompound(exercise));
    const matchesGymSpecific = gymSpecificFilter === "all" || (gymSpecificFilter === "enabled" ? exercise.isGymSpecificEnabled : !exercise.isGymSpecificEnabled);
    return matchesMuscle && matchesEquipment && matchesPattern && matchesKind && matchesGymSpecific;
  });
  const progressExercise = db.exercises.find((exercise) => exercise.id === progressExerciseId);
  const parentExerciseOptions = getSharedExerciseLibrarySource(db.exercises, user.id, {
    includeVariations: false,
  })
    .filter((exercise) => !exercise.isVariation && exercise.id !== editingExerciseId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const filteredParentOptions = parentExerciseOptions.filter((exercise) => matchesExerciseSearch(exercise, parentSearch));

  function saveEditExercise() {
    if (!draft.name.trim() || !editingExerciseId) return;
    const primaryMuscle = draft.primaryMuscles[0] || "chest";
    const movementPattern = draft.movementPatterns[0] || "isolation";
    void updateDb((data) => {
      const target = data.exercises.find((e) => e.id === editingExerciseId);
      if (!target) return data;
      target.name = draft.name.trim();
      target.description = draft.notes.trim();
      target.notes = draft.notes.trim();
      target.muscleGroup = primaryMuscle;
      target.primaryMuscles = draft.primaryMuscles;
      target.secondaryMuscles = draft.secondaryMuscles;
      target.equipment = [draft.equipment];
      target.exerciseCategory = draft.exerciseCategory;
      target.movementPattern = movementPattern;
      target.movementPatterns = draft.movementPatterns;
      target.tagLabels = draft.tags.split(",").map((t) => t.trim()).filter(Boolean);
      target.defaultUnit = draft.defaultUnit;
      target.allowedUnits = draft.allowedUnits;
      target.defaultIncrement = draft.defaultIncrement;
      target.customIncrement = draft.customIncrement;
      target.loadingProfileId = draft.loadingProfileId;
      target.fatigueRating = draft.fatigueRating as Exercise["fatigueRating"];
      target.isCompound = draft.isCompound || ["sbd", "main_compound", "secondary_compound", "machine_compound"].includes(draft.exerciseCategory);
      target.kind = target.isCompound ? ["compound"] : draft.exerciseCategory === "conditioning" ? ["conditioning"] : ["accessory"];
      target.canBeGymSpecific = draft.canBeGymSpecific;
      target.isGymSpecificEnabled = draft.isGymSpecificEnabled;
      target.directVolumeMuscles = draft.primaryMuscles;
      target.indirectVolumeMuscles = draft.secondaryMuscles;
      target.isVariation = draft.isVariation;
      target.parentExerciseId = draft.isVariation ? draft.parentExerciseId : undefined;
      target.variationType = draft.isVariation ? draft.variationType : undefined;
      if (!target.ownerUserId) target.userModified = true;
      target.updatedAt = nowIso();
      return data;
    });
    setIsCreatingExercise(false);
  }

  function addCustomExercise() {
    if (!draft.name.trim()) return;
    const primaryMuscle = draft.primaryMuscles[0] || "chest";
    const movementPattern = draft.movementPatterns[0] || "isolation";
    const exercise: Exercise = {
      id: createId("ex"),
      ownerUserId: user.id,
      name: draft.name.trim(),
      description: draft.notes.trim(),
      muscleGroup: primaryMuscle,
      primaryMuscles: draft.primaryMuscles,
      secondaryMuscles: draft.secondaryMuscles,
      equipment: [draft.equipment],
      exerciseCategory: draft.exerciseCategory,
      movementPattern,
      movementPatterns: draft.movementPatterns,
      tags: [user.goal],
      tagLabels: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      variants: [],
      substitutionIds: [],
      notes: draft.notes.trim(),
      setupCues: [],
      trackByBodyweight: draft.equipment === "bodyweight",
      trackPerSide: draft.equipment === "dumbbell" || draft.equipment === "cable",
      category: draft.equipment,
      kind: draft.isCompound || ["sbd", "main_compound", "secondary_compound", "machine_compound"].includes(draft.exerciseCategory) ? ["compound"] : draft.exerciseCategory === "conditioning" ? ["conditioning"] : ["accessory"],
      directVolumeMuscles: draft.primaryMuscles,
      indirectVolumeMuscles: draft.secondaryMuscles,
      bestTrackedBy: draft.defaultUnit === "time" ? ["time"] : draft.defaultUnit === "distance" ? ["distance"] : draft.defaultUnit === "reps-only" ? ["reps"] : ["load", "reps"],
      fatigueRating: draft.fatigueRating as Exercise["fatigueRating"],
      isCompound: draft.isCompound,
      defaultUnit: draft.defaultUnit,
      allowedUnits: draft.allowedUnits,
      defaultIncrement: draft.defaultIncrement,
      customIncrement: draft.customIncrement,
      loadingProfileId: draft.loadingProfileId || undefined,
      canBeGymSpecific: draft.canBeGymSpecific,
      isGymSpecificEnabled: draft.isGymSpecificEnabled,
      createdByUser: true,
      source: "custom" as const,
      isVariation: draft.isVariation || undefined,
      parentExerciseId: draft.isVariation && draft.parentExerciseId ? draft.parentExerciseId : undefined,
      variationType: draft.isVariation && draft.variationType ? draft.variationType : undefined,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    void updateDb((data) => {
      data.exercises.unshift(exercise);
      return data;
    });
    setEditingExerciseId(exercise.id);
    setIsCreatingExercise(false);
    setDraft(buildDraftFromExercise(exercise));
    setShowAdvancedExercise(false);
    setMusclePickerRole(undefined);
  }

  function deleteExercise(exercise: Exercise) {
    if (exercise.ownerUserId) {
      const children = db.exercises.filter((e) => e.parentExerciseId === exercise.id);
      if (children.length > 0) {
        alert(`"${exercise.name}" has ${children.length} variation${children.length > 1 ? "s" : ""}. Delete or reassign them before deleting this exercise.`);
        return;
      }
      if (!confirm(`Delete "${exercise.name}"? This cannot be undone.`)) return;
      void updateDb((data) => {
        data.exercises = data.exercises.filter((e) => e.id !== exercise.id);
        return data;
      });
      if (editingExerciseId === exercise.id) closeInspector();
    } else {
      if (!confirm(`Hide "${exercise.name}" from the library? It will no longer appear in searches. You can reset defaults to restore it.`)) return;
      void updateDb((data) => {
        const target = data.exercises.find((e) => e.id === exercise.id);
        if (target) { target.isArchived = true; target.updatedAt = nowIso(); }
        return data;
      });
      if (editingExerciseId === exercise.id) closeInspector();
    }
  }

  function resetExerciseToDefault(exercise: Exercise) {
    const seed = builtInExercises.find((b) => b.id === exercise.id);
    if (!seed) return;
    void updateDb((data) => {
      const target = data.exercises.find((e) => e.id === exercise.id);
      if (!target) return data;
      Object.assign(target, structuredClone(seed));
      target.userModified = false;
      target.isArchived = false;
      target.source = "default";
      target.updatedAt = nowIso();
      return data;
    });
    closeInspector();
  }

  function duplicateExercise(exercise: Exercise) {
    const copy: Exercise = {
      ...structuredClone(exercise),
      id: createId("ex"),
      ownerUserId: user.id,
      name: `${exercise.name} (Copy)`,
      source: "custom" as const,
      copiedFromId: exercise.id,
      createdByUser: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    void updateDb((data) => {
      data.exercises.unshift(copy);
      return data;
    });
    startEditExercise(copy);
  }

  function toggleDraftMuscle(key: "primaryMuscles" | "secondaryMuscles", value: MuscleGroup) {
    setDraft((item) => ({
      ...item,
      [key]: item[key].includes(value) ? item[key].filter((muscleItem) => muscleItem !== value) : [...item[key], value]
    }));
  }

  function toggleDraftPattern(value: MovementPattern) {
    setDraft((item) => ({
      ...item,
      movementPatterns: item.movementPatterns.includes(value) ? item.movementPatterns.filter((pattern) => pattern !== value) : [...item.movementPatterns, value]
    }));
  }

  function toggleDraftUnit(value: ExerciseUnit) {
    setDraft((item) => ({
      ...item,
      allowedUnits: item.allowedUnits.includes(value) ? item.allowedUnits.filter((unit) => unit !== value) : [...item.allowedUnits, value],
      defaultUnit: item.allowedUnits.includes(value) && item.defaultUnit === value ? "lb" : item.defaultUnit
    }));
  }

  const effectiveLoadingUnit = isWeightUnit(draft.defaultUnit) ? draft.defaultUnit : user.unit;
  const effectiveLoading = getEffectiveLoading(
    { category: draft.equipment, loadingProfileId: draft.loadingProfileId || undefined, defaultIncrement: draft.defaultIncrement, customIncrement: draft.customIncrement, trackPerSide: false },
    db.loadingProfiles,
    effectiveLoadingUnit as UnitPreference
  );
  const hasEquipmentDefaultProfile = Boolean(EQUIPMENT_DEFAULT_PROFILE_IDS[draft.equipment]);
  const usesCustomIncrement = draft.loadingProfileId === CUSTOM_INCREMENT_LOADING_PROFILE_ID || (!draft.loadingProfileId && !hasEquipmentDefaultProfile);
  const profileOptions = ["", CUSTOM_INCREMENT_LOADING_PROFILE_ID, ...(db.loadingProfiles ?? []).map((profile) => profile.id)];
  const profileLabels: Record<string, string> = {
    "": "Auto / Default",
    [CUSTOM_INCREMENT_LOADING_PROFILE_ID]: "Custom increment",
  };
  (db.loadingProfiles ?? []).forEach((profile) => {
    profileLabels[profile.id] = profile.name;
  });
  const loadingHelperText = usesCustomIncrement
    ? `Custom increment · ${effectiveLoading.increment} ${effectiveLoading.unit} jumps`
    : `${effectiveLoading.source === "exercise_profile" ? effectiveLoading.loadingProfileName : `Auto: ${formatEquipmentLabel(draft.equipment)}`} · ${effectiveLoading.increment} ${effectiveLoading.unit} jumps`;
  const loadingControlLabel = draft.equipment === "machine" || draft.equipment === "cable"
    ? "Machine stack / increment"
    : "Loading profile";
  const isDefaultExercise = Boolean(selectedExercise && !selectedExercise.ownerUserId);
  const variationCount = selectedExercise ? db.exercises.filter((exercise) => exercise.parentExerciseId === selectedExercise.id && !exercise.isArchived && (!exercise.ownerUserId || exercise.ownerUserId === user.id)).length : 0;
  const selectedParent = draft.parentExerciseId ? db.exercises.find((exercise) => exercise.id === draft.parentExerciseId) : undefined;

  const inspectorBody = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.08] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-iron-500">
              {editingExerciseId ? "Exercise Inspector" : "Add Exercise"}
            </p>
            <h2 className="truncate text-lg font-semibold text-white">{draft.name.trim() || inspectorTitle}</h2>
            {selectedExercise ? (
              <p className="mt-1 text-xs text-iron-500">
                {summarizeExerciseListMuscles(selectedExercise)} · {selectedExercise.equipment[0]} · {inferCompactExerciseType(selectedExercise)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-iron-500">Create a library exercise with compact primary and secondary muscle summaries.</p>
            )}
          </div>
          <button className="xl:hidden btn-ghost" onClick={closeInspector} aria-label="Close inspector">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isDefaultExercise ? (
          <p className={`mt-3 rounded-sm border px-3 py-2 text-xs ${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`}>
            Editing default exercise. {editSaveContext(authMode, cloudStatus)} Reset to restore app defaults.
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <TextField label="Name" value={draft.name} onChange={(name) => setDraft((value) => ({ ...value, name }))} />

          <div className="grid gap-3 md:grid-cols-2">
            <SelectField label="Equipment" value={draft.equipment} options={equipmentOptions} onChange={(value) => setDraft((item) => ({ ...item, equipment: value as EquipmentCategory }))} />
            <SelectField
              label="Category"
              value={draft.exerciseCategory}
              options={exerciseCategoryOptions}
              onChange={(value) => setDraft((item) => ({
                ...item,
                exerciseCategory: value as ExerciseCategoryLabel,
                isCompound: ["sbd", "main_compound", "secondary_compound", "machine_compound"].includes(value) || item.isCompound,
              }))}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {!usesCustomIncrement && (effectiveLoading.source === "exercise_profile" || effectiveLoading.source === "equipment_default") ? (
              <div className="md:col-span-2">
                <div className="rounded-sm border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Default unit</p>
                  <p className="mt-1 text-sm text-iron-200">Controlled by {effectiveLoading.loadingProfileName}</p>
                </div>
              </div>
            ) : (
              <SelectField
                label="Default unit"
                value={draft.defaultUnit}
                options={exerciseUnitOptions}
                onChange={(defaultUnit) => setDraft((item) => ({
                  ...item,
                  defaultUnit: defaultUnit as ExerciseUnit,
                  allowedUnits: Array.from(new Set([...item.allowedUnits, defaultUnit as ExerciseUnit])),
                }))}
              />
            )}
            <div className={!usesCustomIncrement && (effectiveLoading.source === "exercise_profile" || effectiveLoading.source === "equipment_default") ? "md:col-span-2" : ""}>
              <SelectField label={loadingControlLabel} value={draft.loadingProfileId} options={profileOptions} labels={profileLabels} onChange={(value) => setDraft((item) => ({ ...item, loadingProfileId: value }))} />
              <p className="mt-1 text-xs text-iron-500">{loadingHelperText}</p>
            </div>
          </div>

          {usesCustomIncrement ? (
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label={`${draft.equipment === "machine" || draft.equipment === "cable" ? "Machine stack / custom increment" : "Custom increment"} (${effectiveLoading.unit})`}
                value={draft.customIncrement}
                step={effectiveLoading.unit === "kg" ? 0.5 : 1}
                min={0.5}
                onChange={(customIncrement) => setDraft((item) => ({ ...item, customIncrement, defaultIncrement: customIncrement }))}
              />
              <div className="rounded-sm border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Resolved loading</p>
                <p className="mt-1 text-sm text-iron-200">{effectiveLoading.increment} {effectiveLoading.unit} jumps</p>
                <p className="mt-1 text-xs text-iron-500">Only one editable increment path is shown here to avoid conflicting machine-stack inputs.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Resolved increment</p>
              <p className="mt-1 text-sm text-iron-200">{effectiveLoading.increment} {effectiveLoading.unit} jumps</p>
              <p className="mt-1 text-xs text-iron-500">Auto/default keeps the stack increment read-only here. Switch to Custom increment only if this machine or cable uses a different jump size.</p>
            </div>
          )}

          <div className="border-y border-white/[0.08] py-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Muscles</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Primary</p>
                  <p className="mt-1 text-sm text-iron-300">{summarizeMuscleList(draft.primaryMuscles)}</p>
                </div>
                <button className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`} onClick={() => setMusclePickerRole("primaryMuscles")}>
                  Edit
                </button>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Secondary</p>
                  <p className="mt-1 text-sm text-iron-300">{summarizeMuscleList(draft.secondaryMuscles)}</p>
                </div>
                <button className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`} onClick={() => setMusclePickerRole("secondaryMuscles")}>
                  Edit
                </button>
              </div>
            </div>
          </div>

          <TextField label="Notes / cues" value={draft.notes} onChange={(notes) => setDraft((value) => ({ ...value, notes }))} />

          <div className="border-b border-white/[0.08] pb-4">
            <button
              className="flex w-full items-center justify-between gap-3 border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition hover:bg-white/[0.05]"
              onClick={() => setShowAdvancedExercise((value) => !value)}
            >
              <div>
                <p className="text-sm font-semibold text-white">Advanced</p>
                <p className="mt-1 text-xs text-iron-500">Variations, patterns, units, and hidden/default behavior.</p>
              </div>
              <ChevronRight className={`h-4 w-4 text-iron-500 transition ${showAdvancedExercise ? "rotate-90" : ""}`} />
            </button>

            {showAdvancedExercise ? (
              <div className="mt-3 space-y-4 border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="space-y-3 border-b border-white/[0.08] pb-4">
                  <button
                    className="flex w-full items-center justify-between gap-3 border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.05]"
                    onClick={() => setDraft((value) => ({ ...value, isVariation: !value.isVariation }))}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">Variations</p>
                      <p className="mt-1 text-xs text-iron-500">
                        {draft.isVariation ? "This exercise is linked to a parent movement." : "Keep this off for standard standalone exercises."}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${draft.isVariation ? LIBRARY_BLUE_TEXT : "text-iron-500"}`}>{draft.isVariation ? "On" : "Off"}</span>
                  </button>

                  {draft.isVariation ? (
                    <div className="space-y-3">
                      {selectedParent ? (
                        <div className={`flex items-center gap-2 rounded-sm border px-3 py-2 ${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL}`}>
                          <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${LIBRARY_BLUE_TEXT}`}>{selectedParent.name}</span>
                          <button className="text-iron-300 transition hover:text-white" onClick={() => { setDraft((value) => ({ ...value, parentExerciseId: "" })); setParentSearch(""); }}>
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <TextField label="Parent exercise" value={parentSearch} onChange={setParentSearch} />
                          {parentSearch.trim() ? (
                            <div className="mt-2 max-h-44 overflow-y-auto border border-white/[0.08] bg-iron-950/80">
                              {filteredParentOptions.length ? filteredParentOptions.map((exercise) => (
                                <button
                                  key={exercise.id}
                                  className="flex w-full items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2 text-left text-sm text-iron-200 transition last:border-b-0 hover:bg-white/[0.05]"
                                  onClick={() => { setDraft((value) => ({ ...value, parentExerciseId: exercise.id })); setParentSearch(exercise.name); }}
                                >
                                  <span className="truncate">{exercise.name}</span>
                                  <ChevronRight className="h-4 w-4 text-iron-600" />
                                </button>
                              )) : <p className="px-3 py-2 text-xs text-iron-500">No exercises found.</p>}
                            </div>
                          ) : null}
                        </div>
                      )}
                      <TextField label="Variation type" value={draft.variationType} onChange={(variationType) => setDraft((value) => ({ ...value, variationType }))} />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField label="Fatigue rating" value={draft.fatigueRating} onChange={(fatigueRating) => setDraft((item) => ({ ...item, fatigueRating: Math.min(5, Math.max(1, fatigueRating)) }))} />
                  <div>
                    <p className="label mb-2">Flags</p>
                    <div className="space-y-2 rounded-sm border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-iron-200">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isCompound} onChange={(event) => setDraft((item) => ({ ...item, isCompound: event.target.checked }))} /> Compound movement</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={draft.canBeGymSpecific} onChange={(event) => setDraft((item) => ({ ...item, canBeGymSpecific: event.target.checked }))} /> Can vary by gym</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isGymSpecificEnabled} onChange={(event) => setDraft((item) => ({ ...item, isGymSpecificEnabled: event.target.checked, canBeGymSpecific: item.canBeGymSpecific || event.target.checked }))} /> Enable gym-specific behavior</label>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="label mb-2">Movement patterns</p>
                  <div className="flex flex-wrap gap-2">
                    {movementOptions.map((item) => (
                      <button
                        key={item}
                        className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                          draft.movementPatterns.includes(item)
                            ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`
                            : "border-white/[0.1] bg-white/[0.04] text-iron-300 hover:bg-white/[0.08]"
                        }`}
                        onClick={() => toggleDraftPattern(item)}
                      >
                        {titleCaseLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="label mb-2">Allowed units</p>
                  <div className="flex flex-wrap gap-2">
                    {exerciseUnitOptions.map((item) => (
                      <button
                        key={item}
                        className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                          draft.allowedUnits.includes(item)
                            ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`
                            : "border-white/[0.1] bg-white/[0.04] text-iron-300 hover:bg-white/[0.08]"
                        }`}
                        onClick={() => toggleDraftUnit(item)}
                      >
                        {titleCaseLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>

                <TextField label="Tags (comma-separated)" value={draft.tags} onChange={(tags) => setDraft((value) => ({ ...value, tags }))} />
              </div>
            ) : null}
          </div>

          {selectedExercise ? (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Actions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => setProgressExerciseId(selectedExercise.id)}><BarChart3 className="h-4 w-4" /> Progress</button>
                <button className="btn-secondary" onClick={() => duplicateExercise(selectedExercise)}><Copy className="h-4 w-4" /> Duplicate</button>
                <button className="btn-secondary" onClick={() => startAddVariation(selectedExercise)}><GitBranch className="h-4 w-4" /> Add Variation</button>
                {!selectedExercise.ownerUserId && selectedExercise.userModified && builtInExercises.some((exercise) => exercise.id === selectedExercise.id) ? (
                  <button className={`btn-secondary ${LIBRARY_BLUE_TEXT}`} onClick={() => resetExerciseToDefault(selectedExercise)}><RotateCcw className="h-4 w-4" /> Reset</button>
                ) : null}
                <button className="btn-secondary border-ember/40 text-orange-100" onClick={() => deleteExercise(selectedExercise)}>
                  {selectedExercise.ownerUserId ? <Trash2 className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {selectedExercise.ownerUserId ? "Delete" : "Hide"}
                </button>
              </div>
              {variationCount > 0 ? <p className="mt-2 text-xs text-iron-500">{variationCount} variation{variationCount === 1 ? "" : "s"} linked to this exercise.</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-white/[0.08] bg-iron-950/95 px-4 pt-3 safe-bottom backdrop-blur">
        {editingExerciseId ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="tap-highlight inline-flex min-h-10 items-center justify-center gap-2 rounded-sm bg-[#0a84ff] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.97]" onClick={saveEditExercise}>
              <Save className="h-4 w-4" />
              Save changes
            </button>
            <button className="btn-secondary" onClick={closeInspector}>Cancel</button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="tap-highlight inline-flex min-h-10 items-center justify-center gap-2 rounded-sm bg-[#0a84ff] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.97]" onClick={addCustomExercise}>
              <Plus className="h-4 w-4" />
              Add Exercise
            </button>
            <button className="btn-secondary" onClick={closeInspector}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Library" title="Exercises &amp; Splits" />
      <section className="panel p-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            ["exercises", "Exercises"],
            ["splits", "Splits"]
          ].map(([id, label]) => (
            <button key={id} className={`btn-secondary ${section === id ? "border-volt/60 text-volt" : ""}`} onClick={() => setSection(id as typeof section)}>{label}</button>
          ))}
        </div>
      </section>
      {section === "splits" && <SplitLibraryManager db={db} user={user} updateDb={updateDb} authMode={authMode} cloudStatus={cloudStatus} />}
      {section === "exercises" && (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="border border-white/[0.08] bg-white/[0.02]">
              <div className="border-b border-white/[0.08] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-iron-500">Exercise Library</p>
                    <h2 className="text-lg font-semibold text-white">Exercises</h2>
                  </div>
                  <button className="tap-highlight inline-flex shrink-0 min-h-10 items-center justify-center gap-2 rounded-sm bg-[#0a84ff] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.97]" onClick={startAddExercise}>
                    <Plus className="h-4 w-4" />
                    Add Exercise
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {([["all", "All"], ["default", "Default"], ["custom", "Custom"], ["archived", "Hidden"]] as const).map(([id, label]) => (
                    <button
                      key={id}
                      className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                        sourceFilter === id
                          ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`
                          : "border-white/[0.08] bg-white/[0.03] text-iron-300 hover:bg-white/[0.06]"
                      }`}
                      onClick={() => setSourceFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                      showVariations
                        ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`
                        : "border-white/[0.08] bg-white/[0.03] text-iron-300 hover:bg-white/[0.06]"
                    }`}
                    onClick={() => setShowVariations((value) => !value)}
                  >
                    Variations {showVariations ? "On" : "Off"}
                  </button>
                </div>

                <div className="mt-4">
                  <input className="field" placeholder="Search name, muscle, or equipment..." value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <select className="field" value={muscle} onChange={(event) => setMuscle(event.target.value)}>
                    {filterMuscleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <select className="field" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)}>
                    <option value="all">All equipment</option>
                    {equipmentOptions.map((item) => <option key={item} value={item}>{formatEquipmentLabel(item)}</option>)}
                  </select>
                  <select className="field" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                    <option value="all">Any type</option>
                    <option value="compound">Compound</option>
                    <option value="isolation">Accessory / isolation</option>
                  </select>
                  <select className="field" value={gymSpecificFilter} onChange={(event) => setGymSpecificFilter(event.target.value)}>
                    <option value="all">Gym: any</option>
                    <option value="enabled">Gym-specific</option>
                    <option value="disabled">Standard</option>
                  </select>
                </div>
              </div>

              <div className="px-4 py-3 text-xs text-iron-500">{exercises.length} exercise{exercises.length === 1 ? "" : "s"}</div>

              <div className="max-h-[42rem] overflow-y-auto border-t border-white/[0.08] pb-safe"
                style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}>
                {exercises.length ? exercises.map((exercise) => {
                  const childVariations = !query && !showVariations
                    ? db.exercises.filter((item) => item.parentExerciseId === exercise.id && !item.isArchived && (!item.ownerUserId || item.ownerUserId === user.id))
                    : [];
                  const isExpanded = expandedVariantParentIds.has(exercise.id);
                  const isSelected = editingExerciseId === exercise.id;
                  const parentName = exercise.isVariation && exercise.parentExerciseId
                    ? db.exercises.find((item) => item.id === exercise.parentExerciseId)?.name
                    : undefined;
                  return (
                    <div key={exercise.id} className="border-b border-white/[0.06] last:border-b-0">
                      <button
                        className={`group relative flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] ${isSelected ? "bg-[#0a84ff]/[0.08]" : ""}`}
                        onClick={() => startEditExercise(exercise)}
                      >
                        <span className={`absolute inset-y-2 left-0 w-[2px] ${isSelected ? "bg-[#0a84ff]" : "bg-transparent group-hover:bg-[#0a84ff]/45"}`} />
                        <div className="min-w-0 flex-1 pl-2">
                          <p className="truncate text-sm font-semibold text-white">{exercise.name}</p>
                          <p className="mt-1 truncate text-xs text-iron-400">
                            {summarizeExerciseListMuscles(exercise)}
                            {exercise.equipment[0] ? ` · ${exercise.equipment[0]}` : ""}
                            {exercise.isVariation ? "" : ` · ${inferCompactExerciseType(exercise)}`}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] text-iron-500">
                            {parentName ? <span>variation of {parentName}</span> : null}
                            {childVariations.length > 0 ? <span>{childVariations.length} variation{childVariations.length === 1 ? "" : "s"}</span> : null}
                            {exercise.ownerUserId ? <span>custom</span> : null}
                            {exercise.userModified ? <span>edited</span> : null}
                            {exercise.isArchived ? <span>hidden</span> : null}
                          </div>
                        </div>
                        <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-iron-600" />
                      </button>

                      {childVariations.length > 0 ? (
                        <div className="pb-2 pl-6 pr-4">
                          <button
                            className="flex items-center gap-1 px-2 py-1 text-[0.68rem] font-semibold text-iron-400 transition hover:text-iron-200"
                            onClick={() => setExpandedVariantParentIds((current) => {
                              const next = new Set(current);
                              if (next.has(exercise.id)) next.delete(exercise.id);
                              else next.add(exercise.id);
                              return next;
                            })}
                          >
                            <ChevronDown className={`h-3 w-3 transition ${isExpanded ? "rotate-180" : ""}`} />
                            {isExpanded ? "Hide variations" : "Show variations"}
                          </button>
                          {isExpanded ? (
                            <div className="mt-1 border-l border-white/[0.08]">
                              {childVariations.map((child) => (
                                <button
                                  key={child.id}
                                  className={`group relative flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] ${editingExerciseId === child.id ? "bg-[#0a84ff]/[0.06]" : ""}`}
                                  onClick={() => startEditExercise(child)}
                                >
                                  <span className={`absolute inset-y-2 left-0 w-[2px] ${editingExerciseId === child.id ? "bg-[#0a84ff]" : "bg-transparent group-hover:bg-[#0a84ff]/35"}`} />
                                  <div className="min-w-0 flex-1 pl-2">
                                    <p className="truncate text-sm font-medium text-iron-200">{child.name}</p>
                                    <p className="mt-1 truncate text-xs text-iron-500">
                                      {child.variationType || summarizeExerciseListMuscles(child)}
                                    </p>
                                  </div>
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-iron-600" />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                }) : <div className="px-4 py-8"><EmptyState title="No exercises match" detail="Clear a filter or add a new exercise." /></div>}
              </div>
            </div>

            <div className="hidden xl:block border border-white/[0.08] bg-white/[0.02]">
              {inspectorBody}
            </div>
          </section>

          {isMobileInspectorOpen ? (
            <div className="fixed inset-0 z-[60] xl:hidden bg-iron-950" style={{ height: "100dvh" }}>
              {inspectorBody}
            </div>
          ) : null}

          <LibraryMusclePicker
            open={Boolean(musclePickerRole)}
            roleLabel={musclePickerRole === "secondaryMuscles" ? "Secondary Muscles" : "Primary Muscles"}
            selected={musclePickerRole ? draft[musclePickerRole] : []}
            onToggle={(muscleValue) => {
              if (!musclePickerRole) return;
              toggleDraftMuscle(musclePickerRole, muscleValue);
            }}
            onClose={() => setMusclePickerRole(undefined)}
          />

          {progressExercise && <ExerciseProgressPanel db={db} user={user} exercise={progressExercise} onClose={() => setProgressExerciseId(undefined)} />}
        </>
      )}
    </div>
  );
}

function collectVariationFamilyIds(exercises: Exercise[], rootExerciseId: string): string[] {
  const seen = new Set<string>();
  const queue = [rootExerciseId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    exercises
      .filter((exercise) => exercise.parentExerciseId === current)
      .forEach((exercise) => {
        if (!seen.has(exercise.id)) queue.push(exercise.id);
      });
  }
  return Array.from(seen);
}

type ExerciseHistoryEntry = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  date: string;
  label: string;
  weight?: number;
  unit?: ExerciseUnit;
  reps?: number;
  rpe?: number;
  e1rm?: number;
  source: string;
  sourceLabel: string;
  setNumber?: number;
};

function getLoggedSetUnit(set: Pick<LoggedSet, "unit">, exercise?: Exercise, user?: UserProfile): ExerciseUnit {
  return set.unit || exercise?.defaultUnit || user?.unit || "lb";
}

function getEntryDisplayValues(entry: ExerciseHistoryEntry, displayUnit: "lb" | "kg") {
  return {
    weight: convertWeight(entry.weight, entry.unit, displayUnit),
    e1rm: convertWeight(entry.e1rm, entry.unit, displayUnit),
  };
}

function collectExerciseHistoryEntries(params: {
  db: TrainingDatabase;
  user: UserProfile;
  exerciseIds: string[];
}): ExerciseHistoryEntry[] {
  const { db, user, exerciseIds } = params;
  const idSet = new Set(exerciseIds);
  const entries: ExerciseHistoryEntry[] = [];

  db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed")
    .forEach((session) => {
      session.loggedExercises
        .filter((logged) => idSet.has(logged.exerciseId))
        .forEach((logged) => {
          const exercise = db.exercises.find((item) => item.id === logged.exerciseId);
          logged.sets
            .filter((set) => isCompletedValidSet(set))
            .forEach((set) => {
              const setUnit = getLoggedSetUnit(set, exercise, user);
              entries.push({
                id: `session:${session.id}:${logged.id}:${set.id}`,
                exerciseId: logged.exerciseId,
                exerciseName: exercise?.name || logged.exerciseId,
                date: set.completedAt || session.completedAt || session.startedAt,
                label: new Date(set.completedAt || session.completedAt || session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                weight: set.actualWeight,
                unit: setUnit,
                reps: set.actualReps,
                rpe: set.actualRpe,
                e1rm: calculateE1RMFromSet(set) || undefined,
                source: session.source || "logged_workout",
                sourceLabel: session.source === "exercise_baseline_import"
                  ? "Imported baseline"
                  : session.source === "csv_import"
                  ? "Imported workout"
                  : "Logged workout",
                setNumber: set.setNumber,
              });
            });
        });
    });

  (db.exercisePerformanceLogs || [])
    .filter((log) => log.userId === user.id && idSet.has(log.exerciseId))
    .forEach((log) => {
      const exercise = db.exercises.find((item) => item.id === log.exerciseId);
      entries.push({
        id: `log:${log.id}`,
        exerciseId: log.exerciseId,
        exerciseName: exercise?.name || log.exerciseId,
        date: `${log.date}T12:00:00.000Z`,
        label: new Date(`${log.date}T12:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        weight: log.weight,
        unit: isWeightUnit(log.unit) ? log.unit : exercise?.defaultUnit || user.unit,
        reps: log.reps,
        rpe: log.rpe,
        e1rm: log.e1rm,
        source: log.source || "exercise_performance_log",
        sourceLabel: log.source === "exercise_baseline_import" ? "Imported baseline" : "Exercise log",
      });
    });

  const deduped = new Map<string, ExerciseHistoryEntry>();
  entries.forEach((entry) => {
    const key = [
      entry.source,
      entry.exerciseId,
      entry.date.slice(0, 10),
      entry.setNumber ?? 1,
      entry.weight ?? "",
      entry.unit ?? "",
      entry.reps ?? "",
      entry.rpe ?? "",
      entry.e1rm ?? "",
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, entry);
  });

  return Array.from(deduped.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function ExerciseProgressPanel({
  db,
  user,
  exercise,
  onClose
}: {
  db: TrainingDatabase;
  user: UserProfile;
  exercise: Exercise;
  onClose: () => void;
}) {
  const [graphMode, setGraphMode] = useState<"overall" | "current-block">("overall");
  const [includeVariations, setIncludeVariations] = useState(false);

  const completedSessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed");
  const parentExercise = exercise.parentExerciseId
    ? db.exercises.find((item) => item.id === exercise.parentExerciseId)
    : undefined;
  const exactExerciseIds = [exercise.id];
  const familyExerciseIds = includeVariations
    ? collectVariationFamilyIds(db.exercises, exercise.isVariation && parentExercise ? parentExercise.id : exercise.id)
    : exactExerciseIds;
  const historyEntries = useMemo(
    () => collectExerciseHistoryEntries({ db, user, exerciseIds: familyExerciseIds }),
    [db, user, familyExerciseIds]
  );
  const displayUnit = getExerciseDisplayUnit(
    includeVariations && exercise.isVariation && parentExercise ? parentExercise : exercise,
    user
  );
  const loggedSetCount = historyEntries.length;
  const structuredLogs = (db.exercisePerformanceLogs || []).filter((log) => log.userId === user.id && familyExerciseIds.includes(log.exerciseId));
  const latestEntry = historyEntries[0];
  const bestE1rm = Math.max(
    0,
    ...historyEntries.map((entry) => convertWeight(entry.e1rm, entry.unit, displayUnit) || 0),
    ...structuredLogs.map((log) => convertWeight(log.e1rm, log.unit, displayUnit) || 0),
  );
  const latestEntryValues = latestEntry ? getEntryDisplayValues(latestEntry, displayUnit) : undefined;
  const latestEntryExercise = latestEntry ? db.exercises.find((item) => item.id === latestEntry.exerciseId) || exercise : exercise;

  const overallPoints = historyEntries
    .filter((entry) => entry.e1rm && entry.e1rm > 0)
    .map((entry) => ({
      label: entry.label,
      value: convertWeight(entry.e1rm, entry.unit, displayUnit) as number,
      date: entry.date
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const activeBlock = db.programs.find((p) => p.userId === user.id && p.status === "active")?.blocks[0];
  const currentBlockPoints = activeBlock
    ? completedSessions
        .filter((s) => s.blockId === activeBlock.id)
        .flatMap((session) => {
          const workoutDay = activeBlock.weeks.flatMap((w) => w.workouts).find((d) => d.id === session.workoutDayId);
          const weekNum = session.weekNumber ?? workoutDay?.weekNumber;
          const dayNum = workoutDay?.dayIndex;
          const label = weekNum && dayNum ? `W${weekNum}D${dayNum}` : weekNum ? `W${weekNum}` : new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return session.loggedExercises
            .filter((logged) => familyExerciseIds.includes(logged.exerciseId))
            .map((logged) => {
              const exerciseForLog = db.exercises.find((item) => item.id === logged.exerciseId);
              const loggedUnit = logged.sets.find((set) => isWeightUnit(set.unit))?.unit
                || exerciseForLog?.defaultUnit
                || user.unit;
              const value = convertWeight(calculateSessionExerciseE1RM(logged), loggedUnit, displayUnit);
              if (!value) return undefined;
              return { label, value, date: session.startedAt };
            });
        })
        .filter((p): p is { label: string; value: number; date: string } => Boolean(p))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const activePoints = graphMode === "current-block" ? currentBlockPoints : overallPoints;
  const hasHistory = historyEntries.length > 0 || structuredLogs.length > 0;
  const isStrengthLift = exercise.category === "barbell" || exercise.kind?.includes("competition-lift") || exercise.kind?.includes("variation");
  const chartTitle = isStrengthLift ? "e1RM trend" : "Estimated progress";
  const hasVariationFamily = collectVariationFamilyIds(db.exercises, exercise.isVariation && parentExercise ? parentExercise.id : exercise.id).length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-iron-950 p-4 shadow-glow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">Exercise Progress</p>
            <h2 className="text-2xl font-black">{exercise.name}</h2>
            <p className="mt-1 text-sm text-iron-300">{exercise.category} · {exercise.movementPattern}</p>
            {parentExercise && <p className="mt-1 text-xs text-iron-400">Variation of {parentExercise.name}</p>}
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {hasHistory ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="History entries" value={loggedSetCount} />
              <Metric label="Best e1RM" value={bestE1rm ? formatWeight(bestE1rm, displayUnit) : "-"} unit={bestE1rm ? displayUnit : undefined} />
            </div>
            {latestEntry && (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <p className="label">Most recent</p>
                <p className="mt-1 text-lg font-black text-white">
                  {formatExerciseLoadText({ exercise: latestEntryExercise, user, weight: latestEntryValues?.weight ?? latestEntry.weight, unit: displayUnit })}
                  {latestEntry.reps ? ` × ${latestEntry.reps}` : ""}
                  {latestEntry.rpe ? ` @ RPE ${latestEntry.rpe}` : ""}
                </p>
                <p className={`mt-1 text-sm ${LIBRARY_BLUE_TEXT}`}>
                  {latestEntryValues?.e1rm ? `e1RM ${formatWeight(latestEntryValues.e1rm, displayUnit)} ${displayUnit}` : "No e1RM available"}
                </p>
                <p className="mt-1 text-xs text-iron-400">
                  {latestEntry.sourceLabel} — {new Date(latestEntry.date).toLocaleDateString()}
                  {latestEntry.exerciseId !== exercise.id ? ` · ${latestEntry.exerciseName}` : ""}
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button className={`rounded-sm border px-3 py-1.5 text-xs font-semibold ${graphMode === "overall" ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}` : "border-white/[0.08] bg-white/[0.03] text-iron-300"}`} onClick={() => setGraphMode("overall")}>Overall</button>
              <button
                className={`rounded-sm border px-3 py-1.5 text-xs font-semibold ${graphMode === "current-block" ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}` : "border-white/[0.08] bg-white/[0.03] text-iron-300"} disabled:opacity-40`}
                onClick={() => setGraphMode("current-block")}
                disabled={!activeBlock}
                title={!activeBlock ? "No active block" : ""}
              >
                Current Block
              </button>
              {hasVariationFamily && (
                <button
                  className={`rounded-sm border px-3 py-1.5 text-xs font-semibold ${includeVariations ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}` : "border-white/[0.08] bg-white/[0.03] text-iron-300"}`}
                  onClick={() => setIncludeVariations((value) => !value)}
                >
                  {includeVariations ? "Family view on" : "Include variations"}
                </button>
              )}
            </div>
            {graphMode === "current-block" && !activeBlock && (
              <p className="mt-2 text-xs text-iron-400">No active block — activate a program to use Current Block mode.</p>
            )}
            {graphMode === "current-block" && activeBlock && currentBlockPoints.length === 0 && (
              <p className="mt-2 text-xs text-iron-400">No sessions logged for this exercise in the current block yet.</p>
            )}
            {activePoints.length > 0 ? <ExerciseE1rmChart points={activePoints} unit={displayUnit} title={chartTitle} /> : null}
            {activePoints.length === 1 && (
              <p className="mt-2 text-xs text-iron-400">One data point available. Add more sessions to show a trend.</p>
            )}
            {activePoints.length === 0 && (
              <p className="mt-2 text-xs text-iron-400">No e1RM trend data yet for this view, but recent history is available below.</p>
            )}
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-black">Recent history</p>
                <p className="text-xs text-iron-400">{includeVariations ? "Family view" : "Exact exercise"}</p>
              </div>
              <div className="space-y-2">
                {historyEntries.slice(0, 8).map((entry) => {
                  const displayValues = getEntryDisplayValues(entry, displayUnit);
                  const entryExercise = db.exercises.find((item) => item.id === entry.exerciseId) || exercise;
                  return (
                  <div key={entry.id} className="rounded-lg bg-iron-950/55 p-2.5">
                    <p className="text-sm font-bold text-white">
                      {formatExerciseLoadText({ exercise: entryExercise, user, weight: displayValues.weight ?? entry.weight, unit: displayUnit })}
                      {entry.reps ? ` × ${entry.reps}` : ""}
                      {entry.rpe ? ` @ RPE ${entry.rpe}` : ""}
                    </p>
                    <p className={`text-xs ${LIBRARY_BLUE_TEXT}`}>{displayValues.e1rm ? `e1RM ${formatWeight(displayValues.e1rm, displayUnit)} ${displayUnit}` : "No e1RM available"}</p>
                    <p className="mt-1 text-[0.72rem] text-iron-400">
                      {entry.sourceLabel} — {new Date(entry.date).toLocaleDateString()}
                      {entry.exerciseId !== exercise.id ? ` · ${entry.exerciseName}` : ""}
                    </p>
                  </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <EmptyState title="No logged or imported data yet" detail="Import baseline history or complete workouts with this exercise to populate analytics." />
          </div>
        )}
      </section>
    </div>
  );
}

function ExerciseE1rmChart({ points, unit, title = "e1RM trend", strokeColor = LIBRARY_BLUE }: { points: { label: string; value: number }[]; unit: "lb" | "kg"; title?: string; strokeColor?: string }) {
  const width = 560;
  const height = 220;
  const padding = 34;
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), max);
  const range = Math.max(1, max - min);
  const coords = points.map((point, index) => ({
    ...point,
    x: padding + (points.length === 1 ? 0.5 : index / (points.length - 1)) * (width - padding * 2),
    y: height - padding - ((point.value - min) / range) * (height - padding * 2)
  }));
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-black">{title}</p>
        <p className="text-xs font-bold text-iron-400">{unit}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.18)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="rgba(255,255,255,0.18)" />
        <path d={path} fill="none" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="5" fill={strokeColor} />
            <text x={point.x} y={height - 8} textAnchor="middle" fontSize="12" fill="#94a3b8">{point.label}</text>
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="12" fill="#f8fafc">{formatWeight(point.value, unit)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function LibraryMusclePicker({
  open,
  roleLabel,
  selected,
  onToggle,
  onClose,
}: {
  open: boolean;
  roleLabel: string;
  selected: MuscleGroup[];
  onToggle: (muscle: MuscleGroup) => void;
  onClose: () => void;
}) {
  const [expandedGroupId, setExpandedGroupId] = useState<string>(LIBRARY_MUSCLE_GROUPS[0]?.id || "chest");

  useEffect(() => {
    if (!open) return;
    const firstSelectedGroup = selected
      .map((muscle) => getLibraryMuscleGroupForMuscle(muscle)?.id)
      .find(Boolean);
    if (firstSelectedGroup) setExpandedGroupId(firstSelectedGroup);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm">
      <div className="flex min-h-full items-end justify-center md:items-center md:p-6">
        <section className="flex max-h-[92vh] w-full flex-col overflow-hidden border border-white/10 bg-iron-950 shadow-2xl md:max-w-2xl md:rounded-md">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-iron-500">Muscles</p>
              <h3 className="truncate text-sm font-semibold text-white">Choose {roleLabel}</h3>
            </div>
            <button
              className="tap-highlight inline-flex min-h-9 items-center justify-center rounded-sm border border-white/[0.1] px-3 text-sm font-semibold text-iron-200 transition hover:bg-white/[0.06]"
              onClick={onClose}
            >
              Done
            </button>
          </div>

          <div className="overflow-y-auto px-4 py-4">
            <div className="rounded-sm border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Selected</p>
              <p className="mt-2 text-sm text-iron-100">{summarizeMuscleList(selected)}</p>
            </div>

            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Groups</p>
              <div className="mt-3 space-y-3">
                {LIBRARY_MUSCLE_GROUPS.map((group) => {
                  const isExpanded = expandedGroupId === group.id;
                  const selectedCount = group.muscles.filter((muscle) => selected.includes(muscle)).length;
                  return (
                    <div key={group.id} className="border border-white/[0.08] bg-white/[0.02]">
                      <button
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-white/[0.04]"
                        onClick={() => setExpandedGroupId(isExpanded ? "" : group.id)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{group.label}</p>
                          <p className="mt-1 text-xs text-iron-500">
                            {selectedCount > 0 ? `${selectedCount} selected` : `${group.muscles.length} options`}
                          </p>
                        </div>
                        <ChevronRight className={`h-4 w-4 text-iron-500 transition ${isExpanded ? "rotate-90" : ""}`} />
                      </button>
                      {isExpanded && (
                        <div className="border-t border-white/[0.08] px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {group.broadValue ? (
                              <button
                                className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                                  selected.includes(group.broadValue)
                                    ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`
                                    : "border-white/[0.1] bg-white/[0.04] text-iron-300 hover:bg-white/[0.08]"
                                }`}
                                onClick={() => onToggle(group.broadValue!)}
                              >
                                {group.label}
                              </button>
                            ) : null}
                            {group.muscles
                              .filter((muscle) => muscle !== group.broadValue)
                              .map((muscle) => (
                                <button
                                  key={muscle}
                                  className={`tap-highlight rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                                    selected.includes(muscle)
                                      ? `${LIBRARY_BLUE_BORDER} ${LIBRARY_BLUE_FILL} ${LIBRARY_BLUE_TEXT}`
                                      : "border-white/[0.1] bg-white/[0.04] text-iron-300 hover:bg-white/[0.08]"
                                  }`}
                                  onClick={() => onToggle(muscle)}
                                >
                                  {formatMuscleLabel(muscle)}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SplitLibraryManager({
  db,
  user,
  updateDb,
  authMode,
  cloudStatus,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  authMode: "unknown" | "local" | "cloud";
  cloudStatus: "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed";
}) {
  const splits = db.splitTemplates
    .filter((split) => !split.ownerUserId || split.ownerUserId === user.id)
    .sort((a, b) => Number(b.favoriteUserIds?.includes(user.id) || false) - Number(a.favoriteUserIds?.includes(user.id) || false) || a.name.localeCompare(b.name));
  const [editingId, setEditingId] = useState<string>(splits[0]?.id || "");
  const [showSplitAdvanced, setShowSplitAdvanced] = useState(false);
  const [splitSectionFilterState, setSplitSectionFilterState] = useState<"all" | "default" | "custom">("all");
  const activeSplit = splits.find((split) => split.id === editingId) || splits[0];

  function createSplit() {
    const split: SplitTemplate = {
      id: createId("split"),
      ownerUserId: user.id,
      source: "custom",
      name: "",
      goal: user.goal,
      daysPerWeek: 0,
      description: "",
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      days: []
    };
    void updateDb((draft) => {
      draft.splitTemplates.unshift(split);
      return draft;
    });
    setEditingId(split.id);
  }

  function updateSplit(mutator: (split: SplitTemplate) => void) {
    if (!activeSplit) return;
    void updateDb((draft) => {
      const target = draft.splitTemplates.find((split) => split.id === activeSplit.id);
      if (target) {
        mutator(target);
        target.daysPerWeek = target.days.length;
        if (!target.ownerUserId) target.userModified = true;
        target.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function resetSplitToDefault(split: SplitTemplate) {
    const seed = seedSplitTemplates.find((s) => s.id === split.id);
    if (!seed) return;
    if (!confirm(`Reset "${split.name}" to app defaults? Your edits will be lost.`)) return;
    void updateDb((draft) => {
      const target = draft.splitTemplates.find((s) => s.id === split.id);
      if (!target) return draft;
      target.name = seed.name;
      target.description = seed.description;
      target.goal = seed.goal;
      target.daysPerWeek = seed.daysPerWeek;
      target.notes = seed.notes;
      target.days = structuredClone(seed.days);
      target.userModified = false;
      target.updatedAt = nowIso();
      return draft;
    });
  }

  function duplicateSplit(split: SplitTemplate) {
    const copy = structuredClone(split);
    copy.id = createId("split");
    copy.ownerUserId = user.id;
    copy.name = `${split.name} Copy`;
    copy.source = "custom";
    copy.copiedFromId = split.id;
    copy.createdAt = nowIso();
    copy.updatedAt = nowIso();
    copy.days = copy.days.map((day) => ({ ...day, id: createId("splitday") }));
    void updateDb((draft) => {
      draft.splitTemplates.unshift(copy);
      return draft;
    });
    setEditingId(copy.id);
  }

  function deleteSplit(split: SplitTemplate) {
    if (!split.ownerUserId) return;
    const customSplits = db.splitTemplates.filter((s) => s.ownerUserId === user.id);
    if (customSplits.length <= 1 && db.splitTemplates.length <= 1) return;
    if (!confirm(`Delete "${split.name}"? Existing programs keep their already-built workouts.`)) return;
    void updateDb((draft) => {
      draft.splitTemplates = draft.splitTemplates.filter((item) => item.id !== split.id);
      return draft;
    });
    setEditingId(db.splitTemplates.find((item) => item.id !== split.id)?.id || "");
  }

  function toggleFavorite(split: SplitTemplate) {
    void updateDb((draft) => {
      const target = draft.splitTemplates.find((item) => item.id === split.id);
      if (target) {
        target.favoriteUserIds ||= [];
        target.favoriteUserIds = target.favoriteUserIds.includes(user.id) ? target.favoriteUserIds.filter((id) => id !== user.id) : [...target.favoriteUserIds, user.id];
        target.updatedAt = nowIso();
      }
      return draft;
    });
  }

  const splitSectionFilter = splitSectionFilterState;
  const defaultSplits = splits.filter((s) => !s.ownerUserId);
  const customSplits = splits.filter((s) => !!s.ownerUserId);
  const visibleSplits = splitSectionFilter === "default" ? defaultSplits : splitSectionFilter === "custom" ? customSplits : splits;

  return (
    <section className="grid gap-4 xl:grid-cols-[20rem_1fr]">
      <Panel title="Split Templates" icon={CalendarDays}>
        <p className="mb-3 text-sm text-iron-300">Reusable training structures for program generation.</p>
        <button className="btn-primary mb-3 w-full" onClick={createSplit}><Plus className="h-4 w-4" /> Create Custom Split</button>
        <div className="mb-3 flex gap-1">
          {([["all", "All"], ["default", "Default"], ["custom", "Custom"]] as const).map(([id, label]) => (
            <button key={id} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${splitSectionFilter === id ? "bg-volt text-iron-950" : "bg-white/10 text-iron-300 hover:bg-white/20"}`} onClick={() => setSplitSectionFilterState(id)}>{label}</button>
          ))}
        </div>
        <div className="space-y-2">
          {visibleSplits.map((split) => (
            <div key={split.id} className={`rounded-lg border p-2 ${activeSplit?.id === split.id ? "border-volt bg-volt/10" : "border-white/10 bg-white/[0.05]"}`}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditingId(split.id)}>
                  <p className="truncate font-black">{split.name}</p>
                  <p className="text-xs text-iron-400">{split.days.length || split.daysPerWeek}d · {split.goal} · {split.ownerUserId ? "custom" : "default"}{split.userModified ? " (edited)" : ""}</p>
                </button>
                <button className={`btn-ghost min-h-9 px-2 ${split.favoriteUserIds?.includes(user.id) ? "text-volt" : "text-iron-400"}`} onClick={() => toggleFavorite(split)} title={split.favoriteUserIds?.includes(user.id) ? "Unfavorite" : "Favorite"}>
                  <Star className={`h-4 w-4 ${split.favoriteUserIds?.includes(user.id) ? "fill-current" : ""}`} />
                </button>
              </div>
            </div>
          ))}
          {!visibleSplits.length && <EmptyState title="No splits" detail="Create a custom split or switch tabs." />}
        </div>
      </Panel>
      <Panel title="Split Builder" icon={SlidersHorizontal}>
        {activeSplit ? (
          <div className="space-y-4">
            {!activeSplit.ownerUserId && activeSplit.userModified && (
              <p className="rounded-lg border border-volt/30 bg-volt/5 px-3 py-2 text-xs text-volt">Default split — {editSaveContext(authMode, cloudStatus)} Use Reset to restore app defaults.</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Split name" value={activeSplit.name} onChange={(name) => updateSplit((split) => { split.name = name; })} />
              <SelectField label="Goal" value={activeSplit.goal} options={["powerlifting", "bodybuilding", "powerbuilding", "general-health", "conditioning", "maintenance"]} onChange={(goal) => updateSplit((split) => { split.goal = goal as TrainingGoal; })} />
            </div>
            <button
              className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-300 transition hover:bg-white/[0.07]"
              onClick={() => setShowSplitAdvanced((v) => !v)}
            >
              Advanced Options
              <ChevronRight className={`h-3 w-3 transition ${showSplitAdvanced ? "rotate-90" : ""}`} />
            </button>
            {showSplitAdvanced && (
              <div className="grid gap-3">
                <TextField label="Description" value={activeSplit.description || ""} onChange={(description) => updateSplit((split) => { split.description = description; })} />
                <TextField label="Notes" value={activeSplit.notes} onChange={(notes) => updateSplit((split) => { split.notes = notes; })} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => duplicateSplit(activeSplit)}><Copy className="h-4 w-4" /> Duplicate</button>
              {activeSplit.ownerUserId ? (
                <button className="btn-secondary border-ember/40 text-orange-100" onClick={() => deleteSplit(activeSplit)}><Trash2 className="h-4 w-4" /> Delete</button>
              ) : activeSplit.userModified && seedSplitTemplates.some((s) => s.id === activeSplit.id) ? (
                <button className="btn-secondary text-volt" onClick={() => resetSplitToDefault(activeSplit)}><RotateCcw className="h-4 w-4" /> Reset to Default</button>
              ) : null}
              <button className="btn-secondary" onClick={() => updateSplit((split) => { split.days.push(makeSplitDay(`Day ${split.days.length + 1}`, ["chest"], ["horizontal-press"])); })}><Plus className="h-4 w-4" /> Add Day</button>
            </div>
            <div className="space-y-3">
              {activeSplit.days.map((day, dayIndex) => (
                <SplitDayEditor key={day.id} day={day} index={dayIndex} onChange={(nextDay) => updateSplit((split) => { split.days[dayIndex] = nextDay; })} onDelete={() => updateSplit((split) => { split.days = split.days.filter((item) => item.id !== day.id); })} />
              ))}
            </div>
          </div>
        ) : <EmptyState title="No split selected" detail="Create a split to configure training days." />}
      </Panel>
    </section>
  );
}

function makeSplitDay(name: string, muscleGroups: MuscleGroup[], movementPatterns: MovementPattern[]): SplitDay {
  return {
    id: createId("splitday"),
    name,
    focus: "hypertrophy",
    optionalTrainingFocus: "hypertrophy",
    targetMuscles: muscleGroups,
    muscleGroups,
    optionalMovementPatterns: movementPatterns,
    movementPatterns,
    exerciseTargetCount: 5,
    priorityMuscles: muscleGroups.slice(0, 2),
    priorityLifts: [],
    weeklySetTargets: Object.fromEntries(muscleGroups.map((muscle) => [muscle, 6])),
    notes: ""
  };
}

function SplitDayEditor({ day, index, onChange, onDelete }: { day: SplitDay; index: number; onChange: (day: SplitDay) => void; onDelete: () => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function getReqCount(muscle: MuscleGroup): number {
    return day.requirements?.find((r) => r.targetMuscle === muscle)?.requiredExerciseCount ?? 0;
  }

  function setReqCount(muscle: MuscleGroup, count: number) {
    const reqs = day.requirements ?? [];
    if (count <= 0) {
      const newReqs = reqs.filter((r) => r.targetMuscle !== muscle);
      const newMuscles = day.muscleGroups.filter((m) => m !== muscle);
      onChange({ ...day, requirements: newReqs, muscleGroups: newMuscles, targetMuscles: newMuscles, priorityMuscles: newMuscles.slice(0, 2), weeklySetTargets: Object.fromEntries(newMuscles.map((m) => [m, day.weeklySetTargets[m] || 6])) });
    } else {
      const newMuscles = day.muscleGroups.includes(muscle) ? day.muscleGroups : [...day.muscleGroups, muscle];
      const existing = reqs.find((r) => r.targetMuscle === muscle);
      const newReqs = existing
        ? reqs.map((r) => r.targetMuscle === muscle ? { ...r, requiredExerciseCount: count } : r)
        : [...reqs, { id: createId("req"), targetMuscle: muscle, requiredExerciseCount: count, priority: reqs.length + 1 }];
      onChange({ ...day, requirements: newReqs, muscleGroups: newMuscles, targetMuscles: newMuscles, priorityMuscles: newMuscles.slice(0, 2), weeklySetTargets: Object.fromEntries(newMuscles.map((m) => [m, day.weeklySetTargets[m] || 6])) });
    }
  }

  const togglePattern = (pattern: MovementPattern) => {
    const movementPatterns = day.movementPatterns.includes(pattern) ? day.movementPatterns.filter((item) => item !== pattern) : [...day.movementPatterns, pattern];
    onChange({ ...day, movementPatterns, optionalMovementPatterns: movementPatterns });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-black">Day {index + 1}</p>
        <button className="btn-ghost text-orange-100" onClick={onDelete}>Remove</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Day name" value={day.name} onChange={(name) => onChange({ ...day, name })} />
        <SelectField label="Focus" value={day.focus} options={dayFocusOptions} onChange={(focus) => onChange({ ...day, focus: focus as DayFocus })} />
      </div>
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="label">Muscles — click to add, click again to require more</p>
          {(day.requirements?.length ?? 0) > 0 && (
            <button className="text-xs text-iron-400 hover:text-iron-200" onClick={() => onChange({ ...day, requirements: [], muscleGroups: [], targetMuscles: [], priorityMuscles: [], weeklySetTargets: {} })}>Reset all</button>
          )}
        </div>
        <p className="mb-2 text-xs text-iron-500">Each click adds a required exercise. Badge = required count. − removes one.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {muscleOptions.map((muscle) => {
            const count = getReqCount(muscle);
            return (
              <div key={muscle} className="relative">
                <button
                  className={`w-full rounded-lg border px-2 py-2 text-xs font-bold transition ${count > 0 ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`}
                  onClick={() => setReqCount(muscle, Math.min(3, count + 1))}
                >
                  {muscle}{count > 0 ? ` ×${count}` : ""}
                </button>
                {count > 0 && (
                  <button
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-iron-700 text-[10px] font-black text-iron-100 hover:bg-ember/70"
                    onClick={(e) => { e.stopPropagation(); setReqCount(muscle, count - 1); }}
                  >−</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3">
        <button
          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-300 transition hover:bg-white/[0.07]"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          Advanced Options {day.movementPatterns.length > 0 ? `(${day.movementPatterns.length} patterns)` : ""}
          <ChevronRight className={`h-3 w-3 transition ${showAdvanced ? "rotate-90" : ""}`} />
        </button>
        {showAdvanced && (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="label mb-2">Movement patterns</p>
            <p className="mb-2 text-xs text-iron-500">Optional. Movement patterns guide auto-selection but muscles take priority.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {movementOptions.map((pattern) => (
                <button key={pattern} className={`rounded-lg border p-2 text-xs font-bold ${day.movementPatterns.includes(pattern) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => togglePattern(pattern)}>{pattern}</button>
              ))}
            </div>
            <TextField label="Notes" value={day.notes || ""} onChange={(notes) => onChange({ ...day, notes })} />
          </div>
        )}
      </div>
    </div>
  );
}
const EQUIPMENT_TYPE_DISPLAY: Record<string, string> = {
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  cable_stack: "Cable Stack",
  selectorized_machine: "Selectorized Machine",
  plate_loaded: "Plate Loaded",
  bodyweight: "Bodyweight",
  other: "Other",
};
const LOADING_PROFILE_EQUIPMENT_OPTIONS = [
  "dumbbell", "barbell", "cable_stack", "selectorized_machine", "plate_loaded", "bodyweight", "other",
] as const;
const LOADING_PROFILE_UNIT_OPTIONS = ["lb", "kg"] as const;

function LoadingProfilesPanel({
  db,
  user,
  updateDb,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const profiles = db.loadingProfiles ?? [];
  const emptyProfileDraft = { name: "", equipmentType: "cable_stack" as LoadingProfileEquipmentType, unit: user.unit as "lb" | "kg", increment: 5, notes: "" };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState(emptyProfileDraft);

  function startEdit(profile: LoadingProfile) {
    setEditingId(profile.id);
    setProfileDraft({ name: profile.name, equipmentType: profile.equipmentType, unit: (profile.unit === "lb" || profile.unit === "kg") ? profile.unit : user.unit, increment: profile.increment, notes: profile.notes ?? "" });
  }

  function startAdd() {
    setEditingId("new");
    setProfileDraft(emptyProfileDraft);
  }

  function saveProfile() {
    if (!profileDraft.name.trim()) return;
    void updateDb((draft) => {
      draft.loadingProfiles ||= [];
      if (editingId === "new") {
        draft.loadingProfiles.push({ id: createId("lp"), name: profileDraft.name.trim(), unit: profileDraft.unit, increment: profileDraft.increment, equipmentType: profileDraft.equipmentType, notes: profileDraft.notes.trim() || undefined });
      } else {
        const target = draft.loadingProfiles.find((p) => p.id === editingId);
        if (target) {
          target.name = profileDraft.name.trim();
          target.unit = profileDraft.unit;
          target.increment = profileDraft.increment;
          target.equipmentType = profileDraft.equipmentType;
          target.notes = profileDraft.notes.trim() || undefined;
        }
      }
      return draft;
    });
    setEditingId(null);
  }

  function deleteProfile(id: string) {
    const usedBy = db.exercises.filter((e) => e.loadingProfileId === id).map((e) => e.name);
    const msg = usedBy.length
      ? `Delete this profile? ${usedBy.length} exercise(s) will revert to equipment defaults: ${usedBy.slice(0, 3).join(", ")}${usedBy.length > 3 ? "…" : ""}`
      : "Delete this loading profile?";
    if (!confirm(msg)) return;
    void updateDb((draft) => {
      draft.loadingProfiles = (draft.loadingProfiles ?? []).filter((p) => p.id !== id);
      draft.exercises.forEach((e) => { if (e.loadingProfileId === id) e.loadingProfileId = ""; });
      return draft;
    });
    if (editingId === id) setEditingId(null);
  }

  const editForm = (
    <div className="rounded-lg border border-volt/30 bg-volt/5 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Name" value={profileDraft.name} onChange={(name) => setProfileDraft((d) => ({ ...d, name }))} />
        <SelectField label="Equipment type" value={profileDraft.equipmentType} options={LOADING_PROFILE_EQUIPMENT_OPTIONS} labels={EQUIPMENT_TYPE_DISPLAY} onChange={(v) => setProfileDraft((d) => ({ ...d, equipmentType: v as LoadingProfileEquipmentType }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Unit" value={profileDraft.unit} options={LOADING_PROFILE_UNIT_OPTIONS} onChange={(v) => setProfileDraft((d) => ({ ...d, unit: v as "lb" | "kg" }))} />
        <div>
          <label className="label">Increment ({profileDraft.unit})</label>
          <input className="field mt-2" type="number" step="0.5" min="0.5" value={profileDraft.increment} onChange={(e) => setProfileDraft((d) => ({ ...d, increment: Number(e.target.value) || 1 }))} />
        </div>
      </div>

      <TextField label="Notes (optional)" value={profileDraft.notes} onChange={(notes) => setProfileDraft((d) => ({ ...d, notes }))} />

      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={saveProfile} disabled={!profileDraft.name.trim()}>Save</button>
        <button className="btn-secondary flex-1" onClick={() => setEditingId(null)}>Cancel</button>
      </div>
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-iron-200">Loading Profiles</h3>
        {editingId !== "new" && (
          <button className="btn-ghost text-xs" onClick={startAdd}><Plus className="h-3.5 w-3.5" /> Add</button>
        )}
      </div>
      <p className="text-xs text-iron-500">Defines the unit and increment for each equipment type. Assign in the exercise editor.</p>
      <div className="list-section">
        {profiles.map((profile, index) => (
          <div key={profile.id}>
            {index > 0 && <div className="list-divider" />}
            {editingId === profile.id ? (
              <div className="p-3">{editForm}</div>
            ) : (
              <button className="list-row-tap" onClick={() => startEdit(profile)}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-iron-100">{profile.name}</p>
                  <p className="mt-0.5 text-xs text-iron-500">
                    {profile.increment} {profile.unit} jumps · {EQUIPMENT_TYPE_DISPLAY[profile.equipmentType] ?? profile.equipmentType}
                  </p>
                  {profile.notes && <p className="text-xs text-iron-600">{profile.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-md p-1.5 text-iron-600 transition hover:text-orange-400"
                    onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-iron-600" />
                </div>
              </button>
            )}
          </div>
        ))}
        {!profiles.length && (
          <div className="px-4 py-4">
            <p className="text-xs text-iron-500">No loading profiles yet.</p>
          </div>
        )}
        {editingId === "new" && (
          <div className="border-t border-white/[0.07] p-3">{editForm}</div>
        )}
      </div>
    </section>
  );
}


// Deep-copy a week's exercises to a target week, assigning fresh IDs and clearing plannedWeight.
// Returns true if at least one day was copied.
// Skips any day where source and target have different splitDayIds (e.g. Upper vs Lower in
// continuous-loop mode) — exercises from the wrong split day must not bleed into a different day.
function copyWeekExercises(sourceWeek: { workouts: WorkoutDay[] }, targetWeek: { workouts: WorkoutDay[] }): boolean {
  let anyCopied = false;
  targetWeek.workouts.forEach((targetDay, dayIdx) => {
    const sourceDay = sourceWeek.workouts[dayIdx];
    if (!sourceDay || sourceDay.exercises.length === 0) return;
    // Only copy if the target day has no exercises yet
    if (targetDay.exercises.length > 0) return;
    // Don't copy if split day identities differ (Upper must not go to Lower, etc.)
    if (sourceDay.splitDayId !== targetDay.splitDayId) return;
    // Don't copy if one day has a split assignment and the other doesn't
    if (!!sourceDay.splitDayId !== !!targetDay.splitDayId) return;
    // Don't copy if focus labels differ (e.g. "Push" vs "Pull")
    if (sourceDay.focus && targetDay.focus && sourceDay.focus !== targetDay.focus) return;
    targetDay.exercises = sourceDay.exercises.map((ex, exIdx) => ({
      ...ex,
      id: createId("pex"),
      order: exIdx + 1,
      plannedSets: ex.plannedSets.map((ps) => ({
        ...ps,
        id: createId("pset"),
        plannedWeight: undefined,
      })),
    }));
    anyCopied = true;
  });
  return anyCopied;
}

function WeekEditor({
  db, user, program, block, weekNumber, updateDb, onClose, onResumeWorkout, onOpenExerciseAnalytics, initialDayId
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program: Program;
  block: TrainingBlock;
  weekNumber: number;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onClose: () => void;
  initialDayId?: string;
  onResumeWorkout?: (
    sessionId?: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) => Promise<void> | void;
  onOpenExerciseAnalytics?: (state: ExerciseAnalyticsState) => void;
}) {
  const week = block.weeks.find((w) => w.weekNumber === weekNumber);
  const prevWeek = block.weeks.find((w) => w.weekNumber === weekNumber - 1);
  const splitTemplate = db.splitTemplates.find((s) => s.id === block.splitTemplateId);
  const initialDayIndex = Math.max(0, week?.workouts.findIndex((day) => day.id === initialDayId) ?? 0);
  const [selectedDayIdx, setSelectedDayIdx] = useState(initialDayIndex);
  const [copied, setCopied] = useState(false);
  const [copiedFromPrev, setCopiedFromPrev] = useState(false);
  const [reviewSessionId, setReviewSessionId] = useState<string | undefined>();
  // On mount: mark week as draft, capture the saved baseline, then optionally copy exercises from previous week.
  useEffect(() => {
    if (!week || copied) return;
    const hasAnyExercises = week.workouts.some((d) => d.exercises.length > 0);
    const attemptedCopy = !hasAnyExercises && !!prevWeek;
    let copiedExercises = false;
    let wouldCopy = false;
    if (!hasAnyExercises && prevWeek) {
      // Pre-check whether anything would actually be copied (must mirror copyWeekExercises guard)
      wouldCopy = prevWeek.workouts.some((sourceDay, idx) => {
        const targetDay = week.workouts[idx];
        if (!sourceDay || sourceDay.exercises.length === 0) return false;
        if (targetDay && targetDay.exercises.length > 0) return false;
        if (sourceDay.splitDayId !== targetDay?.splitDayId) return false;
        if (!!sourceDay.splitDayId !== !!targetDay?.splitDayId) return false;
        if (sourceDay.focus && targetDay?.focus && sourceDay.focus !== targetDay.focus) return false;
        return true;
      });
    }
    void updateDb((draft) => {
      const draftBlock = draft.programs.find((p) => p.id === program.id)?.blocks.find((b) => b.id === block.id);
      if (!draftBlock) return draft;
      const draftWeek = draftBlock.weeks.find((w) => w.weekNumber === weekNumber);
      const draftPrev = draftBlock.weeks.find((w) => w.weekNumber === weekNumber - 1);
      if (!draftWeek) return draft;
      if (!draftWeek.isDraft && !draftWeek.savedWorkoutsBeforeDraft) {
        draftWeek.savedWorkoutsBeforeDraft = structuredClone(draftWeek.workouts);
      }
      draftWeek.isDraft = true;
      if (!hasAnyExercises && draftPrev) {
        copiedExercises = copyWeekExercises(draftPrev, draftWeek);
      }
      return draft;
    });
    setCopied(copiedExercises || attemptedCopy);
    setCopiedFromPrev(wouldCopy);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!week?.workouts.length) return;
    if (!initialDayId) return;
    const nextIndex = week.workouts.findIndex((day) => day.id === initialDayId);
    if (nextIndex >= 0) setSelectedDayIdx(nextIndex);
  }, [initialDayId, week?.workouts]);

  if (!week) {
    return (
      <div className="space-y-5">
        <PageTitle eyebrow="Week Editor" title={`Week ${weekNumber}`} />
        <Panel title="Week not found" icon={CalendarDays}>
          <EmptyState title={`Week ${weekNumber} doesn't exist in this block`} detail="This block may not have that many weeks." />
          <button className="btn-secondary mt-4 w-full" onClick={onClose}>← Back</button>
        </Panel>
      </div>
    );
  }

  const selectedDay = week.workouts[selectedDayIdx] as WorkoutDay | undefined;
  const selectedCompletedSession = selectedDay
    ? db.sessions.find((session) => session.userId === user.id && session.workoutDayId === selectedDay.id && session.status === "completed")
    : undefined;
  const reviewSession = db.sessions.find((session) => session.id === reviewSessionId && session.userId === user.id);
  // Resolve split day for context display
  const selectedDaySplitDay = selectedDay?.splitDayId
    ? splitTemplate?.days.find((d) => d.id === selectedDay.splitDayId)
    : undefined;

  function saveAndClose() {
    // Clear draft metadata — week is now saved/planned truth.
    void updateDb((draft) => {
      const draftBlock = draft.programs.find((p) => p.id === program.id)?.blocks.find((b) => b.id === block.id);
      const draftWeek = draftBlock?.weeks.find((w) => w.weekNumber === weekNumber);
      if (draftWeek) {
        draftWeek.isDraft = false;
        delete draftWeek.savedWorkoutsBeforeDraft;
      }
      return draft;
    });
    onClose();
  }

  function discardDraft() {
    if (!confirm(`Discard all changes to Week ${weekNumber}? Exercises will be reset to the saved state.`)) return;
    void updateDb((draft) => {
      const draftBlock = draft.programs.find((p) => p.id === program.id)?.blocks.find((b) => b.id === block.id);
      const draftWeek = draftBlock?.weeks.find((w) => w.weekNumber === weekNumber);
      if (draftWeek) {
        if (draftWeek.savedWorkoutsBeforeDraft) {
          draftWeek.workouts = structuredClone(draftWeek.savedWorkoutsBeforeDraft);
        } else {
          draftWeek.workouts = draftWeek.workouts.map((day) => ({
            ...day,
            exercises: [],
            status: day.status === "rest" ? "rest" : "planned",
          }));
        }
        draftWeek.isDraft = false;
        delete draftWeek.savedWorkoutsBeforeDraft;
      }
      return draft;
    });
    onClose();
  }

  // True when split days differ and nothing was copied for the selected day
  const prevDayForSelected = prevWeek?.workouts[selectedDayIdx];
  const splitDayMismatch = prevDayForSelected?.splitDayId && selectedDay?.splitDayId &&
    prevDayForSelected.splitDayId !== selectedDay.splitDayId;

  if (reviewSession) {
    return (
      <CompletedWorkoutReview
        db={db}
        user={user}
        session={reviewSession}
        onBack={() => setReviewSessionId(undefined)}
        onOpenExerciseAnalytics={(exerciseId, exerciseName) => onOpenExerciseAnalytics?.({
          exerciseId,
          exerciseName,
          sessionId: reviewSession.id,
          workoutDayId: reviewSession.workoutDayId,
          returnScreen: "completed-review",
          returnCompletedReviewState: { sessionId: reviewSession.id, returnScreen: "week" },
        })}
        onEditWorkout={onResumeWorkout ? () => void onResumeWorkout(reviewSession.id, {
          previousScreen: "week",
          completedReviewState: { sessionId: reviewSession.id, returnScreen: "week" },
          loggerMode: "completed-edit",
        }) : undefined}
        backLabel="Back to Week"
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <button className="btn-compact -ml-2" onClick={onClose}>
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Week
      </button>

      <section className="space-y-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Editing {selectedDay?.name || `Week ${weekNumber}`}</h2>
            <p className="mt-1 text-sm text-iron-400">
              Week {weekNumber} of {block.lengthWeeks}
              {copiedFromPrev && prevWeek && <> · <span className="text-[#8fb9ff]">Copied from Week {weekNumber - 1}</span></>}
              {copied && !copiedFromPrev && prevWeek && <> · <span className="text-orange-300">Split days differ from Week {weekNumber - 1}</span></>}
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <button className="apollo-primary-btn" onClick={saveAndClose}>
              <Save className="h-4 w-4" />
              Save changes
            </button>
            <button className="apollo-secondary-btn" onClick={discardDraft}>Cancel</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:hidden">
          <button className="apollo-primary-btn" onClick={saveAndClose}>
            <Save className="h-4 w-4" />
            Save changes
          </button>
          <button className="apollo-secondary-btn" onClick={discardDraft}>Cancel</button>
        </div>
        <WeekDayCardSelector
          db={db}
          days={week.workouts}
          selectedDayId={selectedDay?.id}
          compact
          onSelect={(day) => {
            const completedSession = db.sessions.find(
              (session) =>
                session.userId === user.id &&
                session.workoutDayId === day.id &&
                session.status === "completed"
            );
            if (completedSession) {
              setReviewSessionId(completedSession.id);
              return;
            }
            setSelectedDayIdx(Math.max(0, week.workouts.findIndex((item) => item.id === day.id)));
          }}
        />
      </section>

      {selectedDay ? (
        <div className="space-y-4">
          {selectedCompletedSession ? (
            <section className="border-y border-white/[0.06] py-4">
              <p className="text-sm text-iron-300">This day already has completed workout history. Review or edit the logged session without overwriting the planned day.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="apollo-secondary-btn w-full" onClick={() => setReviewSessionId(selectedCompletedSession.id)}>
                  View Summary
                </button>
                <button
                  className="apollo-primary-btn w-full"
                  onClick={() => void onResumeWorkout?.(selectedCompletedSession.id, {
                    previousScreen: "week",
                    completedReviewState: { sessionId: selectedCompletedSession.id, returnScreen: "week" },
                    loggerMode: "completed-edit",
                  })}
                >
                  Edit Workout
                </button>
              </div>
            </section>
          ) : (
            <WorkoutDayEditor db={db} user={user} program={program} day={selectedDay} updateDb={updateDb} variant="week" />
          )}
        </div>
      ) : (
        <EmptyState title="No days in this week" detail="This week has no workout days configured." />
      )}
    </div>
  );
}

function WeekProgressScreen({
  db, user, setScreen, planWeekRequest, onPlanWeekRequestHandled, editingWeekNumber, onEditingWeekNumberChange, updateDb, onResumeWorkout, onOpenCompletedSessionReview, onOpenExerciseAnalytics
}: {
  db: TrainingDatabase;
  user: UserProfile;
  setScreen: (screen: Screen) => void;
  planWeekRequest?: number;
  onPlanWeekRequestHandled?: () => void;
  editingWeekNumber?: number;
  onEditingWeekNumberChange?: (n: number | undefined) => void;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onResumeWorkout?: (
    sessionId?: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) => Promise<void> | void;
  onOpenCompletedSessionReview?: (sessionId: string, returnScreen: CompletedReviewState["returnScreen"]) => void;
  onOpenExerciseAnalytics?: (state: ExerciseAnalyticsState) => void;
}) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const block = activeProgram?.blocks[0];
  // Derive the current week from the block cursor (sequence-based, not calendar-based).
  const cursor = block ? getCurrentWorkoutForUser(db, user.id) : undefined;
  const currentWeekNumber = (cursor?.week.weekNumber ?? block?.currentWeek) || 1;
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(currentWeekNumber);
  const [inlineDayEditId, setInlineDayEditId] = useState<string | undefined>();
  const [showOffProgramHistory, setShowOffProgramHistory] = useState(false);
  const [reviewSessionId, setReviewSessionId] = useState<string | undefined>();
  const [editorDayId, setEditorDayId] = useState<string | undefined>();
  // Lifted to App level via editingWeekNumber / onEditingWeekNumberChange so WeekEditor
  // state survives tab navigation without remounting.
  const setPlanningWeekNumber = (n: number | undefined) => onEditingWeekNumberChange?.(n);
  const planningWeekNumber = editingWeekNumber;
  // Sync selector when the block advances to a new week
  useEffect(() => { setSelectedWeekNumber(currentWeekNumber); }, [currentWeekNumber]);
  // Respond to planWeekRequest from Today screen or Week Review
  useEffect(() => {
    if (planWeekRequest !== undefined) {
      setPlanningWeekNumber(planWeekRequest);
      onPlanWeekRequestHandled?.();
    }
  }, [planWeekRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = block?.weeks.find((item) => item.weekNumber === selectedWeekNumber) || block?.weeks[0];
  const weekSessions = db.sessions.filter((session) => session.userId === user.id && session.blockId === block?.id && session.weekNumber === week?.weekNumber);
  const completedSessions = weekSessions.filter((session) => session.status === "completed");
  const offProgramCompletedSessions = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed" && session.offProgram)
    .sort((a, b) => (b.completedAt || b.startedAt).localeCompare(a.completedAt || a.startedAt))
    .slice(0, 5);
  const skippedCount = week?.workouts.filter((day) => block?.skippedWorkoutDayIds?.includes(day.id) || day.status === "skipped").length || 0;
  const plannedWorkoutCount = week?.workouts.length || 0;
  const completionPercent = plannedWorkoutCount ? Math.round((completedSessions.length / plannedWorkoutCount) * 100) : 0;
  const averageSetRating = completedSessions
    .flatMap((session) => session.loggedExercises)
    .flatMap((exercise) => exercise.sets)
    .filter((set) => !set.skipped);
  const averageSetFeel = averageSetRating.length
    ? Number((averageSetRating.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / averageSetRating.length).toFixed(1))
    : 0;
  const inProgressCount = weekSessions.filter((session) => session.status === "in-progress").length;
  const weekHeading = activeProgram?.name || (block ? `${mapBlockType(block.type)} Block` : "Training Block");
  const reviewSession = reviewSessionId ? db.sessions.find((session) => session.id === reviewSessionId && session.userId === user.id) : undefined;

  function getDayStatus(session: WorkoutSession | undefined, daySkipped: boolean, dayPlanned: boolean) {
    if (session?.status === "completed") {
      return {
        label: "completed",
        className: "text-[#8fb9ff]",
      };
    }
    if (session?.status === "review") {
      return {
        label: "in review",
        className: "text-[#7fb0ff]",
      };
    }
    if (session?.status === "in-progress") {
      return {
        label: "in progress",
        className: "text-[#0a84ff]",
      };
    }
    if (daySkipped) {
      return {
        label: "skipped",
        className: "text-orange-300",
      };
    }
    if (session?.status) {
      return {
        label: session.status,
        className: "text-iron-400",
      };
    }
    return {
      label: dayPlanned ? "planned" : "unplanned",
      className: dayPlanned ? "text-iron-400" : "text-iron-500",
    };
  }

  function archiveCompletedBlock() {
    if (!activeProgram) return;
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === activeProgram.id);
      if (targetProgram) {
        targetProgram.status = "archived";
        targetProgram.updatedAt = nowIso();
        targetProgram.changeLog ||= [];
        targetProgram.changeLog.unshift({ id: createId("change"), at: nowIso(), label: "Finished block", detail: "Archived after block completion." });
      }
      const targetUser = draft.users.find((item) => item.id === user.id);
      if (targetUser) {
        targetUser.activeProgramId = undefined;
        targetUser.activeBlockId = undefined;
      }
      return draft;
    });
    setScreen("programs");
  }

  function repeatCompletedBlock() {
    if (!activeProgram) return;
    const clone = cloneProgramAsActive(activeProgram);
    void updateDb((draft) => {
      draft.programs.forEach((item) => {
        if (item.userId === user.id && item.status === "active") item.status = "archived";
      });
      draft.programs.unshift(clone);
      const targetUser = draft.users.find((item) => item.id === user.id);
      if (targetUser) {
        targetUser.activeProgramId = clone.id;
        targetUser.activeBlockId = clone.blocks[0]?.id;
      }
      draft.programGaps = analyzeProgramGaps(clone, draft);
      return draft;
    });
    setScreen("today");
  }

  if (planningWeekNumber !== undefined && activeProgram && block) {
    return (
      <WeekEditor
        db={db}
        user={user}
        program={activeProgram}
        block={block}
        weekNumber={planningWeekNumber}
        initialDayId={editorDayId}
        updateDb={updateDb}
        onClose={() => { setEditorDayId(undefined); setPlanningWeekNumber(undefined); }}
        onResumeWorkout={onResumeWorkout}
        onOpenExerciseAnalytics={onOpenExerciseAnalytics}
      />
    );
  }

  if (reviewSession && reviewSession.status === "completed") {
    return (
      <CompletedWorkoutReview
        db={db}
        user={user}
        session={reviewSession}
        onBack={() => setReviewSessionId(undefined)}
        onOpenExerciseAnalytics={(exerciseId, exerciseName) => onOpenExerciseAnalytics?.({
          exerciseId,
          exerciseName,
          sessionId: reviewSession.id,
          workoutDayId: reviewSession.workoutDayId,
          returnScreen: "completed-review",
          returnCompletedReviewState: { sessionId: reviewSession.id, returnScreen: "week" },
        })}
        onEditWorkout={onResumeWorkout ? () => void onResumeWorkout(reviewSession.id, {
          previousScreen: "week",
          completedReviewState: { sessionId: reviewSession.id, returnScreen: "week" },
          loggerMode: "completed-edit",
        }) : undefined}
        backLabel="Back to Week"
      />
    );
  }

  if (reviewSession && reviewSession.status !== "completed") {
    return (
      <InProgressWorkoutReview
        db={db}
        user={user}
        session={reviewSession}
        onBack={() => setReviewSessionId(undefined)}
        onContinue={() => void onResumeWorkout?.(reviewSession.id)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageTitle eyebrow="Week" title="Block Progress" />
      {!activeProgram || !block || !week ? (
        <Panel title="No Active Block" icon={CalendarDays}>
          <EmptyState title="No active block yet" detail="Activate a program block before tracking week progress." />
          <button className="btn-primary mt-4 w-full" onClick={() => setScreen("programs")}>Open Program Builder</button>
        </Panel>
      ) : (
        <>
          <section className="border-b border-white/[0.06] pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[1.08rem] font-semibold tracking-[-0.02em] text-white sm:text-[1.18rem]">{weekHeading}</p>
                <p className="mt-1 text-sm text-iron-400">
                  Week {week.weekNumber} of {block.lengthWeeks} · {completionPercent}% complete
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-iron-500">Selected week</p>
                <p className="mt-1 text-sm font-medium text-iron-200">Week {selectedWeekNumber} / {block.lengthWeeks}</p>
              </div>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-sm bg-white/[0.08]">
              <div className="h-full rounded-sm bg-[#0a84ff]" style={{ width: `${completionPercent}%` }} />
            </div>
            <p className="mt-4 border-t border-white/[0.06] pt-4 text-sm text-iron-300">
              {completedSessions.length} completed · {inProgressCount} in progress · {skippedCount} skipped · avg feel {averageSetFeel || "-"}
            </p>
          </section>
          {block.weeks.length > 1 && (
            <div className="-mx-4 overflow-x-auto px-4 scrollbar-none">
              <div className="flex min-w-max gap-1.5 sm:gap-2">
              {block.weeks.map((w) => {
                const isCurrentWeek = w.weekNumber === currentWeekNumber;
                const wComplete = isTrainingWeekComplete(w, block, db.sessions.filter((s) => s.userId === user.id && s.blockId === block.id));
                const hasSkippedWorkouts = w.workouts.some((day) => block?.skippedWorkoutDayIds?.includes(day.id) || day.status === "skipped");
                let weekMarker = "·";
                let weekMarkerClass = "text-iron-600";

                if (isCurrentWeek) {
                  weekMarker = "current";
                  weekMarkerClass = "text-[#0a84ff]";
                } else if (wComplete) {
                  weekMarker = "✓";
                  weekMarkerClass = "text-[#8aa6cc]";
                } else if (hasSkippedWorkouts) {
                  weekMarker = "skipped";
                  weekMarkerClass = "text-orange-300";
                }

                return (
                  <button
                    key={w.id}
                    className={`w-[4rem] shrink-0 border-b-2 px-0 py-2 text-center transition sm:w-[5.75rem] ${
                      selectedWeekNumber === w.weekNumber
                        ? "border-[#0a84ff]"
                        : "border-transparent"
                    }`}
                    onClick={() => setSelectedWeekNumber(w.weekNumber)}
                  >
                    <span
                      className={`block whitespace-nowrap text-[0.76rem] font-medium sm:hidden ${
                        selectedWeekNumber === w.weekNumber ? "text-white" : "text-iron-400"
                      }`}
                    >
                      W{w.weekNumber}
                    </span>
                    <span
                      className={`hidden whitespace-nowrap text-sm font-medium sm:block ${
                        selectedWeekNumber === w.weekNumber ? "text-white" : "text-iron-300"
                      }`}
                    >
                      Week {w.weekNumber}
                    </span>
                    <span className={`mt-1 block whitespace-nowrap text-[0.68rem] font-medium uppercase tracking-[0.08em] sm:text-[0.72rem] ${weekMarkerClass}`}>
                      {weekMarker}
                    </span>
                  </button>
                );
              })}
              </div>
            </div>
          )}
          {selectedWeekNumber === currentWeekNumber && isBlockWeekComplete(block, db.sessions.filter((s) => s.userId === user.id && s.blockId === block.id)) && (
            <WeekReviewPanel
              block={block}
              sessions={db.sessions.filter((s) => s.userId === user.id && s.blockId === block.id)}
              onPlanNextWeek={currentWeekNumber < block.lengthWeeks ? () => setPlanningWeekNumber(currentWeekNumber + 1) : undefined}
              onReviewBlock={() => setSelectedWeekNumber(currentWeekNumber)}
              onArchiveBlock={archiveCompletedBlock}
              onRepeatBlock={repeatCompletedBlock}
              onStartNewBlock={() => setScreen("programs")}
            />
          )}
          <section className="border-t border-white/[0.06]">
            <div className="divide-y divide-white/[0.06]">
              {week.workouts.map((day) => {
                const session = db.sessions.find((item) => item.userId === user.id && item.workoutDayId === day.id && item.status !== "abandoned");
                const actualSets = session?.loggedExercises.reduce((sum, log) => sum + log.sets.filter(isCompletedValidSet).length, 0) || 0;
                const skippedSets = session?.loggedExercises.reduce((sum, log) => sum + log.sets.filter((set) => set.skipped).length, 0) || 0;
                const plannedSets = day.exercises.reduce((sum, planned) => sum + planned.plannedSets.length, 0);
                const completedSets = session?.loggedExercises.flatMap((log) => log.sets.filter(isCompletedValidSet)) ?? [];
                const avgRpe = safeAverageRpe(completedSets);
                const avgSetRating = completedSets.length ? completedSets.reduce((sum, set) => sum + (set.setRating ?? 3), 0) / completedSets.length : 0;
                const score = session?.workoutScore ?? (session?.status === "completed" ? calculateWorkoutScore(session).score : undefined);
                const daySkipped = block.skippedWorkoutDayIds?.includes(day.id) || day.status === "skipped";
                const dayPlanned = isWorkoutDayPlanned(day);
                const isInlineEditing = inlineDayEditId === day.id;
                const status = getDayStatus(session, daySkipped, dayPlanned);
                const primaryAction = session?.status === "completed"
                  ? () => onOpenCompletedSessionReview?.(session.id, "week")
                  : session?.status === "review" || session?.status === "in-progress"
                    ? () => setReviewSessionId(session.id)
                    : undefined;
                const singleInsight = session ? getCompactSessionInsight(session) : undefined;
                return (
                  <div key={day.id} className="py-3.5">
                    <div
                      className={`rounded-sm px-1 py-1 ${primaryAction ? "cursor-pointer transition hover:bg-white/[0.03]" : ""}`}
                      onClick={primaryAction}
                      onKeyDown={primaryAction ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          primaryAction();
                        }
                      } : undefined}
                      role={primaryAction ? "button" : undefined}
                      tabIndex={primaryAction ? 0 : undefined}
                      aria-label={primaryAction ? `${status.label} workout ${day.name}` : undefined}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">
                            {(day.scheduledDay || "Day").toUpperCase()} · Day {day.dayIndex || 1}
                          </p>
                          <div className="mt-1 flex items-start justify-between gap-3">
                            <h3 className="min-w-0 text-base font-semibold tracking-[-0.01em] text-white">{day.name}</h3>
                            <span className={`shrink-0 text-xs font-semibold uppercase tracking-[0.1em] ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-iron-400">{day.focus} · planned {plannedSets} sets</p>
                          <p className="mt-1 text-sm text-iron-300">
                            {session
                              ? `${actualSets} hard · ${skippedSets} skipped · avg RPE ${avgRpe ? avgRpe.toFixed(1) : "-"}${avgSetRating ? ` · avg feel ${avgSetRating.toFixed(1)}` : ""}${score ? ` · score ${score}` : ""}`
                              : daySkipped
                                ? "Skipped manually · preserved in block history"
                                : "No session logged yet"}
                          </p>
                          {singleInsight ? (
                            <p className="mt-1 text-xs text-iron-500">{singleInsight}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {primaryAction ? <ChevronRight className="mt-1 h-3.5 w-3.5 text-iron-600" /> : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-iron-500">
                      {activeProgram && session?.status !== "completed" && (
                        <button
                          className={`btn-compact ${isInlineEditing ? "text-[#8fb9ff]" : ""}`}
                          onClick={() => setInlineDayEditId(isInlineEditing ? undefined : day.id)}
                        >
                          <Pencil className="h-3 w-3" />
                          {isInlineEditing ? "Done" : "Edit"}
                        </button>
                      )}
                      {(session?.status === "review" || session?.status === "in-progress") && (
                        <button
                          className="btn-compact text-[#8fb9ff]"
                          onClick={() => setReviewSessionId(session.id)}
                        >
                          <Timer className="h-3.5 w-3.5" />
                          Review
                        </button>
                      )}
                      {session?.status === "completed" && onResumeWorkout && (
                        <button
                          className="btn-compact"
                          onClick={() => void onResumeWorkout(session.id, {
                            previousScreen: "week",
                            completedReviewState: { sessionId: session.id, returnScreen: "week" },
                            loggerMode: "completed-edit",
                          })}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit Workout
                        </button>
                      )}
                    </div>
                    {isInlineEditing && activeProgram && (
                      <div className="mt-3 border-t border-white/[0.06] pt-3">
                        <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8fb9ff]">Editing exercises for this day</p>
                        <WorkoutDayEditor db={db} user={user} program={activeProgram} day={day} updateDb={updateDb} variant="week" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          {offProgramCompletedSessions.length > 0 && (
            <section className="border-t border-white/[0.06] pt-3">
              <button
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setShowOffProgramHistory((value) => !value)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-iron-200">Off-program history</span>
                  <span className="mt-1 block text-xs text-iron-500">
                    {offProgramCompletedSessions[0]?.name} · {countSessionCompletedSets(offProgramCompletedSessions[0])} sets
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-iron-500 transition ${showOffProgramHistory ? "rotate-180" : ""}`} />
              </button>
              {showOffProgramHistory && (
                <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
                  {offProgramCompletedSessions.map((session) => (
                    <button
                      key={session.id}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-white/[0.03]"
                      onClick={() => onOpenCompletedSessionReview?.(session.id, "week")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-iron-200">{session.name}</span>
                        <span className="text-xs text-iron-500">{new Date(session.completedAt || session.startedAt).toLocaleDateString()} · {countSessionCompletedSets(session)} sets</span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-iron-600" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function findWorkoutDayForSession(db: TrainingDatabase, session: WorkoutSession): WorkoutDay | undefined {
  if (!session.workoutDayId) return undefined;
  return db.programs
    .flatMap((program) => program.blocks)
    .flatMap((block) => block.weeks)
    .flatMap((week) => week.workouts)
    .find((day) => day.id === session.workoutDayId);
}

function getSessionSummary(session: WorkoutSession) {
  const completedSets = session.loggedExercises.flatMap((exercise) => exercise.sets.filter(isCompletedValidSet));
  const hardSets = session.loggedExercises.flatMap((exercise) => exercise.sets.filter(isHardSet)).length;
  const skippedSets = session.loggedExercises.flatMap((exercise) => exercise.sets.filter((set) => set.skipped)).length;
  const avgRpe = safeAverageRpe(completedSets);
  const avgFeel = completedSets.length
    ? Number((completedSets.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / completedSets.length).toFixed(1))
    : 0;
  const score = session.workoutScore ?? (session.status === "completed" ? calculateWorkoutScore(session).score : undefined);
  return {
    completedSets: countSessionCompletedSets(session),
    hardSets,
    skippedSets,
    avgRpe,
    avgFeel,
    score,
  };
}

function getCompactSessionInsight(session: WorkoutSession) {
  const { hardSets, skippedSets, avgFeel, score } = getSessionSummary(session);
  if (skippedSets >= Math.max(3, Math.ceil(hardSets / 2))) return "Skipped volume was high.";
  if (avgFeel >= 3.8) return "Avg feel was high; keep next top sets conservative.";
  if (score !== undefined && score >= 80) return "Matched plan closely.";
  if (score !== undefined && score < 50) return "Recovery looked strained; keep progression conservative.";
  if (hardSets > 0 && skippedSets === 0) return "No major changes needed.";
  return undefined;
}

function SessionReviewHeader({
  eyebrow,
  title,
  session,
  day,
  statusText,
  backLabel,
  onBack,
}: {
  eyebrow: string;
  title: string;
  session: WorkoutSession;
  day?: WorkoutDay;
  statusText: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3">
      <button className="btn-compact -ml-2" onClick={onBack}>
        <ChevronLeft className="h-3.5 w-3.5" />
        {backLabel}
      </button>
      <div>
        <p className="text-xs font-medium text-iron-500">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-iron-400">
          {day ? `${day.scheduledDay || "Day"} · Day ${day.dayIndex || 1} · ${day.focus}` : formatDateTime(session.completedAt || session.updatedAt || session.startedAt)}
        </p>
        <p className="mt-3 text-sm text-iron-300">{statusText}</p>
      </div>
    </div>
  );
}

function CompletedWorkoutReview({
  db,
  user,
  session,
  onBack,
  onEditWorkout,
  onOpenExerciseAnalytics,
  backLabel = "Back"
}: {
  db: TrainingDatabase;
  user: UserProfile;
  session: WorkoutSession;
  onBack: () => void;
  onEditWorkout?: () => void;
  onOpenExerciseAnalytics?: (exerciseId?: string, exerciseName?: string) => void;
  backLabel?: string;
}) {
  const day = findWorkoutDayForSession(db, session);
  const summary = getSessionSummary(session);
  const insight = getCompactSessionInsight(session);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SessionReviewHeader
        eyebrow={session.offProgram ? "Off-Program Review" : "Completed Session Review"}
        title={session.name}
        session={session}
        day={day}
        statusText={`completed · ${summary.hardSets} hard · ${summary.skippedSets} skipped · avg RPE ${summary.avgRpe ? summary.avgRpe.toFixed(1) : "-"}${summary.avgFeel ? ` · avg feel ${summary.avgFeel.toFixed(1)}` : ""}${summary.score ? ` · score ${summary.score}` : ""}`}
        backLabel={backLabel}
        onBack={onBack}
      />

      <section className="border-y border-white/[0.06] py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-iron-300">
          <span>Sets {summary.completedSets}</span>
          <span>Skipped {summary.skippedSets}</span>
          <span>Avg RPE {summary.avgRpe ? summary.avgRpe.toFixed(1) : "-"}</span>
          <span>Avg Feel {summary.avgFeel ? summary.avgFeel.toFixed(1) : "-"}</span>
        </div>
        {insight ? <p className="mt-3 text-xs text-iron-500">{insight}</p> : null}
      </section>

      {session.notes && (
        <section className="border-b border-white/[0.06] pb-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Session notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-iron-300">{session.notes}</p>
        </section>
      )}

      <section>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Exercises</p>
        <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {session.loggedExercises.map((logged) => {
            const exercise = db.exercises.find((item) => item.id === logged.exerciseId);
            const displayUnit = exercise ? getExerciseLoadUnit(exercise, user, logged.sets.find((set) => isWeightUnit(set.unit))?.unit) : user.unit;
            const completedSetCount = logged.sets.filter(isCompletedValidSet).length;
            const hardSetCount = logged.sets.filter(isHardSet).length;
            const skippedSetCount = logged.sets.filter((set) => set.skipped).length;
            const openExerciseAnalytics = () => onOpenExerciseAnalytics?.(logged.exerciseId, exercise?.name || "Exercise");
            return (
              <div key={logged.id} className="py-4">
                <div
                  className={`flex flex-wrap items-start justify-between gap-3 ${onOpenExerciseAnalytics ? "cursor-pointer transition hover:bg-white/[0.03]" : ""}`}
                  onClick={onOpenExerciseAnalytics ? openExerciseAnalytics : undefined}
                  onKeyDown={onOpenExerciseAnalytics ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openExerciseAnalytics();
                    }
                  } : undefined}
                  role={onOpenExerciseAnalytics ? "button" : undefined}
                  tabIndex={onOpenExerciseAnalytics ? 0 : undefined}
                  aria-label={onOpenExerciseAnalytics ? `Open analytics for ${exercise?.name || "exercise"}` : undefined}
                >
                  <div>
                    <p className="text-sm font-medium text-white">{exercise?.name || "Unknown exercise"}</p>
                    <p className="mt-1 text-sm text-iron-400">{completedSetCount} completed sets · {hardSetCount} hard · {skippedSetCount} skipped</p>
                  </div>
                  {onOpenExerciseAnalytics ? <ChevronRight className="h-3.5 w-3.5 text-iron-600" /> : null}
                </div>
                {exercise ? (
                  <LoggedSetsTable logged={logged} exercise={exercise} user={user} displayUnit={displayUnit} />
                ) : (
                  <p className="mt-3 text-sm text-iron-400">Exercise details are unavailable for this logged entry.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        {onEditWorkout && (
          <button className="apollo-primary-btn" onClick={onEditWorkout}>
            <Pencil className="h-4 w-4" />
            Edit Workout
          </button>
        )}
        <button className="apollo-secondary-btn" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}

function ExerciseAnalyticsView({
  db,
  user,
  exercise,
  exerciseId,
  exerciseName,
  contextSession,
  contextDay,
  onBack,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  exercise?: Exercise;
  exerciseId?: string;
  exerciseName?: string;
  contextSession?: WorkoutSession;
  contextDay?: WorkoutDay;
  onBack: () => void;
}) {
  const resolvedExerciseName = exercise?.name || exerciseName || "Exercise";
  const normalizedTargetName = resolvedExerciseName.trim().toLowerCase();
  const matchesExercise = (session: WorkoutSession, logged: LoggedExercise) => {
    if (exerciseId && logged.exerciseId === exerciseId) return true;
    const loggedExerciseName = db.exercises.find((item) => item.id === logged.exerciseId)?.name?.trim().toLowerCase();
    return !!loggedExerciseName && loggedExerciseName === normalizedTargetName;
  };

  const matchingCompletedLogs = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed")
    .flatMap((session) =>
      session.loggedExercises
        .filter((logged) => matchesExercise(session, logged))
        .map((logged) => ({ session, logged }))
    );

  const sampleUnit = matchingCompletedLogs
    .flatMap((item) => item.logged.sets)
    .find((set) => isWeightUnit(set.unit))?.unit;
  const displayUnit = getExerciseDisplayUnit(exercise, user, isWeightUnit(sampleUnit) ? sampleUnit : undefined);

  const allCompletedSets = matchingCompletedLogs
    .flatMap((item) => item.logged.sets.filter(isCompletedValidSet));
  const allSkippedSets = matchingCompletedLogs
    .flatMap((item) => item.logged.sets.filter((set) => set.skipped));
  const avgRpe = safeAverageRpe(allCompletedSets);
  const avgFeel = allCompletedSets.length
    ? Number((allCompletedSets.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / allCompletedSets.length).toFixed(1))
    : 0;
  const hardSets = allCompletedSets.filter(isHardSet).length;

  const historyRows = matchingCompletedLogs
    .flatMap(({ session, logged }) =>
      logged.sets
        .filter(isCompletedValidSet)
        .map((set) => ({
          key: `${session.id}:${logged.id}:${set.id}`,
          date: set.completedAt || session.completedAt || session.startedAt,
          workout: session.name,
          set,
        }))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastPerformed = historyRows[0];
  const historyEntries = collectExerciseHistoryEntries({
    db,
    user,
    exerciseIds: exerciseId ? [exerciseId] : [],
  });
  const chartPoints = historyEntries
    .map((entry) => {
      const displayValues = getEntryDisplayValues(entry, displayUnit);
      return {
        label: entry.label,
        value: displayValues.e1rm || 0,
        date: entry.date,
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const bestRecentE1rm = chartPoints.length ? Math.max(...chartPoints.map((point) => point.value)) : 0;
  const contextLogged = contextSession?.loggedExercises.find((logged) => matchesExercise(contextSession, logged));
  const plannedFromContext = contextDay?.exercises.find((planned) => {
    if (exerciseId && planned.exerciseId === exerciseId) return true;
    const plannedName = db.exercises.find((item) => item.id === planned.exerciseId)?.name?.trim().toLowerCase();
    return !!plannedName && plannedName === normalizedTargetName;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <button className="btn-compact -ml-2" onClick={onBack}>
        <ChevronLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="space-y-1 border-b border-white/[0.06] pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-white">{resolvedExerciseName}</h2>
        {contextDay && (
          <p className="text-sm text-iron-400">
            {contextDay.name} · Week {contextDay.weekNumber ?? "?"} Day {contextDay.dayIndex || 1} · {contextDay.focus}
          </p>
        )}
      </div>

      <section className="border-b border-white/[0.06] pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Planned / current context</p>
        {plannedFromContext || contextLogged ? (
          <>
            {plannedFromContext && (
              <p className="mt-2 text-sm text-iron-300">
                Planned {plannedFromContext.plannedSets.length} sets
                {plannedFromContext.plannedSets[0]?.targetReps ? ` · ${plannedFromContext.plannedSets[0].targetReps} reps` : ""}
                {plannedFromContext.plannedSets[0]?.targetRpe ? ` · RPE ${plannedFromContext.plannedSets[0].targetRpe}` : ""}
              </p>
            )}
            {contextLogged && (
              <p className="mt-1 text-sm text-iron-300">
                Completed sets in selected workout: {contextLogged.sets.filter(isCompletedValidSet).length}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-iron-500">No planned or selected-workout context available.</p>
        )}
      </section>

      <section className="border-b border-white/[0.06] pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Summary stats</p>
        {historyRows.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-iron-300">
            <span>Avg RPE {avgRpe ? avgRpe.toFixed(1) : "-"}</span>
            <span>Avg feel {avgFeel ? avgFeel.toFixed(1) : "-"}</span>
            <span>Hard sets {hardSets}</span>
            <span>Skipped sets {allSkippedSets.length}</span>
            <span>Best recent e1RM {bestRecentE1rm > 0 ? `${formatWeight(bestRecentE1rm, displayUnit)} ${displayUnit}` : "-"}</span>
            <span>
              Last performed {lastPerformed
                ? `${formatExerciseLoadText({ exercise, user, weight: lastPerformed.set.actualWeight, unit: lastPerformed.set.unit || displayUnit })} × ${lastPerformed.set.actualReps}${lastPerformed.set.actualRpe ? ` @ ${lastPerformed.set.actualRpe}` : ""}`
                : "-"}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-iron-500">No exercise history yet.</p>
        )}
      </section>

      <section className="border-b border-white/[0.06] pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Chart</p>
        {chartPoints.length >= 2 ? (
          <div className="mt-3 overflow-hidden border border-white/[0.07] bg-[#0a1018] p-3">
            <ExerciseE1rmChart points={chartPoints.map(({ label, value }) => ({ label, value }))} unit={displayUnit} title="e1RM trend" strokeColor="#0a84ff" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-iron-500">Not enough data yet.</p>
        )}
      </section>

      <section className="border-b border-white/[0.06] pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">History</p>
        {historyRows.length > 0 ? (
          <div className="mt-3 overflow-hidden border border-white/[0.07] bg-[#0a1018]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[0.68rem] text-iron-600">
                    <th className="px-3 py-2 font-medium">Date / workout</th>
                    <th className="px-3 py-2 font-medium">Load</th>
                    <th className="px-3 py-2 font-medium">Reps</th>
                    <th className="px-3 py-2 font-medium">RPE</th>
                    <th className="px-3 py-2 font-medium">Feel</th>
                    <th className="px-3 py-2 font-medium">e1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => {
                    const e1rm = calculateE1RMFromSet(row.set);
                    return (
                      <tr key={row.key} className="border-t border-white/[0.05]">
                        <td className="px-3 py-2 text-iron-300">{new Date(row.date).toLocaleDateString()} · {row.workout}</td>
                        <td className="px-3 py-2 text-iron-200">{formatExerciseLoadText({ exercise, user, weight: row.set.actualWeight, unit: row.set.unit || displayUnit })}</td>
                        <td className="px-3 py-2 text-iron-200">{row.set.actualReps}</td>
                        <td className="px-3 py-2 text-iron-200">{row.set.actualRpe ?? "-"}</td>
                        <td className="px-3 py-2 text-iron-200">{row.set.setRating ? `${row.set.setRating}/5` : "-"}</td>
                        <td className="px-3 py-2 text-iron-200">{e1rm ? `${formatWeight(e1rm, row.set.unit || displayUnit)} ${row.set.unit || displayUnit}` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-iron-500">No history yet.</p>
        )}
      </section>

      {contextLogged && (
        <section>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Selected workout sets</p>
          <div className="mt-3">
            {exercise ? (
              <LoggedSetsTable logged={contextLogged} exercise={exercise} user={user} displayUnit={displayUnit} />
            ) : (
              <div className="overflow-hidden border border-white/[0.07] bg-[#0a1018]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[0.68rem] text-iron-600">
                        <th className="px-3 py-2 font-medium">Set</th>
                        <th className="px-3 py-2 font-medium">Load</th>
                        <th className="px-3 py-2 font-medium">Reps</th>
                        <th className="px-3 py-2 font-medium">RPE</th>
                        <th className="px-3 py-2 font-medium">Feel</th>
                        <th className="px-3 py-2 font-medium">e1RM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contextLogged.sets.map((set, index) => {
                        const e1rm = calculateE1RMFromSet(set);
                        return (
                          <tr key={set.id} className="border-t border-white/[0.05]">
                            <td className="px-3 py-2 text-iron-300">{index + 1}</td>
                            <td className="px-3 py-2 text-iron-200">{set.actualWeight ?? "-"}</td>
                            <td className="px-3 py-2 text-iron-200">{set.actualReps ?? "-"}</td>
                            <td className="px-3 py-2 text-iron-200">{set.actualRpe ?? "-"}</td>
                            <td className="px-3 py-2 text-iron-200">{set.setRating ? `${set.setRating}/5` : "-"}</td>
                            <td className="px-3 py-2 text-iron-200">{e1rm ? `${formatWeight(e1rm, set.unit || displayUnit)} ${set.unit || displayUnit}` : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function InProgressWorkoutReview({
  db,
  user,
  session,
  onBack,
  onContinue,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  session: WorkoutSession;
  onBack: () => void;
  onContinue: () => void;
}) {
  const day = findWorkoutDayForSession(db, session);
  const summary = getSessionSummary(session);
  const plannedExercises = day?.exercises || [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SessionReviewHeader
        eyebrow="In Progress"
        title={session.name}
        session={session}
        day={day}
        statusText={`in progress · ${summary.hardSets} hard · ${summary.skippedSets} skipped · avg RPE ${summary.avgRpe ? summary.avgRpe.toFixed(1) : "-"}${summary.avgFeel ? ` · avg feel ${summary.avgFeel.toFixed(1)}` : ""}`}
        backLabel="Back to Week"
        onBack={onBack}
      />

      <div className="border-b border-white/[0.06] pb-4">
        <button className="apollo-primary-btn w-full sm:w-auto" onClick={onContinue}>
          <Timer className="h-4 w-4" />
          Continue workout
        </button>
      </div>

      <section className="border-b border-white/[0.06] pb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Workout</p>
        <p className="mt-2 text-sm text-iron-300">{plannedExercises.length} exercises · {plannedExercises.reduce((sum, planned) => sum + planned.plannedSets.length, 0)} planned sets</p>
      </section>

      <button className="apollo-secondary-btn" onClick={onBack}>Back to Week</button>

      <section>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">Exercises</p>
        <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {plannedExercises.map((planned) => {
            const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
            const logged = session.loggedExercises.find((item) => item.exerciseId === planned.exerciseId);
            const displayUnit = exercise ? getExerciseDisplayUnit(exercise, user) : user.unit;
            const plannedWeightText = getPlannedExerciseBadgeText({
              exercise,
              displayUnit,
              plannedWeight: planned.plannedSets[0]?.plannedWeight,
            });
            return (
              <div key={planned.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{exercise?.name || "Unknown exercise"}</p>
                    <p className="mt-1 text-sm text-iron-400">
                      {planned.plannedSets.length} sets · {planned.plannedSets[0]?.targetReps || 8} reps · RPE {planned.plannedSets[0]?.targetRpe || 7}
                    </p>
                    <p className="mt-1 text-sm text-iron-300">
                      {logged
                        ? `${logged.sets.filter(isCompletedValidSet).length} completed · ${logged.sets.filter(isCompletedValidSet).length}/${planned.plannedSets.length} planned`
                        : `0 completed · 0/${planned.plannedSets.length} planned`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-iron-400">{plannedWeightText || "—"}</span>
                </div>
                {logged && exercise ? <LoggedSetsTable logged={logged} exercise={exercise} user={user} displayUnit={displayUnit} /> : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function WeekReviewPanel({
  block,
  sessions,
  onPlanNextWeek,
  onReviewBlock,
  onArchiveBlock,
  onRepeatBlock,
  onStartNewBlock,
}: {
  block: TrainingBlock;
  sessions: WorkoutSession[];
  onPlanNextWeek?: () => void;
  onReviewBlock?: () => void;
  onArchiveBlock?: () => void;
  onRepeatBlock?: () => void;
  onStartNewBlock?: () => void;
}) {
  const review = generateWeekReview(block, sessions);
  const [confirmed, setConfirmed] = useState(false);
  const isFinalWeek = review.weekNumber >= review.totalWeeks;

  return (
    <div className="border-y border-[#0a84ff]/20 bg-[#0a84ff]/[0.04] px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4.5 w-4.5 text-[#8fb9ff]" />
        <p className="text-sm font-semibold tracking-[-0.01em] text-[#8fb9ff]">Week {review.weekNumber} complete</p>
        {review.totalWeeks > 0 && <span className="text-xs text-iron-500">({review.weekNumber}/{review.totalWeeks})</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-iron-500">Completed</p>
          <p className="mt-1 text-sm font-medium text-iron-100">{review.completedWorkouts} / {review.plannedWorkouts}</p>
        </div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-iron-500">Skipped</p>
          <p className="mt-1 text-sm font-medium text-iron-100">{review.skippedWorkouts}</p>
        </div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-iron-500">Hard sets</p>
          <p className="mt-1 text-sm font-medium text-iron-100">{review.hardSetsCompleted}</p>
        </div>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-iron-500">Avg RPE</p>
          <p className="mt-1 text-sm font-medium text-iron-100">{review.averageRpe ? review.averageRpe.toFixed(1) : "-"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-3 text-sm">
        <span className="text-iron-300">Avg feel {review.averageSetRating ? review.averageSetRating.toFixed(1) : "-"}/5</span>
        {review.averageReadiness !== null && <span className="text-iron-400">Avg readiness {review.averageReadiness.toFixed(0)}/10</span>}
      </div>
      {review.suggestions.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-iron-500">Next week notes</p>
          {review.suggestions.map((suggestion) => (
            <p key={suggestion} className="mt-1 text-sm text-iron-300">{suggestion}</p>
          ))}
          <p className="mt-2 text-xs text-iron-500">Suggestions only. Nothing changes automatically.</p>
        </div>
      )}
      {isFinalWeek ? (
        <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
          <div>
            <p className="text-sm font-semibold text-iron-100">Block complete.</p>
            <p className="mt-1 text-sm text-iron-400">There is no Week {review.weekNumber + 1} in this block. Review it, archive it, repeat it, or start a new one.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {onReviewBlock && <button className="btn-secondary w-full" onClick={onReviewBlock}>Review Block</button>}
            {onArchiveBlock && <button className="btn-secondary w-full" onClick={onArchiveBlock}>Archive Block / Finish Block</button>}
            {onRepeatBlock && <button className="btn-secondary w-full" onClick={onRepeatBlock}>Repeat Block</button>}
            {onStartNewBlock && <button className="btn-primary w-full" onClick={onStartNewBlock}>Start New Block</button>}
          </div>
        </div>
      ) : !confirmed ? (
        <div className="mt-4 grid gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
          <button className="btn-primary w-full" onClick={() => setConfirmed(true)}>
            Start Week {review.weekNumber + 1}
          </button>
          {onPlanNextWeek ? (
            <button className="btn-secondary w-full" onClick={onPlanNextWeek}>
              Plan Week {review.weekNumber + 1}
            </button>
          ) : (
            <button className="btn-secondary w-full cursor-not-allowed opacity-60" disabled title="Open the Week tab to plan the next week">
              Plan Week {review.weekNumber + 1}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
          <div>
            <p className="text-sm font-semibold text-iron-100">Ready to go.</p>
            <p className="mt-1 text-sm text-iron-400">Head to Today to begin your next training day. The block will advance automatically when you start your first session of Week {review.weekNumber + 1}.</p>
          </div>
          {onPlanNextWeek && (
            <button className="btn-secondary w-full" onClick={onPlanNextWeek}>
              Plan Week {review.weekNumber + 1}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressScreen({ db, user, updateDb }: { db: TrainingDatabase; user: UserProfile; updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void> }) {
  const metrics = powerliftingMetrics(db, user);
  const weekly = summarizeWeek(db, user);
  const topSets = recentTopSets(db.sessions, user.id);
  const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const recentSessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed" && new Date(s.startedAt).getTime() >= sevenDaysAgo);
  const weeklyHardSets = recentSessions.flatMap((s) => s.loggedExercises).flatMap((log) => log.sets.filter((set) => !set.skipped && set.kind !== "warmup"));
  const weeklyAvgRpe = safeAverageRpe(weeklyHardSets);
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Progress" title="Strength, hypertrophy, recovery, and program gaps." />
      <section className="grid gap-4 lg:grid-cols-4">
        {metrics.map((metric) => <Metric key={metric.id} label={metric.label} value={metric.value} unit={metric.unit} />)}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Bodybuilding Dashboard" icon={BarChart3}>
          <BodybuildingDashboard db={db} user={user} program={activeProgram} />
        </Panel>
        <Panel title="Exercise History" icon={ClipboardList}>
          <div className="space-y-2">
            {topSets.map(({ exerciseId, set }) => {
              const exercise = db.exercises.find((item) => item.id === exerciseId);
              const loadText = formatExerciseLoadText({ exercise, user, weight: set.actualWeight, unit: set.unit || user.unit });
              const e1rm = estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10);
              return (
                <div key={set.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{exercise?.name}</p>
                    <p className="text-xs text-iron-500">{loadText} × {set.actualReps} @ RPE {set.actualRpe || "?"}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-volt/80">{e1rm > 0 ? `${e1rm} e1RM` : "BW"}</p>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Weekly Review" icon={ClipboardList}>
          <Metric label="Completed" value={weekly.completedWorkouts} unit="workouts" />
          <Metric label="Sets logged" value={weeklyHardSets.length} />
          <Metric label="Avg RPE" value={weeklyAvgRpe ? weeklyAvgRpe.toFixed(1) : "-"} />
        </Panel>
        <ProgramGapPanel db={db} user={user} program={activeProgram} updateDb={updateDb} />
      </section>
    </div>
  );
}

function BodybuildingDashboard({
  db,
  user,
  program,
  compact = false
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program?: Program;
  compact?: boolean;
}) {
  const data = buildHypertrophyDashboard(program, db);
  const loggedVolume = calculateMuscleVolume(db.sessions, db.exercises, user.id);
  const volume = Object.keys(data.weeklyVolume).length ? data.weeklyVolume : loggedVolume;
  const topMuscles = Object.entries(volume).sort((a, b) => b[1] - a[1]).slice(0, compact ? 6 : 12);
  const recentProgression = recentTopSets(db.sessions, user.id).slice(0, 5);
  const block = program?.blocks[0];
  const currentWeek = block?.weeks.find((week) => week.weekNumber === block.currentWeek) || block?.weeks[0];
  const previousWeek = block?.weeks.find((week) => week.weekNumber === (currentWeek?.weekNumber || 1) - 1);
  const weekSetCount = (week?: typeof currentWeek) => week?.workouts.reduce((sum, day) => sum + day.exercises.reduce((daySum, exercise) => daySum + exercise.plannedSets.length, 0), 0) || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Block goal" value={data.blockGoal} />
        <Metric label="Under target" value={data.underTarget.length} unit="muscles" />
        {!compact && <Metric label="Current week" value={weekSetCount(currentWeek)} unit="sets" />}
        {!compact && <Metric label="Previous week" value={previousWeek ? weekSetCount(previousWeek) : "-"} unit={previousWeek ? "sets" : undefined} />}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label">Weekly sets by muscle</p>
          <p className="text-xs text-iron-500">planned active week</p>
        </div>
        {topMuscles.length ? <VolumeBars volume={Object.fromEntries(topMuscles) as Partial<Record<MuscleGroup, number>>} /> : <EmptyState title="No hypertrophy volume yet" detail="Generate a block or log sessions to populate volume." />}
      </div>
      {!compact && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-white/[0.05] p-3">
              <p className="label mb-2">Frequency</p>
              <div className="space-y-2">
                {Object.entries(data.frequency).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([muscle, count]) => (
                  <div key={muscle} className="flex justify-between text-sm"><span>{muscle}</span><span className="font-bold text-volt">{count}x</span></div>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.05] p-3">
              <p className="label mb-2">Volume flags</p>
              <div className="space-y-2 text-sm">
                {data.underTarget.slice(0, 5).map((item) => <p key={item.muscle}>{item.muscle}: {item.sets.toFixed(1)} / {item.target}+ sets</p>)}
                {data.overTarget.slice(0, 3).map((item) => <p key={item.muscle} className="text-orange-100">{item.muscle}: over {item.target} sets</p>)}
                {!data.underTarget.length && !data.overTarget.length && <p className="text-iron-400">No obvious target-volume flags.</p>}
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.05] p-3">
            <p className="label mb-2">Exercise distribution</p>
            <div className="space-y-2">
              {data.exerciseDistribution.slice(0, 8).map((item) => (
                <p key={item.muscle} className="text-sm"><span className="font-bold text-white">{item.muscle}</span>: <span className="text-iron-300">{item.exercises.join(", ")}</span></p>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.05] p-3">
            <p className="label mb-2">Suggested adjustments</p>
            <div className="space-y-2">
              {[...data.fatigueWarnings, ...data.suggestedAdjustments].slice(0, 5).map((item) => (
                <p key={item} className="text-sm text-iron-200">{item}</p>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.05] p-3">
            <p className="label mb-2">Recent progression</p>
            <div className="space-y-2">
              {recentProgression.map(({ exerciseId, set }) => {
                const exercise = db.exercises.find((item) => item.id === exerciseId);
                return <p key={set.id} className="text-sm text-iron-200">{exercise?.name}: {formatExerciseLoadText({ exercise, user, weight: set.actualWeight, unit: set.unit || user.unit })} × {set.actualReps} @ RPE {set.actualRpe || "?"}</p>;
              })}
              {!recentProgression.length && <p className="text-sm text-iron-400">Log completed sessions to see exercise progression.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProgramGapCard({ gap, db, compact = false }: { gap: ProgramGap; db: TrainingDatabase; compact?: boolean }) {
  const exercise = gap.action?.exerciseId ? db.exercises.find((item) => item.id === gap.action?.exerciseId) : undefined;
  return (
    <div className={`rounded-lg border p-3 ${
      gap.severity === "high" ? "border-ember/30 bg-ember/[0.07]" : gap.severity === "moderate" ? "border-amber-500/20 bg-amber-500/[0.05]" : "border-white/[0.07] bg-white/[0.03]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{gap.issue}</p>
          <p className="mt-0.5 text-xs text-iron-500">{gap.severity} · {gap.type}</p>
        </div>
      </div>
      {!compact && <p className="mt-2 text-sm text-iron-300">{gap.whyItMatters}</p>}
      <p className="mt-2 text-sm text-white">{gap.suggestedFix}</p>
      {exercise && !compact && <p className="mt-2 text-xs text-volt">Action available: add {exercise.name}</p>}
    </div>
  );
}

function SettingsScreen({
  db,
  user,
  updateDb,
  importDb,
  reseed,
  cloud,
  authMode,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  importDb: (db: TrainingDatabase) => Promise<void>;
  reseed: () => Promise<void>;
  authMode: "unknown" | "local" | "cloud";
  cloud: {
    configured: boolean;
    session: { user: { email?: string } } | null;
    status: "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed";
    message: string;
    lastSyncedAt?: string;
    lastError?: string;
    userEmail?: string;
    localOnlySummary?: SnapshotSummary;
    hasMeaningfulLocalOnlyData: boolean;
    importLocalIntoCloud: (action: "merge" | "replace") => Promise<boolean>;
    syncNow: () => Promise<boolean>;
    signIn: (email: string, password: string) => Promise<unknown>;
    signOut: () => Promise<void>;
    signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  };
}) {
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | undefined>();
  const [authError, setAuthError] = useState<string | undefined>();
  const [authLoading, setAuthLoading] = useState<"signup" | "signin" | "sync" | "signout" | "import-merge" | "import-replace" | undefined>();
  const [showImportLocalActions, setShowImportLocalActions] = useState(false);

  function exportJson(name: string, data: TrainingDatabase) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = JSON.parse(String(reader.result)) as TrainingDatabase;
      void importDb(parsed);
    };
    reader.readAsText(file);
  }

  async function handleSignUp() {
    setAuthLoading("signup");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      const result = await cloud.signUp(authEmail, authPassword);
      setAuthMessage(
        result.needsEmailConfirmation
          ? "Check your email to confirm your account before signing in."
          : "Account created and connected."
      );
      if (!result.needsEmailConfirmation) {
        setAuthPassword("");
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setAuthLoading("signin");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      await cloud.signIn(authEmail, authPassword);
      setAuthMessage("Signed in. Cloud sync is active for this device.");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  async function handleSignOut() {
    setAuthLoading("signout");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      await cloud.signOut();
      setAuthMessage("Signed out. Local mode is still active.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign-out failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  async function handleSyncNow() {
    setAuthLoading("sync");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      const ok = await cloud.syncNow();
      setAuthMessage(ok ? "Sync complete." : "Cloud sync is unavailable until you sign in.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Manual sync failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  async function handleImportLocalIntoCloud(action: "merge" | "replace") {
    setAuthLoading(action === "merge" ? "import-merge" : "import-replace");
    setAuthError(undefined);
    setAuthMessage(undefined);
    try {
      const ok = await cloud.importLocalIntoCloud(action);
      setAuthMessage(
        ok
          ? action === "merge"
            ? "Local-only data was added into the cloud account."
            : "Cloud account was replaced with the local-only data."
          : "No local-only data was imported."
      );
      if (ok) setShowImportLocalActions(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Import into cloud failed.");
    } finally {
      setAuthLoading(undefined);
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Settings" title="Profile, backup, and local app controls." />
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile" icon={UserRound}>
          <div className="grid gap-3">
            <TextField label="Display name" value={user.displayName} onChange={(displayName) => updateDb((draft) => {
              const target = draft.users.find((item) => item.id === user.id);
              if (target) target.displayName = displayName;
              return draft;
            })} />
            <SelectField label="Units" value={user.unit} options={["lb", "kg"]} onChange={(unit) => updateDb((draft) => {
              const target = draft.users.find((item) => item.id === user.id);
              if (target) target.unit = unit as "lb" | "kg";
              return draft;
            })} />
          </div>
        </Panel>
        <Panel title="Cloud Sync" icon={RefreshCcw}>
          <div className="space-y-3">
            <div className="rounded-lg bg-iron-900/50 p-3 text-sm">
              <p className="font-semibold text-iron-100">{renderCloudStatusLabel(cloud.status)}</p>
              <p className="mt-1 text-iron-400">{cloud.message}</p>
              <div className="mt-2 space-y-0.5 text-xs text-iron-500">
                <p>Mode: {authMode === "cloud" ? "Cloud account" : "Local only"}</p>
                <p>Account: {cloud.userEmail || "Not signed in"}</p>
                <p>Last synced: {formatDateTime(cloud.lastSyncedAt)}</p>
              </div>
              {cloud.lastError && <p className="mt-2 rounded-lg border border-ember/30 bg-ember/10 p-2 text-xs text-orange-100">{cloud.lastError}</p>}
            </div>

            {authMode !== "cloud" ? (
              <form className="space-y-3" onSubmit={handleSignIn}>
                <TextField label="Email" type="email" value={authEmail} onChange={setAuthEmail} />
                <TextField label="Password" type="password" value={authPassword} onChange={setAuthPassword} />
                {authMessage && <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">{authMessage}</p>}
                {authError && <p className="rounded-lg border border-ember/30 bg-ember/10 p-3 text-xs text-orange-100">{authError}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="btn-primary w-full" type="submit" disabled={authLoading !== undefined || !authEmail || !authPassword}>
                    <UserRound className="h-4 w-4" />
                    {authLoading === "signin" ? "Signing In..." : "Sign In"}
                  </button>
                  <button className="btn-secondary w-full" type="button" disabled={authLoading !== undefined || !authEmail || !authPassword} onClick={() => void handleSignUp()}>
                    <Plus className="h-4 w-4" />
                    {authLoading === "signup" ? "Creating..." : "Sign Up"}
                  </button>
                </div>
                <p className="text-xs text-iron-500">If email confirmation is enabled in Supabase, confirm your email before trying to sign in. Local-only data stays on this device until you explicitly import it.</p>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="btn-primary w-full" onClick={() => void handleSyncNow()} disabled={authLoading !== undefined || cloud.status === "disabled"}>
                    <RefreshCcw className="h-4 w-4" />
                    {authLoading === "sync" ? "Syncing..." : "Sync Now"}
                  </button>
                  <button className="btn-secondary w-full" onClick={() => void handleSignOut()} disabled={authLoading !== undefined}>
                    <LogOut className="h-4 w-4" />
                    {authLoading === "signout" ? "Signing Out..." : "Sign Out"}
                  </button>
                </div>

                <div className="rounded-lg border border-white/10 bg-iron-950/50 p-3 text-sm">
                  <p className="font-bold text-white">Import local-only data into this cloud account</p>
                  <p className="mt-1 text-iron-300">This is the only path that moves local-only data into your Supabase account. It never runs automatically.</p>
                  {cloud.localOnlySummary ? (
                    <div className="mt-3">
                      <SnapshotSummaryCard title="Local-only data on this device" tone="local" summary={cloud.localOnlySummary} />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-iron-500">No local-only summary is available on this device yet.</p>
                  )}
                  {cloud.hasMeaningfulLocalOnlyData ? (
                    <div className="mt-3 space-y-2">
                      {!showImportLocalActions ? (
                        <button className="btn-secondary w-full" onClick={() => setShowImportLocalActions(true)} disabled={authLoading !== undefined}>
                          <Copy className="h-4 w-4" />
                          Import Local Data Into Cloud
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <p className="rounded-lg border border-ember/30 bg-ember/10 p-3 text-xs text-orange-100">Warning: this changes the cloud account. Merge is safer. Replace fully overwrites the cloud snapshot with the local-only data from this device.</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <button className="btn-primary w-full" onClick={() => void handleImportLocalIntoCloud("merge")} disabled={authLoading !== undefined}>
                              <Copy className="h-4 w-4" />
                              {authLoading === "import-merge" ? "Merging..." : "Add / Merge"}
                            </button>
                            <button className="btn-secondary w-full border-ember/40 text-orange-100" onClick={() => void handleImportLocalIntoCloud("replace")} disabled={authLoading !== undefined}>
                              <Save className="h-4 w-4" />
                              {authLoading === "import-replace" ? "Replacing..." : "Replace Cloud"}
                            </button>
                            <button className="btn-secondary w-full" onClick={() => setShowImportLocalActions(false)} disabled={authLoading !== undefined}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-iron-500">There is no meaningful local-only data on this device to import right now.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Backup" icon={FileDown}>
          <div className="space-y-3">
            <p className="text-xs text-iron-500">Data stays on this device until you sync or export. Export/import is the manual bridge between local and cloud.</p>
            <button
              className="btn-primary w-full"
              onClick={() => exportJson(
                authMode === "cloud" ? `iron-orbit-cloud-backup-${todayIso()}.json` : `iron-orbit-local-backup-${todayIso()}.json`,
                db
              )}
            >
              <FileDown className="h-4 w-4" />
              {authMode === "cloud" ? "Export Cloud Backup" : "Export Local Backup"}
            </button>
            <label className="btn-secondary w-full cursor-pointer">
              <FileUp className="h-4 w-4" />
              {authMode === "cloud" ? "Import Backup Into Current Cloud Cache" : "Import Backup Into Local Mode"}
              <input className="hidden" type="file" accept="application/json" onChange={(event) => importJson(event.target.files?.[0])} />
            </label>
            <button className="btn-secondary w-full border-ember/40 text-orange-100" onClick={() => {
              if (confirm("Reset local database to seed data?")) void reseed();
            }}>
              <RefreshCcw className="h-4 w-4" />
              Reset Seed Data
            </button>
          </div>
        </Panel>
      </section>
      <section className="grid gap-4">
        <DataManagementPanel db={db} user={user} updateDb={updateDb} importDb={importDb} />
      </section>
      <LoadingProfilesPanel db={db} user={user} updateDb={updateDb} />
    </div>
  );
}

function ReadinessCard({
  draft,
  onDraftChange,
  onSubmit,
}: {
  draft: ReadinessFormDraft;
  onDraftChange: Dispatch<SetStateAction<ReadinessFormDraft>>;
  onSubmit: (input: Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">) => void;
  user: UserProfile;
}) {
  const score = calculateReadinessScore(draft);
  return (
    <section className="border-b border-white/[0.06] pb-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="label">Readiness Check-In</p>
          <p className="mt-0.5 text-sm font-semibold text-iron-200">Score: {score}/100</p>
        </div>
        <Activity className="h-5 w-5 text-[#0a84ff]/60" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["sleepQuality", "stress", "soreness", "motivation", "energy", "jointPain", "nutritionQuality"] as const).map((key) => (
          <SmallRating key={key} label={key.replace(/([A-Z])/g, " $1")} value={String(draft[key])} onChange={(value) => onDraftChange((current) => ({ ...current, [key]: Number(value) }))} />
        ))}
        <BigInput label="Bodyweight" value={draft.bodyweight ? String(draft.bodyweight) : ""} onChange={(value) => onDraftChange((current) => ({ ...current, bodyweight: Number(value) || 0 }))} />
      </div>
      <textarea className="field mt-3 min-h-16" placeholder="Pain, limitations, travel, low sleep, etc." value={draft.limitations} onChange={(event) => onDraftChange((current) => ({ ...current, limitations: event.target.value }))} />
      <button className="tap-highlight mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0a84ff] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.97] disabled:opacity-50" onClick={() => onSubmit({ ...draft, bodyweight: draft.bodyweight || undefined })}>Save Check-In</button>
    </section>
  );
}

function WorkoutDayView({ db, user, day }: { db: TrainingDatabase; user: UserProfile; day?: WorkoutDay }) {
  if (!day) return <EmptyState title="No workout selected" detail="Create a program or template to start logging." />;
  return (
    <section className="list-section">
      <p className="list-section-header">Workout plan</p>
      <div>
        {day.exercises.map((planned, index) => {
          const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
          const latestHistory = getLatestExercisePerformanceLog(db, user.id, planned.exerciseId);
          const displayUnit = getExerciseDisplayUnit(
            exercise,
            user,
            isWeightUnit(latestHistory?.unit) ? latestHistory.unit : undefined,
          );
          const recommendation = getExerciseRecommendation({
            db,
            user,
            exercise,
            plannedSet: planned.plannedSets[0],
            goal: user.goal,
            gymId: user.activeGymId,
          });
          const recentHistory = getLatestExercisePreviewHistory(db, user, exercise, displayUnit);
          const badgeText = getPlannedExerciseBadgeText({
            exercise,
            displayUnit,
            recommendationWeight: recommendation?.recommendedWeight,
            plannedWeight: planned.plannedSets[0]?.plannedWeight,
          });
          const previewReasonParts = recommendation?.reasonParts.filter((part) => !part.startsWith("Recent:")) || [];
          return (
            <div key={planned.id}>
              {index > 0 && <div className="list-divider" />}
              <div className="flex items-start justify-between gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-iron-100">{exercise?.name}</p>
                  <p className="mt-0.5 text-xs text-iron-500">
                    {planned.plannedSets.length} × {planned.plannedSets[0]?.targetReps} @ {planned.plannedSets[0]?.targetRpe}
                    {planned.exerciseRole && <span className="ml-1.5 text-iron-600">{planned.exerciseRole.replaceAll("_", " ")}</span>}
                    {planned.fatigueTag === "high" && <span className="ml-1.5 text-amber-400/70">high fatigue</span>}
                  </p>
                  {(recentHistory?.reps || recommendation?.recommendedWeight) && (
                    <p className="mt-0.5 text-xs text-iron-600">
                      {recentHistory?.reps
                        ? `Recent: ${formatExerciseLoadText({ exercise, user, weight: recentHistory.weight, unit: displayUnit, bodyweightEmptyLabel: "BW" })} × ${recentHistory.reps}${recentHistory.rpe ? ` @ ${recentHistory.rpe}` : ""}`
                        : previewReasonParts[0] || ""}
                    </p>
                  )}
                  {planned.notes && <p className="mt-0.5 text-xs text-iron-600">{planned.notes}</p>}
                </div>
                {badgeText && (
                  <span className="shrink-0 text-xs font-medium text-volt/80">
                    {badgeText}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LoggedSetsTable({ logged, exercise, user, displayUnit }: { logged: LoggedExercise; exercise: Exercise; user: UserProfile; displayUnit?: UnitPreference }) {
  const unit = displayUnit || getExerciseLoadUnit(exercise, user);
  const bodyweightMovement = isBodyweightExercise(exercise);
  if (!logged.sets.length) return null;
  return (
    <section className="overflow-hidden border-t border-white/[0.06] pt-3">
      <p className="pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">
        Set log
        <span className="ml-1 font-normal text-iron-600">
          · {logged.sets.filter(isHardSet).length} hard · {logged.sets.filter(s => s.skipped).length} skipped
        </span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[0.68rem] uppercase tracking-[0.08em] text-iron-600">
              <th className="pb-2 pr-4 font-medium">Set</th>
              <th className="pb-2 pr-4 font-medium">{bodyweightMovement ? "Load" : `Load (${unit})`}</th>
              <th className="pb-2 pr-4 font-medium">Reps</th>
              <th className="pb-2 pr-4 font-medium">RPE</th>
              <th className="pb-2 pr-4 font-medium">Feel</th>
              <th className="pb-2 font-medium">e1RM</th>
            </tr>
          </thead>
          <tbody>
            {logged.sets.map((set, index) => (
              <tr key={set.id} className={`border-t border-white/[0.05] ${set.skipped ? "opacity-40" : ""}`}>
                <td className="py-2 pr-4 text-iron-300">{index + 1}{set.skipped ? " ↷" : ""}</td>
                <td className="py-2 pr-4 text-iron-200">{set.skipped ? "—" : formatExerciseLoadText({ exercise, user, weight: set.actualWeight, unit: set.unit || unit })}</td>
                <td className="py-2 pr-4 text-iron-200">{set.skipped ? "—" : set.actualReps}</td>
                <td className="py-2 pr-4 text-iron-200">{set.skipped ? "—" : set.actualRpe || "—"}</td>
                <td className="py-2 pr-4 text-iron-200">{set.skipped ? "—" : `${set.setRating}/5`}</td>
                <td className="py-2 text-iron-200">{set.skipped ? "—" : estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function finishWorkoutInDraft(draft: TrainingDatabase, user: UserProfile, target: WorkoutSession): void {
  const completedAt = nowIso();
  const targetProgram = draft.programs.find((program) => program.id === target.programId);
  const targetBlock = targetProgram?.blocks.find((block) => block.id === target.blockId) || targetProgram?.blocks[0];
  target.status = "completed";
  target.completedAt = target.completedAt || completedAt;
  target.updatedAt = completedAt;
  target.currentExerciseIndex = Math.max(0, target.loggedExercises.length - 1);
  target.currentSetIndex = target.loggedExercises.at(-1)?.sets.length || 0;

  const workoutScore = calculateWorkoutScore(target);
  const nextSuggestions = recommendNextWorkoutAdjustments(target, targetBlock);
  target.workoutScore = workoutScore.score;
  target.workoutScoreStatus = workoutScore.status;
  target.progressionSuggestions = Array.from(new Set([...workoutScore.suggestions, ...nextSuggestions]));

  draft.exercisePerformanceLogs = (draft.exercisePerformanceLogs || []).filter((log) => log.sessionId !== target.id);
  target.loggedExercises.forEach((logged) => {
    const validSets = logged.sets.filter(isCompletedValidSet);
    if (!validSets.length) return;
    const totalReps = validSets.reduce((sum, set) => sum + set.actualReps, 0);
    const averageSetRating = Number((validSets.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / validSets.length).toFixed(1));
    const exercise = draft.exercises.find((item) => item.id === logged.exerciseId);
    draft.exercisePerformanceLogs?.push({
      id: createId("elog"),
      exerciseId: logged.exerciseId,
      userId: user.id,
      sessionId: target.id,
      date: target.completedAt || completedAt,
      gymId: target.gymId,
      workoutDayId: target.workoutDayId,
      blockId: target.blockId,
      blockWeek: target.weekNumber,
      sets: validSets.length,
      reps: totalReps,
      weight: Math.max(...validSets.map((set) => set.actualWeight)),
      e1rm: calculateSessionExerciseE1RM(logged) || undefined,
      averageSetRating,
      unit: validSets.find((set) => isWeightUnit(set.unit))?.unit || exercise?.defaultUnit || user.unit,
      rpe: safeAverageRpe(validSets) || undefined,
      notes: logged.notes
    });
  });

  if (targetBlock) {
    advanceActiveBlockAfterWorkoutCompletion(
      targetBlock,
      target,
      draft.sessions.filter((session) => session.id !== target.id && session.userId === user.id && session.blockId === targetBlock.id)
    );
    if (targetProgram) targetProgram.updatedAt = completedAt;
  }
}

function clonePlannedExerciseSnapshot(planned: PlannedExercise): PlannedExercise {
  return structuredClone(planned);
}

function RestTimer({ seconds, setSeconds }: { seconds: number; setSeconds: Dispatch<SetStateAction<number>> }) {
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const id = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(id);
  }, [seconds, setSeconds]);

  return (
    <button className="btn-secondary" onClick={() => setSeconds(seconds > 0 ? Math.max(0, seconds - 30) : 90)}>
      <Timer className="h-4 w-4" />
      {seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Rest"}
    </button>
  );
}

function findLivePlannedExercise(db: TrainingDatabase, session?: WorkoutSession, log?: LoggedExercise): PlannedExercise | undefined {
  if (!session || !log?.plannedExerciseId) return undefined;
  const template = db.workoutTemplates.find((item) => item.id === session.templateId);
  const templatePlanned = template?.days.flatMap((day) => day.exercises).find((item) => item.id === log.plannedExerciseId);
  if (templatePlanned) return templatePlanned;
  return db.programs
    .flatMap((program) => program.blocks)
    .flatMap((block) => block.weeks)
    .flatMap((week) => week.workouts)
    .flatMap((day) => day.exercises)
    .find((item) => item.id === log.plannedExerciseId);
}

function findPlannedExercise(db: TrainingDatabase, session?: WorkoutSession, log?: LoggedExercise): PlannedExercise | undefined {
  if (!session || !log) return undefined;
  if (log.plannedExerciseSnapshot) return log.plannedExerciseSnapshot;
  return findLivePlannedExercise(db, session, log);
}

function emptySetDraft(planned?: PlannedSet | null, last?: LoggedSet, draftKey = "") {
  // Weight carryover priority:
  // 1) actual performed weight from the last set (strongest signal — user just did this)
  // 2) explicit planned/recommended weight for the target set
  // 3) blank
  const lastActual = isCompletedValidSet(last) && last.actualWeight > 0 ? last.actualWeight : undefined;
  const defaultWeight = lastActual !== undefined
    ? String(lastActual)
    : planned?.plannedWeight !== undefined
      ? String(planned.plannedWeight)
      : "";
  return {
    draftKey,
    kind: planned?.kind || "working" as SetKind,
    actualWeight: defaultWeight,
    actualReps: String(planned?.targetReps ?? (isCompletedValidSet(last) ? last.actualReps : "") ?? ""),
    actualRpe: String(planned?.targetRpe ?? last?.targetRpe ?? ""),
    setRating: 3 as SetRating,
    formRating: "4",
    muscleFeelRating: "4",
    pumpRating: "3",
    painRating: "0",
    sorenessRating: "2",
    notes: ""
  };
}

function draftFromSetOrPlan(actual: LoggedSet | undefined, planned: PlannedSet | undefined, last: LoggedSet | undefined, draftKey: string) {
  if (!actual) return emptySetDraft(planned, last, draftKey);
  return {
    draftKey,
    kind: actual.kind || planned?.kind || "working" as SetKind,
    actualWeight: actual.skipped ? String(planned?.plannedWeight ?? (isCompletedValidSet(last) ? last.actualWeight : "") ?? "") : String(actual.actualWeight || ""),
    actualReps: actual.skipped ? String(planned?.targetReps ?? "") : String(actual.actualReps || ""),
    actualRpe: actual.skipped ? String(planned?.targetRpe ?? "") : String(actual.actualRpe || ""),
    setRating: actual.skipped ? 3 as SetRating : actual.setRating ?? 3 as SetRating,
    formRating: String(actual.formRating ?? 4),
    muscleFeelRating: String(actual.muscleFeelRating ?? 4),
    pumpRating: String(actual.pumpRating ?? 3),
    painRating: String(actual.painRating ?? 0),
    sorenessRating: String(actual.sorenessRating ?? 2),
    notes: actual.skipped ? actual.notes?.replace(/^Skipped set\.?$/, "") || "" : actual.notes || ""
  };
}

function buildDraftFromSet(params: {
  actualSet?: LoggedSet;
  plannedSet?: PlannedSet | null;
  previousCompletedSet?: LoggedSet;
  draftKey: string;
}): ReturnType<typeof emptySetDraft> {
  const { actualSet, plannedSet, previousCompletedSet, draftKey } = params;
  if (actualSet) {
    return draftFromSetOrPlan(actualSet, plannedSet ?? undefined, previousCompletedSet, draftKey);
  }
  return emptySetDraft(plannedSet, previousCompletedSet, draftKey);
}

function draftMatchesRecommendation(params: {
  draft: { actualWeight: string; actualReps: string; actualRpe: string };
  recommendation?: Recommendation;
  increment: number;
}): boolean {
  const { draft, recommendation, increment } = params;
  if (!recommendation?.action?.suggestedWeight) return false;
  const currentDraftWeight = Number(draft.actualWeight) || 0;
  if (currentDraftWeight <= 0 || isMeaningfulWeightChange(currentDraftWeight, recommendation.action.suggestedWeight, increment)) {
    return false;
  }
  const suggestedReps = recommendation.action.suggestedReps;
  const suggestedRpe = recommendation.action.suggestedRpe;
  const currentDraftReps = Number(draft.actualReps) || 0;
  const currentDraftRpe = Number(draft.actualRpe) || 0;
  const repsMatch = !suggestedReps || currentDraftReps > 0 && currentDraftReps === suggestedReps;
  const rpeMatch = !suggestedRpe || currentDraftRpe > 0 && Math.abs(currentDraftRpe - suggestedRpe) < 0.26;
  return repsMatch && rpeMatch;
}

function shouldRenderSuggestionCard(params: {
  recommendation?: Recommendation;
  draftMatches: boolean;
}): boolean {
  const { recommendation, draftMatches } = params;
  if (!recommendation) return false;
  if (recommendation.type === "pain-warning") return true;
  if (recommendation.action?.suggestedWeight && draftMatches) return false;
  return true;
}

function applyRecommendationToCurrentDraft(
  setDraft: ReturnType<typeof emptySetDraft>,
  recommendation?: Recommendation,
  currentPlannedSet?: PlannedSet,
) {
  if (!recommendation?.action?.suggestedWeight) return setDraft;
  const appliedRpe = recommendation.action?.suggestedRpe !== undefined
    ? String(sanitizeRpe(recommendation.action.suggestedRpe))
    : currentPlannedSet?.targetRpe !== undefined
      ? String(sanitizeRpe(currentPlannedSet.targetRpe))
      : setDraft.actualRpe;
  return {
    ...setDraft,
    actualWeight: String(recommendation.action.suggestedWeight),
    actualReps: recommendation.action?.suggestedReps
      ? String(recommendation.action.suggestedReps)
      : currentPlannedSet?.targetReps !== undefined
        ? String(currentPlannedSet.targetReps)
        : setDraft.actualReps,
    actualRpe: appliedRpe,
  };
}

function getMissedRepPenaltyJumps(params: {
  repMiss: number;
  profile: { category: "main_compound" | "secondary_compound" | "isolation_accessory" };
  actualRpe: number;
  targetRpe: number;
  feel: number;
}): number {
  const { repMiss, profile, actualRpe, targetRpe, feel } = params;
  if (repMiss <= 0) return 0;
  const harderThanTarget = actualRpe >= targetRpe || feel <= 2;
  if (repMiss === 1) {
    return harderThanTarget ? 1 : 0;
  }
  if (repMiss === 2) {
    if (profile.category === "main_compound") return harderThanTarget ? 1 : 0;
    return 1;
  }
  if (repMiss >= 3 && feel === 1) {
    if (profile.category === "main_compound") return 3;
    return 3;
  }
  if (profile.category === "main_compound") {
    return harderThanTarget ? 2 : 1;
  }
  return 2;
}

function isCompletedValidSet(set?: LoggedSet): set is LoggedSet {
  return !!set && !set.skipped && set.kind !== "warmup" && (set.actualWeight > 0 || set.actualReps > 0);
}

function isHardSet(set: LoggedSet): boolean {
  return !set.skipped && set.kind !== "warmup" && set.actualWeight > 0 && set.actualReps > 0;
}

function countSessionCompletedSets(session: WorkoutSession): number {
  if (session.status !== "completed") return 0;
  return session.loggedExercises.reduce((sum, exercise) => sum + exercise.sets.filter(isCompletedValidSet).length, 0);
}

function isLoggedExerciseComplete(log: LoggedExercise, db: TrainingDatabase, session: WorkoutSession): boolean {
  const plannedEx = findPlannedExercise(db, session, log);
  const visiblePlannedSets = getLoggedExercisePlannedSets(log, plannedEx);
  if (visiblePlannedSets.length) {
    // ID-coverage check: every planned set must have a matching logged set (supports out-of-order completion).
    const loggedIds = new Set(log.sets.map((s) => s.plannedSetId).filter(Boolean));
    return visiblePlannedSets.every((ps) => loggedIds.has(ps.id));
  }
  // No planned sets: complete if at least one non-skipped set exists
  return log.sets.filter((s) => !s.skipped).length > 0;
}

function findEarliestIncompleteExerciseIndex(
  session: WorkoutSession,
  db: TrainingDatabase,
  currentIndex: number
): number | undefined {
  // Search all exercises (excluding current) for the first that is not complete
  for (let i = 0; i < session.loggedExercises.length; i++) {
    if (i === currentIndex) continue;
    if (!isLoggedExerciseComplete(session.loggedExercises[i], db, session)) return i;
  }
  return undefined;
}

function buildCompletionSummary(session: WorkoutSession): {
  score: number; status: string; hardSets: number; skippedSets: number; completedSets: number; suggestions: string[];
} {
  const allSets = session.loggedExercises.flatMap((e) => e.sets);
  const hardSets = allSets.filter(isHardSet).length;
  const skippedSets = allSets.filter((s) => s.skipped).length;
  const completedSets = allSets.filter((s) => !s.skipped).length;
  const workoutScore = calculateWorkoutScore(session);
  return {
    score: workoutScore.score,
    status: workoutScore.status,
    hardSets,
    skippedSets,
    completedSets,
    suggestions: workoutScore.suggestions,
  };
}

function findPreviousCompletedSet(sets: LoggedSet[], targetSetIndex: number): LoggedSet | undefined {
  for (let index = targetSetIndex - 1; index >= 0; index -= 1) {
    const candidate = sets[index];
    if (isCompletedValidSet(candidate)) return candidate;
  }
  return undefined;
}

function findRecommendationSourceIndex(sets: LoggedSet[], targetSetIndex: number): number {
  for (let index = targetSetIndex - 1; index >= 0; index -= 1) {
    const candidate = sets[index];
    if (isCompletedValidSet(candidate)) return index;
  }
  return -1;
}

function countCompletedThroughIndex(sets: LoggedSet[], sourceSetIndex: number): number {
  return sets.slice(0, sourceSetIndex + 1).filter(isCompletedValidSet).length;
}

function buildOffProgramPlannedSets(targetSets: number, targetReps: number, targetRpe: number, plannedWeight?: number): PlannedSet[] {
  return Array.from({ length: Math.max(1, targetSets) }, (_, index) => ({
    id: createId("pset"),
    kind: "working" as const,
    setNumber: index + 1,
    targetReps,
    targetRpe,
    plannedWeight: index === 0 ? plannedWeight : undefined,
  }));
}

function normalizeLoggerRuntimePlannedSets(
  plannedSets: PlannedSet[] | undefined,
  fallbackCount = 1,
  fallbackReps = 8,
  fallbackRpe = 7,
  fallbackWeight?: number,
): PlannedSet[] {
  const safeCount = Math.max(1, fallbackCount);
  const source = plannedSets?.length
    ? plannedSets
    : buildOffProgramPlannedSets(safeCount, fallbackReps, fallbackRpe, fallbackWeight);
  return source.map((set, index) => ({
    ...set,
    id: set.id || createId("pset"),
    kind: set.kind || "working",
    setNumber: index + 1,
    targetReps: Math.max(1, Math.round(set.targetReps || fallbackReps)),
    targetRpe: sanitizeRpe(set.targetRpe || fallbackRpe),
    plannedWeight: typeof set.plannedWeight === "number" ? set.plannedWeight : (index === 0 ? fallbackWeight : undefined),
  }));
}

function getLatestExercisePerformanceLog(db: TrainingDatabase, userId: string, exerciseId: string) {
  return (db.exercisePerformanceLogs ?? [])
    .filter((log) => log.exerciseId === exerciseId && log.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .at(0);
}

function getLatestExercisePreviewHistory(
  db: TrainingDatabase,
  user: UserProfile,
  exercise?: Exercise,
  displayUnit?: UnitPreference,
) {
  if (!exercise || !displayUnit) return undefined;
  const latestSessionSet = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed")
    .flatMap((session) =>
      session.loggedExercises
        .filter((logged) => logged.exerciseId === exercise.id)
        .flatMap((logged) =>
          logged.sets
            .filter((set) => isCompletedValidSet(set))
            .map((set) => ({
              set,
              completedAt: set.completedAt || session.completedAt || session.startedAt,
            }))
        )
    )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .at(0)?.set;
  if (!latestSessionSet) return undefined;
  const sourceUnit = getExerciseLoadUnit(exercise, user, latestSessionSet.unit);
  return {
    weight: convertWeight(latestSessionSet.actualWeight, sourceUnit, displayUnit),
    reps: latestSessionSet.actualReps,
    rpe: latestSessionSet.actualRpe,
    unit: displayUnit,
  };
}

function getBodyweightPreviewLabel(exercise?: Exercise): string {
  if (exercise?.trackByBodyweight && exercise?.bestTrackedBy.includes("load")) return "BW";
  return "BW";
}

function formatExerciseLoadText(params: {
  exercise?: Exercise;
  user: UserProfile;
  weight?: number | null;
  unit?: ExerciseUnit | UnitPreference | null;
  bodyweightEmptyLabel?: string;
}): string {
  const { exercise, user, weight, unit, bodyweightEmptyLabel = "BW" } = params;
  if (!exercise) return "—";
  const loadUnit = getExerciseLoadUnit(exercise, user, unit);
  if (isBodyweightExercise(exercise)) {
    if (weight !== undefined && weight !== null && weight > 0) {
      return `BW + ${formatWeight(convertWeight(weight, loadUnit, loadUnit), loadUnit)} ${loadUnit}`;
    }
    return bodyweightEmptyLabel;
  }
  if (weight === undefined || weight === null || weight <= 0) return "—";
  return `${formatWeight(convertWeight(weight, loadUnit, loadUnit), loadUnit)} ${loadUnit}`;
}

function getPlannedExerciseBadgeText(params: {
  exercise?: Exercise;
  displayUnit?: UnitPreference;
  recommendationWeight?: number | null;
  plannedWeight?: number;
}): string | undefined {
  const { exercise, displayUnit, recommendationWeight, plannedWeight } = params;
  if (!exercise) return undefined;
  if (isBodyweightExercise(exercise)) {
    return getBodyweightPreviewLabel(exercise);
  }
  const weight = recommendationWeight ?? plannedWeight;
  if (!displayUnit || weight === undefined || weight === null || weight <= 0) return undefined;
  return `${formatWeight(weight, displayUnit)} ${displayUnit}`;
}

function getExerciseRecommendation(params: {
  db: TrainingDatabase;
  user: UserProfile;
  exercise?: Exercise;
  plannedSet?: PlannedSet;
  readiness?: ReadinessCheckIn;
  blockType?: BlockType;
  goal?: TrainingGoal;
  gymId?: string;
}) {
  const { db, user, exercise, plannedSet, readiness, blockType, goal, gymId } = params;
  if (!exercise || !plannedSet) return undefined;

  const targetReps = plannedSet.targetReps || 8;
  const targetRpe = plannedSet.targetRpe || 8;
  const exerciseDisplayUnit = getExerciseDisplayUnit(exercise, user);
  const baseline = getSameExerciseBaseline({
    userId: user.id,
    exerciseId: exercise.id,
    sessions: db.sessions,
    targetReps,
    targetRpe,
    gymId,
    desiredUnit: exerciseDisplayUnit,
    exerciseDefaultUnit: exercise.defaultUnit,
  });
  const targets = getTrainingTargets(
    mapTrainingGoal(goal || user.goal),
    mapBlockType(blockType),
    exercise.exerciseCategory
  );
  const recommendation = recommendWeightForExercise({
    exercise,
    targetReps,
    targetRpe: Math.max(targetRpe, targets.selectedRpeRange.min),
    baseline,
    readiness,
    increment: getEffectiveLoading(exercise, db.loadingProfiles, exerciseDisplayUnit).increment,
    unit: exerciseDisplayUnit,
  });

  return {
    ...recommendation,
    baseline,
    targetProfile: targets,
  };
}

function getOffProgramStartingWeight({
  db,
  user,
  exercise,
  targetReps,
  targetRpe
}: {
  db: TrainingDatabase;
  user: UserProfile;
  exercise?: Exercise;
  targetReps: number;
  targetRpe: number;
}): number | undefined {
  if (!exercise) return undefined;
  const plannedSet: PlannedSet = {
    id: "off-program-start",
    kind: "working",
    targetReps,
    targetRpe,
  };
  const recommendation = getExerciseRecommendation({
    db,
    user,
    exercise,
    plannedSet,
    goal: user.goal,
    gymId: user.activeGymId,
  });
  if (recommendation?.recommendedWeight && recommendation.recommendedWeight > 0) return recommendation.recommendedWeight;
  const lastLog = getLatestExercisePerformanceLog(db, user.id, exercise.id);
  return lastLog?.weight && lastLog.weight > 0 ? lastLog.weight : undefined;
}

function buildSetRecommendation(params: {
  user: UserProfile;
  exercise: Exercise;
  sourceSet: LoggedSet;
  sourceSetIndex: number;
  targetSetIndex: number;
  sourceExerciseIndex: number;
  targetExerciseIndex: number;
  nextPlannedSet?: PlannedSet;
  setsCompletedThisExercise: number; // retained for call-site compat; not used in e1RM pipeline
  readiness?: ReadinessCheckIn;
  unit: UnitPreference;
  loadingProfiles?: LoadingProfile[];
}): Recommendation | undefined {
  const {
    user, exercise, sourceSet, sourceSetIndex, targetSetIndex,
    sourceExerciseIndex, targetExerciseIndex, nextPlannedSet, readiness, unit, loadingProfiles,
  } = params;

  if (targetSetIndex <= sourceSetIndex || sourceSet.skipped) return undefined;

  // ── Pain: always override with a stop/substitute warning ─────────────────
  if ((sourceSet.painRating ?? 0) >= 6) {
    return {
      id: createId("rec"),
      userId: user.id,
      type: "pain-warning",
      priority: "high",
      title: "Stop or substitute",
      explanation: `Pain was high (${sourceSet.painRating}/10). Stop this movement today or switch to a pain-free substitute.`,
      action: {
        exerciseId: exercise.id,
        setId: sourceSet.id,
        targetSetNumber: targetSetIndex + 1,
        targetPlannedSetId: nextPlannedSet?.id,
        sourceExerciseIndex,
        sourceSetIndex,
        targetExerciseIndex,
        targetSetIndex,
      },
      createdAt: nowIso(),
    };
  }

  // ── Guard: bodyweight sets with no added load, or missing weight/reps ────
  const bodyweightMovement = isBodyweightExercise(exercise);
  if (bodyweightMovement && sourceSet.actualWeight <= 0) return undefined;
  if (sourceSet.actualWeight <= 0 || sourceSet.actualReps <= 0) return undefined;

  // ── Step 1: derive actual RPE from feel or explicit entry ─────────────────
  const sourceTargetRpe = sourceSet.targetRpe ?? nextPlannedSet?.targetRpe ?? 8;
  const sourceTargetReps = sourceSet.plannedReps ?? sourceSet.actualReps;
  const rpeResult = deriveActualRpeFromFeel({
    targetRpe: sourceTargetRpe,
    feelRating: sourceSet.setRating,
    explicitActualRpe: sourceSet.actualRpe,
    actualReps: sourceSet.actualReps,
    targetReps: sourceTargetReps,
  });

  // ── Step 2: calculate observed e1RM via RPE-aware Epley ───────────────────
  const e1rmResult = calculateObservedE1RMResult({
    weight: sourceSet.actualWeight,
    reps: sourceSet.actualReps,
    rpe: rpeResult.actualRpe,
  });
  if (!e1rmResult) return undefined;

  // ── Step 3: adjust target RPE for today's readiness ──────────────────────
  const baseTargetRpe = nextPlannedSet?.targetRpe ?? sourceTargetRpe;
  const targetRpeResult = adjustTargetRpeForReadiness({
    targetRpe: baseTargetRpe,
    readinessScore: readiness?.readinessScore,
  });
  const loggerTargetRpe = sanitizeRpe(nextPlannedSet?.targetRpe ?? baseTargetRpe);
  const modelTargetRpe = targetRpeResult.adjustedTargetRpe;
  const roundedTargetRpeMismatch = Math.abs(modelTargetRpe - loggerTargetRpe) > 0.01;

  // ── Step 4: reverse-prescribe target load ────────────────────────────────
  const targetReps = nextPlannedSet?.targetReps ?? sourceSet.actualReps;
  const increment = getEffectiveLoading(exercise, loadingProfiles, unit).increment;
  const profile = getSetRecommendationProfile(exercise, targetReps);
  const prescription = prescribeLoadFromObservedE1RM({
    observedE1RM: e1rmResult.e1rm,
    targetReps,
    targetRpe: modelTargetRpe,
    exercise,
    unit,
    recentActualWeight: sourceSet.actualWeight,
    increment,
  });

  if (prescription.roundedWeight <= 0) return undefined;

  const feel = sourceSet.setRating ?? 3;
  const sameWeightAfterRounding = !isMeaningfulWeightChange(sourceSet.actualWeight, prescription.roundedWeight, increment);
  const actualRpe = rpeResult.actualRpe;
  const sourceRepMiss = Math.max(0, sourceTargetReps - sourceSet.actualReps);
  const nextTargetNotEasier =
    targetReps >= sourceTargetReps
    && targetRpeResult.adjustedTargetRpe >= sourceTargetRpe - 0.25;
  const meaningfulRepMiss = sourceRepMiss >= (sourceTargetReps >= 10 ? 2 : 1);
  const underperformedForTarget =
    sourceRepMiss > 0
    && nextTargetNotEasier
    && (actualRpe >= sourceTargetRpe || meaningfulRepMiss || feel <= 3);
  const missedRepPenaltyJumps = getMissedRepPenaltyJumps({
    repMiss: sourceRepMiss,
    profile,
    actualRpe,
    targetRpe: sourceTargetRpe,
    feel,
  });
  const easierTargetThanSource = targetReps > sourceSet.actualReps && targetRpeResult.adjustedTargetRpe <= actualRpe;
  const harderTargetThanSource = targetReps < sourceSet.actualReps && targetRpeResult.adjustedTargetRpe >= actualRpe;
  const maxJumpWeight = sourceSet.actualWeight + increment * profile.maxIncrementJumps;
  const minJumpWeight = Math.max(0, sourceSet.actualWeight - increment * profile.maxIncrementJumps);

  let suggestedWeight = Math.min(maxJumpWeight, Math.max(minJumpWeight, prescription.roundedWeight));
  let title = "Hold load";
  let explanation = "";
  let direction: "increase" | "decrease" | "hold" = "hold";
  let forcedByFeel = false;
  let forcedByUnderperformance = false;
  let roundingBlockedDirection = false;

  if (feel === 1) {
    direction = "decrease";
    suggestedWeight = Math.max(0, sourceSet.actualWeight - increment);
    if (!isMeaningfulWeightChange(sourceSet.actualWeight, prescription.roundedWeight, increment)) {
      roundingBlockedDirection = true;
    }
    forcedByFeel = true;
  } else if (feel === 2) {
    const shouldDecrease = actualRpe > sourceTargetRpe || sourceSet.actualReps < targetReps || harderTargetThanSource;
    if (shouldDecrease) {
      direction = "decrease";
      suggestedWeight = Math.max(0, Math.min(suggestedWeight, sourceSet.actualWeight - increment));
      if (!isMeaningfulWeightChange(sourceSet.actualWeight, prescription.roundedWeight, increment)) {
        roundingBlockedDirection = true;
      }
      forcedByFeel = true;
    } else {
      direction = "hold";
      suggestedWeight = sourceSet.actualWeight;
    }
  } else if (feel === 3) {
    const strongCompoundIncrease =
      profile.e1rmConfidence === "high"
      && prescription.roundedWeight >= sourceSet.actualWeight + increment
      && harderTargetThanSource;
    const strongCompoundDecrease =
      profile.e1rmConfidence === "high"
      && prescription.roundedWeight <= sourceSet.actualWeight - increment
      && easierTargetThanSource;
    if (strongCompoundIncrease) {
      direction = "increase";
      suggestedWeight = Math.min(sourceSet.actualWeight + increment, suggestedWeight);
    } else if (strongCompoundDecrease) {
      direction = "decrease";
      suggestedWeight = Math.max(sourceSet.actualWeight - increment, suggestedWeight);
    } else {
      direction = "hold";
      suggestedWeight = sourceSet.actualWeight;
    }
  } else if (feel === 4 || feel === 5) {
    direction = "increase";
    const desiredJumps = feel === 5 && profile.maxIncrementJumps > 1 && prescription.roundedWeight >= sourceSet.actualWeight + increment * 1.5 ? 2 : 1;
    const candidate = sourceSet.actualWeight + increment * desiredJumps;
    if (candidate <= maxJumpWeight) {
      suggestedWeight = Math.max(suggestedWeight, candidate);
      forcedByFeel = true;
    } else {
      suggestedWeight = Math.min(maxJumpWeight, Math.max(sourceSet.actualWeight, suggestedWeight));
    }
    if (!isMeaningfulWeightChange(sourceSet.actualWeight, prescription.roundedWeight, increment)) {
      roundingBlockedDirection = true;
    }
  }

  if (underperformedForTarget && modelTargetRpe <= actualRpe + 0.25) {
    direction = "decrease";
    const penaltyWeight = sourceSet.actualWeight - increment * Math.max(1, missedRepPenaltyJumps);
    suggestedWeight = Math.max(0, Math.min(suggestedWeight, penaltyWeight));
    forcedByUnderperformance = true;
    if (!isMeaningfulWeightChange(sourceSet.actualWeight, prescription.roundedWeight, increment)) {
      roundingBlockedDirection = true;
    }
  }

  if (easierTargetThanSource) {
    suggestedWeight = Math.min(suggestedWeight, sourceSet.actualWeight);
  }
  if (feel === 1 || feel === 2) {
    suggestedWeight = Math.min(suggestedWeight, sourceSet.actualWeight);
  }
  if (feel === 4 || feel === 5) {
    suggestedWeight = Math.max(suggestedWeight, sourceSet.actualWeight);
  }

  const meaningfulChange = isMeaningfulWeightChange(sourceSet.actualWeight, suggestedWeight, increment);
  if (!meaningfulChange) {
    suggestedWeight = sourceSet.actualWeight;
    direction = "hold";
  }

  const wt = `${formatWeight(suggestedWeight, unit)} ${unit}`;
  const currentWt = `${formatWeight(sourceSet.actualWeight, unit)} ${unit}`;
  const e1rmLabel = `${Math.round(e1rmResult.e1rm)} ${unit}`;
  const accessoryLead = profile.category === "isolation_accessory"
    ? "For this accessory movement, set feel is weighted more than e1RM. "
    : "";

  if (direction === "decrease") {
    title = "Reduce load";
    if (forcedByUnderperformance) {
      explanation = `${accessoryLead}You missed the target reps at this load. Drop to ${wt} to make ${targetReps} reps @ RPE ${loggerTargetRpe} more realistic next set.`;
      if (rpeResult.source === "higher_effort_conflict") {
        explanation += ` Your feel rating suggested this was closer to RPE ${Number.isInteger(actualRpe) ? actualRpe : actualRpe.toFixed(1)}.`;
      }
    } else {
      explanation = `${accessoryLead}This felt harder than planned. Drop to ${wt} for the next set.`;
    }
    if (roundingBlockedDirection) {
      explanation += ` The calculated drop was smaller than the ${increment} ${unit} increment, so this moves one full increment down.`;
    }
  } else if (direction === "increase") {
    title = "Increase load";
    if (profile.category === "isolation_accessory") {
      explanation = `${accessoryLead}Move up to ${wt} for the next set if form stays clean.`;
    } else {
      explanation = `Based on your observed e1RM, ${wt} is a conservative target for ${targetReps} reps @ RPE ${loggerTargetRpe}.`;
    }
    if (roundingBlockedDirection) {
      explanation += ` The calculated increase was smaller than the ${increment} ${unit} increment, so this moves one full increment up.`;
    }
  } else {
    title = "Hold load";
    const matchedManualIncrease =
      sourceSet.actualWeight > (sourceSet.plannedWeight ?? 0)
      && sourceRepMiss <= 0
      && actualRpe <= sourceTargetRpe
      && feel >= 3
      && !isMeaningfulWeightChange(sourceSet.actualWeight, suggestedWeight, increment);
    if ((feel === 4 || feel === 5) && sameWeightAfterRounding) {
      explanation = `This felt easy, but the calculated increase was smaller than the ${increment} ${unit} increment. Hold ${currentWt}.`;
    } else if (matchedManualIncrease) {
      explanation = `Your last set matched the target after the manual increase. Stay at ${currentWt}.`;
    } else if ((feel === 1 || feel === 2) && sameWeightAfterRounding) {
      explanation = `This ran a bit hard, but the calculated drop was smaller than the ${increment} ${unit} increment. Hold ${currentWt} and tighten execution before changing load.`;
    } else if (profile.category === "isolation_accessory") {
      explanation = `${accessoryLead}Hold ${currentWt} for the next set.`;
    } else {
      explanation = `Based on your observed e1RM, ${currentWt} is a conservative target for ${targetReps} reps @ RPE ${loggerTargetRpe}.`;
    }
  }

  if (profile.category !== "isolation_accessory" && direction !== "increase" && direction !== "decrease") {
    explanation += ` Observed e1RM: ${e1rmLabel}.`;
  }
  if (roundedTargetRpeMismatch) {
    explanation += ` Exact RPE ${loggerTargetRpe} falls between available jumps here, so this uses the closest practical load.`;
  }
  if (forcedByFeel && forcedByUnderperformance && direction !== "hold") {
    explanation += " Adjusted to respect set feel and the missed target.";
  } else if (forcedByUnderperformance && direction !== "hold") {
    explanation += " Adjusted because the target reps were missed.";
  } else if (forcedByFeel && direction !== "hold") {
    explanation += " Adjusted to respect set feel.";
  } else if (prescription.wasRounded && !roundingBlockedDirection) {
    explanation += ` Rounded to the nearest ${increment} ${unit}.`;
  }

  return {
    id: createId("rec"),
    userId: user.id,
    type: "load-change",
    priority: feel <= 2 ? "medium" : "low",
    title,
    explanation,
    action: {
      exerciseId: exercise.id,
      setId: sourceSet.id,
      suggestedWeight,
      suggestedReps: targetReps,
      suggestedRpe: loggerTargetRpe,
      targetSetNumber: targetSetIndex + 1,
      targetPlannedSetId: nextPlannedSet?.id,
      sourceExerciseIndex,
      sourceSetIndex,
      targetExerciseIndex,
      targetSetIndex,
    },
    createdAt: nowIso(),
  };
}

function recommendationIdentityMatches(a: Recommendation, b: Recommendation): boolean {
  return (
    a.action?.setId === b.action?.setId &&
    a.action?.sourceExerciseIndex === b.action?.sourceExerciseIndex &&
    a.action?.sourceSetIndex === b.action?.sourceSetIndex &&
    a.action?.targetExerciseIndex === b.action?.targetExerciseIndex &&
    a.action?.targetSetIndex === b.action?.targetSetIndex
  );
}

function upsertRecommendation(list: Recommendation[], next: Recommendation) {
  const existingIndex = list.findIndex((item) => recommendationIdentityMatches(item, next));
  if (existingIndex >= 0) {
    list[existingIndex] = { ...next, id: list[existingIndex].id, applied: list[existingIndex].applied || next.applied };
  } else {
    list.unshift(next);
  }
}

function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-iron-500">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-2xl">{title}</h2>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-iron-100">{title}</h3>
        <Icon className="h-4 w-4 text-iron-500" />
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, unit, context }: { label: string; value: string | number; unit?: string; context?: string }) {
  return (
    <div className="metric-card">
      <p className="label">{label}</p>
      <p className="mt-1.5 text-xl font-bold">{value} {unit && <span className="text-sm font-normal text-iron-500">{unit}</span>}</p>
      {context && <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-iron-500">{context}</p>}
    </div>
  );
}

function VolumeBars({ volume }: { volume: Partial<Record<MuscleGroup, number>> }) {
  const entries = Object.entries(volume).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) return <EmptyState title="No volume yet" detail="Log a session to populate direct and indirect weekly sets." />;
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return (
    <div className="space-y-3">
      {entries.map(([muscle, value]) => (
        <div key={muscle}>
          <div className="mb-1 flex justify-between text-xs font-bold text-iron-300">
            <span>{muscle}</span>
            <span>{Number(value).toFixed(1)} sets</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-volt" style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-center">
      <p className="font-black">{title}</p>
      <p className="mt-2 text-sm text-iron-400">{detail}</p>
    </div>
  );
}

type ActionSheetItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

function ActionSheet({ title, items, onDismiss }: { title?: string; items: ActionSheetItem[]; onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onDismiss}
    >
      <div
        className="native-sheet w-full max-w-sm rounded-t-lg pb-safe sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <p className="border-b border-white/[0.07] px-4 py-3 text-center text-xs font-semibold text-iron-500">
            {title}
          </p>
        )}
        <div className="p-1.5">
          {items.map((item, i) => (
            <button
              key={i}
              disabled={item.disabled}
              className={`flex w-full items-center gap-3 rounded-sm px-4 py-3 text-left text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 ${
                item.destructive
                  ? "text-orange-300 hover:bg-ember/[0.1]"
                  : "text-iron-100 hover:bg-white/[0.07]"
              }`}
              onClick={() => { item.onClick(); onDismiss(); }}
            >
              {item.icon && <span className={`h-4 w-4 shrink-0 ${item.destructive ? "text-orange-400" : "text-iron-400"}`}>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
        <div className="border-t border-white/[0.07] p-1.5">
          <button
            className="w-full rounded-sm px-4 py-3 text-sm font-semibold text-iron-300 transition hover:bg-white/[0.07] active:scale-[0.98]"
            onClick={onDismiss}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
  disabled = false,
  type = "text",
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: "text" | "email" | "password";
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2 disabled:opacity-60" type={type} placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({ label, value, step, min, max, onChange }: { label: string; value: number; step?: number; min?: number; max?: number; onChange: (value: number) => void }) {
  const [localValue, setLocalValue] = useState(String(value));
  useEffect(() => { setLocalValue(String(value)); }, [value]);
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field mt-2"
        type="number"
        step={step}
        min={min}
        max={max}
        value={localValue}
        onChange={(event) => {
          setLocalValue(event.target.value);
          // Call parent immediately on every valid change so spinner arrows work
          const parsed = Number(event.target.value);
          if (event.target.value !== "" && !isNaN(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          const parsed = Number(localValue);
          if (localValue === "" || isNaN(parsed)) {
            setLocalValue(String(value));
          } else {
            const clamped = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
            setLocalValue(String(clamped));
            onChange(clamped);
          }
        }}
      />
    </div>
  );
}

function WeekEditorStepper({
  label,
  value,
  step = 1,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const nextDown = Math.max(min, Number((value - step).toFixed(2)));
  const nextUp = Math.min(max ?? Number.POSITIVE_INFINITY, Number((value + step).toFixed(2)));

  return (
    <div className="rounded-sm border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-iron-500">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button className="logger-step-btn" onClick={() => onChange(nextDown)} aria-label={`Decrease ${label}`}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-base font-semibold text-white">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
        <button className="logger-step-btn" onClick={() => onChange(nextUp)} aria-label={`Increase ${label}`}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  labels,
  onChange,
  disabled = false
}: {
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="field mt-2 disabled:opacity-60" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{labels?.[option] || option}</option>)}
      </select>
    </div>
  );
}

function BigInput({ label, value, onChange, step = "1", disabled = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; step?: string; disabled?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2 min-h-14 text-2xl font-black disabled:opacity-60" inputMode="decimal" type="number" step={step} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SmallRating({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {[0, 1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
      </select>
    </div>
  );
}

function buildPlannedExerciseFromExercise({
  db,
  user,
  program,
  day,
  exercise,
  order,
  exerciseRole,
  requirementSlotIndex,
  totalRequiredForMuscle
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program?: Program;
  day?: WorkoutDay;
  exercise: Exercise;
  order: number;
  exerciseRole?: ExerciseRole;
  requirementSlotIndex?: number;
  totalRequiredForMuscle?: number;
}): PlannedExercise {
  const block = program?.blocks[0];
  const resolvedRole = classifyExerciseRole({
    exercise,
    dayType: inferWorkoutDayType({
      name: day?.name,
      targetMuscles: day?.targetMuscles,
      movementPatterns: day?.movementPatterns,
    }),
    blockType: block?.type || "hypertrophy",
    dayFocus: day?.focus,
    orderHint: order,
    explicitRole: exerciseRole ?? inferBaseExerciseRole(exercise),
    isPriority: Boolean(block?.priorityExerciseIds.includes(exercise.id) || isSbdExercise(exercise)),
  });
  const goalUsed = getGoalUsed(program?.goal || user.goal, block?.goalOverride ?? block?.goal);
  const prescription = getBlockExercisePrescription({
    exercise,
    goal: goalUsed,
    blockType: block?.type || "hypertrophy",
    weekNumber: day?.weekNumber || block?.currentWeek || 1,
    blockLengthWeeks: block?.lengthWeeks || 4,
    order,
    isPriority: Boolean(block?.priorityExerciseIds.includes(exercise.id) || isSbdExercise(exercise)),
    dayFocus: day?.focus,
    splitDay: day
      ? {
          name: day.name,
          muscleGroups: day.targetMuscles || [],
          movementPatterns: day.movementPatterns || [],
        }
      : undefined,
    exerciseRole: resolvedRole,
    requirementSlotIndex,
    totalRequiredForMuscle,
  });
  const plannedSet = prescription.plannedSets[0] || { id: createId("pset"), kind: "working" as const, setNumber: 1, targetReps: 8, targetRpe: 7 };
  const suggested = getExerciseRecommendation({
    db,
    user,
    exercise,
    plannedSet,
    blockType: block?.type,
    goal: goalUsed,
    gymId: user.activeGymId,
  });
  return {
    id: createId("planned"),
    exerciseId: exercise.id,
    sourceExerciseId: exercise.id,
    parentExerciseId: exercise.parentExerciseId,
    muscleGroup: exercise.muscleGroup,
    primaryMuscles: structuredClone(exercise.primaryMuscles),
    secondaryMuscles: structuredClone(exercise.secondaryMuscles),
    directVolumeMuscles: structuredClone(exercise.directVolumeMuscles),
    indirectVolumeMuscles: structuredClone(exercise.indirectVolumeMuscles),
    canonicalMuscleKeys: getExerciseMuscleKeys(exercise),
    required: prescription.required,
    order,
    exerciseRole: resolvedRole,
    fatigueTag: getExerciseFatigueTag(exercise),
    plannedSets: prescription.plannedSets.map((set, index) => ({
      ...set,
      id: createId("pset"),
      setNumber: index + 1,
      plannedWeight: suggested?.recommendedWeight || undefined
    })),
    restSeconds: prescription.restSeconds,
    notes: [prescription.note, ...(suggested?.reasonParts || [])].filter(Boolean).join(" "),
    substitutionIds: exercise.substitutionIds
  };
}

function cloneProgramAsActive(program: Program): Program {
  const cloned = structuredClone(program);
  cloned.id = createId("program");
  cloned.status = "active";
  cloned.sourceProgramId = program.id;
  cloned.name = `${program.name} Copy`;
  cloned.createdAt = nowIso();
  cloned.updatedAt = nowIso();
  cloned.changeLog = [
    { id: createId("change"), at: nowIso(), label: "Duplicated previous block", detail: `Started from ${program.name}.` },
    ...(cloned.changeLog || [])
  ];
  cloned.blocks = cloned.blocks.map((block) => ({
    ...block,
    id: createId("block"),
    currentWeek: 1,
    currentWeekIndex: 0,
    currentDayIndex: 0,
    completedWorkoutDayIds: [],
    skippedWorkoutDayIds: [],
    startDate: todayIso(),
    weeks: block.weeks.map((week, weekIndex) => ({
      ...week,
      id: createId("week"),
      weekNumber: weekIndex + 1,
      startDate: new Date(Date.now() + weekIndex * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      workouts: week.workouts.map((day) => ({
        ...day,
        id: createId("workoutday"),
        status: "planned",
        exercises: day.exercises.map((planned, index) => ({
          ...planned,
          id: createId("planned"),
          order: index + 1,
          plannedSets: planned.plannedSets.map((set) => ({ ...set, id: createId("pset") }))
        }))
      }))
    }))
  }));
  cloned.blocks.forEach((block) => syncActiveBlockProgress(block, []));
  return cloned;
}

// ---------------------------------------------------------------------------
// Modal — full-screen overlay for mobile editors
// ---------------------------------------------------------------------------

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-iron-950 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-iron-950 px-4 py-3">
        <p className="font-black text-white">{title}</p>
        <button className="btn-ghost" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportTrainingDataFlow — unified training-data import
// ---------------------------------------------------------------------------

function ImportTrainingDataFlow({
  db,
  user,
  updateDb,
  onClose,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"input" | "review" | "done">("input");
  const [inputText, setInputText] = useState("");
  const [parsed, setParsed] = useState<UnifiedTrainingDataParseResult | null>(null);
  const [workoutReview, setWorkoutReview] = useState<ImportReviewSummary | null>(null);
  const [exerciseReview, setExerciseReview] = useState<ExerciseImportReviewSummary | null>(null);
  const [exerciseItems, setExerciseItems] = useState<ExerciseImportReviewItem[]>([]);
  const [workoutOverrides, setWorkoutOverrides] = useState<Map<string, string>>(new Map());
  const [copied, setCopied] = useState<"prompt" | "headers" | null>(null);
  const [result, setResult] = useState<{
    workout?: { sessionsAdded: number; setsAdded: number; duplicatesSkipped: number };
    exercise?: {
      baselinesUpdated: number;
      exercisesCreated: number;
      variationsCreated: number;
      mappedToExisting: number;
      historicalLogsAdded: number;
      skipped: number;
    };
  } | null>(null);

  function prepareReview(nextParsed: UnifiedTrainingDataParseResult) {
    setParsed(nextParsed);
    const nextWorkoutReview = nextParsed.workoutData ? buildImportReviewSummary(nextParsed.workoutData, db.exercises) : null;
    const nextExerciseReview = nextParsed.exerciseData ? buildExerciseImportReviewSummary(nextParsed.exerciseData, db, user) : null;
    setWorkoutReview(nextWorkoutReview);
    setExerciseReview(nextExerciseReview);
    setWorkoutOverrides(new Map());
    setExerciseItems(nextExerciseReview?.items || []);
    setStep("review");
  }

  function handleCopy(kind: "prompt" | "headers") {
    void navigator.clipboard.writeText(kind === "prompt" ? TRAINING_DATA_AI_PROMPT : TRAINING_DATA_HEADER_SECTIONS);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleFileUpload(file?: File) {
    if (!file) return;
    prepareReview(await parseTrainingDataFile(file));
  }

  function handleParseText() {
    prepareReview(parseTrainingDataText(inputText, "pasted-training-data"));
  }

  function handleWorkoutOverride(exerciseName: string, exerciseId: string) {
    setWorkoutOverrides((prev) => new Map(prev).set(exerciseName, exerciseId));
    setWorkoutReview((prev) =>
      prev
        ? {
            ...prev,
            groups: applyMatchOverride(prev.groups, exerciseName, {
              matchedExerciseId: exerciseId,
              matchedExerciseName: db.exercises.find((e) => e.id === exerciseId)?.name,
              confidence: "high",
              needsReview: false,
              suggestedAction: "use_existing",
            }),
          }
        : prev
    );
  }

  function updateExerciseItem(rowId: string, updater: (item: ExerciseImportReviewItem) => ExerciseImportReviewItem) {
    setExerciseItems((current) => current.map((item) => item.row.rowId === rowId ? updater(item) : item));
  }

  function handleExerciseActionChange(rowId: string, action: ExerciseImportAction) {
    updateExerciseItem(rowId, (item) => ({ ...item, action, needsReview: false }));
  }

  function handleExerciseMap(rowId: string, exerciseId: string) {
    const exercise = db.exercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingBaseline = baselineFromDb(db, user.id, exerciseId);
    updateExerciseItem(rowId, (item) => {
      const hasImportedPerformance = !!(item.row.baselinePerformance || item.row.lastPerformance);
      return {
        ...item,
        matchedExerciseId: exercise.id,
        matchedExerciseName: exercise.name,
        existingBaseline: existingBaseline
          ? {
              weight: existingBaseline.baselineWeight,
              sets: existingBaseline.baselineSets,
              reps: existingBaseline.baselineReps,
              rpe: existingBaseline.baselineRpe,
              e1rm: existingBaseline.baselineE1RM,
              updatedAt: existingBaseline.updatedAt,
              source: existingBaseline.source,
              notes: existingBaseline.notes,
            }
          : undefined,
        action: hasImportedPerformance
          ? hasMeaningfulBaselineData(existingBaseline)
            ? "add_historical_data"
            : "update_baseline"
          : "map_to_existing",
        baselineConflict: hasImportedPerformance
          ? hasMeaningfulBaselineData(existingBaseline) ? "conflict" : "safe_add"
          : "none",
        willCreateHistory: hasImportedPerformance,
        willAutoFillBaseline: hasImportedPerformance && !hasMeaningfulBaselineData(existingBaseline),
        metadataOnly: !hasImportedPerformance,
        needsReview: false,
      };
    });
  }

  async function handleConfirmImport() {
    await updateDb((draft) => {
      const nextResult: NonNullable<typeof result> = {};
      if (exerciseItems.length > 0) {
        nextResult.exercise = applyExerciseImportReview(draft, user, exerciseItems);
      }
      if (workoutReview) {
        const confirmedGroups = workoutReview.groups.filter(
          (group) => !group.matchResult.needsReview || workoutOverrides.has(group.exerciseName)
        );
        nextResult.workout = applyImportGroups(draft, user, confirmedGroups, workoutOverrides);
      }
      setResult(nextResult);
      return draft;
    });
    setStep("done");
  }

  const unresolvedWorkout = workoutReview?.groups.filter((group) => group.matchResult.needsReview && !workoutOverrides.has(group.exerciseName)) || [];
  const exerciseNeedsReview = exerciseItems.filter((item) => item.needsReview);
  const exerciseConflicts = exerciseItems.filter((item) => item.baselineConflict === "conflict");
  const skippedRows = (exerciseReview?.skippedOrInvalidRows || 0) + (workoutReview?.rowsWithErrors || 0);
  const summary = {
    exerciseRows: exerciseReview?.totalExerciseRows || 0,
    workoutRows: workoutReview?.totalRows || 0,
    newExercises: exerciseItems.filter((item) => item.action === "create_custom_exercise").length,
    matchedExercises: (exerciseReview?.matchedExistingExercises || 0) + (workoutReview?.exercisesMatched || 0),
    needsReview: unresolvedWorkout.length + exerciseNeedsReview.length,
    conflicts: exerciseConflicts.length,
  };

  if (step === "done" && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1 text-sm">
          <p className="font-black text-emerald-300">Training data import complete</p>
          {result.exercise && (
            <>
              <p>{result.exercise.exercisesCreated} custom exercise{result.exercise.exercisesCreated !== 1 ? "s" : ""} created</p>
              <p>{result.exercise.baselinesUpdated} baseline{result.exercise.baselinesUpdated !== 1 ? "s" : ""} updated</p>
              {result.exercise.historicalLogsAdded > 0 && <p>{result.exercise.historicalLogsAdded} history entr{result.exercise.historicalLogsAdded === 1 ? "y" : "ies"} added</p>}
            </>
          )}
          {result.workout && (
            <>
              <p>{result.workout.sessionsAdded} workout session{result.workout.sessionsAdded !== 1 ? "s" : ""} added</p>
              <p>{result.workout.setsAdded} set{result.workout.setsAdded !== 1 ? "s" : ""} logged</p>
              {result.workout.duplicatesSkipped > 0 && <p>{result.workout.duplicatesSkipped} duplicate{result.workout.duplicatesSkipped !== 1 ? "s" : ""} skipped</p>}
            </>
          )}
        </div>
        <button className="btn-primary w-full" onClick={onClose}>Done</button>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm space-y-1">
          <p className="font-black">Review training data import</p>
          <p className="text-iron-300">Exercise baselines: {summary.exerciseRows} row{summary.exerciseRows !== 1 ? "s" : ""} · Workout history: {summary.workoutRows} set{summary.workoutRows !== 1 ? "s" : ""}</p>
          <p className="text-iron-400">New exercises: {summary.newExercises} · Matched exercises: {summary.matchedExercises} · Needs review: {summary.needsReview} · Conflicts: {summary.conflicts}</p>
          {parsed?.detectedSections.length ? <p className="text-xs text-iron-500">Detected: {parsed.detectedSections.join(" + ").replaceAll("_", " ")}</p> : null}
        </div>

        {(parsed?.errors.length || parsed?.warnings.length) ? (
          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-3" open={!!parsed?.errors.length}>
            <summary className="cursor-pointer text-sm font-black">Rows skipped or invalid</summary>
            <div className="mt-3 space-y-2 text-xs">
              {parsed?.errors.map((error, index) => <p key={`err-${index}`} className="text-orange-200">{error}</p>)}
              {parsed?.warnings.map((warning, index) => <p key={`warn-${index}`} className="text-yellow-100">{warning}</p>)}
              {!parsed?.errors.length && !parsed?.warnings.length && <p className="text-iron-400">No skipped rows or parse warnings.</p>}
            </div>
          </details>
        ) : null}

        {summary.needsReview > 0 || summary.conflicts > 0 ? (
          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-3" open>
            <summary className="cursor-pointer text-sm font-black">Conflicts / Needs Review</summary>
            <div className="mt-3 space-y-2 text-xs text-iron-300">
              {exerciseConflicts.map((item) => <p key={`conflict-${item.row.rowId}`}>{item.row.name}: existing baseline found — choose how to merge.</p>)}
              {exerciseNeedsReview.filter((item) => item.baselineConflict !== "conflict").map((item) => <p key={`needs-${item.row.rowId}`}>{item.row.name}: confirm match or action.</p>)}
              {unresolvedWorkout.map((group) => <p key={`workout-${group.date}-${group.exerciseName}`}>{group.exerciseName}: workout history row needs an exercise match.</p>)}
            </div>
          </details>
        ) : null}

        {exerciseItems.length > 0 ? (
          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-sm font-black">Exercise Matches / Baselines</summary>
            <div className="mt-3 space-y-3">
              {exerciseItems.map((item) => (
                <ExerciseImportReviewRow
                  key={item.row.rowId}
                  item={item}
                  db={db}
                  user={user}
                  onChangeAction={handleExerciseActionChange}
                  onMapExercise={handleExerciseMap}
                />
              ))}
            </div>
          </details>
        ) : null}

        {workoutReview ? (
          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-sm font-black">Workout History</summary>
            <div className="mt-3 space-y-2">
              {workoutReview.groups.map((group) => (
                <ImportGroupRow
                  key={`${group.date}-${group.exerciseName}`}
                  group={group}
                  db={db}
                  overrideId={workoutOverrides.get(group.exerciseName)}
                  onOverride={handleWorkoutOverride}
                />
              ))}
            </div>
          </details>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="btn-primary w-full"
            onClick={() => void handleConfirmImport()}
            disabled={summary.needsReview > 0}
          >
            <FileUp className="h-4 w-4" />
            Import Training Data
          </button>
          <button className="btn-secondary w-full" onClick={() => setStep("input")}>Back</button>
        </div>
        {summary.needsReview > 0 && (
          <p className="text-xs text-iron-500">Resolve the remaining conflicts or exercise matches above to continue.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-iron-950/60 p-4 space-y-3">
        <p className="font-black text-sm">AI formatting help</p>
        <p className="text-xs text-iron-400">Ask AI to clean up your old spreadsheet or notes into one import-ready format. Legacy Excel sheets with an Exercises tab are still supported too.</p>
        <button className="btn-secondary w-full" onClick={() => handleCopy("prompt")}>
          <Copy className="h-4 w-4" />
          {copied === "prompt" ? "Copied!" : "Copy AI Formatting Prompt"}
        </button>
        <button className="btn-secondary w-full text-xs" onClick={() => handleCopy("headers")}>
          <Copy className="h-4 w-4" />
          {copied === "headers" ? "Copied!" : "Copy Headers"}
        </button>
        <details className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-iron-300">
          <summary className="cursor-pointer font-bold">Show expected columns</summary>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-[0.7rem] text-iron-400">{TRAINING_DATA_HEADER_SECTIONS}</pre>
        </details>
      </div>

      <div>
        <p className="label mb-2">Upload training data</p>
        <label className="btn-secondary w-full cursor-pointer">
          <FileUp className="h-4 w-4" />
          Choose CSV or Excel file
          <input className="hidden" type="file" accept=".csv,.xlsx,.xlsm" onChange={(event) => { void handleFileUpload(event.target.files?.[0]); }} />
        </label>
        <p className="mt-2 text-xs text-iron-500">Supported: workout history CSV, exercise/baseline CSV, or Excel workbooks with Exercises and/or Workout History tabs.</p>
      </div>

      <div>
        <p className="label mb-2">Or paste CSV / table text</p>
        <textarea
          className="field min-h-32 font-mono text-xs"
          placeholder={`SECTION 1: Exercises\nname,primaryMuscles,...\n\nSECTION 2: Workout History\ndate,workout_name,exercise_name,...`}
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn-primary w-full" onClick={handleParseText} disabled={!inputText.trim()}>
          <FileUp className="h-4 w-4" />
          Parse &amp; Review
        </button>
        <button className="btn-secondary w-full" onClick={onClose}>Cancel</button>
      </div>
      {skippedRows > 0 && <p className="text-xs text-iron-500">{skippedRows} row{skippedRows !== 1 ? "s" : ""} were skipped in the last review.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImportWorkoutCSVFlow — CSV import modal content
// ---------------------------------------------------------------------------

function ImportWorkoutCSVFlow({
  db,
  user,
  updateDb,
  onClose,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"input" | "review" | "done">("input");
  const [csvText, setCsvText] = useState("");
  const [review, setReview] = useState<ImportReviewSummary | null>(null);
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [result, setResult] = useState<{ sessionsAdded: number; setsAdded: number; duplicatesSkipped: number } | null>(null);
  const [copied, setCopied] = useState<"prompt" | "headers" | null>(null);

  function handleCopy(what: "prompt" | "headers") {
    void navigator.clipboard.writeText(what === "prompt" ? AI_CSV_PROMPT : CSV_COLUMN_HEADERS);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleFileUpload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result));
    reader.readAsText(file);
  }

  function handleParse() {
    const parsed = parseCSVText(csvText, "pasted-csv");
    const summary = buildImportReviewSummary(parsed, db.exercises);
    setReview(summary);
    setOverrides(new Map());
    setStep("review");
  }

  function handleOverride(exerciseName: string, exerciseId: string) {
    setOverrides((prev) => new Map(prev).set(exerciseName, exerciseId));
    setReview((prev) =>
      prev
        ? {
            ...prev,
            groups: applyMatchOverride(prev.groups, exerciseName, {
              matchedExerciseId: exerciseId,
              matchedExerciseName: db.exercises.find((e) => e.id === exerciseId)?.name,
              confidence: "high",
              needsReview: false,
              suggestedAction: "use_existing",
            }),
          }
        : prev
    );
  }

  async function handleConfirmImport() {
    if (!review) return;
    const confirmed = review.groups.filter(
      (g) => !g.matchResult.needsReview || overrides.has(g.exerciseName)
    );
    await updateDb((draft) => {
      const res = applyImportGroups(draft, user, confirmed, overrides);
      setResult(res);
      return draft;
    });
    setStep("done");
  }

  if (step === "done" && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-black text-emerald-300">Import complete</p>
          <div className="mt-2 space-y-1 text-sm text-iron-200">
            <p>{result.sessionsAdded} session{result.sessionsAdded !== 1 ? "s" : ""} added</p>
            <p>{result.setsAdded} set{result.setsAdded !== 1 ? "s" : ""} logged</p>
            {result.duplicatesSkipped > 0 && <p>{result.duplicatesSkipped} duplicate{result.duplicatesSkipped !== 1 ? "s" : ""} skipped</p>}
          </div>
        </div>
        <button className="btn-primary w-full" onClick={onClose}>Done</button>
      </div>
    );
  }

  if (step === "review" && review) {
    const unresolved = review.groups.filter((g) => g.matchResult.needsReview && !overrides.has(g.exerciseName));
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm space-y-1">
          <p className="font-black">Review import</p>
          <p className="text-iron-300">{review.totalRows} rows · {review.workoutsDetected} workout{review.workoutsDetected !== 1 ? "s" : ""} · {review.exercisesMatched} exercise{review.exercisesMatched !== 1 ? "s" : ""} matched</p>
          {unresolved.length > 0 && <p className="text-orange-200">{unresolved.length} exercise{unresolved.length !== 1 ? "s" : ""} need review before import</p>}
        </div>

        {review.errors.length > 0 && (
          <div className="rounded-lg border border-ember/30 bg-ember/10 p-3 text-xs text-orange-100 space-y-1">
            {review.errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
        {review.warnings.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-100 space-y-1">
            {review.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        {review.groups.length > 0 && (
          <div className="space-y-2">
            <p className="label">Exercise matches</p>
            {review.groups.map((group) => (
              <ImportGroupRow
                key={`${group.date}-${group.exerciseName}`}
                group={group}
                db={db}
                overrideId={overrides.get(group.exerciseName)}
                onOverride={handleOverride}
              />
            ))}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="btn-primary w-full"
            onClick={() => void handleConfirmImport()}
            disabled={unresolved.length > 0}
          >
            <FileUp className="h-4 w-4" />
            Import {review.totalRows - review.rowsWithErrors} rows
          </button>
          <button className="btn-secondary w-full" onClick={() => setStep("input")}>Back</button>
        </div>
        {unresolved.length > 0 && (
          <p className="text-xs text-iron-500">Resolve {unresolved.length} unmatched exercise{unresolved.length !== 1 ? "s" : ""} above to continue.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-iron-950/60 p-4 space-y-3">
        <p className="font-black text-sm">Ask AI to format your training log</p>
        <p className="text-xs text-iron-400">Copy this prompt, paste your old workout log, then paste the resulting CSV below.</p>
        <button className="btn-secondary w-full" onClick={() => handleCopy("prompt")}>
          <Copy className="h-4 w-4" />
          {copied === "prompt" ? "Copied!" : "Copy AI Prompt"}
        </button>
        <button className="btn-secondary w-full text-xs" onClick={() => handleCopy("headers")}>
          <Copy className="h-4 w-4" />
          {copied === "headers" ? "Copied!" : "Copy CSV Column Headers"}
        </button>
      </div>

      <div>
        <p className="label mb-2">Upload CSV file</p>
        <label className="btn-secondary w-full cursor-pointer">
          <FileUp className="h-4 w-4" />
          Choose CSV file
          <input className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
        </label>
      </div>

      <div>
        <p className="label mb-2">Or paste CSV text</p>
        <textarea
          className="field min-h-32 font-mono text-xs"
          placeholder={`date,workout_name,exercise_name,...\n2024-01-15,Push Day,Bench Press,1,225,lb,5,8,...`}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn-primary w-full" onClick={handleParse} disabled={!csvText.trim()}>
          <FileUp className="h-4 w-4" />
          Parse &amp; Review
        </button>
        <button className="btn-secondary w-full" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ImportGroupRow({
  group,
  db,
  overrideId,
  onOverride,
}: {
  group: ImportRowGroup;
  db: TrainingDatabase;
  overrideId?: string;
  onOverride: (exerciseName: string, exerciseId: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const mr = group.matchResult;
  const resolvedId = overrideId ?? mr.matchedExerciseId;
  const resolvedName = resolvedId
    ? (db.exercises.find((e) => e.id === resolvedId)?.name ?? resolvedId)
    : undefined;

  const confidenceColor =
    mr.confidence === "high" && !mr.needsReview
      ? "text-emerald-400"
      : mr.confidence === "medium"
      ? "text-yellow-300"
      : "text-orange-300";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{group.exerciseName}</p>
          <p className="text-xs text-iron-400">{group.rows.length} set{group.rows.length !== 1 ? "s" : ""} · {group.date}</p>
        </div>
        <span className={`text-xs font-bold ${confidenceColor}`}>{mr.confidence}</span>
      </div>
      {resolvedName ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5">
          <span className="flex-1 text-xs font-bold text-emerald-300">→ {resolvedName}</span>
          <button className="text-emerald-500/60 hover:text-emerald-400 transition" onClick={() => { setShowPicker(true); setSearch(""); }}>
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1.5">
          <p className="text-xs text-orange-200">No match — select an exercise to import these sets.</p>
          <button className="mt-1 text-xs font-bold text-orange-300 underline" onClick={() => { setShowPicker(true); setSearch(""); }}>
            Pick exercise
          </button>
        </div>
      )}
      {showPicker && (
        <div className="space-y-1">
          <input
            className="field text-sm"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-iron-900">
            {db.exercises
              .filter((e) => !e.isArchived && e.name.toLowerCase().includes(search.toLowerCase()))
              .slice(0, 20)
              .map((e) => (
                <button
                  key={e.id}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 transition"
                  onClick={() => { onOverride(group.exerciseName, e.id); setShowPicker(false); }}
                >
                  {e.name}
                </button>
              ))}
          </div>
          <button className="text-xs text-iron-500 underline" onClick={() => setShowPicker(false)}>Cancel</button>
        </div>
      )}
      <p className="text-xs text-iron-500">{mr.reason}</p>
    </div>
  );
}

function formatImportedPerformance(perf?: {
  weight?: number;
  sets?: number;
  reps?: number;
  rpe?: number;
  e1rm?: number;
}) {
  if (!perf) return "None";
  const parts = [
    perf.weight !== undefined ? `wt ${perf.weight}` : undefined,
    perf.sets !== undefined ? `sets ${perf.sets}` : undefined,
    perf.reps !== undefined ? `reps ${perf.reps}` : undefined,
    perf.rpe !== undefined ? `RPE ${perf.rpe}` : undefined,
    perf.e1rm !== undefined ? `e1RM ${perf.e1rm}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "None";
}

function baselineFromDb(
  db: TrainingDatabase,
  userId: string,
  exerciseId?: string
): ExerciseBaseline | undefined {
  if (!exerciseId) return undefined;
  return (db.exerciseBaselines || []).find((item) => item.userId === userId && item.exerciseId === exerciseId);
}

function hasMeaningfulBaselineData(baseline?: ExerciseBaseline) {
  if (!baseline) return false;
  return [
    baseline.baselineWeight,
    baseline.baselineSets,
    baseline.baselineReps,
    baseline.baselineRpe,
    baseline.baselineE1RM,
    baseline.lastWeight,
    baseline.lastSets,
    baseline.lastReps,
    baseline.lastRpe,
    baseline.lastE1RM,
  ].some((value) => typeof value === "number" && value > 0);
}

function actionLabel(action: ExerciseImportAction) {
  switch (action) {
    case "update_baseline": return "Update baseline";
    case "keep_existing_baseline": return "Keep existing baseline";
    case "replace_baseline": return "Replace baseline";
    case "keep_newer_baseline": return "Keep newer baseline";
    case "add_historical_data": return "Add historical data";
    case "create_custom_exercise": return "Create custom exercise";
    case "create_variation": return "Create variation";
    case "map_to_existing": return "Map to existing";
    case "skip": return "Skip";
    default: return action;
  }
}

function exerciseActionOptions(item: ExerciseImportReviewItem) {
  const options: ExerciseImportAction[] = [];
  if (item.matchedExerciseId) {
    options.push("map_to_existing");
    if (item.row.baselinePerformance || item.row.lastPerformance) {
      options.push("update_baseline", "keep_existing_baseline", "replace_baseline", "keep_newer_baseline", "add_historical_data");
    }
  }
  if (item.suggestedParentExerciseId) options.push("create_variation");
  options.push("create_custom_exercise", "skip");
  return Array.from(new Set(options));
}

function ExerciseImportReviewRow({
  item,
  db,
  user,
  onChangeAction,
  onMapExercise,
}: {
  item: ExerciseImportReviewItem;
  db: TrainingDatabase;
  user: UserProfile;
  onChangeAction: (rowId: string, action: ExerciseImportAction) => void;
  onMapExercise: (rowId: string, exerciseId: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const matchedName = item.matchedExerciseName || (item.matchedExerciseId ? db.exercises.find((exercise) => exercise.id === item.matchedExerciseId)?.name : undefined);
  const baselineText = formatImportedPerformance(item.row.baselinePerformance || item.row.lastPerformance);
  const existingText = formatImportedPerformance(item.existingBaseline);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">{item.row.name}</p>
          <p className="text-xs text-iron-400">
            {item.row.category ? `${item.row.category} · ` : ""}
            {item.matchResult.confidence} confidence
          </p>
        </div>
        {item.needsReview && (
          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-orange-200">
            Review
          </span>
        )}
      </div>

      <div className="grid gap-2 text-xs text-iron-300 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-iron-950/60 p-2">
          <p className="label mb-1">Imported</p>
          <p>{baselineText}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-iron-950/60 p-2">
          <p className="label mb-1">Existing baseline</p>
          <p>{existingText}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-iron-950/50 p-2 text-xs">
        <p className="font-bold text-iron-200">
          Match: {matchedName ? matchedName : "New custom exercise"}
          {item.suggestedParentExerciseName ? ` · variation of ${item.suggestedParentExerciseName}` : ""}
        </p>
        <p className="mt-1 text-iron-400">{item.reason}</p>
        <p className="mt-1 text-iron-500">
          {item.willCreateHistory ? "Creates analytics history" : item.metadataOnly ? "Metadata only" : "No history change"}
          {item.willAutoFillBaseline ? " · auto-fills blank/zero baseline" : ""}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select
          className="field text-sm"
          value={item.action}
          onChange={(event) => onChangeAction(item.row.rowId, event.target.value as ExerciseImportAction)}
        >
          {exerciseActionOptions(item).map((action) => (
            <option key={action} value={action}>{actionLabel(action)}</option>
          ))}
        </select>
        <button
          className="btn-secondary"
          onClick={() => {
            setShowPicker((value) => !value);
            setSearch("");
          }}
        >
          <Pencil className="h-4 w-4" />
          Map Exercise
        </button>
      </div>

      {showPicker && (
        <div className="space-y-2">
          <input
            className="field text-sm"
            placeholder="Search exercises..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-iron-950/60">
            {db.exercises
              .filter((exercise) => !exercise.isArchived && (!exercise.ownerUserId || exercise.ownerUserId === user.id))
              .filter((exercise) => exercise.name.toLowerCase().includes(search.toLowerCase()))
              .slice(0, 20)
              .map((exercise) => (
                <button
                  key={exercise.id}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-white/10 transition"
                  onClick={() => {
                    onMapExercise(item.row.rowId, exercise.id);
                    setShowPicker(false);
                  }}
                >
                  {exercise.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImportExercisesFlow({
  db,
  user,
  updateDb,
  onClose,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"input" | "review" | "done">("input");
  const [csvText, setCsvText] = useState("");
  const [review, setReview] = useState<ExerciseImportReviewSummary | null>(null);
  const [items, setItems] = useState<ExerciseImportReviewItem[]>([]);
  const [copied, setCopied] = useState<"exercise_prompt" | "legacy_prompt" | "headers" | null>(null);
  const [result, setResult] = useState<{
    baselinesUpdated: number;
    exercisesCreated: number;
    variationsCreated: number;
    mappedToExisting: number;
    historicalLogsAdded: number;
    skipped: number;
  } | null>(null);

  function handleCopy(kind: "exercise_prompt" | "legacy_prompt" | "headers") {
    const value = kind === "exercise_prompt"
      ? EXERCISE_IMPORT_AI_PROMPT
      : kind === "legacy_prompt"
      ? LEGACY_EXERCISE_SHEET_AI_PROMPT
      : EXERCISE_IMPORT_COLUMN_HEADERS;
    void navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleFileUpload(file?: File) {
    if (!file) return;
    const parsed = await parseExerciseImportFile(file);
    const nextReview = buildExerciseImportReviewSummary(parsed, db, user);
    setReview(nextReview);
    setItems(nextReview.items);
    setStep("review");
  }

  function handleParsePastedText() {
    const parsed = parseExerciseImportCSVText(csvText, "pasted-exercise-csv");
    const nextReview = buildExerciseImportReviewSummary(parsed, db, user);
    setReview(nextReview);
    setItems(nextReview.items);
    setStep("review");
  }

  function updateItem(rowId: string, updater: (item: ExerciseImportReviewItem) => ExerciseImportReviewItem) {
    setItems((current) => current.map((item) => item.row.rowId === rowId ? updater(item) : item));
  }

  function handleActionChange(rowId: string, action: ExerciseImportAction) {
    updateItem(rowId, (item) => ({ ...item, action, needsReview: false }));
  }

  function handleMapExercise(rowId: string, exerciseId: string) {
    const exercise = db.exercises.find((candidate) => candidate.id === exerciseId);
    if (!exercise) return;
    const existingBaseline = baselineFromDb(db, user.id, exerciseId);
    updateItem(rowId, (item) => {
      const hasImportedPerformance = !!(item.row.baselinePerformance || item.row.lastPerformance);
      return {
        ...item,
        matchedExerciseId: exercise.id,
        matchedExerciseName: exercise.name,
        existingBaseline: existingBaseline
          ? {
              weight: existingBaseline.baselineWeight,
              sets: existingBaseline.baselineSets,
              reps: existingBaseline.baselineReps,
              rpe: existingBaseline.baselineRpe,
              e1rm: existingBaseline.baselineE1RM,
              updatedAt: existingBaseline.updatedAt,
              source: existingBaseline.source,
              notes: existingBaseline.notes,
            }
          : undefined,
        action: hasImportedPerformance
          ? hasMeaningfulBaselineData(existingBaseline)
            ? "add_historical_data"
            : "update_baseline"
          : "map_to_existing",
        baselineConflict: hasImportedPerformance
          ? hasMeaningfulBaselineData(existingBaseline) ? "conflict" : "safe_add"
          : "none",
        willCreateHistory: hasImportedPerformance,
        willAutoFillBaseline: hasImportedPerformance && !hasMeaningfulBaselineData(existingBaseline),
        metadataOnly: !hasImportedPerformance,
        needsReview: false,
      };
    });
  }

  async function handleConfirmImport() {
    await updateDb((draft) => {
      const applied = applyExerciseImportReview(draft, user, items);
      setResult(applied);
      return draft;
    });
    setStep("done");
  }

  const liveSummary = useMemo(() => ({
    total: items.length,
    matched: items.filter((item) => item.matchedExerciseId).length,
    custom: items.filter((item) => item.action === "create_custom_exercise").length,
    variations: items.filter((item) => item.action === "create_variation").length,
    baselineUpdates: items.filter((item) => item.action === "update_baseline" || item.action === "replace_baseline").length,
    historyRows: items.filter((item) => item.willCreateHistory && item.action !== "skip" && item.action !== "keep_existing_baseline").length,
    autoFillRows: items.filter((item) => item.willAutoFillBaseline).length,
    metadataOnlyRows: items.filter((item) => item.metadataOnly).length,
    conflicts: items.filter((item) => item.baselineConflict === "conflict").length,
    review: items.filter((item) => item.needsReview).length,
  }), [items]);

  if (step === "done" && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1 text-sm">
          <p className="font-black text-emerald-300">Exercise import complete</p>
          <p>{result.exercisesCreated} custom exercise{result.exercisesCreated !== 1 ? "s" : ""} created</p>
          <p>{result.variationsCreated} variation{result.variationsCreated !== 1 ? "s" : ""} created</p>
          <p>{result.baselinesUpdated} baseline{result.baselinesUpdated !== 1 ? "s" : ""} updated</p>
          {result.historicalLogsAdded > 0 && <p>{result.historicalLogsAdded} historical entr{result.historicalLogsAdded === 1 ? "y" : "ies"} added</p>}
        </div>
        <button className="btn-primary w-full" onClick={onClose}>Done</button>
      </div>
    );
  }

  if (step === "review" && review) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm space-y-1">
          <p className="font-black">Review exercise import</p>
          <p className="text-iron-300">
            {liveSummary.total} exercise row{liveSummary.total !== 1 ? "s" : ""} · {liveSummary.matched} matched · {liveSummary.custom} new · {liveSummary.variations} variations
          </p>
          <p className="text-iron-400">
            {liveSummary.baselineUpdates} baseline updates · {liveSummary.historyRows} history record{liveSummary.historyRows !== 1 ? "s" : ""} · {liveSummary.autoFillRows} auto-fill row{liveSummary.autoFillRows !== 1 ? "s" : ""}
          </p>
          <p className="text-iron-400">
            {liveSummary.conflicts} baseline conflict{liveSummary.conflicts !== 1 ? "s" : ""} · {liveSummary.metadataOnlyRows} metadata-only row{liveSummary.metadataOnlyRows !== 1 ? "s" : ""}
          </p>
          {review.format && <p className="text-xs text-iron-500">Detected format: {review.format}</p>}
        </div>

        {review.errors.length > 0 && (
          <div className="rounded-lg border border-ember/30 bg-ember/10 p-3 text-xs text-orange-100 space-y-1">
            {review.errors.map((error, index) => <p key={index}>{error}</p>)}
          </div>
        )}
        {review.warnings.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-100 space-y-1">
            {review.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
          </div>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <ExerciseImportReviewRow
              key={item.row.rowId}
              item={item}
              db={db}
              user={user}
              onChangeAction={handleActionChange}
              onMapExercise={handleMapExercise}
            />
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button className="btn-primary w-full" onClick={() => void handleConfirmImport()}>
            <FileUp className="h-4 w-4" />
            Import Exercises / Baselines
          </button>
          <button className="btn-secondary w-full" onClick={() => setStep("input")}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-iron-950/60 p-4 space-y-3">
        <p className="font-black text-sm">Exercise import prompts</p>
        <p className="text-xs text-iron-400">Use these when you want AI to convert a spreadsheet or notes into a clean exercise import CSV.</p>
        <button className="btn-secondary w-full" onClick={() => handleCopy("exercise_prompt")}>
          <Copy className="h-4 w-4" />
          {copied === "exercise_prompt" ? "Copied!" : "Copy Exercise Import AI Prompt"}
        </button>
        <button className="btn-secondary w-full" onClick={() => handleCopy("legacy_prompt")}>
          <Copy className="h-4 w-4" />
          {copied === "legacy_prompt" ? "Copied!" : "Copy Legacy Sheet AI Prompt"}
        </button>
        <button className="btn-secondary w-full text-xs" onClick={() => handleCopy("headers")}>
          <Copy className="h-4 w-4" />
          {copied === "headers" ? "Copied!" : "Copy Exercise CSV Headers"}
        </button>
      </div>

      <div>
        <p className="label mb-2">Upload file</p>
        <label className="btn-secondary w-full cursor-pointer">
          <FileUp className="h-4 w-4" />
          Choose CSV or workbook
          <input className="hidden" type="file" accept=".csv,.xlsx,.xlsm" onChange={(event) => { void handleFileUpload(event.target.files?.[0]); }} />
        </label>
      </div>

      <div>
        <p className="label mb-2">Or paste exercise CSV</p>
        <textarea
          className="field min-h-32 font-mono text-xs"
          placeholder={`name,primaryMuscles,secondaryMuscles,...\nCompetition Bench Press,chest;triceps,front-delts,barbell,lb,5,...`}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn-primary w-full" onClick={handleParsePastedText} disabled={!csvText.trim()}>
          <FileUp className="h-4 w-4" />
          Parse &amp; Review
        </button>
        <button className="btn-secondary w-full" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataManagementPanel — export/import section in Settings
// ---------------------------------------------------------------------------

function DataManagementPanel({
  db,
  user,
  updateDb,
  importDb,
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  importDb: (data: TrainingDatabase) => Promise<void>;
}) {
  const [showUnifiedImportFlow, setShowUnifiedImportFlow] = useState(false);
  const [showWorkoutImportFlow, setShowWorkoutImportFlow] = useState(false);
  const [showExerciseImportFlow, setShowExerciseImportFlow] = useState(false);

  const userExercises = db.exercises.filter(
    (e) => !e.isArchived && (!e.ownerUserId || e.ownerUserId === user.id)
  );
  const userBaselines = (db.exerciseBaselines || []).filter((baseline) => baseline.userId === user.id);
  const [copiedPrompt, setCopiedPrompt] = useState<"training" | "headers" | "exercise_headers" | "workout_headers" | null>(null);

  function copyPrompt(kind: "training" | "headers" | "exercise_headers" | "workout_headers") {
    const text = kind === "training"
      ? TRAINING_DATA_AI_PROMPT
      : kind === "headers"
      ? TRAINING_DATA_HEADER_SECTIONS
      : kind === "exercise_headers"
      ? EXERCISE_IMPORT_COLUMN_HEADERS
      : CSV_COLUMN_HEADERS;
    void navigator.clipboard.writeText(text);
    setCopiedPrompt(kind);
    setTimeout(() => setCopiedPrompt(null), 2000);
  }

  function importBackup(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = JSON.parse(String(reader.result)) as TrainingDatabase;
      void importDb(parsed);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Panel title="Data Management" icon={FileDown}>
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-iron-950/50 p-3 text-xs text-iron-400">
            Keep this simple: import one file, export one useful spreadsheet, and use backup only for full app restore.
          </div>

          <div className="rounded-lg bg-iron-900/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-iron-100">Import</p>
            <p className="text-xs text-iron-400">Upload a CSV or Excel file with exercises, baselines, workout history, or a legacy program sheet.</p>
            <button className="btn-primary w-full" onClick={() => setShowUnifiedImportFlow(true)}>
              <FileUp className="h-4 w-4" />
              Import Training Data
            </button>
          </div>

          <div className="rounded-lg bg-iron-900/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-iron-100">Export</p>
            <p className="text-xs text-iron-400">Download one Excel-compatible workbook with your exercise library and workout history.</p>
            <button
              className="btn-primary w-full"
              onClick={() => downloadTrainingDataWorkbook(db, user)}
            >
              <FileDown className="h-4 w-4" />
              Export Training Data
            </button>
          </div>

          <div className="rounded-lg bg-iron-900/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-iron-100">Backup</p>
            <p className="text-xs text-iron-400">Use this for full app backup and restore, not spreadsheet editing.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="btn-secondary w-full"
                onClick={() => downloadFullBackupJSON(db, user.username || "local")}
              >
                <FileDown className="h-4 w-4" />
                Export Full Backup JSON
              </button>
              <label className="btn-secondary w-full cursor-pointer">
                <FileUp className="h-4 w-4" />
                Restore Full Backup JSON
                <input className="hidden" type="file" accept="application/json" onChange={(event) => importBackup(event.target.files?.[0])} />
              </label>
            </div>
          </div>

          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-sm font-black text-white">AI Formatting Help</summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-iron-400">Use one prompt for both exercises and workout history. Legacy Exercises-tab spreadsheets still work too.</p>
              <button className="btn-secondary w-full" onClick={() => copyPrompt("training")}>
                <Copy className="h-4 w-4" />
                {copiedPrompt === "training" ? "Copied!" : "Copy AI Formatting Prompt"}
              </button>
              <button className="btn-secondary w-full text-xs" onClick={() => copyPrompt("headers")}>
                <Copy className="h-4 w-4" />
                {copiedPrompt === "headers" ? "Copied!" : "Copy Headers"}
              </button>
              <details className="rounded-lg border border-white/10 bg-iron-950/60 p-3 text-xs text-iron-300">
                <summary className="cursor-pointer font-bold">Show Expected Columns</summary>
                <pre className="mt-3 whitespace-pre-wrap font-mono text-[0.7rem] text-iron-400">{TRAINING_DATA_HEADER_SECTIONS}</pre>
              </details>
            </div>
          </details>

          <details className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-sm font-black text-white">Advanced CSV Options</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-iron-400">These are the original technical import/export actions. Most people should use the main Import / Export buttons above.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="btn-secondary w-full"
                  onClick={() => downloadExercisesCSV(userExercises, db.exercises, userBaselines)}
                >
                  <FileDown className="h-4 w-4" />
                  Export Exercises CSV
                </button>
                <button
                  className="btn-secondary w-full"
                  onClick={() => downloadWorkoutHistoryCSV(db, user)}
                >
                  <FileDown className="h-4 w-4" />
                  Export Workout History CSV
                </button>
                <button className="btn-secondary w-full" onClick={() => setShowWorkoutImportFlow(true)}>
                  <FileUp className="h-4 w-4" />
                  Import Workout History CSV
                </button>
                <button className="btn-secondary w-full" onClick={() => setShowExerciseImportFlow(true)}>
                  <FileUp className="h-4 w-4" />
                  Import Exercises / Baselines CSV
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button className="btn-secondary w-full text-xs" onClick={() => copyPrompt("exercise_headers")}>
                  <Copy className="h-4 w-4" />
                  {copiedPrompt === "exercise_headers" ? "Copied!" : "Copy Exercise Headers"}
                </button>
                <button className="btn-secondary w-full text-xs" onClick={() => copyPrompt("workout_headers")}>
                  <Copy className="h-4 w-4" />
                  {copiedPrompt === "workout_headers" ? "Copied!" : "Copy Workout History Headers"}
                </button>
              </div>
            </div>
          </details>
        </div>
      </Panel>
      <Modal open={showUnifiedImportFlow} onClose={() => setShowUnifiedImportFlow(false)} title="Import Training Data">
        <ImportTrainingDataFlow db={db} user={user} updateDb={updateDb} onClose={() => setShowUnifiedImportFlow(false)} />
      </Modal>
      <Modal open={showWorkoutImportFlow} onClose={() => setShowWorkoutImportFlow(false)} title="Import Workout History">
        <ImportWorkoutCSVFlow db={db} user={user} updateDb={updateDb} onClose={() => setShowWorkoutImportFlow(false)} />
      </Modal>
      <Modal open={showExerciseImportFlow} onClose={() => setShowExerciseImportFlow(false)} title="Import Exercises / Baselines">
        <ImportExercisesFlow db={db} user={user} updateDb={updateDb} onClose={() => setShowExerciseImportFlow(false)} />
      </Modal>
    </>
  );
}

export default App;
