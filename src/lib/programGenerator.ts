import { createId, nowIso, todayIso } from "./ids";
import {
  buildSplitSchedule,
  clonePlannedSetWithProgression,
  defaultCompoundSettings,
  exerciseAllowedByCompoundSettings,
  getExercisePrescription,
  isCompound,
  isHeavyCompound,
  isLowBackFatigueExercise,
  isSbdExercise
} from "./programmingLogic";
import { suggestPlannedWeight } from "./trainingMath";
import type {
  BlockType,
  CompoundSettings,
  Exercise,
  ID,
  MuscleGroup,
  PlannedExercise,
  Program,
  ProgramBuildMode,
  SplitDay,
  SplitDayRequirement,
  SplitLoopMode,
  TrainingDatabase,
  TrainingGoal,
  UserProfile,
  WorkoutDay
} from "../types/domain";

export interface ProgramRequest {
  name: string;
  goal: TrainingGoal;
  daysPerWeek: number;
  blockType: BlockType;
  blockLengthWeeks: number;
  priorityMuscles: MuscleGroup[];
  priorityExerciseIds: ID[];
  splitDays?: SplitDay[];
  splitTemplateId?: ID;
  splitLoopMode: SplitLoopMode;
  compoundSettings: CompoundSettings;
  buildMode: ProgramBuildMode;
  notes: string;
}

const goalDefaults: Record<TrainingGoal, string[]> = {
  powerlifting: ["ex_squat_comp", "ex_bench_comp", "ex_deadlift_comp", "ex_barbell_row", "ex_cable_triceps_pressdown"],
  bodybuilding: ["ex_db_incline_press", "ex_chest_supported_row", "ex_leg_press", "ex_lying_leg_curl", "ex_cable_lateral_raise", "ex_incline_curl"],
  powerbuilding: ["ex_squat_comp", "ex_bench_comp", "ex_deadlift_comp", "ex_db_incline_press", "ex_cable_lateral_raise", "ex_incline_curl"],
  "general-health": ["ex_leg_press", "ex_machine_chest_press", "ex_lat_pulldown", "ex_plank", "ex_treadmill_walk"],
  conditioning: ["ex_treadmill_walk", "ex_plank", "ex_leg_press", "ex_lat_pulldown"],
  maintenance: ["ex_squat_comp", "ex_bench_comp", "ex_rdl", "ex_lat_pulldown", "ex_plank"]
};

const parentMuscleChildren: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  back: ["lats", "upper-back", "mid-back", "traps", "spinal-erectors"],
  chest: ["upper-chest", "lower-chest"],
  quads: ["quads"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  biceps: ["biceps"],
  triceps: ["triceps"]
};

function exerciseFulfillsRequirement(exercise: Exercise, req: SplitDayRequirement): boolean {
  if (exercise.primaryMuscles.includes(req.targetMuscle)) return true;
  const children = parentMuscleChildren[req.targetMuscle] ?? [];
  return children.length > 0 && exercise.primaryMuscles.some((muscle) => children.includes(muscle));
}

interface SelectedExerciseSlot {
  exercise: Exercise;
  requirementId?: ID;
}

export function generateSplitFromText(params: {
  daysPerWeek: number;
  goal: TrainingGoal;
  text: string;
}): SplitDay[] {
  const text = params.text.toLowerCase();
  const days: SplitDay[] = [];
  const benchFrequency = /bench\s*(\d)x|bench\s*(\d)\s*times/.exec(text)?.[1] || (/bench/.test(text) ? "2" : "0");
  const squatFocus = text.includes("squat");
  const backTwice = text.includes("back twice") || text.includes("back 2");
  const armsTwice = text.includes("arms twice") || text.includes("arms 2");
  const hamTwice = text.includes("hamstrings twice") || text.includes("hamstrings 2");

  for (let index = 0; index < params.daysPerWeek; index += 1) {
    const id = createId("splitday");
    const isLower = index % 2 === 1;
    const benchDay = Number(benchFrequency) > index / 2;
    const muscleGroups: MuscleGroup[] = isLower ? ["quads", "hamstrings", "glutes"] : ["chest", "back", "lats"];
    if (backTwice && !muscleGroups.includes("back")) muscleGroups.push("back");
    if (armsTwice && !isLower) muscleGroups.push("biceps", "triceps");
    if (hamTwice && isLower && !muscleGroups.includes("hamstrings")) muscleGroups.push("hamstrings");
    days.push({
      id,
      name:
        squatFocus && index === 0
          ? "Squat Focus"
          : benchDay
            ? `Bench ${index + 1}`
            : isLower
              ? `Lower ${Math.ceil((index + 1) / 2)}`
              : `Upper ${Math.ceil((index + 1) / 2)}`,
      focus: params.goal === "general-health" ? "hybrid" : index < 2 ? "strength" : "hypertrophy",
      mainLiftFocus: squatFocus && index === 0 ? "Squat" : benchDay ? "Bench" : isLower ? "Deadlift/RDL" : undefined,
      muscleGroups,
      movementPatterns: isLower ? ["squat", "hinge", "isolation"] : ["horizontal-press", "horizontal-pull", "vertical-pull", "isolation"],
      exerciseTargetCount: params.goal === "general-health" ? 4 : 5,
      priorityMuscles: muscleGroups.slice(0, 2),
      priorityLifts: [squatFocus && index === 0 ? "squat" : "", benchDay ? "bench" : ""].filter(Boolean),
      weeklySetTargets: Object.fromEntries(muscleGroups.map((muscle) => [muscle, params.goal === "bodybuilding" ? 8 : 5]))
    });
  }
  return days;
}

function chooseExercisesForDay(
  dayIndex: number,
  request: ProgramRequest,
  exercises: Exercise[],
  weeklyCounts: { heavy: number; lowBack: number },
  splitDay?: SplitDay
): SelectedExerciseSlot[] {
  const defaults = goalDefaults[request.goal];
  const compoundSettings = request.compoundSettings || defaultCompoundSettings;
  const selectedLifts = request.priorityExerciseIds
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .filter((exercise) => exerciseAllowedByCompoundSettings(exercise, compoundSettings));
  const prioritized = exercises.filter(
    (exercise) =>
      exerciseAllowedByCompoundSettings(exercise, compoundSettings) &&
      (request.priorityMuscles.some((muscle) => exercise.directVolumeMuscles.includes(muscle)) ||
        splitDay?.movementPatterns.includes(exercise.movementPattern) ||
        splitDay?.muscleGroups.some((muscle) => exercise.directVolumeMuscles.includes(muscle)))
  );
  const base = [...selectedLifts, ...prioritized, ...defaults.map((id) => exercises.find((exercise) => exercise.id === id)).filter(Boolean) as Exercise[]];
  const unique = [...new Map(base.map((exercise) => [exercise.id, exercise])).values()];
  const lower = unique.filter((exercise) => ["squat", "hinge", "single-leg"].includes(exercise.movementPattern));
  const upper = unique.filter((exercise) => !["squat", "hinge", "single-leg"].includes(exercise.movementPattern));
  const explicitPool = splitDay
    ? unique.filter(
        (exercise) =>
          (splitDay.movementPatterns.includes(exercise.movementPattern) && exercise.movementPattern !== "isolation") ||
          splitDay.muscleGroups.some((muscle) => exercise.directVolumeMuscles.includes(muscle))
      )
    : [];
  const pool = explicitPool.length ? explicitPool : request.goal === "general-health" ? unique : dayIndex % 2 === 0 ? upper : lower;
  const priorityForThisDay = selectedLifts.filter((exercise) => {
    if (splitDay) {
      if (splitDay.mainLiftFocus && exercise.name.toLowerCase().includes(splitDay.mainLiftFocus.toLowerCase())) return true;
      return (splitDay.movementPatterns.includes(exercise.movementPattern) && exercise.movementPattern !== "isolation") || splitDay.muscleGroups.some((muscle) => exercise.directVolumeMuscles.includes(muscle));
    }
    if (dayIndex === 0 && exercise.movementPattern === "squat") return true;
    if (dayIndex === 1 && exercise.movementPattern === "hinge") return true;
    if (dayIndex <= 2 && exercise.name.toLowerCase().includes("bench")) return true;
    return false;
  });
  const ordered = [...priorityForThisDay, ...pool].filter((exercise) => exerciseAllowedByCompoundSettings(exercise, compoundSettings));
  const uniqueOrdered = [...new Map(ordered.map((item) => [item.id, item])).values()];
  const result: SelectedExerciseSlot[] = [];
  const usedIds = new Set<ID>();
  let compounds = 0;

  function canUseExercise(exercise: Exercise): boolean {
    const sbd = isSbdExercise(exercise);
    const heavy = isHeavyCompound(exercise);
    const lowBack = isLowBackFatigueExercise(exercise);
    if (usedIds.has(exercise.id)) return false;
    if (sbd && compounds >= compoundSettings.maxCompoundsPerWorkout) return false;
    if (sbd && heavy && weeklyCounts.heavy >= compoundSettings.maxHeavyCompoundsPerWeek) return false;
    if (lowBack && weeklyCounts.lowBack >= compoundSettings.maxLowBackFatigueMovementsPerWeek) return false;
    return true;
  }

  function addExercise(exercise: Exercise, requirementId?: ID): void {
    const compound = isCompound(exercise);
    const sbd = isSbdExercise(exercise);
    const heavy = isHeavyCompound(exercise);
    const lowBack = isLowBackFatigueExercise(exercise);
    result.push({ exercise, requirementId });
    usedIds.add(exercise.id);
    if (sbd && compound) compounds += 1;
    if (sbd && heavy) weeklyCounts.heavy += 1;
    if (lowBack) weeklyCounts.lowBack += 1;
  }

  if (splitDay?.requirements?.length) {
    for (const req of [...splitDay.requirements].sort((a, b) => a.priority - b.priority)) {
      for (let slot = 0; slot < req.requiredExerciseCount; slot += 1) {
        const strictPick = uniqueOrdered.find(
          (exercise) =>
            canUseExercise(exercise) &&
            exerciseFulfillsRequirement(exercise, req) &&
            (!req.movementPattern || exercise.movementPattern === req.movementPattern || exercise.movementPatterns?.includes(req.movementPattern))
        );
        const relaxedPick = strictPick ?? uniqueOrdered.find(
          (exercise) =>
            canUseExercise(exercise) &&
            exerciseFulfillsRequirement(exercise, req) &&
            (!req.movementPattern || exercise.movementPattern === req.movementPattern || exercise.movementPatterns?.includes(req.movementPattern))
        );
        if (relaxedPick) addExercise(relaxedPick, req.id);
      }
    }
    return result;
  }

  for (const exercise of uniqueOrdered) {
    if (!canUseExercise(exercise)) continue;
    addExercise(exercise);
    if (result.length >= (request.goal === "general-health" ? 4 : 6)) break;
  }
  return result;
}

function plannedExerciseFor(exercise: Exercise, order: number, user: UserProfile, db: TrainingDatabase, request: ProgramRequest, weekNumber = 1, requirementId?: ID): PlannedExercise {
  const isPriorityLift = request.priorityExerciseIds.includes(exercise.id);
  const prescription = getExercisePrescription({ exercise, goal: request.goal, blockType: request.blockType, order, isPriority: isPriorityLift });
  const plannedSet = { id: createId("pset"), kind: "working" as const, setNumber: 1, targetReps: prescription.reps, repRange: { min: Math.max(1, prescription.reps - 2), max: prescription.reps + 2 }, targetRpe: prescription.rpe, targetRir: Math.max(0, Math.round(10 - prescription.rpe)) };
  const suggested = suggestPlannedWeight({ user, exercise, plannedSet, db, gymId: user.activeGymId });
  return {
    id: createId("planned"),
    exerciseId: exercise.id,
    required: prescription.required,
    order,
    restSeconds: prescription.restSeconds,
    substitutionIds: exercise.substitutionIds,
    fulfillsRequirementId: requirementId,
    notes: `${isPriorityLift ? "Priority lift. " : ""}${prescription.note} ${suggested.explanation}`,
    plannedSets: Array.from({ length: prescription.sets }, (_, index) => clonePlannedSetWithProgression({
      ...plannedSet,
      id: createId("pset"),
      setNumber: index + 1,
      plannedWeight: suggested.weight || undefined,
      kind: index === 0 && prescription.required ? "top" : "working"
    }, weekNumber, request.blockLengthWeeks))
  };
}

export function generateProgram(user: UserProfile, db: TrainingDatabase, request: ProgramRequest): Program {
  const startDate = todayIso();
  const splitLoopMode = request.splitLoopMode || "continuous";
  const compoundSettings = request.compoundSettings || defaultCompoundSettings;
  const splitDays = request.splitDays?.length ? request.splitDays : generateSplitFromText({ daysPerWeek: request.daysPerWeek, goal: request.goal, text: request.notes });
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const weeks = Array.from({ length: request.blockLengthWeeks }, (_, weekIndex) => {
    const scheduledSplit = buildSplitSchedule(splitDays, request.daysPerWeek, weekIndex, splitLoopMode);
    const weeklyCounts = { heavy: 0, lowBack: 0 };
    const workouts: WorkoutDay[] = Array.from({ length: request.daysPerWeek }, (_, dayIndex) => {
      const splitDay = scheduledSplit[dayIndex] || splitDays[dayIndex % splitDays.length];
      const dayExercises = request.buildMode === "manual" ? [] : chooseExercisesForDay(dayIndex, { ...request, compoundSettings }, db.exercises, weeklyCounts, splitDay);
      const focus = weekIndex === request.blockLengthWeeks - 1 && request.blockType !== "peaking" ? "recovery" : splitDay?.focus || (dayIndex < 2 ? "strength" : "hypertrophy");
      return {
        id: createId("workoutday"),
        weekNumber: weekIndex + 1,
        dayIndex: dayIndex + 1,
        splitDayId: splitDay?.id,
        name: splitDay?.name || (dayIndex % 2 === 0 ? `Upper/Skill Day ${dayIndex + 1}` : `Lower/Strength Day ${dayIndex + 1}`),
        scheduledDay: dayNames[dayIndex],
        focus,
        targetMuscles: splitDay?.muscleGroups || [],
        movementPatterns: splitDay?.movementPatterns || [],
        status: "planned",
        exercises: dayExercises.map((item, order) => plannedExerciseFor(item.exercise, order + 1, user, db, request, weekIndex + 1, item.requirementId)),
        notes: splitDay?.notes || request.notes
      };
    });
    return {
      id: createId("week"),
      weekNumber: weekIndex + 1,
      startDate: new Date(Date.now() + weekIndex * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      workouts,
      plannedVolume: Object.fromEntries(request.priorityMuscles.map((muscle) => [muscle, 8 + weekIndex]))
    };
  });

  return {
    id: createId("program"),
    userId: user.id,
    name: request.name || `${request.goal} ${request.blockType} block`,
    goal: request.goal,
    splitTemplateId: request.splitTemplateId,
    status: request.buildMode === "suggested" ? "draft" : "draft",
    buildMode: request.buildMode,
    changeLog: [
      {
        id: createId("change"),
        at: nowIso(),
        label: request.buildMode === "manual" ? "Created manual block draft" : "Suggested full block draft",
        detail: `Created ${request.blockLengthWeeks} weeks with ${request.daysPerWeek} training days per week using ${splitLoopMode} split looping and compound rules.`
      }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    progressionRules: [
      "If actual RPE is 2+ above target, reduce next set by 2.5-7.5%.",
      "If planned reps are missed, reduce the next set by 5-10%.",
      "If form is poor, hold or reduce load even if reps are completed.",
      "If readiness is low, reduce top set RPE by 0.5-1 and remove one optional accessory set.",
      "For bodybuilding accessories, poor muscle feel triggers cue or substitution suggestions."
    ],
    deloadRules: [
      "Deload when multiple weeks show performance decline or failed sets accumulate.",
      "Reduce volume 30-50% and cap main lifts around RPE 6-7.",
      "Keep movement practice but remove optional failure-oriented accessory work."
    ],
    blocks: [
      {
        id: createId("block"),
        name: `${request.blockType} block`,
        splitTemplateId: request.splitTemplateId,
        blockType: request.blockType,
        goal: request.goal,
        numberOfWeeks: request.blockLengthWeeks,
        status: "draft",
        loopMode: splitLoopMode,
        type: request.blockType,
        lengthWeeks: request.blockLengthWeeks,
        trainingDaysPerWeek: request.daysPerWeek,
        currentWeek: 1,
        currentWeekIndex: 0,
        currentDayIndex: 0,
        currentWorkoutPointer: { weekIndex: 0, dayIndex: 0, workoutDayId: weeks[0]?.workouts[0]?.id },
        completedWorkoutDayIds: [],
        skippedWorkoutDayIds: [],
        activeWorkoutDayId: weeks[0]?.workouts[0]?.id,
        nextWorkoutDayId: weeks[0]?.workouts[1]?.id || weeks[1]?.workouts[0]?.id,
        startDate,
        splitLoopMode,
        compoundSettings,
        targetRpeProgression: Array.from({ length: request.blockLengthWeeks }, (_, index) => Math.min(9, 6.5 + index * 0.5)),
        volumeProgression: Array.from({ length: request.blockLengthWeeks }, (_, index) => (index === request.blockLengthWeeks - 1 ? 0.65 : 1 + index * 0.06)),
        deloadFrequencyWeeks: request.blockLengthWeeks >= 6 ? 4 : undefined,
        mainLiftFrequency: Object.fromEntries(request.priorityExerciseIds.map((id) => {
          const exercise = db.exercises.find((item) => item.id === id);
          return [exercise?.name || id, exercise?.name.toLowerCase().includes("bench") ? 3 : 1];
        })),
        priorityLifts: request.priorityExerciseIds.map((id) => db.exercises.find((exercise) => exercise.id === id)?.name || id),
        priorityExerciseIds: request.priorityExerciseIds,
        priorityMuscles: request.priorityMuscles,
        targetWeeklySets: Object.fromEntries(request.priorityMuscles.map((muscle) => [muscle, request.goal === "bodybuilding" ? 12 : 8])),
        emphasis: [request.goal],
        weeks
      }
    ]
  };
}
