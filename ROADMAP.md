# ROADMAP.md

## V3.1C Exercise Metadata Hardening — Completed

- Added `ExerciseFatigueProfile`, `ExerciseSpecificity`, `ExercisePrescriptionProfile` interfaces to domain types.
- Extended `MovementPattern` with 6 supplemental values (incline-press, knee-extension, hip-extension, shoulder-abduction, spinal-extension, trunk-stability).
- Added `exerciseFamily`, `variationGroup`, `fatigueProfile`, `specificity`, `prescriptionProfile`, `defaultRoleByGoal` optional fields to `Exercise`.
- Applied rich metadata to 17 key seed exercises.
- Added `getExerciseRoleForGoal` helper; updated `scoreExerciseForSlot` to use it plus exerciseFamily/variationGroup diversity penalties and fatigueProfile fine-grained fatigue checks.
- `getPrescriptionForExerciseSlot` now applies prescriptionProfile overrides (rep/RPE/set range, avoidLowRepLoading).
- `getRequirementSlotPlan` triceps powerlifting press-day slot 1 → `secondary_compound`.
- `analyzeProgramGaps` now emits goal/block-aware warnings: peaking accessory overload, deload volume, bodybuilding diversity, general-health pattern gaps, maintenance volume cap.
- `normalizeDatabase` copies new metadata from built-in exercises to stored exercises that are missing it.

## Next Recommended Step

1. Wire `getExerciseRoleForGoal` and `prescriptionProfile` into next-week progression suggestions.
2. Expand rich metadata to remaining seed exercises beyond the initial 17.
3. Add unit tests for `programmingRules.ts` scoring and prescription logic.

## V3.1B Constraint-Aware Program Optimization — Completed

- Added constraint-aware slot scoring that respects user requirements while improving exercise diversity.
- Added day fatigue budgeting for SBD/main fatigue, low-back fatigue, hinge fatigue, axial loading, and pressing load.
- Added repeat limits for exact exercises and repeated bench-style variations.
- Added advisory warnings for repetition, recoverability, and split optimization difficulty.
- Kept split requirements user-controlled and preserved the hard requirement-cap behavior.

## Next Recommended Step

1. Add richer exercise metadata and seed-library coverage so the constraint system has better fallback choices.
2. Extend these constraints into week-to-week progression and deload decisions.
3. Add focused manual verification around hard-to-optimize user-created splits before broader generator changes.

## V3.1A Programming Rules Adjustment — Completed

- Added exercise-role-based requirement slot planning.
- Added dynamic prescription rules by goal, block type, day focus, role, and fatigue.
- Preserved hard requirement caps and user-controlled slot counts.
- Improved `Choose For Me` and generated plans so they prefer better role diversity inside repeated muscle requirements.
- Kept program balance guidance advisory instead of auto-overriding user intent.

## Next Recommended Step

1. Extend these role rules into next-week progression suggestions.
2. Add more exercise metadata depth where the current seed library is still thin.
3. Keep full Training Intelligence and broader weight-estimation expansion as later layers, not part of this programming pass.

## V3.1 Training Intelligence Foundation — Completed

- Added `src/lib/trainingIntelligence/` as the central deterministic recommendation layer.
- Added research-backed goal/block defaults through `trainingRules.ts`.
- Added readiness cleanup scaffold with baseline-centered scoring and conservative load modifiers.
- Added set performance scoring, observed e1RM, normalized e1RM scaffold, same-exercise baselines, recommendation confidence, and concise reason text.
- Lightly wired recommendations into planned workout cards, off-program starting weights, live logger weight analysis, and generated planned-set weights.

## V3.2 Recommended Next Step

1. Use the new same-exercise baseline and confidence outputs for next-set progression decisions.
2. Add next-week progression wiring that suggests load/reps/set changes without auto-applying them.
3. Expand normalized e1RM and confidence rules before attempting any exercise-family transfer logic.
4. Keep analytics/settings overhauls deferred until the recommendation layer has more real usage behind it.

## Codex V2 Final Stabilization — Current Status

**Goal:** Resolve all blocker bugs before beginning Training Intelligence v1 / Weight Estimator v1.

### Priority order

0. **Verify V2 final usability blockers**
   - Status: Final bugfixes are fixed in code; needs manual gym-flow verification.
   - Block Planner reset now clears draft program state and hides stale Weekly Overview output.
   - Skip This Workout now abandons the matching WIP session so Week status changes from in progress to skipped.
   - Today mobile action buttons now stack cleanly with Start/Resume as the primary action.
   - Desktop and mobile vertical scrolling restored; bottom nav should no longer hide final controls.
   - Off-program prefilled starting weights persist into session planned set state.
   - Manual first-set weights carry forward to the next blank target set.
   - Easy/Hard recommendations use the actual prior set weight as the base.
   - Off-program completed history counts all valid completed sets and preserves set data.
   - Exercise Library supports editing seed and user-created exercises without changing IDs.
   - Mobile Today/Live Logger should fit 390-430px viewports with normal vertical scrolling and no bottom-nav cover.
   - Recommendations recompute after skip, back, edit, setRating correction, and manual weight input.
   - Set lineup tapping/editing works for pending, completed, and skipped sets.
   - Completed and off-program sessions can be reviewed/edited from Week history.
   - Week Editor distinguishes Planned Day Editor from Completed Session Review.
   - Training Intelligence v1 / V3 can start after these checks pass.

1. **Fix BUG-A — Choose For Me requirement cap enforcement**
   - Status: Fixed in code; needs real-data manual verification.
   - `chooseForMe()` in `WorkoutDayEditor` must never exceed `req.requiredExerciseCount`.
   - `programGenerator.ts` must respect `SplitDayRequirement` slots, not just `muscleGroups`.
   - Extras require explicit user action; Choose For Me never auto-adds them.
   - Verification: requirements stay at or below cap after any generated plan.

2. **Fix BUG-B — WeekEditor Discard Draft snapshot timing**
   - Status: Fixed in code; needs real-data manual verification.
   - `TrainingWeek.savedWorkoutsBeforeDraft` is captured before draft edits/copying.
   - Discard restores that saved baseline or empties an unsaved week, then clears draft metadata.
   - Verification: add exercises, click Discard Draft, exercises are gone.

3. **Fix BUG-C — Today hides workout card for unplanned weeks**
   - Status: Fixed in code; needs real-data manual verification.
   - `weekLocked` uses `!isWeekPlanned(todayPlan?.week)` and `isWeekDraft(...)`.
   - Verification: week with exercises but `isDraft` not set → no workout card shown.

4. **Add direct planned-exercise swap/edit controls**
   - Status: Fixed in code; needs manual verification.
   - Keep the working Choose For Me cap enforcement intact.
   - `WorkoutDayEditor` now allows single-exercise swap without deleting the whole day.
   - Preserve sets/reps/RPE when swapping where reasonable.

5. **Debug Easy/5 recommendations and manual weight carry-forward**
   - Status: Fixed in code; needs manual verification.
   - Use the previous actual set as the next-set baseline unless a planned/recommended target set weight exists.
   - Recommendation identity should follow source set plus target set.
   - Confirm Easy/5 produces increase-or-maintain, including after prior applied decreases.

6. **Fix week planned/completed truth and end-of-block state**
   - Status: Fixed in code; needs manual verification.
   - Empty week shells must stay unplanned.
   - Last week/day of a block must not trigger Week `N+1` planning prompts past `block.lengthWeeks`.
   - Show Block Complete review/archive/repeat/new-block actions instead.

7. **After all 6 resolved: Training Intelligence v1 / Weight Estimator v1**
   - Next step after code merge: manual verification of the V2 stabilization scenarios.
   - Only begin V3 after the stabilization checks pass and no workout-blocking bug remains.

---

## V2 Final Gating Hotfix — Completed

- Today hides workout card and exercise list completely when current week is draft/locked.
- WeekEditor has three explicit buttons: Save Week (clears draft), Exit Editor (keeps draft), Discard Draft (restores snapshot + clears draft).
- `weekSnapshotRef` captures week workouts at editor-open time; Discard Draft restores from it.
- Coach suggestion scoped to the single target set only (Set N suggestion shown only while on Set N+1; hidden on all other sets).
- Suggestion wording rephrased: "Suggestion from Set N" / "Use X for this set" / "Apply to Current Set".
- Applied suggestion shows compact inline "✓ Applied to this set" badge; full card dismissed.
- Each logged set independently generates a new recommendation for its immediate next set; no cross-set blocking.
- NumberField: `max` prop added; spinner arrows now call onChange immediately; blur clamps to [min, max].
- Days/week input: min=1, max=7, spinner works.
- `isWeekDraft`, `isWorkoutDayPlanned`, `isWeekPlanned` module-level helpers added as planned-state source of truth.

## V2 Final Bugfix — Completed

- Requirement counting: one exercise fills one slot. `isExtra` flag for exercises added beyond the cap. "Add Extra Anyway" confirmation modal.
- `chooseForMe` now tags `fulfillsRequirementId` on every picked exercise.
- Activating a new block archives any in-progress sessions.
- Coach suggestion targets the correct next set (`targetSetNumber`). Applied state persists across navigation (`applied` flag in DB + `persistedAppliedRec` derived value).
- "Update Set" stale mode fixed: `setSelectedSetIndex(null)` called in normal `logSet` path.
- Today locked while week is draft: `WeekEditor` sets `isDraft=true` on mount, `false` on save. `TodayScreen` checks `weekLocked = weekBeingEdited || weekIsDraft`.
- WeeklyOverview editable mode uses pill tabs (not 7-day grid) matching WeekEditor style.
- `copyWeekExercises` mismatch guard tightened: checks `splitDayId` equality (covers undefined vs. ID) + focus label mismatch.
- `setAdjustment.ts` fully rewritten: correct setFeel 1–5 matrix, Easy/Slightly-Easy never-decrease guarantee, `enforceDirectionCheck` guard in `buildRec`.

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

## Exercise Families and Variations (Design Note)

Exercises currently exist as a flat list. The planned long-term model is a **family/variation hierarchy**:

### Concept
- **Exercise family**: the canonical movement (e.g., "Bench Press", "Squat", "Row")
- **Variation**: a specific implementation of the family (e.g., "Incline Barbell Bench Press", "Low Bar Squat", "Seated Cable Row")
- Families share muscle targeting, pattern classification, and swap eligibility
- Variations have specific equipment, grip, range-of-motion, and difficulty modifiers

### Why It Matters
- Exercise swaps can target the same family with a different variation (e.g., swap DB Bench for Incline BB Bench — same chest family)
- Volume counting can aggregate across variations of the same family
- Autoregulation and progressive overload can track family-level strength trends even when the athlete rotates variations
- "Substitution" becomes "pick another variation from this family" rather than a hand-curated list

### Data Model Sketch
```typescript
// On Exercise
familyId?: ID;           // links to an ExerciseFamily
variationKey?: string;   // e.g. "incline", "close-grip", "paused"

// New domain type
interface ExerciseFamily {
  id: ID;
  name: string;           // "Bench Press"
  muscleGroup: MuscleGroup;
  primaryMuscles: MuscleGroup[];
  movementPatterns: MovementPattern[];
  notes?: string;
}
```

### Implementation Notes
- `ExerciseFamily` entries should be seeded for the major compound movements first (SBD + row + OHP + pull)
- Existing exercises can be retroactively linked via a normalization pass in `normalizeDatabase`
- The swap UI in LiveLogger should eventually show same-family alternatives
- Program generator can randomize across family variations for variety

---

## Deferred Backlog (No Timeline)

- Full public CSV importer (infrastructure exists in `src/lib/importers/`, not yet wired to UI fully)
- Exercise variation grouping (see Exercise Families section above)
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
