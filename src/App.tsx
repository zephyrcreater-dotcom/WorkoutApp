import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
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
  X
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
  exerciseAllowedByCompoundSettings,
  fatigueRatingForExercise,
  getBlockExercisePrescription,
  isCompound,
  isSbdExercise,
  sessionFatigueScore
} from "./lib/programmingLogic";
import {
  buildFatigueBudget,
  getExerciseFatigueTag,
  getGoalUsed,
  getSameExerciseBaseline,
  getRequirementSlotPlan,
  getTrainingTargets,
  inferBaseExerciseRole,
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
import { getEffectiveLoading } from "./lib/loadingProfiles";
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

const navItems: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: "today", label: "Today", icon: Dumbbell },
  { id: "week", label: "Week", icon: ClipboardList },
  { id: "programs", label: "Block", icon: CalendarDays },
  { id: "library", label: "Library", icon: Library },
  { id: "progress", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
];

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

// Common muscles shown by default in the secondary muscles picker (collapsed view).
// Less-common muscles are hidden behind "Show all muscles".
const COMMON_SECONDARY_MUSCLES: MuscleGroup[] = [
  "chest", "back", "upper-back", "lats", "triceps", "biceps",
  "front-delts", "side-delts", "rear-delts", "quads", "hamstrings", "glutes", "abs",
];

// Parent muscle groups: broad categories whose requirements can be satisfied by specific child muscles.
// Specific child muscles (lats, upper-back, etc.) must match EXACTLY — no fallback alias expansion.
const PARENT_MUSCLE_CHILDREN: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  "back": ["lats", "upper-back", "mid-back", "traps", "spinal-erectors"],
  "chest": ["upper-chest", "lower-chest"],
  "quads": ["quads"],
  "hamstrings": ["hamstrings"],
  "glutes": ["glutes"],
  "biceps": ["biceps"],
  "triceps": ["triceps"],
};

// Whether a requirement muscle is a broad parent category.
function isParentMuscle(muscle: MuscleGroup): boolean {
  return muscle in PARENT_MUSCLE_CHILDREN;
}

// An exercise satisfies a requirement if:
// 1. The exact targetMuscle is in the exercise's primaryMuscles (always works).
// 2. OR the requirement is a broad parent and one of its children is in primaryMuscles (parent-only fallback).
// Secondary muscles and directVolumeMuscles are NOT used for requirement completion.
function exerciseFulfillsRequirement(exercise: Exercise, req: SplitDayRequirement): boolean {
  const primary = exercise.primaryMuscles;
  if (primary.includes(req.targetMuscle)) return true;
  if (isParentMuscle(req.targetMuscle)) {
    const children = PARENT_MUSCLE_CHILDREN[req.targetMuscle] ?? [];
    return primary.some((m) => children.includes(m));
  }
  return false;
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
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
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
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-volt text-iron-950">
                <Dumbbell className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-iron-400">Iron Orbit</p>
                <h1 className="text-2xl font-black text-white">Choose how you want to train today</h1>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-volt/30 bg-volt/10 p-4">
              <p className="text-sm font-black text-white">Continue Local Only</p>
              <p className="mt-1 text-sm text-iron-200">Saved on this device only. Nothing is sent to the cloud until you intentionally sign in later.</p>
              <button className="btn-primary mt-4 w-full sm:w-auto" onClick={cloud.continueLocalOnly}>
                <ChevronRight className="h-4 w-4" />
                Continue Local Only
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-iron-950/50 p-4 text-sm text-iron-300">
              <p className="font-bold text-white">Account mode</p>
              <p className="mt-1">Sign in to sync across devices. Local-only data stays separate unless you explicitly import it later.</p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-black text-white">Sign In / Sign Up</p>
            <p className="mt-1 text-sm text-iron-300">Sync across devices with your Supabase account.</p>
            <form className="mt-5 space-y-3" onSubmit={handleSignIn}>
              <TextField label="Email" type="email" value={authEmail} onChange={setAuthEmail} />
              <TextField label="Password" type="password" value={authPassword} onChange={setAuthPassword} />
              <div className="rounded-2xl border border-white/10 bg-iron-950/50 p-3 text-xs text-iron-400">
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

  const persistedActiveSession = db.sessions.find((session) => session.userId === currentUser.id && (session.status === "in-progress" || session.status === "review"));
  const activeSession = activeSessionId ? db.sessions.find((session) => session.id === activeSessionId) || persistedActiveSession : persistedActiveSession;
  const appDb = db;
  const currentUserId = currentUser.id;

  function openCompletedSessionReview(sessionId: string, returnScreen: CompletedReviewState["returnScreen"]) {
    setCompletedReviewState({ sessionId, returnScreen });
    setResumeMessage(undefined);
    setScreen("completed-review");
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
    setScreen("logger");
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
      ? appDb.sessions.find((candidate) => candidate.id === requestedSessionId && candidate.userId === currentUserId)
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
      setScreen("logger");
      return;
    }

    const resumeState = resolveWorkoutResumeState(appDb, currentUserId, requestedSessionId);
    if (resumeState.kind === "ready" || resumeState.kind === "no-exercises") {
      setResumeMessage(undefined);
      setActiveSessionId(resumeState.session.id);
      setScreen("logger");
      return;
    }

    console.error("Workout resume failed", {
      userId: currentUserId,
      requestedSessionId,
      reason: resumeState.reason,
      activeSessionId,
    });
    setActiveSessionId(undefined);
    setResumeMessage("That workout could not be resumed.");
    setScreen("today");
  }

  return (
    <div className="min-h-dvh max-w-full pb-32 text-white lg:pb-0">
      <header className="safe-top sticky top-0 z-30 border-b border-white/[0.08] bg-iron-950/90 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 py-3">
          <button className="flex min-w-0 items-center gap-2.5 text-left" onClick={() => setScreen("today")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-volt text-iron-950">
              <Dumbbell className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">Iron Orbit</p>
              <p className="truncate text-xs text-iron-500">
                {authMode === "cloud" && cloud.userEmail ? `${currentUser.displayName} · ${cloud.userEmail}` : "Local only"}
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
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="sticky top-20 hidden h-fit rounded-xl border border-white/[0.08] bg-iron-900/50 p-2 lg:block">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                screen === item.id
                  ? "bg-white/[0.1] font-semibold text-volt"
                  : "font-medium text-iron-400 hover:bg-white/[0.06] hover:text-iron-200"
              }`}
              onClick={() => setScreen(item.id)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
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
              resumeMessage={resumeMessage}
              clearResumeMessage={() => setResumeMessage(undefined)}
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
                onEditWorkout={() => void resumeWorkoutSession(completedReviewState.sessionId, {
                  previousScreen: completedReviewState.returnScreen,
                  completedReviewState,
                  loggerMode: "completed-edit",
                })}
                backLabel={completedReviewState.returnScreen === "week" ? "Back to Week" : "Back to Today"}
              />
            );
          })()}
          {screen === "programs" && <BuilderScreen db={db} user={currentUser} updateDb={updateDb} setScreen={setScreen} />}
          {screen === "library" && <LibraryScreen db={db} user={currentUser} updateDb={updateDb} authMode={authMode} cloudStatus={cloud.status} />}
          {screen === "week" && <WeekProgressScreen db={db} user={currentUser} setScreen={setScreen} planWeekRequest={planWeekRequest} onPlanWeekRequestHandled={() => setPlanWeekRequest(undefined)} editingWeekNumber={editingWeekNumber} onEditingWeekNumberChange={setEditingWeekNumber} updateDb={updateDb} onResumeWorkout={resumeWorkoutSession} onOpenCompletedSessionReview={openCompletedSessionReview} />}
          {screen === "progress" && <ProgressScreen db={db} user={currentUser} updateDb={updateDb} />}
          {screen === "settings" && <SettingsScreen db={db} user={currentUser} updateDb={updateDb} importDb={importDb} reseed={reseed} cloud={cloud} authMode={authMode} />}
        </section>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-iron-950/95 px-2 py-1.5 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-6 gap-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.62rem] font-medium transition ${
                screen === item.id ? "text-volt" : "text-iron-500"
              }`}
              onClick={() => setScreen(item.id)}
            >
              <item.icon className={`h-5 w-5 ${screen === item.id ? "text-volt" : "text-iron-500"}`} />
              {item.label}
            </button>
          ))}
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
  resumeMessage,
  clearResumeMessage
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
  resumeMessage?: string;
  clearResumeMessage: () => void;
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

  type OffProgramExerciseDraft = { exerciseId: string; targetSets: number; targetReps: number; targetRpe: number; plannedWeight?: number };
  const [offProgramBuilder, setOffProgramBuilder] = useState<{ active: boolean; exercises: OffProgramExerciseDraft[] }>({ active: false, exercises: [] });
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
    setOffProgramBuilder({ active: true, exercises: [] });
    setShowOffProgramPicker(false);
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

  if (offProgramBuilder.active) {
    return (
      <div className="space-y-5">
        <PageTitle eyebrow="Off-Program Builder" title="Build your individual workout before starting." />
        <section className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="label text-volt">Selected exercises</p>
              <p className="text-xs text-iron-400">Tap an exercise below to add it. Weight targets come from your training history.</p>
            </div>
            <button className="btn-ghost" onClick={() => setOffProgramBuilder({ active: false, exercises: [] })}>Cancel</button>
          </div>
          {offProgramBuilder.exercises.length > 0 ? (
            <div className="mb-4 space-y-3">
              {offProgramBuilder.exercises.map((item, idx) => {
                const ex = db.exercises.find((e) => e.id === item.exerciseId);
                const suggestedWeight = getOffProgramStartingWeight({ db, user, exercise: ex, targetReps: item.targetReps, targetRpe: item.targetRpe });
                const lastLog = getLatestExercisePerformanceLog(db, user.id, item.exerciseId);
                return (
                  <div key={item.exerciseId} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{idx + 1}. {ex?.name}</p>
                        {lastLog && <p className="text-xs text-iron-400">Last logged: {lastLog.weight} {user.unit} × {lastLog.reps}</p>}
                        {suggestedWeight ? <p className="text-xs text-volt">Starting weight: {suggestedWeight} {user.unit}</p> : <p className="text-xs text-iron-500">No saved starting weight yet.</p>}
                      </div>
                      <button className="btn-ghost text-orange-200 text-xs" onClick={() => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.filter((_, i) => i !== idx) }))}>Remove</button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div>
                        <p className="label text-[0.65rem]">Sets</p>
                        <input className="field mt-1 py-1 text-center text-sm" type="number" min={1} value={item.targetSets} onChange={(e) => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.map((ex2, i) => i === idx ? { ...ex2, targetSets: Math.max(1, Number(e.target.value) || 1) } : ex2) }))} />
                      </div>
                      <div>
                        <p className="label text-[0.65rem]">Reps</p>
                        <input className="field mt-1 py-1 text-center text-sm" type="number" min={1} value={item.targetReps} onChange={(e) => setOffProgramBuilder((b) => ({ ...b, exercises: b.exercises.map((ex2, i) => i === idx ? { ...ex2, targetReps: Math.max(1, Number(e.target.value) || 1) } : ex2) }))} />
                      </div>
                      <div>
                        <p className="label text-[0.65rem]">RPE</p>
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

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Today" title="Training" />
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
      {activeProgram && !selectedDay && (
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
      {activeProgram && selectedDay && weekLocked && (
        <section className="panel border-amber-500/20 p-4">
          <p className="label text-amber-400">Week {currentWeekNumber} not ready</p>
          <h2 className="mt-1 font-semibold">{isWeekDraft(todayPlan?.week) || weekBeingEdited ? "Planning in progress" : "Plan this week before training"}</h2>
          <p className="mt-1 text-sm text-iron-400">
            Finish planning and save Week {currentWeekNumber} before starting this workout.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => onPlanWeek(currentWeekNumber)}>
              <CalendarDays className="h-4 w-4" /> Plan Week {currentWeekNumber}
            </button>
            <button className="btn-ghost" onClick={goOffProgram}>
              <Shuffle className="h-3.5 w-3.5" /> Off Program
            </button>
          </div>
        </section>
      )}
      {/* Week ready: show normal workout card */}
      {activeProgram && selectedDay && !weekLocked && (
        <section className="panel p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div>
              <p className="label">Up next</p>
              <h2 className="mt-1 text-xl font-bold">{selectedDay.name}</h2>
              <p className="mt-1 text-sm text-iron-400">
                {[todayPlan?.label, selectedDay.focus, selectedDay.exercises.length ? `~${estimateWorkoutDuration(selectedDay)} min` : null].filter(Boolean).join(" · ")}
              </p>
              {!selectedDay.exercises.length && (
                <p className="mt-2 text-sm text-iron-500">
                  Week {currentWeekNumber} hasn&apos;t been planned yet.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              {selectedDay.status === "rest" ? (
                <button className="btn-primary w-full md:w-auto" onClick={() => updateActiveBlockProgress("rest-complete")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Mark Rest Complete
                </button>
              ) : selectedDay.exercises.length ? (
                <button className="btn-primary w-full md:w-auto" onClick={() => startWorkout(selectedDay)}>
                  <Timer className="h-4 w-4" />
                  {resumableSelectedDaySession?.status === "review" ? "Review Workout" : resumableSelectedDaySession ? "Resume Workout" : "Start Workout"}
                </button>
              ) : (
                <button className="btn-primary w-full md:w-auto" onClick={() => onPlanWeek(currentWeekNumber)}>
                  <CalendarDays className="h-4 w-4" />
                  Plan Week {currentWeekNumber}
                </button>
              )}
              {otherInProgressSession && (
                <button className="btn-secondary w-full md:w-auto" onClick={() => void onResumeWorkout(otherInProgressSession.id, { previousScreen: "today" })}>
                  Resume Other In-Progress
                </button>
              )}
            </div>
          </div>
          <div className="compact-actions">
            <button className="btn-compact" onClick={() => updateActiveBlockProgress("previous")}>← Back</button>
            <button className="btn-compact" onClick={() => updateActiveBlockProgress("next")}>Next Day</button>
            <button className="btn-compact" onClick={() => updateActiveBlockProgress("skip")}>Skip</button>
            {selectedDay.status !== "rest" && selectedDay.exercises.length > 0 && (
              <>
                <button className="btn-compact ml-auto" onClick={() => setShowEditDay((v) => !v)}>
                  <Pencil className="h-3 w-3" />
                  {showEditDay ? "Done" : "Edit"}
                </button>
                <button className="btn-compact" onClick={goOffProgram}>
                  <Shuffle className="h-3 w-3" />
                  Off Program
                </button>
              </>
            )}
          </div>
        </section>
      )}
      {recentCompletedSessions.length > 0 && (
        <section className="list-section">
          <p className="list-section-header">Completed today</p>
          {recentCompletedSessions.map((session, i) => (
            <div key={session.id}>
              {i > 0 && <div className="list-divider" />}
              <button
                className="list-row-tap"
                onClick={() => onOpenCompletedSessionReview(session.id, "today")}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-volt/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-iron-100">{session.name}</p>
                  <p className="text-xs text-iron-500">
                    {(session.completedAt || session.updatedAt) ? formatDateTime(session.completedAt || session.updatedAt || session.startedAt) : "Completed today"} · {countSessionCompletedSets(session)} sets
                  </p>
                </div>
                <button
                  className="btn-compact shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onResumeWorkout(session.id, {
                      previousScreen: "today",
                      completedReviewState: { sessionId: session.id, returnScreen: "today" },
                      loggerMode: "completed-edit",
                    });
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <ChevronRight className="h-4 w-4 shrink-0 text-iron-600" />
              </button>
            </div>
          ))}
        </section>
      )}
      {showEditDay && selectedDay && activeProgram && !weekLocked && (
        <section className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="label text-volt">Editing this planned day</p>
              <h3 className="font-black">{selectedDay.name}</h3>
              <p className="text-xs text-iron-400">Changes apply to this day and week only. Completed workout history is not affected.</p>
            </div>
            <button className="btn-secondary" onClick={() => setShowEditDay(false)}>Done</button>
          </div>
          <WorkoutDayEditor db={db} user={user} program={activeProgram} day={selectedDay} updateDb={updateDb} showNameFocusFields={false} />
        </section>
      )}
      {selectedDay && !weekLocked && selectedDay.status !== "rest" && <WorkoutDayView db={db} user={user} day={selectedDay} />}
    </div>
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
  const sessionRecord = db.sessions.find((item) => item.id === sessionId && item.userId === user.id);
  const [activeExerciseId, setActiveExerciseId] = useState(sessionRecord?.loggedExercises[sessionRecord.currentExerciseIndex || 0]?.id || sessionRecord?.loggedExercises[0]?.id);
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
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const lineupItems = useMemo(
    () => activeExerciseLog ? buildLoggerLineupItems(activeExerciseLog, plannedSets) : [],
    [activeExerciseLog, plannedSets]
  );
  const editingLineupItem = editingSetId ? lineupItems.find((item) => item.actualSet?.id === editingSetId) : undefined;
  const effectiveSetIndex = editingLineupItem
    ? (editingLineupItem.plannedIndex ?? currentSetIndex)
    : (selectedLoggingIndex ?? currentSetIndex);
  const currentPlannedSet = editingLineupItem?.plannedSet ?? plannedSets[effectiveSetIndex];
  const lastSet = activeExerciseLog?.sets.at(-1);
  const selectedActualSet = editingLineupItem?.actualSet;
  const previousCompletedSet = activeExerciseLog ? findPreviousCompletedSet(activeExerciseLog.sets, effectiveSetIndex) : undefined;
  const draftKey = editingLineupItem?.actualSet
    ? `edit:${editingLineupItem.actualSet.id}`
    : `${activeExerciseLog?.id || "none"}:${effectiveSetIndex}`;
  const [setDraft, setSetDraft] = useState(() => buildDraftFromSet({
    actualSet: editingLineupItem?.actualSet,
    plannedSet: currentPlannedSet,
    previousCompletedSet,
    draftKey,
  }));
  const [draftDirty, setDraftDirty] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showAddExercisePicker, setShowAddExercisePicker] = useState(false);
  const [showSkipExerciseConfirm, setShowSkipExerciseConfirm] = useState(false);
  const [showMachineSelector, setShowMachineSelector] = useState(false);
  const [showSetNotes, setShowSetNotes] = useState(false);
  const [showCompletionSummary, setShowCompletionSummary] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<{ score: number; status: string; hardSets: number; skippedSets: number; completedSets: number; suggestions: string[] } | null>(null);
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
  const skipSetHoldTimerRef = useRef<number | null>(null);
  const skipSetLongPressTriggeredRef = useRef(false);
  const skipSetHoldStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [setContextMenuId, setSetContextMenuId] = useState<string | null>(null);
  const [exerciseContextMenuId, setExerciseContextMenuId] = useState<string | null>(null);
  const exerciseLongPressTimerRef = useRef<number | null>(null);
  const activeGym = db.gyms.find((gym) => gym.id === session?.gymId && gym.userId === user.id);
  const compatibleMachines = activeGym?.machines.filter((machine) => machine.exerciseIds.includes(activeExerciseLog?.exerciseId || "") || !machine.exerciseIds.length) || [];

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
  const adjustedWeight = weightRec?.recommendedWeight ?? undefined;
  const selectionDraftSeed = useMemo(() => buildDraftFromSet({
    actualSet: editingLineupItem?.actualSet,
    plannedSet: currentPlannedSet,
    previousCompletedSet,
    draftKey,
    recommendedWeight: adjustedWeight,
  }), [adjustedWeight, currentPlannedSet, draftKey, editingLineupItem?.actualSet, previousCompletedSet]);

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
    setSetDraft(selectionDraftSeed);
    setShowSetNotes(false);
  }, [draftDirty, selectionDraftSeed]);

  useEffect(() => {
    return () => {
      if (skipSetHoldTimerRef.current !== null) {
        window.clearTimeout(skipSetHoldTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setRecentlyAppliedRecommendationKey(null);
  }, [draftKey]);

  useEffect(() => {
    // Reset set navigation and UI state when switching exercises
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    setDraftDirty(false);
    setPendingDeleteTarget(null);
    setShowSetNotes(false);
    setShowMachineSelector(false);
    setShowSkipExerciseConfirm(false);
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
  }, [activeExerciseId]);

  useEffect(() => {
    setPendingDeleteTarget(null);
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    setDraftDirty(false);
    setShowSkipExerciseConfirm(false);
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
  }, [sessionId]);

  useEffect(() => {
    if (isSwipeEnabled) return;
    setOpenSwipeSetId(undefined);
    swipeGestureRef.current = null;
    setSwipeDrag(null);
  }, [isSwipeEnabled]);

  useEffect(() => {
    if (resumeState.kind === "ready" && activeExerciseId !== resumeState.activeExerciseId) {
      setActiveExerciseId(resumeState.activeExerciseId);
      return;
    }
    if (session && !activeExerciseId) setActiveExerciseId(session.loggedExercises[session.currentExerciseIndex || 0]?.id);
  }, [activeExerciseId, resumeState, session]);

  useEffect(() => {
    if (resumeState.kind !== "ready" || !session) return;
    if (
      session.currentExerciseIndex === resumeState.activeExerciseIndex
      && (session.currentSetIndex ?? getResumeSetIndex(activeExerciseLog!, plannedSets)) === resumeState.currentSetIndex
    ) return;
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === session.id);
      if (!target) return draft;
      target.currentExerciseIndex = resumeState.activeExerciseIndex;
      target.currentSetIndex = resumeState.currentSetIndex;
      target.updatedAt = nowIso();
      return draft;
    });
  }, [activeExerciseLog, plannedSets, resumeState, session, updateDb]);

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
    const openRowStillExists = activeExerciseLog?.sets.some((set) => set.id === openSwipeSetId) ?? false;
    if (!openRowStillExists) {
      setOpenSwipeSetId(undefined);
      swipeGestureRef.current = null;
      setSwipeDrag(null);
    }
  }, [activeExerciseLog, openSwipeSetId]);

  useEffect(() => {
    if (!editingSetId) return;
    const editingSetStillExists = lineupItems.some((item) => item.actualSet?.id === editingSetId);
    if (!editingSetStillExists) setEditingSetId(null);
  }, [editingSetId, lineupItems]);

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
              className="btn-primary col-span-2"
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
              setActiveSessionId(undefined);
              setScreen("today");
            }}
          >
            Cancel
          </button>
        </div>
        {showAddExercisePicker && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
            <section className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/10 bg-iron-950 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-xl font-black">Add exercise</h3>
                <button className="btn-ghost" onClick={() => setShowAddExercisePicker(false)}>Cancel</button>
              </div>
              <ExercisePicker
                db={db}
                user={user}
                onPick={(ex) => {
                  setShowAddExercisePicker(false);
                  setPendingOffProgramExercise(ex);
                }}
              />
            </section>
          </div>
        )}
        {pendingOffProgramExercise && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
            <div className="panel w-full max-w-sm space-y-4 p-6">
              <h3 className="text-xl font-black">Add {pendingOffProgramExercise.name}</h3>
              <div className="space-y-2">
                <button
                  className="btn-primary w-full"
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
  const primaryAction = currentSetWouldCompleteWorkout
    ? "finish-workout"
    : currentSetWouldCompleteExercise
      ? "finish-exercise"
      : "next-set";
  const primaryActionLabel = isEditingLoggedSet
    ? selectedActualSet?.skipped && (Number(setDraft.actualWeight) > 0 || Number(setDraft.actualReps) > 0) ? "Log Set" : "Save Changes"
    : primaryAction === "finish-workout" ? "Finish Workout"
    : primaryAction === "finish-exercise" ? "Finish Exercise"
    // If current pending set has valid values, it must be saved before finishing — show Save Set
    : hasDraftValidValues ? "Save Set"
    // Out-of-order: user jumped to a pending set that isn't the natural next set — call it "Save Set"
    : selectedLoggingIndex !== null && selectedLoggingIndex !== currentSetIndex ? "Save Set"
    : "Next Set";
  const plannedLineupItems = lineupItems.filter((item) => !item.isExtra);
  const completedPlannedCount = plannedLineupItems.filter((item) => !!item.actualSet).length;
  const totalPlannedCount = plannedLineupItems.length;
  const allExercisesComplete = liveSession.loggedExercises.every((logged) => {
    return isLoggedExerciseComplete(logged, db, liveSession);
  });

  function addReadiness(input: Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">) {
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

  function clearSkipSetHold() {
    if (skipSetHoldTimerRef.current !== null) {
      window.clearTimeout(skipSetHoldTimerRef.current);
      skipSetHoldTimerRef.current = null;
    }
  }

  function startSkipSetHold(e: React.PointerEvent) {
    if (isPastLastPlannedSet || isEditingLoggedSet) return;
    clearSkipSetHold();
    skipSetLongPressTriggeredRef.current = false;
    skipSetHoldStartPosRef.current = { x: e.clientX, y: e.clientY };
    skipSetHoldTimerRef.current = window.setTimeout(() => {
      skipSetLongPressTriggeredRef.current = true;
      skipSetHoldTimerRef.current = null;
      setShowSkipExerciseConfirm(true);
      setShowFinishConfirm(false);
    }, 600);
  }

  // Only cancel on move when pointer has drifted more than 10px — prevents mobile micro-tremors from cancelling a valid hold.
  function cancelSkipSetHoldOnMove(e: React.PointerEvent) {
    if (!skipSetHoldStartPosRef.current) return;
    const dx = Math.abs(e.clientX - skipSetHoldStartPosRef.current.x);
    const dy = Math.abs(e.clientY - skipSetHoldStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearSkipSetHold();
      skipSetHoldStartPosRef.current = null;
    }
  }

  function cancelSkipSetHold() {
    clearSkipSetHold();
    skipSetHoldStartPosRef.current = null;
  }

  function handleSkipSetPress() {
    if (skipSetLongPressTriggeredRef.current) {
      skipSetLongPressTriggeredRef.current = false;
      return;
    }
    skipSet();
  }

  function logSet(rating: SetRating = setDraft.setRating, afterAction: "stay" | "next-exercise" | "finish-workout" = "stay") {
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
        if (log && editingActualIndex >= 0 && log.sets[editingActualIndex]) {
          log.sets[editingActualIndex] = updatedSet;
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
      setDraftDirty(false);
      // After saving an edit, re-anchor to the first planned set not yet covered.
      // loggedPlannedSetIds reflects pre-save state; editing an existing set doesn't change coverage.
      const firstUncoveredIdx = plannedSets.findIndex((ps) => !loggedPlannedSetIds.has(ps.id));
      if (firstUncoveredIdx >= 0) {
        setSelectedLoggingIndex(firstUncoveredIdx);
        setTimeout(() => {
          const el = setLineupRef.current?.querySelector<HTMLElement>('[data-is-current-set="true"]');
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
      } else {
        // All sets covered — navigate to next exercise (exercise is done).
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
    setSelectedLoggingIndex(null);
    setEditingSetId(null);
    setDraftDirty(false);
    setRestRemaining(planned?.restSeconds || user.settings.defaultRestSeconds);
    // Coverage-based: pre-compute where getResumeSetIndex will land after this set is pushed,
    // so the draft key matches the effect's expected key and avoids a stale intermediate render.
    const nextUncoveredIndex = getResumeSetIndex({ ...liveExerciseLog, sets: [...liveExerciseLog.sets, loggedSet] }, plannedSets);
    setSetDraft(emptySetDraft(plannedSets[nextUncoveredIndex] ?? null, loggedSet, `${liveExerciseLog.id}:${nextUncoveredIndex}`));
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

  function addSet() {
    const base = currentPlannedSet || plannedSets.at(-1);
    const extra: PlannedSet = {
      ...(base || { id: createId("pset"), kind: "working" as const, targetReps: 8, targetRpe: 7 }),
      id: createId("pset"),
      kind: "working",
      setNumber: (plannedSets.length || currentSetIndex) + 1,
      percentageOfTopSet: base?.percentageOfTopSet,
      notes: "Added set."
    };
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === liveSession.programId);
      const targetPlanned = targetProgram?.blocks.flatMap((block) => block.weeks).flatMap((week) => week.workouts).flatMap((day) => day.exercises).find((item) => item.id === liveExerciseLog.plannedExerciseId);
      if (targetPlanned) targetPlanned.plannedSets.push(extra);
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (target) {
        if (editingCompletedWorkout && target.status === "completed") {
          target.status = "in-progress";
        } else if (!preserveCompletedStatus(target) && (target.status === "completed" || target.status === "review")) {
          target.status = "in-progress";
        }
        target.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function previousSet() {
    const targetIndex = Math.max(0, effectiveSetIndex - 1);
    setEditingSetId(null);
    setSelectedLoggingIndex(targetIndex);
    setDraftDirty(false);
    setShowSetNotes(false);
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
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log && plannedSets.length) {
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
    // Hard guard: if the current on-screen pending set has valid draft values, save it first.
    // This fires from the smart primary action and from past-the-end navigation.
    const currentDraftWeight = Number(setDraft.actualWeight) || 0;
    const currentDraftReps = Number(setDraft.actualReps) || 0;
    const hasValidUnsavedValues = !isEditingLoggedSet && !isPastLastPlannedSet
      && currentPendingSetIsUncovered
      && (currentDraftWeight > 0 || (!liveExercise.bestTrackedBy.includes("time") && currentDraftReps > 0));
    if (hasValidUnsavedValues) {
      // If this is the last uncovered set, save-and-navigate in one action.
      // Otherwise save-and-stay so user can deal with remaining uncovered sets.
      const afterSave = uncoveredPlannedSets.length <= 1
        ? (hasMoreExercises ? "next-exercise" : "finish-workout")
        : "stay";
      logSet(setDraft.setRating, afterSave);
      return;
    }
    // If any planned sets are still uncovered (no logged set matched), confirm skip.
    if (!allPlannedSetsCovered) {
      setShowFinishConfirm(true);
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
    setActiveSessionId(undefined);
    setScreen("today");
  }

  function applySuggestion(nextRecommendation?: Recommendation) {
    if (!nextRecommendation?.action?.suggestedWeight) return;
    const suggestedWeight = nextRecommendation.action.suggestedWeight;
    setSetDraft((current) => applyRecommendationToCurrentDraft(current, nextRecommendation, currentPlannedSet));
    setDraftDirty(true);
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
      target.loggedExercises.push({
        id: newLogId,
        exerciseId: exercise.id,
        plannedExerciseId: undefined,
        order: target.loggedExercises.length + 1,
        sets: [],
        weakPointTags: [],
        offProgram: true,
        offProgramPlannedSets: buildOffProgramPlannedSets(3, 8, 7, plannedWeight),
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
              <button className="btn-primary" onClick={skipRemainingAndNavigate}>Skip & Finish</button>
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
                  const targetDelete = pendingDeleteTarget;
                  setPendingDeleteTarget(null);
                  void updateDb((draft) => {
                    const target = draft.sessions.find((item) => item.id === liveSession.id);
                    const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
                    if (log && targetDelete) {
                      if (targetDelete.actualSetId) {
                        const deletedIndex = log.sets.findIndex((set) => set.id === targetDelete.actualSetId);
                        const deletedSet = deletedIndex >= 0 ? log.sets[deletedIndex] : undefined;
                        if (deletedIndex >= 0) log.sets.splice(deletedIndex, 1);
                        if (deletedSet?.plannedSetId) {
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
                  setSelectedLoggingIndex(null);
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
                  if (menuLog && menuLog.id !== activeExerciseLog.id) {
                    setActiveExerciseId(menuLog.id);
                    setSelectedLoggingIndex(null);
                    setEditingSetId(null);
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
            ]}
          />
        );
      })()}
      {setContextMenuId && (() => {
        const menuActual = liveExerciseLog.sets.find((s) => s.id === setContextMenuId);
        const menuLineup = lineupItems.find((item) => item.actualSet?.id === setContextMenuId || (item.actualSet === undefined && item.plannedSet?.id === setContextMenuId));
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
                  if (menuActual) {
                    setSelectedLoggingIndex(null);
                    setEditingSetId(menuActual.id);
                  } else if (menuLineup?.plannedIndex !== undefined) {
                    setEditingSetId(null);
                    setSelectedLoggingIndex(menuLineup.plannedIndex);
                  }
                },
              },
              {
                label: "Skip Set",
                icon: <X className="h-4 w-4" />,
                destructive: true,
                disabled: !canSkip,
                onClick: skipSet,
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
                className="btn-primary w-full"
                onClick={() => {
                  // Real finalization: compute scores, create perf logs, advance block.
                  void updateDb((draft) => {
                    const target = draft.sessions.find((item) => item.id === liveSession.id);
                    if (target) finishWorkoutInDraft(draft, user, target);
                    return draft;
                  });
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
      <PageTitle eyebrow="Live Logger" title={session.name} />
      {editingCompletedWorkout && (
        <section className="rounded-lg border border-volt/30 bg-volt/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="label text-volt">Editing completed workout</p>
              <p className="mt-1 text-sm text-iron-200">Edit sets, add exercises, then save the workout again.</p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {navigation.completedReviewState && (
                <button className="btn-secondary w-full sm:w-auto" onClick={backToSummary}>
                  Back to Summary
                </button>
              )}
              <button className="btn-secondary w-full sm:w-auto" onClick={backToToday}>
                Back to Today
              </button>
            </div>
          </div>
        </section>
      )}
      {!session.readiness && <ReadinessCard onSubmit={addReadiness} user={user} />}
      {session.readiness && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="label">Readiness</p>
              <p className="mt-1 text-xl font-bold">{session.readiness.readinessScore}<span className="text-sm font-normal text-iron-500">/100</span></p>
            </div>
            <p className="text-xs text-iron-500">{readinessAdjustment(session.readiness).explanation}</p>
          </div>
        </div>
      )}

      <section className="grid min-w-0 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="panel h-fit min-w-0 p-2.5">
          <p className="label mb-2.5 px-1">Exercises</p>
          <div className="space-y-0.5">
            {session.loggedExercises.map((logged) => {
              const item = db.exercises.find((candidate) => candidate.id === logged.exerciseId);
              const isActive = activeExerciseLog.id === logged.id;
              const hardSets = logged.sets.filter(isHardSet).length;
              const skippedSets = logged.sets.filter(s => s.skipped).length;
              return (
                <button
                  key={logged.id}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
                    isActive
                      ? "bg-white/[0.12] text-white ring-1 ring-inset ring-volt/40"
                      : "text-iron-300 hover:bg-white/[0.06] hover:text-iron-100"
                  }`}
                  onClick={() => {
                    setActiveExerciseId(logged.id);
                    setSelectedLoggingIndex(null);
                    setEditingSetId(null);
                    setOpenSwipeSetId(undefined);
                    swipeGestureRef.current = null;
                    setSwipeDrag(null);
                    setPendingDeleteTarget(null);
                  }}
                  onPointerDown={() => {
                    if (exerciseLongPressTimerRef.current) clearTimeout(exerciseLongPressTimerRef.current);
                    exerciseLongPressTimerRef.current = window.setTimeout(() => {
                      exerciseLongPressTimerRef.current = null;
                      setExerciseContextMenuId(logged.id);
                    }, 500);
                  }}
                  onPointerUp={() => {
                    if (exerciseLongPressTimerRef.current) { clearTimeout(exerciseLongPressTimerRef.current); exerciseLongPressTimerRef.current = null; }
                  }}
                  onPointerLeave={() => {
                    if (exerciseLongPressTimerRef.current) { clearTimeout(exerciseLongPressTimerRef.current); exerciseLongPressTimerRef.current = null; }
                  }}
                  onPointerCancel={() => {
                    if (exerciseLongPressTimerRef.current) { clearTimeout(exerciseLongPressTimerRef.current); exerciseLongPressTimerRef.current = null; }
                  }}
                >
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${isActive ? "font-semibold text-white" : "font-medium"}`}>{item?.name}</span>
                    <span className="text-xs text-iron-500">
                      {hardSets} hard{skippedSets > 0 ? ` · ${skippedSets} skipped` : ""} · {logged.sets.length} total
                    </span>
                  </span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-volt/60" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-4 pb-6">
          <section className="panel min-w-0 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="label">Logging</p>
                <h3 className="mt-1 text-xl font-bold leading-tight">{exercise.name}</h3>
                {exercise.setupCues.length > 0 && (
                  <p className="mt-1 text-sm text-iron-400">{exercise.setupCues.slice(0, 2).join(" · ")}</p>
                )}
                <p className="mt-1 text-xs text-iron-500">
                  {activeGym?.name || "No gym selected"}
                  {weightRec?.recommendedWeight
                    ? ` · suggested ${formatExerciseLoadText({ exercise: liveExercise, user, weight: weightRec.recommendedWeight, unit: exerciseUnit })} (${weightRec.confidence}%)`
                    : ""}
                </p>
              </div>
              <RestTimer seconds={restRemaining} setSeconds={setRestRemaining} />
            </div>
            {compatibleMachines.length > 0 && (
              <div className="mt-3">
                <button
                  className="text-xs font-bold text-iron-500 underline-offset-2 hover:text-iron-300"
                  onClick={() => setShowMachineSelector((v) => !v)}
                >
                  {showMachineSelector ? "Hide machine selector" : "Select machine / station"}
                </button>
                {showMachineSelector && (
                  <select
                    className="field mt-2"
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
                    <option value="">No machine selected</option>
                    {compatibleMachines.map((machine) => (
                      <option key={machine.id} value={machine.id}>{machine.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="label">Set lineup</p>
                <p className="text-xs font-medium text-iron-500">{completedPlannedCount} / {totalPlannedCount || lineupItems.length} planned</p>
              </div>
              <div ref={setLineupRef} className="space-y-1.5">
                {lineupItems.map((lineupItem) => {
                  const set = lineupItem.plannedSet;
                  const actual = lineupItem.actualSet;
                  const isEditingThisRow = !!actual && editingSetId === actual.id;
                  const isSelected = isEditingThisRow || (!isEditingLoggedSet && lineupItem.plannedIndex !== undefined && effectiveSetIndex === lineupItem.plannedIndex);
                  const isLoggedSet = !!actual;
                  const statusLabel = isEditingThisRow ? "Editing" : actual?.skipped ? "Skipped" : actual ? "Done" : isSelected ? "Current" : "Pending";
                  const swipeRowId = actual?.id;
                  const isSwipeOpen = isSwipeEnabled && !!swipeRowId && openSwipeSetId === swipeRowId;
                  // translateX is derived solely from confirmed drag or snapped-open state —
                  // never from touch start, press, or hold.
                  const isDraggingThisRow = isSwipeEnabled && !!swipeRowId && swipeDrag?.setId === swipeRowId;
                  const translateX = isDraggingThisRow
                    ? swipeDrag!.offsetX
                    : isSwipeOpen
                      ? -SWIPE_DELETE_WIDTH
                      : 0;
                  // Delete opacity and pointer-events are fully derived from translateX.
                  const deleteOpacity = Math.min(1, Math.abs(translateX) / SWIPE_DELETE_WIDTH);
                  const showSwipeDeleteReveal = isSwipeEnabled && !!actual && !actual.skipped;
                  const plannedWeightText = bodyweightMovement
                    ? formatExerciseLoadText({ exercise: liveExercise, user, weight: set?.plannedWeight, unit: exerciseUnit })
                    : set?.plannedWeight && set.plannedWeight > 0
                      ? `${formatWeight(set.plannedWeight, exerciseUnit)} ${exerciseUnit}`
                      : lineupItem.isExtra ? "Extra set" : "Enter starting weight";
                  const actualWeightText = actual && !actual.skipped
                    ? formatExerciseLoadText({ exercise: liveExercise, user, weight: actual.actualWeight, unit: actual.unit || exerciseUnit })
                    : undefined;
                  // No active: classes — content must never become transparent on press/touch.
                  const rowSurfaceClass = isEditingThisRow
                    ? "border-volt/70 bg-volt/[0.09]"
                    : isSelected
                      ? "border-volt/50 bg-volt/[0.06]"
                      : actual
                        ? "border-white/[0.1] bg-iron-900/60"
                        : "border-white/[0.06] bg-white/[0.02]";
                  const menuRowId = actual?.id ?? set?.id ?? lineupItem.key;
                  return (
                    <div
                      key={lineupItem.key}
                      data-swipe-row-id={swipeRowId}
                      data-is-current-set={isSelected && !isEditingThisRow && !actual ? "true" : undefined}
                      className="relative overflow-hidden rounded-lg"
                    >
                      {showSwipeDeleteReveal && (
                        <div
                          className="absolute inset-y-0 right-0 z-0 flex w-24 items-stretch justify-center rounded-lg bg-ember/90"
                          style={{ opacity: deleteOpacity, pointerEvents: isSwipeOpen ? "auto" : "none" }}
                        >
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
                        </div>
                      )}
                      <div
                        className={`relative z-10 rounded-lg border px-3 py-2 cursor-pointer ${rowSurfaceClass}`}
                        role="button"
                        tabIndex={0}
                        style={{
                          transform: isSwipeEnabled && translateX !== 0 ? `translateX(${translateX}px)` : undefined,
                          touchAction: isSwipeEnabled ? "pan-y" : undefined,
                          transition: isDraggingThisRow ? undefined : "transform 200ms ease",
                        }}
                        onClick={() => {
                          if (isSwipeOpen) {
                            setOpenSwipeSetId(undefined);
                            return;
                          }
                          setOpenSwipeSetId(undefined);
                          if (actual) {
                            setSelectedLoggingIndex(null);
                            setEditingSetId(actual.id);
                            return;
                          }
                          if (lineupItem.plannedIndex !== undefined) {
                            setEditingSetId(null);
                            setSelectedLoggingIndex(lineupItem.plannedIndex);
                          }
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
                              <span className={`text-xs font-medium ${isSelected && !isEditingThisRow ? "text-volt/80" : actual?.skipped ? "text-orange-400/70" : actual ? "text-iron-400" : "text-iron-600"}`}>{statusLabel}</span>
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
                                <span className={isLoggedSet && !isEditingThisRow ? "text-volt/90 font-medium" : "text-iron-400"}>
                                  {actualWeightText || getBodyweightPreviewLabel(liveExercise)} × {actual.actualReps}{actual.actualRpe ? ` @ ${actual.actualRpe}` : ""}
                                </span>
                              )}
                              {actual?.skipped && <span className="text-orange-400/60">Skipped</span>}
                              {actual && set && !actual.skipped && (
                                <span className="text-iron-700">· planned {plannedWeightText} × {set.targetReps}</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="shrink-0 rounded-md p-1 text-iron-600 transition hover:bg-white/[0.08] hover:text-iron-300 active:scale-95"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSetContextMenuId(menuRowId);
                            }}
                            title="Set options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!lineupItems.length && <EmptyState title="No planned sets" detail="Add a set or pick a planned exercise before logging." />}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BigInput label={bodyweightMovement ? `Added load (${exerciseUnit})` : `Weight (${exerciseUnit})`} value={setDraft.actualWeight} onChange={(value) => { setDraftDirty(true); setRecentlyAppliedRecommendationKey(null); setSetDraft((draft) => ({ ...draft, actualWeight: value })); }} placeholder={bodyweightMovement ? "BW" : undefined} />
              <BigInput label="Reps" value={setDraft.actualReps} onChange={(value) => { setDraftDirty(true); setRecentlyAppliedRecommendationKey(null); setSetDraft((draft) => ({ ...draft, actualReps: value })); }} />
              <BigInput label="RPE" value={setDraft.actualRpe} onChange={(value) => { setDraftDirty(true); setRecentlyAppliedRecommendationKey(null); setSetDraft((draft) => ({ ...draft, actualRpe: value })); }} step="0.5" />
            </div>
            <p className="mt-1 text-xs text-iron-600">{bodyweightMovement ? `Added-load increment: ${exerciseIncrement} ${exerciseUnit}` : `Increment: ${exerciseIncrement} ${exerciseUnit}`}</p>
            <div className="mt-4">
              <p className="label mb-2">Difficulty (1 harder · 3 as planned · 5 easy)</p>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as SetRating[]).map((rating) => {
                const labels: Record<number, string> = { 1: "1\nHarder", 2: "2\nA bit hard", 3: "3\nAs planned", 4: "4\nA bit easy", 5: "5\nEasy" };
                return (
                  <button key={rating} className={`min-h-10 rounded-lg text-[0.62rem] font-semibold leading-tight transition ${setDraft.setRating === rating ? "bg-volt text-iron-950" : "bg-white/[0.06] text-iron-400 hover:bg-white/10 hover:text-iron-200"}`} onClick={() => { setDraftDirty(true); setRecentlyAppliedRecommendationKey(null); setSetDraft((draft) => ({ ...draft, setRating: rating })); }}>
                    {labels[rating].split("\n").map((line, i) => <span key={i} className={i === 0 ? "block text-xs" : "block opacity-70"}>{line}</span>)}
                  </button>
                );
              })}
            </div>
            {/* Notes: collapsed by default to reduce friction. Data is preserved. */}
            <div className="mt-4">
              {!showSetNotes && !setDraft.notes
                ? (
                  <button className="text-xs font-bold text-iron-500 hover:text-iron-300" onClick={() => setShowSetNotes(true)}>
                    + Add note
                  </button>
                ) : (
                  <div>
                    {!showSetNotes && setDraft.notes && (
                      <button className="mb-1 text-xs font-bold text-iron-400 hover:text-iron-200" onClick={() => setShowSetNotes(true)}>
                        Note: {setDraft.notes.slice(0, 60)}{setDraft.notes.length > 60 ? "…" : ""} (tap to edit)
                      </button>
                    )}
                    {showSetNotes && (
                      <textarea
                        className="field min-h-14"
                        placeholder="Optional set notes..."
                        value={setDraft.notes}
                        onChange={(event) => { setDraftDirty(true); setRecentlyAppliedRecommendationKey(null); setSetDraft((draft) => ({ ...draft, notes: event.target.value })); }}
                      />
                    )}
                  </div>
                )
              }
            </div>
            <div className="safe-bottom sticky bottom-0 z-10 -mx-3 mt-4 border-t border-white/[0.08] bg-iron-950/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
              <div className="grid grid-cols-4 gap-2">
                {isEditingLoggedSet
                  ? <button className="btn-ghost" onClick={() => setEditingSetId(null)}>Cancel</button>
                  : <button className="btn-ghost" onClick={previousSet} disabled={!liveExerciseLog.sets.length}>Back</button>
                }
                <button
                  className="btn-danger disabled:opacity-30"
                  disabled={isPastLastPlannedSet || isEditingLoggedSet}
                  onPointerDown={startSkipSetHold}
                  onPointerMove={cancelSkipSetHoldOnMove}
                  onPointerUp={cancelSkipSetHold}
                  onPointerLeave={cancelSkipSetHold}
                  onPointerCancel={cancelSkipSetHold}
                  onClick={handleSkipSetPress}
                >
                  Skip Set
                </button>
                <button
                  className="btn-primary col-span-1"
                  onClick={() => {
                    if (isEditingLoggedSet) {
                      logSet(setDraft.setRating, "stay");
                      return;
                    }
                    if (isPastLastPlannedSet) {
                      if (hasMoreExercises) finishExercise();
                      else finishWorkout();
                      return;
                    }
                    if (primaryAction === "finish-workout") {
                      if (hasDraftValidValues) {
                        logSet(setDraft.setRating, "finish-workout");
                      } else {
                        finishExercise();
                      }
                      return;
                    }
                    if (primaryAction === "finish-exercise") {
                      if (hasDraftValidValues) {
                        logSet(setDraft.setRating, "next-exercise");
                      } else {
                        finishExercise();
                      }
                      return;
                    }
                    logSet(setDraft.setRating, "stay");
                  }}
                >
                  <Check className="h-4 w-4" /> {isPastLastPlannedSet && !isEditingLoggedSet ? (hasMoreExercises ? "Next Exercise" : finishWorkoutLabel) : primaryActionLabel}
                </button>
                <button className="btn-secondary" onClick={addSet}>+ Set</button>
              </div>
            </div>
          </section>

          {lastSetWasSkipped && (
            <section className="panel border-white/10 p-4">
              <p className="label">Last set</p>
              <p className="mt-1 text-sm text-iron-400">Set skipped — no recommendation.</p>
            </section>
          )}
          {!showRecommendationCard && !selectedActualSet && recommendationFeedbackText && (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-iron-300">
              {recommendationFeedbackText}
            </div>
          )}
          {showRecommendationCard && !selectedActualSet && recommendation && (() => {
            const suggestedWeight = recommendation.action?.suggestedWeight;
            const sourceSetNum = sourceSet?.setNumber;
            return (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-volt/10 bg-volt/[0.04] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-volt/50">
                    Suggestion{sourceSetNum ? ` · Set ${sourceSetNum}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-iron-100">
                    {suggestedWeight
                      ? `Use ${formatExerciseLoadText({ exercise: liveExercise, user, weight: suggestedWeight, unit: exerciseUnit })}`
                      : recommendation.title}
                  </p>
                  {recommendation.explanation && (
                    <p className="mt-0.5 text-xs text-iron-500">{recommendation.explanation}</p>
                  )}
                </div>
                {suggestedWeight && (
                  <button
                    className="shrink-0 rounded-lg border border-volt/20 bg-volt/[0.08] px-3 py-1.5 text-xs font-semibold text-volt transition hover:bg-volt/[0.14] active:scale-95"
                    onClick={() => applySuggestion(recommendation)}
                  >
                    Apply
                  </button>
                )}
              </div>
            );
          })()}

          {weightRec?.recommendedWeight && weightRec.recommendedWeight > 0 && (
            <section className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-iron-500">Weight analysis</p>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-iron-500">
                  {weightRec.confidence}% {weightRec.confidenceBand}
                </span>
              </div>
              {weightRec.reasonParts.slice(0, 2).map((line, i) => (
                <p key={i} className={`mt-0.5 ${i === 0 ? "text-xs text-iron-400" : "text-xs text-iron-600"}`}>{line}</p>
              ))}
            </section>
          )}

          <LoggedSetsTable logged={activeExerciseLog} exercise={exercise} user={user} displayUnit={exerciseUnit} />
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
            <button className="btn-secondary" onClick={() => setShowAddExercisePicker(true)}>+ Add Exercise</button>
            <button className="btn-danger" onClick={abandonWorkout}>Abandon</button>
            <button className="btn-primary ml-auto" onClick={finishWorkout} disabled={!allExercisesComplete}>{finishWorkoutLabel}</button>
          </div>
          {showAddExercisePicker && (
            <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
              <section className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/10 bg-iron-950 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-xl font-black">Add exercise</h3>
                  <button className="btn-ghost" onClick={() => setShowAddExercisePicker(false)}>Cancel</button>
                </div>
                <ExercisePicker
                  db={db}
                  user={user}
                  onPick={(exercise) => {
                    setShowAddExercisePicker(false);
                    setPendingOffProgramExercise(exercise);
                  }}
                />
              </section>
            </div>
          )}
          {pendingOffProgramExercise && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
              <div className="panel w-full max-w-sm space-y-4 p-6">
                <h3 className="text-xl font-black">Add {pendingOffProgramExercise.name}</h3>
                <p className="text-sm text-iron-300">Where should this exercise be added?</p>
                <div className="space-y-2">
                  <button
                    className="btn-primary w-full"
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
        </div>
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
  const selectedSplit = db.splitTemplates.find((split) => split.id === selectedSplitId);
  const generatedSplit = useMemo(() => {
    const splitDays = selectedSplit?.days.length ? selectedSplit.days : [];
    return splitDays.length ? splitDays : generateSplitFromText({ daysPerWeek: request.daysPerWeek, goal: request.goal, text: request.notes });
  }, [request.daysPerWeek, request.goal, request.notes, selectedSplit]);
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const draftProgram = db.programs.find((program) => program.userId === user.id && program.status === "draft");
  const workingProgram = draftProgram || activeProgram;
  const schedulePreview = [0, 1].map((weekIndex) => buildSplitSchedule(generatedSplit, request.daysPerWeek, weekIndex, request.splitLoopMode));

  async function createProgram(mode: ProgramBuildMode) {
    if (request.daysPerWeek < 1 || request.daysPerWeek > 7) {
      setGenerationState({ status: "error", message: "Choose between 1 and 7 training days per week." });
      return;
    }
    setBuildMode(mode);
    setGenerationState({ status: "loading", message: mode === "manual" ? "Creating a manual block draft..." : "Suggesting a complete program draft..." });
    try {
      const program = generateProgram(user, db, { ...request, buildMode: mode, splitTemplateId: selectedSplitId, splitDays: generatedSplit });
      program.blocks = program.blocks.map((block) => ({
        ...block,
        splitTemplateId: selectedSplitId,
        blockType: request.blockType,
        goal: request.goal,
        numberOfWeeks: request.blockLengthWeeks,
        status: "draft",
        loopMode: request.splitLoopMode,
        weeks: block.weeks.map((week) => ({
          ...week,
          workouts: week.workouts.map((workout, dayIndex) => {
            const splitOffset = request.splitLoopMode === "weekly-reset" ? dayIndex : ((week.weekNumber - 1) * request.daysPerWeek) + dayIndex;
            const splitDay = generatedSplit.find((item) => workout.name.toLowerCase().includes(item.name.toLowerCase())) || generatedSplit[splitOffset % generatedSplit.length];
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
        draft.programs = draft.programs.filter((item) => !(item.userId === user.id && item.status === "draft"));
        draft.programs.unshift(program);
        draft.programGaps = analyzeProgramGaps(program, draft);
        return draft;
      });
      setGenerationState({ status: "success", message: mode === "manual" ? "Manual draft created. Add exercises in the weekly overview, then activate it when ready." : "Suggested draft created. Review and edit it before activating." });
    } catch (error) {
      setGenerationState({ status: "error", message: error instanceof Error ? error.message : "Program generation failed." });
    }
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

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Block" title="Build the block, review the week, then activate it for Today." />
      <section className="grid gap-3 lg:grid-cols-3">
        <Panel title="Active Block" icon={CalendarDays}>
          {activeProgram ? (
            <div>
              <p className="text-lg font-black">{activeProgram.name}</p>
              <p className="mt-1 text-sm text-iron-300">{activeProgram.goal} - {activeProgram.blocks[0]?.type} - {activeProgram.blocks[0]?.trainingDaysPerWeek} days/week</p>
            </div>
          ) : <EmptyState title="No active block" detail="Create or suggest a draft, then activate it when ready." />}
        </Panel>
        <Panel title="Draft Control" icon={Save}>
          {draftProgram ? (
            <div className="space-y-3">
              <p className="font-black">{draftProgram.name}</p>
              <p className="text-sm text-iron-300">{draftProgram.buildMode === "manual" ? "Manual draft" : "Suggested draft"} waiting for review.</p>
              <p className="text-xs text-iron-400">Edit exercises and prescriptions in the Weekly Overview below, then activate when ready.</p>
              <button className="btn-primary w-full" onClick={() => activateProgram(draftProgram)}><CheckCircle2 className="h-4 w-4" /> Activate Draft</button>
            </div>
          ) : <EmptyState title="No draft" detail="Use Manual Build or Suggest Full Program below." />}
        </Panel>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Block Planner" icon={Wand2}>
          <p className="mb-4 text-sm text-iron-300">Use a split to create a multi-week training block with exercises, sets, reps, intensity targets, and progression. Manual build keeps you in control; suggestions fill in a proposed draft for review.</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button className={`btn-secondary ${buildMode === "manual" ? "border-volt/60 text-volt" : ""}`} onClick={() => setBuildMode("manual")}>Manual Build</button>
            <button className={`btn-secondary ${buildMode === "suggested" ? "border-volt/60 text-volt" : ""}`} onClick={() => setBuildMode("suggested")}>Suggest Full Program</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Block name" placeholder="e.g. Powerbuilding Block" value={request.name} onChange={(name) => setRequest((draft) => ({ ...draft, name }))} />
            <SelectField label="Split template" value={selectedSplitId} options={db.splitTemplates.map((split) => split.id)} labels={Object.fromEntries(db.splitTemplates.map((split) => [split.id, `${split.name} (${split.daysPerWeek}d)`]))} onChange={(id) => { setSelectedSplitId(id); setRequest((draft) => ({ ...draft, splitTemplateId: id })); }} />
            <SelectField label="Block type" value={request.blockType} options={["accumulation", "hypertrophy", "strength", "intensification", "peaking", "deload", "custom"]} onChange={(blockType) => setRequest((draft) => ({ ...draft, blockType: blockType as BlockType }))} />
            <NumberField label="Weeks" value={request.blockLengthWeeks} onChange={(blockLengthWeeks) => setRequest((draft) => ({ ...draft, blockLengthWeeks }))} />
            <NumberField label="Days/week" value={request.daysPerWeek} min={1} max={7} onChange={(daysPerWeek) => setRequest((draft) => ({ ...draft, daysPerWeek }))} />
            <SelectField label="Split loop" value={request.splitLoopMode} options={["continuous", "weekly-reset"]} labels={{ "continuous": "Continuous loop", "weekly-reset": "Weekly reset" }} onChange={(splitLoopMode) => setRequest((draft) => ({ ...draft, splitLoopMode: splitLoopMode as SplitLoopMode }))} />
          </div>
          <button
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-300 transition hover:bg-white/[0.07]"
            onClick={() => setShowSbdAdvanced((v) => !v)}
          >
            Advanced / Goal override
            <ChevronRight className={`h-3 w-3 transition ${showSbdAdvanced ? "rotate-90" : ""}`} />
          </button>
          {showSbdAdvanced && (
            <div className="mt-2 grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <SelectField label="Goal override" value={request.goal} options={["powerlifting", "bodybuilding", "powerbuilding", "general-health", "conditioning", "maintenance"]} onChange={(goal) => setRequest((draft) => ({ ...draft, goal: goal as TrainingGoal }))} />
            </div>
          )}
          {showSbdAdvanced && (
            <>
              <SbdSettingsEditor
                db={db}
                user={user}
                settings={request.compoundSettings}
                selectedIds={request.priorityExerciseIds}
                onSelectedChange={(priorityExerciseIds) => setRequest((draft) => ({ ...draft, priorityExerciseIds }))}
                onChange={(compoundSettings) => setRequest((draft) => ({ ...draft, compoundSettings }))}
              />
              {buildMode === "suggested" && (
                <CompoundSettingsEditor
                  db={db}
                  user={user}
                  settings={request.compoundSettings}
                  onChange={(compoundSettings) => setRequest((draft) => ({ ...draft, compoundSettings }))}
                />
              )}
            </>
          )}
          <label className="label mt-4 block">Block notes</label>
          <textarea className="field mt-2 min-h-24" value={request.notes} onChange={(event) => setRequest((draft) => ({ ...draft, notes: event.target.value }))} />
          {generationState.message && (
            <div className={`mt-4 rounded-lg border p-3 text-sm ${
              generationState.status === "error" ? "border-ember/40 bg-ember/10 text-orange-100" :
              generationState.status === "success" ? "border-volt/40 bg-volt/10 text-volt" :
              "border-white/10 bg-white/[0.06] text-iron-200"
            }`}>
              {generationState.message}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" onClick={() => createProgram(buildMode)} disabled={generationState.status === "loading"}>
              <Save className="h-4 w-4" />
              {generationState.status === "loading" ? "Working..." : buildMode === "manual" ? "Create Manual Draft" : "Suggest Full Program"}
            </button>
            <button className="btn-ghost" onClick={resetBuilderForm} title="Reset form to defaults">
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        </Panel>

        <Panel title="Split Schedule Preview" icon={CalendarDays}>
          <p className="mb-3 text-sm text-iron-300">Continuous loop carries the split across weeks. Weekly reset starts each week from day one.</p>
          <div className="space-y-3">
            {schedulePreview.map((week, weekIndex) => (
              <div key={weekIndex} className="rounded-lg bg-white/[0.06] p-3">
                <p className="label mb-2">Week {weekIndex + 1}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {week.map((day, index) => (
                    <div key={`${day.id}-${index}`} className="rounded-lg bg-iron-950/50 p-2">
                      <p className="font-black">Day {index + 1}: {day.name}</p>
                      <p className="text-xs text-iron-400">{day.muscleGroups.join(", ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {draftProgram ? (
        <WeeklyOverview db={db} user={user} program={draftProgram} updateDb={updateDb} editable />
      ) : activeProgram ? (
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="label">Active block — read-only</p>
              <p className="mt-1 font-black">{activeProgram.name}</p>
              <p className="mt-1 text-sm text-iron-300">
                {activeProgram.goal} · {activeProgram.blocks[0]?.type} · Week {activeProgram.blocks[0]?.currentWeek ?? 1} of {activeProgram.blocks[0]?.lengthWeeks ?? "?"}
              </p>
              <p className="mt-2 text-xs text-iron-400">The Week tab owns current progress, completed sessions, and week review. To edit exercises, create a new draft block below.</p>
            </div>
            <button className="btn-secondary" onClick={() => setScreen("week")}>View current week →</button>
          </div>
        </section>
      ) : null}

      <ProgramGapPanel db={db} user={user} program={workingProgram} updateDb={updateDb} />
      <BlockHistory db={db} user={user} updateDb={updateDb} />
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
    <div className="mt-4 rounded-lg border border-white/10 bg-iron-950/45 p-3">
      <p className="font-black">SBD settings</p>
      <p className="mt-1 text-sm text-iron-300">This only controls squat, bench, and deadlift exposure. Rows, presses, leg press, pull-ups, and other compounds stay in normal exercise selection.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {sbdExercises.map((exercise) => {
          const avoided = settings.avoidExerciseIds.includes(exercise.id);
          const emphasized = selectedIds.includes(exercise.id);
          return (
            <div key={exercise.id} className={`rounded-lg border p-3 ${avoided ? "border-ember/40 bg-ember/10" : emphasized ? "border-volt/50 bg-volt/10" : "border-white/10 bg-white/[0.05]"}`}>
              <p className="font-black">{exercise.name.replace("Competition ", "")}</p>
              <div className="mt-3 grid gap-2">
                <button className={`btn-secondary min-h-10 ${emphasized ? "border-volt/60 text-volt" : ""}`} onClick={() => toggleEmphasis(exercise.id)} disabled={avoided}>
                  {emphasized ? "Emphasized" : "Include"}
                </button>
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-bold text-iron-200">
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
  const update = (patch: Partial<CompoundSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-iron-950/45 p-3">
      <p className="font-black">Exercise Avoider</p>
      <p className="mt-1 text-sm text-iron-300">Only used when you ask the app to suggest exercises. Manual day editing stays open-ended.</p>
      <div className="mt-3">
        <p className="label mb-2">Avoid movement patterns</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {movementOptions.map((pattern) => (
            <label key={pattern} className={`rounded-lg border p-2 text-xs font-bold ${settings.avoidMovementPatterns.includes(pattern) ? "border-ember/50 bg-ember/10 text-orange-100" : "border-white/10 bg-white/[0.04] text-iron-300"}`}>
              <input
                className="mr-2"
                type="checkbox"
                checked={settings.avoidMovementPatterns.includes(pattern)}
                onChange={() => update({
                  avoidMovementPatterns: settings.avoidMovementPatterns.includes(pattern)
                    ? settings.avoidMovementPatterns.filter((item) => item !== pattern)
                    : [...settings.avoidMovementPatterns, pattern]
                })}
              />
              {pattern}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <p className="label mb-2">Avoid specific exercises</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {avoided.map((exercise) => (
            <button key={exercise.id} className="btn-ghost border border-ember/30 text-orange-100" onClick={() => update({ avoidExerciseIds: settings.avoidExerciseIds.filter((id) => id !== exercise.id) })}>
              {exercise.name} remove
            </button>
          ))}
          {!avoided.length && <p className="text-sm text-iron-400">No specific exercises avoided.</p>}
        </div>
        <ExercisePicker
          db={db}
          user={user}
          selectedIds={settings.avoidExerciseIds}
          onPick={(exercise) => {
            if (!settings.avoidExerciseIds.includes(exercise.id)) update({ avoidExerciseIds: [...settings.avoidExerciseIds, exercise.id] });
          }}
        />
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
      <Panel title="Weekly Overview" icon={CalendarDays}>
        <WeekDayCardSelector
          db={db}
          days={displayDays}
          selectedDayId={selectedEdDay?.id}
          onSelect={(day) => setSelectedDayId(day.id)}
        />
        {selectedEdDay && <WorkoutDayEditor db={db} user={user} program={program} day={selectedEdDay} updateDb={updateDb} />}
      </Panel>
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
                day && selectedDayId === day.id ? "border-volt bg-volt/10" : "border-white/10 bg-white/[0.045]"
              }`}
              onClick={() => day && setSelectedDayId(day.id)}
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-iron-500">{name.slice(0, 3)}</p>
              {day ? (
                <>
                  <p className="mt-2 font-black text-white">{day.name}</p>
                  <p className="mt-1 text-xs text-volt">{day.focus} - ~{estimateWorkoutDuration(day)} min</p>
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
  onSelect,
}: {
  db: TrainingDatabase;
  days: WorkoutDay[];
  selectedDayId?: string;
  onSelect: (day: WorkoutDay) => void;
}) {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const hasScheduledDays = days.some((day) => !!day.scheduledDay);
  return (
    <div className="grid gap-2 md:grid-cols-7">
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
            className={`min-h-32 rounded-lg border p-3 text-left transition ${
              day
                ? selected
                  ? "border-volt bg-volt/10"
                  : "border-white/10 bg-white/[0.045] hover:bg-white/[0.07]"
                : "cursor-default border-dashed border-white/10 bg-white/[0.02]"
            }`}
            onClick={() => day && onSelect(day)}
          >
            <p className="text-xs font-black uppercase tracking-[0.14em] text-iron-500">{name.slice(0, 3)}</p>
            {day && !restDay ? (
              <>
                <p className="mt-2 font-black text-white">{day.name}</p>
                <p className="mt-1 text-xs text-volt">{day.focus} - ~{estimateWorkoutDuration(day)} min</p>
                {keyExercises?.length ? (
                  <p className="mt-2 line-clamp-2 text-xs text-iron-300">{keyExercises.join(", ")}</p>
                ) : (
                  <p className="mt-2 text-xs text-iron-500">Draft day</p>
                )}
              </>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-white/10 p-3 text-center text-xs font-bold text-iron-500">Rest</div>
            )}
          </button>
        );
      })}
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
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program: Program;
  day: WorkoutDay;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  showNameFocusFields?: boolean;
}) {
  const allSplitDays = db.splitTemplates.flatMap((split) => split.days);
  const requirements = deriveRequirements(day, allSplitDays);

  // Count how many exercises already satisfy each requirement.
  // Exercises with an explicit fulfillsRequirementId are counted only for the req they were tagged for.
  // Untagged exercises (legacy) fall back to muscle matching.
  function countFulfilled(exercises: typeof day.exercises, req: SplitDayRequirement): number {
    // Primary: exercises explicitly tagged for this requirement (not extras)
    const explicit = exercises.filter((p) => p.fulfillsRequirementId === req.id && !p.isExtra).length;
    if (explicit > 0) return explicit;
    // Legacy fallback: only if NO exercise in the day has any fulfillsRequirementId set.
    // Each untagged exercise can only count for one requirement; we approximate by not double-counting.
    const anyTagged = exercises.some((p) => !!p.fulfillsRequirementId && !p.isExtra);
    if (anyTagged) return 0;
    const untagged = exercises.filter((p) => !p.fulfillsRequirementId && !p.isExtra);
    return untagged.filter((p) => {
      const ex = db.exercises.find((e) => e.id === p.exerciseId);
      return ex && exerciseFulfillsRequirement(ex, req);
    }).length;
  }

  const reqProgress = requirements.map((req) => ({
    req,
    fulfilled: Math.min(countFulfilled(day.exercises, req), req.requiredExerciseCount),
    needed: req.requiredExerciseCount,
  }));
  const allReqsMet = reqProgress.every((item) => item.fulfilled >= item.needed);
  const firstUnmetIndex = reqProgress.findIndex((item) => item.fulfilled < item.needed);

  const [currentReqIndex, setCurrentReqIndex] = useState<number>(firstUnmetIndex >= 0 ? firstUnmetIndex : 0);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [chooserWarning, setChooserWarning] = useState("");
  const [showPrescription, setShowPrescription] = useState(allReqsMet);
  const [pendingExtraExercise, setPendingExtraExercise] = useState<Exercise | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | undefined>(day.exercises[0]?.id);
  const [swappingExerciseId, setSwappingExerciseId] = useState<string | undefined>();

  // Advance to the first unfulfilled requirement whenever exercises change
  useEffect(() => {
    if (showAllExercises) return;
    const nextUnmet = reqProgress.findIndex((item) => item.fulfilled < item.needed);
    if (nextUnmet >= 0) setCurrentReqIndex(nextUnmet);
  }, [day.exercises.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!day.exercises.length) {
      setEditingExerciseId(undefined);
      setSwappingExerciseId(undefined);
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

  function addExercise(exercise: Exercise, asExtra = false) {
    // Anti-spam: block duplicate exercise on this day
    if (alreadyAddedIds.includes(exercise.id)) return;
    const reqId = showAllExercises ? undefined : currentReq?.id;
    const currentProgress = reqId ? reqProgress.find((r) => r.req.id === reqId) : undefined;
    const reqFull = !showAllExercises && currentProgress && currentProgress.fulfilled >= currentProgress.needed;

    if (reqFull && !asExtra) {
      // Requirement is full — ask user to confirm adding as extra
      setPendingExtraExercise(exercise);
      return;
    }

    const isExtraFlag = asExtra || !reqId;
    const slotIndex = reqId ? Math.max(0, currentProgress?.fulfilled ?? 0) : undefined;
    const totalRequiredForMuscle = reqId ? currentProgress?.needed : undefined;
    const slotPlan = currentReq && !isExtraFlag
      ? getRequirementSlotPlan({
          targetMuscle: currentReq.targetMuscle,
          goalType: program.goal,
          blockType: program.blocks[0]?.type || "hypertrophy",
          dayFocus: day.focus,
          slotIndex: slotIndex ?? 0,
          totalSlots: totalRequiredForMuscle ?? 1,
          movementPattern: currentReq.movementPattern,
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
      target.exercises.push(planned);
    });
    setPendingExtraExercise(null);

    // Advance to next unfulfilled requirement (only for non-extra exercises)
    if (!asExtra && !showAllExercises && requirements.length > 0) {
      const updatedExercises = [...day.exercises, { exerciseId: exercise.id, fulfillsRequirementId: reqId } as typeof day.exercises[number]];
      const nextUnmet = requirements.findIndex((req, idx) => {
        const currentFulfilled = Math.min(countFulfilled(updatedExercises, req), req.requiredExerciseCount);
        return currentFulfilled < req.requiredExerciseCount && idx !== currentReqIndex;
      });
      if (nextUnmet >= 0) setCurrentReqIndex(nextUnmet);
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
      replacementPlanned.plannedSets = structuredClone(targetExercise.plannedSets);
      replacementPlanned.restSeconds = targetExercise.restSeconds;
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

  function chooseForMe() {
    if (day.exercises.length && !confirm("Replace the exercises currently selected for this workout?")) return;
    const targetMuscles = day.targetMuscles?.length ? day.targetMuscles : allSplitDays.find((sd) => sd.id === day.splitDayId)?.muscleGroups || [];
    const targetPatterns = day.movementPatterns || [];
    const settings = program.blocks[0]?.compoundSettings || defaultCompoundSettings;
    const activeGym = db.gyms.find((gym) => gym.id === user.activeGymId);
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

    const pool = db.exercises
      .filter((exercise) => (!exercise.ownerUserId || exercise.ownerUserId === user.id))
      .filter((exercise) => exerciseAllowedByCompoundSettings(exercise, settings))
      .filter((exercise) => !activeGym || !exercise.equipment.some((item) => activeGym.unavailableEquipment.includes(item)));

    // Track { exercise, reqId } pairs so we can tag fulfillsRequirementId correctly
    const selected: {
      exercise: Exercise;
      reqId: string | undefined;
      slotIndex?: number;
      totalRequiredForMuscle?: number;
      exerciseRole?: ExerciseRole;
    }[] = [];
    const usedIds = new Set<string>();

    if (dayReqs.length > 0) {
      const warnings: string[] = [];
      // Fill each requirement slot — exactly requiredExerciseCount exercises per slot, no more
      for (const req of [...dayReqs].sort((a, b) => a.priority - b.priority)) {
        let filled = 0;
        for (let slot = 0; slot < req.requiredExerciseCount; slot += 1) {
          const slotPlan = getRequirementSlotPlan({
            targetMuscle: req.targetMuscle,
            goalType: goalUsed,
            blockType: block?.type || "hypertrophy",
            dayFocus: day.focus,
            slotIndex: slot,
            totalSlots: req.requiredExerciseCount,
            movementPattern: req.movementPattern,
          });
          const strictCandidates = pool
            .filter((ex) =>
              !usedIds.has(ex.id) &&
              exerciseFulfillsRequirement(ex, req) &&
              (!req.movementPattern || ex.movementPattern === req.movementPattern || ex.movementPatterns?.includes(req.movementPattern)) &&
              (targetPatterns.length === 0 || targetPatterns.includes(ex.movementPattern) || ex.movementPatterns?.some((p) => targetPatterns.includes(p)))
            )
            .map((exercise) => ({
              exercise,
              score: scoreExerciseForSlot({
                exercise,
                slotPlan,
                targetMuscle: req.targetMuscle,
                goalType: goalUsed,
                blockType: block?.type || "hypertrophy",
                dayFocus: day.focus,
                selectedExercises: selected.map((item) => item.exercise),
                slotIndex: slot,
                totalSlots: req.requiredExerciseCount,
                weeklyExerciseCounts,
                dayBudget: buildFatigueBudget(selected.map((item) => item.exercise)),
              }),
            }))
            .sort((a, b) => b.score - a.score);
          const relaxedCandidate = strictCandidates[0] ? undefined : pool
            .filter((ex) =>
              !usedIds.has(ex.id) &&
              exerciseFulfillsRequirement(ex, req) &&
              (!req.movementPattern || ex.movementPattern === req.movementPattern || ex.movementPatterns?.includes(req.movementPattern))
            )
            .map((exercise) => ({
              exercise,
              score: scoreExerciseForSlot({
                exercise,
                slotPlan,
                targetMuscle: req.targetMuscle,
                goalType: goalUsed,
                blockType: block?.type || "hypertrophy",
                dayFocus: day.focus,
                selectedExercises: selected.map((item) => item.exercise),
                slotIndex: slot,
                totalSlots: req.requiredExerciseCount,
                weeklyExerciseCounts,
                dayBudget: buildFatigueBudget(selected.map((item) => item.exercise)),
              }),
            }))
            .sort((a, b) => b.score - a.score)[0];
          const pick = strictCandidates[0] ?? relaxedCandidate;
          if (!pick) continue;
          selected.push({ exercise: pick.exercise, reqId: req.id, slotIndex: slot, totalRequiredForMuscle: req.requiredExerciseCount, exerciseRole: slotPlan.role });
          usedIds.add(pick.exercise.id);
          weeklyExerciseCounts[pick.exercise.id] = (weeklyExerciseCounts[pick.exercise.id] ?? 0) + 1;
          filled += 1;
        }
        if (filled < req.requiredExerciseCount) {
          warnings.push(`${req.targetMuscle} ${filled}/${req.requiredExerciseCount}`);
        }
      }
      setChooserWarning(warnings.length ? `Could not fill every requirement: ${warnings.join(", ")}. Fill the missing slots manually.` : "");
    } else {
      // No requirements: spread across muscles, max 2 per primary muscle
      const muscleCount: Record<string, number> = {};
      const maxPerMuscle = 2;
      const limit = Math.max(3, Math.min(6, targetMuscles.length + 2));
      const candidates = pool.filter((ex) => {
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
      setChooserWarning("No valid exercises matched this day after SBD rules, Exercise Avoider, gym availability, muscles, and movement patterns. You can override manually below.");
      return;
    }
    updateDay((target) => {
      target.exercises = selected.map((item, index) => {
        const planned = buildPlannedExerciseFromExercise({
          db,
          user,
          program,
          day: target,
          exercise: item.exercise,
          order: index + 1,
          exerciseRole: item.exerciseRole,
          requirementSlotIndex: item.slotIndex,
          totalRequiredForMuscle: item.totalRequiredForMuscle,
        });
        planned.fulfillsRequirementId = item.reqId;
        return planned;
      });
    });
  }

  const pickerTargetMuscles = showAllExercises || !currentReq
    ? []
    : [currentReq.targetMuscle];

  return (
    <div className="mt-5 space-y-4">
      {showNameFocusFields && (
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Day name" value={day.name} onChange={(name) => updateDay((target) => { target.name = name; })} />
          <SelectField label="Focus" value={day.focus} options={["strength", "hypertrophy", "technical", "recovery", "conditioning", "hybrid"]} onChange={(focus) => updateDay((target) => { target.focus = focus as WorkoutDay["focus"]; })} />
        </div>
      )}
      <button className="btn-secondary w-full" onClick={chooseForMe}><Wand2 className="h-4 w-4" /> Choose For Me</button>
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
          const reqBadge = planned.fulfillsRequirementId
            ? requirements.find((req) => req.id === planned.fulfillsRequirementId)
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
                  })} />
                  <NumberField label="Reps" value={planned.plannedSets[0]?.targetReps || 8} onChange={(reps) => updateDay((target) => {
                    target.exercises.find((item) => item.id === planned.id)?.plannedSets.forEach((set) => { set.targetReps = reps; });
                  })} />
                  <NumberField label="RPE" step={0.5} value={planned.plannedSets[0]?.targetRpe || 7} onChange={(rpe) => updateDay((target) => {
                    target.exercises.find((item) => item.id === planned.id)?.plannedSets.forEach((set) => { set.targetRpe = sanitizeRpe(rpe); });
                  })} />
                </div>
              )}
              {isSwappingExercise && (
                <div className="mt-3 rounded-lg border border-white/10 bg-iron-950/40 p-3">
                  <p className="label mb-2 text-volt">Swap exercise</p>
                  <ExercisePicker
                    db={db}
                    user={user}
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
  grouped = false
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
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [pattern, setPattern] = useState("all");
  const [fatigue, setFatigue] = useState("all");
  const activeGym = db.gyms.find((gym) => gym.id === user.activeGymId);
  const allMatches = db.exercises
    .filter((exercise) => !exercise.ownerUserId || exercise.ownerUserId === user.id)
    .filter((exercise) => {
      const text = `${exercise.name} ${exercise.primaryMuscles.join(" ")} ${exercise.secondaryMuscles.join(" ")} ${exercise.equipment.join(" ")} ${exercise.movementPattern}`.toLowerCase();
      const gymAvailable = !activeGym || !exercise.equipment.some((item) => activeGym.unavailableEquipment.includes(item));
      const targetPatternMatch = !targetPatterns.length || targetPatterns.includes(exercise.movementPattern) || exercise.movementPatterns?.some((patternItem) => targetPatterns.includes(patternItem));
      return (
        text.includes(query.toLowerCase()) &&
        (muscle === "all" || exercise.primaryMuscles.includes(muscle as MuscleGroup) || exercise.muscleGroup === muscle) &&
        (equipment === "all" || exercise.equipment.includes(equipment as EquipmentCategory)) &&
        (pattern === "all" || exercise.movementPattern === pattern) &&
        (fatigue === "all" || String(fatigueRatingForExercise(exercise)) === fatigue) &&
        (compoundFilter === "all" || (compoundFilter === "compound" ? isCompound(exercise) : exercise.kind.includes("isolation"))) &&
        (!grouped || query || muscle !== "all" || pattern !== "all" || targetPatternMatch) &&
        gymAvailable
      );
    });
  const matches = allMatches.slice(0, grouped && !query && muscle === "all" ? 36 : 12);
  const groupedMuscles = targetMuscles.filter((item, index) => targetMuscles.indexOf(item) === index);
  // For grouped muscle sections, query by primaryMuscles directly (not filtered by movement pattern)
  // so that exercises like Leg Extension always appear for quads regardless of day movement patterns.
  const muscleOnlyPool = grouped && groupedMuscles.length
    ? db.exercises.filter((exercise) => {
        if (exercise.ownerUserId && exercise.ownerUserId !== user.id) return false;
        if (activeGym && exercise.equipment.some((item) => activeGym.unavailableEquipment.includes(item))) return false;
        const text = `${exercise.name} ${exercise.primaryMuscles.join(" ")} ${exercise.muscleGroup}`.toLowerCase();
        return !query || text.includes(query.toLowerCase());
      })
    : db.exercises;
  const groupedSections = grouped && !query && muscle === "all" && groupedMuscles.length
    ? groupedMuscles.map((targetMuscle) => ({
        muscle: targetMuscle,
        exercises: muscleOnlyPool
          .filter((exercise) => exercise.primaryMuscles.includes(targetMuscle) || exercise.muscleGroup === targetMuscle)
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
        className={`rounded-lg border p-3 text-left transition ${
          isAlreadyAdded ? "cursor-not-allowed border-white/5 bg-white/[0.03] opacity-50" :
          isSelected ? "border-volt bg-volt/10 hover:border-volt/80" :
          "border-white/10 bg-white/[0.06] hover:border-volt/50"
        }`}
        onClick={() => !isAlreadyAdded && onPick(exercise)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-black">{exercise.name}</p>
          {isAlreadyAdded
            ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-bold text-iron-400">Added</span>
            : isSelected
              ? <Check className="h-4 w-4 text-volt" />
              : null}
        </div>
        <p className="mt-1 text-xs text-iron-400">{exercise.primaryMuscles.join(", ")} · {exercise.equipment.join(", ")} · {exercise.movementPattern}</p>
        <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-iron-500">{isCompound(exercise) ? "compound" : "isolation/accessory"} · fatigue {fatigueRatingForExercise(exercise)}/5</p>
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-volt" />
        <p className="font-black">Exercise picker</p>
      </div>
      <p className="mb-3 text-sm text-iron-300">Search and select exercises from the exercise library.</p>
      <input className="field" placeholder="Search name, muscle, equipment, movement pattern..." value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select className="field" value={muscle} onChange={(event) => setMuscle(event.target.value)}>
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
      {groupedSections.length ? (
        <div className="mt-3 space-y-3">
          {groupedSections.map((section) => (
            <div key={section.muscle} className="rounded-lg border border-white/10 bg-white/[0.035] p-2">
              <p className="label mb-2">{section.muscle}</p>
              <div className="grid gap-2 sm:grid-cols-2">{section.exercises.map(renderExerciseButton)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{matches.map(renderExerciseButton)}</div>
      )}
      {!matches.length && !groupedSections.length && <EmptyState title="No exercises found" detail="Try a broader muscle, equipment, or movement filter." />}
    </div>
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
  const gaps = analyzeProgramGaps(program, db);
  const criticalGaps = gaps.filter((gap) => gap.severity === "high");
  const secondaryGaps = gaps.filter((gap) => gap.severity !== "high");
  const visibleGaps = showAll ? gaps : criticalGaps;
  const groupedGaps = [
    { label: "Rule Conflicts", types: ["fatigue"] as ProgramGap["type"][], match: (gap: ProgramGap) => gap.issue.toLowerCase().includes("rule") || gap.issue.toLowerCase().includes("conflict") },
    { label: "Volume", types: ["volume", "missing-category"] as ProgramGap["type"][] },
    { label: "Balance", types: ["balance", "movement-pattern"] as ProgramGap["type"][] },
    { label: "Fatigue", types: ["fatigue", "recoverability"] as ProgramGap["type"][], match: (gap: ProgramGap) => !gap.issue.toLowerCase().includes("rule") && !gap.issue.toLowerCase().includes("conflict") },
    { label: "Repetition", types: ["repetition"] as ProgramGap["type"][] },
    { label: "Recovery / Spacing", types: ["frequency", "recoverability"] as ProgramGap["type"][] }
  ].map((group) => ({
    ...group,
    gaps: visibleGaps.filter((gap) => (group.match ? group.match(gap) : group.types.includes(gap.type)))
  })).filter((group) => group.gaps.length);

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
    <Panel title="Program Gap Analysis" icon={ShieldAlert}>
      <div className="space-y-3">
        {groupedGaps.length ? groupedGaps.map((group) => (
          <div key={group.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <p className="label mb-2">{group.label}</p>
            <div className="space-y-2">
              {group.gaps.map((gap) => {
                const exercise = gap.action?.exerciseId ? db.exercises.find((item) => item.id === gap.action?.exerciseId) : undefined;
                return (
                  <div key={gap.id} className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                    <ProgramGapCard gap={gap} db={db} />
                    {exercise && gap.action?.kind === "add-exercise" && (
                      <button className="btn-secondary mt-3 w-full" onClick={() => applyGap(gap)}>
                        <Plus className="h-4 w-4" />
                        Add {exercise.name}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )) : criticalGaps.length === 0 ? <EmptyState title="No critical gaps" detail="The active week passes all critical checks." /> : null}
        {secondaryGaps.length > 0 && (
          <button
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-400 transition hover:bg-white/[0.06]"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Hide" : `Show ${secondaryGaps.length} secondary warning${secondaryGaps.length > 1 ? "s" : ""}`}
            <ChevronRight className={`h-3 w-3 transition ${showAll ? "rotate-90" : ""}`} />
          </button>
        )}
        {gaps.length === 0 && <EmptyState title="No major program gaps" detail="The active week passes the current volume, balance, frequency, and fatigue checks." />}
      </div>
    </Panel>
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
      <ExercisePicker db={db} user={user} onPick={(exercise) => addExercise(exercise.id)} />
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
  const [showAdvancedExercise, setShowAdvancedExercise] = useState(false);
  const [showAllSecondaryMuscles, setShowAllSecondaryMuscles] = useState(false);
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

  function startEditExercise(exercise: Exercise) {
    setEditingExerciseId(exercise.id);
    setDraft({
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
    });
    setShowAdvancedExercise(false);
    setShowAllSecondaryMuscles(false);
    setParentSearch("");
  }

  function startAddVariation(parent: Exercise) {
    setEditingExerciseId(undefined);
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
    setShowAllSecondaryMuscles(false);
    setParentSearch(parent.name);
  }
  const exercises = db.exercises.filter((exercise) => {
    // Ownership: exclude other users' custom exercises
    if (exercise.ownerUserId && exercise.ownerUserId !== user.id) return false;
    const isCustom = !!(exercise.ownerUserId);
    // Archived items only show in the "archived" tab
    if (exercise.isArchived && sourceFilter !== "archived") return false;
    if (sourceFilter === "custom" && !isCustom) return false;
    if (sourceFilter === "default" && isCustom) return false;
    // Hide variations from the flat list when no search query and variations toggle is off
    if (exercise.isVariation && !query && !showVariations) return false;
    const searchText = `${exercise.name} ${exercise.primaryMuscles.join(" ")} ${exercise.secondaryMuscles.join(" ")} ${exercise.equipment.join(" ")} ${exercise.movementPattern}`.toLowerCase();
    const matchesQuery = searchText.includes(query.toLowerCase());
    const matchesMuscle = muscle === "all" || exercise.primaryMuscles.includes(muscle as MuscleGroup) || exercise.muscleGroup === muscle;
    const matchesEquipment = equipmentFilter === "all" || exercise.equipment.includes(equipmentFilter as EquipmentCategory);
    const matchesPattern = patternFilter === "all" || exercise.movementPattern === patternFilter || exercise.movementPatterns?.includes(patternFilter as MovementPattern);
    const matchesKind = kindFilter === "all" || (kindFilter === "compound" ? isCompound(exercise) : exercise.kind.includes("isolation") || !isCompound(exercise));
    const matchesGymSpecific = gymSpecificFilter === "all" || (gymSpecificFilter === "enabled" ? exercise.isGymSpecificEnabled : !exercise.isGymSpecificEnabled);
    return matchesQuery && matchesMuscle && matchesEquipment && matchesPattern && matchesKind && matchesGymSpecific;
  });
  const progressExercise = db.exercises.find((exercise) => exercise.id === progressExerciseId);

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
    setEditingExerciseId(undefined);
    setDraft(emptyDraft);
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
    setDraft(emptyDraft);
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
      if (editingExerciseId === exercise.id) { setEditingExerciseId(undefined); setDraft(emptyDraft); }
    } else {
      if (!confirm(`Hide "${exercise.name}" from the library? It will no longer appear in searches. You can reset defaults to restore it.`)) return;
      void updateDb((data) => {
        const target = data.exercises.find((e) => e.id === exercise.id);
        if (target) { target.isArchived = true; target.updatedAt = nowIso(); }
        return data;
      });
      if (editingExerciseId === exercise.id) { setEditingExerciseId(undefined); setDraft(emptyDraft); }
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
    setEditingExerciseId(undefined);
    setDraft(emptyDraft);
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
          <section className="grid gap-4 xl:grid-cols-[1fr_24rem]">
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="label">Exercises</p>
                <div className="flex items-center gap-2">
                  <button
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${showVariations ? "bg-white/10 text-iron-200" : "text-iron-500 hover:bg-white/[0.07] hover:text-iron-300"}`}
                    onClick={() => setShowVariations((v) => !v)}
                    title={showVariations ? "Hide variations from list" : "Show variations in list"}
                  >
                    <GitBranch className="mr-1 inline h-3 w-3" />{showVariations ? "Variations" : "Variations"}
                  </button>
                  <p className="text-xs text-iron-500">{exercises.length}</p>
                </div>
              </div>
              <div className="mb-3 flex gap-1">
                {([["all", "All"], ["default", "Default"], ["custom", "Custom"], ["archived", "Hidden"]] as const).map(([id, label]) => (
                  <button key={id} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${sourceFilter === id ? "bg-volt text-iron-950" : "bg-white/10 text-iron-300 hover:bg-white/20"}`} onClick={() => setSourceFilter(id)}>{label}</button>
                ))}
              </div>
              <input className="field" placeholder="Search name, muscle, or equipment..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <select className="field" value={muscle} onChange={(event) => setMuscle(event.target.value)}>
                  <option value="all">All muscles</option>
                  {muscleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)}>
                  <option value="all">All equipment</option>
                  {equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                  <option value="all">Any type</option>
                  <option value="compound">Compound</option>
                  <option value="isolation">Isolation/accessory</option>
                </select>
                <select className="field" value={gymSpecificFilter} onChange={(event) => setGymSpecificFilter(event.target.value)}>
                  <option value="all">Gym: any</option>
                  <option value="enabled">Gym-specific</option>
                  <option value="disabled">Standard</option>
                </select>
              </div>
              <div className="scrollbar-none mt-4 max-h-[32rem] overflow-y-auto rounded-lg border border-white/10 bg-iron-950/45 p-2">
                <div className="space-y-2">
                  {exercises.map((exercise) => {
                    const childVariations = !query && !showVariations
                      ? db.exercises.filter((e) => e.parentExerciseId === exercise.id && !e.isArchived && (!e.ownerUserId || e.ownerUserId === user.id))
                      : [];
                    const isExpanded = expandedVariantParentIds.has(exercise.id);
                    const parentName = exercise.isVariation && exercise.parentExerciseId
                      ? db.exercises.find((e) => e.id === exercise.parentExerciseId)?.name
                      : undefined;
                    return (
                      <div key={exercise.id}>
                        <div
                          className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-3 py-2.5 cursor-pointer transition hover:bg-white/[0.07] active:bg-white/[0.1]"
                          onClick={() => startEditExercise(exercise)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm text-iron-100">{exercise.name}</p>
                              {parentName && (
                                <p className="mt-0.5 flex items-center gap-1 text-[0.68rem] font-bold text-iron-400">
                                  <GitBranch className="h-3 w-3" /> Variation of {parentName}
                                </p>
                              )}
                              <p className="mt-0.5 text-xs text-iron-500">{exercise.primaryMuscles.join(", ")} · {exercise.equipment.join(", ")} · {exercise.ownerUserId ? "custom" : isCompound(exercise) ? "compound" : "isolation"}{exercise.userModified ? " · edited" : ""}{exercise.isArchived ? " · hidden" : ""}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {!exercise.ownerUserId && exercise.userModified && builtInExercises.some((b) => b.id === exercise.id) && (
                                <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); resetExerciseToDefault(exercise); }} title="Reset to app default">
                                  <RotateCcw className="h-3.5 w-3.5 text-volt/80" />
                                </button>
                              )}
                              <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setProgressExerciseId(exercise.id); }} title="Progress chart">
                                <BarChart3 className="h-3.5 w-3.5 text-iron-500" />
                              </button>
                              <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); duplicateExercise(exercise); }} title="Duplicate">
                                <Copy className="h-3.5 w-3.5 text-iron-500" />
                              </button>
                              {exercise.ownerUserId ? (
                                <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); deleteExercise(exercise); }} title="Delete custom exercise">
                                  <Trash2 className="h-3.5 w-3.5 text-orange-400/70" />
                                </button>
                              ) : !exercise.isArchived ? (
                                <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); deleteExercise(exercise); }} title="Hide from library">
                                  <EyeOff className="h-3.5 w-3.5 text-iron-600" />
                                </button>
                              ) : null}
                              <ChevronRight className="h-4 w-4 text-iron-600" />
                            </div>
                          </div>
                        </div>
                        {childVariations.length > 0 && (
                          <div className="ml-4 mt-1">
                            <button
                              className="flex items-center gap-1 rounded px-2 py-1 text-[0.68rem] font-bold text-iron-400 hover:text-iron-200 transition"
                              onClick={() => setExpandedVariantParentIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(exercise.id)) next.delete(exercise.id); else next.add(exercise.id);
                                return next;
                              })}
                            >
                              <ChevronDown className={`h-3 w-3 transition ${isExpanded ? "rotate-180" : ""}`} />
                              {childVariations.length} variation{childVariations.length > 1 ? "s" : ""}
                              <button className="ml-1 text-iron-500 hover:text-volt" onClick={(e) => { e.stopPropagation(); startAddVariation(exercise); }} title="Add variation">
                                <Plus className="h-3 w-3" />
                              </button>
                            </button>
                            {isExpanded && (
                              <div className="mt-1 space-y-0.5 border-l border-white/[0.07] pl-3">
                                {childVariations.map((child) => (
                                  <div
                                    key={child.id}
                                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 cursor-pointer transition hover:bg-white/[0.06]"
                                    onClick={() => startEditExercise(child)}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-iron-200">{child.name}</p>
                                        {child.variationType && <p className="text-[0.68rem] text-iron-500">{child.variationType}</p>}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-0.5">
                                        <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setProgressExerciseId(child.id); }} title="Progress chart"><BarChart3 className="h-3 w-3 text-iron-500" /></button>
                                        <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); duplicateExercise(child); }} title="Duplicate"><Copy className="h-3 w-3 text-iron-500" /></button>
                                        {child.ownerUserId ? (
                                          <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); deleteExercise(child); }} title="Delete"><Trash2 className="h-3 w-3 text-orange-400/70" /></button>
                                        ) : !child.isArchived ? (
                                          <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); deleteExercise(child); }} title="Hide"><EyeOff className="h-3 w-3 text-iron-600" /></button>
                                        ) : null}
                                        <ChevronRight className="h-3.5 w-3.5 text-iron-600" />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!exercises.length && <EmptyState title="No exercises match" detail="Clear a filter or add a new exercise." />}
                </div>
              </div>
            </div>
            <div className={editingExerciseId ? "fixed inset-0 z-50 overflow-y-auto bg-iron-950 xl:static xl:inset-auto xl:z-auto xl:overflow-visible xl:bg-transparent" : ""}>
              {editingExerciseId && (
                <div className="xl:hidden sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-iron-950 px-4 py-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-black text-sm">Edit Exercise</p>
                    {draft.name && <p className="truncate text-xs text-iron-400">{draft.name}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className="rounded-lg bg-volt px-3 py-1.5 text-xs font-black text-iron-950" onClick={saveEditExercise}>Save</button>
                    <button className="btn-ghost" onClick={() => { setEditingExerciseId(undefined); setDraft(emptyDraft); }} aria-label="Close editor">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            <Panel title={editingExerciseId ? "Edit Exercise" : "Add Exercise"} icon={editingExerciseId ? Pencil : Plus}>
              <div className="space-y-3">
                {editingExerciseId && (() => {
                  const editing = db.exercises.find((e) => e.id === editingExerciseId);
                  return editing && !editing.ownerUserId ? (
                    <p className="rounded-lg border border-volt/30 bg-volt/5 px-3 py-2 text-xs text-volt">Editing default exercise — {editSaveContext(authMode, cloudStatus)} Use Reset to restore app defaults.</p>
                  ) : null;
                })()}
                <TextField label="Name" value={draft.name} onChange={(name) => setDraft((value) => ({ ...value, name }))} />
                <TextField label="Notes / cues" value={draft.notes} onChange={(notes) => setDraft((value) => ({ ...value, notes }))} />
                <SelectField label="Equipment" value={draft.equipment} options={equipmentOptions} onChange={(value) => setDraft((item) => ({ ...item, equipment: value as EquipmentCategory }))} />
                <SelectField label="Exercise category" value={draft.exerciseCategory} options={exerciseCategoryOptions} onChange={(value) => setDraft((item) => ({ ...item, exerciseCategory: value as ExerciseCategoryLabel, isCompound: ["sbd", "main_compound", "secondary_compound", "machine_compound"].includes(value) || item.isCompound }))} />
                {(() => {
                  const effectiveLoading = getEffectiveLoading(
                    { category: draft.equipment, loadingProfileId: draft.loadingProfileId || undefined, defaultIncrement: draft.defaultIncrement, customIncrement: draft.customIncrement, trackPerSide: false },
                    db.loadingProfiles,
                    user.unit as UnitPreference
                  );
                  const profileOptions = ["", ...(db.loadingProfiles ?? []).map((p) => p.id)];
                  const profileLabels: Record<string, string> = { "": "Auto / Default" };
                  (db.loadingProfiles ?? []).forEach((p) => { profileLabels[p.id] = p.name; });
                  const fieldLabel = draft.equipment === "cable" ? "Cable Stack" : "Loading Profile";
                  const hasProfileActive = effectiveLoading.source === "exercise_profile" || effectiveLoading.source === "equipment_default";
                  const effectiveText = (() => {
                    const { increment, unit, source, loadingProfileName } = effectiveLoading;
                    const jumpStr = `${increment} ${unit} jumps`;
                    if (source === "exercise_profile") return `Using ${loadingProfileName}: ${jumpStr}`;
                    if (source === "equipment_default") return `Auto (${draft.equipment}): ${loadingProfileName} — ${jumpStr}`;
                    return `Exercise-specific: ${jumpStr}`;
                  })();
                  return (
                    <>
                      {hasProfileActive ? (
                        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-iron-400">
                          Unit controlled by <span className="font-bold text-iron-200">{effectiveLoading.loadingProfileName}</span>
                        </p>
                      ) : (
                        <SelectField label="Default unit" value={draft.defaultUnit} options={exerciseUnitOptions} onChange={(defaultUnit) => setDraft((item) => ({ ...item, defaultUnit: defaultUnit as ExerciseUnit, allowedUnits: Array.from(new Set([...item.allowedUnits, defaultUnit as ExerciseUnit])) }))} />
                      )}
                      <div>
                        <SelectField label={fieldLabel} value={draft.loadingProfileId} options={profileOptions} labels={profileLabels} onChange={(v) => setDraft((item) => ({ ...item, loadingProfileId: v }))} />
                        <p className="mt-1 text-xs text-iron-500">{effectiveText}</p>
                      </div>
                      {!hasProfileActive && (
                        <div className="grid grid-cols-2 gap-3">
                          <NumberField label="Default increment" value={draft.defaultIncrement} onChange={(defaultIncrement) => setDraft((item) => ({ ...item, defaultIncrement }))} />
                          <NumberField label="Custom increment" value={draft.customIncrement} onChange={(customIncrement) => setDraft((item) => ({ ...item, customIncrement }))} />
                        </div>
                      )}
                    </>
                  );
                })()}
                <div>
                  <p className="label mb-2">Primary muscles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {muscleOptions.map((item) => <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.primaryMuscles.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftMuscle("primaryMuscles", item)}>{item}</button>)}
                  </div>
                </div>
                <div>
                  <p className="label mb-2">Secondary muscles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {muscleOptions
                      .filter((item) => showAllSecondaryMuscles || COMMON_SECONDARY_MUSCLES.includes(item) || draft.secondaryMuscles.includes(item))
                      .map((item) => (
                        <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.secondaryMuscles.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftMuscle("secondaryMuscles", item)}>
                          {item}
                        </button>
                      ))}
                  </div>
                  <button className="mt-2 text-xs text-iron-500 hover:text-iron-300 transition" onClick={() => setShowAllSecondaryMuscles((v) => !v)}>
                    {showAllSecondaryMuscles ? "Show common muscles only" : "Show all muscles"}
                  </button>
                </div>
                {/* Variation controls */}
                <div>
                  <button
                    className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-300 transition hover:bg-white/[0.07]"
                    onClick={() => setDraft((d) => ({ ...d, isVariation: !d.isVariation }))}
                  >
                    This is a variation of another exercise
                    <span className={`text-[10px] font-black ${draft.isVariation ? "text-volt" : "text-iron-500"}`}>{draft.isVariation ? "ON" : "OFF"}</span>
                  </button>
                  {draft.isVariation && (
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3">
                      <div>
                        <p className="label mb-1">Parent exercise</p>
                        {draft.parentExerciseId ? (
                          <div className="flex items-center gap-2 rounded-lg border border-volt/40 bg-volt/10 px-3 py-2">
                            <span className="flex-1 text-sm font-bold text-volt">
                              {db.exercises.find((e) => e.id === draft.parentExerciseId)?.name ?? draft.parentExerciseId}
                            </span>
                            <button
                              className="text-volt/60 hover:text-volt transition"
                              onClick={() => { setDraft((d) => ({ ...d, parentExerciseId: "" })); setParentSearch(""); }}
                              title="Clear parent"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              className="field"
                              placeholder="Search exercises..."
                              value={parentSearch}
                              onChange={(e) => setParentSearch(e.target.value)}
                            />
                            {parentSearch.trim() && (
                              <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-iron-900">
                                {db.exercises
                                  .filter((e) => !e.isVariation && !e.isArchived && (!e.ownerUserId || e.ownerUserId === user.id) && e.id !== editingExerciseId && e.name.toLowerCase().includes(parentSearch.toLowerCase()))
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map((e) => (
                                    <button
                                      key={e.id}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition"
                                      onClick={() => { setDraft((d) => ({ ...d, parentExerciseId: e.id })); setParentSearch(e.name); }}
                                    >
                                      {e.name}
                                    </button>
                                  ))
                                }
                                {db.exercises.filter((e) => !e.isVariation && !e.isArchived && (!e.ownerUserId || e.ownerUserId === user.id) && e.id !== editingExerciseId && e.name.toLowerCase().includes(parentSearch.toLowerCase())).length === 0 && (
                                  <p className="px-3 py-2 text-xs text-iron-500">No exercises found</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <TextField label="Variation type (e.g. Paused, Box, Deficit)" value={draft.variationType} onChange={(variationType) => setDraft((d) => ({ ...d, variationType }))} />
                    </div>
                  )}
                </div>
                {/* Advanced options */}
                <div>
                  <button
                    className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-300 transition hover:bg-white/[0.07]"
                    onClick={() => setShowAdvancedExercise((v) => !v)}
                  >
                    Advanced Options {draft.movementPatterns.length > 0 ? `(${draft.movementPatterns.length} patterns)` : ""}
                    <ChevronRight className={`h-3 w-3 transition ${showAdvancedExercise ? "rotate-90" : ""}`} />
                  </button>
                  {showAdvancedExercise && (
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3">
                      <NumberField label="Fatigue rating (1–5)" value={draft.fatigueRating} onChange={(fatigueRating) => setDraft((item) => ({ ...item, fatigueRating: Math.min(5, Math.max(1, fatigueRating)) }))} />
                      <div>
                        <p className="label mb-2">Movement patterns</p>
                        <p className="mb-2 text-xs text-iron-500">Used internally for program generation suggestions.</p>
                        <div className="grid grid-cols-2 gap-2">
                          {movementOptions.map((item) => <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.movementPatterns.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftPattern(item)}>{item}</button>)}
                        </div>
                      </div>
                      <div>
                        <p className="label mb-2">Allowed units</p>
                        <div className="grid grid-cols-2 gap-2">
                          {exerciseUnitOptions.map((item) => <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.allowedUnits.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftUnit(item)}>{item}</button>)}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-iron-200"><input type="checkbox" checked={draft.isCompound} onChange={(event) => setDraft((item) => ({ ...item, isCompound: event.target.checked }))} /> Compound movement</label>
                        <label className="flex items-center gap-2 text-sm text-iron-200"><input type="checkbox" checked={draft.canBeGymSpecific} onChange={(event) => setDraft((item) => ({ ...item, canBeGymSpecific: event.target.checked }))} /> Can vary by gym</label>
                        <label className="flex items-center gap-2 text-sm text-iron-200"><input type="checkbox" checked={draft.isGymSpecificEnabled} onChange={(event) => setDraft((item) => ({ ...item, isGymSpecificEnabled: event.target.checked, canBeGymSpecific: item.canBeGymSpecific || event.target.checked }))} /> Enable gym-specific behavior</label>
                      </div>
                      <TextField label="Tags (comma-separated)" value={draft.tags} onChange={(tags) => setDraft((value) => ({ ...value, tags }))} />
                    </div>
                  )}
                </div>
                {editingExerciseId ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button className="btn-primary" onClick={saveEditExercise}>
                      <Save className="h-4 w-4" /> Save Changes
                    </button>
                    <button className="btn-secondary" onClick={() => { setEditingExerciseId(undefined); setDraft(emptyDraft); }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary w-full" onClick={addCustomExercise}>Add Exercise</button>
                )}
              </div>
            </Panel>
            </div>
          </section>
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
                <p className="mt-1 text-sm text-volt">
                  {latestEntryValues?.e1rm ? `e1RM ${formatWeight(latestEntryValues.e1rm, displayUnit)} ${displayUnit}` : "No e1RM available"}
                </p>
                <p className="mt-1 text-xs text-iron-400">
                  {latestEntry.sourceLabel} — {new Date(latestEntry.date).toLocaleDateString()}
                  {latestEntry.exerciseId !== exercise.id ? ` · ${latestEntry.exerciseName}` : ""}
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${graphMode === "overall" ? "bg-volt text-iron-950" : "bg-white/10 text-iron-300"}`} onClick={() => setGraphMode("overall")}>Overall</button>
              <button
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${graphMode === "current-block" ? "bg-volt text-iron-950" : "bg-white/10 text-iron-300"} disabled:opacity-40`}
                onClick={() => setGraphMode("current-block")}
                disabled={!activeBlock}
                title={!activeBlock ? "No active block" : ""}
              >
                Current Block
              </button>
              {hasVariationFamily && (
                <button
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${includeVariations ? "bg-steel text-white" : "bg-white/10 text-iron-300"}`}
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
                    <p className="text-xs text-volt">{displayValues.e1rm ? `e1RM ${formatWeight(displayValues.e1rm, displayUnit)} ${displayUnit}` : "No e1RM available"}</p>
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

function ExerciseE1rmChart({ points, unit, title = "e1RM trend" }: { points: { label: string; value: number }[]; unit: "lb" | "kg"; title?: string }) {
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
        <path d={path} fill="none" stroke="#a3ff12" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="5" fill="#a3ff12" />
            <text x={point.x} y={height - 8} textAnchor="middle" fontSize="12" fill="#94a3b8">{point.label}</text>
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="12" fill="#f8fafc">{formatWeight(point.value, unit)}</text>
          </g>
        ))}
      </svg>
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
    <section className="grid gap-4">
      <Panel title="Loading Profiles" icon={SlidersHorizontal}>
        <p className="mb-3 text-xs text-iron-400">Each profile defines the weight unit and increment for a piece of equipment. Exercises use these automatically based on their equipment type, or you can assign a specific profile in the exercise editor.</p>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              {editingId === profile.id ? editForm : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{profile.name}</p>
                    <p className="text-xs text-iron-400">
                      <span className="mr-2 rounded px-1.5 py-0.5 bg-white/10 text-iron-300">{EQUIPMENT_TYPE_DISPLAY[profile.equipmentType] ?? profile.equipmentType}</span>
                      {profile.increment} {profile.unit} jumps
                    </p>
                    {profile.notes && <p className="mt-0.5 text-xs text-iron-500">{profile.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost" onClick={() => startEdit(profile)} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost text-iron-500 hover:text-orange-300" onClick={() => deleteProfile(profile.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!profiles.length && <p className="text-xs text-iron-500">No loading profiles yet. Add one below.</p>}
        </div>
        {editingId === "new" ? (
          <div className="mt-3">{editForm}</div>
        ) : (
          <button className="btn-secondary mt-3 w-full" onClick={startAdd}><Plus className="h-4 w-4" /> Add Loading Profile</button>
        )}
      </Panel>
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
  db, user, program, block, weekNumber, updateDb, onClose, onResumeWorkout
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program: Program;
  block: TrainingBlock;
  weekNumber: number;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onClose: () => void;
  onResumeWorkout?: (
    sessionId?: string,
    options?: {
      previousScreen?: LoggerNavigationState["previousScreen"];
      completedReviewState?: CompletedReviewState;
      loggerMode?: LoggerNavigationState["loggerMode"];
    }
  ) => Promise<void> | void;
}) {
  const week = block.weeks.find((w) => w.weekNumber === weekNumber);
  const prevWeek = block.weeks.find((w) => w.weekNumber === weekNumber - 1);
  const splitTemplate = db.splitTemplates.find((s) => s.id === block.splitTemplateId);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
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
    <div className="space-y-5">
      {/* Context banner — clearly identifies active-block editing */}
      <div className="rounded-lg border border-volt/30 bg-volt/5 p-4">
        <p className="label text-volt">Editing active block</p>
        <h2 className="mt-1 font-black">{program.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-iron-300">
          <span>Week {weekNumber} of {block.lengthWeeks}</span>
          {copiedFromPrev && prevWeek && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-iron-400">
              <Copy className="mr-1 inline h-3 w-3" />Copied from Week {weekNumber - 1}
            </span>
          )}
          {copied && !copiedFromPrev && prevWeek && (
            <span className="rounded-full bg-ember/20 px-2 py-0.5 text-xs text-orange-300">
              Split days differ — exercises not copied from Week {weekNumber - 1}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-iron-400">Changes are saved automatically. No sets are auto-applied — everything shown here is a plan.</p>
      </div>

      {/* TODO: Algorithm suggestion panel will live here in a future iteration.
          It will call recommendNextWeekAdjustments(block, sessions) and display
          per-exercise load/rep suggestions the user can optionally apply. */}

      <WeekDayCardSelector
        db={db}
        days={week.workouts}
        selectedDayId={selectedDay?.id}
        onSelect={(day) => setSelectedDayIdx(Math.max(0, week.workouts.findIndex((item) => item.id === day.id)))}
      />

      {/* Per-day editor */}
      {selectedDay ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="label">{selectedCompletedSession ? "Completed Session Review" : "Planned Day Editor"}</p>
              <h3 className="font-black">{selectedDay.name}</h3>
              <p className="text-sm text-iron-400">
                {selectedDaySplitDay ? `${selectedDaySplitDay.name} — ` : ""}{selectedDay.focus}
                {splitDayMismatch ? " · different split day from prior week" : ""}
              </p>
            </div>
          </div>
          {selectedCompletedSession ? (
            <Panel title="Completed session is locked from plan edits" icon={CheckCircle2}>
              <p className="text-sm text-iron-300">This day already has completed workout history. Review or edit the logged session without overwriting the planned day.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button className="btn-secondary w-full" onClick={() => setReviewSessionId(selectedCompletedSession.id)}>
                  View Summary
                </button>
                <button
                  className="btn-primary w-full"
                  onClick={() => void onResumeWorkout?.(selectedCompletedSession.id, {
                    previousScreen: "week",
                    completedReviewState: { sessionId: selectedCompletedSession.id, returnScreen: "week" },
                    loggerMode: "completed-edit",
                  })}
                >
                  Edit Workout
                </button>
              </div>
            </Panel>
          ) : (
            <WorkoutDayEditor db={db} user={user} program={program} day={selectedDay} updateDb={updateDb} />
          )}
        </div>
      ) : (
        <EmptyState title="No days in this week" detail="This week has no workout days configured." />
      )}

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary flex-1" onClick={saveAndClose}>
          <Save className="h-4 w-4" />
          Save Week {weekNumber}
        </button>
        <button className="btn-secondary" onClick={onClose}>
          Exit Editor
        </button>
        <button className="btn-secondary border-ember/40 text-orange-100" onClick={discardDraft}>
          Discard Draft
        </button>
      </div>
    </div>
  );
}

function WeekProgressScreen({
  db, user, setScreen, planWeekRequest, onPlanWeekRequestHandled, editingWeekNumber, onEditingWeekNumberChange, updateDb, onResumeWorkout, onOpenCompletedSessionReview
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
}) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const block = activeProgram?.blocks[0];
  // Derive the current week from the block cursor (sequence-based, not calendar-based).
  const cursor = block ? getCurrentWorkoutForUser(db, user.id) : undefined;
  const currentWeekNumber = (cursor?.week.weekNumber ?? block?.currentWeek) || 1;
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(currentWeekNumber);
  const [inlineDayEditId, setInlineDayEditId] = useState<string | undefined>();
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
  const averageWorkoutScore = completedSessions.length
    ? Math.round(completedSessions.reduce((sum, session) => sum + (session.workoutScore ?? calculateWorkoutScore(session).score), 0) / completedSessions.length)
    : 0;
  const averageSetRating = completedSessions
    .flatMap((session) => session.loggedExercises)
    .flatMap((exercise) => exercise.sets)
    .filter((set) => !set.skipped);
  const averageSetFeel = averageSetRating.length
    ? Number((averageSetRating.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / averageSetRating.length).toFixed(1))
    : 0;
  const selectedWeekComplete = week && block ? isTrainingWeekComplete(week, block, db.sessions.filter((s) => s.userId === user.id && s.blockId === block.id)) : false;
  const selectedWeekPlanned = isWeekPlanned(week);

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
        updateDb={updateDb}
        onClose={() => setPlanningWeekNumber(undefined)}
        onResumeWorkout={onResumeWorkout}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Week" title="Block Progress" />
      {!activeProgram || !block || !week ? (
        <Panel title="No Active Block" icon={CalendarDays}>
          <EmptyState title="No active block yet" detail="Activate a program block before tracking week progress." />
          <button className="btn-primary mt-4 w-full" onClick={() => setScreen("programs")}>Open Program Builder</button>
        </Panel>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Active block" value={activeProgram.name} />
            <Metric label="Current week" value={currentWeekNumber} unit={`/ ${block.lengthWeeks}`} />
            <Metric label="Completion" value={completionPercent} unit="%" />
            <Metric label="Workout score" value={averageWorkoutScore || "-"} unit={averageWorkoutScore ? "/100" : undefined} />
          </section>
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Completed" value={completedSessions.length} unit="workouts" />
            <Metric label="Skipped" value={skippedCount} unit="days" />
            <Metric label="In progress" value={weekSessions.filter((session) => session.status === "in-progress").length} unit="workouts" />
            <Metric label="Set feel" value={averageSetFeel || "-"} unit={averageSetFeel ? "/5" : undefined} />
          </section>
          {block.weeks.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {block.weeks.map((w) => {
                const wComplete = isTrainingWeekComplete(w, block, db.sessions.filter((s) => s.userId === user.id && s.blockId === block.id));
                const wPlanned = isWeekPlanned(w);
                return (
                  <button
                    key={w.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      selectedWeekNumber === w.weekNumber
                        ? "bg-volt text-iron-950"
                        : wComplete
                          ? "bg-white/10 text-volt"
                          : wPlanned
                            ? "bg-steel/15 text-steel"
                            : "bg-white/[0.05] text-iron-400"
                    }`}
                    onClick={() => setSelectedWeekNumber(w.weekNumber)}
                  >
                    Week {w.weekNumber}{w.weekNumber === currentWeekNumber ? " ●" : wComplete ? " ✓" : wPlanned ? " Planned" : ""}
                  </button>
                );
              })}
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
          <Panel title={`Block Week ${week.weekNumber}${selectedWeekComplete ? " (completed)" : selectedWeekPlanned ? " (planned)" : " (unplanned)"}`} icon={ClipboardList}>
            <div className="space-y-3">
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
                const isInlineEditing = inlineDayEditId === day.id;
                return (
                  <div key={day.id} className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="label">{day.scheduledDay || `Day ${day.dayIndex || ""}`}</p>
                        <h3 className="mt-1 font-black">{day.name}</h3>
                        <p className="mt-1 text-sm text-iron-300">{day.focus} - planned {plannedSets} sets</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeProgram && session?.status !== "completed" && (
                          <button
                            className={`btn-compact ${isInlineEditing ? "text-volt" : ""}`}
                            onClick={() => setInlineDayEditId(isInlineEditing ? undefined : day.id)}
                          >
                            <Pencil className="h-3 w-3" />
                            {isInlineEditing ? "Done" : "Edit"}
                          </button>
                        )}
                        {session?.status === "review" && onResumeWorkout && (
                          <button
                            className="btn-ghost text-xs text-steel"
                            onClick={() => void onResumeWorkout(session.id)}
                          >
                            <Timer className="h-3.5 w-3.5" />
                            Resume
                          </button>
                        )}
                        {session?.status === "completed" ? (
                          <button
                            className="rounded-full bg-volt px-3 py-1 text-xs font-black text-iron-950"
                            onClick={() => onOpenCompletedSessionReview?.(session.id, "week")}
                            aria-label={`View completed workout summary for ${day.name}`}
                          >
                            completed
                          </button>
                        ) : (
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${session?.status === "review" ? "bg-steel/20 text-steel" : session?.status === "in-progress" ? "bg-steel/20 text-steel" : daySkipped ? "bg-ember/20 text-orange-100" : isWorkoutDayPlanned(day) ? "bg-white/10 text-iron-300" : "bg-white/[0.05] text-iron-500"}`}>
                            {session?.status === "review" ? "in review" : session?.status || (daySkipped ? "skipped" : isWorkoutDayPlanned(day) ? "planned" : "unplanned")}
                          </span>
                        )}
                      </div>
                    </div>
                    {session ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-5">
                        <Metric label="Hard sets" value={actualSets} />
                        <Metric label="Skipped" value={skippedSets} />
                        <Metric label="Avg RPE" value={avgRpe ? avgRpe.toFixed(1) : "-"} />
                        <Metric label="Avg feel" value={avgSetRating ? avgSetRating.toFixed(1) : "-"} unit={avgSetRating ? "/5" : undefined} />
                        <Metric label="Score" value={score || "-"} unit={score ? "/100" : undefined} />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-iron-400">{daySkipped ? "Skipped manually. It remains in the block history and Today moved on." : "No session logged yet. Readiness, feel summary, and score will appear here after completion."}</p>
                    )}
                    {session?.progressionSuggestions?.length ? (
                      <div className="mt-3 rounded-lg bg-iron-950/50 p-3">
                        <p className="label mb-1">Suggestions</p>
                        {session.progressionSuggestions.slice(0, 2).map((item) => <p key={item} className="text-sm text-iron-300">{item}</p>)}
                      </div>
                    ) : null}
                    {session?.status === "completed" && onResumeWorkout && (
                      <button
                        className="btn-compact mt-2"
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
                    {isInlineEditing && activeProgram && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <p className="label mb-2 text-volt">Editing exercises for this day</p>
                        <WorkoutDayEditor db={db} user={user} program={activeProgram} day={day} updateDb={updateDb} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
          {offProgramCompletedSessions.length > 0 && (
            <Panel title="Off-Program History" icon={Dumbbell}>
              <div className="space-y-2">
                {offProgramCompletedSessions.map((session) => (
                  <button key={session.id} className="flex w-full items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.07]" onClick={() => onOpenCompletedSessionReview?.(session.id, "week")}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{session.name}</span>
                      <span className="text-xs text-iron-500">{new Date(session.completedAt || session.startedAt).toLocaleDateString()} · {countSessionCompletedSets(session)} sets</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-iron-500" />
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function CompletedWorkoutReview({
  db,
  user,
  session,
  onBack,
  onEditWorkout,
  backLabel = "Back"
}: {
  db: TrainingDatabase;
  user: UserProfile;
  session: WorkoutSession;
  onBack: () => void;
  onEditWorkout?: () => void;
  backLabel?: string;
}) {
  const score = calculateWorkoutScore(session);
  const totalSets = countSessionCompletedSets(session);
  const skippedSets = session.loggedExercises.flatMap((exercise) => exercise.sets).filter((set) => set.skipped).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle eyebrow={session.offProgram ? "Off-Program Review" : "Completed Session Review"} title={session.name} />
        <button className="btn-secondary" onClick={onBack}>{backLabel}</button>
      </div>
      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="Status" value={session.offProgram ? "Off-program" : "Completed"} />
        <Metric label="Sets" value={totalSets} />
        <Metric label="Skipped" value={skippedSets} />
        <Metric label="Score" value={score.score || "-"} unit={score.score ? "/100" : undefined} />
      </section>
      <Panel title="Completed Workout" icon={ClipboardList}>
        <div className="mb-4 flex flex-wrap gap-2">
          {onEditWorkout && (
            <button className="btn-primary" onClick={onEditWorkout}>
              <Pencil className="h-4 w-4" />
              Edit Workout
            </button>
          )}
          <button className="btn-secondary" onClick={onBack}>{backLabel}</button>
        </div>
        {session.notes && (
          <div className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
            <p className="label mb-1">Session notes</p>
            <p className="text-sm text-iron-200 whitespace-pre-wrap">{session.notes}</p>
          </div>
        )}
        <div className="mt-4 space-y-4">
          {session.loggedExercises.map((logged) => {
            const exercise = db.exercises.find((item) => item.id === logged.exerciseId);
            const displayUnit = exercise ? getExerciseLoadUnit(exercise, user, logged.sets.find((set) => isWeightUnit(set.unit))?.unit) : user.unit;
            return (
              <div key={logged.id} className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-black">{exercise?.name || "Unknown exercise"}</p>
                    <p className="text-xs text-iron-400">{logged.offProgram || session.offProgram ? "Off-program" : "Planned"} · {logged.sets.filter(isCompletedValidSet).length} completed sets</p>
                  </div>
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
      </Panel>
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
    <div className="mt-4 rounded-lg border border-volt/30 bg-volt/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-volt" />
        <p className="font-black text-volt">Week {review.weekNumber} Complete!</p>
        {review.totalWeeks > 0 && <span className="text-xs text-iron-400">({review.weekNumber}/{review.totalWeeks})</span>}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Metric label="Completed" value={review.completedWorkouts} unit={`/${review.plannedWorkouts}`} />
        <Metric label="Skipped" value={review.skippedWorkouts} />
        <Metric label="Hard sets" value={review.hardSetsCompleted} />
        <Metric label="Avg RPE" value={review.averageRpe ? review.averageRpe.toFixed(1) : "-"} />
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <Metric label="Avg feel" value={review.averageSetRating ? `${review.averageSetRating.toFixed(1)}/5` : "-"} />
        {review.averageReadiness !== null && <Metric label="Avg readiness" value={review.averageReadiness.toFixed(0)} unit="/10" />}
      </div>
      {review.suggestions.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg bg-iron-950/50 p-3">
          <p className="label">Suggestions for next week</p>
          {review.suggestions.map((suggestion) => (
            <p key={suggestion} className="text-sm text-iron-300">• {suggestion}</p>
          ))}
          <p className="mt-2 text-xs text-iron-400">These are suggestions only. Review them and start the next week when ready — nothing changes automatically.</p>
        </div>
      )}
      {isFinalWeek ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-volt/30 bg-volt/10 p-3 text-center">
            <p className="font-bold text-volt">Block complete.</p>
            <p className="mt-1 text-sm text-iron-300">There is no Week {review.weekNumber + 1} in this block. Review it, archive it, repeat it, or start a new one.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {onReviewBlock && <button className="btn-secondary w-full" onClick={onReviewBlock}>Review Block</button>}
            {onArchiveBlock && <button className="btn-secondary w-full" onClick={onArchiveBlock}>Archive Block / Finish Block</button>}
            {onRepeatBlock && <button className="btn-secondary w-full" onClick={onRepeatBlock}>Repeat Block</button>}
            {onStartNewBlock && <button className="btn-primary w-full" onClick={onStartNewBlock}>Start New Block</button>}
          </div>
        </div>
      ) : !confirmed ? (
        <div className="grid gap-2 sm:grid-cols-2">
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
        <div className="space-y-3">
          <div className="rounded-lg border border-volt/30 bg-volt/10 p-3 text-center">
            <p className="font-bold text-volt">Ready to go.</p>
            <p className="mt-1 text-sm text-iron-300">Head to Today to begin your next training day. The block will advance automatically when you start your first session of Week {review.weekNumber + 1}.</p>
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

function ReadinessCard({ onSubmit }: { onSubmit: (input: Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">) => void; user: UserProfile }) {
  const [draft, setDraft] = useState({
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
    limitations: ""
  });
  const score = calculateReadinessScore(draft);
  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="label">Readiness Check-In</p>
          <h3 className="mt-1 text-xl font-black">Score: {score}/100</h3>
        </div>
        <Activity className="h-8 w-8 text-volt" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["sleepQuality", "stress", "soreness", "motivation", "energy", "jointPain", "nutritionQuality"] as const).map((key) => (
          <SmallRating key={key} label={key.replace(/([A-Z])/g, " $1")} value={String(draft[key])} onChange={(value) => setDraft((current) => ({ ...current, [key]: Number(value) }))} />
        ))}
        <BigInput label="Bodyweight" value={draft.bodyweight ? String(draft.bodyweight) : ""} onChange={(value) => setDraft((current) => ({ ...current, bodyweight: Number(value) || 0 }))} />
      </div>
      <textarea className="field mt-3 min-h-16" placeholder="Pain, limitations, travel, low sleep, etc." value={draft.limitations} onChange={(event) => setDraft((current) => ({ ...current, limitations: event.target.value }))} />
      <button className="btn-primary mt-4 w-full" onClick={() => onSubmit({ ...draft, bodyweight: draft.bodyweight || undefined })}>Save Check-In</button>
    </section>
  );
}

function WorkoutDayView({ db, user, day }: { db: TrainingDatabase; user: UserProfile; day?: WorkoutDay }) {
  if (!day) return <EmptyState title="No workout selected" detail="Create a program or template to start logging." />;
  return (
    <section className="panel p-4">
      <div className="mb-3">
        <p className="label">Workout plan</p>
        <h3 className="mt-1 text-lg font-semibold">{day.name}</h3>
      </div>
      <div className="space-y-1.5">
        {day.exercises.map((planned) => {
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
            <div key={planned.id} className="rounded-lg bg-white/[0.04] px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-iron-100">{exercise?.name}</p>
                  <p className="mt-0.5 text-xs text-iron-500">
                    {planned.plannedSets.length} sets · {planned.plannedSets[0]?.targetReps} reps · RPE {planned.plannedSets[0]?.targetRpe}
                    {planned.exerciseRole && <span className="ml-1.5 rounded-sm bg-white/[0.07] px-1.5 text-iron-400">{planned.exerciseRole.replaceAll("_", " ")}</span>}
                    {planned.fatigueTag === "high" && <span className="ml-1.5 text-amber-400">high fatigue</span>}
                  </p>
                </div>
                {badgeText && (
                  <span className="shrink-0 text-xs font-medium text-volt/80">
                    {badgeText}
                  </span>
                )}
              </div>
              {(recentHistory?.reps || recommendation?.recommendedWeight) && (
                <p className="mt-1 text-xs text-iron-500">
                  {recentHistory?.reps
                    ? `Recent: ${formatExerciseLoadText({ exercise, user, weight: recentHistory.weight, unit: displayUnit, bodyweightEmptyLabel: "BW" })} × ${recentHistory.reps}${recentHistory.rpe ? ` @ ${recentHistory.rpe}` : ""}`
                    : previewReasonParts[0] || ""}
                </p>
              )}
              {planned.notes && <p className="mt-1 text-xs text-iron-500">{planned.notes}</p>}
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
    <section className="panel-soft overflow-hidden">
      <div className="border-b border-white/[0.07] px-3 py-2.5">
        <p className="text-sm font-medium text-iron-200">{exercise.name} <span className="text-iron-500">· {logged.sets.filter(isHardSet).length} hard · {logged.sets.filter(s => s.skipped).length} skipped</span></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase text-iron-500">
            <tr>
              <th className="p-3">Set</th>
              <th className="p-3">{bodyweightMovement ? "Load" : `Load (${unit})`}</th>
              <th className="p-3">Reps</th>
              <th className="p-3">RPE</th>
              <th className="p-3">Feel</th>
              <th className="p-3">{bodyweightMovement ? "e1RM" : `e1RM (${unit})`}</th>
            </tr>
          </thead>
          <tbody>
            {logged.sets.map((set, index) => (
              <tr key={set.id} className={`border-t border-white/10 ${set.skipped ? "opacity-40" : ""}`}>
                <td className="p-3">{index + 1}{set.skipped ? " (skip)" : ""}</td>
                <td className="p-3">{set.skipped ? "—" : formatExerciseLoadText({ exercise, user, weight: set.actualWeight, unit: set.unit || unit })}</td>
                <td className="p-3">{set.skipped ? "—" : set.actualReps}</td>
                <td className="p-3">{set.skipped ? "—" : set.actualRpe || "-"}</td>
                <td className="p-3">{set.skipped ? "—" : `${set.setRating}/5`}</td>
                <td className="p-3">{set.skipped ? "—" : estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10) || "—"}</td>
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

function findPlannedExercise(db: TrainingDatabase, session?: WorkoutSession, log?: LoggedExercise): PlannedExercise | undefined {
  if (!session || !log) return undefined;
  const template = db.workoutTemplates.find((item) => item.id === session.templateId);
  const templatePlanned = template?.days.flatMap((day) => day.exercises).find((item) => item.id === log.plannedExerciseId);
  if (templatePlanned) return templatePlanned;
  return db.programs.flatMap((program) => program.blocks).flatMap((block) => block.weeks).flatMap((week) => week.workouts).flatMap((day) => day.exercises).find((item) => item.id === log.plannedExerciseId);
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
  recommendedWeight?: number;
}): ReturnType<typeof emptySetDraft> {
  const { actualSet, plannedSet, previousCompletedSet, draftKey, recommendedWeight } = params;
  if (actualSet) {
    return draftFromSetOrPlan(actualSet, plannedSet ?? undefined, previousCompletedSet, draftKey);
  }
  const plannedForDraft = !previousCompletedSet && plannedSet && plannedSet.plannedWeight === undefined && recommendedWeight
    ? { ...plannedSet, plannedWeight: recommendedWeight }
    : plannedSet;
  return emptySetDraft(plannedForDraft, previousCompletedSet, draftKey);
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
      <p className="label">{eyebrow}</p>
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
        className="w-full max-w-sm rounded-t-2xl border border-white/[0.09] bg-iron-950 pb-safe sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <p className="border-b border-white/[0.07] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.1em] text-iron-500">
            {title}
          </p>
        )}
        <div className="p-2">
          {items.map((item, i) => (
            <button
              key={i}
              disabled={item.disabled}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 ${
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
        <div className="border-t border-white/[0.07] p-2">
          <button
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-iron-300 transition hover:bg-white/[0.07] active:scale-[0.98]"
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
  const resolvedRole = exerciseRole ?? inferBaseExerciseRole(exercise);
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
