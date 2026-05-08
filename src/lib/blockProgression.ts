import type { Program, TrainingBlock, TrainingDatabase, TrainingWeek, WorkoutDay, WorkoutSession } from "../types/domain";

export interface BlockWorkoutCursor {
  program: Program;
  block: TrainingBlock;
  week: TrainingWeek;
  day: WorkoutDay;
  weekIndex: number;
  dayIndex: number;
  label: string;
  isRestDay: boolean;
}

interface SequenceEntry {
  week: TrainingWeek;
  day: WorkoutDay;
  weekIndex: number;
  dayIndex: number;
}

function workoutSequence(block: TrainingBlock): SequenceEntry[] {
  return block.weeks.flatMap((week, weekIndex) =>
    week.workouts.map((day, dayIndex) => ({ week, day, weekIndex, dayIndex }))
  );
}

function completedIdsFromSessions(sessions: WorkoutSession[]): string[] {
  return sessions
    .filter((session) => session.status === "completed" && session.workoutDayId)
    .map((session) => session.workoutDayId as string);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isDone(entry: SequenceEntry, completedIds: Set<string>, skippedIds: Set<string>): boolean {
  return completedIds.has(entry.day.id) || skippedIds.has(entry.day.id) || entry.day.status === "completed" || entry.day.status === "skipped";
}

function applyCursor(block: TrainingBlock, entry?: SequenceEntry, completedIds: string[] = [], skippedIds: string[] = []): void {
  block.completedWorkoutDayIds = unique(completedIds);
  block.skippedWorkoutDayIds = unique(skippedIds);
  block.activeWorkoutDayId = entry?.day.id;
  block.currentWorkoutPointer = entry
    ? { weekIndex: entry.weekIndex, dayIndex: entry.dayIndex, workoutDayId: entry.day.id }
    : undefined;
  block.currentWeekIndex = entry?.weekIndex ?? Math.max(0, (block.currentWeek || 1) - 1);
  block.currentDayIndex = entry?.dayIndex ?? 0;
  block.currentWeek = entry?.week.weekNumber || block.currentWeek || 1;

  const sequence = workoutSequence(block);
  const activeIndex = entry ? sequence.findIndex((item) => item.day.id === entry.day.id) : -1;
  const completedSet = new Set(block.completedWorkoutDayIds);
  const skippedSet = new Set(block.skippedWorkoutDayIds);
  block.nextWorkoutDayId = sequence.slice(activeIndex + 1).find((item) => !isDone(item, completedSet, skippedSet))?.day.id;
  block.status = entry ? "active" : "completed";
}

export function syncActiveBlockProgress(block: TrainingBlock, completedSessions: WorkoutSession[] = []): BlockWorkoutCursor | undefined {
  const completedIds = unique([...(block.completedWorkoutDayIds || []), ...completedIdsFromSessions(completedSessions)]);
  const skippedIds = unique(block.skippedWorkoutDayIds || []);
  const completedSet = new Set(completedIds);
  const skippedSet = new Set(skippedIds);
  const sequence = workoutSequence(block);
  const active = block.activeWorkoutDayId
    ? sequence.find((entry) => entry.day.id === block.activeWorkoutDayId && !isDone(entry, completedSet, skippedSet))
    : undefined;
  const pointer = block.currentWorkoutPointer
    ? sequence.find(
        (entry) =>
          entry.weekIndex === block.currentWorkoutPointer?.weekIndex &&
          entry.dayIndex === block.currentWorkoutPointer?.dayIndex &&
          !isDone(entry, completedSet, skippedSet)
      )
    : undefined;
  const next = active || pointer || sequence.find((entry) => !isDone(entry, completedSet, skippedSet));
  applyCursor(block, next, completedIds, skippedIds);
  return next ? toCursor(undefined, block, next) : undefined;
}

function toCursor(program: Program | undefined, block: TrainingBlock, entry: SequenceEntry): BlockWorkoutCursor {
  return {
    program: program as Program,
    block,
    week: entry.week,
    day: entry.day,
    weekIndex: entry.weekIndex,
    dayIndex: entry.dayIndex,
    label: `Week ${entry.week.weekNumber} - Day ${entry.day.dayIndex || entry.dayIndex + 1}`,
    isRestDay: entry.day.status === "rest"
  };
}

export function getCurrentWorkoutForUser(db: TrainingDatabase, userId: string): BlockWorkoutCursor | undefined {
  const programSource = db.programs.find((candidate) => candidate.userId === userId && candidate.status === "active");
  const program = programSource ? structuredClone(programSource) : undefined;
  const block = program?.blocks.find((candidate) => candidate.status === "active") || program?.blocks[0];
  if (!program || !block) return undefined;
  const sessions = db.sessions.filter((session) => session.userId === userId && session.blockId === block.id);
  const cursor = syncActiveBlockProgress(block, sessions);
  if (!cursor) return undefined;
  return { ...cursor, program };
}

export function getNextWorkoutInBlock(block: TrainingBlock, completedSessions: WorkoutSession[] = []): WorkoutDay | undefined {
  return syncActiveBlockProgress(block, completedSessions)?.day;
}

export function advanceActiveBlockAfterWorkoutCompletion(block: TrainingBlock, completedWorkoutSession: WorkoutSession, blockSessions: WorkoutSession[] = []): void {
  if (completedWorkoutSession.workoutDayId) {
    block.completedWorkoutDayIds = unique([...(block.completedWorkoutDayIds || []), completedWorkoutSession.workoutDayId]);
    block.weeks
      .flatMap((week) => week.workouts)
      .filter((day) => day.id === completedWorkoutSession.workoutDayId)
      .forEach((day) => {
        day.status = "completed";
      });
  }
  syncActiveBlockProgress(block, [completedWorkoutSession, ...blockSessions]);
}

export function skipActiveWorkout(block: TrainingBlock, workoutDayId?: string): void {
  const activeWorkoutDayId = workoutDayId || block.activeWorkoutDayId;
  if (!activeWorkoutDayId) return;
  block.skippedWorkoutDayIds = unique([...(block.skippedWorkoutDayIds || []), activeWorkoutDayId]);
  block.weeks
    .flatMap((week) => week.workouts)
    .filter((day) => day.id === activeWorkoutDayId)
    .forEach((day) => {
      day.status = "skipped";
    });
  syncActiveBlockProgress(block);
}

export function markRestDayComplete(block: TrainingBlock, workoutDayId?: string): void {
  const activeWorkoutDayId = workoutDayId || block.activeWorkoutDayId;
  if (!activeWorkoutDayId) return;
  block.completedWorkoutDayIds = unique([...(block.completedWorkoutDayIds || []), activeWorkoutDayId]);
  block.weeks
    .flatMap((week) => week.workouts)
    .filter((day) => day.id === activeWorkoutDayId)
    .forEach((day) => {
      day.status = "completed";
    });
  syncActiveBlockProgress(block);
}

export function moveActiveBlockPointer(block: TrainingBlock, direction: "previous" | "next"): void {
  const sequence = workoutSequence(block);
  if (!sequence.length) return;
  const activeIndex = Math.max(0, sequence.findIndex((entry) => entry.day.id === block.activeWorkoutDayId));
  const offset = direction === "previous" ? -1 : 1;
  const nextIndex = Math.max(0, Math.min(sequence.length - 1, (activeIndex === -1 ? 0 : activeIndex) + offset));
  const target = sequence[nextIndex];
  block.completedWorkoutDayIds = (block.completedWorkoutDayIds || []).filter((id) => id !== target.day.id);
  block.skippedWorkoutDayIds = (block.skippedWorkoutDayIds || []).filter((id) => id !== target.day.id);
  if (target.day.status === "completed" || target.day.status === "skipped") target.day.status = "planned";
  applyCursor(block, target, block.completedWorkoutDayIds || [], block.skippedWorkoutDayIds || []);
}
