import { builtInExercises, seedDatabase } from "../data/seedData";
import { syncActiveBlockProgress } from "./blockProgression";
import { defaultCompoundSettings } from "./programmingLogic";
import { calculateSetPerformanceScore, calculateWorkoutScore } from "./trainingMath";
import type { ExerciseCategoryLabel, FatigueLevel, MuscleGroup, TrainingDatabase } from "../types/domain";
import { createId } from "./ids";

const DB_NAME = "iron-orbit-training-db";
const DB_VERSION = 1;
const STORE = "documents";
const KEY = "training-database";
const LOCAL_BACKUP_KEY = "iron-orbit-training-database-backup";

function loadLocalBackup(): TrainingDatabase | undefined {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
    return raw ? JSON.parse(raw) as TrainingDatabase : undefined;
  } catch {
    return undefined;
  }
}

function saveLocalBackup(data: TrainingDatabase): void {
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(data));
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

export async function loadDatabase(): Promise<TrainingDatabase> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readonly");
  const store = transaction.objectStore(STORE);
  const existing = await requestToPromise<TrainingDatabase | undefined>(store.get(KEY));
  db.close();

  const backup = loadLocalBackup();
  const source = backup || existing;
  if (source) {
    const normalized = normalizeDatabase(source);
    if (normalized !== existing) await saveDatabase(normalized);
    return normalized;
  }
  const seeded = await seedDatabase();
  await saveDatabase(seeded);
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
  return changed ? next : data;
}

export async function saveDatabase(data: TrainingDatabase): Promise<void> {
  saveLocalBackup(data);
  const db = await openDatabase();
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  await requestToPromise(store.put(data, KEY));
  await transactionDone(transaction);
  db.close();
}

export async function replaceDatabase(data: TrainingDatabase): Promise<void> {
  await saveDatabase({ ...data, version: 1 });
}

export async function resetDatabase(): Promise<TrainingDatabase> {
  const seeded = await seedDatabase();
  await saveDatabase(seeded);
  return seeded;
}
