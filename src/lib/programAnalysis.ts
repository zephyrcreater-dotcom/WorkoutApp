import { createId } from "./ids";
import {
  defaultCompoundSettings,
  exerciseAllowedByCompoundSettings,
  isCompound,
  isHeavyCompound,
  isLowBackFatigueExercise,
  isSbdExercise,
  muscleVolumeTargets
} from "./programmingLogic";
import type { Exercise, MuscleGroup, MovementPattern, Program, ProgramGap, TrainingDatabase, WorkoutDay } from "../types/domain";

export interface HypertrophyDashboardData {
  weeklyVolume: Partial<Record<MuscleGroup, number>>;
  frequency: Partial<Record<MuscleGroup, number>>;
  exerciseDistribution: { muscle: MuscleGroup; exercises: string[] }[];
  underTarget: { muscle: MuscleGroup; sets: number; target: number }[];
  overTarget: { muscle: MuscleGroup; sets: number; target: number }[];
  fatigueWarnings: string[];
  suggestedAdjustments: string[];
  blockGoal: string;
}

const highFatiguePatterns = new Set<MovementPattern>(["squat", "hinge"]);

function activeWeek(program?: Program) {
  const block = program?.blocks[0];
  return block?.weeks.find((week) => week.weekNumber === block.currentWeek) || block?.weeks[0];
}

function exerciseFor(db: TrainingDatabase, exerciseId: string): Exercise | undefined {
  return db.exercises.find((exercise) => exercise.id === exerciseId);
}

export function estimateWorkoutDuration(day: WorkoutDay): number {
  const setCount = day.exercises.reduce((sum, item) => sum + item.plannedSets.length, 0);
  const restSeconds = day.exercises.reduce((sum, item) => sum + item.plannedSets.length * item.restSeconds, 0);
  return Math.max(20, Math.round((setCount * 75 + restSeconds) / 60));
}

export function summarizePlannedVolume(program: Program | undefined, db: TrainingDatabase): Partial<Record<MuscleGroup, number>> {
  const totals: Partial<Record<MuscleGroup, number>> = {};
  activeWeek(program)?.workouts.forEach((day) => {
    day.exercises.forEach((planned) => {
      const exercise = exerciseFor(db, planned.exerciseId);
      if (!exercise) return;
      const hardSets = planned.plannedSets.filter((set) => set.kind !== "warmup").length;
      exercise.directVolumeMuscles.forEach((muscle) => {
        totals[muscle] = (totals[muscle] || 0) + hardSets;
      });
      exercise.indirectVolumeMuscles.forEach((muscle) => {
        totals[muscle] = (totals[muscle] || 0) + hardSets * 0.5;
      });
    });
  });
  return totals;
}

export function summarizePlannedFrequency(program: Program | undefined, db: TrainingDatabase): Partial<Record<MuscleGroup, number>> {
  const frequency: Partial<Record<MuscleGroup, number>> = {};
  activeWeek(program)?.workouts.forEach((day) => {
    const muscles = new Set<MuscleGroup>();
    day.exercises.forEach((planned) => {
      const exercise = exerciseFor(db, planned.exerciseId);
      exercise?.directVolumeMuscles.forEach((muscle) => muscles.add(muscle));
    });
    muscles.forEach((muscle) => {
      frequency[muscle] = (frequency[muscle] || 0) + 1;
    });
  });
  return frequency;
}

function suggestedExercise(db: TrainingDatabase, muscle: MuscleGroup, pattern?: MovementPattern, program?: Program): Exercise | undefined {
  const settings = program?.blocks[0]?.compoundSettings || defaultCompoundSettings;
  return db.exercises.find(
    (exercise) =>
      exercise.directVolumeMuscles.includes(muscle) &&
      (!pattern || exercise.movementPattern === pattern) &&
      exerciseAllowedByCompoundSettings(exercise, settings) &&
      !exercise.kind.includes("conditioning")
  );
}

export function analyzeProgramGaps(program: Program | undefined, db: TrainingDatabase): ProgramGap[] {
  if (!program) return [];
  const week = activeWeek(program);
  if (!week) return [];
  const gaps: ProgramGap[] = [];
  const volume = summarizePlannedVolume(program, db);
  const settings = program.blocks[0]?.compoundSettings || defaultCompoundSettings;
  const targets = muscleVolumeTargets[program.goal] || muscleVolumeTargets.powerbuilding;
  const patternCounts: Partial<Record<MovementPattern, number>> = {};
  let pressingSets = 0;
  let pullingSets = 0;
  let lowerFatigueSets = 0;
  let compoundCount = 0;
  let heavyCompoundCount = 0;
  let lowBackFatigueMovements = 0;
  const sameDayFatigue: { day: WorkoutDay; sets: number }[] = [];
  const restrictedSbd = new Map<string, { exercise: Exercise; days: Set<string>; placements: number }>();

  week.workouts.forEach((day) => {
    let dayLowerFatigue = 0;
    day.exercises.forEach((planned) => {
      const exercise = exerciseFor(db, planned.exerciseId);
      if (!exercise) return;
      const sets = planned.plannedSets.length;
      patternCounts[exercise.movementPattern] = (patternCounts[exercise.movementPattern] || 0) + 1;
      if (exercise.movementPattern.includes("press")) pressingSets += sets;
      if (exercise.movementPattern.includes("pull")) pullingSets += sets;
      if (highFatiguePatterns.has(exercise.movementPattern)) {
        lowerFatigueSets += sets;
        dayLowerFatigue += sets;
      }
      if (isCompound(exercise)) compoundCount += 1;
      if (isHeavyCompound(exercise)) heavyCompoundCount += 1;
      if (isLowBackFatigueExercise(exercise)) lowBackFatigueMovements += 1;
      if (isSbdExercise(exercise) && !exerciseAllowedByCompoundSettings(exercise, settings)) {
        const existing = restrictedSbd.get(exercise.id) || { exercise, days: new Set<string>(), placements: 0 };
        existing.days.add(day.name);
        existing.placements += 1;
        restrictedSbd.set(exercise.id, existing);
      }
    });
    sameDayFatigue.push({ day, sets: dayLowerFatigue });
  });

  if (restrictedSbd.size) {
    const details = [...restrictedSbd.values()].map((item) => `${item.exercise.name}: ${item.placements} placement${item.placements === 1 ? "" : "s"} (${[...item.days].join(", ")})`);
    gaps.push({
      id: createId("gap"),
      type: "fatigue",
      issue: "SBD rule conflict",
      whyItMatters: `The active week contains restricted main lifts: ${details.join("; ")}. These rules are meant to manage fatigue, joint stress, or exercise selection.`,
      severity: "high",
      suggestedFix: "Review restricted lifts, replace them, or turn off the restriction if these lifts are intentional.",
      relatedMuscles: [...new Set([...restrictedSbd.values()].flatMap((item) => item.exercise.directVolumeMuscles))],
      relatedExerciseIds: [...restrictedSbd.keys()],
      action: { kind: "swap-exercise" }
    });
  }

  Object.entries(targets).forEach(([muscleName, target]) => {
    const muscle = muscleName as MuscleGroup;
    const sets = volume[muscle] || 0;
    if (sets < target.min) {
      const fix = suggestedExercise(db, muscle, undefined, program);
      gaps.push({
        id: createId("gap"),
        type: "volume",
        issue: `${muscle} volume is too low`,
        whyItMatters: `The active week has ${sets.toFixed(1)} planned sets, below the useful floor of about ${target.min} for this goal.`,
        severity: sets === 0 ? "high" : "medium",
        suggestedFix: fix ? `Add 2-4 sets of ${fix.name} to a compatible day.` : `Add 2-4 direct sets for ${muscle}.`,
        relatedMuscles: [muscle],
        relatedExerciseIds: fix ? [fix.id] : [],
        action: fix ? { kind: "add-exercise", dayId: week.workouts[0]?.id, exerciseId: fix.id } : undefined
      });
    } else if (sets > target.max) {
      gaps.push({
        id: createId("gap"),
        type: "volume",
        issue: `${muscle} volume may be too high`,
        whyItMatters: `${sets.toFixed(1)} planned weekly sets can outpace recovery unless this is a short specialization phase.`,
        severity: "medium",
        suggestedFix: `Remove 2-4 optional ${muscle} sets or spread them across the block.`,
        relatedMuscles: [muscle],
        relatedExerciseIds: [],
        action: { kind: "reduce-volume" }
      });
    }
  });

  if ((volume.hamstrings || 0) < 3) {
    const fix = suggestedExercise(db, "hamstrings", "isolation", program) || suggestedExercise(db, "hamstrings", "hinge", program);
    gaps.push({
      id: createId("gap"),
      type: "missing-category",
      issue: "No direct hamstring work this week",
      whyItMatters: "Squats and leg presses do not reliably cover knee-flexion hamstring work for hypertrophy or knee balance.",
      severity: "high",
      suggestedFix: fix ? `Add ${fix.name} for 2-3 sets.` : "Add a leg curl or RDL variation.",
      relatedMuscles: ["hamstrings"],
      relatedExerciseIds: fix ? [fix.id] : [],
      action: fix ? { kind: "add-exercise", dayId: week.workouts.find((day) => day.focus !== "recovery")?.id, exerciseId: fix.id } : undefined
    });
  }

  if ((volume["rear-delts"] || 0) < 4) {
    const fix = suggestedExercise(db, "rear-delts", undefined, program);
    gaps.push({
      id: createId("gap"),
      type: "volume",
      issue: "Rear delts are undertrained",
      whyItMatters: "Rear delt and upper-back work helps shoulder balance when pressing volume is high.",
      severity: "medium",
      suggestedFix: fix ? `Add ${fix.name} or another rear-delt row/reverse fly.` : "Add a rear-delt isolation or upper-back row.",
      relatedMuscles: ["rear-delts", "upper-back"],
      relatedExerciseIds: fix ? [fix.id] : [],
      action: fix ? { kind: "add-exercise", dayId: week.workouts[0]?.id, exerciseId: fix.id } : undefined
    });
  }

  if (pressingSets > pullingSets * 1.35) {
    const fix = suggestedExercise(db, "upper-back", "horizontal-pull", program) || suggestedExercise(db, "lats", "vertical-pull", program);
    gaps.push({
      id: createId("gap"),
      type: "balance",
      issue: "Too much pressing compared to pulling",
      whyItMatters: `The week has ${pressingSets} pressing sets and ${pullingSets} pulling sets. More pulling usually improves shoulder tolerance and pressing progress.`,
      severity: pressingSets > pullingSets * 1.8 ? "high" : "medium",
      suggestedFix: fix ? `Add ${fix.name} or swap one optional press for a pull.` : "Add horizontal or vertical pulling volume.",
      relatedMuscles: ["upper-back", "lats", "rear-delts"],
      relatedExerciseIds: fix ? [fix.id] : [],
      action: fix ? { kind: "add-exercise", dayId: week.workouts[0]?.id, exerciseId: fix.id } : undefined
    });
  }

  if (compoundCount > week.workouts.length * settings.maxCompoundsPerWorkout) {
    gaps.push({
      id: createId("gap"),
      type: "fatigue",
      issue: "Too many compound lifts for the block settings",
      whyItMatters: `${compoundCount} compound lift slots exceed the current per-workout compound limit and can crowd out targeted accessory work.`,
      severity: "medium",
      suggestedFix: "Swap one or two compound accessories for isolation, cable, machine, or bodyweight work.",
      relatedMuscles: [],
      relatedExerciseIds: [],
      action: { kind: "reduce-volume" }
    });
  }

  if (heavyCompoundCount > settings.maxHeavyCompoundsPerWeek) {
    gaps.push({
      id: createId("gap"),
      type: "fatigue",
      issue: "Too many heavy compounds this week",
      whyItMatters: `${heavyCompoundCount} heavy compound placements exceeds the weekly cap of ${settings.maxHeavyCompoundsPerWeek}. This can interfere with recovery and progression.`,
      severity: "high",
      suggestedFix: "Reduce heavy barbell exposure or use lower-fatigue machine/cable variations.",
      relatedMuscles: [],
      relatedExerciseIds: [],
      action: { kind: "reduce-volume" }
    });
  }

  if (lowBackFatigueMovements > settings.maxLowBackFatigueMovementsPerWeek) {
    gaps.push({
      id: createId("gap"),
      type: "fatigue",
      issue: "Too many low-back-fatigue movements",
      whyItMatters: `${lowBackFatigueMovements} squat/hinge/carry placements exceed the weekly cap of ${settings.maxLowBackFatigueMovementsPerWeek}. Low-back fatigue often limits later lower-body and pulling work.`,
      severity: "high",
      suggestedFix: "Move one hinge away from squat days, or replace it with leg curls, leg press, chest-supported rows, or machine work.",
      relatedMuscles: ["hamstrings", "glutes", "back", "abs"],
      relatedExerciseIds: [],
      action: { kind: "move-exercise" }
    });
  }

  if ((patternCounts.squat || 0) <= 1 && program.goal !== "general-health") {
    gaps.push({
      id: createId("gap"),
      type: "movement-pattern",
      issue: "Squat pattern appears only once this block week",
      whyItMatters: "Low squat-pattern exposure can limit skill practice and quad volume in strength or powerbuilding blocks.",
      severity: "low",
      suggestedFix: "Add a lighter squat variation, leg press, or split squat on a second day.",
      relatedMuscles: ["quads", "glutes"],
      relatedExerciseIds: ["ex_front_squat", "ex_leg_press"],
      action: { kind: "add-exercise", dayId: week.workouts[1]?.id, exerciseId: "ex_leg_press" }
    });
  }

  sameDayFatigue.forEach(({ day, sets }) => {
    if (sets >= 10) {
      gaps.push({
        id: createId("gap"),
        type: "fatigue",
        issue: `High-fatigue lower body cluster on ${day.name}`,
        whyItMatters: `${sets} hard squat/hinge sets in one day can bury performance and make later accessories low quality.`,
        severity: sets >= 13 ? "high" : "medium",
        suggestedFix: "Move one hinge or squat accessory to another day, or reduce one movement by 1-2 sets.",
        relatedMuscles: ["quads", "hamstrings", "glutes"],
        relatedExerciseIds: [],
        action: { kind: "move-exercise", dayId: day.id }
      });
    }
  });

  if (lowerFatigueSets === 0 && program.goal !== "conditioning") {
    gaps.push({
      id: createId("gap"),
      type: "missing-category",
      issue: "Lack of low back and posterior-chain exercises",
      whyItMatters: "Some hinge or bracing work is useful for general resilience and strength transfer.",
      severity: "medium",
      suggestedFix: "Add RDLs, back extensions, hip hinges, carries, or bracing work.",
      relatedMuscles: ["hamstrings", "glutes", "back", "abs"],
      relatedExerciseIds: ["ex_rdl", "ex_deadlift_comp"],
      action: { kind: "add-exercise", dayId: week.workouts[0]?.id, exerciseId: "ex_rdl" }
    });
  }

  const unique = new Map<string, ProgramGap>();
  gaps.forEach((gap) => {
    const key = `${gap.type}:${gap.issue}:${gap.relatedMuscles.join(",")}`;
    if (!unique.has(key) || severityRank(gap.severity) > severityRank(unique.get(key)!.severity)) unique.set(key, gap);
  });
  return [...unique.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || categoryRank(a.type) - categoryRank(b.type));
}

function categoryRank(type: ProgramGap["type"]): number {
  if (type === "fatigue") return 0;
  if (type === "volume" || type === "missing-category") return 1;
  if (type === "balance" || type === "movement-pattern") return 2;
  if (type === "frequency") return 3;
  return 4;
}

export function buildHypertrophyDashboard(program: Program | undefined, db: TrainingDatabase): HypertrophyDashboardData {
  const weeklyVolume = summarizePlannedVolume(program, db);
  const frequency = summarizePlannedFrequency(program, db);
  const targets = muscleVolumeTargets[program?.goal || "powerbuilding"] || muscleVolumeTargets.powerbuilding;
  const underTarget = Object.entries(targets)
    .map(([muscle, target]) => ({ muscle: muscle as MuscleGroup, sets: weeklyVolume[muscle as MuscleGroup] || 0, target: target.min }))
    .filter((item) => item.sets < item.target);
  const overTarget = Object.entries(targets)
    .map(([muscle, target]) => ({ muscle: muscle as MuscleGroup, sets: weeklyVolume[muscle as MuscleGroup] || 0, target: target.max }))
    .filter((item) => item.sets > item.target);
  const week = activeWeek(program);
  const distribution = new Map<MuscleGroup, Set<string>>();
  week?.workouts.forEach((day) => {
    day.exercises.forEach((planned) => {
      const exercise = exerciseFor(db, planned.exerciseId);
      exercise?.directVolumeMuscles.forEach((muscle) => {
        if (!distribution.has(muscle)) distribution.set(muscle, new Set());
        distribution.get(muscle)?.add(exercise.name);
      });
    });
  });

  const gaps = analyzeProgramGaps(program, db);
  return {
    weeklyVolume,
    frequency,
    exerciseDistribution: [...distribution.entries()].map(([muscle, exercises]) => ({ muscle, exercises: [...exercises] })),
    underTarget,
    overTarget,
    fatigueWarnings: gaps.filter((gap) => gap.type === "fatigue").map((gap) => gap.issue),
    suggestedAdjustments: gaps.slice(0, 4).map((gap) => gap.suggestedFix),
    blockGoal: program?.blocks[0]?.type ? `${program.goal} - ${program.blocks[0].type}` : "No active block"
  };
}

function severityRank(severity: ProgramGap["severity"]): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}
