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
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShieldAlert,
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
  summarizeWeek,
  suggestNextSetAdjustment,
  suggestPlannedWeight
} from "./lib/trainingMath";
import type {
  BlockType,
  CompoundSettings,
  DayFocus,
  EquipmentCategory,
  Exercise,
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
  SetKind,
  SetRating,
  SplitDay,
  SplitLoopMode,
  SplitTemplate,
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
  "back",
  "lats",
  "upper-back",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "biceps",
  "triceps",
  "front-delts",
  "side-delts",
  "rear-delts",
  "abs",
  "conditioning"
];

const equipmentOptions: EquipmentCategory[] = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "cardio", "bands"];
const movementOptions: MovementPattern[] = ["squat", "hinge", "horizontal-press", "vertical-press", "horizontal-pull", "vertical-pull", "single-leg", "isolation", "carry", "brace", "locomotion", "mobility"];
const dayFocusOptions: DayFocus[] = ["strength", "hypertrophy", "technical", "recovery", "conditioning", "hybrid"];
const exerciseUnitOptions: ExerciseUnit[] = ["lb", "kg", "bodyweight", "assisted", "distance", "time", "reps-only"];

function App() {
  const { db, currentUser, loading, error, updateDb, importDb, reseed } = useTrainingDb();
  const [screen, setScreen] = useState<Screen>("today");
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();

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
    <div className="min-h-screen pb-24 text-white lg:pb-0">
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

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[14rem_1fr]">
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
          {screen === "today" && <TodayScreen db={db} user={currentUser} updateDb={updateDb} setScreen={setScreen} setActiveSessionId={setActiveSessionId} />}
          {screen === "logger" && (
            <LiveLogger db={db} user={currentUser} updateDb={updateDb} sessionId={activeSession?.id} setActiveSessionId={setActiveSessionId} setScreen={setScreen} />
          )}
          {screen === "programs" && <BuilderScreen db={db} user={currentUser} updateDb={updateDb} />}
          {screen === "library" && <LibraryScreen db={db} user={currentUser} updateDb={updateDb} />}
          {screen === "week" && <WeekProgressScreen db={db} user={currentUser} setScreen={setScreen} />}
          {screen === "progress" && <ProgressScreen db={db} user={currentUser} />}
          {screen === "settings" && <SettingsScreen db={db} user={currentUser} updateDb={updateDb} importDb={importDb} reseed={reseed} />}
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
  setActiveSessionId
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  setScreen: (screen: Screen) => void;
  setActiveSessionId: (id: string) => void;
}) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const todayPlan = getCurrentWorkoutForUser(db, user.id);
  const selectedDay = todayPlan?.day;
  const activeBlock = activeProgram?.blocks[0];
  const inProgressSession = db.sessions.find((session) => session.userId === user.id && session.status === "in-progress");

  function startWorkout(day?: WorkoutDay) {
    if (!day) return;
    const existing = db.sessions.find((session) => session.userId === user.id && session.status === "in-progress" && session.workoutDayId === day.id);
    if (existing) {
      setActiveSessionId(existing.id);
      setScreen("logger");
      return;
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
      if (action === "skip") skipActiveWorkout(targetBlock, selectedDay?.id);
      if (action === "rest-complete") markRestDayComplete(targetBlock, selectedDay?.id);
      if (action === "next") moveActiveBlockPointer(targetBlock, "next");
      if (action === "previous") moveActiveBlockPointer(targetBlock, "previous");
      syncActiveBlockProgress(targetBlock, draft.sessions.filter((session) => session.userId === user.id && session.blockId === targetBlock.id));
      if (targetProgram) targetProgram.updatedAt = nowIso();
      return draft;
    });
  }

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Today" title="Next actionable workout from your active block." />
      {!activeProgram && (
        <Panel title="No Active Block" icon={CalendarDays}>
          <EmptyState title="No active block yet" detail="Build and activate a block before starting scheduled training." />
          <button className="btn-primary mt-4 w-full" onClick={() => setScreen("programs")}>Open Block Builder</button>
        </Panel>
      )}
      {activeProgram && !selectedDay && (
        <Panel title="Block Complete" icon={CheckCircle2}>
          <EmptyState
            title="No uncompleted block days remain"
            detail="Today is no longer tied to the calendar. It has reached the end of the active block sequence."
          />
          <button className="btn-secondary mt-4 w-full" onClick={() => setScreen("programs")}>Open Block Overview</button>
        </Panel>
      )}
      {activeProgram && selectedDay && (
        <section className="panel p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="label">Active block pointer</p>
              <h2 className="mt-1 text-xl font-black">{selectedDay.name}</h2>
              <p className="text-sm text-iron-300">{todayPlan?.label} - {selectedDay.scheduledDay || "Flexible day"} - {selectedDay.focus} - ~{estimateWorkoutDuration(selectedDay)} min</p>
              {!selectedDay.exercises.length && <p className="mt-2 text-sm text-iron-400">This workout is structurally planned from your split. Add exercises manually in Block or use suggestions there later.</p>}
            </div>
            {selectedDay.status === "rest" ? (
              <button className="btn-primary" onClick={() => updateActiveBlockProgress("rest-complete")}>
                <CheckCircle2 className="h-4 w-4" />
                Mark Rest Complete
              </button>
            ) : (
              <button className="btn-primary" onClick={() => selectedDay.exercises.length ? startWorkout(selectedDay) : setScreen("programs")}>
                <Timer className="h-4 w-4" />
                {selectedDay.exercises.length ? inProgressSession?.workoutDayId === selectedDay.id ? "Resume Workout" : "Start Workout" : "Add Exercises"}
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {inProgressSession && (
              <button className="btn-secondary" onClick={() => { setActiveSessionId(inProgressSession.id); setScreen("logger"); }}>
                Resume In-Progress
              </button>
            )}
            <button className="btn-secondary" onClick={() => updateActiveBlockProgress("previous")}>Go Back</button>
            <button className="btn-secondary" onClick={() => updateActiveBlockProgress("next")}>Move To Next Day</button>
            <button className="btn-secondary border-ember/40 text-orange-100" onClick={() => updateActiveBlockProgress("skip")}>Skip This Workout</button>
          </div>
        </section>
      )}
      {selectedDay && selectedDay.status !== "rest" && <WorkoutDayView db={db} user={user} day={selectedDay} />}
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
  const planned = findPlannedExercise(db, session, activeExerciseLog);
  const currentSetIndex = activeExerciseLog?.sets.length || 0;
  const nextPlannedSet = planned?.plannedSets[currentSetIndex] || planned?.plannedSets.at(-1);
  const lastSet = activeExerciseLog?.sets.at(-1);
  const draftKey = `${activeExerciseLog?.id || "none"}:${currentSetIndex}`;
  const [setDraft, setSetDraft] = useState(() => emptySetDraft(nextPlannedSet, undefined, draftKey));
  const [restRemaining, setRestRemaining] = useState(0);
  const activeGym = db.gyms.find((gym) => gym.id === session?.gymId && gym.userId === user.id);
  const compatibleMachines = activeGym?.machines.filter((machine) => machine.exerciseIds.includes(activeExerciseLog?.exerciseId || "") || !machine.exerciseIds.length) || [];
  const adjustedSuggestion = exercise && nextPlannedSet
    ? suggestPlannedWeight({
        user,
        exercise,
        plannedSet: nextPlannedSet,
        db,
        readiness: session?.readiness,
        gymId: session?.gymId,
        machineId: activeExerciseLog?.machineId
      })
    : undefined;
  const adjustedWeight = adjustedSuggestion?.weight;

  useEffect(() => {
    setSetDraft((current) => {
      if (current.draftKey === draftKey && current.actualWeight) return current;
      return emptySetDraft(
        adjustedWeight && nextPlannedSet ? { ...nextPlannedSet, plannedWeight: adjustedWeight } : nextPlannedSet,
        lastSet,
        draftKey
      );
    });
  }, [adjustedWeight, draftKey, lastSet, nextPlannedSet]);

  useEffect(() => {
    if (session && !activeExerciseId) setActiveExerciseId(session.loggedExercises[session.currentExerciseIndex || 0]?.id);
  }, [activeExerciseId, session]);

  if (!session || !activeExerciseLog || !exercise) {
    return (
      <Panel title="No Active Workout" icon={Timer}>
        <EmptyState title="Start a workout first" detail="Open Today and start one of your templates or generated program days." />
      </Panel>
    );
  }

  const liveSession = session;
  const liveExerciseLog = activeExerciseLog;
  const liveExercise = exercise;
  const recommendation = lastSet ? suggestNextSetAdjustment({ user, exercise: liveExercise, loggedSet: lastSet, nextPlannedSet }) : undefined;
  const plannedSets = planned?.plannedSets || [];
  const isCurrentSetLastPlannedSet = plannedSets.length > 0 && currentSetIndex === plannedSets.length - 1;
  const isPastLastPlannedSet = plannedSets.length > 0 && currentSetIndex >= plannedSets.length;
  const hasMoreExercises = activeExerciseIndex < liveSession.loggedExercises.length - 1;
  const primaryAction = isCurrentSetLastPlannedSet ? (hasMoreExercises ? "finish-exercise" : "finish-workout") : "next-set";
  const primaryActionLabel = primaryAction === "finish-workout" ? "Finish Workout" : primaryAction === "finish-exercise" ? "Finish Exercise" : "Next Set";
  const exerciseComplete = plannedSets.length > 0 && liveExerciseLog.sets.length >= plannedSets.length;
  const allExercisesComplete = liveSession.loggedExercises.every((logged) => {
    const plannedForLog = findPlannedExercise(db, liveSession, logged);
    return Boolean(plannedForLog?.plannedSets.length && logged.sets.length >= plannedForLog.plannedSets.length);
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
    const loggedSet: LoggedSet = {
      id: createId("set"),
      kind: setDraft.kind,
      setNumber: currentSetIndex + 1,
      plannedSetId: nextPlannedSet?.id,
      plannedWeight: nextPlannedSet?.plannedWeight,
      plannedReps: nextPlannedSet?.targetReps,
      actualWeight: Number(setDraft.actualWeight) || 0,
      actualReps: Number(setDraft.actualReps) || 0,
      targetRpe: nextPlannedSet?.targetRpe,
      actualRpe: Number(setDraft.actualRpe) || undefined,
      setRating: rating,
      formRating: Number(setDraft.formRating) || undefined,
      muscleFeelRating: Number(setDraft.muscleFeelRating) || undefined,
      pumpRating: Number(setDraft.pumpRating) || undefined,
      painRating: Number(setDraft.painRating) || undefined,
      sorenessRating: Number(setDraft.sorenessRating) || undefined,
      restSeconds: planned?.restSeconds,
      added: nextPlannedSet?.notes?.toLowerCase().includes("added set") || currentSetIndex >= plannedSets.length,
      notes: setDraft.notes,
      completedAt: nowIso()
    };
    const performance = calculateSetPerformanceScore(nextPlannedSet, loggedSet);
    loggedSet.performanceScore = performance.score;
    loggedSet.performanceStatus = performance.status;
    const rec = suggestNextSetAdjustment({ user, exercise: liveExercise, loggedSet, nextPlannedSet });
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
      if (target && rec) target.recommendations.unshift(rec);
      if (rec) draft.recommendations.unshift(rec);
      if (target && afterAction === "finish-workout") {
        finishWorkoutInDraft(draft, user, target);
      }
      return draft;
    });
    setRestRemaining(planned?.restSeconds || user.settings.defaultRestSeconds);
    setSetDraft(emptySetDraft(plannedSets[currentSetIndex + 1] || nextPlannedSet, loggedSet, `${liveExerciseLog.id}:${currentSetIndex + 1}`));
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
    const skippedSet: LoggedSet = {
      id: createId("set"),
      kind: nextPlannedSet?.kind || "working",
      setNumber: currentSetIndex + 1,
      plannedSetId: nextPlannedSet?.id,
      plannedWeight: nextPlannedSet?.plannedWeight,
      plannedReps: nextPlannedSet?.targetReps,
      actualWeight: 0,
      actualReps: 0,
      targetRpe: nextPlannedSet?.targetRpe,
      setRating: "Failed",
      skipped: true,
      notes: setDraft.notes || "Skipped set.",
      completedAt: nowIso()
    };
    const performance = calculateSetPerformanceScore(nextPlannedSet, skippedSet);
    skippedSet.performanceScore = performance.score;
    skippedSet.performanceStatus = performance.status;
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      if (log) log.sets.push(skippedSet);
      if (target) {
        target.currentExerciseIndex = activeExerciseIndex;
        target.currentSetIndex = log?.sets.length || 0;
        target.updatedAt = nowIso();
      }
      return draft;
    });
    setSetDraft(emptySetDraft(nextPlannedSet, skippedSet, `${liveExerciseLog.id}:${currentSetIndex + 1}`));
  }

  function addSet() {
    const base = nextPlannedSet || planned?.plannedSets.at(-1);
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
    void updateDb((draft) => {
      const target = draft.sessions.find((item) => item.id === liveSession.id);
      const log = target?.loggedExercises.find((item) => item.id === liveExerciseLog.id);
      log?.sets.pop();
      if (target) {
        target.currentExerciseIndex = activeExerciseIndex;
        target.currentSetIndex = log?.sets.length || 0;
        target.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function finishExercise() {
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
    setSetDraft((current) => ({ ...current, actualWeight: String(recommendation.action?.suggestedWeight || current.actualWeight) }));
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

  return (
    <div className="space-y-5">
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

      <section className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <div className="panel h-fit p-3">
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

        <div className="space-y-4">
          <section className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label">Logging</p>
                <h3 className="mt-1 text-2xl font-black">{exercise.name}</h3>
                <p className="mt-1 text-sm text-iron-300">{exercise.setupCues.slice(0, 3).join(" - ")}</p>
                <p className="mt-1 text-xs text-iron-500">
                  {activeGym?.name || "No gym selected"}
                  {adjustedSuggestion?.weight ? ` - suggested ${adjustedSuggestion.weight} ${user.unit}` : ""}
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
                  const isCurrent = index === currentSetIndex && !actual;
                  return (
                    <div key={set.id} className={`rounded-lg border p-3 ${isCurrent ? "border-volt bg-volt/10" : actual ? "border-volt/30 bg-white/[0.07]" : "border-white/10 bg-white/[0.035]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black">Set {index + 1} - {actual?.skipped ? "Skipped" : actual ? "Complete" : isCurrent ? "Current" : "Pending"}</p>
                        <p className="text-xs text-iron-400">{set.kind}</p>
                      </div>
                      <p className="mt-1 text-sm text-iron-300">Planned: {set.plannedWeight || "-"} {user.unit} x {set.targetReps} @ RPE {set.targetRpe || "?"}</p>
                      {actual && <p className="mt-1 text-sm text-volt">Actual: {actual.skipped ? "Skipped" : `${actual.actualWeight} ${user.unit} x ${actual.actualReps} @ RPE ${actual.actualRpe || "?"}`}</p>}
                    </div>
                  );
                })}
                {!plannedSets.length && <EmptyState title="No planned sets" detail="Add a set or pick a planned exercise before logging." />}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <BigInput label="Weight" value={setDraft.actualWeight} onChange={(value) => setSetDraft((draft) => ({ ...draft, actualWeight: value }))} />
              <BigInput label="Reps" value={setDraft.actualReps} onChange={(value) => setSetDraft((draft) => ({ ...draft, actualReps: value }))} />
              <BigInput label="RPE" value={setDraft.actualRpe} onChange={(value) => setSetDraft((draft) => ({ ...draft, actualRpe: value }))} step="0.5" />
              <div>
                <label className="label">Set kind</label>
                <select className="field mt-2 min-h-14" value={setDraft.kind} onChange={(event) => setSetDraft((draft) => ({ ...draft, kind: event.target.value as SetKind }))}>
                  {["warmup", "working", "top", "backoff", "amrap", "technique"].map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(["Easy", "Good", "Hard", "Failed"] as SetRating[]).map((rating) => (
                <button key={rating} className={`min-h-12 rounded-lg text-sm font-black ${setDraft.setRating === rating ? "bg-volt text-iron-950" : "bg-white/10 text-white"}`} onClick={() => setSetDraft((draft) => ({ ...draft, setRating: rating }))}>
                  {rating}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <SmallRating label="Form" value={setDraft.formRating} onChange={(value) => setSetDraft((draft) => ({ ...draft, formRating: value }))} />
              <SmallRating label="Feel" value={setDraft.muscleFeelRating} onChange={(value) => setSetDraft((draft) => ({ ...draft, muscleFeelRating: value }))} />
              <SmallRating label="Pump" value={setDraft.pumpRating} onChange={(value) => setSetDraft((draft) => ({ ...draft, pumpRating: value }))} />
              <SmallRating label="Pain" value={setDraft.painRating} onChange={(value) => setSetDraft((draft) => ({ ...draft, painRating: value }))} />
              <SmallRating label="Sore" value={setDraft.sorenessRating} onChange={(value) => setSetDraft((draft) => ({ ...draft, sorenessRating: value }))} />
            </div>
            <textarea className="field mt-4 min-h-20" placeholder="Notes or tags: slow off chest, weak lockout, poor feel, pain-free substitute..." value={setDraft.notes} onChange={(event) => setSetDraft((draft) => ({ ...draft, notes: event.target.value }))} />
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <button className="btn-secondary" onClick={previousSet} disabled={!liveExerciseLog.sets.length}>Back</button>
              <button className="btn-secondary border-ember/40 text-orange-100" onClick={skipSet}>Skip Set</button>
              <button
                className="btn-primary"
                onClick={() => logSet(setDraft.setRating, primaryAction === "finish-workout" ? "finish-workout" : primaryAction === "finish-exercise" ? "next-exercise" : "stay")}
                disabled={isPastLastPlannedSet}
              >
                <Check className="h-5 w-5" /> {primaryActionLabel}
              </button>
              <button className="btn-secondary" onClick={addSet} disabled={!isCurrentSetLastPlannedSet && !isPastLastPlannedSet}>Add Set</button>
              <button className="btn-secondary" onClick={finishExercise} disabled={!exerciseComplete}>Finish Exercise</button>
            </div>
          </section>

          {recommendation && (
            <section className="panel border-volt/30 p-4">
              <p className="label">Coach suggestion</p>
              <h3 className="mt-1 text-xl font-black">{recommendation.title}</h3>
              <p className="mt-2 text-sm text-iron-200">{recommendation.explanation}</p>
              {recommendation.action?.suggestedWeight ? (
                <button className="btn-secondary mt-3" onClick={applySuggestion}>
                  Apply {recommendation.action.suggestedWeight} {user.unit}
                </button>
              ) : null}
            </section>
          )}

          <LoggedSetsTable logged={activeExerciseLog} exercise={exercise} user={user} />
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary border-ember/40 text-orange-100" onClick={abandonWorkout}>Abandon Workout</button>
            <button className="btn-primary" onClick={finishWorkout} disabled={!allExercisesComplete}>Finish Workout</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BuilderScreen({
  db,
  user,
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const splitTemplates = db.splitTemplates.filter((split) => !split.ownerUserId || split.ownerUserId === user.id);
  const [selectedSplitId, setSelectedSplitId] = useState(splitTemplates[0]?.id || db.splitTemplates[0]?.id || "");
  const [generationState, setGenerationState] = useState<{ status: "idle" | "loading" | "success" | "error"; message?: string }>({ status: "idle" });
  const [buildMode, setBuildMode] = useState<ProgramBuildMode>("manual");
  const [showFlowHelp, setShowFlowHelp] = useState(false);
  const [request, setRequest] = useState<ProgramRequest>({
    name: "Custom Powerbuilding Block",
    goal: user.goal,
    daysPerWeek: user.availableDaysPerWeek,
    blockType: "hypertrophy",
    blockLengthWeeks: 6,
    priorityMuscles: user.goal === "general-health" ? ["full-body" as MuscleGroup] : ["chest", "quads", "side-delts"],
    priorityExerciseIds: user.goal === "general-health" ? ["ex_leg_press", "ex_machine_chest_press"] : ["ex_squat_comp", "ex_bench_comp"],
    splitTemplateId: selectedSplitId,
    splitLoopMode: "continuous",
    compoundSettings: defaultCompoundSettings,
    buildMode: "manual",
    notes: "Block notes, constraints, and coaching context."
  });
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
    if (mode === "suggested" && !request.priorityExerciseIds.length && request.goal !== "general-health") {
      setGenerationState({ status: "error", message: "Select at least one key lift so the block has a clear emphasis." });
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
              <button className="btn-primary w-full" onClick={() => activateProgram(draftProgram)}><CheckCircle2 className="h-4 w-4" /> Activate Draft</button>
            </div>
          ) : <EmptyState title="No draft" detail="Use Manual Build or Suggest Full Program below." />}
        </Panel>
        <Panel title="Flow" icon={ChevronRight}>
          <button className="btn-ghost w-full justify-between" onClick={() => setShowFlowHelp((value) => !value)}>
            Library &gt; Block &gt; Today
            <ChevronRight className={`h-4 w-4 transition ${showFlowHelp ? "rotate-90" : ""}`} />
          </button>
          {showFlowHelp && <p className="mt-2 text-sm text-iron-300">Splits define structure. Block turns the split into editable workouts, sets, reps, RPE targets, and warnings. Today only reads the active block sequence.</p>}
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
            <TextField label="Program name" value={request.name} onChange={(name) => setRequest((draft) => ({ ...draft, name }))} />
            <SelectField label="Goal" value={request.goal} options={["powerlifting", "bodybuilding", "powerbuilding", "general-health", "conditioning", "maintenance"]} onChange={(goal) => setRequest((draft) => ({ ...draft, goal: goal as TrainingGoal }))} />
            <NumberField label="Days/week" value={request.daysPerWeek} onChange={(daysPerWeek) => setRequest((draft) => ({ ...draft, daysPerWeek }))} />
            <SelectField label="Block type" value={request.blockType} options={["accumulation", "hypertrophy", "strength", "intensification", "peaking", "deload", "custom"]} onChange={(blockType) => setRequest((draft) => ({ ...draft, blockType: blockType as BlockType }))} />
            <NumberField label="Weeks" value={request.blockLengthWeeks} onChange={(blockLengthWeeks) => setRequest((draft) => ({ ...draft, blockLengthWeeks }))} />
            <SelectField label="Split template" value={selectedSplitId} options={db.splitTemplates.map((split) => split.id)} labels={Object.fromEntries(db.splitTemplates.map((split) => [split.id, `${split.name} (${split.daysPerWeek}d)`]))} onChange={(id) => { setSelectedSplitId(id); setRequest((draft) => ({ ...draft, splitTemplateId: id })); }} />
            <SelectField label="Split loop" value={request.splitLoopMode} options={["continuous", "weekly-reset"]} labels={{ "continuous": "Continuous loop", "weekly-reset": "Weekly reset" }} onChange={(splitLoopMode) => setRequest((draft) => ({ ...draft, splitLoopMode: splitLoopMode as SplitLoopMode }))} />
          </div>
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
          <button className="btn-primary mt-4 w-full" onClick={() => createProgram(buildMode)} disabled={generationState.status === "loading"}>
            <Save className="h-4 w-4" />
            {generationState.status === "loading" ? "Working..." : buildMode === "manual" ? "Create Manual Draft" : "Suggest Full Program"}
          </button>
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

      <WeeklyOverview db={db} user={user} program={workingProgram} updateDb={updateDb} editable />

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
      {editable && selectedDay && <WorkoutDayEditor db={db} user={user} program={program} day={selectedDay} updateDb={updateDb} />}
      {!editable && selectedDay && (
        <div className="mt-4">
          <WorkoutDayView db={db} user={user} day={selectedDay} />
        </div>
      )}
    </Panel>
  );
}

function WorkoutDayEditor({
  db,
  user,
  program,
  day,
  updateDb
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program: Program;
  day: WorkoutDay;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
}) {
  const targetMuscles = day.targetMuscles?.length ? day.targetMuscles : db.splitTemplates.flatMap((split) => split.days).find((splitDay) => splitDay.id === day.splitDayId)?.muscleGroups || [];
  const uniqueTargetMuscles = targetMuscles.filter((muscle, index) => targetMuscles.indexOf(muscle) === index);
  const coveredMuscles = new Set<MuscleGroup>();
  day.exercises.forEach((planned) => {
    const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
    exercise?.directVolumeMuscles.forEach((muscle) => coveredMuscles.add(muscle));
  });
  const [currentPickerMuscle, setCurrentPickerMuscle] = useState<MuscleGroup | "all">(uniqueTargetMuscles[0] || "all");
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [chooserWarning, setChooserWarning] = useState("");

  useEffect(() => {
    if (currentPickerMuscle !== "all" && !uniqueTargetMuscles.includes(currentPickerMuscle)) {
      setCurrentPickerMuscle(uniqueTargetMuscles[0] || "all");
    }
  }, [currentPickerMuscle, uniqueTargetMuscles]);

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

  function addExercise(exercise: Exercise) {
    updateDay((target) => {
      target.exercises.push(buildPlannedExerciseFromExercise({ db, user, program, day: target, exercise, order: target.exercises.length + 1 }));
    });
    if (currentPickerMuscle !== "all") {
      const nextMuscle = uniqueTargetMuscles.find((muscle) => muscle !== currentPickerMuscle && !coveredMuscles.has(muscle));
      if (nextMuscle) setCurrentPickerMuscle(nextMuscle);
    }
  }

  function chooseForMe() {
    if (day.exercises.length && !confirm("Replace the exercises currently selected for this workout?")) return;
    const targetPatterns = day.movementPatterns || [];
    const settings = program.blocks[0]?.compoundSettings || defaultCompoundSettings;
    const activeGym = db.gyms.find((gym) => gym.id === user.activeGymId);
    const suggestions = db.exercises
      .filter((exercise) => (!exercise.ownerUserId || exercise.ownerUserId === user.id))
      .filter((exercise) => exerciseAllowedByCompoundSettings(exercise, settings))
      .filter((exercise) => !activeGym || !exercise.equipment.some((item) => activeGym.unavailableEquipment.includes(item)))
      .filter((exercise) => {
        const muscleMatch = targetMuscles.length === 0 || exercise.primaryMuscles.some((muscleItem) => targetMuscles.includes(muscleItem));
        const patternMatch = targetPatterns.length === 0 || targetPatterns.includes(exercise.movementPattern) || exercise.movementPatterns?.some((pattern) => targetPatterns.includes(pattern));
        return muscleMatch && patternMatch;
      })
      .slice(0, Math.max(3, Math.min(6, targetMuscles.length + 2)));
    if (!suggestions.length) {
      setChooserWarning("No valid exercises matched this day after SBD rules, Exercise Avoider, gym availability, muscles, and movement patterns. You can override manually below.");
      return;
    }
    setChooserWarning("");
    updateDay((target) => {
      target.exercises = suggestions.map((exercise, index) => buildPlannedExerciseFromExercise({ db, user, program, day: target, exercise, order: index + 1 }));
    });
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Day name" value={day.name} onChange={(name) => updateDay((target) => { target.name = name; })} />
        <SelectField label="Focus" value={day.focus} options={["strength", "hypertrophy", "technical", "recovery", "conditioning", "hybrid"]} onChange={(focus) => updateDay((target) => { target.focus = focus as WorkoutDay["focus"]; })} />
      </div>
      <button className="btn-secondary w-full" onClick={chooseForMe}><Wand2 className="h-4 w-4" /> Choose For Me</button>
      {chooserWarning && <div className="rounded-lg border border-ember/40 bg-ember/10 p-3 text-sm text-orange-100">{chooserWarning}</div>}
      <div className="rounded-lg border border-white/10 bg-iron-950/45 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="label">Target muscle steps</span>
          {(uniqueTargetMuscles.length ? uniqueTargetMuscles : ["full-body" as MuscleGroup]).map((muscle) => (
            <button
              key={muscle}
              className={`rounded-full px-3 py-1 text-xs font-bold ${currentPickerMuscle === muscle ? "bg-volt text-iron-950" : coveredMuscles.has(muscle) ? "bg-volt/20 text-volt" : "bg-white/10 text-iron-300"}`}
              onClick={() => setCurrentPickerMuscle(muscle)}
            >
              {muscle}
            </button>
          ))}
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm font-bold text-iron-200">
          <input type="checkbox" checked={showAllExercises} onChange={(event) => setShowAllExercises(event.target.checked)} />
          Override: show all exercises
        </label>
        <ExercisePicker
          db={db}
          user={user}
          onPick={addExercise}
          targetMuscles={showAllExercises || currentPickerMuscle === "all" ? [] : [currentPickerMuscle]}
          targetPatterns={showAllExercises ? [] : day.movementPatterns || []}
          grouped={!showAllExercises}
        />
      </div>
      <div className="space-y-2">
        {day.exercises.map((planned) => {
          const exercise = db.exercises.find((item) => item.id === planned.exerciseId);
          return (
            <div key={planned.id} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black">{planned.order}. {exercise?.name}</p>
                  <p className="text-xs text-iron-400">{planned.plannedSets.length} sets - {planned.plannedSets[0]?.targetReps} reps - RPE {planned.plannedSets[0]?.targetRpe}</p>
                </div>
                <button className="btn-ghost text-orange-100" onClick={() => updateDay((target) => {
                  target.exercises = target.exercises.filter((item) => item.id !== planned.id).map((item, index) => ({ ...item, order: index + 1 }));
                })}>Remove</button>
              </div>
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
                <NumberField label="RPE" value={planned.plannedSets[0]?.targetRpe || 7} onChange={(rpe) => updateDay((target) => {
                  target.exercises.find((item) => item.id === planned.id)?.plannedSets.forEach((set) => { set.targetRpe = rpe; });
                })} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExercisePicker({
  db,
  user,
  onPick,
  selectedIds = [],
  compoundFilter = "all",
  targetMuscles = [],
  targetPatterns = [],
  grouped = false
}: {
  db: TrainingDatabase;
  user: UserProfile;
  onPick: (exercise: Exercise) => void;
  selectedIds?: string[];
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
  const groupedSections = grouped && !query && muscle === "all" && groupedMuscles.length
    ? groupedMuscles.map((targetMuscle) => ({
        muscle: targetMuscle,
        exercises: allMatches
          .filter((exercise) => exercise.primaryMuscles.includes(targetMuscle) || exercise.muscleGroup === targetMuscle || exercise.directVolumeMuscles.includes(targetMuscle))
          .slice(0, 5)
      })).filter((section) => section.exercises.length)
    : [];

  const renderExerciseButton = (exercise: Exercise) => (
    <button key={exercise.id} className={`rounded-lg border p-3 text-left hover:border-volt/50 ${selectedIds.includes(exercise.id) ? "border-volt bg-volt/10" : "border-white/10 bg-white/[0.06]"}`} onClick={() => onPick(exercise)}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-black">{exercise.name}</p>
        {selectedIds.includes(exercise.id) && <Check className="h-4 w-4 text-volt" />}
      </div>
      <p className="mt-1 text-xs text-iron-400">{exercise.primaryMuscles.join(", ")} - {exercise.equipment.join(", ")} - {exercise.movementPattern}</p>
      <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-iron-500">{isCompound(exercise) ? "compound" : "isolation/accessory"} - fatigue {fatigueRatingForExercise(exercise)}/5</p>
    </button>
  );

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
  const gaps = analyzeProgramGaps(program, db);
  const groupedGaps = [
    { label: "Rule Conflicts", types: ["fatigue"] as ProgramGap["type"][], match: (gap: ProgramGap) => gap.issue.toLowerCase().includes("rule") || gap.issue.toLowerCase().includes("conflict") },
    { label: "Volume", types: ["volume", "missing-category"] as ProgramGap["type"][] },
    { label: "Balance", types: ["balance", "movement-pattern"] as ProgramGap["type"][] },
    { label: "Fatigue", types: ["fatigue"] as ProgramGap["type"][], match: (gap: ProgramGap) => !gap.issue.toLowerCase().includes("rule") && !gap.issue.toLowerCase().includes("conflict") },
    { label: "Recovery / Spacing", types: ["frequency"] as ProgramGap["type"][] }
  ].map((group) => ({
    ...group,
    gaps: gaps.filter((gap) => (group.match ? group.match(gap) : group.types.includes(gap.type)))
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
        )) : <EmptyState title="No major program gaps" detail="The active week passes the current volume, balance, frequency, and fatigue checks." />}
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
  const [draft, setDraft] = useState({
    name: "",
    notes: "",
    primaryMuscles: ["chest"] as MuscleGroup[],
    secondaryMuscles: [] as MuscleGroup[],
    movementPatterns: ["horizontal-press"] as MovementPattern[],
    equipment: "dumbbell" as EquipmentCategory,
    defaultUnit: user.unit as ExerciseUnit,
    allowedUnits: [user.unit] as ExerciseUnit[],
    defaultIncrement: user.unit === "kg" ? 2.5 : 5,
    customIncrement: user.unit === "kg" ? 2.5 : 5,
    fatigueRating: 2,
    isCompound: false,
    canBeGymSpecific: false,
    isGymSpecificEnabled: false,
    tags: ""
  });
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
      kind: draft.isCompound ? ["compound"] : ["accessory"],
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
    setDraft((value) => ({ ...value, name: "", notes: "", tags: "" }));
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
              <input className="field" placeholder="Search name, muscle, equipment, movement pattern..." value={query} onChange={(event) => setQuery(event.target.value)} />
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
                          <p className="mt-1 text-xs text-iron-400">{exercise.primaryMuscles.join(", ")} - {exercise.equipment.join(", ")} - {exercise.movementPattern}</p>
                          <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-iron-500">{isCompound(exercise) ? "compound" : "isolation/accessory"} - {exercise.ownerUserId ? "custom" : "default"}{exercise.isGymSpecificEnabled ? " - gym-specific" : ""}</p>
                        </div>
                        <button className="btn-ghost shrink-0" onClick={() => setProgressExerciseId(exercise.id)} title={`Open ${exercise.name} progress`}>
                          <BarChart3 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!exercises.length && <EmptyState title="No exercises match" detail="Clear a filter or add a new exercise." />}
                </div>
              </div>
            </div>
            <Panel title="Custom Exercise" icon={Plus}>
              <div className="space-y-3">
                <TextField label="Name" value={draft.name} onChange={(name) => setDraft((value) => ({ ...value, name }))} />
                <TextField label="Notes" value={draft.notes} onChange={(notes) => setDraft((value) => ({ ...value, notes }))} />
                <SelectField label="Equipment" value={draft.equipment} options={equipmentOptions} onChange={(value) => setDraft((item) => ({ ...item, equipment: value as EquipmentCategory }))} />
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
                  <p className="label mb-2">Movement patterns</p>
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
                <TextField label="Tags" value={draft.tags} onChange={(tags) => setDraft((value) => ({ ...value, tags }))} />
                <button className="btn-primary w-full" onClick={addCustomExercise}>Add Exercise</button>
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
  const loggedSets = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed")
    .flatMap((session) =>
      session.loggedExercises
        .filter((logged) => logged.exerciseId === exercise.id)
        .flatMap((logged) => logged.sets.map((set) => ({ session, set })))
    )
    .filter(({ set }) => !set.skipped && set.kind !== "warmup")
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
  const structuredLogs = (db.exercisePerformanceLogs || []).filter((log) => log.userId === user.id && log.exerciseId === exercise.id);
  const chartPoints = db.sessions
    .filter((session) => session.userId === user.id && session.status === "completed")
    .map((session) => {
      const log = session.loggedExercises.find((item) => item.exerciseId === exercise.id);
      if (!log) return undefined;
      const value = calculateSessionExerciseE1RM(log);
      if (!value) return undefined;
      return {
        label: session.weekNumber ? `W${session.weekNumber}` : new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value,
        date: session.startedAt
      };
    })
    .filter((point): point is { label: string; value: number; date: string } => Boolean(point))
    .sort((a, b) => a.date.localeCompare(b.date));
  const hasHistory = chartPoints.length > 0 || loggedSets.length > 0 || structuredLogs.length > 0;
  const bestE1rm = Math.max(0, ...chartPoints.map((point) => point.value), ...structuredLogs.map((log) => log.e1rm || 0));
  const totalVolume = loggedSets.reduce((sum, { set }) => sum + set.actualWeight * set.actualReps, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-iron-950 p-4 shadow-glow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">Exercise Progress</p>
            <h2 className="text-2xl font-black">{exercise.name}</h2>
            <p className="mt-1 text-sm text-iron-300">Prepared for weight, e1RM, volume, sets/reps, RPE/RIR, and gym-specific charts.</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {hasHistory ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Logged sets" value={loggedSets.length + structuredLogs.length} />
              <Metric label="Best e1RM" value={bestE1rm || "-"} unit={bestE1rm ? user.unit : undefined} />
              <Metric label="Volume" value={Math.round(totalVolume).toLocaleString()} unit={user.unit} />
            </div>
            {chartPoints.length ? <ExerciseE1rmChart points={chartPoints} unit={user.unit} /> : null}
          </>
        ) : (
          <div className="mt-4">
            <EmptyState title="No logged data yet" detail="Once you complete workouts with this exercise, your progress chart will appear here." />
          </div>
        )}
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <p className="font-black">Session 2 chart slots</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {["Weight over time", "Estimated 1RM over time", "Volume over time", "Sets and reps over time", "RPE/RIR trends", "Gym-specific performance"].map((label) => (
              <div key={label} className="rounded-lg bg-iron-950/60 p-3 text-sm font-bold text-iron-300">{label}</div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ExerciseE1rmChart({ points, unit }: { points: { label: string; value: number }[]; unit: string }) {
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
        <p className="font-black">e1RM trend</p>
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
  const activeSplit = splits.find((split) => split.id === editingId) || splits[0];

  function createSplit() {
    const split: SplitTemplate = {
      id: createId("split"),
      ownerUserId: user.id,
      name: "New Custom Split",
      goal: user.goal,
      daysPerWeek: 3,
      description: "Reusable training structure based on muscles and movement patterns.",
      notes: "Reusable training structure. Exercises are added later in Program.",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      days: [
        makeSplitDay("Push", ["chest", "side-delts", "triceps"], ["horizontal-press", "vertical-press", "isolation"]),
        makeSplitDay("Pull", ["back", "lats", "rear-delts", "biceps"], ["horizontal-pull", "vertical-pull", "isolation"]),
        makeSplitDay("Legs", ["quads", "hamstrings", "glutes", "calves"], ["squat", "hinge", "isolation"])
      ]
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
            <TextField label="Description" value={activeSplit.description || ""} onChange={(description) => updateSplit((split) => { split.description = description; })} />
            <TextField label="Notes" value={activeSplit.notes} onChange={(notes) => updateSplit((split) => { split.notes = notes; })} />
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
  const toggleMuscle = (muscle: MuscleGroup) => {
    const muscleGroups = day.muscleGroups.includes(muscle) ? day.muscleGroups.filter((item) => item !== muscle) : [...day.muscleGroups, muscle];
    onChange({ ...day, muscleGroups, targetMuscles: muscleGroups, priorityMuscles: muscleGroups.slice(0, 2), weeklySetTargets: Object.fromEntries(muscleGroups.map((item) => [item, day.weeklySetTargets[item] || 6])) });
  };
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
        <p className="label mb-2">Target muscles</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {muscleOptions.map((muscle) => (
            <button key={muscle} className={`rounded-lg border p-2 text-xs font-bold ${day.muscleGroups.includes(muscle) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => toggleMuscle(muscle)}>{muscle}</button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <p className="label mb-2">Movement patterns</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {movementOptions.map((pattern) => (
            <button key={pattern} className={`rounded-lg border p-2 text-xs font-bold ${day.movementPatterns.includes(pattern) ? "border-volt bg-volt/10 text-volt" : "border-white/10 bg-white/[0.04] text-iron-300"}`} onClick={() => togglePattern(pattern)}>{pattern}</button>
          ))}
        </div>
      </div>
      <TextField label="Notes" value={day.notes || ""} onChange={(notes) => onChange({ ...day, notes })} />
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

function WeekProgressScreen({ db, user, setScreen }: { db: TrainingDatabase; user: UserProfile; setScreen: (screen: Screen) => void }) {
  const activeProgram = db.programs.find((program) => program.userId === user.id && program.status === "active");
  const block = activeProgram?.blocks[0];
  const week = block?.weeks.find((item) => item.weekNumber === block.currentWeek) || block?.weeks[0];
  const weekSessions = db.sessions.filter((session) => session.userId === user.id && session.blockId === block?.id && session.weekNumber === week?.weekNumber);
  const completedSessions = weekSessions.filter((session) => session.status === "completed");
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
    ? Number((averageSetRating.reduce((sum, set) => sum + setRatingValue(set.setRating), 0) / averageSetRating.length).toFixed(1))
    : 0;

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
            <Metric label="Block week" value={week.weekNumber} />
            <Metric label="Completion" value={completionPercent} unit="%" />
            <Metric label="Workout score" value={averageWorkoutScore || "-"} unit={averageWorkoutScore ? "/100" : undefined} />
          </section>
          <section className="grid gap-3 md:grid-cols-4">
            <Metric label="Completed" value={completedSessions.length} unit="workouts" />
            <Metric label="Skipped" value={skippedCount} unit="days" />
            <Metric label="In progress" value={weekSessions.filter((session) => session.status === "in-progress").length} unit="workouts" />
            <Metric label="Set feel" value={averageSetFeel || "-"} unit={averageSetFeel ? "/5" : undefined} />
          </section>
          <Panel title={`Block Week ${week.weekNumber}`} icon={ClipboardList}>
            <div className="space-y-3">
              {week.workouts.map((day) => {
                const session = db.sessions.find((item) => item.userId === user.id && item.workoutDayId === day.id && item.status !== "abandoned");
                const actualSets = session?.loggedExercises.reduce((sum, log) => sum + log.sets.filter((set) => !set.skipped).length, 0) || 0;
                const skippedSets = session?.loggedExercises.reduce((sum, log) => sum + log.sets.filter((set) => set.skipped).length, 0) || 0;
                const plannedSets = day.exercises.reduce((sum, planned) => sum + planned.plannedSets.length, 0);
                const tonnage = session?.loggedExercises.reduce((sum, log) => sum + log.sets.reduce((setSum, set) => setSum + (set.skipped ? 0 : set.actualWeight * set.actualReps), 0), 0) || 0;
                const score = session?.workoutScore ?? (session?.status === "completed" ? calculateWorkoutScore(session).score : undefined);
                const daySkipped = block.skippedWorkoutDayIds?.includes(day.id) || day.status === "skipped";
                return (
                  <div key={day.id} className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="label">{day.scheduledDay || `Day ${day.dayIndex || ""}`}</p>
                        <h3 className="mt-1 font-black">{day.name}</h3>
                        <p className="mt-1 text-sm text-iron-300">{day.focus} - planned {plannedSets} sets</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${session?.status === "completed" ? "bg-volt text-iron-950" : session?.status === "in-progress" ? "bg-steel/20 text-steel" : daySkipped ? "bg-ember/20 text-orange-100" : "bg-white/10 text-iron-300"}`}>
                        {session?.status || (daySkipped ? "skipped" : "planned")}
                      </span>
                    </div>
                    {session ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-5">
                        <Metric label="Actual sets" value={actualSets} />
                        <Metric label="Skipped" value={skippedSets} />
                        <Metric label="Tonnage" value={Math.round(tonnage).toLocaleString()} unit={user.unit} />
                        <Metric label="Readiness" value={session.readiness?.readinessScore || "-"} />
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
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="font-black">Coming next</p>
              <p className="mt-1 text-sm text-iron-300">Weekly score, fatigue trend, and progression suggestions are wired as placeholders here; completed workouts now provide the score and set-feel inputs.</p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function ProgressScreen({ db, user }: { db: TrainingDatabase; user: UserProfile }) {
  const metrics = powerliftingMetrics(db, user);
  const weekly = summarizeWeek(db, user);
  const topSets = recentTopSets(db.sessions, user.id);
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
                  <p className="text-xs text-iron-400">{set.actualWeight} x {set.actualReps} @ {set.actualRpe || "?"} - {set.setRating}</p>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Weekly Review" icon={ClipboardList}>
          <Metric label="Completed" value={weekly.completedWorkouts} unit="workouts" />
          <Metric label="Tonnage" value={Math.round(weekly.tonnage).toLocaleString()} unit={user.unit} />
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
      gap.severity === "high" ? "border-ember/40 bg-ember/10" : gap.severity === "medium" ? "border-volt/25 bg-volt/10" : "border-white/10 bg-white/[0.06]"
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
  reseed
}: {
  db: TrainingDatabase;
  user: UserProfile;
  updateDb: (updater: (draft: TrainingDatabase) => TrainingDatabase) => Promise<void>;
  importDb: (db: TrainingDatabase) => Promise<void>;
  reseed: () => Promise<void>;
}) {
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
        <Panel title="Backup" icon={FileDown}>
          <div className="space-y-3">
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

function ReadinessCard({ onSubmit, user }: { onSubmit: (input: Omit<ReadinessCheckIn, "id" | "userId" | "date" | "readinessScore">) => void; user: UserProfile }) {
  const [draft, setDraft] = useState({
    sleepQuality: 3,
    stress: 3,
    soreness: 2,
    motivation: 4,
    energy: 4,
    jointPain: 1,
    bodyweight: user.bodyweightHistory.at(-1)?.weight || 0,
    nutritionQuality: 4,
    caffeine: true,
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
        <BigInput label="Bodyweight" value={String(draft.bodyweight)} onChange={(value) => setDraft((current) => ({ ...current, bodyweight: Number(value) }))} />
      </div>
      <textarea className="field mt-3 min-h-16" placeholder="Pain, limitations, travel, low sleep, etc." value={draft.limitations} onChange={(event) => setDraft((current) => ({ ...current, limitations: event.target.value }))} />
      <button className="btn-primary mt-4 w-full" onClick={() => onSubmit({ ...draft, bodyweight: Number(draft.bodyweight) || undefined })}>Save Check-In</button>
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
          const suggestion = exercise ? suggestPlannedWeight({ user, exercise, plannedSet: planned.plannedSets[0], db, gymId: user.activeGymId }) : undefined;
          return (
            <div key={planned.id} className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{exercise?.name}</p>
                  <p className="mt-1 text-xs text-iron-400">{planned.plannedSets.length} sets - {planned.plannedSets[0]?.targetReps} reps - RPE {planned.plannedSets[0]?.targetRpe}</p>
                </div>
                <span className="rounded-full bg-volt/15 px-2 py-1 text-xs font-bold text-volt">{suggestion?.weight || planned.plannedSets[0]?.plannedWeight || "-"} {user.unit}</span>
              </div>
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
              <th className="p-3">Rating</th>
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
                <td className="p-3">{set.setRating}</td>
                <td className="p-3">{estimateOneRepMax(set.actualWeight, set.actualReps, set.actualRpe || 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function setRatingValue(rating: SetRating): number {
  if (rating === "Easy") return 5;
  if (rating === "Good") return 3;
  if (rating === "Hard") return 2;
  return 1;
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
    const validSets = logged.sets.filter((set) => !set.skipped && set.kind !== "warmup");
    if (!validSets.length) return;
    const totalReps = validSets.reduce((sum, set) => sum + set.actualReps, 0);
    const averageSetRating = Number((validSets.reduce((sum, set) => sum + setRatingValue(set.setRating), 0) / validSets.length).toFixed(1));
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
      rpe: Number((validSets.reduce((sum, set) => sum + (set.actualRpe || 0), 0) / validSets.length).toFixed(1)) || undefined,
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
  return {
    draftKey,
    kind: planned?.kind || "working" as SetKind,
    actualWeight: String(planned?.plannedWeight ?? last?.actualWeight ?? ""),
    actualReps: String(planned?.targetReps ?? last?.actualReps ?? ""),
    actualRpe: String(planned?.targetRpe ?? last?.targetRpe ?? ""),
    setRating: "Good" as SetRating,
    formRating: "4",
    muscleFeelRating: "4",
    pumpRating: "3",
    painRating: "0",
    sorenessRating: "2",
    notes: ""
  };
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

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  labels,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{labels?.[option] || option}</option>)}
      </select>
    </div>
  );
}

function BigInput({ label, value, onChange, step = "1" }: { label: string; value: string; onChange: (value: string) => void; step?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2 min-h-14 text-2xl font-black" inputMode="decimal" type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} />
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
  order
}: {
  db: TrainingDatabase;
  user: UserProfile;
  program?: Program;
  day?: WorkoutDay;
  exercise: Exercise;
  order: number;
}): PlannedExercise {
  const block = program?.blocks[0];
  const prescription = getBlockExercisePrescription({
    exercise,
    goal: program?.goal || user.goal,
    blockType: block?.type || "hypertrophy",
    weekNumber: day?.weekNumber || block?.currentWeek || 1,
    blockLengthWeeks: block?.lengthWeeks || 4,
    order,
    isPriority: Boolean(block?.priorityExerciseIds.includes(exercise.id) || isSbdExercise(exercise))
  });
  const plannedSet = prescription.plannedSets[0] || { id: createId("pset"), kind: "working" as const, setNumber: 1, targetReps: 8, targetRpe: 7 };
  const suggested = suggestPlannedWeight({ user, exercise, plannedSet, db, gymId: user.activeGymId });
  return {
    id: createId("planned"),
    exerciseId: exercise.id,
    required: prescription.required,
    order,
    plannedSets: prescription.plannedSets.map((set, index) => ({
      ...set,
      id: createId("pset"),
      setNumber: index + 1,
      plannedWeight: suggested.weight || undefined
    })),
    restSeconds: prescription.restSeconds,
    notes: `${prescription.note} ${suggested.explanation}`,
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
