# ROADMAP.md

## V2 Hotfix Final — Completed

- Block tab simplified: active block shows compact summary + "View current week" link; WeeklyOverview only shown for drafts.
- Week tab owns active week progress and completed week history (week selector tabs).
- Exercise analytics: Overall mode (by date) vs Current Block mode (W{n}D{n} labels). Default: Overall.
- Off-program exercises in LiveLogger: scope modal (This session only / Future [coming soon]).
- Next-week editing: placeholder in Week Review with "coming soon" helper text.
- LiveLogger set-flow fixes: phantom next set, skip guard, finish-exercise confirmation, applySuggestion persistence.

---

## V2 Next Iteration — Recommended Focus

**Theme: Weight Estimator v1 + Exercise Library Depth**

### Priorities

1. **Expand exercise library seed data** using the improved 25-value muscle hierarchy.
   - Each exercise: accurate `primaryMuscles`, `secondaryMuscles`, `category`, `equipment`, `defaultIncrement`, `fatigueRating`, and all V2 classification fields (`exerciseCategory`, `isSBDMainLift`, `systemicFatigue`, `localFatigue`, `repDropSensitivity`, `failureTolerance`).
   - Ensure all major muscle groups have 3–6 exercises across equipment types.

2. **Improve muscle hierarchy across the full body.**
   - Confirm all 25 `MuscleGroup` values are represented in the exercise library.
   - Audit `primaryMuscles` across existing exercises for accuracy.

3. **Build Weight Estimator v1.**
   - Estimate baseline e1RM from recent history.
   - Recommend planned weight from target reps + RPE.
   - Apply block/week position modifiers (week 1 conservative, week 3–4 peak).
   - Apply readiness modifiers conservatively.
   - Round to exercise `defaultIncrement`.
   - Return confidence level and plain-English reason.
   - Wire into WorkoutDayEditor planned weight suggestion.

4. **Wire `setRating`/actual RPE into next-set recommendations more visibly.**
   - Make the coach suggestion panel always visible after any set is logged (not just when the algorithm returns a non-hold result).
   - Display "Hold weight" recommendation explicitly when that is the outcome.

5. **Improve Week Review suggestions.**
   - Make suggestions specific enough to name exercises and suggest next-week load, rep, or set-count changes.
   - User must approve any change before it applies.
   - Never auto-overwrite planned sets.

6. **Keep manual-first everywhere.**
   - All suggestions are displayed, not auto-applied.
   - Week advancement only happens when the user initiates a new session through Today.

---

## High-Priority Backlog

- **Wire requirements into program generator** — `programGenerator.ts` should use `SplitDayRequirement[]` to drive exercise selection slots, not just `muscleGroups`.
- **Auto-populate requirements on new split days** — when a muscle is added to a split day, create a default requirement for it.
- **Retroactively tag legacy `fulfillsRequirementId`** — optional migration that assigns `fulfillsRequirementId` to existing exercises on old programs by matching them to requirements in order.
- **Block-position-aware progression suggestions** — Week Review should know week 1 vs week 4 and suggest accordingly.
- **Program page UX cleanup** — separate Block Builder, Weekly Overview, Day Editor, and Previous Blocks into cleaner sub-views.

---

## Medium-Priority Improvements

- Split `src/App.tsx` into focused component files (after product flow is settled).
- Improve generated program quality:
  - Better exercise selection respecting requirements.
  - Better fatigue distribution across the week.
  - More explicit rest day placement.
  - Block-specific rep/RPE/set schemes (linear, wave, deload).
- Build real exercise progress charts:
  - e1RM over time (improve current formula).
  - Volume over time by muscle.
  - Sets/reps over time.
  - RPE/RIR and gym-specific trends.
- Improve program gap analysis:
  - User-goal-specific thresholds.
  - Volume landmarks by experience level.
  - Better low-back/posterior-chain detection.
- Improve bodybuilding dashboard:
  - Recent progression by exercise.
  - Recovery trend integration.
  - Per-muscle target ranges configured by goal and priority.
- Improve gym conversion flow:
  - Dedicated "this machine feels different" action in logger.
  - Confirmation of learned factors.
  - Better display of same exercise across gyms.
- Add unit tests for `programGenerator`, `programAnalysis`, `trainingMath`, `db` normalization.

---

## Deferred Backlog (No Timeline)

- Full public CSV importer (infrastructure exists in `src/lib/importers/`, not yet wired to UI fully)
- Exercise variation grouping
- Gym-specific conversion learning polish
- Normalized vs observed e1RM charting
- Advanced fatigue modeling
- Exercise-level feedback redesign
- Detailed set types (warmup / top / backdown / drop / AMRAP) in the UI
- True program generator overhaul (AI/rules hybrid)
- PWA/Vercel deployment polish
- Cloud sync
- Real accounts and encrypted sensitive data
- AI/ML-assisted coaching
- Meet prep calendar with attempt planning
- Bodyweight/nutrition/readiness trend modeling
- Exercise video/cue library
- Advanced substitution engine
- More robust offline conflict resolution
- Full automated test suite

---

## Features Not To Start Yet

- Cloud sync
- Real auth/encryption
- ML/AI coaching
- Broad design-system rewrite
- Backend development

---

## Completed In V2 Iteration 2

- `countFulfilled` rewritten to use `fulfillsRequirementId` as primary signal; untagged exercises fall back to muscle matching.
- `addExercise` tags each exercise with `fulfillsRequirementId = currentReq?.id`.
- `exerciseFulfillsRequirement` uses `primaryMuscles` only; parent muscles accept child matches; specific muscles require exact match.
- `SplitDayEditor` has Exercise Requirements section (add/remove/edit per day).
- `NumberField` has `step` prop; planned RPE uses `step={0.5}` + `sanitizeRpe()`.
- Tonnage removed from WeekProgressScreen and ProgressScreen; replaced with hard sets, avg RPE, avg feel.
- `WeekReviewPanel` component added; shows when `isBlockWeekComplete` is true; requires explicit user confirmation to advance.

## Completed In V2 Iteration 1

- `MuscleGroup` expanded to 25 values (added `lower-chest`, `adductors`, `abductors`).
- `PlannedExercise.fulfillsRequirementId?: ID` added.
- `SplitDayRequirement` interface added.
- `PARENT_MUSCLE_CHILDREN` constant and `exerciseFulfillsRequirement` function added to App.tsx.
- `sanitizeRpe`, `WeekReview`, `isBlockWeekComplete`, `generateWeekReview` added to trainingMath.ts.
- V2 exercise classification fields added to domain.ts and normalizeDatabase.
- 38 new exercises added to seedData.ts.
- Exercise merge step added to `normalizeDatabase` in db.ts.
- PPL split days updated with requirements arrays.

## Completed In Session 2

- `SetRating` changed from string enum to `1 | 2 | 3 | 4 | 5`.
- All string-based rating comparisons updated to numeric.
- Live Logger rating buttons: 1–5 grid.
- `exerciseComplete`/`allExercisesComplete` edge cases fixed.
- `WeekProgressScreen` derives current week from block cursor.
- e1RM chart X-axis week number fallback.

## Completed In Session 1

- React TypeScript Vite PWA shell.
- IndexedDB persistence + localStorage mirror.
- Local PIN login, seed users.
- Exercise library, gym manager, templates, program/block generation.
- Live workout logger with set logging, RPE, rating, rest timer.
- Today, Week Progress, Exercise Analytics, Block History.
- Program gap analysis, bodybuilding dashboard.
- JSON import/export.
- `normalizeDatabase` for backward compatibility.
