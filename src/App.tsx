import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Dumbbell,
  Eye,
  FileDown,
  FileUp,
  Gauge,
  Home,
  Library,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShieldAlert,
  Shuffle,
  SlidersHorizontal,
  Star,
  Timer,
  Trash2,
  UserRound,
  Warehouse,
  Wand2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTrainingDb } from "./hooks/useTrainingDb";
import {
  advanceActiveBlockAfterWorkoutCompletion,
  getCurrentWorkoutForUser,
  markRestDayComplete,
  moveActiveBlockPointer,
  skipActiveWorkout,
  syncActiveBlockProgress
} from "./lib/blockProgression";
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
import { verifyPin } from "./lib/security";
import { recommendNextSetAdjustment as algNextSetAdjustment } from "./lib/algorithms";
import {
  buildFatigueBudget,
  getExerciseIncrement,
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
} from "./lib/trainingIntelligence";
import {
  calculateMuscleVolume,
  calculateReadinessScore,
  calculateSessionExerciseE1RM,
  calculateSetPerformanceScore,
  calculateWorkoutScore,
  detectWeakPointTags,
  estimateOneRepMax,
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
import type {
  BlockType,
  CompoundSettings,
  DayFocus,
  EquipmentCategory,
  Exercise,
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
  | "programs"
  | "library"
  | "week"
  | "progress"
  | "settings";

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

function renderCloudStatusLabel(status: "disabled" | "not-signed-in" | "syncing" | "synced" | "failed"): string {
  switch (status) {
    case "disabled":
      return "Cloud Off";
    case "not-signed-in":
      return "Not Signed In";
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

function App() {
  const { db, currentUser, loading, error, updateDb, importDb, reseed, cloud } = useTrainingDb();
  const [screen, setScreen] = useState<Screen>("today");
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
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

  if (error || !db) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-sm p-6">
          <ShieldAlert className="mb-4 h-10 w-10 text-ember" />
          <h1 className="text-xl font-black">Could not load the app</h1>
          <p className="mt-2 text-sm text-iron-300">{error || "Unknown local database error."}</p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return <LoginScreen db={db} updateDb={updateDb} />;
  }

  const persistedActiveSession = db.sessions.find((session) => session.userId === currentUser.id && session.status === "in-progress");
  const activeSession = activeSessionId ? db.sessions.find((session) => session.id === activeSessionId) || persistedActiveSession : persistedActiveSession;

  return (
    <div className="min-h-dvh max-w-full pb-32 text-white lg:pb-0">
      <header className="safe-top sticky top-0 z-30 border-b border-white/10 bg-iron-950/85 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 py-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setScreen("today")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-volt text-iron-950">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">Iron Orbit</p>
              <p className="truncate text-xs text-iron-400">{currentUser.displayName} - {currentUser.goal}</p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              className={`hidden rounded-full border px-3 py-1 text-xs font-bold sm:inline-flex ${
                cloud.status === "synced"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : cloud.status === "syncing"
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
              <button className="btn-primary hidden sm:inline-flex" onClick={() => setScreen("logger")}>
                <Timer className="h-4 w-4" />
                Live
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() =>
                updateDb((draft) => {
                  draft.currentUserId = undefined;
                  return draft;
                })
              }
              title="Switch user"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="sticky top-20 hidden h-fit rounded-lg border border-white/10 bg-white/[0.04] p-2 lg:block">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold transition ${
                screen === item.id ? "bg-volt text-iron-950" : "text-iron-200 hover:bg-white/10"
              }`}
              onClick={() => setScreen(item.id)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </aside>

        <section className="min-w-0">
          {screen === "today" && <TodayScreen db={db} user={currentUser} updateDb={updateDb} setScreen={setScreen} setActiveSessionId={setActiveSessionId} editingWeekNumber={editingWeekNumber} onPlanWeek={(n) => { setPlanWeekRequest(n); setScreen("week"); }} />}
          {screen === "logger" && (
            <LiveLogger db={db} user={currentUser} updateDb={updateDb} sessionId={activeSession?.id} setActiveSessionId={setActiveSessionId} setScreen={setScreen} />
          )}
          {screen === "programs" && <BuilderScreen db={db} user={currentUser} updateDb={updateDb} setScreen={setScreen} />}
          {screen === "library" && <LibraryScreen db={db} user={currentUser} updateDb={updateDb} />}
          {screen === "week" && <WeekProgressScreen db={db} user={currentUser} setScreen={setScreen} planWeekRequest={planWeekRequest} onPlanWeekRequestHandled={() => setPlanWeekRequest(undefined)} editingWeekNumber={editingWeekNumber} onEditingWeekNumberChange={setEditingWeekNumber} updateDb={updateDb} />}
          {screen === "progress" && <ProgressScreen db={db} user={currentUser} />}
          {screen === "settings" && <SettingsScreen db={db} user={currentUser} updateDb={updateDb} importDb={importDb} reseed={reseed} cloud={cloud} />}
        </section>
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-iron-950/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.68rem] font-bold ${
                screen === item.id ? "bg-volt text-iron-950" : "text-iron-300"
              }`}
              onClick={() => setScreen(item.id)}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function LoginScreen({
  db,
  updateDb
}: {
  db: TrainingDatabase;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const [username, setUsername] = useState(db.users[0]?.username || "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault();
    const user = db.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
    if (!user || !(await verifyPin(pin, user.pinHash))) {
      setError("Username or PIN did not match.");
      return;
    }
    await updateDb((draft) => {
      draft.currentUserId = user.id;
      return draft;
    });
  }

  return (
    <main className="safe-top flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-volt text-iron-950">
            <Dumbbell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Iron Orbit</h1>
            <p className="text-sm text-iron-300">Local-first training command center.</p>
          </div>
        </div>
        <form className="panel space-y-4 p-5" onSubmit={login}>
          <div>
            <label className="label">User</label>
            <select className="field mt-2" value={username} onChange={(event) => setUsername(event.target.value)}>
              {db.users.map((user) => (
                <option key={user.id} value={user.username}>
                  {user.displayName} ({user.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">PIN</label>
            <input className="field mt-2 text-2xl tracking-[0.4em]" inputMode="numeric" type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="0000" />
          </div>
          {error && <p className="rounded-lg border border-ember/30 bg-ember/10 p-3 text-sm text-orange-100">{error}</p>}
          <button className="btn-primary w-full" type="submit">
            <UserRound className="h-4 w-4" />
            Enter
          </button>
          <div className="rounded-lg border border-white/10 bg-iron-950/70 p-3 text-xs text-iron-300">
            Seed users: <span className="font-bold text-white">nathan / 2468</span> and <span className="font-bold text-white">ava / 1357</span>. Local PINs separate profiles, but this is not high-security encryption.
          </div>
        </form>
      </div>
    </main>
  );
}

function TodayScreen({
  db,
  user,
  updateDb,
  setScreen,
  setActiveSessionId,
  editingWeekNumber,
  onPlanWeek
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  setScreen: (screen: Screen) => void;
  setActiveSessionId: (id: string) => void;
  editingWeekNumber?: number;
  onPlanWeek: (weekNumber: number) => void;
}) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const todayPlan = getCurrentWorkoutForUser(db, user.id);
  const selectedDay = todayPlan?.day;
  const activeBlock = activeProgram?.blocks[0];
  const inProgressSession = db.sessions.find((session) => session.userId === user.id && session.status === "in-progress");
  const otherInProgressSession = selectedDay && inProgressSession?.workoutDayId !== selectedDay.id ? inProgressSession : undefined;
  const [showEditDay, setShowEditDay] = useState(false);

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
    const sameDaySession = db.sessions.find((session) => session.userId === user.id && session.status === "in-progress" && session.workoutDayId === day.id);
    if (sameDaySession) {
      setActiveSessionId(sameDaySession.id);
      setScreen("logger");
      return;
    }
    // Check for any other in-progress session (different day) and confirm before archiving it
    const otherInProgress = db.sessions.find((session) => session.userId === user.id && session.status === "in-progress" && session.workoutDayId !== day.id);
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
    setActiveSessionId(session.id);
    setScreen("logger");
  }

  function updateActiveBlockProgress(action: "skip" | "rest-complete" | "next" | "previous") {
    if (!activeBlock) return;
    if (action === "skip" && selectedDay && !confirm(`Skip "${selectedDay.name}" and move to the next block day?`)) return;
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
            session.status === "in-progress" &&
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
    const otherInProgress = db.sessions.find((s) => s.userId === user.id && s.status === "in-progress");
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
    setActiveSessionId(session.id);
    setScreen("logger");
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
                setActiveSessionId(session.id);
                setScreen("logger");
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
      <PageTitle eyebrow="Today" title="Next actionable workout from your active block." />
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
        <section className="panel border-ember/40 p-4">
          <p className="label text-orange-300">Week {currentWeekNumber} is not ready yet</p>
          <h2 className="mt-1 font-black">{isWeekDraft(todayPlan?.week) || weekBeingEdited ? "Planning in progress" : "Plan this week before training"}</h2>
          <p className="mt-1 text-sm text-iron-300">
            Finish planning and save Week {currentWeekNumber} in the Week Planner before starting this workout.
            Draft exercises are not shown until the week is saved.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary w-full" onClick={() => onPlanWeek(currentWeekNumber)}>
              <CalendarDays className="h-4 w-4" /> Continue Planning Week {currentWeekNumber}
            </button>
            <button className="btn-secondary w-full" onClick={goOffProgram}>
              <Shuffle className="h-4 w-4" /> Go Off Program
            </button>
          </div>
        </section>
      )}
      {/* Week ready: show normal workout card */}
      {activeProgram && selectedDay && !weekLocked && (
        <section className="panel p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <p className="label">Active block pointer</p>
              <h2 className="mt-1 text-xl font-black">{selectedDay.name}</h2>
              <p className="text-sm text-iron-300">{todayPlan?.label} - {selectedDay.scheduledDay || "Flexible day"} - {selectedDay.focus} - ~{estimateWorkoutDuration(selectedDay)} min</p>
              {!selectedDay.exercises.length && (
                <p className="mt-2 text-sm text-iron-400">
                  Week {currentWeekNumber} hasn&apos;t been planned yet. Plan it in the Week tab before starting.
                </p>
              )}
            </div>
            {selectedDay.status === "rest" ? (
              <button className="btn-primary w-full md:w-auto" onClick={() => updateActiveBlockProgress("rest-complete")}>
                <CheckCircle2 className="h-4 w-4" />
                Mark Rest Complete
              </button>
            ) : selectedDay.exercises.length ? (
              <button className="btn-primary w-full md:w-auto" onClick={() => startWorkout(selectedDay)}>
                <Timer className="h-4 w-4" />
                {inProgressSession?.workoutDayId === selectedDay.id ? "Resume Workout" : "Start Workout"}
              </button>
            ) : (
              <button className="btn-primary w-full md:w-auto" onClick={() => onPlanWeek(currentWeekNumber)}>
                <CalendarDays className="h-4 w-4" />
                Plan Week {currentWeekNumber}
              </button>
            )}
          </div>
          {otherInProgressSession && (
            <button className="btn-secondary mt-4 w-full" onClick={() => { setActiveSessionId(otherInProgressSession.id); setScreen("logger"); }}>
              Resume Other In-Progress
            </button>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button className="btn-secondary w-full" onClick={() => updateActiveBlockProgress("previous")}>Go Back</button>
            <button className="btn-secondary w-full" onClick={() => updateActiveBlockProgress("next")}>Move To Next Day</button>
            <button className="btn-secondary w-full border-ember/40 text-orange-100" onClick={() => updateActiveBlockProgress("skip")}>Skip This Workout</button>
          </div>
          {selectedDay.status !== "rest" && selectedDay.exercises.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                className="btn-secondary w-full"
                onClick={() => setShowEditDay((v) => !v)}
              >
                <Pencil className="h-4 w-4" />
                {showEditDay ? "Done Editing" : "Edit Current Day"}
              </button>
              <button className="btn-secondary w-full" onClick={goOffProgram}>
                <Shuffle className="h-4 w-4" />
                Go Off Program
              </button>
            </div>
          )}
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
  setScreen
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  sessionId?: string;
  setActiveSessionId: (id: string | undefined) => void;
  setScreen: (screen: Screen) => void;
}) {
  const session = db.sessions.find((item) => item.id === sessionId && item.userId === user.id);
  const [activeExerciseId, setActiveExerciseId] = useState(session?.loggedExercises[session.currentExerciseIndex || 0]?.id || session?.loggedExercises[0]?.id);
  const activeExerciseLog = session?.loggedExercises.find((item) => item.id === activeExerciseId) || session?.loggedExercises[session.currentExerciseIndex || 0] || session?.loggedExercises[0];
  const activeExerciseIndex = session?.loggedExercises.findIndex((item) => item.id === activeExerciseLog?.id) ?? 0;
  const exercise = db.exercises.find((item) => item.id === activeExerciseLog?.exerciseId);
  const foundPlanned = findPlannedExercise(db, session, activeExerciseLog);
  // Synthesize a PlannedExercise for off-program exercises that have offProgramPlannedSets
  const planned = foundPlanned ?? (activeExerciseLog?.offProgramPlannedSets?.length
    ? { id: "", exerciseId: activeExerciseLog.exerciseId, required: false, order: 0, plannedSets: activeExerciseLog.offProgramPlannedSets, restSeconds: 90, substitutionIds: [] } as PlannedExercise
    : undefined);
  const plannedSets = planned?.plannedSets || [];
  const currentSetIndex = activeExerciseLog?.sets.length || 0;
  const [selectedSetIndex, setSelectedSetIndex] = useState<number | null>(null);
  const effectiveSetIndex = selectedSetIndex ?? currentSetIndex;
  const currentPlannedSet = plannedSets[effectiveSetIndex];
  const lastSet = activeExerciseLog?.sets.at(-1);
  const selectedActualSet = activeExerciseLog?.sets[effectiveSetIndex];
  const previousCompletedSet = activeExerciseLog ? findPreviousCompletedSet(activeExerciseLog.sets, effectiveSetIndex) : undefined;
  const draftKey = `${activeExerciseLog?.id || "none"}:${effectiveSetIndex}`;
  const [setDraft, setSetDraft] = useState(() => emptySetDraft(currentPlannedSet, undefined, draftKey));
  const [restRemaining, setRestRemaining] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showAddExercisePicker, setShowAddExercisePicker] = useState(false);
  const [showSkipReason, setShowSkipReason] = useState(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [pendingOffProgramExercise, setPendingOffProgramExercise] = useState<Exercise | undefined>();
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

  useEffect(() => {
    setSetDraft((current) => {
      // Don't overwrite a draft the user manually loaded by tapping a set row
      if (selectedSetIndex !== null) return current;
      if (current.draftKey === draftKey && current.actualWeight) return current;
      const shouldUseAdjustedFallback = !previousCompletedSet && !!adjustedWeight && !!currentPlannedSet && currentPlannedSet.plannedWeight === undefined;
      const plannedForDraft = shouldUseAdjustedFallback
        ? { ...currentPlannedSet, plannedWeight: adjustedWeight }
        : currentPlannedSet;
      return emptySetDraft(
        plannedForDraft,
        previousCompletedSet,
        draftKey
      );
    });
  }, [adjustedWeight, currentPlannedSet, draftKey, previousCompletedSet, selectedSetIndex]);

  useEffect(() => {
    // Reset set navigation when switching exercises
    setSelectedSetIndex(null);
    setSuggestionApplied(false);
  }, [activeExerciseId]);

  useEffect(() => {
    setSuggestionApplied(false);
  }, [lastSet?.id]);

  useEffect(() => {
    if (session && !activeExerciseId) setActiveExerciseId(session.loggedExercises[session.currentExerciseIndex || 0]?.id);
  }, [activeExerciseId, session]);

  if (!session) {
    return (
      <Panel title="No Active Workout" icon={Timer}>
        <EmptyState title="Start a workout first" detail="Open Today and start one of your templates or generated program days." />
      </Panel>
    );
  }

  // Off-program or brand-new empty session: no exercises yet — let the user add them
  if (!session.loggedExercises.length || !activeExerciseLog || !exercise) {
    const isEmptySession = !session.loggedExercises.length;
    return (
      <div className="space-y-5">
        <PageTitle eyebrow="Today" title={isEmptySession ? "Off-Program Session" : "No exercise selected"} />
        {isEmptySession && (
          <Panel title="Build your workout" icon={Dumbbell}>
            <p className="mb-3 text-sm text-iron-300">
              This is an off-program session. Add exercises below to start logging. Nothing will change in your active block or future weeks.
            </p>
            <EmptyState title="No exercises yet" detail="Tap Add Exercise to begin." />
          </Panel>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="btn-primary" onClick={() => setShowAddExercisePicker(true)}>
            <Plus className="h-4 w-4" /> Add Exercise
          </button>
          <button
            className="btn-secondary border-ember/40 text-orange-100"
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
  const isEditingLoggedSet = selectedSetIndex !== null && !!selectedActualSet;
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
        setsCompletedThisExercise: countCompletedThroughIndex(liveExerciseLog.sets, sourceSetIndex)
      })
    : undefined;
  const lastSetWasSkipped = lastSet?.skipped === true;
  const persistedAppliedRec = recommendation
    ? liveSession.recommendations.find((r) => recommendationIdentityMatches(r, recommendation) && r.applied === true)
    : undefined;
  const isCurrentSetLastPlannedSet = plannedSets.length > 0 && effectiveSetIndex === plannedSets.length - 1;
  const isPastLastPlannedSet = plannedSets.length > 0 && effectiveSetIndex >= plannedSets.length;
  const hasMoreExercises = activeExerciseIndex < liveSession.loggedExercises.length - 1;
  const primaryAction = isCurrentSetLastPlannedSet ? (hasMoreExercises ? "finish-exercise" : "finish-workout") : "next-set";
  const primaryActionLabel = isEditingLoggedSet
    ? selectedActualSet?.skipped && (Number(setDraft.actualWeight) > 0 || Number(setDraft.actualReps) > 0) ? "Log Set" : "Save Changes"
    : primaryAction === "finish-workout" ? "Finish Workout" : primaryAction === "finish-exercise" ? "Finish Exercise" : "Next Set";
  const allExercisesComplete = liveSession.loggedExercises.every((logged) => {
    const plannedForLog = findPlannedExercise(db, liveSession, logged);
    if (plannedForLog?.plannedSets.length) return logged.sets.length >= plannedForLog.plannedSets.length;
    return logged.sets.filter((s) => !s.skipped).length > 0;
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

  function logSet(rating: SetRating = setDraft.setRating, afterAction: "stay" | "next-exercise" | "finish-workout" = "stay") {
    const actualWeight = Number(setDraft.actualWeight) || 0;
    const actualReps = Number(setDraft.actualReps) || 0;
    // Zero weight on a weight-based exercise is not a completed working set — skip it instead.
    const isWeightBased = liveExercise.category !== "bodyweight" && !liveExercise.bestTrackedBy.includes("time");
    if (isWeightBased && actualWeight === 0 && !isEditingLoggedSet) {
      skipSet();
      return;
    }

    if (isEditingLoggedSet && selectedSetIndex !== null && selectedActualSet) {
      const updatedSet: LoggedSet = {
        ...selectedActualSet,
        kind: setDraft.kind,
        plannedSetId: currentPlannedSet?.id ?? selectedActualSet?.plannedSetId,
        plannedWeight: currentPlannedSet?.plannedWeight ?? selectedActualSet?.plannedWeight,
        plannedReps: currentPlannedSet?.targetReps ?? selectedActualSet?.plannedReps,
        actualWeight,
        actualReps,
        targetRpe: currentPlannedSet?.targetRpe ?? selectedActualSet?.targetRpe,
        actualRpe: setDraft.actualRpe ? Math.min(10, Math.max(0, Number(setDraft.actualRpe))) || undefined : undefined,
        setRating: rating,
        formRating: Number(setDraft.formRating) || selectedActualSet?.formRating,
        muscleFeelRating: Number(setDraft.muscleFeelRating) || selectedActualSet?.muscleFeelRating,
        pumpRating: Number(setDraft.pumpRating) || selectedActualSet?.pumpRating,
        painRating: Number(setDraft.painRating) || selectedActualSet?.painRating,
        sorenessRating: Number(setDraft.sorenessRating) || selectedActualSet?.sorenessRating,
        notes: setDraft.notes,
        skipped: false,
        completedAt: nowIso()
      };
      const performance = calculateSetPerformanceScore(currentPlannedSet, updatedSet);
      updatedSet.performanceScore = performance.score;
      updatedSet.performanceStatus = performance.status;
      const nextTargetIndex = selectedSetIndex + 1;
      const rec = buildSetRecommendation({
        user,
        exercise: liveExercise,
        sourceSet: updatedSet,
        sourceSetIndex: selectedSetIndex,
        targetSetIndex: nextTargetIndex,
        sourceExerciseIndex: activeExerciseIndex,
        targetExerciseIndex: activeExerciseIndex,
        nextPlannedSet: plannedSets[nextTargetIndex],
        setsCompletedThisExercise: countCompletedThroughIndex(
          liveExerciseLog.sets.map((set, index) => index === selectedSetIndex ? updatedSet : set),
          selectedSetIndex
        )
      });
      void updateDb((draft) => {
        const target = draft.sessions.find((item) => item.id === liveSession.id);
        const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
        if (log?.sets[selectedSetIndex]) {
          log.sets[selectedSetIndex] = updatedSet;
          log.weakPointTags = detectWeakPointTags(log);
        }
        if (target) {
          target.updatedAt = nowIso();
          if (rec) upsertRecommendation(target.recommendations, rec);
        }
        if (rec) upsertRecommendation(draft.recommendations, rec);
        return draft;
      });
      setSelectedSetIndex(null);
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
      setsCompletedThisExercise: liveExerciseLog.sets.filter((s) => !s.skipped).length + 1
    });
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log) {
        log.sets.push(loggedSet);
        log.weakPointTags = detectWeakPointTags(log);
      }
      if (target) {
        if (afterAction === "next-exercise" && hasMoreExercises) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
          target.currentSetIndex = 0;
        } else {
          target.currentExerciseIndex = activeExerciseIndex;
          target.currentSetIndex = (log?.sets.length || 0);
        }
        target.updatedAt = nowIso();
      }
      if (target && log) learnGymExerciseAdjustment({ db: draft, user, session: target, loggedExercise: log, loggedSet, exercise: liveExercise });
      if (target && rec) upsertRecommendation(target.recommendations, rec);
      if (rec) upsertRecommendation(draft.recommendations, rec);
      if (target && afterAction === "finish-workout") {
        finishWorkoutInDraft(draft, user, target);
      }
      return draft;
    });
    setSelectedSetIndex(null);
    setRestRemaining(planned?.restSeconds || user.settings.defaultRestSeconds);
    const nextDraftIndex = effectiveSetIndex + 1;
    setSetDraft(emptySetDraft(plannedSets[nextDraftIndex], loggedSet, `${liveExerciseLog.id}:${nextDraftIndex}`));
    if (afterAction === "next-exercise") {
      const nextLog = liveSession.loggedExercises[activeExerciseIndex + 1];
      if (nextLog) setActiveExerciseId(nextLog.id);
    }
    if (afterAction === "finish-workout") {
      setActiveSessionId(undefined);
      setScreen("week");
    }
  }

  function skipSet() {
    if (isPastLastPlannedSet) return;
    const wasLastSet = isCurrentSetLastPlannedSet;
    const shouldAdvanceExercise = wasLastSet && hasMoreExercises;
    const shouldFinishWorkout = wasLastSet && !hasMoreExercises;
    const skippedSet: LoggedSet = {
      id: createId("set"),
      kind: currentPlannedSet?.kind || "working",
      setNumber: effectiveSetIndex + 1,
      plannedSetId: currentPlannedSet?.id,
      plannedWeight: currentPlannedSet?.plannedWeight,
      plannedReps: currentPlannedSet?.targetReps,
      actualWeight: 0,
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
        if (shouldAdvanceExercise) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
          target.currentSetIndex = 0;
        } else {
          target.currentExerciseIndex = activeExerciseIndex;
          target.currentSetIndex = log?.sets.length || 0;
        }
        target.updatedAt = nowIso();
        if (shouldFinishWorkout) finishWorkoutInDraft(draft, user, target);
      }
      return draft;
    });
    setSelectedSetIndex(null);
    setSetDraft(emptySetDraft(plannedSets[currentSetIndex + 1], skippedSet, `${liveExerciseLog.id}:${currentSetIndex + 1}`));
    if (shouldAdvanceExercise) {
      const nextLog = liveSession.loggedExercises[activeExerciseIndex + 1];
      if (nextLog) setActiveExerciseId(nextLog.id);
    }
    if (shouldFinishWorkout) {
      setActiveSessionId(undefined);
      setScreen("week");
    }
  }

  function addSet() {
    const base = currentPlannedSet || planned?.plannedSets.at(-1);
    const extra: PlannedSet = {
      ...(base || { id: createId("pset"), kind: "working" as const, targetReps: 8, targetRpe: 7 }),
      id: createId("pset"),
      kind: "working",
      setNumber: (planned?.plannedSets.length || currentSetIndex) + 1,
      percentageOfTopSet: base?.percentageOfTopSet,
      notes: "Added set."
    };
    void updateDb((draft) => {
      const targetProgram = draft.programs.find((program) => program.id === liveSession.programId);
      const targetPlanned = targetProgram?.blocks.flatMap((block) => block.weeks).flatMap((week) => week.workouts).flatMap((day) => day.exercises).find((item) => item.id === liveExerciseLog.plannedExerciseId);
      if (targetPlanned) targetPlanned.plannedSets.push(extra);
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (target) target.updatedAt = nowIso();
      return draft;
    });
  }

  function previousSet() {
    const targetIndex = Math.max(0, effectiveSetIndex - 1);
    const targetSet = liveExerciseLog.sets[targetIndex];
    setSelectedSetIndex(targetIndex);
    setSetDraft(draftFromSetOrPlan(targetSet, plannedSets[targetIndex], liveExerciseLog.sets[targetIndex - 1], `${liveExerciseLog.id}:${targetIndex}`));
  }

  function navigateToNextExercise() {
    const nextLog = liveSession.loggedExercises[activeExerciseIndex + 1];
    if (nextLog) {
      setActiveExerciseId(nextLog.id);
      void updateDb((draft) => {
        const target = draft.sessions.find((item) => item.id === liveSession.id);
        if (target) {
          target.currentExerciseIndex = activeExerciseIndex + 1;
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
      if (log && planned) {
        const setsToSkip = planned.plannedSets.slice(log.sets.length);
        for (const ps of setsToSkip) {
          log.sets.push({
            id: createId("set"),
            kind: ps.kind || "working",
            setNumber: log.sets.length + 1,
            plannedSetId: ps.id,
            plannedReps: ps.targetReps,
            actualWeight: 0,
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
    const nextLog = liveSession.loggedExercises[activeExerciseIndex + 1];
    if (nextLog) setActiveExerciseId(nextLog.id);
  }

  function finishExercise() {
    if (!isPastLastPlannedSet && currentSetIndex < plannedSets.length) {
      setShowFinishConfirm(true);
      return;
    }
    setSelectedSetIndex(null);
    navigateToNextExercise();
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

  function applySuggestion() {
    if (!recommendation?.action?.suggestedWeight) return;
    const suggestedWeight = recommendation.action.suggestedWeight;
    setSetDraft((current) => ({ ...current, actualWeight: String(suggestedWeight) }));
    setSuggestionApplied(true);
    const targetId = recommendation.action.targetPlannedSetId ?? currentPlannedSet?.id;
    void updateDb((draft) => {
      // Mark recommendation as applied in session
      const sessionTarget = draft.sessions.find((s) => s.id === liveSession.id);
      if (sessionTarget) {
        upsertRecommendation(sessionTarget.recommendations, { ...recommendation, applied: true });
        const recInSession = sessionTarget.recommendations.find((r) => recommendationIdentityMatches(r, recommendation));
        if (recInSession) recInSession.applied = true;
        sessionTarget.loggedExercises
          .flatMap((logged) => logged.offProgramPlannedSets || [])
          .forEach((set) => { if (set.id === targetId) set.plannedWeight = suggestedWeight; });
      }
      upsertRecommendation(draft.recommendations, { ...recommendation, applied: true });
      const recInGlobal = draft.recommendations.find((r) => recommendationIdentityMatches(r, recommendation));
      if (recInGlobal) recInGlobal.applied = true;
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
      if (target) finishWorkoutInDraft(draft, user, target);
      return draft;
    });
    setActiveSessionId(undefined);
    setScreen("week");
  }

  function confirmAddOffProgramExercise(exercise: Exercise) {
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      if (!target) return draft;
      const plannedWeight = getOffProgramStartingWeight({ db: draft, user, exercise, targetReps: 8, targetRpe: 7 });
      target.loggedExercises.push({
        id: createId("logex"),
        exerciseId: exercise.id,
        plannedExerciseId: undefined,
        order: target.loggedExercises.length + 1,
        sets: [],
        weakPointTags: [],
        offProgram: true,
        offProgramPlannedSets: buildOffProgramPlannedSets(3, 8, 7, plannedWeight),
      });
      target.updatedAt = nowIso();
      return draft;
    });
    const nextExIndex = liveSession.loggedExercises.length;
    setPendingOffProgramExercise(undefined);
    // Navigate to the newly added exercise after the db update propagates
    setTimeout(() => {
      const updated = liveSession.loggedExercises[nextExIndex];
      if (updated) setActiveExerciseId(updated.id);
    }, 50);
  }

  return (
    <div className="space-y-5">
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-iron-950/80 px-4">
          <div className="panel w-full max-w-sm space-y-4 p-6">
            <h3 className="text-xl font-black">Finish exercise early?</h3>
            <p className="text-sm text-iron-300">
              {plannedSets.length - currentSetIndex} set{plannedSets.length - currentSetIndex !== 1 ? "s" : ""} remaining will be marked as skipped.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-secondary" onClick={() => setShowFinishConfirm(false)}>Cancel</button>
              <button className="btn-primary" onClick={skipRemainingAndNavigate}>Skip & Finish</button>
            </div>
          </div>
        </div>
      )}
      <PageTitle eyebrow="Live Logger" title={session.name} />
      {!session.readiness && <ReadinessCard onSubmit={addReadiness} user={user} />}
      {session.readiness && (
        <div className="panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label">Readiness</p>
              <p className="mt-1 text-2xl font-black">{session.readiness.readinessScore}/100</p>
              <p className="mt-1 text-sm text-iron-300">{readinessAdjustment(session.readiness).explanation}</p>
            </div>
            <Gauge className="h-8 w-8 text-volt" />
          </div>
        </div>
      )}

      <section className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="panel h-fit min-w-0 p-3">
          <p className="label mb-3">Exercises</p>
          <div className="space-y-2">
            {session.loggedExercises.map((logged) => {
              const item = db.exercises.find((candidate) => candidate.id === logged.exerciseId);
              return (
                <button
                  key={logged.id}
                  className={`flex w-full items-center justify-between rounded-lg p-3 text-left ${
                    activeExerciseLog.id === logged.id ? "bg-volt text-iron-950" : "bg-white/[0.06] text-white"
                  }`}
                  onClick={() => {
                    setActiveExerciseId(logged.id);
      setSetDraft(emptySetDraft(findPlannedExercise(db, session, logged)?.plannedSets[logged.sets.length] || undefined, logged.sets.at(-1), `${logged.id}:${logged.sets.length}`));
                  }}
                >
                  <span>
                    <span className="block text-sm font-black">{item?.name}</span>
                    <span className="text-xs opacity-75">{logged.sets.length} sets logged</span>
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-4 pb-6">
          <section className="panel min-w-0 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label">Logging</p>
                <h3 className="mt-1 text-2xl font-black">{exercise.name}</h3>
                <p className="mt-1 text-sm text-iron-300">{exercise.setupCues.slice(0, 3).join(" - ")}</p>
                <p className="mt-1 text-xs text-iron-500">
                  {activeGym?.name || "No gym selected"}
                  {weightRec?.recommendedWeight
                    ? ` — suggested ${weightRec.recommendedWeight} ${user.unit} (${weightRec.confidence}% ${weightRec.confidenceBand})`
                    : ""}
                </p>
              </div>
              <RestTimer seconds={restRemaining} setSeconds={setRestRemaining} />
            </div>
            {compatibleMachines.length > 0 && (
              <div className="mt-4">
                <label className="label">Machine / station</label>
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
              </div>
            )}
            <div className="mt-4 rounded-lg border border-white/10 bg-iron-950/55 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="label">Set lineup</p>
                <p className="text-xs font-bold text-iron-400">{Math.min(liveExerciseLog.sets.length, plannedSets.length)} / {plannedSets.length || liveExerciseLog.sets.length} planned complete</p>
              </div>
              <div className="space-y-2">
                {plannedSets.map((set, index) => {
                  const actual = liveExerciseLog.sets[index];
                  const isSelected = index === effectiveSetIndex;
                  const isLoggedSet = !!actual;
                  const isPending = !actual && index >= currentSetIndex;
                  const statusLabel = actual?.skipped ? "Skipped" : actual ? "Complete" : isSelected && !actual ? "Current" : "Pending";
                  return (
                    <div
                      key={set.id}
                      className={`rounded-lg border p-3 transition cursor-pointer active:bg-white/10 ${isSelected ? "border-volt bg-volt/10" : actual ? "border-volt/30 bg-white/[0.07]" : "border-white/10 bg-white/[0.035]"}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedSetIndex(index);
                        const newDraftKey = `${liveExerciseLog.id}:${index}`;
                        setSetDraft(draftFromSetOrPlan(actual, set, liveExerciseLog.sets[index - 1], newDraftKey));
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black">Set {index + 1} — {statusLabel}</p>
                        <p className="text-xs text-iron-400">{set.kind}{isLoggedSet ? " · tap to edit" : isPending ? " · tap to jump" : ""}</p>
                      </div>
                      <p className="mt-1 text-sm text-iron-300">Planned: {set.plannedWeight || "-"} {user.unit} × {set.targetReps} @ RPE {set.targetRpe || "?"}</p>
                      {actual && <p className="mt-1 text-sm text-volt">Actual: {actual.skipped ? "Skipped" : `${actual.actualWeight} ${user.unit} × ${actual.actualReps} @ RPE ${actual.actualRpe || "?"}`}</p>}
                    </div>
                  );
                })}
                {!plannedSets.length && <EmptyState title="No planned sets" detail="Add a set or pick a planned exercise before logging." />}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BigInput label="Weight" value={setDraft.actualWeight} onChange={(value) => setSetDraft((draft) => ({ ...draft, actualWeight: value }))} />
              <BigInput label="Reps" value={setDraft.actualReps} onChange={(value) => setSetDraft((draft) => ({ ...draft, actualReps: value }))} />
              <BigInput label="RPE" value={setDraft.actualRpe} onChange={(value) => setSetDraft((draft) => ({ ...draft, actualRpe: value }))} step="0.5" />
            </div>
            <div className="mt-4">
              <p className="label mb-2">Set difficulty (1 = much harder · 3 = as planned · 5 = very easy)</p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as SetRating[]).map((rating) => {
                const labels: Record<number, string> = { 1: "1\nHarder", 2: "2\nA bit hard", 3: "3\nAs planned", 4: "4\nA bit easy", 5: "5\nEasy" };
                return (
                  <button key={rating} className={`min-h-12 rounded-lg text-[0.65rem] font-black leading-tight ${setDraft.setRating === rating ? "bg-volt text-iron-950" : "bg-white/10 text-white"}`} onClick={() => setSetDraft((draft) => ({ ...draft, setRating: rating }))}>
                    {labels[rating].split("\n").map((line, i) => <span key={i} className={i === 0 ? "block text-sm" : "block opacity-70"}>{line}</span>)}
                  </button>
                );
              })}
            </div>
            {/* Form/Feel/Pump/Pain/Sore are stored in the data model but hidden from the default
                per-set UI to reduce friction. They will surface at exercise-level in a future pass.
                Data fields remain in setDraft and are saved when non-default values exist. */}
            <textarea className="field mt-4 min-h-14" placeholder="Optional set notes..." value={setDraft.notes} onChange={(event) => setSetDraft((draft) => ({ ...draft, notes: event.target.value }))} />
            {showSkipReason && (
              <div className="mt-4 rounded-lg border border-ember/30 bg-ember/5 p-3">
                <p className="label mb-2 text-orange-300">Skip reason (optional)</p>
                <div className="flex flex-wrap gap-2">
                  {["Fatigue", "Pain", "Poor form", "Time", "Other"].map((reason) => (
                    <button
                      key={reason}
                      className="rounded-lg border border-ember/30 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-orange-200 transition hover:bg-ember/20"
                      onClick={() => {
                        setSetDraft((d) => ({ ...d, notes: reason }));
                        setShowSkipReason(false);
                        skipSet();
                      }}
                    >
                      {reason}
                    </button>
                  ))}
                  <button
                    className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-iron-400 transition hover:bg-white/10"
                    onClick={() => { setShowSkipReason(false); skipSet(); }}
                  >
                    Skip without reason
                  </button>
                  <button
                    className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-iron-500 transition hover:bg-white/10"
                    onClick={() => setShowSkipReason(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {isEditingLoggedSet
                ? <button className="btn-secondary" onClick={() => setSelectedSetIndex(null)}>Cancel</button>
                : <button className="btn-secondary" onClick={previousSet} disabled={!liveExerciseLog.sets.length}>Back</button>
              }
              <button
                className="btn-secondary border-ember/40 text-orange-100"
                disabled={isPastLastPlannedSet || isEditingLoggedSet}
                onClick={() => setShowSkipReason((v) => !v)}
              >
                Skip Set
              </button>
              <button
                className="btn-primary"
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
                  logSet(setDraft.setRating, primaryAction === "finish-workout" ? "finish-workout" : primaryAction === "finish-exercise" ? "next-exercise" : "stay");
                }}
              >
                <Check className="h-5 w-5" /> {isPastLastPlannedSet && !isEditingLoggedSet ? (hasMoreExercises ? "Next Exercise" : "Finish Workout") : primaryActionLabel}
              </button>
              <button className="btn-secondary" onClick={addSet}>Add Set</button>
              <button className="btn-secondary" onClick={hasMoreExercises ? finishExercise : finishWorkout}>{hasMoreExercises ? "Finish Exercise" : "Finish Workout"}</button>
            </div>
          </section>

          {lastSetWasSkipped && (
            <section className="panel border-white/10 p-4">
              <p className="label">Last set</p>
              <p className="mt-1 text-sm text-iron-400">Set skipped — no recommendation.</p>
            </section>
          )}
          {recommendation && !selectedActualSet && (() => {
            const isApplied = suggestionApplied || !!persistedAppliedRec;
            if (isApplied) {
              return (
                <div className="flex items-center gap-2 rounded-lg bg-volt/10 px-3 py-2 text-sm font-bold text-volt">
                  <Check className="h-4 w-4 shrink-0" />
                  Applied to this set
                </div>
              );
            }
            const sourceSetNum = sourceSet?.setNumber;
            return (
              <section className="panel border-volt/30 p-4">
                <p className="label">Suggestion from Set {sourceSetNum}</p>
                <h3 className="mt-1 text-xl font-black">
                  {recommendation.action?.suggestedWeight
                    ? `Use ${recommendation.action.suggestedWeight} ${user.unit} for this set`
                    : recommendation.title}
                </h3>
                <p className="mt-2 text-sm text-iron-200">{recommendation.explanation}</p>
                {recommendation.action?.suggestedWeight && (
                  <button className="btn-secondary mt-3" onClick={applySuggestion}>
                    Apply to Current Set
                  </button>
                )}
              </section>
            );
          })()}

          {weightRec?.recommendedWeight && weightRec.recommendedWeight > 0 && (
            <section className="panel border-white/10 p-4">
              <div className="flex items-center justify-between">
                <p className="label">Weight analysis</p>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-iron-300">
                  {weightRec.confidence}% {weightRec.confidenceBand}
                </span>
              </div>
              {weightRec.reasonParts.map((line, i) => (
                <p key={i} className={`mt-1 ${i === 0 ? "text-sm text-iron-200" : "text-xs text-iron-500"}`}>{line}</p>
              ))}
            </section>
          )}

          <LoggedSetsTable logged={activeExerciseLog} exercise={exercise} user={user} />
          <div className="grid gap-2 sm:grid-cols-3">
            <button className="btn-secondary" onClick={() => setShowAddExercisePicker(true)}>+ Add Exercise</button>
            <button className="btn-secondary border-ember/40 text-orange-100" onClick={abandonWorkout}>Abandon Workout</button>
            <button className="btn-primary" onClick={finishWorkout} disabled={!allExercisesComplete}>Finish Workout</button>
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
      // Archive any in-progress workout sessions so Today starts clean
      draft.sessions.forEach((session) => {
        if (session.userId === user.id && session.status === "in-progress") {
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
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const [section, setSection] = useState<"exercises" | "splits">("exercises");
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const [patternFilter, setPatternFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [gymSpecificFilter, setGymSpecificFilter] = useState<string>("all");
  const [progressExerciseId, setProgressExerciseId] = useState<string | undefined>();
  const [editingExerciseId, setEditingExerciseId] = useState<string | undefined>();
  const [showAdvancedExercise, setShowAdvancedExercise] = useState(false);
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
    fatigueRating: 2,
    isCompound: false,
    canBeGymSpecific: false,
    isGymSpecificEnabled: false,
    tags: ""
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
      fatigueRating: exercise.fatigueRating || 2,
      isCompound: exercise.isCompound || false,
      canBeGymSpecific: exercise.canBeGymSpecific || false,
      isGymSpecificEnabled: exercise.isGymSpecificEnabled || false,
      tags: exercise.tagLabels?.join(", ") || "",
    });
    setShowAdvancedExercise(false);
  }
  const exercises = db.exercises.filter((exercise) => {
    const searchText = `${exercise.name} ${exercise.primaryMuscles.join(" ")} ${exercise.secondaryMuscles.join(" ")} ${exercise.equipment.join(" ")} ${exercise.movementPattern}`.toLowerCase();
    const matchesQuery = searchText.includes(query.toLowerCase());
    const matchesMuscle = muscle === "all" || exercise.primaryMuscles.includes(muscle as MuscleGroup) || exercise.muscleGroup === muscle;
    const matchesEquipment = equipmentFilter === "all" || exercise.equipment.includes(equipmentFilter as EquipmentCategory);
    const matchesPattern = patternFilter === "all" || exercise.movementPattern === patternFilter || exercise.movementPatterns?.includes(patternFilter as MovementPattern);
    const matchesKind = kindFilter === "all" || (kindFilter === "compound" ? isCompound(exercise) : exercise.kind.includes("isolation") || !isCompound(exercise));
    const matchesSource = sourceFilter === "all" || (sourceFilter === "custom" ? exercise.ownerUserId === user.id || exercise.createdByUser : !exercise.ownerUserId && !exercise.createdByUser);
    const matchesGymSpecific = gymSpecificFilter === "all" || (gymSpecificFilter === "enabled" ? exercise.isGymSpecificEnabled : !exercise.isGymSpecificEnabled);
    return matchesQuery && matchesMuscle && matchesEquipment && matchesPattern && matchesKind && matchesSource && matchesGymSpecific && (!exercise.ownerUserId || exercise.ownerUserId === user.id);
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
      target.fatigueRating = draft.fatigueRating as Exercise["fatigueRating"];
      target.isCompound = draft.isCompound || ["sbd", "main_compound", "secondary_compound", "machine_compound"].includes(draft.exerciseCategory);
      target.kind = target.isCompound ? ["compound"] : draft.exerciseCategory === "conditioning" ? ["conditioning"] : ["accessory"];
      target.canBeGymSpecific = draft.canBeGymSpecific;
      target.isGymSpecificEnabled = draft.isGymSpecificEnabled;
      target.directVolumeMuscles = draft.primaryMuscles;
      target.indirectVolumeMuscles = draft.secondaryMuscles;
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
      canBeGymSpecific: draft.canBeGymSpecific,
      isGymSpecificEnabled: draft.isGymSpecificEnabled,
      createdByUser: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    void updateDb((data) => {
      data.exercises.unshift(exercise);
      return data;
    });
    setDraft(emptyDraft);
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
      <PageTitle eyebrow="Library" title="Exercises and split templates that feed the Program builder." />
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
      {section === "splits" && <SplitLibraryManager db={db} user={user} updateDb={updateDb} />}
      {section === "exercises" && (
        <>
          <section className="grid gap-4 xl:grid-cols-[1fr_24rem]">
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label">Exercise Library</p>
                  <h2 className="text-xl font-black">Search, filter, and inspect movements</h2>
                </div>
                <p className="text-sm text-iron-400">{exercises.length} shown</p>
              </div>
              <input className="field" placeholder="Search name, muscle, or equipment..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
                <select className="field" value={muscle} onChange={(event) => setMuscle(event.target.value)}>
                  <option value="all">All muscles</option>
                  {muscleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)}>
                  <option value="all">All equipment</option>
                  {equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={patternFilter} onChange={(event) => setPatternFilter(event.target.value)}>
                  <option value="all">All patterns</option>
                  {movementOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="field" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                  <option value="all">Any type</option>
                  <option value="compound">Compound</option>
                  <option value="isolation">Isolation/accessory</option>
                </select>
                <select className="field" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="all">Any source</option>
                  <option value="default">Default</option>
                  <option value="custom">User-created</option>
                </select>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select className="field" value={gymSpecificFilter} onChange={(event) => setGymSpecificFilter(event.target.value)}>
                  <option value="all">Gym-specific: any</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="scrollbar-none mt-4 max-h-[32rem] overflow-y-auto rounded-lg border border-white/10 bg-iron-950/45 p-2">
                <div className="space-y-2">
                  {exercises.map((exercise) => (
                    <div key={exercise.id} className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{exercise.name}</p>
                          <p className="mt-1 text-xs text-iron-400">{exercise.primaryMuscles.join(", ")} - {exercise.equipment.join(", ")}</p>
                          <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-iron-500">{isCompound(exercise) ? "compound" : "isolation/accessory"} - {exercise.ownerUserId ? "custom" : "default"}{exercise.isGymSpecificEnabled ? " - gym-specific" : ""}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button className="btn-ghost" onClick={() => startEditExercise(exercise)} title={`Edit ${exercise.name}`}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button className="btn-ghost" onClick={() => setProgressExerciseId(exercise.id)} title={`Open ${exercise.name} progress`}>
                            <BarChart3 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!exercises.length && <EmptyState title="No exercises match" detail="Clear a filter or add a new exercise." />}
                </div>
              </div>
            </div>
            <Panel title={editingExerciseId ? "Edit Exercise" : "Custom Exercise"} icon={editingExerciseId ? Pencil : Plus}>
              <div className="space-y-3">
                <TextField label="Name" value={draft.name} onChange={(name) => setDraft((value) => ({ ...value, name }))} />
                <TextField label="Notes" value={draft.notes} onChange={(notes) => setDraft((value) => ({ ...value, notes }))} />
                <SelectField label="Equipment" value={draft.equipment} options={equipmentOptions} onChange={(value) => setDraft((item) => ({ ...item, equipment: value as EquipmentCategory }))} />
                <SelectField label="Exercise category" value={draft.exerciseCategory} options={exerciseCategoryOptions} onChange={(value) => setDraft((item) => ({ ...item, exerciseCategory: value as ExerciseCategoryLabel, isCompound: ["sbd", "main_compound", "secondary_compound", "machine_compound"].includes(value) || item.isCompound }))} />
                <SelectField label="Default unit" value={draft.defaultUnit} options={exerciseUnitOptions} onChange={(defaultUnit) => setDraft((item) => ({ ...item, defaultUnit: defaultUnit as ExerciseUnit, allowedUnits: Array.from(new Set([...item.allowedUnits, defaultUnit as ExerciseUnit])) }))} />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Default increment" value={draft.defaultIncrement} onChange={(defaultIncrement) => setDraft((item) => ({ ...item, defaultIncrement }))} />
                  <NumberField label="Custom increment" value={draft.customIncrement} onChange={(customIncrement) => setDraft((item) => ({ ...item, customIncrement }))} />
                </div>
                <NumberField label="Fatigue rating" value={draft.fatigueRating} onChange={(fatigueRating) => setDraft((item) => ({ ...item, fatigueRating: Math.min(5, Math.max(1, fatigueRating)) }))} />
                <div>
                  <p className="label mb-2">Primary muscles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {muscleOptions.map((item) => <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.primaryMuscles.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftMuscle("primaryMuscles", item)}>{item}</button>)}
                  </div>
                </div>
                <div>
                  <p className="label mb-2">Secondary muscles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {muscleOptions.map((item) => <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.secondaryMuscles.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftMuscle("secondaryMuscles", item)}>{item}</button>)}
                  </div>
                </div>
                <div>
                  <button
                    className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-iron-300 transition hover:bg-white/[0.07]"
                    onClick={() => setShowAdvancedExercise((v) => !v)}
                  >
                    Advanced Options {draft.movementPatterns.length > 0 ? `(${draft.movementPatterns.length} patterns)` : ""}
                    <ChevronRight className={`h-3 w-3 transition ${showAdvancedExercise ? "rotate-90" : ""}`} />
                  </button>
                  {showAdvancedExercise && (
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="label mb-2">Movement patterns</p>
                      <p className="mb-2 text-xs text-iron-500">Optional. Used internally for program generation suggestions.</p>
                      <div className="grid grid-cols-2 gap-2">
                        {movementOptions.map((item) => <button key={item} className={`rounded-lg border p-2 text-xs font-bold ${draft.movementPatterns.includes(item) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleDraftPattern(item)}>{item}</button>)}
                      </div>
                    </div>
                  )}
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
                <TextField label="Tags" value={draft.tags} onChange={(tags) => setDraft((value) => ({ ...value, tags }))} />
                {editingExerciseId ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button className="btn-primary" onClick={saveEditExercise}>
                      <Save className="h-4 w-4" /> Save Changes
                    </button>
                    <button className="btn-secondary" onClick={() => { setEditingExerciseId(undefined); setDraft(emptyDraft); }}>
                      Cancel Edit
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary w-full" onClick={addCustomExercise}>Add Exercise</button>
                )}
              </div>
            </Panel>
          </section>
          {progressExercise && <ExerciseProgressPanel db={db} user={user} exercise={progressExercise} onClose={() => setProgressExerciseId(undefined)} />}
        </>
      )}
    </div>
  );
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

  const completedSessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed");
  const loggedSetCount = completedSessions
    .flatMap((s) => s.loggedExercises.filter((l) => l.exerciseId === exercise.id))
    .flatMap((l) => l.sets.filter(isCompletedValidSet))
    .length;
  const structuredLogs = (db.exercisePerformanceLogs || []).filter((log) => log.userId === user.id && log.exerciseId === exercise.id);

  const overallPoints = completedSessions
    .map((session) => {
      const log = session.loggedExercises.find((item) => item.exerciseId === exercise.id);
      if (!log) return undefined;
      const value = calculateSessionExerciseE1RM(log);
      if (!value) return undefined;
      return {
        label: new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value,
        date: session.startedAt
      };
    })
    .filter((p): p is { label: string; value: number; date: string } => Boolean(p))
    .sort((a, b) => a.date.localeCompare(b.date));

  const activeBlock = db.programs.find((p) => p.userId === user.id && p.status === "active")?.blocks[0];
  const currentBlockPoints = activeBlock
    ? completedSessions
        .filter((s) => s.blockId === activeBlock.id)
        .map((session) => {
          const log = session.loggedExercises.find((item) => item.exerciseId === exercise.id);
          if (!log) return undefined;
          const value = calculateSessionExerciseE1RM(log);
          if (!value) return undefined;
          const workoutDay = activeBlock.weeks.flatMap((w) => w.workouts).find((d) => d.id === session.workoutDayId);
          const weekNum = session.weekNumber ?? workoutDay?.weekNumber;
          const dayNum = workoutDay?.dayIndex;
          const label = weekNum && dayNum ? `W${weekNum}D${dayNum}` : weekNum ? `W${weekNum}` : new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return { label, value, date: session.startedAt };
        })
        .filter((p): p is { label: string; value: number; date: string } => Boolean(p))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const activePoints = graphMode === "current-block" ? currentBlockPoints : overallPoints;
  const hasHistory = overallPoints.length > 0 || loggedSetCount > 0 || structuredLogs.length > 0;
  const bestE1rm = Math.max(0, ...overallPoints.map((p) => p.value), ...structuredLogs.map((log) => log.e1rm || 0));
  const isStrengthLift = exercise.category === "barbell" || exercise.kind?.includes("competition-lift") || exercise.kind?.includes("variation");
  const chartTitle = isStrengthLift ? "e1RM trend" : "Estimated progress";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-iron-950 p-4 shadow-glow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">Exercise Progress</p>
            <h2 className="text-2xl font-black">{exercise.name}</h2>
            <p className="mt-1 text-sm text-iron-300">{exercise.category} · {exercise.movementPattern}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {hasHistory ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Logged sets" value={loggedSetCount + structuredLogs.length} />
              <Metric label="Best e1RM" value={bestE1rm || "-"} unit={bestE1rm ? user.unit : undefined} />
            </div>
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
            </div>
            {graphMode === "current-block" && !activeBlock && (
              <p className="mt-2 text-xs text-iron-400">No active block — activate a program to use Current Block mode.</p>
            )}
            {graphMode === "current-block" && activeBlock && currentBlockPoints.length === 0 && (
              <p className="mt-2 text-xs text-iron-400">No sessions logged for this exercise in the current block yet.</p>
            )}
            {activePoints.length > 0 ? <ExerciseE1rmChart points={activePoints} unit={user.unit} title={chartTitle} /> : null}
          </>
        ) : (
          <div className="mt-4">
            <EmptyState title="No logged data yet" detail="Once you complete workouts with this exercise, your progress chart will appear here." />
          </div>
        )}
      </section>
    </div>
  );
}

function ExerciseE1rmChart({ points, unit, title = "e1RM trend" }: { points: { label: string; value: number }[]; unit: string; title?: string }) {
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
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="12" fill="#f8fafc">{point.value}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SplitLibraryManager({
  db,
  user,
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const splits = db.splitTemplates
    .filter((split) => !split.ownerUserId || split.ownerUserId === user.id)
    .sort((a, b) => Number(b.favoriteUserIds?.includes(user.id) || false) - Number(a.favoriteUserIds?.includes(user.id) || false) || a.name.localeCompare(b.name));
  const [editingId, setEditingId] = useState<string>(splits[0]?.id || "");
  const [showSplitAdvanced, setShowSplitAdvanced] = useState(false);
  const activeSplit = splits.find((split) => split.id === editingId) || splits[0];

  function createSplit() {
    const split: SplitTemplate = {
      id: createId("split"),
      ownerUserId: user.id,
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
        target.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function duplicateSplit(split: SplitTemplate) {
    const copy = structuredClone(split);
    copy.id = createId("split");
    copy.ownerUserId = user.id;
    copy.name = `${split.name} Copy`;
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
    if (db.splitTemplates.length <= 1) return;
    if (!confirm(`Delete split "${split.name}"? Existing programs keep their already-built workouts.`)) return;
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

  return (
    <section className="grid gap-4 xl:grid-cols-[20rem_1fr]">
      <Panel title="Split Templates" icon={CalendarDays}>
        <p className="mb-4 text-sm text-iron-300">Create reusable training structures based on muscles and movement patterns. Splits do not contain exact exercises.</p>
        <button className="btn-primary mb-3 w-full" onClick={createSplit}><Plus className="h-4 w-4" /> Create Split</button>
        <div className="space-y-2">
          {splits.map((split) => (
            <div key={split.id} className={`rounded-lg border p-2 ${activeSplit?.id === split.id ? "border-volt bg-volt/10" : "border-white/10 bg-white/[0.05]"}`}>
              <div className="flex items-start justify-between gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditingId(split.id)}>
                  <p className="truncate font-black">{split.name}</p>
                  <p className="text-xs text-iron-400">{split.days.length || split.daysPerWeek} days - {split.goal}{split.ownerUserId ? " - custom" : " - default"}</p>
                </button>
                <button className={`btn-ghost min-h-9 px-2 ${split.favoriteUserIds?.includes(user.id) ? "text-volt" : "text-iron-400"}`} onClick={() => toggleFavorite(split)} title={split.favoriteUserIds?.includes(user.id) ? "Unfavorite split" : "Favorite split"}>
                  <Star className={`h-4 w-4 ${split.favoriteUserIds?.includes(user.id) ? "fill-current" : ""}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Split Builder" icon={SlidersHorizontal}>
        {activeSplit ? (
          <div className="space-y-4">
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
              <button className="btn-secondary border-ember/40 text-orange-100" onClick={() => deleteSplit(activeSplit)}><Trash2 className="h-4 w-4" /> Delete</button>
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
function GymScreen({
  db,
  user,
  updateDb,
  embedded = false
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  embedded?: boolean;
}) {
  const gyms = db.gyms.filter((gym) => gym.userId === user.id);
  const [name, setName] = useState("");
  const [machineName, setMachineName] = useState("");

  function addGym() {
    if (!name.trim()) return;
    void updateDb((draft) => {
      const id = createId("gym");
      draft.gyms.push({ id, userId: user.id, name: name.trim(), equipment: [], unavailableEquipment: [], machines: [], substitutions: [], exerciseAdjustments: [] });
      const target = draft.users.find((item) => item.id === user.id);
      if (target && !target.activeGymId) target.activeGymId = id;
      return draft;
    });
    setName("");
  }

  function addMachine(gymId: string) {
    if (!machineName.trim()) return;
    void updateDb((draft) => {
      const gym = draft.gyms.find((item) => item.id === gymId);
      gym?.machines.push({ id: createId("machine"), name: machineName.trim(), category: "cable", exerciseIds: [], stackMax: 200, stackIncrement: 10, feels: "normal" });
      return draft;
    });
    setMachineName("");
  }

  return (
    <div className="space-y-5">
      {!embedded && <PageTitle eyebrow="Gyms" title="Track equipment and machine-specific history." />}
      <section className="panel p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="field" placeholder="New gym name" value={name} onChange={(event) => setName(event.target.value)} />
          <button className="btn-primary" onClick={addGym}><Plus className="h-4 w-4" /> Add Gym</button>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {gyms.map((gym) => (
          <Panel key={gym.id} title={gym.name} icon={Warehouse}>
            <div className="space-y-3">
              <button
                className={`btn-secondary w-full ${user.activeGymId === gym.id ? "border-volt/50 text-volt" : ""}`}
                onClick={() => updateDb((draft) => {
                  const target = draft.users.find((item) => item.id === user.id);
                  if (target) target.activeGymId = gym.id;
                  return draft;
                })}
              >
                {user.activeGymId === gym.id ? "Active Gym" : "Set Active"}
              </button>
              <p className="text-sm text-iron-300">{gym.notes || "No notes yet."}</p>
              <div>
                <p className="label mb-2">Machines and cables</p>
                <div className="space-y-2">
                  {gym.machines.map((machine) => (
                    <div key={machine.id} className="rounded-lg bg-white/[0.06] p-3">
                      <p className="font-bold">{machine.name}</p>
                      <p className="text-xs text-iron-400">{machine.category} - {machine.feels} - stack {machine.stackMax || "-"} / inc {machine.stackIncrement || "-"}</p>
                      {machine.notes && <p className="mt-1 text-xs text-iron-300">{machine.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input className="field" placeholder="Cable or machine name" value={machineName} onChange={(event) => setMachineName(event.target.value)} />
                <button className="btn-secondary" onClick={() => addMachine(gym.id)}>Add</button>
              </div>
              <div className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
                <p className="label mb-2">Exercise weight conversions</p>
                <p className="mb-3 text-xs text-iron-400">Machine and cable exercises stay global, but this gym can keep its own working-weight factor.</p>
                <div className="space-y-2">
                  {(gym.exerciseAdjustments || []).map((adjustment) => {
                    const exercise = db.exercises.find((item) => item.id === adjustment.exerciseId);
                    const machine = gym.machines.find((item) => item.id === adjustment.machineId);
                    return (
                      <div key={adjustment.id} className="rounded-lg bg-white/[0.06] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-bold">{exercise?.name || "Exercise"}</p>
                            <p className="text-xs text-iron-400">{machine?.name || "gym default"} - {adjustment.source} - {adjustment.sampleSize} samples - confidence {Math.round((adjustment.confidence || 0) * 100)}%</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              className="field w-24"
                              type="number"
                              step="0.01"
                              value={adjustment.factor}
                              onChange={(event) => updateDb((draft) => {
                                const target = draft.gyms.find((item) => item.id === gym.id)?.exerciseAdjustments.find((item) => item.id === adjustment.id);
                                if (target) {
                                  target.factor = Number(event.target.value) || 1;
                                  target.source = "manual";
                                  target.updatedAt = nowIso();
                                }
                                return draft;
                              })}
                            />
                            <button className="btn-ghost" onClick={() => updateDb((draft) => {
                              const target = draft.gyms.find((item) => item.id === gym.id)?.exerciseAdjustments.find((item) => item.id === adjustment.id);
                              if (target) {
                                target.userAccepted = true;
                                target.confidence = Math.max(target.confidence || 0, 0.8);
                                target.updatedAt = nowIso();
                              }
                              return draft;
                            })}>Accept</button>
                            <button className="btn-ghost" onClick={() => updateDb((draft) => {
                              const target = draft.gyms.find((item) => item.id === gym.id)?.exerciseAdjustments.find((item) => item.id === adjustment.id);
                              if (target) {
                                target.factor = 1;
                                target.source = "manual";
                                target.userAccepted = true;
                                target.confidence = 1;
                                target.notes = "Marked equivalent by user.";
                                target.updatedAt = nowIso();
                              }
                              return draft;
                            })}>Equivalent</button>
                            <button className="btn-ghost" onClick={() => updateDb((draft) => {
                              const targetGym = draft.gyms.find((item) => item.id === gym.id);
                              if (targetGym) targetGym.exerciseAdjustments = targetGym.exerciseAdjustments.filter((item) => item.id !== adjustment.id);
                              return draft;
                            })}>Reset</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <ExercisePicker db={db} user={user} onPick={(exercise) => updateDb((draft) => {
                    const targetGym = draft.gyms.find((item) => item.id === gym.id);
                    if (!targetGym) return draft;
                    targetGym.exerciseAdjustments ||= [];
                    if (!targetGym.exerciseAdjustments.some((item) => item.exerciseId === exercise.id)) {
                      targetGym.exerciseAdjustments.push({
                        id: createId("adj"),
                        userId: user.id,
                        gymId: gym.id,
                        exerciseId: exercise.id,
                        factor: 1,
                        source: "manual",
                        sampleSize: 0,
                        notes: "Manual conversion factor.",
                        updatedAt: nowIso()
                      });
                    }
                    return draft;
                  })} />
                </div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
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
  db, user, program, block, weekNumber, updateDb, onClose
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program: Program;
  block: TrainingBlock;
  weekNumber: number;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onClose: () => void;
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
    return <CompletedWorkoutReview db={db} user={user} session={reviewSession} updateDb={updateDb} onBack={() => setReviewSessionId(undefined)} />;
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
              <button className="btn-primary mt-3 w-full" onClick={() => setReviewSessionId(selectedCompletedSession.id)}>
                Edit Completed Session
              </button>
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
  db, user, setScreen, planWeekRequest, onPlanWeekRequestHandled, editingWeekNumber, onEditingWeekNumberChange, updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  setScreen: (screen: Screen) => void;
  planWeekRequest?: number;
  onPlanWeekRequestHandled?: () => void;
  editingWeekNumber?: number;
  onEditingWeekNumberChange?: (n: number | undefined) => void;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const block = activeProgram?.blocks[0];
  // Derive the current week from the block cursor (sequence-based, not calendar-based).
  const cursor = block ? getCurrentWorkoutForUser(db, user.id) : undefined;
  const currentWeekNumber = (cursor?.week.weekNumber ?? block?.currentWeek) || 1;
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(currentWeekNumber);
  const [inlineDayEditId, setInlineDayEditId] = useState<string | undefined>();
  const [reviewSessionId, setReviewSessionId] = useState<string | undefined>();
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
  const reviewSession = db.sessions.find((session) => session.id === reviewSessionId && session.userId === user.id);
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
      />
    );
  }

  if (reviewSession) {
    return (
      <CompletedWorkoutReview
        db={db}
        user={user}
        session={reviewSession}
        updateDb={updateDb}
        onBack={() => setReviewSessionId(undefined)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Week Progress" title="Current block week, planned days, and completed training." />
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
                            className={`btn-ghost text-xs ${isInlineEditing ? "text-volt" : ""}`}
                            onClick={() => setInlineDayEditId(isInlineEditing ? undefined : day.id)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {isInlineEditing ? "Done" : "Edit"}
                          </button>
                        )}
                        {session?.status === "completed" && (
                          <button
                            className="btn-ghost text-xs text-volt"
                            onClick={() => setReviewSessionId(session.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Review
                          </button>
                        )}
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${session?.status === "completed" ? "bg-volt text-iron-950" : session?.status === "in-progress" ? "bg-steel/20 text-steel" : daySkipped ? "bg-ember/20 text-orange-100" : isWorkoutDayPlanned(day) ? "bg-white/10 text-iron-300" : "bg-white/[0.05] text-iron-500"}`}>
                          {session?.status || (daySkipped ? "skipped" : isWorkoutDayPlanned(day) ? "planned" : "unplanned")}
                        </span>
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
                    {session?.status === "completed" && (
                      <button className="btn-secondary mt-3 w-full" onClick={() => setReviewSessionId(session.id)}>
                        Edit Completed Session
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
                  <button key={session.id} className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.05] p-3 text-left" onClick={() => setReviewSessionId(session.id)}>
                    <span>
                      <span className="block font-black">{session.name}</span>
                      <span className="text-xs text-iron-400">{new Date(session.completedAt || session.startedAt).toLocaleDateString()} · {countSessionCompletedSets(session)} sets</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-iron-400" />
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
  updateDb,
  onBack
}: {
  db: TrainingDatabase;
  user: UserProfile;
  session: WorkoutSession;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localSession, setLocalSession] = useState<WorkoutSession>(() => structuredClone(session));
  const score = calculateWorkoutScore(localSession);
  const totalSets = countSessionCompletedSets(localSession);
  const skippedSets = localSession.loggedExercises.flatMap((exercise) => exercise.sets).filter((set) => set.skipped).length;

  useEffect(() => {
    setLocalSession(structuredClone(session));
  }, [session]);

  function updateLocalSet(logIndex: number, setIndex: number, mutator: (set: LoggedSet) => void) {
    setLocalSession((current) => {
      const next = structuredClone(current);
      const set = next.loggedExercises[logIndex]?.sets[setIndex];
      if (set) {
        mutator(set);
        const planned = findPlannedExercise(db, next, next.loggedExercises[logIndex])?.plannedSets[setIndex];
        const perf = calculateSetPerformanceScore(planned, set);
        set.performanceScore = perf.score;
        set.performanceStatus = perf.status;
      }
      return next;
    });
  }

  function saveReview() {
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === session.id);
      if (!target) return draft;
      const nextScore = calculateWorkoutScore(localSession);
      Object.assign(target, {
        ...localSession,
        workoutScore: nextScore.score,
        workoutScoreStatus: nextScore.status,
        progressionSuggestions: recommendNextWorkoutAdjustments(localSession, draft.programs.find((program) => program.id === localSession.programId)?.blocks.find((block) => block.id === localSession.blockId)),
        updatedAt: nowIso()
      });
      draft.exercisePerformanceLogs = (draft.exercisePerformanceLogs || []).filter((log) => log.sessionId !== target.id);
      target.loggedExercises.forEach((logged) => {
        const validSets = logged.sets.filter(isCompletedValidSet);
        if (!validSets.length) return;
        const exercise = draft.exercises.find((item) => item.id === logged.exerciseId);
        draft.exercisePerformanceLogs?.push({
          id: createId("elog"),
          exerciseId: logged.exerciseId,
          userId: user.id,
          sessionId: target.id,
          date: target.completedAt || target.startedAt,
          gymId: target.gymId,
          workoutDayId: target.workoutDayId,
          blockId: target.blockId,
          blockWeek: target.weekNumber,
          sets: validSets.length,
          reps: validSets.reduce((sum, set) => sum + set.actualReps, 0),
          weight: Math.max(...validSets.map((set) => set.actualWeight)),
          e1rm: calculateSessionExerciseE1RM(logged) || undefined,
          averageSetRating: Number((validSets.reduce((sum, set) => sum + setRatingNumeric(set.setRating), 0) / validSets.length).toFixed(1)),
          unit: exercise?.defaultUnit || user.unit,
          rpe: safeAverageRpe(validSets) || undefined,
          notes: logged.notes
        });
      });
      return draft;
    });
    setEditing(false);
  }

  function removeSet(logIndex: number, setIndex: number) {
    if (!confirm("Remove this logged set from the completed session?")) return;
    setLocalSession((current) => {
      const next = structuredClone(current);
      next.loggedExercises[logIndex]?.sets.splice(setIndex, 1);
      next.loggedExercises[logIndex]?.sets.forEach((set, index) => { set.setNumber = index + 1; });
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle eyebrow={session.offProgram ? "Off-Program Review" : "Completed Session Review"} title={localSession.name} />
        <button className="btn-secondary" onClick={onBack}>Back to Week</button>
      </div>
      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="Status" value={session.offProgram ? "Off-program" : "Completed"} />
        <Metric label="Sets" value={totalSets} />
        <Metric label="Skipped" value={skippedSets} />
        <Metric label="Score" value={score.score || "-"} unit={score.score ? "/100" : undefined} />
      </section>
      <Panel title={editing ? "Edit Completed Session" : "Completed Workout"} icon={ClipboardList}>
        <div className="mb-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <button className="btn-primary" onClick={saveReview}><Save className="h-4 w-4" /> Save Review</button>
              <button className="btn-secondary" onClick={() => { setLocalSession(structuredClone(session)); setEditing(false); }}>Cancel</button>
            </>
          ) : (
            <button className="btn-primary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit Completed Workout</button>
          )}
        </div>
        <TextField label="Session notes" value={localSession.notes || ""} onChange={(notes) => setLocalSession((current) => ({ ...current, notes }))} disabled={!editing} />
        <div className="mt-4 space-y-4">
          {localSession.loggedExercises.map((logged, logIndex) => {
            const exercise = db.exercises.find((item) => item.id === logged.exerciseId);
            return (
              <div key={logged.id} className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-black">{exercise?.name || "Unknown exercise"}</p>
                    <p className="text-xs text-iron-400">{logged.offProgram || session.offProgram ? "Off-program" : "Planned"} · {logged.sets.filter(isCompletedValidSet).length} completed sets</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {logged.sets.map((set, setIndex) => (
                    <div key={set.id} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 md:grid-cols-[4rem_repeat(4,minmax(0,1fr))_2fr_auto]">
                      <p className="font-black">Set {setIndex + 1}</p>
                      <BigInput label="Weight" value={String(set.actualWeight || "")} onChange={(value) => updateLocalSet(logIndex, setIndex, (target) => { target.actualWeight = Number(value) || 0; target.skipped = false; })} disabled={!editing} />
                      <BigInput label="Reps" value={String(set.actualReps || "")} onChange={(value) => updateLocalSet(logIndex, setIndex, (target) => { target.actualReps = Number(value) || 0; target.skipped = false; })} disabled={!editing} />
                      <BigInput label="RPE" value={String(set.actualRpe || "")} onChange={(value) => updateLocalSet(logIndex, setIndex, (target) => { target.actualRpe = Number(value) || undefined; target.skipped = false; })} disabled={!editing} step="0.5" />
                      <SelectField label="Feel" value={String(set.setRating)} options={["1", "2", "3", "4", "5"]} onChange={(value) => updateLocalSet(logIndex, setIndex, (target) => { target.setRating = Number(value) as SetRating; })} disabled={!editing} />
                      <TextField label="Notes" value={set.notes || ""} onChange={(notes) => updateLocalSet(logIndex, setIndex, (target) => { target.notes = notes; })} disabled={!editing} />
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-xs font-bold text-iron-300">
                          <input type="checkbox" checked={!!set.skipped} disabled={!editing} onChange={(event) => updateLocalSet(logIndex, setIndex, (target) => { target.skipped = event.target.checked; if (event.target.checked) { target.actualWeight = 0; target.actualReps = 0; } })} />
                          Skipped
                        </label>
                        {editing && <button className="btn-ghost text-xs text-orange-100" onClick={() => removeSet(logIndex, setIndex)}>Remove</button>}
                      </div>
                    </div>
                  ))}
                </div>
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

function ProgressScreen({ db, user }: { db: TrainingDatabase; user: UserProfile }) {
  const metrics = powerliftingMetrics(db, user);
  const weekly = summarizeWeek(db, user);
  const topSets = recentTopSets(db.sessions, user.id);
  const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const recentSessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed" && new Date(s.startedAt).getTime() >= sevenDaysAgo);
  const weeklyHardSets = recentSessions.flatMap((s) => s.loggedExercises).flatMap((log) => log.sets.filter((set) => !set.skipped && set.kind !== "warmup"));
  const weeklyAvgRpe = safeAverageRpe(weeklyHardSets);
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const programGaps = analyzeProgramGaps(activeProgram, db);

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
              return (
                <div key={set.id} className="rounded-lg bg-white/[0.06] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{exercise?.name}</p>
                    <p className="text-sm text-volt">{estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10)} e1RM</p>
                  </div>
                  <p className="text-xs text-iron-400">{set.actualWeight} x {set.actualReps} @ {set.actualRpe || "?"} - feel {set.setRating}/5</p>
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
        <Panel title="Program Gaps" icon={ShieldAlert}>
          <div className="space-y-2">
            {programGaps.length ? programGaps.map((gap) => <ProgramGapCard key={gap.id} gap={gap} db={db} />) : <EmptyState title="No major program gaps" detail="The active program covers the main balance checks." />}
          </div>
        </Panel>
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
                return <p key={set.id} className="text-sm text-iron-200">{exercise?.name}: {set.actualWeight} x {set.actualReps} @ {set.actualRpe || "?"}</p>;
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
      gap.severity === "high" ? "border-ember/40 bg-ember/10" : gap.severity === "moderate" ? "border-volt/25 bg-volt/10" : "border-white/10 bg-white/[0.06]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{gap.issue}</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-iron-400">{gap.severity} - {gap.type}</p>
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
  cloud
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  importDb: (db: TrainingDatabase) => Promise<void>;
  reseed: () => Promise<void>;
  cloud: {
    configured: boolean;
    session: { user: { email?: string } } | null;
    status: "disabled" | "not-signed-in" | "syncing" | "synced" | "failed";
    message: string;
    lastSyncedAt?: string;
    lastError?: string;
    userEmail?: string;
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
  const [authLoading, setAuthLoading] = useState<"signup" | "signin" | "sync" | "signout" | undefined>();

  function exportJson() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `iron-orbit-backup-${todayIso()}.json`;
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
            <div className="rounded-lg border border-white/10 bg-iron-950/50 p-3 text-sm">
              <p className="font-bold text-white">{renderCloudStatusLabel(cloud.status)}</p>
              <p className="mt-1 text-iron-300">{cloud.message}</p>
              <p className="mt-2 text-xs text-iron-500">Latest snapshot wins for now. Complex merge/conflict resolution is deferred to a later phase.</p>
              <div className="mt-3 space-y-1 text-xs text-iron-400">
                <p>Supabase account: {cloud.userEmail || "Not signed in"}</p>
                <p>Last synced: {formatDateTime(cloud.lastSyncedAt)}</p>
                <p>Local snapshot updated: {formatDateTime(db.updatedAt)}</p>
              </div>
              {cloud.lastError && <p className="mt-3 rounded-lg border border-ember/30 bg-ember/10 p-2 text-xs text-orange-100">{cloud.lastError}</p>}
            </div>

            {!cloud.userEmail ? (
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
                <p className="text-xs text-iron-500">If email confirmation is enabled in Supabase, confirm your email before trying to sign in.</p>
              </form>
            ) : (
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
            )}
          </div>
        </Panel>
        <Panel title="Backup" icon={FileDown}>
          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-iron-950/50 p-3">
              <p className="text-xs font-bold text-iron-300">The app stays local-first even when cloud sync is enabled.</p>
              <p className="mt-1 text-xs text-iron-500">Local IndexedDB remains the working copy. Export/import is still the manual fallback if Supabase is unavailable or you prefer offline-only use.</p>
            </div>
            <button className="btn-primary w-full" onClick={exportJson}><FileDown className="h-4 w-4" /> Export Backup</button>
            <label className="btn-secondary w-full cursor-pointer">
              <FileUp className="h-4 w-4" />
              Import Backup
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
      <GymScreen db={db} user={user} updateDb={updateDb} embedded />
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
      <div className="mb-4">
        <p className="label">Workout</p>
        <h3 className="mt-1 text-2xl font-black">{day.name}</h3>
      </div>
      <div className="space-y-3">
        {day.exercises.map((planned) => {
          const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
          const recommendation = getExerciseRecommendation({
            db,
            user,
            exercise,
            plannedSet: planned.plannedSets[0],
            goal: user.goal,
            gymId: user.activeGymId,
          });
          return (
            <div key={planned.id} className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{exercise?.name}</p>
                  <p className="mt-1 text-xs text-iron-400">
                    {planned.plannedSets.length} sets - {planned.plannedSets[0]?.targetReps} reps - RPE {planned.plannedSets[0]?.targetRpe}
                    {planned.exerciseRole && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-iron-300">{planned.exerciseRole.replaceAll("_", " ")}</span>}
                    {planned.fatigueTag === "high" && <span className="ml-2 rounded-full bg-ember/15 px-2 py-0.5 text-orange-100">high fatigue</span>}
                  </p>
                </div>
                <span className="rounded-full bg-volt/15 px-2 py-1 text-xs font-bold text-volt">
                  {recommendation?.recommendedWeight || planned.plannedSets[0]?.plannedWeight || "-"} {user.unit}
                </span>
              </div>
              {recommendation?.recommendedWeight
                ? recommendation.reasonParts.map((part, index) => (
                    <p key={index} className={index === 0 ? "mt-2 text-xs text-iron-300" : "mt-1 text-xs text-iron-500"}>{part}</p>
                  ))
                : <p className="mt-2 text-xs text-iron-500">No recent history. Enter starting weight.</p>}
              {planned.notes && <p className="mt-2 text-xs text-iron-300">{planned.notes}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LoggedSetsTable({ logged, exercise, user }: { logged: LoggedExercise; exercise: Exercise; user: UserProfile }) {
  return (
    <section className="panel-soft overflow-hidden">
      <div className="border-b border-white/10 p-3">
        <p className="font-black">{exercise.name} sets</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase text-iron-500">
            <tr>
              <th className="p-3">Set</th>
              <th className="p-3">Load</th>
              <th className="p-3">Reps</th>
              <th className="p-3">RPE</th>
              <th className="p-3">Feel</th>
              <th className="p-3">e1RM</th>
            </tr>
          </thead>
          <tbody>
            {logged.sets.map((set, index) => (
              <tr key={set.id} className="border-t border-white/10">
                <td className="p-3">{index + 1}</td>
                <td className="p-3">{set.actualWeight} {user.unit}</td>
                <td className="p-3">{set.actualReps}</td>
                <td className="p-3">{set.actualRpe || "-"}</td>
                <td className="p-3">{set.setRating}/5</td>
                <td className="p-3">{estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10)}</td>
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
      unit: exercise?.defaultUnit || user.unit,
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

function emptySetDraft(planned?: PlannedSet, last?: LoggedSet, draftKey = "") {
  // The baseline for the next set is:
  // 1) an explicit planned/recommended weight for that target set
  // 2) otherwise the last actual weight the user logged
  const defaultWeight = planned?.plannedWeight !== undefined
    ? String(planned.plannedWeight)
    : String(isCompletedValidSet(last) ? last.actualWeight : "");
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

function isCompletedValidSet(set?: LoggedSet): set is LoggedSet {
  return !!set && !set.skipped && set.kind !== "warmup" && (set.actualWeight > 0 || set.actualReps > 0);
}

function countSessionCompletedSets(session: WorkoutSession): number {
  if (session.status !== "completed") return 0;
  return session.loggedExercises.reduce((sum, exercise) => sum + exercise.sets.filter(isCompletedValidSet).length, 0);
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
  const baseline = getSameExerciseBaseline({
    userId: user.id,
    exerciseId: exercise.id,
    sessions: db.sessions,
    targetReps,
    targetRpe,
    gymId,
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
    increment: getExerciseIncrement(exercise, user.unit),
    unit: user.unit,
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

function buildSetRecommendation({
  user,
  exercise,
  sourceSet,
  sourceSetIndex,
  targetSetIndex,
  sourceExerciseIndex,
  targetExerciseIndex,
  nextPlannedSet,
  setsCompletedThisExercise
}: {
  user: UserProfile;
  exercise: Exercise;
  sourceSet: LoggedSet;
  sourceSetIndex: number;
  targetSetIndex: number;
  sourceExerciseIndex: number;
  targetExerciseIndex: number;
  nextPlannedSet?: PlannedSet;
  setsCompletedThisExercise: number;
}): Recommendation | undefined {
  if (targetSetIndex <= sourceSetIndex || sourceSet.skipped) return undefined;
  const recommendation = algNextSetAdjustment({
    user,
    exercise,
    loggedSet: sourceSet,
    nextPlannedSet,
    setsCompletedThisExercise
  }).recommendation;
  if (!recommendation?.action) return recommendation;
  recommendation.action.targetSetNumber = targetSetIndex + 1;
  recommendation.action.targetPlannedSetId = nextPlannedSet?.id;
  recommendation.action.sourceExerciseIndex = sourceExerciseIndex;
  recommendation.action.sourceSetIndex = sourceSetIndex;
  recommendation.action.targetExerciseIndex = targetExerciseIndex;
  recommendation.action.targetSetIndex = targetSetIndex;
  return recommendation;
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
      <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">{title}</h2>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-black">{title}</h3>
        <Icon className="h-5 w-5 text-volt" />
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, unit, context }: { label: string; value: string | number; unit?: string; context?: string }) {
  return (
    <div className="metric-card">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-iron-500">{label}</p>
      <p className="mt-2 text-2xl font-black">{value} {unit && <span className="text-sm text-iron-400">{unit}</span>}</p>
      {context && <p className="mt-2 line-clamp-3 text-xs leading-5 text-iron-400">{context}</p>}
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

function BigInput({ label, value, onChange, step = "1", disabled = false }: { label: string; value: string; onChange: (value: string) => void; step?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2 min-h-14 text-2xl font-black disabled:opacity-60" inputMode="decimal" type="number" step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
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

export default App;
