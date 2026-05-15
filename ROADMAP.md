# ROADMAP.md

## Algorithm Phase 1: Observed e1RM + Reverse Prescription — Completed (Session 17)

### Delivered
- `calculateObservedE1RMResult()` — structured RPE-aware Epley e1RM with metadata
- `prescribeLoadFromObservedE1RM()` — reverse Epley prescription with two guardrails
- `deriveActualRpeFromFeel()` — feel (1–5) → actual RPE mapping relative to target RPE
- `adjustTargetRpeForReadiness()` — small readiness modifier on target RPE (±0.25–0.75)
- Live logger `buildSetRecommendation()` replaced with the new e1RM pipeline
- All spec math examples verified; critical bug (297.5 lb) cannot reproduce with new math

### Next steps
- Manual gym-flow verification of suggestion copy and rounding
- **Algorithm Phase 2: Nominal e1RM** — trend-adjusted, readiness-normalised e1RM using:
  - observed e1RM from multiple sessions
  - readiness score and workout score
  - set feel / fatigue signal
  - recent trend weighting
  - exercise variation relationship
  - confidence decay over time
- Pre-workout recommendation panel (before session starts) should also use the new e1RM pipeline instead of the baseline multiplier approach in `recommendWeightForExercise()`

## Completed Set Editing + True Delete Flow Fix — Completed (Session 16)

### Delivered
- Split logger state into explicit logging vs editing behavior.
- Added session-local lineup items so planned rows, completed rows, and extra rows are handled more predictably than raw index matching.
- Enabled deletion of pending planned sets as well as completed/skipped sets.
- Prevented completed-set taps from leaking values into the current logging draft.

### Next steps
- Manually verify multi-step edit/delete flows in the gym logger, especially after deleting an early set and then resuming the workout later.

## Swipe Delete Visual + Actual Delete Fix — Completed (Session 15)

### Delivered
- Hid the orange delete background until a row is actively opened by swipe.
- Made the foreground completed-row card opaque so the delete surface no longer shows through when closed.
- Changed Delete so it removes the logged set and hides that planned slot for the current session instead of reverting it into a normal pending row.
- Kept Skip as a separate explicit skipped-set action.

### Next steps
- Manually verify the session-local hidden planned-slot behavior on real workout flows, especially deleting an early planned set after logging multiple completed sets.

## Swipe Delete Device Behavior Fix — Completed (Session 14)

### Delivered
- Added device-gated swipe behavior using a coarse-pointer media query.
- Disabled swipe reveal on desktop and switched desktop completed-set rows to a compact trash-button delete flow.
- Added cleanup so stale mobile swipe-open state is cleared when the logger resumes, changes exercise, or enters desktop mode.

### Next steps
- Manually verify the device detection on real desktop and phone/tablet hardware, especially if any hybrid touch laptops are part of the target use cases.

## Resume Workout Swipe Null Crash Fix — Completed (Session 13)

### Delivered
- Made the completed-set swipe offset logic null-safe so resume no longer crashes when `swipeState` is missing.
- Cleared transient swipe/delete UI state on logger re-entry.
- Added safe cleanup for stale open swipe ids and out-of-range pending delete indexes.

### Next steps
- Manually verify resume after swiping a set open, and confirm delete/cancel/confirm flows still feel correct afterward.

## Resume Workout Blank Page Hotfix — Completed (Session 12)

### Delivered
- Added a shared resume-validation path in `src/App.tsx` for Today resume buttons and the header `Live` button.
- Repaired stale logger pointers before render by validating the active session, active exercise, and current set index.
- Added logger recovery panels for unrecoverable or empty in-progress sessions so resume cannot fail into a blank screen.
- Clamped saved set navigation state after delete so resume remains valid after removing a completed set.

### Next steps
- Manually test stale-session recovery paths in the browser/device flow, especially resume after deleting sets and resume after editing or removing exercises from the library.

## Swipe Delete UX Fix — Completed (Session 11)

### Delivered
- Replaced the multi-open swipe behavior in the live logger with a single-open row model keyed by set id.
- Added stricter gesture gating so swipe reveal only opens after a meaningful horizontal drag and no longer fights normal vertical scrolling.
- Cleaned the swipable row layout so the delete background stays behind the sliding content and rows snap closed/open more cleanly.
- Made tap-outside and tap-while-open close the swipe row reliably.

### Next steps
- Real-device verification is still useful to tune the exact swipe threshold if needed, but the broken multi-open row behavior is fixed.

## Bodyweight Logger + RPE Reduction Hotfix — Completed (Session 10)

### Delivered
- Added `BW` / `BW + added load` display handling across the planned preview, live logger, recent-history panels, and completed-set table.
- Switched bodyweight logger input to an added-load model with `BW` placeholder instead of showing literal zero load.
- Prevented bodyweight sets from carrying forward into the next draft as a visible `0`.
- Strengthened next-set reduction logic so a large actual-vs-target RPE gap produces a meaningful percentage reduction before rounding.
- Added slightly stronger reduction floors for isolation/cable/machine work and clearer high-RPE reduction copy.

### Next steps
- Manually verify bodyweight set displays and the added-load placeholder on a real device in a gym flow.
- Live-test the new reduction floors across cable stacks, dumbbells, and barbell accessories to tune whether isolation reductions should stay this aggressive.

## Live Logger Preview + Mobile Delete Polish — Completed (Session 9)

### Delivered
- Unified the planned-workout preview cards with the live logger display-unit logic so preview badges, observed e1RM, recent performance, and rounding copy stay in the exercise display unit.
- Converted same-exercise recommendation baselines into the target display unit before generating preview recommendation text.
- Removed broken empty load labels like `- kg` / `- lb` from preview cards and live logger set rows.
- Added bodyweight-aware fallback copy: `Bodyweight` and `Added load optional`.
- Added swipe-left delete reveal for completed logger set rows on touch devices, while keeping a quieter fallback delete icon.
- Made the logger action bar sticky so the primary next-step action stays visible on mobile.

### Next steps
- Manually verify the swipe-delete feel on a real iPhone Safari session and tune the reveal threshold if needed.
- Consider a guarded “tap same feel twice to save” interaction only if live gym testing shows it improves speed without accidental advances.

## Data Management UX Simplification + Unified Import/Export — Completed (Session 8)

### Delivered
- Replaced the crowded Data Management button wall with:
  - `Import Training Data`
  - `Export Training Data`
  - `Backup`
- Added one unified import flow that auto-detects:
  - exercise baseline CSV
  - workout history CSV
  - `.xlsx` / `.xlsm` workbooks with `Exercises` and/or `Workout History` sheets
- Added one unified export action that downloads an Excel-compatible workbook with `Exercises` and `Workout History` sheets.
- Consolidated prompt helpers into one main AI formatting prompt and tucked advanced CSV actions behind collapsed sections.

### Next steps
- If a true `.xlsx` file becomes important, add a lightweight workbook dependency or a ZIP-based writer.
- Consider supporting multi-table pasted imports with repeated sections of the same type.
- Decide whether split/block tabs should also join the unified export workbook later.

## Importer Analytics + Baseline Fill Fix — Completed (Session 7)

### Delivered
- Imported exercise baseline rows now create analytics-visible history instead of only updating `exerciseBaselines`.
- Blank/zero baseline values now auto-fill safely from imported data.
- Meaningful existing baselines default to history-only conflict handling instead of silent overwrite.
- Exercise analytics now shows imported/logged recent history, most recent set details, and one-point non-blank behavior.
- Variation exercises can be viewed directly in analytics, and parent/child family analytics supports an `Include variations` view.
- Workout history CSV export now includes `source` and `e1rm`, including imported baseline/history rows.

### Next steps
- Add an import-history audit view so users can inspect prior exercise baseline merges and dedupe decisions.
- Consider expanding family analytics beyond explicit parent-child variations into broader `exerciseFamily` group rollups when that becomes useful.
- Decide whether imported baseline representative sets should later support a richer “set count” display in analytics without overstating actual logged volume.

## Exercise Baseline Importer + Merge Review — Completed (Session 6)

### Delivered
- Added exercise/baseline import support for:
  - Iron Orbit exercise CSV
  - legacy `Exercise, Weight, Set, Rep, RPE, e1RM` CSV
  - legacy workbook `Exercises` tab in `.xlsx` / `.xlsm`
  - pasted CSV in either supported schema
- Added a separate per-user `exerciseBaselines` layer so imported personal performance stays distinct from the default exercise library.
- Added conservative baseline merge review with no silent overwrite policy.
- Added variation suggestions and expanded exercise aliases for legacy spreadsheet names.
- Updated exercise CSV export to include baseline fields.
- Expanded Data Management actions with exercise import and prompt-copy helpers.

### Next steps
- Add an import history log so users can review prior exercise/baseline merges later.
- Add optional metadata merge controls for matched existing custom exercises when imported CSV contains richer library details.
- Support legacy binary `.xls` workbooks if that format still matters for the source spreadsheet.
- Reuse imported baselines in future weight-estimator logic without reintroducing seeded fake starter weights.

## Import/Export + UI Cleanup Phase — Completed (Session 5)

### Delivered
- CSV workout history import with exercise matching, review flow, and duplicate detection.
- Exercise CSV export and workout history CSV export.
- AI prompt template (copy-to-clipboard) for converting training logs into the expected CSV format.
- `DataManagementPanel` in Settings (Export Exercises CSV, Export Workout History CSV, Import Workout History CSV).
- `exerciseMatcher.ts` — normalized alias matching for common abbreviations (comp squat, bench, paused bench, lat pulldown, cable tris, db incline, etc.).
- ProgressScreen now uses `ProgramGapPanel` with built-in collapse: shows top critical issues, expands secondary via button.
- LibraryScreen exercise editor: on mobile (< xl), clicking Edit opens a full-screen overlay instead of scrolling past the exercise list.

### Next steps
- Add program/block export (JSON) for sharing a block structure between devices.
- Deepen exercise matcher: add edit-distance similarity for near-matches.
- Add import history log so the user can see what was imported and when.
- Add per-session delete for imported sessions in case of bad import.
- Wire imported session data into Analytics progression charts.

## Supabase Persistence Phase 1 — Completed

## Split Template Library Cleanup — Completed

- Curated the built-in split template library from 9 to 12 templates.
- Renamed PPL templates to shorter names (`Bodybuilding PPL 3-Day`, `Bodybuilding PPL 6-Day`).
- Added three new templates: Full Body 4-Day, Powerbuilding 5-Day, Conditioning + Strength.
- Implemented frequency-aware exercise slot counts:
  - 1x/week muscles (PPL 3-Day): more exercise slots per session (e.g., chest x2 on Push day)
  - 2x/week muscles (Upper/Lower, PPL 6-Day): one slot per muscle per session
  - 3x/week muscles (Full Body): one slot per muscle per session, minimal volume
- Corrected PPL 6-Day: removed misplaced rear-delts from Push B; removed front-delts from Push A; biceps reduced to x1/session; mid-back introduced as A/B variation with upper-back
- Corrected Maintenance templates: removed redundant front-delts slots (pressing covers it), reduced weekly set targets
- Corrected Deload: trimmed to 3 exercises per day at 2 sets each
- All templates have accurate descriptions and real per-muscle requirement counts

## Workout Expansion Cleanup — Completed

- Removed built-in fake starter weights from seeded templates and fresh local-profile defaults.
- Seeded workout/session history is now empty by default so fresh installs do not inherit fake suggested loads.
- Expanded the starter exercise library with richer metadata, added missing movements, and standardized default unit/increment/bodyweight/unilateral flags.
- Initial split template library built around explicit muscle requirement counts (9 templates).
- Added conservative weekly hard-set guidance and per-session exercise-count guidance in `trainingRules.ts`.
- Updated normalization so older local databases receive refreshed built-in exercises and split templates.

## Next Recommended Step

1. Manually verify the updated split library in the browser:
   - PPL 3-Day Push shows 2 chest slots, no front-delts slot
   - PPL 6-Day pull days show biceps x1; Pull B uses mid-back
   - Deload shows 3 sessions × 3 exercises × 2 sets each
   - Three new templates appear in the split picker
2. Wire weekly-volume and exercise-count guidance into split-quality warnings in the generator.
3. Keep future weight estimation based on real user history only; do not reintroduce seeded fake history.

- Added Supabase frontend client setup with env gating via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added email/password auth UI and state for sign up, sign in, sign out, and current signed-in email display.
- Removed the old visible fake/local user picker from the active UI.
- Added a startup mode gate when signed out so users intentionally choose local-only mode or account mode before entering the app.
- Made Supabase auth the only cloud identity source of truth.
- Added JSONB snapshot sync model using one `app_snapshots` row per Supabase auth user.
- Added startup load flow: local-only instance stays separate, while signed-in startup loads the cloud account snapshot directly.
- Added debounced auto-sync after local DB changes plus manual `Sync Now`.
- Preserved full local-only mode when Supabase env vars are missing or the user is signed out.
- Added `supabase/migrations/001_app_snapshots.sql` and `supabase/README.md`.
- Repair pass stabilized hydration and autosave:
  - hydrate only on initial session and `SIGNED_IN`
  - ignore `TOKEN_REFRESHED`/non-data auth events for app-state hydration
  - save to cloud from real local mutations instead of a broad `db` effect
  - treat seed/default local state as lower priority than a real cloud snapshot on fresh/incognito startup
  - choose the newer local source between IndexedDB and local backup
- Safe conflict handling now blocks accidental overwrites:
  - sign-in never auto-uploads meaningful local data over existing cloud data
  - normal startup/sign-in no longer shows a local-vs-cloud conflict popup
  - local-only storage and per-user cloud-cache storage are separated
  - `Import Local Data Into Cloud` is an explicit settings action
  - merge remains conservative and ID-based for known top-level collections

## Next Recommended Step

1. Manually verify cross-device persistence and Supabase table contents in a real configured environment.
2. Decide whether the next persistence pass should add stronger import/export tools and better merge previews before any schema normalization.
3. Resume V3 programming rules only after persistence testing is stable.

## V3 Phase 2: Goal/Block Programming Rules — Completed

- Added `goalOverride?: TrainingGoal` to `TrainingBlock`; `getGoalUsed()` resolves `blockGoalOverride ?? splitGoal ?? programGoal`.
- Added `getWeekProgressionModifier()` in `programmingRules.ts`: goal/block/week-aware RPE, reps, and set modifiers. Replaces the old flat `lateBlock +0.5 RPE` hack.
- Fixed `getRequirementSlotPlan` chest slot 1 for bodybuilding (was falling through to `hypertrophy_accessory` instead of `primary_compound`).
- `scoreExerciseForSlot` now adjusts scores by goal: bodybuilding/powerbuilding isolation bonus in later slots; maintenance/general-health penalty for high-fatigue exercises.
- `getGoalUsed()` wired into `chooseForMe`, `buildPlannedExerciseFromExercise`, `programGenerator.ts`, and `programAnalysis.ts`.
- `programAnalysis.ts` uses `effectiveGoal` (block-override-aware) for all conditional warnings.
- Added powerbuilding advisory warning when a day has no isolation or machine work.

## Next Recommended Step

1. V3 Phase 3: Wire `getFatigueProfile()` from `exerciseMetadata.ts` into the fatigue budget in `programmingRules.ts` for 7-dimension fatigue accounting.
2. Add block-editor UI for setting `block.goalOverride` so users can explicitly define a phase goal.
3. Add unit tests for `getWeekProgressionModifier` and `getGoalUsed`.

## V3 Phase 1: Exercise Metadata Foundation — Completed

- Added `axialFatigue?: FatigueLevel` as 7th dimension to `ExerciseFatigueProfile`.
- Extended `MovementPattern` with `"trunk-flexion"` and `"ankle-extension"`.
- Created `src/lib/exerciseMetadata.ts` — pure helper module: `normalizeExerciseMetadata`, `getExerciseFamily`, `getMovementPattern`, `getFatigueProfile`, `getSpecificity`, `getPrescriptionProfile`, `getRoleHint`, `isHighFatigueExercise`, `isLowBackFatigueExercise`, `isPressingFamily`, `isSbdMainLift`, `fatigueProfileToTag`.
- Extended all ~60 seed exercises with full metadata (exerciseFamily, variationGroup, fatigueProfile with axialFatigue, prescriptionProfile, defaultRoleByGoal).
- `normalizeDatabase` in db.ts now patches `axialFatigue` onto stored fatigueProfiles missing it.

## Next Recommended Step

1. Wire `exerciseMetadata.ts` helpers into the generator for family-level fatigue budgeting and diversity.
2. Use `getPrescriptionProfile` for next-week progression suggestions.
3. Add unit tests for `exerciseMetadata.ts` helper functions.

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

## Near-Term Follow-Up

- Add lightweight tests for unit conversion helpers and analytics history normalization.
- Sweep remaining workout-summary/read-only screens so all load displays use the shared exercise-unit formatter.
