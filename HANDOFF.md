# HANDOFF.md

## What This App Is

Iron Orbit Training is a local-first PWA for workout programming and tracking across powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health. It is meant to replace an Excel workout tracking system and eventually become an adaptive training coach.

The app supports multiple local users with separate data. It works well on iPhone Safari, is installable as a PWA, and is architected for future cloud sync.

---

## Current Handoff for Codex — V3 Phase 2: Goal/Block Programming Rules

### What landed in V3 Phase 2

**Philosophy:** The goal hierarchy is now enforced throughout the generator and prescription engine. `block.goalOverride` takes precedence over `block.goal`, which takes precedence over `program.goal`. All exercise selection, slot planning, scoring, and prescription logic resolves `goalUsed` before computing anything.

**Domain changes (`src/types/domain.ts`):**
- Added `goalOverride?: TrainingGoal` to `TrainingBlock` — explicit block-level goal that overrides the program-level goal for all training logic.

**New helper (`trainingRules.ts`):**
- `getGoalUsed(programGoal, blockGoalOverride?, splitGoal?)` — resolves the effective training goal for a block. Returns `blockGoalOverride ?? splitGoal ?? programGoal`.

**Week progression engine (`programmingRules.ts`):**
- Added `getWeekProgressionModifier({ goalType, blockType, weekIndex, totalWeeks, exerciseRole, fatigueTag })` — returns `{ rpeAdjust, repsAdjust, setsAdjust }` for the given week position.
  - Deload: −1 RPE, −1 set for all roles.
  - Peaking main lifts: up to +1.5 RPE across the block, rep reduction in weeks 3+.
  - Bodybuilding/powerbuilding: +0.5 RPE ramp, +1 rep in week 1 for accessories, optional set reduction for high-fatigue exercises in final week.
  - Powerlifting: +1.0 RPE ramp for main lifts with rep reduction at 60%+ progression; +0.5 RPE for accessories.
  - Maintenance/general-health: flat (no progression).
- `getPrescriptionForExerciseSlot` now applies `weekMod` instead of the old simple `lateBlock +0.5 RPE` logic.

**Exercise selection improvements (`programmingRules.ts`):**
- Fixed `getRequirementSlotPlan` chest slot 1 for bodybuilding: previously fell through to `hypertrophy_accessory` for slot 1; now returns `primary_compound` with broad category preference.
- `scoreExerciseForSlot` goal-aware bonuses/penalties:
  - Bodybuilding slot ≥1: +10 for `hypertrophy_accessory`, `isolation`, `pump_accessory`.
  - Powerbuilding slot ≥2: +8 for `hypertrophy_accessory`, `isolation`.
  - Maintenance/general-health: −10 for `high`-fatigue exercises outside `main_lift` role.
- Powerbuilding slot 3+ (chest/back) returns `hypertrophy_accessory` (same as bodybuilding) instead of plain `isolation`.

**Goal resolution wired everywhere:**
- `App.tsx` `chooseForMe()`: resolves `goalUsed = getGoalUsed(program.goal, block?.goalOverride ?? block?.goal)` and passes it to all `getRequirementSlotPlan` / `scoreExerciseForSlot` calls.
- `App.tsx` `buildPlannedExerciseFromExercise()`: resolves `goalUsed` and uses it for prescription and weight recommendation.
- `programGenerator.ts`: Added `blockGoalOverride?` to `ProgramRequest`; `chooseExercisesForDay` and `plannedExerciseFor` resolve `goalUsed = getGoalUsed(request.goal, request.blockGoalOverride)`.
- `programAnalysis.ts`: `effectiveGoal = block?.goalOverride ?? block?.goal ?? program.goal` drives all goal-conditional warnings (bodybuilding diversity, general-health patterns, maintenance volume, squat pattern, posterior chain).

**Advisory warnings (`programAnalysis.ts`):**
- Powerbuilding advisory: warns when a day has ≥4 exercises but no isolation or machine compound exercise (encourages accessory variety).
- All existing goal-conditional warnings (`general-health`, `bodybuilding`, `maintenance`) now use `effectiveGoal` instead of `program.goal`, so block-level goal overrides take effect.

### Key rules preserved
- All existing logic is backward-compatible. `goalOverride` is optional; if absent, falls back to `block.goal` then `program.goal`.
- Advisory warnings remain advisory — no auto-rewrites.
- Requirement counts and user-selected splits are still respected.

### Lint/build
- **Lint:** passing
- **Build:** passing

### Recommended next step
- V3 Phase 3: Wire `exerciseMetadata.ts` helpers (`getExerciseFamily`, `getFatigueProfile`) into the fatigue budget in `programmingRules.ts` for richer day-level fatigue accounting using the 7-dimension profile.
- Add `blockGoalOverride` UI to block editor so users can explicitly set a training phase goal.

---

## Prior Handoff — V3 Phase 1: Exercise Metadata Foundation

### What landed in V3 Phase 1

**Philosophy:** All existing metadata fields and generator logic are preserved. This pass adds a 7th fatigue dimension, two new movement patterns, a pure helper module, and full seed coverage — so every exercise in the library now has training-aware metadata.

**Domain changes (`src/types/domain.ts`):**
- `MovementPattern` extended with: `"trunk-flexion"`, `"ankle-extension"`
- `ExerciseFatigueProfile.axialFatigue?: FatigueLevel` — 7th optional dimension (spinal/axial loading)

**New module: `src/lib/exerciseMetadata.ts`**
Pure helper functions with safe defaults — all work correctly even when an exercise has no explicit metadata:
- `getExerciseFamily(exercise)` — returns `exerciseFamily` or derives it from category/movementPattern
- `getMovementPattern(exercise)` — returns `movementPattern` with "isolation" fallback
- `getFatigueProfile(exercise)` — returns all 7 dimensions with safe defaults
- `getSpecificity(exercise)` — returns squat/bench/deadlift 0–1 with 0 defaults
- `getPrescriptionProfile(exercise)` — returns rep/RPE/set ranges with conservative defaults
- `getRoleHint(exercise, goalType)` — checks `defaultRoleByGoal` then falls back to `inferBaseExerciseRole`
- `isHighFatigueExercise(exercise)` — true when systemic or local fatigue is "high" or "very_high"
- `isLowBackFatigueExercise(exercise)` — true when lowBackFatigue or axialFatigue is "high" or "very_high"
- `isPressingFamily(exercise)` — true for bench/press family exercises
- `isSbdMainLift(exercise)` — true for competition squat/bench/deadlift
- `normalizeExerciseMetadata(exercise)` — derives all missing fields at runtime from existing properties
- `fatigueProfileToTag(fp)` — converts 7-dimension profile to "low"/"moderate"/"high" scalar tag

**Seed coverage (`src/data/seedData.ts`):**
All ~60 exercises now have full metadata. Previously 17 had metadata; the remaining ~43 were added this pass. Every exercise now has `exerciseFamily`, `variationGroup`, `fatigueProfile` (with `axialFatigue`), `prescriptionProfile`, `defaultRoleByGoal`, and where appropriate `specificity` and updated `movementPattern`.

**Migration (`src/lib/db.ts`):**
- `normalizeDatabase` now patches `axialFatigue` onto stored fatigueProfiles that were persisted before this pass

### Key rules preserved
- All changes are backward-compatible; no existing data or generator logic was modified.
- `normalizeDatabase` handles migration for stored exercises missing `axialFatigue`.
- `exerciseMetadata.ts` functions are pure — no side effects, no DB reads.

### Lint/build
- **Lint:** passing (`eslint .`, 0 errors)
- **Build:** passing (`tsc -b && vite build`)

### Recommended next step
- V3 Phase 2: Wire `exerciseMetadata.ts` helpers into the generator and progression logic. Specifically: use `getFatigueProfile` for day-level fatigue budgeting, use `getPrescriptionProfile` overrides for next-week progression suggestions, and use `getExerciseFamily` for family-level volume tracking.

---

## Current Handoff for Codex — V3.1C Exercise Metadata Hardening

### What landed in V3.1C

**Philosophy:** User still controls split / day / focus / muscle requirements / exercise counts. The app now has richer per-exercise knowledge to optimize inside those constraints, with more targeted warnings based on goal and block type.

**Exercise model additions (src/types/domain.ts):**
- `MovementPattern` extended with: `"incline-press"`, `"knee-extension"`, `"hip-extension"`, `"shoulder-abduction"`, `"spinal-extension"`, `"trunk-stability"`
- Three new interfaces: `ExerciseFatigueProfile` (6 fatigue dimensions: systemic, local, jointStress, lowBack, pressing, grip), `ExerciseSpecificity` (squat/bench/deadlift 0–1), `ExercisePrescriptionProfile` (preferredRepRange, preferredRpeRange, defaultSetRange, avoidLowRepLoading, failureTolerance)
- New optional fields on `Exercise`: `exerciseFamily`, `variationGroup`, `fatigueProfile`, `specificity`, `prescriptionProfile`, `defaultRoleByGoal`

**Seed metadata added (src/data/seedData.ts):**
17 key exercises now have rich metadata: ex_squat_comp, ex_bench_comp, ex_deadlift_comp, ex_front_squat, ex_rdl, ex_barbell_row, ex_cable_row, ex_pull_up, ex_db_incline_press, ex_close_grip_bench, ex_incline_barbell_press, ex_cable_lateral_raise, ex_db_lateral_raise, ex_cable_triceps_pressdown, ex_push_up, ex_back_extension, ex_hip_thrust.

**Programming rules improvements (src/lib/trainingIntelligence/programmingRules.ts):**
- `getExerciseRoleForGoal(exercise, goalType)` — checks `defaultRoleByGoal` first, then falls back to `inferBaseExerciseRole`
- `scoreExerciseForSlot` now uses `getExerciseRoleForGoal` instead of `inferBaseExerciseRole`
- Family diversity penalty: -20 per same `exerciseFamily` already in day; -28 per same `variationGroup` already in day; -12 per weekly variationGroup repeat
- `fatigueProfile` fine-grained checks: high pressingFatigue exercises penalized when press budget is already high; high lowBackFatigue exercises penalized when low-back budget is already high; very_high systemic fatigue penalized when another high-fatigue exercise is already on the day
- `getPrescriptionForExerciseSlot` applies `prescriptionProfile` overrides at end: `avoidLowRepLoading` floors reps to preferredRepRange.min; `preferredRepRange` clamps reps; `preferredRpeRange` clamps targetRpe; `defaultSetRange` clamps sets
- `getRequirementSlotPlan` triceps exception: powerlifting/strength days assign slot 1 triceps as `secondary_compound` (to favor close-grip bench or dips) rather than `isolation`

**Goal/block-aware warnings (src/lib/programAnalysis.ts):**
- Peaking blocks: warn when accessory count > 4
- Deload blocks: warn when estimated weekly sets > 30
- Bodybuilding/general-health: warn when any day has ≥3 exercises sharing the same movement pattern
- General-health: warn when vertical pull, hip hinge/squat, or core brace patterns are missing
- Maintenance: warn when total weekly sets exceed 60

**Migration (src/lib/db.ts):**
- `normalizeDatabase` now copies `exerciseFamily`, `variationGroup`, `fatigueProfile`, `specificity`, `prescriptionProfile`, `defaultRoleByGoal` from built-in definitions to matching stored exercises that lack these fields.

### Key rules preserved
- User-controlled requirement counts are never reduced or overridden.
- All warnings remain advisory; no auto-rewrites of splits or prescriptions.
- New metadata only adds new optional fields; backward compatibility is maintained via `normalizeDatabase`.

### Lint/build
- **Lint:** passing (`eslint .`, 0 errors)
- **Build:** passing (`tsc -b && vite build`)

### Recommended next step
- V3.2 should wire `getExerciseRoleForGoal` and `prescriptionProfile` into next-week progression suggestions (name exercises, suggest load/rep/set changes, require user approval before applying).
- Expand rich metadata to remaining seed exercises beyond the initial 17.

---

## Current Handoff for Codex — V3.1 Training Intelligence Foundation

### V3.1B Constraint-Aware Program Optimization

- The programming layer now explicitly optimizes inside the user’s chosen split instead of trying to silently “fix” the split.
- Requirement counts still stay user-controlled and hard-capped.
- Choose For Me and generated plans now consider:
  - slot role
  - day fatigue budget
  - low-back and axial stacking
  - repeated exercise limits
  - repeated bench-variation limits
- Added role overrides for common exercises where default classification was too blunt, including Push-Up, Back Extension, Pull-Up, RDL, Hip Thrust, Cable Triceps Pressdown, and lateral-raise style work.
- Dynamic prescriptions now better separate:
  - main lift
  - primary / secondary compound
  - accessory compound
  - isolation / hypertrophy accessory
- Program analysis now adds concise advisory warnings for repetition, recoverability, pressing bias, and hard-to-optimize day structures.
- Warnings remain advisory only. The app still respects the split the user created.

### V3.1A Programming Rules Adjustment

- Added exercise-role-based generation for requirement slots.
- Requirement counts remain user-controlled; the app now improves exercise variety inside those slots instead of reducing or overriding them.
- `Choose For Me` and `programGenerator` now assign slot roles like `main_lift`, `secondary_compound`, `isolation`, and `hypertrophy_accessory`.
- Dynamic prescriptions now use goal, block type, day focus, exercise role, slot order, and fatigue cost to set sets, reps, RPE, and rest.
- Same-muscle multi-slot requests now try to diversify movement role and fatigue profile, so chest `3/3` is less likely to become three redundant heavy barbell presses.
- Program balance warnings remain advisory only. The app can warn about pressing bias, but it still respects the user’s chosen requirement counts.
- Full Training Intelligence / broader progression logic is still deferred to later passes.

### What landed in this pass

- Added `src/lib/trainingIntelligence/` as the new deterministic training-intelligence layer.
- Kept the system rules-based and local: no AI runtime, no black-box recommendations, no cloud work.
- Added research-backed goal/block target rules with conservative defaults for rep ranges, RPE ranges, set volume, specificity, fatigue tolerance, and progression style.
- Added readiness scoring cleanup with baseline-centered scoring and conservative load/volume/confidence modifiers.
- Added set performance scoring, observed e1RM calculation, normalized e1RM scaffold, same-exercise baseline selection, same-exercise weight recommendation, confidence scoring, and concise recommendation-reason text.
- Lightly wired the new recommendation layer into planned workout cards, the live logger weight analysis, off-program starting weight suggestions, and generated planned exercise weights.

### Key product rules now in place

- V3.1 uses same-exercise history only. No exercise-family transfer or variation prediction yet.
- Observed e1RM stays close to the completed set itself; normalized e1RM only makes small readiness/context adjustments.
- Readiness baseline is normal, not idealized. Neutral check-ins should land around baseline, not near-perfect.
- Recommendation confidence drops when history is old, sparse, or internally conflicting.
- Recommendation text stays short and factual.

### Deferred on purpose

- Exercise transfer prediction across variations or families.
- Full normalized e1RM personalization curve.
- Full analytics overhaul.
- Settings overhaul.
- Cloud sync.
- Program generator v2 / broader programming overhaul.

### Recommended next step

- V3.2 should wire this foundation into next-set and next-week progression decisions more directly, while keeping manual approval and deterministic rules.

---

## Current Handoff for Codex — V2 Hotfix Continuation

> **Read this section first.** It summarises the current state of the branch and what needs to happen next before the app is stable enough to move into the Training Intelligence / Weight Estimator v1 phase.

### V2 Final Polish Hotfix — Block Planner Reset / Skip WIP / Mobile Actions

- Reset Block Planner now clears the saved builder draft, removes the user's draft program from IndexedDB, resets local planner controls, and hides the stale draft Weekly Overview.
- Skip This Workout now marks the matching in-progress workout session as abandoned before syncing block progress, so Week shows skipped instead of in progress and Today no longer offers the skipped workout as resumable.
- Today action layout now keeps Start/Resume as the primary action, then stacks Go Back / Move To Next Day / Skip This Workout, then Edit Current Day / Go Off Program with full-width mobile buttons.
- V2 should be considered stabilized after this hotfix if manual testing passes. Next phase remains V3 Training Intelligence v1 / algorithm iteration work.

### Next-session handoff

- **Branch:** `v2.1-BugHotfix`
- **Project state:** Late V2 stabilization. The app is in blocker-fix mode only; do not start V3 or Weight Estimator v1 until this stabilization pass is manually verified.
- **What was fixed in the latest session:** direct planned-exercise swap/edit controls in `WorkoutDayEditor`; Easy/5 recommendation path and recommendation identity cleanup; manual weight carry-forward from the previous actual set; stricter week planned/completed truth; completed-block handling with Block Complete actions instead of fake next-week prompts.
- **Files changed in the latest session:** `src/App.tsx`, `src/lib/algorithms/setAdjustment.ts`, `src/lib/blockProgression.ts`, `src/lib/trainingMath.ts`, `src/types/domain.ts`, `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`.
- **Manual testing still needed:** swap a single exercise in Today/Week editor and confirm only that row changes; Easy/5 after a manual starting weight; Easy/5 after applying a prior decrease; unplanned Week 2/3 truth; final-week block completion flow.
- **Known remaining bugs/TODOs:** end-to-end verification for recommendation scoping, stale set edit mode, and continuous-loop week copying; mobile overflow screenshots still needed; generator/library follow-ups stay deferred until V3 prep.
- **Lint / build:** passing (`eslint .`, `tsc -b && vite build`).
- **Recommended next step after merging:** run the manual stabilization scenarios in the browser, then merge once the gym-flow checks pass.
- **Reminder:** V3 Training Intelligence v1 should begin only after V2 stabilization is verified and no workout-blocking bug remains.

### App state

Iron Orbit Training is in late V2 alpha/hotfix work. The app is deployed to Vercel and is testable end-to-end, but several blocker-class bugs remain from real gym testing that must be fixed before new features begin.

### Current branch and build

- **Branch:** `v2.1-BugHotfix`
- **Uncommitted working-tree changes:** `src/App.tsx`, `src/types/domain.ts`, `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`
- **Lint:** passing (`eslint .`, 0 errors)
- **Build:** passing (`tsc -b && vite build`, 1595 modules)

### What was recently worked on (this branch)

All work is in `src/App.tsx` and `src/types/domain.ts`. Changes are staged but not yet committed.

| Area | What changed |
|------|-------------|
| **Requirement counting** | `countFulfilled` rewritten: explicit-first with `anyTagged` guard; counts capped at `req.requiredExerciseCount`. `isExtra` field on `PlannedExercise` for over-cap extras. |
| **Choose For Me** | `chooseForMe` now tags `fulfillsRequirementId` on every picked exercise. |
| **Add Extra Anyway** | Modal added when adding to a full requirement; extra exercises get `isExtra=true` and are never counted toward slots. |
| **Activating a block** | `activateProgram` archives in-progress sessions before activating. |
| **Coach suggestion** | Scoped to `effectiveSetIndex === lastNonSkippedSet.setNumber` (target set only). Wording: "Suggestion from Set N", "Use X for this set", "Apply to Current Set". Applied → compact badge. |
| **Today draft gating** | `weekLocked` lifted to outer scope; `isWeekDraft()` used as source of truth. When locked, entire workout card/exercise list hidden; only planning-notice panel shown. |
| **WeekEditor buttons** | Three buttons: **Save Week** (clears draft), **Exit Editor** (keeps draft), **Discard Draft** (restores snapshot). `weekSnapshotRef` captures workouts at mount. |
| **NumberField spinner** | `max` prop added; `onChange` fires immediately on every valid change; blur clamps to `[min, max]`. Days/week: `min={1} max={7}`. |
| **Source-of-truth helpers** | `isWeekDraft`, `isWorkoutDayPlanned`, `isWeekPlanned` added at module scope. |

### V2 Final Stabilization Pass — 2026-05-08

This pass focused only on blocker stabilization before Weight Estimator v1.

| Area | What changed |
|------|--------------|
| **Requirement caps** | `programGenerator.ts` now fills `SplitDay.requirements` as hard slots and tags `fulfillsRequirementId`; generated plans no longer add extra same-muscle exercises when requirements are full. |
| **Choose For Me** | `WorkoutDayEditor.chooseForMe()` now uses derived requirements, fills each requirement only up to `requiredExerciseCount`, honors requirement movement pattern when present, and reports unfilled slots instead of adding extras. |
| **Draft source of truth** | `TrainingWeek.savedWorkoutsBeforeDraft` stores the saved baseline when Week Editor opens. Save clears draft metadata; Exit preserves draft; Discard restores the baseline or empties the unsaved week. |
| **Today gating** | Today uses the shared `isWeekDraft`/`isWeekPlanned` helpers. If a week is draft or unplanned, the workout card and exercise list are hidden completely. |
| **Week overview UI** | The richer weekday card selector was restored for editable weekly overview and Week Editor day selection. |

### V2 Final Stabilization Pass — Exercise Editing / Mobile / Reviews

- Exercise Library editing now applies to seed and user-created exercises while preserving `exercise.id`; movement patterns remain hidden under Advanced Options.
- Mobile workout logging layout was tightened with min-width-safe logger grids, single-column phone inputs/actions, bottom spacing, and explicit vertical scroll behavior.
- Coach recommendation display now recomputes from the selected target set's prior completed source set. Recommendation identity includes source/target exercise and set indexes.
- Set lineup tapping now selects pending, completed, and skipped sets. Back selects the previous set instead of deleting it. Editing a skipped set with actual values unskips/completes it.
- Week completed days now open a Completed Session Review instead of the planned day editor. Logged set values, setRating, notes, and skipped state can be edited and saved.
- Off-program completed sessions appear in Week history and use the same review/edit flow without modifying active block plans.
- Completed-session edits rebuild exercise performance logs so analytics reflect the edited history.
- V3 Training Intelligence v1 remains deferred until these V2 stabilization changes are manually verified.

### V2 Final Bugfix — Scroll / Off-Program Weights / Set Counting

- Restored normal document scrolling by removing the app shell overflow trap, keeping horizontal clipping on the document, and allowing `html/body/#root` to use normal vertical scroll.
- Off-program builder now writes the displayed starting weight into the first `offProgramPlannedSets` entry before the session starts; added off-program exercises use the same path.
- Manual weight carry-forward now prefers the previous completed actual set when the next set has no explicit planned/applied weight.
- Recommendation display uses the selected target set's prior valid completed source set, so Easy/Hard adjustments use the real load the user actually logged.
- Applied recommendations update off-program planned sets as well as programmed planned sets, so navigation does not lose the applied target weight.
- Completed/off-program history now counts valid completed sets only, excluding skipped and warmup sets, and exercise performance logs preserve all completed off-program sets.
- Browser smoke checked desktop and 390px mobile vertical scroll on Today; lint and build pass.
- If the manual gym tests pass, this branch is ready for V3 Training Intelligence v1 / algorithm iteration work.

### Current verification

- **Lint:** passing (`eslint .`)
- **Build:** passing (`tsc -b && vite build`)
- **Browser smoke:** app loaded on local dev server at `http://127.0.0.1:5175/`; Today and Week page rendered after the changes.

### Remaining follow-up

- Full manual gym-flow verification is still recommended for requirement caps, Discard Draft, and Today gating against real local user data.

#### BUG-D — Recommendation scoping needs verification

**Intended behavior (implemented but not yet verified end-to-end):**
- Set 1 rated Easy → recommendation "Suggestion from Set 1 / Use X for this set" appears only on Set 2.
- Moving to Set 3 hides Set 1's suggestion.
- Returning to Set 2 shows it again if not applied.
- Applying shows compact `✓ Applied to this set` and removes the Apply button.
- Each subsequent set generates its own independent recommendation.
- setRating=5 + actual RPE ≤ target RPE must never recommend decreasing.

**Needs:** Manual verification by Codex against `setAdjustment.ts` logic and `isOnSuggestionTarget` gating in LiveLogger.

**Relevant code:**
- `isOnSuggestionTarget` + suggestion rendering in `LiveLogger` (~line 1030 area)
- `setAdjustment.ts` in `src/lib/algorithms/`
- `persistedAppliedRec` derivation

#### BUG-E — Set navigation / Update Set mode needs verification

**Intended behavior (implemented but not yet verified):**
- Tapping a logged set pre-fills the form with that set's values.
- Logging normally advances the cursor without leaving "Update Set" mode active.
- `setSelectedSetIndex(null)` is called on normal `logSet` path.

**Needs:** Verification that the stale `selectedSetIndex` bug is truly resolved and no edge case re-introduces it.

**Relevant code:**
- `selectedSetIndex`, `effectiveSetIndex`, `isEditingPastSet` in `LiveLogger`
- `logSet()` path, particularly the `setSelectedSetIndex(null)` call

#### BUG-F — Continuous loop week copying needs verification

**Intended behavior (implemented but not yet verified):**
- `copyWeekExercises` blocks copy when `splitDayId` values differ OR `focus` labels differ.
- Week 2 Lower day should not receive Week 1 Upper exercises.

**Needs:** Verification against a real 1-day/week continuous-loop block in the app.

**Relevant code:**
- `copyWeekExercises()` in App.tsx (~line 3875 area)
- `WeekEditor` mount `useEffect` pre-check

### Confirmed product rules to preserve

**Requirements**
- One exercise fulfills exactly one requirement slot. `fulfillsRequirementId` is the primary source of truth.
- Secondary muscles do not fulfill requirements (only `primaryMuscles` checked).
- Requirement caps are hard limits by default. `countFulfilled` is capped at `req.requiredExerciseCount`.
- Extra exercises require explicit "Add Extra Anyway" action (`isExtra=true`).
- Choose For Me must never add extras automatically.

**Week drafts**
- `isDraft=true` while WeekEditor is open.
- Exit Editor: keeps draft, closes editor.
- Discard Draft: restores snapshot, sets `isDraft=false`, closes.
- Save Week: sets `isDraft=false`, closes.
- Today must not show incomplete/draft weeks as trainable.

**Today**
- If `isWeekDraft` or `!isWeekPlanned`, hide workout card completely.
- "Go Off Program" is always available.

**In-progress sessions**
- Only one per user at a time.
- Starting a new workout archives the previous in-progress session.

**Recommendations**
- setRating 5/Easy + actual RPE ≤ target RPE: never recommend decreasing.
- Recommendation shown only on the immediate next set after the source set.
- Applied state persists via `applied=true` in DB.
- Each set generates its own independent recommendation.

### Recommended next Codex priorities (in order)

1. Fix BUG-A: requirement cap enforcement in Choose For Me and the program-generator path.
2. Fix BUG-B: WeekEditor Discard Draft snapshot timing / restore correctness.
3. Fix BUG-C: Today gating so `!isWeekPlanned` hides workout card regardless of `isDraft` flag.
4. Verify BUG-D: recommendation scoping and `setAdjustment.ts` logic.
5. Verify BUG-E: set tapping / Update Set mode.
6. Verify BUG-F: continuous loop week copying.
7. After all 6 are resolved: move to Training Intelligence v1 / Weight Estimator v1 (see ROADMAP.md).

### Architecture reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | All screens and UI components (~5000 lines) — main editing target |
| `src/types/domain.ts` | Core TypeScript domain model |
| `src/lib/db.ts` | IndexedDB load/save + `normalizeDatabase` migration |
| `src/lib/trainingMath.ts` | e1RM, RPE, readiness, set summaries, Week Review |
| `src/lib/programGenerator.ts` | Block/week/day generation — relevant for BUG-A |
| `src/lib/programmingLogic.ts` | `buildPlannedExerciseFromExercise` |
| `src/lib/algorithms/setAdjustment.ts` | Per-set recommendation logic — relevant for BUG-D |
| `src/lib/algorithms/loadPrescription.ts` | Weight estimator stub |
| `src/data/seedData.ts` | Built-in exercises and split templates |

---

## Current Project Status

- **Branch:** `v2.1-BugHotfix`
- **Build:** Passing (`tsc -b && vite build`)
- **Lint:** Passing (`eslint .`, no errors)

Modified files (cumulative on this branch, not yet committed):
- `src/App.tsx`
- `src/types/domain.ts`
- `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`

---

## V2 Final Gating Hotfix — Completed Work

### 1. Today Screen — Workout Card Hidden While Week Is Draft

**Problem:** Today showed a warning banner when `weekLocked` but still rendered the workout card, exercise list, navigation buttons, and "Edit Current Day" underneath it.

**Fix:** `weekLocked` derivation lifted from the IIFE inside the panel to the outer `TodayScreen` scope, using `isWeekDraft(todayPlan?.week)`. When `weekLocked === true`, the entire workout section is replaced by a `border-ember/40` notice panel containing:
- "Week N is being planned"
- "Finish planning and save Week N in the Week Planner…"
- "Continue Planning Week N" → navigates to Week tab
- "Go Off Program" → starts an off-program session

No draft exercises are shown. The normal card renders only when `!weekLocked`.

`showEditDay` and `WorkoutDayView` are also gated behind `!weekLocked`.

### 2. WeekEditor — Exit Editor / Discard Draft / Save Week

**Problem:** The only buttons were "Done — Save Week N" (marked saved) and "Cancel" (called `onClose` silently). Cancel's behavior was ambiguous — it kept `isDraft=true` in the DB.

**Fix:**

Three explicit buttons:

| Button | Behavior |
|--------|----------|
| **Save Week N** | Calls `updateDb` to set `isDraft=false`, then `onClose()`. Week is now trainable. |
| **Exit Editor** | Calls `onClose()` only. Week stays `isDraft=true`; Today remains locked. |
| **Discard Draft** | `confirm()` → restores `weekSnapshotRef.current` into DB + sets `isDraft=false` → `onClose()`. |

**Snapshot mechanism:** `weekSnapshotRef = useRef<WorkoutDay[] | null>(null)`. On the first render (before any edits), the component deep-clones `week.workouts` via `JSON.parse(JSON.stringify(...))`. WorkoutDayEditor auto-saves each edit, so the snapshot preserves the state at editor-open time. "Discard Draft" writes this snapshot back to the DB.

### 3. Planned-State Source of Truth

Three module-level helpers added above `builderDraftKey`:

```typescript
function isWeekDraft(week): boolean  // true when week.isDraft === true
function isWorkoutDayPlanned(day): boolean  // true when day has at least one exercise
function isWeekPlanned(week): boolean  // true when not draft AND has at least one planned day
```

`TodayScreen` now uses `isWeekDraft(todayPlan?.week)` directly.

### 4. Coach Suggestion — Scoped to Target Set

**Problem:** `recommendation` was derived from `lastNonSkippedSet` on every render and displayed regardless of which set was currently selected. Set 1's suggestion showed on Set 3, 4, etc.

**Fix:**

```typescript
const suggestionTargetIndex = lastNonSkippedSet ? lastNonSkippedSet.setNumber : -1;
const isOnSuggestionTarget = effectiveSetIndex === suggestionTargetIndex;
```

`lastNonSkippedSet.setNumber` is 1-based. The target 0-based set index for showing the suggestion equals `setNumber` (since target = the set after the last logged set, i.e., index = count of logged sets = `setNumber`).

Display gated on: `recommendation && !lastSetWasSkipped && isOnSuggestionTarget`.

**Navigation behavior:**
- Set 1 logged → `suggestionTargetIndex = 1` → show on Set 2 (index 1). ✓
- User taps Set 3 (index 2) → `2 !== 1` → hidden. ✓
- User returns to Set 2 → `1 === 1` → shown again if not applied. ✓

### 5. Suggestion Wording — "Apply to Current Set"

When showing on the target set, the language is now contextually correct:

| Element | Old text | New text |
|---------|----------|----------|
| Label | "Coach suggestion" | "Suggestion from Set N" |
| Title | "Increase next set" | "Use 80kg for this set" |
| Button | "Apply 80kg to Set 3" | "Apply to Current Set" |
| Applied state | Full card + "✓ Applied to Set 3" | Compact `✓ Applied to this set` badge |

The full card is replaced by a small `bg-volt/10` inline badge when `isApplied`. No Apply button persists.

### 6. New Per-Set Recommendations

Each logged set calls `algNextSetAdjustment` independently. `persistedAppliedRec` matches by `action.setId === lastNonSkippedSet.id`, so Set 2's applied recommendation does not block Set 3 from showing Set 2's new recommendation.

### 7. NumberField — Spinner + Clamping

**Problem:** NumberField only called parent `onChange` on `onBlur`, so browser spinner arrows (↑/↓) changed the local display but never committed the new value to app state.

**Fix:** Added `max?: number` prop. `onChange` handler now calls `onChange(parsed)` immediately for every valid change event (spinner arrows, keyboard, paste). `onBlur` clamps to `[min ?? value, max ?? value]` and commits the final clamped value.

Days/week field: `<NumberField ... min={1} max={7} />`.

### Files Modified (V2 Final Gating Hotfix)

| File | Changes |
|------|---------|
| `src/App.tsx` | `useRef` added to React imports; `isWeekDraft`, `isWorkoutDayPlanned`, `isWeekPlanned` helpers; `TodayScreen` weekLocked lifted + full card hidden; `WeekEditor` snapshot ref + `discardDraft` + renamed buttons; LiveLogger suggestion `isOnSuggestionTarget` gate + rephrased wording + compact applied state; `NumberField` `max` prop + immediate onChange + blur clamping; Days/week `min={1} max={7}` |

---

## V2 Final Bugfix — Completed Work

### 1. Requirement Counting Fix — One Exercise, One Slot

**Problem:** `countFulfilled` used legacy muscle matching with parent-child hierarchy, causing a `lats` exercise to count for both a `"lats"` requirement AND a `"back"` requirement simultaneously. Result: display showed 3/1 or 2/1 for a fully-filled slot.

**Fix:** New explicit-first logic with a strict legacy fallback:
```typescript
function countFulfilled(exercises, req): number {
  const explicit = exercises.filter((p) => p.fulfillsRequirementId === req.id && !p.isExtra).length;
  if (explicit > 0) return explicit;
  // Legacy fallback ONLY if NO exercise in the day has any fulfillsRequirementId set
  const anyTagged = exercises.some((p) => !!p.fulfillsRequirementId && !p.isExtra);
  if (anyTagged) return 0;
  // ... untagged muscle-matching path
}
```

`reqProgress` caps each count at `req.requiredExerciseCount` to prevent overcounting display.

### 2. Choose For Me Tags `fulfillsRequirementId`

**Problem:** `chooseForMe()` never set `fulfillsRequirementId` on the exercises it picked. All generated exercises were untagged, falling into the legacy muscle-matching path — which caused double-counting.

**Fix:** `chooseForMe()` now builds a `{ exercise, reqId }` pair list and tags `planned.fulfillsRequirementId = item.reqId` for every exercise it picks.

### 3. Add Extra Anyway Modal

**Problem:** No way to add a 4th exercise when a requirement cap was 3. The UI silently blocked adding more.

**Fix:**
- New `isExtra?: boolean` field on `PlannedExercise` (domain.ts).
- New `pendingExtraExercise: Exercise | null` state in `WorkoutDayEditor`.
- When `addExercise` detects `reqFull && !asExtra`, it calls `setPendingExtraExercise(exercise)` instead of proceeding.
- A confirmation modal appears: "Add Extra Anyway?" with the requirement name, current fill count, and a note that extras don't count toward slots.
- Extras get `isExtra = true`, `fulfillsRequirementId = undefined`.
- `countFulfilled` and `reqProgress` skip `isExtra` exercises so they never inflate the count.
- Extra exercises are displayed in the prescription list with an `extra` badge (grey pill) instead of a requirement badge.

### 4. New Active Block Archives In-Progress Sessions

**Problem:** Activating a new program from the Block Builder left any in-progress workout session alive. Today would still try to resume it, pointing at a block that was no longer active.

**Fix:** Inside `activateProgram`, before setting `program.status = "active"`:
```typescript
draft.sessions.forEach((session) => {
  if (session.userId === user.id && session.status === "in-progress") {
    session.status = "abandoned";
    session.updatedAt = nowIso();
  }
});
```

### 5. Coach Suggestion Applied to Correct Set

**Problem:** `applySuggestion` targeted `planned?.plannedSets[currentSetIndex]` — but this is the set currently being edited, which is the *same* set just logged, not the *next* one.

**Fix:** `logSet` tags the generated recommendation with `targetSetNumber = currentSetIndex + 2` (1-based next set):
```typescript
if (rec?.action) rec.action.targetSetNumber = currentSetIndex + 2;
```
`applySuggestion` uses `targetSetNumber` in the display label ("Apply 80kg to Set 3") and targets the `nextUnloggedPlanned` set for the `plannedWeight` write-through.

### 6. Recommendation Persists Across Navigation

**Problem:** `suggestionApplied` was React component state. Navigating away and back reset it to `false`, making the "Applied to next set" confirmation disappear.

**Fix:**
- `applySuggestion` now writes `rec.applied = true` to both `session.recommendations` and `db.recommendations` via `updateDb`.
- New derived value `persistedAppliedRec` reads from `liveSession.recommendations` on each render:
```typescript
const persistedAppliedRec = lastNonSkippedSet
  ? liveSession.recommendations.find((r) => r.action?.setId === lastNonSkippedSet.id && r.applied === true)
  : undefined;
```
- The apply button checks `suggestionApplied || !!persistedAppliedRec` for applied state.
- `applied?: boolean` and `targetSetNumber?: number` added to `Recommendation.action` in domain.ts.

### 7. Update Set Stale Mode Bug Fixed

**Problem:** After logging Set 1 normally, `currentSetIndex` advanced to 1. But `selectedSetIndex` (set to 0 when the user tapped Set 1's lineup item) was never cleared. On the next render, `selectedSetIndex (0) < currentSetIndex (1)` evaluated as true → `isEditingPastSet = true` → the form showed "Update Set" incorrectly.

**Fix:** `logSet` calls `setSelectedSetIndex(null)` on the normal logging path, clearing the edit-in-place state.

### 8. Today Screen Locked While Week Is Draft

**Problem:** The Week Editor could be open in one tab while the user tried to start a workout from Today in another. The planned week was mid-edit (incomplete exercises, placeholder sets).

**Fix:**
- New `isDraft?: boolean` field on `TrainingWeek` (domain.ts).
- `WeekEditor` mount `useEffect` sets `week.isDraft = true` in the DB.
- `WeekEditor.saveAndClose` sets `week.isDraft = false` before calling `onClose`.
- `TodayScreen` receives `editingWeekNumber?: number` prop (already threaded through App-level state).
- Lock logic:
```typescript
const weekBeingEdited = editingWeekNumber !== undefined && editingWeekNumber === currentWeekNumber;
const weekIsDraft = todayPlan?.week?.isDraft === true;
const weekLocked = weekBeingEdited || weekIsDraft;
```
- When locked: Start Workout button is disabled; a warning banner shows "Week N is being planned — finish planning before starting a workout"; a "Continue Planning Week N" button navigates to the Week tab.

### 9. Week Editor Day Selector Matches Draft Block Style

**Problem:** WeekEditor used pill tabs for day selection, but the Program tab's Weekly Overview (editable mode) used a 7-day calendar grid. The same WorkoutDayEditor was presented differently depending on which path opened it.

**Fix:** `WeeklyOverview` with `editable=true` now renders pill tabs (`Day N – SplitName` format) instead of the 7-day grid. The grid is only used in read-only mode.

### 10. Continuous Loop Week Copy — Tighter Mismatch Guard

**Problem:** `copyWeekExercises` only blocked copying when `sourceDay.splitDayId && targetDay.splitDayId && sourceDay.splitDayId !== targetDay.splitDayId`. This missed two failure cases:
- One day has `splitDayId` and the other doesn't (undefined vs. ID comparison was always false).
- Both days have no `splitDayId` but different `focus` labels (e.g., "Push" → "Pull").

**Fix:**
```typescript
// Block if split day identities differ
if (sourceDay.splitDayId !== targetDay.splitDayId) return;
// Block if one has a split assignment and the other doesn't
if (!!sourceDay.splitDayId !== !!targetDay.splitDayId) return;
// Block if focus labels differ
if (sourceDay.focus && targetDay.focus && sourceDay.focus !== targetDay.focus) return;
```
The pre-check in `WeekEditor`'s `useEffect` was updated to mirror the same guard conditions.

### Domain Changes (V2 Final Bugfix)

```typescript
// PlannedExercise
isExtra?: boolean;   // exercises added beyond requirement cap

// TrainingWeek
isDraft?: boolean;   // true while WeekEditor is open

// Recommendation.action
targetSetNumber?: number;  // which set (1-based) the rec targets
applied?: boolean;         // true once applySuggestion was called
```

### Files Modified (V2 Final Bugfix)

| File | Changes |
|------|---------|
| `src/types/domain.ts` | `PlannedExercise.isExtra`, `TrainingWeek.isDraft`, `Recommendation.action.targetSetNumber`, `Recommendation.applied` |
| `src/App.tsx` | `countFulfilled` explicit-first with anyTagged guard; `reqProgress` capped + `extraExercises`; `pendingExtraExercise` state + modal; `addExercise` full requirement guard + extra path; `chooseForMe` tags `fulfillsRequirementId`; `activateProgram` archives in-progress sessions; `logSet` tags `targetSetNumber` + calls `setSelectedSetIndex(null)`; `persistedAppliedRec` derivation; `applySuggestion` persists `applied=true` in DB; recommendation UI checks `persistedAppliedRec`; `TodayScreen` week-draft locking; `WeekEditor` `isDraft` tracking; `WeeklyOverview` editable pill tabs; `copyWeekExercises` tighter mismatch guard |
| `src/lib/algorithms/setAdjustment.ts` | Rewritten: setFeel 1–5 matrix with correct Easy/5 never-decreases rule; RPE delta and missedReps combined correctly; `fatiguePerSet` computation; `enforceDirectionCheck` guard in `buildRec` |

---

## V2 Gym-Test Hotfix 2 Changes

**CSS / Layout:**
- `styles.css`: `overflow-x: hidden` → `overflow-x: clip` on `html, body, #root`. Fixes vertical scroll being blocked on some browsers.

**Today Screen:**
- "Edit Current Day" only shown when `selectedDay.exercises.length > 0` (week must be planned).
- No-block state: "Go Off Program" renamed → "Start Individual Workout".
- "Go Off Program" / "Start Individual Workout" now opens an **Off-Program Builder** instead of immediately creating a blank session. Builder: pick exercises, set targets (sets/reps/RPE), see last-logged weight, then Start. "Start Empty Session" still available.

**Logger:**
- Skip Set button opens a reason picker (chips: Fatigue, Pain, Poor form, Time, Other + skip without reason). Reason stored in set notes.
- Set lineup: all logged sets (including skipped) are now tappable. Tapping a skipped set pre-fills from the planned set targets.
- `setRating=5` can no longer trigger a load reduction. Guards added to `missedReps` and `formPoor` branches in `setAdjustment.ts`.

**Week Tab:**
- `planningWeekNumber` lifted to App-level `editingWeekNumber` state. Week Editor persists across tab navigation.
- Day tabs in Week Editor now use `Day N – SplitName` format (position-indexed, always unique).
- Each day card now has an "Edit" button (hidden for completed sessions) that opens an inline WorkoutDayEditor.

**Library:**
- Custom exercises (owned by user) now show a pencil Edit button. Clicking pre-fills the Custom Exercise form. "Add Exercise" becomes "Save Changes" while editing.

**Block Builder:**
- Removed the "Flow" info panel (Library > Block > Today). Not useful in practice.

---

## Tab Ownership (V2 Hotfix Final)

**Block tab (`programs` screen):**
- Owns block building, split selection, draft blocks, block activation, block history, program gap analysis.
- Does NOT show the active weekly overview when a block is already active. Active blocks show a compact summary card with a "View current week →" link to the Week tab.
- Weekly/day overview is only shown when a **draft** block is being reviewed or edited.

**Week tab (`week` screen):**
- Owns current week progress, per-day session summaries, completed workout review, and Week Review when the week is complete.
- Supports week history: a week selector shows all weeks in the active block; completed weeks remain accessible after advancing.
- Week Review shows when `isBlockWeekComplete` is true. It includes "Start Week N+1" and a "Plan Next Week" placeholder (coming soon).

**Analytics tab (`progress` screen):**
- Exercise analytics default to **Overall** mode (sorted by date, short date labels).
- **Current Block** mode filters to active block sessions, using `W{n}D{n}` labels to avoid duplicate W1 entries.
- e1RM chart titled "Estimated Progress" for non-barbell/non-strength exercises.
- Volume/tonnage is not shown in exercise analytics.

**Today / Logger:**
- Off-program exercise additions show a scope modal: "This session only" (active) or "Future planned workouts" (disabled, coming soon).
- Added exercises are marked `offProgram: true` on `LoggedExercise` and do not alter the active block plan.

---
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

## V2 Gym-Test Hotfix — Completed Work

### Key Product Decisions

**Edit Current Day vs Go Off Program** (Today screen):
- "Edit Current Day" opens `WorkoutDayEditor` inline for the active planned day. Changes apply to that day/week only. Does not alter completed history.
- "Go Off Program" creates a free session (`offProgram: true`, no `workoutDayId`). User adds exercises via the logger's Add Exercise flow. Logged work saves to session/exercise history. Does not modify the active block or future weeks.

**Off-program sessions** are identified by `WorkoutSession.offProgram === true`. They have no `programId`, `blockId`, or `workoutDayId`. All `LoggedExercise` items in the session have `offProgram: true`.

**Skip last set auto-advance**: `skipSet()` now checks `isCurrentSetLastPlannedSet`. If the skipped set is the last planned set of the current exercise, it automatically navigates to the next exercise or finishes the workout. No extra click needed.

**Set lineup tappable on mobile**: Completed set items in the lineup have `cursor-pointer` and an `onClick` handler. Tapping pre-fills the Weight/Reps/RPE/rating form fields with that set's actual values for reference. The completed set remains in the log; this is a reference/copy feature, not a re-log.

**Prescription number inputs fixed**: `NumberField` now uses local string state. The input allows free typing (including backspace and clear). The parent `onChange` is only called on blur. RPE sanitization (`sanitizeRpe`) runs on the parent's blur callback. Preview text ("3 sets · 8 reps · RPE 7") stays in sync because it reads from the db-persisted value, which updates on blur.

**Recommendation "increase" label fix**: `setAdjustment.ts` compares `suggestedWeight` (after rounding to increment) to `loggedSet.actualWeight`. If they are equal and the title was "Small increase available" or "Consider a small increase", the title becomes "Maintain load" and no Apply button is shown.

**Continuous-loop week copy**: `copyWeekExercises()` skips any workout day where `sourceDay.splitDayId !== targetDay.splitDayId`. WeekEditor shows a banner when copying was skipped due to split day mismatch. Day tabs show the split day name from the split template.

**Exercise swap metadata**: `PlannedExercise` now has `originalExerciseId?`, `replacementExerciseId?`, `swappedAt?`, `swapScope?` fields in domain.ts. These are ready for future swap-tracking UI. No write path exists yet — tracked as TODO.

**Movement patterns hidden**: Custom exercise form hides movement patterns under an "Advanced Options" toggle. `SplitDayEditor` already did this; LibraryScreen now matches.

**Block name placeholder**: Block Builder name field shows `"e.g. Powerbuilding Block"` placeholder. Default is empty string — no pre-population.

**Mobile overflow protection**: `overflow-x: hidden; max-width: 100%` added to `html, body, #root` in `styles.css`. Specific element-level overflow issues require screenshots for targeted fixes.

### Files Modified (V2 Gym-Test Hotfix)

| File | Changes |
|------|---------|
| `src/types/domain.ts` | `WorkoutSession.offProgram?: boolean`; `PlannedExercise` swap metadata fields |
| `src/lib/algorithms/setAdjustment.ts` | Fix "increase" label when `suggestedWeight === actualWeight` after rounding |
| `src/App.tsx` | `TextField` placeholder prop; `NumberField` blur-commit pattern; `TodayScreen` Edit Current Day + Go Off Program; `LiveLogger` off-program empty session guard; `skipSet()` last-set auto-advance; set lineup tappable items; custom exercise Advanced Options for movement patterns; `copyWeekExercises()` split day compatibility; `WeekEditor` split day context + copy label |
| `src/styles.css` | Global overflow-x protection |
| `BUGS.md` | New bugs section for gym-test hotfix; mobile overflow noted as high-priority |
| `HANDOFF.md` | This section |

### Intentionally Deferred (V2 Gym-Test Hotfix)

- Exercise swap write path — data model ready, no UI for recording a swap yet.
- Off-program session display in archive/history — marked `offProgram: true` in db, history UI doesn't yet show the flag visually.
- Specific mobile overflow element fixes — need screenshots.
- Weight Estimator v2, cloud sync, algorithm overhaul — out of scope for this pass.

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
