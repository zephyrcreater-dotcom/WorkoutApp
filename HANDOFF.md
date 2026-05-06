# HANDOFF.md

## What This App Is

Iron Orbit Training is a local-first PWA for workout programming and tracking across powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health. It is meant to replace an Excel workout tracking system and eventually become an adaptive training coach.

The app supports multiple local users with separate data. It works well on iPhone Safari, is installable as a PWA, and is architected for future cloud sync.

---

## Current Project Status

- **Branch:** `session-2-algorithm-logic`
- **Build:** Passing (`tsc -b && vite build`, 1595 modules, no errors or warnings)
- **Lint:** Passing (`eslint .`, no errors)
- **Git status:** 7 files modified, untracked `imports/` and `src/lib/importers/` (excluded by `.gitignore`)

Modified files in current working tree:
- `.gitignore`
- `package.json`
- `src/App.tsx`
- `src/data/seedData.ts`
- `src/lib/db.ts`
- `src/lib/trainingMath.ts`
- `src/types/domain.ts`

```bash
npm run lint    # passes
npm run build   # passes — tsc -b && vite build, 1595 modules transformed
```

---

## Session History Summary

### Session 1 Iteration 2
- LocalStorage mirror backup added to db.ts
- `normalizeDatabase` fills newer fields and enforces one active program per user
- Split templates with per-user favorites
- Exercise library compact UI
- `buildPlannedExerciseFromExercise` centralized in programmingLogic.ts
- `PlannedSet` extended with `setNumber`, `repRange`, `targetRir`, `percentageOfTopSet`

### Session 2
- `SetRating` changed from string enum to `1 | 2 | 3 | 4 | 5`
- `normalizeDatabase` migrates old string ratings to numeric
- All string-based rating comparisons updated to numeric
- Live Logger rating buttons become 1–5 grid
- `exerciseComplete` and `allExercisesComplete` edge cases fixed
- `WeekProgressScreen` derives current week from block cursor
- e1RM chart X-axis falls back to block week number lookup
- `@humanfs/core` pinned to 0.19.1 to fix lint

### Session 1 Iteration 3
- Active block → Today workout → set-by-set logging flow stabilized
- `WorkoutSession` stores `updatedAt`, `weekNumber`, `currentExerciseIndex`, `currentSetIndex`
- In-progress sessions persist and resume
- Live Logger: set lineup, current set highlight, Next/Skip/Add Set, Finish Exercise/Workout, Abandon Workout
- Week Progress tab added
- Exercise Analytics: first e1RM line chart
- Program Gap Analysis: deduplication, rule conflict grouping
- Workout day exercise selection: step chips for target muscles

### V2 Iteration 1 (pre-this-session)
- V2 data model fields added: `fulfillsRequirementId` on `PlannedExercise`, `exerciseCategory`, `isSBDMainLift`, `systemicFatigue`, `localFatigue`, `repDropSensitivity`, `failureTolerance` on Exercise
- `SplitDayRequirement` interface added to domain
- `PARENT_MUSCLE_CHILDREN` and `exerciseFulfillsRequirement` added to App.tsx
- `muscleOptions` expanded to include `"lower-chest"`, `"adductors"`, `"abductors"`
- New `MuscleGroup` values: `"lower-chest"`, `"adductors"`, `"abductors"` (25 total)
- `sanitizeRpe`, `isBlockWeekComplete`, `generateWeekReview`, `WeekReview` interface added to trainingMath.ts
- 38 new exercises added to seedData.ts (full coverage: chest, back, shoulders, arms, legs, core)
- New exercises merge into existing user DBs via `normalizeDatabase` in db.ts

---

## V2 Iteration 2 — Completed Work

### 1. `countFulfilled` — One Exercise, One Requirement Slot

**File:** `src/App.tsx`, inside `WorkoutDayEditor`

**Old behavior:** Used muscle matching across `primaryMuscles` (and previously also `directVolumeMuscles`), so one broad exercise could count toward multiple requirements simultaneously.

**New behavior:** Uses `fulfillsRequirementId` as the primary signal.

```typescript
function countFulfilled(exercises: typeof day.exercises, req: SplitDayRequirement): number {
  const explicit = exercises.filter((p) => p.fulfillsRequirementId === req.id).length;
  const untagged = exercises.filter((p) => !p.fulfillsRequirementId);
  const legacyMatched = untagged.filter((p) => {
    const ex = db.exercises.find((e) => e.id === p.exerciseId);
    return ex && exerciseFulfillsRequirement(ex, req);
  }).length;
  return explicit + legacyMatched;
}
```

- Exercises with an explicit `fulfillsRequirementId` are counted only for the requirement they were tagged for.
- Exercises without `fulfillsRequirementId` (legacy data) fall back to muscle matching so old saved programs do not break.
- One exercise added through the guided chooser fills exactly one requirement slot.

### 2. `addExercise` — Tags Each Exercise With `fulfillsRequirementId`

**File:** `src/App.tsx`, inside `WorkoutDayEditor`

When an exercise is added through the guided requirement chooser, it is tagged with the currently active requirement's ID:

```typescript
function addExercise(exercise: Exercise) {
  if (alreadyAddedIds.includes(exercise.id)) return;
  const reqId = currentReq?.id;  // capture the active requirement
  updateDay((target) => {
    const planned = buildPlannedExerciseFromExercise({ db, user, program, day: target, exercise, order: target.exercises.length + 1 });
    planned.fulfillsRequirementId = reqId;  // tag with this requirement
    target.exercises.push(planned);
  });
  // advance to next unfulfilled requirement
}
```

If `currentReq` is undefined (e.g., "show all exercises" mode or no requirements defined), `reqId` is `undefined` and the exercise is treated as untagged (falls into the legacy muscle-matching path for counting).

### 3. `exerciseFulfillsRequirement` — `primaryMuscles` Only, Parent/Child Hierarchy

**File:** `src/App.tsx`, top-level (module scope)

Uses `primaryMuscles` only (not `directVolumeMuscles`). Parent muscles accept child matches; specific muscles require an exact match.

```typescript
const PARENT_MUSCLE_CHILDREN: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  "back": ["lats", "upper-back", "mid-back", "traps", "spinal-erectors"],
  "chest": ["upper-chest", "lower-chest"],
  "quads": ["quads"],
  "hamstrings": ["hamstrings"],
  "glutes": ["glutes"],
  "biceps": ["biceps"],
  "triceps": ["triceps"],
};

function exerciseFulfillsRequirement(exercise: Exercise, req: SplitDayRequirement): boolean {
  const primary = exercise.primaryMuscles;
  if (primary.includes(req.targetMuscle)) return true;
  if (isParentMuscle(req.targetMuscle)) {
    const children = PARENT_MUSCLE_CHILDREN[req.targetMuscle] ?? [];
    return primary.some((m) => children.includes(m));
  }
  return false;
}
```

**Key rules:**
- A `"back"` requirement accepts an exercise whose `primaryMuscles` includes any of: `lats`, `upper-back`, `mid-back`, `traps`, `spinal-erectors`.
- A `"lats"` requirement accepts only exercises with `"lats"` in `primaryMuscles` — not `"back"`, not `"upper-back"`.
- A `"chest"` requirement accepts `"upper-chest"` or `"lower-chest"`.
- A `"upper-chest"` requirement only accepts `"upper-chest"` exactly.

### 4. SplitDayEditor — Exercise Requirements UI

**File:** `src/App.tsx`, `SplitDayEditor` component

A new "Exercise requirements" section was added inside every split day card, between the movement patterns section and the notes field.

**Features:**
- **Add button** — creates a new `SplitDayRequirement` with the day's first muscle group as default (or `"chest"` if none), count = 1, auto-priority.
- **Muscle dropdown** — `<select>` populated from `muscleOptions` (all 25 `MuscleGroup` values).
- **Count input** — number input (min 1, max 6) for `requiredExerciseCount`.
- **Remove button** — removes the requirement and renumbers priorities.
- Empty state message shown when no requirements are defined.

Requirements are stored in `SplitDay.requirements: SplitDayRequirement[]`. Changes flow through `onChange` and are persisted to the split template immediately.

### 5. RPE 0.5 Increments

**File:** `src/App.tsx`

**`NumberField` updated** to accept an optional `step` prop:

```typescript
function NumberField({ label, value, step, onChange }: {
  label: string; value: number; step?: number; onChange: (value: number) => void
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}
```

**Planned RPE field** in `WorkoutDayEditor` now uses `step={0.5}` and wraps its `onChange` in `sanitizeRpe()`:

```typescript
<NumberField label="RPE" step={0.5} value={planned.plannedSets[0]?.targetRpe || 7}
  onChange={(rpe) => updateDay((target) => {
    target.exercises.find((item) => item.id === planned.id)?.plannedSets.forEach((set) => {
      set.targetRpe = sanitizeRpe(rpe);
    });
  })} />
```

`sanitizeRpe(value)` is defined in `trainingMath.ts`: clamps to [6, 10] and rounds to nearest 0.5.

The actual RPE `BigInput` in the live logger already used `step="0.5"` before this iteration.

### 6. Tonnage Removed From UI

**Before:** WeekProgressScreen workout rows showed "Tonnage" as a metric. ProgressScreen "Weekly Review" panel showed "Tonnage".

**After:**

**WeekProgressScreen workout rows** (per completed session, per day) now show:
- Hard sets (actual non-skipped sets logged)
- Skipped (sets skipped)
- Avg RPE (average actual RPE of completed sets)
- Avg feel (average setRating / 5)
- Score (/100)

**ProgressScreen Weekly Review panel** now shows:
- Completed (workouts in last 7 days)
- Hard sets (non-warmup, non-skipped sets across recent completed sessions)
- Avg RPE (average actual RPE of those sets)

Hard sets and avg RPE for ProgressScreen are computed inline from the last 7 days of completed sessions:

```typescript
const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
const recentSessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed" && new Date(s.startedAt).getTime() >= sevenDaysAgo);
const weeklyHardSets = recentSessions.flatMap((s) => s.loggedExercises).flatMap((log) => log.sets.filter((set) => !set.skipped && set.kind !== "warmup"));
const weeklyAvgRpe = weeklyHardSets.length ? weeklyHardSets.reduce(...) / weeklyHardSets.filter((s) => s.actualRpe).length : 0;
```

`summarizeWeek()` still exists and returns `tonnage` — that function is used for `weekly.completedWorkouts` but the tonnage field is no longer rendered.

### 7. Week Review Panel

**File:** `src/App.tsx`, `WeekReviewPanel` component + call site in `WeekProgressScreen`

**When it appears:** At the bottom of the `WeekProgressScreen` workout list panel, when `isBlockWeekComplete(block, sessions)` returns `true` (all days in current week are either completed or skipped).

**What it shows:**
- Header: "Week N Complete!" with week N/totalWeeks
- Metrics grid: Completed (workouts), Skipped, Hard sets, Avg RPE
- Secondary grid: Avg feel (/5), Avg readiness (when available)
- Suggestions panel (from `generateWeekReview`): bullet-point suggestions with a note that nothing changes automatically
- "Start Week N+1" button — requires explicit user click

**What it does NOT do:**
- Does not auto-advance the block to the next week
- Does not auto-apply any load or rep changes
- Does not change any planned sets or program structure

Clicking "Start Week N+1" shows a confirmation message: "Head to Today to begin your next training day. The block will advance automatically when you start your first session of Week N+1." The block only advances when the user starts a new session through the Today flow.

### 8. Imports Added

**`src/App.tsx` trainingMath imports:**
```typescript
import {
  ...,
  sanitizeRpe,
  isBlockWeekComplete,
  generateWeekReview
} from "./lib/trainingMath";
```

**`src/App.tsx` type imports:**
```typescript
import type {
  ...,
  TrainingBlock,
  ...
} from "./types/domain";
```

---

## Data Model Changes (V2 Iterations 1+2)

### `MuscleGroup` (domain.ts)
Now 25 values:
```typescript
export type MuscleGroup =
  | "chest" | "upper-chest" | "lower-chest"
  | "back" | "lats" | "upper-back" | "mid-back" | "traps" | "spinal-erectors"
  | "quads" | "hamstrings" | "glutes" | "calves" | "adductors" | "abductors"
  | "biceps" | "triceps"
  | "front-delts" | "side-delts" | "rear-delts"
  | "abs" | "obliques" | "forearms"
  | "full-body" | "conditioning";
```

### `PlannedExercise` (domain.ts)
```typescript
fulfillsRequirementId?: ID;  // which SplitDayRequirement this exercise was added for
```

### `SplitDayRequirement` (domain.ts)
```typescript
export interface SplitDayRequirement {
  id: ID;
  targetMuscle: MuscleGroup;
  requiredExerciseCount: number;
  priority: number;
  notes?: string;
}
```

### `Exercise` (domain.ts) — V2 Iteration 1 additions
```typescript
exerciseCategory?: ExerciseCategoryLabel;  // "sbd" | "main_compound" | "secondary_compound" | "machine_compound" | "isolation" | "bodyweight" | "conditioning"
isSBDMainLift?: boolean;
systemicFatigue?: FatigueLevel;
localFatigue?: FatigueLevel;
repDropSensitivity?: FatigueLevel;
failureTolerance?: "low" | "moderate" | "high";
```

### `WeekReview` (trainingMath.ts)
```typescript
export interface WeekReview {
  weekNumber: number;
  totalWeeks: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  plannedWorkouts: number;
  hardSetsCompleted: number;
  averageRpe: number;
  averageSetRating: number;
  averageReadiness: number | null;
  isAllDone: boolean;
  suggestions: string[];
}
```

All new fields are backward-compatible. `normalizeDatabase` in `db.ts` fills missing fields on load.

---

## Current App Flow

```
Login (PIN) → Today
                ├─ Active block scheduled workout → Live Logger → Finish → Week Progress
                └─ No active block → Programs

Programs → Block Builder → Activate → Today
Library  → Split Library → SplitDayEditor → (set muscles + requirements per day)
                         → Use split in Block Builder
Settings → Profile / Gym Manager
Progress → e1RM metrics, exercise history top sets, bodybuilding dashboard, program gaps, weekly review
Week     → WeekProgressScreen: current week workouts, per-day session summary, Week Review panel (when week complete)
```

---

## How Exercise Requirements Work

1. **Split day definition:** Each `SplitDay` has `requirements: SplitDayRequirement[]`. Each requirement specifies a `targetMuscle`, `requiredExerciseCount`, and `priority`.

2. **WorkoutDayEditor guided chooser:** When editing a workout day linked to a split day, the UI walks through requirements in priority order. The current active requirement is highlighted. The exercise picker filters to the requirement's `targetMuscle` (using `exerciseFulfillsRequirement`).

3. **Requirement matching:** `exerciseFulfillsRequirement` checks `primaryMuscles` only. Parent muscles (back, chest) accept child exercises. Specific muscles require exact match.

4. **Tagging:** When the user adds an exercise, `addExercise` captures `currentReq?.id` and sets `planned.fulfillsRequirementId = reqId` on the new `PlannedExercise`.

5. **Counting:** `countFulfilled(exercises, req)` counts exercises with `fulfillsRequirementId === req.id` as the primary path. Untagged exercises fall back to muscle matching (legacy compatibility).

6. **Advancement:** The UI automatically advances to the next unfulfilled requirement after each exercise is added.

7. **Override:** The user can toggle "Show all exercises" to bypass requirement filtering and add any exercise freely (these get `fulfillsRequirementId = undefined`).

---

## Files Changed in V2 Iteration 2

| File | Changes |
|------|---------|
| `src/App.tsx` | `countFulfilled` rewritten; `addExercise` tags with `fulfillsRequirementId`; `SplitDayEditor` requirements UI added; `NumberField` gets `step` prop; planned RPE uses `step={0.5}` + `sanitizeRpe`; tonnage removed from WeekProgressScreen and ProgressScreen; `WeekReviewPanel` component added; `WeekProgressScreen` calls `isBlockWeekComplete`; trainingMath imports expanded; `TrainingBlock` added to type imports |
| `src/lib/trainingMath.ts` | `sanitizeRpe`, `WeekReview` interface, `isBlockWeekComplete`, `generateWeekReview` added (V2 Iteration 1, used in V2 Iteration 2) |
| `src/types/domain.ts` | `"lower-chest"`, `"adductors"`, `"abductors"` added to `MuscleGroup`; `fulfillsRequirementId` added to `PlannedExercise`; V2 exercise classification fields added (V2 Iteration 1) |
| `src/data/seedData.ts` | 38 new exercises added; PPL split days updated with `requirements` arrays (V2 Iteration 1) |
| `src/lib/db.ts` | `builtInExercises` import added; exercise merge step in `normalizeDatabase` (V2 Iteration 1) |

---

## Intentionally Deferred

- Movement-pattern-based requirements (items 2b from V2 spec) — deferred, muscle-based only for now
- RPE sanitization on import (importer pipeline already exists but not wired to `sanitizeRpe`)
- Next-set recommendation display improvement (item 6) — the algorithm and panel already exist; UX polish deferred
- Five-week block position modeling (item 11) — `generateWeekReview` uses `weekNumber`/`totalWeeks` but suggestion text is generic; block-position-aware suggestions deferred
- Full public CSV importer
- Exercise variation grouping
- Gym-specific conversion learning improvements
- Normalized vs observed e1RM charting
- Advanced fatigue modeling
- Exercise-level feedback redesign
- Detailed set types (warmup / top / backdown / drop / AMRAP)
- True program generator overhaul
- PWA/Vercel deployment polish
- Cloud sync
- Automated test suite

---

## Known Bugs / TODOs

1. **Program page density** — Builder/Programs tab still stacks block builder, weekly overview, day editor, gap analysis, and previous blocks. Needs a UX separation pass.

2. **`@humanfs/core` ESLint pin** — `@humanfs/core@0.19.2` has a broken publish. Pinned to 0.19.1 with `npm install @humanfs/core@0.19.1 --no-save`. If `npm install` upgrades it, re-run the pin.

3. **Split requirements not auto-generated for new splits** — New split days created in the UI start with no requirements. The user must add them manually. The `normalizeDatabase` migration generates requirements from `muscleGroups` for existing split days that lack them, but newly created splits do not auto-populate.

4. **`fulfillsRequirementId` not retroactively set on existing exercises** — Exercises added before this iteration have no `fulfillsRequirementId`. They fall back to muscle matching for `countFulfilled`. If a day has mixed tagged/untagged exercises, the count can be imprecise.

5. **Program generation does not yet use requirements** — `programGenerator.ts` selects exercises based on split day `muscleGroups` and `targetMuscles`, not `requirements`. Requirements are only used in the WorkoutDayEditor manual chooser. Wiring the generator to respect requirements is a future task.

6. **`generateWeekReview` suggestions are generic** — Suggestions are based on averageRpe, averageSetRating, and block position but do not yet recommend specific load/rep changes per exercise.

7. **No automated tests** — No unit tests for `programGenerator`, `programAnalysis`, `trainingMath`, or `db` normalization.

8. **`summarizeWeek` still returns `tonnage`** — The field exists in the return type but is no longer rendered anywhere in the UI. It can be removed in a future cleanup pass if no other code depends on it.

---

## Recommended Next Iteration (V2 Iteration 3)

**Focus: Weight Estimator v1 + Exercise Library Depth**

### Priorities

1. **Expand exercise library seed data** using the improved muscle hierarchy. Each exercise should have accurate `primaryMuscles`, `secondaryMuscles`, `category`, `equipment`, `defaultIncrement`, `fatigueRating`, and all V2 classification fields.

2. **Improve muscle hierarchy** across the full body — confirm all 25 `MuscleGroup` values are well-represented in the library.

3. **Build Weight Estimator v1:**
   - Estimate baseline e1RM from recent history for the exercise
   - Recommend planned weight from target reps and RPE
   - Apply block/week position modifiers (week 1 = conservative, week 3-4 = peak)
   - Apply readiness modifiers conservatively (do not over-discount)
   - Round to exercise `defaultIncrement`
   - Return confidence level and plain-English reason
   - Wire into `WorkoutDayEditor` planned weight suggestion

4. **Wire `setRating`/actual RPE into next-set recommendations more visibly** — make the coach suggestion panel always visible after any set is logged (not just when the algorithm returns a non-hold recommendation).

5. **Improve Week Review suggestions** — make them specific enough to suggest next-week load, rep, or set-count changes per exercise without auto-applying them. User approval required before any change lands.

6. **Keep manual-first** — all suggestions are displayed, not auto-applied.

---

## Architecture Reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app shell, all screens and UI components (~3600+ lines) |
| `src/types/domain.ts` | Core TypeScript domain model |
| `src/lib/db.ts` | IndexedDB load/save/reset/replace + migration normalization |
| `src/lib/trainingMath.ts` | e1RM, RPE chart, readiness scoring, weight suggestions, set adjustment suggestions, gym conversion learning, volume/session summaries, Week Review |
| `src/lib/programGenerator.ts` | Split parsing, structured program/block/week/day generation |
| `src/lib/programAnalysis.ts` | Program gap analysis, bodybuilding dashboard data |
| `src/lib/programmingLogic.ts` | `buildPlannedExerciseFromExercise`, `defaultCompoundSettings`, starter prescription |
| `src/lib/algorithms/` | `setAdjustment.ts`, `loadPrescription.ts`, `e1rm.ts`, `readiness.ts`, `trainingRules.ts` |
| `src/lib/blockProgression.ts` | `syncActiveBlockProgress` — keeps block cursor in sync with sessions |
| `src/data/seedData.ts` | Built-in exercises (60+), split templates, seed users, seed gyms |
| `src/hooks/useTrainingDb.ts` | React hook around local database load/update/import/reset |
| `src/main.tsx` | React entry, service worker registration/unregistration |

---

## Commands

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
npm run lint
npm run build
```

If `@humanfs/core` breaks lint after a fresh install:
```bash
npm install @humanfs/core@0.19.1 --no-save
```
