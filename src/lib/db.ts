import { builtInExercises, seedDatabase } from "../data/seedData";
import { syncActiveBlockProgress } from "./blockProgression";
import { createId, nowIso, todayIso } from "./ids";
import { defaultCompoundSettings } from "./programmingLogic";
import { calculateSetPerformanceScore, calculateWorkoutScore } from "./trainingMath";
import type { ExerciseCategoryLabel, FatigueLevel, MuscleGroup, TrainingDatabase, TrainingGoal, UserProfile } from "../types/domain";

const DB_NAME = "iron-orbit-training-db";
const DB_VERSION = 1;
const STORE = "documents";
const LEGACY_KEY = "training-database";
const LEGACY_LOCAL_BACKUP_KEY = "iron-orbit-training-database-backup";
const LOCAL_ONLY_KEY = "iron-orbit-local-only";
const LOCAL_ONLY_BACKUP_KEY = "iron-orbit-local-only-backup";
const LOCAL_ONLY_USER_ID = "local_only_user";

export interface AppIdentityBinding {
  mode: "local" | "supabase";
  supabaseUserId?: string;
  email?: string;
}

export type DatabaseStorageScope =
  | { mode: "local-only" }
  | { mode: "cloud-cache"; supabaseUserId: string };

function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStorageKey(scope: DatabaseStorageScope): string {
  return scope.mode === "local-only"
    ? LOCAL_ONLY_KEY
    : `iron-orbit-cloud-cache-${scope.supabaseUserId}`;
}

function getBackupKey(scope: DatabaseStorageScope): string {
  return scope.mode === "local-only"
    ? LOCAL_ONLY_BACKUP_KEY
    : `iron-orbit-cloud-cache-backup-${scope.supabaseUserId}`;
}

function defaultUserDisplayName(email?: string): string {
  if (!email) return "Local Profile";
  const prefix = email.split("@")[0]?.trim();
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Account";
}

function looksLikeSupabaseAccountProfile(user: UserProfile | undefined): boolean {
  if (!user) return false;
  return user.username.includes("@") || user.id.includes("-");
}

function makeDefaultLocalProfile(id = LOCAL_ONLY_USER_ID, email?: string): UserProfile {
  const displayName = defaultUserDisplayName(email);
  const goal: TrainingGoal = "powerbuilding";
  return {
    id,
    username: email || "local-only",
    displayName,
    pinHash: "",
    createdAt: nowIso(),
    goal,
    experience: "intermediate",
    unit: "lb",
    availableDaysPerWeek: 4,
    preferredWorkoutDurationMin: 75,
    trainingPreferences: ["local-first tracking", "simple setup", "sync when signed in"],
    injuryNotes: [],
    activeGymId: `${id}_gym_commercial`,
    maxes: [
      { id: createId("max"), liftName: "Squat", exerciseId: "ex_squat_comp", oneRepMax: 315, trainingMax: 285, unit: "lb", date: todayIso(), source: "manual" },
      { id: createId("max"), liftName: "Bench", exerciseId: "ex_bench_comp", oneRepMax: 225, trainingMax: 205, unit: "lb", date: todayIso(), source: "manual" },
      { id: createId("max"), liftName: "Deadlift", exerciseId: "ex_deadlift_comp", oneRepMax: 405, trainingMax: 365, unit: "lb", date: todayIso(), source: "manual" },
    ],
    bodyweightHistory: [{ id: createId("bw"), date: todayIso(), weight: 180, unit: "lb" }],
    settings: {
      darkMode: true,
      conservativeAutoAdjustments: true,
      showCoachingExplanations: true,
      defaultRestSeconds: 120,
      fatigueSensitivity: "medium",
    },
  };
}

function migrateUserReferences(database: TrainingDatabase, fromUserId: string, toUserId: string): void {
  if (fromUserId === toUserId) return;
  database.gyms.forEach((gym) => {
    if (gym.userId === fromUserId) gym.userId = toUserId;
    gym.exerciseAdjustments.forEach((adjustment) => {
      if (adjustment.userId === fromUserId) adjustment.userId = toUserId;
    });
  });
  database.exercises.forEach((exercise) => {
    if (exercise.ownerUserId === fromUserId) exercise.ownerUserId = toUserId;
  });
  database.splitTemplates.forEach((split) => {
    if (split.ownerUserId === fromUserId) split.ownerUserId = toUserId;
    if (split.favoriteUserIds?.includes(fromUserId)) {
      split.favoriteUserIds = Array.from(new Set(split.favoriteUserIds.map((id) => id === fromUserId ? toUserId : id)));
    }
  });
  database.workoutTemplates.forEach((template) => {
    if (template.userId === fromUserId) template.userId = toUserId;
  });
  database.programs.forEach((program) => {
    if (program.userId === fromUserId) program.userId = toUserId;
  });
  database.sessions.forEach((session) => {
    if (session.userId === fromUserId) session.userId = toUserId;
  });
  database.exercisePerformanceLogs?.forEach((log) => {
    if (log.userId === fromUserId) log.userId = toUserId;
  });
  database.readiness.forEach((entry) => {
    if (entry.userId === fromUserId) entry.userId = toUserId;
  });
  database.prs.forEach((entry) => {
    if (entry.userId === fromUserId) entry.userId = toUserId;
  });
  database.weakPoints.forEach((entry) => {
    if (entry.userId === fromUserId) entry.userId = toUserId;
  });
  database.recommendations.forEach((entry) => {
    if (entry.userId === fromUserId) entry.userId = toUserId;
  });
}

export function bindDatabaseToIdentity(data: TrainingDatabase, identity: AppIdentityBinding): TrainingDatabase {
  const next = structuredClone(data) as TrainingDatabase;
  let changed = false;

  if (!next.users.length) {
    next.users.push(makeDefaultLocalProfile(identity.mode === "supabase" ? identity.supabaseUserId || LOCAL_ONLY_USER_ID : LOCAL_ONLY_USER_ID, identity.email));
    changed = true;
  }

  const activeUser = next.users.find((user) => user.id === next.currentUserId) || next.users[0];

  if (identity.mode === "local") {
    const localUser = activeUser || makeDefaultLocalProfile();
    if (!next.users.some((user) => user.id === localUser.id)) {
      next.users.unshift(localUser);
      changed = true;
    }
    if (next.currentUserId !== localUser.id) {
      next.currentUserId = localUser.id;
      changed = true;
    }
    return changed ? next : data;
  }

  const supabaseUserId = identity.supabaseUserId;
  if (!supabaseUserId) return changed ? next : data;

  const existingSupabaseProfile = next.users.find((user) => user.id === supabaseUserId);
  const preferredSourceUser = next.users.find((user) => user.id === next.currentUserId) || next.users[0];

  if (!existingSupabaseProfile) {
    const sourceUser = preferredSourceUser || makeDefaultLocalProfile();
    const shouldMigrateSource =
      !!sourceUser
      && !looksLikeSupabaseAccountProfile(sourceUser)
      && (
        sourceUser.id === LOCAL_ONLY_USER_ID
        || sourceUser.pinHash !== ""
        || sourceUser.username === "local-only"
      );
    if (!next.users.some((user) => user.id === sourceUser.id)) {
      next.users.unshift(sourceUser);
    }
    if (shouldMigrateSource) {
      const previousId = sourceUser.id;
      migrateUserReferences(next, previousId, supabaseUserId);
      sourceUser.id = supabaseUserId;
      sourceUser.username = identity.email || sourceUser.username || supabaseUserId;
      sourceUser.pinHash = "";
      sourceUser.displayName = sourceUser.displayName || defaultUserDisplayName(identity.email);
      sourceUser.activeGymId = sourceUser.activeGymId?.replace(previousId, supabaseUserId) || `${supabaseUserId}_gym_commercial`;
      changed = true;
    } else {
      next.users.unshift(makeDefaultLocalProfile(supabaseUserId, identity.email));
      changed = true;
    }
  } else {
    existingSupabaseProfile.username = identity.email || existingSupabaseProfile.username || supabaseUserId;
    existingSupabaseProfile.pinHash = "";
    if (!existingSupabaseProfile.displayName) {
      existingSupabaseProfile.displayName = defaultUserDisplayName(identity.email);
      changed = true;
    }
  }

  const targetUser = next.users.find((user) => user.id === supabaseUserId) || makeDefaultLocalProfile(supabaseUserId, identity.email);
  if (!next.users.some((user) => user.id === targetUser.id)) {
    next.users.unshift(targetUser);
    changed = true;
  }
  if (targetUser.username !== (identity.email || targetUser.username)) {
    targetUser.username = identity.email || targetUser.username;
    changed = true;
  }
  if (targetUser.pinHash !== "") {
    targetUser.pinHash = "";
    changed = true;
  }
  if (next.currentUserId !== supabaseUserId) {
    next.currentUserId = supabaseUserId;
    changed = true;
  }

  return changed ? next : data;
}

function loadLocalBackup(scope: DatabaseStorageScope): TrainingDatabase | undefined {
  try {
    const raw = localStorage.getItem(getBackupKey(scope));
    return raw ? JSON.parse(raw) as TrainingDatabase : undefined;
  } catch {
    return undefined;
  }
}

function saveLocalBackup(scope: DatabaseStorageScope, data: TrainingDatabase): void {
  try {
    localStorage.setItem(getBackupKey(scope), JSON.stringify(data));
  } catch {
    // IndexedDB remains the source of truth if the synchronous backup is full or unavailable.
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStoredDatabase(scope: DatabaseStorageScope): Promise<TrainingDatabase | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const store = transaction.objectStore(STORE);
  const existing = await requestToPromise<TrainingDatabase | undefined>(store.get(getStorageKey(scope)));
  db.close();

  const backup = loadLocalBackup(scope);
  const source = (() => {
    if (backup && existing) {
      return parseTimestamp(backup.updatedAt) >= parseTimestamp(existing.updatedAt) ? backup : existing;
    }
    return backup || existing;
  })();
  if (source) {
    const normalized = normalizeDatabase(source);
    if (normalized !== existing) await saveDatabase(scope, normalized, { preserveUpdatedAt: true });
    return normalized;
  }
  return undefined;
}

async function migrateLegacyLocalDataIfNeeded(): Promise<TrainingDatabase | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const store = transaction.objectStore(STORE);
  const existing = await requestToPromise<TrainingDatabase | undefined>(store.get(LEGACY_KEY));
  db.close();

  const backup = (() => {
    try {
      const raw = localStorage.getItem(LEGACY_LOCAL_BACKUP_KEY);
      return raw ? JSON.parse(raw) as TrainingDatabase : undefined;
    } catch {
      return undefined;
    }
  })();

  const source = (() => {
    if (backup && existing) {
      return parseTimestamp(backup.updatedAt) >= parseTimestamp(existing.updatedAt) ? backup : existing;
    }
    return backup || existing;
  })();
  if (!source) return undefined;

  const normalized = normalizeDatabase(source);
  await saveDatabase({ mode: "local-only" }, normalized, { preserveUpdatedAt: true });
  return normalized;
}

export async function loadDatabase(
  scope: DatabaseStorageScope,
  options?: { seedIfMissing?: boolean }
): Promise<TrainingDatabase> {
  const stored = await loadStoredDatabase(scope);
  if (stored) return stored;

  if (scope.mode === "local-only") {
    const legacy = await migrateLegacyLocalDataIfNeeded();
    if (legacy) return legacy;
  }

  if (!options?.seedIfMissing) {
    throw new Error(`No stored database found for ${scope.mode}.`);
  }

  const seeded = await seedDatabase();
  await saveDatabase(scope, seeded, { preserveUpdatedAt: true });
  return seeded;
}

function normalizeDatabase(data: TrainingDatabase): TrainingDatabase {
  let changed = false;
  const next = structuredClone(data) as TrainingDatabase;

  // Merge any built-in exercises that are missing from the stored DB (e.g. newly added in seedData.ts).
  const existingIds = new Set(next.exercises.map((e) => e.id));
  builtInExercises.forEach((exercise) => {
    if (!existingIds.has(exercise.id)) {
      next.exercises.push(exercise);
      changed = true;
    }
  });

  next.programGaps ||= [];
  next.exercisePerformanceLogs ||= [];
  next.gymExerciseVariants ||= [];
  next.gyms.forEach((gym) => {
    if (!gym.exerciseAdjustments) {
      gym.exerciseAdjustments = [];
      changed = true;
    }
    gym.exerciseAdjustments.forEach((adjustment) => {
      if (adjustment.confidence === undefined) {
        adjustment.confidence = adjustment.source === "manual" ? 1 : Math.min(0.85, adjustment.sampleSize / 6);
        changed = true;
      }
      if (adjustment.lastCalculatedFactor === undefined) {
        adjustment.lastCalculatedFactor = adjustment.factor;
        changed = true;
      }
    });
  });
  next.exercises.forEach((exercise) => {
    if (exercise.fatigueRating === undefined) {
      exercise.fatigueRating = exercise.kind.includes("competition-lift") ? 5 : exercise.kind.includes("compound") ? 3 : exercise.kind.includes("conditioning") ? 2 : 1;
      changed = true;
    }
    // V2 Iteration 1: algorithm classification fields
    if (!exercise.exerciseCategory) {
      let cat: ExerciseCategoryLabel = "isolation";
      if (exercise.kind.includes("competition-lift")) {
        cat = "sbd";
      } else if (exercise.category === "bodyweight" && !exercise.kind.includes("compound")) {
        cat = "bodyweight";
      } else if (exercise.kind.includes("conditioning")) {
        cat = "conditioning";
      } else if (exercise.kind.includes("compound") || exercise.kind.includes("variation")) {
        cat = exercise.category === "machine" ? "machine_compound" : exercise.kind.includes("accessory") ? "secondary_compound" : "main_compound";
      }
      exercise.exerciseCategory = cat;
      changed = true;
    }
    if (exercise.isSBDMainLift === undefined) {
      exercise.isSBDMainLift = exercise.kind.includes("competition-lift") ||
        ["ex_squat_comp", "ex_bench_comp", "ex_deadlift_comp"].includes(exercise.id);
      changed = true;
    }
    if (!exercise.systemicFatigue) {
      const isSBD = exercise.isSBDMainLift;
      const isHeavyBarbell = exercise.category === "barbell" && exercise.kind.includes("compound");
      const isMachineCable = exercise.category === "machine" || exercise.category === "cable";
      const isIso = exercise.kind.includes("isolation");
      let sys: FatigueLevel = "moderate";
      if (isSBD) sys = "very_high";
      else if (isHeavyBarbell) sys = "high";
      else if (isMachineCable || exercise.category === "dumbbell") sys = "moderate";
      else if (isIso) sys = "low";
      exercise.systemicFatigue = sys;
      changed = true;
    }
    if (!exercise.localFatigue) {
      const isIso = exercise.kind.includes("isolation");
      const isCompound = exercise.kind.includes("compound") || exercise.kind.includes("competition-lift");
      let loc: FatigueLevel = "moderate";
      if (isIso) loc = "high";
      else if (isCompound && exercise.category === "barbell") loc = "high";
      else if (exercise.category === "machine" || exercise.category === "cable") loc = "moderate";
      exercise.localFatigue = loc;
      changed = true;
    }
    if (!exercise.repDropSensitivity) {
      const isIso = exercise.kind.includes("isolation");
      const isSBD = exercise.isSBDMainLift;
      let rds: FatigueLevel = "moderate";
      if (isIso || exercise.category === "cable" || exercise.category === "machine") rds = "high";
      else if (isSBD) rds = "low";
      exercise.repDropSensitivity = rds;
      changed = true;
    }
    if (!exercise.failureTolerance) {
      const isSBD = exercise.isSBDMainLift;
      const isBarbellCompound = exercise.category === "barbell" && exercise.kind.includes("compound");
      let ft: "low" | "moderate" | "high" = "moderate";
      if (isSBD) ft = "low";
      else if (isBarbellCompound) ft = "low";
      else if (exercise.category === "machine" || exercise.category === "cable" || exercise.category === "bodyweight") ft = "high";
      exercise.failureTolerance = ft;
      changed = true;
    }
    // V3.1C: copy rich metadata from built-in definition when missing from stored exercise
    const builtIn = builtInExercises.find((b) => b.id === exercise.id);
    if (builtIn) {
      if (!exercise.exerciseFamily && builtIn.exerciseFamily) { exercise.exerciseFamily = builtIn.exerciseFamily; changed = true; }
      if (!exercise.variationGroup && builtIn.variationGroup) { exercise.variationGroup = builtIn.variationGroup; changed = true; }
      if (!exercise.fatigueProfile && builtIn.fatigueProfile) { exercise.fatigueProfile = builtIn.fatigueProfile; changed = true; }
      // V3 Phase 1: patch axialFatigue onto stored fatigueProfile if missing
      if (exercise.fatigueProfile && builtIn.fatigueProfile && exercise.fatigueProfile.axialFatigue === undefined && builtIn.fatigueProfile.axialFatigue !== undefined) {
        exercise.fatigueProfile = { ...exercise.fatigueProfile, axialFatigue: builtIn.fatigueProfile.axialFatigue };
        changed = true;
      }
      if (!exercise.specificity && builtIn.specificity) { exercise.specificity = builtIn.specificity; changed = true; }
      if (!exercise.prescriptionProfile && builtIn.prescriptionProfile) { exercise.prescriptionProfile = builtIn.prescriptionProfile; changed = true; }
      if (!exercise.defaultRoleByGoal && builtIn.defaultRoleByGoal) { exercise.defaultRoleByGoal = builtIn.defaultRoleByGoal; changed = true; }
    }
  });
  next.splitTemplates.forEach((split) => {
    if (!split.favoriteUserIds) {
      split.favoriteUserIds = [];
      changed = true;
    }
    if (!split.createdAt) {
      split.createdAt = new Date().toISOString();
      changed = true;
    }
    if (!split.updatedAt) {
      split.updatedAt = split.createdAt;
      changed = true;
    }
    split.days.forEach((day) => {
      if (!day.notes) {
        day.notes = "";
        changed = true;
      }
      // V2 Iteration 1: auto-generate requirements from muscleGroups if missing
      if (!day.requirements || day.requirements.length === 0) {
        const muscles: MuscleGroup[] = day.muscleGroups.length ? day.muscleGroups : (day.targetMuscles || []);
        day.requirements = muscles.map((muscle, index) => ({
          id: createId("req"),
          targetMuscle: muscle,
          requiredExerciseCount: 1,
          priority: index + 1,
        }));
        changed = true;
      }
    });
  });
  next.programs.forEach((program) => {
    if (!program.buildMode) {
      program.buildMode = program.status === "draft" ? "manual" : "suggested";
      changed = true;
    }
    if (!program.changeLog) {
      program.changeLog = [];
      changed = true;
    }
    program.blocks.forEach((block) => {
      if (!block.priorityExerciseIds) {
        block.priorityExerciseIds = [];
        changed = true;
      }
      if (!block.splitLoopMode) {
        block.splitLoopMode = "continuous";
        changed = true;
      }
      if (!block.compoundSettings) {
        block.compoundSettings = structuredClone(defaultCompoundSettings);
        changed = true;
      }
      if (!block.completedWorkoutDayIds) {
        block.completedWorkoutDayIds = [];
        changed = true;
      }
      if (!block.skippedWorkoutDayIds) {
        block.skippedWorkoutDayIds = [];
        changed = true;
      }
      if (block.currentWeekIndex === undefined) {
        block.currentWeekIndex = Math.max(0, (block.currentWeek || 1) - 1);
        changed = true;
      }
      if (block.currentDayIndex === undefined) {
        block.currentDayIndex = 0;
        changed = true;
      }
      const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      block.weeks.forEach((week) => {
        week.workouts.forEach((workout, index) => {
          if (!workout.scheduledDay && index < dayNames.length) {
            workout.scheduledDay = dayNames[index];
            changed = true;
          }
          workout.exercises.forEach((planned) => {
            planned.plannedSets.forEach((set, setIndex) => {
              if (set.setNumber === undefined) {
                set.setNumber = setIndex + 1;
                changed = true;
              }
            });
          });
        });
      });
    });
  });
  next.sessions.forEach((session) => {
    if (!session.updatedAt) {
      session.updatedAt = session.completedAt || session.startedAt;
      changed = true;
    }
    if (session.status === "in-progress") {
      if (session.currentExerciseIndex === undefined) {
        session.currentExerciseIndex = 0;
        changed = true;
      }
      if (session.currentSetIndex === undefined) {
        session.currentSetIndex = 0;
        changed = true;
      }
    }
    session.loggedExercises.forEach((exerciseLog) => {
      exerciseLog.sets.forEach((set, index) => {
        if (set.setNumber === undefined) {
          set.setNumber = index + 1;
          changed = true;
        }
        // Migrate old string setRating ("Easy"/"Good"/"Hard"/"Failed") to numeric 1-5.
        const rawRating = set.setRating as unknown;
        if (typeof rawRating === "string") {
          const legacyMap: Record<string, 1 | 2 | 3 | 4 | 5> = { Easy: 5, Good: 3, Hard: 2, Failed: 1 };
          set.setRating = legacyMap[rawRating as string] ?? 3;
          changed = true;
        }
        if (set.performanceScore === undefined || !set.performanceStatus) {
          const performance = calculateSetPerformanceScore(undefined, set);
          set.performanceScore = performance.score;
          set.performanceStatus = performance.status;
          changed = true;
        }
      });
    });
    if (session.status === "completed" && session.workoutScore === undefined) {
      const score = calculateWorkoutScore(session);
      session.workoutScore = score.score;
      session.workoutScoreStatus = score.status;
      session.progressionSuggestions = session.progressionSuggestions || score.suggestions;
      changed = true;
    }
  });
  next.users.forEach((user) => {
    const activePrograms = next.programs.filter((program) => program.userId === user.id && program.status === "active");
    if (activePrograms.length > 1) {
      activePrograms.slice(1).forEach((program) => {
        program.status = "archived";
        program.blocks.forEach((block) => {
          block.status = "archived";
        });
      });
      changed = true;
    }
    const activeProgram = next.programs.find((program) => program.userId === user.id && program.status === "active");
    if (activeProgram && user.activeProgramId !== activeProgram.id) {
      user.activeProgramId = activeProgram.id;
      user.activeBlockId = activeProgram.blocks[0]?.id;
      changed = true;
    }
    activeProgram?.blocks.forEach((block) => {
      const before = JSON.stringify({
        currentWeek: block.currentWeek,
        currentWeekIndex: block.currentWeekIndex,
        currentDayIndex: block.currentDayIndex,
        activeWorkoutDayId: block.activeWorkoutDayId,
        nextWorkoutDayId: block.nextWorkoutDayId,
        completedWorkoutDayIds: block.completedWorkoutDayIds,
        skippedWorkoutDayIds: block.skippedWorkoutDayIds
      });
      syncActiveBlockProgress(block, next.sessions.filter((session) => session.userId === user.id && session.blockId === block.id));
      const after = JSON.stringify({
        currentWeek: block.currentWeek,
        currentWeekIndex: block.currentWeekIndex,
        currentDayIndex: block.currentDayIndex,
        activeWorkoutDayId: block.activeWorkoutDayId,
        nextWorkoutDayId: block.nextWorkoutDayId,
        completedWorkoutDayIds: block.completedWorkoutDayIds,
        skippedWorkoutDayIds: block.skippedWorkoutDayIds
      });
      if (before !== after) changed = true;
    });
  });
  if (!next.updatedAt) {
    next.updatedAt = nowIso();
    changed = true;
  }
  return changed ? next : data;
}

function prepareDatabaseForSave(
  data: TrainingDatabase,
  options?: { preserveUpdatedAt?: boolean }
): TrainingDatabase {
  const normalized = normalizeDatabase(structuredClone(data));
  if (!options?.preserveUpdatedAt || !normalized.updatedAt) {
    normalized.updatedAt = nowIso();
  }
  return normalized;
}

export async function saveDatabase(
  scope: DatabaseStorageScope,
  data: TrainingDatabase,
  options?: { preserveUpdatedAt?: boolean }
): Promise<TrainingDatabase> {
  const next = prepareDatabaseForSave(data, options);
  saveLocalBackup(scope, next);
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  await requestToPromise(store.put(next, getStorageKey(scope)));
  await transactionDone(transaction);
  db.close();
  return next;
}

export async function replaceDatabase(
  scope: DatabaseStorageScope,
  data: TrainingDatabase,
  options?: { preserveUpdatedAt?: boolean }
): Promise<TrainingDatabase> {
  return saveDatabase(scope, { ...data, version: 1 }, options);
}

export async function resetDatabase(scope: DatabaseStorageScope): Promise<TrainingDatabase> {
  const seeded = await seedDatabase();
  return saveDatabase(scope, seeded, { preserveUpdatedAt: true });
}
