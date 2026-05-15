# DECISIONS.md

## Completed Set Editing + True Delete Flow Fix Decisions (Session 16)

- The live logger needs an explicit distinction between “logging the active set” and “editing an existing set.” A single shared selected-set index is too brittle once completed-set editing and planned-set deletion are both supported.
- Tapping a completed set should always enter edit mode, not opportunistically repurpose the current logging draft.
- Deleting a pending planned set is a session-level workout modification. That planned slot should disappear for the current session instead of reappearing as a normal pending row.
- Skip remains a training outcome; Delete remains mistake correction / unwanted-set removal.

## Swipe Delete Visual + Actual Delete Fix Decisions (Session 15)

- Delete and Skip are different training actions. Delete is mistake correction and removes the set from the session; Skip is an intentional missed-set record and stays visible as skipped.
- For planned completed sets, deleting the logged completion should also hide that planned slot for the current session so the row does not bounce back as a normal pending set.
- The delete background should behave like a concealed action surface, not a persistent row background. It stays hidden until a swipe is actively open or dragging.

## Swipe Delete Device Behavior Fix Decisions (Session 14)

- Swipe-delete is a mobile/touch interaction, not a desktop interaction. Desktop rows should stay visually stable and use a compact explicit delete action instead.
- Device gating is based on coarse-pointer media-query detection instead of trying to support mouse-drag swipe behavior.
- If swipe is disabled for the current device mode, stale swipe-open UI state must be cleared immediately so desktop never renders a revealed delete panel.
- Feel-button auto-advance remains deferred. The sticky primary action is still the intended progression control for now.

## Resume Workout Swipe Null Crash Fix Decisions (Session 13)

- Transient swipe UI state is render-only state and must always be treated as optional. It should never be assumed present after navigation, resume, or list changes.
- Resume should clear swipe-open and pending-delete UI state on entry. That state is not meaningful workout data and should not survive logger re-entry.
- Completed-set row rendering should always use safe defaults when no swipe gesture is active.

## Resume Workout Blank Page Hotfix Decisions (Session 12)

- Resume entry points should validate session state before switching screens. Opening the logger first and hoping the saved pointers are still valid is too brittle.
- A resumable workout is not just any session with `status: "in-progress"`. The app should prefer sessions with valid exercise data and a repairable active pointer.
- The live logger must never assume that `currentExerciseIndex`, `currentSetIndex`, or the previously selected exercise id are still valid after edits like delete, skip, or library changes.
- When resume state is invalid or stale, the app should fail with a recovery panel and a clear Today message, never with a blank screen.
- Set deletion is mistake correction only, but it still has to update saved logger navigation state so later resume attempts stay valid.

## Swipe Delete UX Fix Decisions (Session 11)

- Swipe-delete in the live logger now uses a single open-row id (`openSwipeSetId`) instead of independent row-open state. This prevents multiple rows from remaining visually open together.
- Swipe should only commit to horizontal interaction after the gesture clearly beats vertical movement. Normal page scrolling takes priority until that horizontal intent is obvious.
- Tapping an open row is treated as a close action, not an edit action. This matches the “mobile list action” mental model and avoids accidental edits while a delete reveal is open.
- Canceling delete confirmation closes the row as well as the modal so the logger returns to a clean baseline state immediately.

## Bodyweight Logger + RPE Reduction Decisions (Session 10)

- For bodyweight movements, the logged weight field represents added external load only. Empty or zero added load should render as `BW`, not as `0 lb/kg`.
- Bodyweight display is semantic, not numeric. Preview cards, logger rows, and recent-history text should say `BW` or `BW + X lb/kg` rather than trying to convert bodyweight into a standard weight-unit placeholder.
- Bodyweight movements use different no-history guidance: `No recent added load. Use bodyweight or enter added load.` This is clearer than generic starting-weight language.
- When actual RPE is materially above target, the reduction intent must be preserved through rounding. The app now applies a minimum meaningful reduction percentage before rounding instead of allowing nearest-increment rounding to collapse the change into a token step.
- Isolation/cable/machine exercises tolerate somewhat larger relative downward adjustments than heavy compounds when RPE overshoots the target, because single-step rounding can otherwise under-correct accessories.
- If set feel and RPE conflict strongly, the logger now respects the high-RPE signal rather than blindly trusting the “easy” feel selection.

## Live Logger Preview + Mobile Delete Polish Decisions (Session 9)

- The planned-workout preview must use the same display-unit path as the live logger. Recommendation baselines are now converted into the exercise display unit before preview text is generated so one card cannot mix `kg` and `lb`.
- Preview cards should never show placeholder load strings like `- kg` or `- lb`. If no usable load exists, the card should either hide the badge or show clean guidance text instead.
- Bodyweight movements use semantic copy (`Bodyweight` / `Added load optional`) rather than pretending a load is missing.
- Set deletion in the live logger is treated as mistake correction, not training outcome. Deleted sets are removed entirely and should not count as skipped sets, hard sets, or fatigue signals.
- Mobile logger speed-up in this pass stays conservative: the primary action is made sticky/visible, but feel-button taps do not auto-advance. Avoiding accidental progression during training is more important than shaving one tap right now.

## Data Management UX Simplification + Unified Import/Export Decisions (Session 8)

- Data Management should speak in user goals, not file formats. The primary actions are now `Import Training Data`, `Export Training Data`, and `Backup`.
- Separate CSV tools remain available, but they are intentionally hidden under `Advanced CSV Options` so they do not dominate the default experience.
- A single AI formatting prompt now covers both exercises and workout history. Legacy Exercises-tab support is still preserved, but it is no longer presented as a primary top-level concept.
- Unified import should auto-detect workout-history CSV, exercise/baseline CSV, and supported workbook sheets instead of forcing the user to choose an importer first.
- Unified export should prefer one spreadsheet file over several technical exports. In this pass the app uses an Excel-compatible multi-sheet `.xls` workbook format because no workbook library is currently installed.

## Importer Analytics + Baseline Fill Decisions (Session 7)

- Imported exercise baseline rows now become real analytics-visible history, not just stored baseline metadata. The importer writes a completed off-program session with `source: "exercise_baseline_import"` plus a matching `exercisePerformanceLog` entry.
- For legacy baseline rows where `Set` means “number of sets represented,” the app stores one representative history set instead of cloning identical sets. This keeps trend analytics accurate enough without inflating fake session volume.
- Blank or zero baseline values are treated as missing. Imported performance can safely auto-fill those values.
- Meaningful non-zero existing baseline data is never silently replaced. Conflict defaults now bias toward `Add historical data` rather than overwrite.
- Exercise analytics remains exact-exercise by default. Variation-family aggregation is opt-in via `Include variations`.
- Parent/child analytics grouping is based on explicit variation relationships (`parentExerciseId`), not broader heuristic exercise-family matching.
- A single imported data point should still produce a useful analytics view. The UI now favors a recent-performance card and a one-point message instead of looking empty.

## Exercise Baseline Importer Decisions (Session 6)

- Imported exercise baselines are stored separately from `Exercise` records in a user-scoped `exerciseBaselines` collection on `TrainingDatabase`. This keeps the global exercise library clean and prevents imported personal numbers from behaving like built-in defaults.
- Seed/default exercises must still ship with blank/zero starting weights. Imported baseline data is explicitly personal history, not a seeded recommendation.
- Exercise import supports three source modes only in this pass:
  - Iron Orbit exercise CSV
  - legacy `Exercise, Weight, Set, Rep, RPE, e1RM` CSV
  - legacy workbook `Exercises` tab in `.xlsx` / `.xlsm`
- Legacy category headers are preserved only as import context. They can help review and matching, but they should not override stronger exercise metadata from a confident match.
- No silent overwrite policy:
  - imported baseline + no existing baseline → safe add
  - imported baseline + existing baseline → keep existing by default and require explicit user choice to replace
- “Add historical data” is implemented through `exercisePerformanceLogs`, not through synthetic seeded sessions or fake planned weights.
- Matched existing exercises are not automatically rewritten from imported metadata in this pass. The importer is focused on safe linking, custom creation, variation creation, and personal baseline merge behavior.
- Variation detection is suggestion-based, not automatic. Likely variations can default to a `create_variation` recommendation, but the user still confirms through review.
- Data Management remains the home for exercise import/export tools. The Library stays focused on browsing and editing exercises rather than acting as the main import workflow hub.

## Import/Export Decisions (Session 5)

- CSV import creates off-program `WorkoutSession` records only. It does not attempt to retroactively link imported sets to existing program blocks, templates, or planned exercises. This keeps import simple and non-destructive.
- Import deduplication uses a fingerprint of `date + exerciseId + set_number + weight + reps + rpe`. Missing set_number fields weaken duplicate detection for same-day re-imports but do not block imports.
- Exercise matching uses normalized aliases (hand-written table) + substring matching + word-overlap scoring. Auto-links on "high" confidence; flags medium/low for user review. This prevents silent duplicate exercises without requiring exact name matching.
- Imported sessions are tagged `offProgram: true` and carry a `notes: "Imported from CSV"` field. This distinguishes them from programmed sessions in future analytics filtering.
- The AI prompt template (in `importPrompts.ts`) is a copyable constant, not a live API call. The user copies it, pastes their log into any AI assistant, and pastes the resulting CSV back into the app.
- The mobile exercise editor overlay uses CSS-only Tailwind breakpoints (`xl:static`) rather than a JS resize listener. This avoids hydration issues and extra state.
- `DataManagementPanel` is added to Settings, not Library. Library already has enough controls; Settings is the natural home for data tools.
- Program Gaps in ProgressScreen now re-uses `ProgramGapPanel` (which already had group-by-category + show/hide secondary logic). No duplicate rendering code.

## Product Decisions

- The app is named Iron Orbit Training.
- The product should serve powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health users.
- The app should be mobile-first and installable as a PWA.
- The app should replace an Excel workout tracker first, then become a smart training coach later.
- Multiple local users are required. Local PIN login is acceptable for MVP.
- The app should recommend and explain, but never fight manual overrides.
- Weak spots should currently mean program gaps, not literal athlete weak points.
- Fresh installs should not ship with fake exercise load history, fake starter weights, or fake prescribed training loads. Default weights stay blank until user history exists.

## Architecture Decisions

- Vite React TypeScript was chosen for speed and simplicity.
- No backend exists in the current MVP.
- IndexedDB stores a single `TrainingDatabase` document through `src/lib/db.ts`.
- `src/lib/db.ts` also maintains a localStorage mirror backup of the same document to reduce refresh/restart data-loss risk. IndexedDB remains the primary persistence pattern.
- Supabase is the first cloud backend for persistence. Phase 1 uses Supabase Auth plus one JSONB snapshot row per Supabase auth user instead of a normalized training schema.
- The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. No service-role key belongs in the browser app.
- Supabase auth is now the only cloud identity source of truth. The old fake local user picker is removed from the active UI.
- Signed-out startup now stops at a mode gate. Users explicitly choose local-only mode or account mode before entering the main app.
- Local-only mode remains fully supported. Users can work without an account, but that data remains device-specific until they intentionally sign in.
- Local-first remains the core persistence rule even with Supabase enabled: local IndexedDB loads first and remains the working copy; cloud snapshot sync is additive.
- Local-only data and cloud-account cache data must live in separate storage lanes on the device.
- `TrainingDatabase.updatedAt` is the local snapshot timestamp used for Phase 1 latest-wins snapshot selection.
- Local data must never automatically overwrite an existing Supabase snapshot at sign-in time.
- Normal startup/sign-in should not present a repeated local-vs-cloud conflict modal. Cloud mode should simply load the Supabase-backed snapshot, while local-only mode loads only the local-only instance.
- Importing local-only data into a cloud account is an explicit settings action, not a login-time side effect.
- Merge behavior for explicit import is intentionally conservative and top-level ID-based. Same-ID items prefer the newer `updatedAt` when available; otherwise cloud wins. Full offline merge/conflict resolution is still deferred.
- Cloud snapshot hydration is allowed only during controlled lifecycle points: initial app load with a session and immediately after sign-in. After that, local state owns the session and cloud sync is push-only unless a future explicit "load from cloud" action is introduced.
- Auth events that do not imply a meaningful app-data change (`TOKEN_REFRESHED`, `USER_UPDATED`, etc.) must not rehydrate the training database.
- Cloud autosave should be scheduled from real local persistence mutations with debounce, not from a broad app-state/render observer.
- Fresh seed/default local state should not beat a valid cloud snapshot during sign-in/cross-device restore just because the local seed timestamp is newer.
- Existing old local/fake profile data is kept for compatibility, but hidden identity migration now maps the active local profile onto either:
  - a single local-only profile
  - the signed-in Supabase user ID
- Full relational normalization of workouts, programs, and logs is explicitly deferred until the data model settles further.
- Use `normalizeDatabase` in `src/lib/db.ts` to handle older local data after model changes.
- Domain types live in `src/types/domain.ts`.
- Seed data lives in `src/data/seedData.ts`.
- Programming logic lives in `src/lib/programGenerator.ts`.
- Program gap/hypertrophy dashboard logic lives in `src/lib/programAnalysis.ts`.
- Training math, RPE logic, readiness, set suggestions, and gym conversion learning live in `src/lib/trainingMath.ts`.
- UI is currently concentrated in `src/App.tsx`; this is acceptable for the first MVP but should eventually be split carefully.

## Workout-Programming Decisions

- Use transparent rules-based logic first, not ML.
- V3.1 Training Intelligence remains deterministic and explainable: no AI runtime, no black-box recommendation engine.
- Requirement counts are user intent and should be preserved; programming logic may improve exercise role mix inside those slots but should not silently reduce or rebalance them.
- Generated exercise selection now uses internal exercise roles and fatigue-aware slot planning.
- Constraint-aware optimization is the programming philosophy: respect the split, optimize within it, and warn when the structure is hard to optimize.
- Day-level fatigue budgeting and simple weekly repeat limits are acceptable deterministic constraints for generation.
- Advisory warnings about balance, repetition, or recoverability should stay concise and should not auto-rewrite the user’s split.
- Program balance warnings are advisory only; they should not override user-selected requirement counts.
- Use e1RM and RPE percentage charts for load estimates.
- Use readiness to reduce or slightly increase training stress.
- Use actual reps, actual RPE, set rating, form rating, muscle feel, pain, and fatigue signals for suggestions.
- Distinguish raw observed e1RM from lightly adjusted normalized e1RM.
- Recommendation v1 uses same-exercise history only; transfer prediction across variations is deferred.
- Program generation should use selected key exercises, goal, block type, days/week, block length, selected split days, priority muscles, and user history.
- Selected key lifts are exercise IDs, not free-text “Priority Lifts”.
- Program gap analysis should inspect active program structure:
  - Muscle volume.
  - Muscle frequency.
  - Pressing vs pulling balance.
  - Movement patterns.
  - Missing accessory categories.
  - Fatigue clustering.
- Default hypertrophy/bodybuilding prescriptions should generally bias moderate-to-higher reps and harder efforts on safer machine/cable/isolation work rather than forcing low-rep `4x6` style defaults everywhere.
- Default maintenance and deload templates should reduce total sets and avoid unnecessary exercise redundancy rather than simply cloning normal training with lower intent.
- Split templates remain user-controlled scaffolds. The app should optimize inside the requested structure and warn when a split is hard to optimize, but should not silently add extra exercises or override requirement counts.
- Weekly hard-set targets and per-session exercise-count guidance are advisory defaults for generation and future warnings, not hard locks.

## Split Template Library Decisions

- The canonical built-in split template list is the `splitTemplates` array in `src/data/seedData.ts`. Any future addition, removal, or change to a built-in template must happen there; `normalizeDatabase` in `db.ts` then propagates the change to all existing databases automatically on next load.
- Exercise slot counts in split day requirements are frequency-aware: if a muscle is trained 1x/week, the per-session slot count is higher to compensate; if trained 2x or 3x/week, one slot per session is sufficient. This is reflected in the seed data comment headers and in `notes` fields on individual days.
- Front delts are not given a dedicated requirement slot on push days that already include horizontal or incline pressing. Pressing exercises provide sufficient anterior-delt stimulus; a dedicated slot would cause redundant volume and crowd out more productive slots.
- Rear delts are never placed in a push-day requirement. They are a horizontal-pull muscle and belong on pull days.
- Mid-back is used as the pull-day B slot for back thickness in PPL 6-Day to create A/B variation with upper-back. Pull A emphasizes upper-back/traps; Pull B emphasizes mid-back/rhomboids.
- Maintenance templates prioritize major movement pattern coverage over accessory completeness. Arms and calves are omitted from Maintenance 2-Day; front-delts are replaced with side-delts across maintenance days because pressing already covers the anterior shoulder.
- Deload templates use 3 exercises per day at 2 weekly sets per muscle. Conditioning is optional during deload. The goal is movement quality exposure, not stimulus.
- The three new templates (Full Body 4-Day, Powerbuilding 5-Day, Conditioning + Strength) follow the same ID-based normalization contract as existing built-ins. They will be auto-inserted into databases that do not yet contain them.

## Workout Expansion Cleanup Decisions

- Existing `defaultRoleByGoal` remains the canonical role-hint storage, but `roleHints` now aliases that metadata shape so richer seed metadata can be stored without breaking existing generator code.
- `defaultUnit` / `defaultIncrement` remain the canonical unit and increment fields. The cleanup adds `increment`, `isTimeBased`, `isBodyweight`, and `isUnilateral` as convenience metadata, but normal UI should keep those details hidden unless advanced options are explicitly shown.
- Built-in split templates are now refreshed by seed/template ID during normalization for non-user-owned templates so older installs receive updated requirement structures automatically.
- Built-in exercise definitions are refreshed by built-in exercise ID during normalization for non-user-owned exercises so older installs receive corrected names, movement patterns, and metadata.

## V3 Phase 1 Exercise Metadata Foundation Decisions

- `axialFatigue` is an optional 7th dimension on `ExerciseFatigueProfile`. It captures spinal/axial loading stress separately from low-back fatigue. Exercises like competition squat and deadlift have "high"; most upper-body and machine movements have "low".
- `"trunk-flexion"` and `"ankle-extension"` were added to `MovementPattern` to cover cable crunches/hanging leg raises and calf raises respectively, avoiding overuse of "isolation" for exercises with distinct movement patterns.
- `exerciseMetadata.ts` contains only pure functions — no DB access, no side effects. All functions take an `Exercise` and return a derived value with safe defaults, so callers can use them unconditionally without checking if metadata fields exist.
- `normalizeExerciseMetadata` derives all missing fields from existing exercise properties at runtime. It is NOT used for migration (that stays in `normalizeDatabase`); it's for runtime use when callers want guaranteed completeness.
- `fatigueProfileToTag` converts the 7-dimension profile back to a simple "low"/"moderate"/"high" scalar by taking the worst-case dimension across the profile. This allows legacy code using scalar fatigue tags to continue working.
- `roleHints` in the spec maps to the existing `defaultRoleByGoal` field — they are functionally identical. `getRoleHint` reads from `defaultRoleByGoal`; no rename was done to avoid breaking existing generator code.
- For exercises with invalid `movementPattern: "isolation"` that have a more specific pattern (curls → "elbow-flexion", triceps extensions → "elbow-extension", leg curls → "knee-extension"), the original field was updated and the duplicate removed. This is correct — "isolation" was a placeholder, not an intentional pattern value.

## V3.1C Exercise Metadata Architecture Decisions

- `exerciseFamily` is a plain string label (e.g., `"bench_press"`, `"squat"`) that groups closely related movements; it is not a normalized FK. Diversity penalties in the generator use it as a soft constraint.
- `variationGroup` is a more specific string (e.g., `"competition_bench"`, `"close_grip_bench"`) used for stronger same-variation penalties and weekly repeat tracking.
- `ExerciseFatigueProfile` has 6 dimensions (systemic, local, jointStress, lowBack, pressing, grip) using the existing `FatigueLevel` type ("low" | "moderate" | "high" | "very_high"). This is separate from the existing scalar `fatigueRating`; both coexist for backward compatibility.
- `ExerciseSpecificity` stores squat/bench/deadlift relevance scores (0–1) for potential future peaking-block weighting. Not yet used in prescription logic.
- `ExercisePrescriptionProfile` constrains prescriptions from the exercise side. The generator goal/block logic runs first, then prescriptionProfile clamps or floors reps/RPE/sets. Goal/block rules take precedence unless prescriptionProfile overrides would pull in the same direction (e.g., `avoidLowRepLoading` raises the floor).
- `defaultRoleByGoal` allows per-goal role overrides. `getExerciseRoleForGoal` checks this map first, then falls back to `inferBaseExerciseRole`. This is the canonical role source for scoring.
- Triceps slot 1 on powerlifting/strength days is treated as `secondary_compound` so close-grip bench or dips score higher than pure isolation in those contexts.
- Goal/block-aware warnings are advisory only (no auto-rewrites). Peaking/deload block warnings check accessory count and total set estimates. Bodybuilding/general-health diversity checks fire at ≥3 same-pattern exercises per day.
- `normalizeDatabase` is the single migration path: new metadata fields are copied from builtInExercises to stored exercises that lack them on load.

## V3 Phase 2 Goal/Block Programming Rules Decisions

- `goalOverride?: TrainingGoal` on `TrainingBlock` is the explicit block-level goal. It takes precedence over `block.goal` (historical metadata field), which takes precedence over `program.goal`. `getGoalUsed()` encodes this priority chain.
- `block.goal` and `block.goalOverride` coexist. `block.goal` may be set by seed data or legacy code; `goalOverride` is the new explicit programming signal. `getGoalUsed` uses `blockGoalOverride ?? splitGoal ?? programGoal` to avoid breaking any existing `block.goal` consumers.
- `getWeekProgressionModifier()` is the single source of truth for per-week RPE/rep/set scaling. The old flat `lateBlock +0.5 RPE` logic in `getPrescriptionForExerciseSlot` was replaced with this function.
- Maintenance and general-health goals have intentionally flat week modifiers (no RPE ramp). These goals are not progressive overload programs; the app should not silently push RPE upward over a block.
- Bodybuilding chest slot 1 was a latent bug: the `if (specificGoal || dayFocus === 'strength' || strengthBlock)` guard excluded bodybuilding from slot-1 compound treatment, causing it to fall through to `hypertrophy_accessory`. Fixed to always return `primary_compound` for slot 1 regardless of goal, using a `wantsMainLift` flag for the narrower powerlifting/strength case.
- `scoreExerciseForSlot` goal-aware bonuses are additive on top of existing scoring, not replacements. Bodybuilding/powerbuilding isolation bonus in slots ≥1 and maintenance/general-health high-fatigue penalty are both modest (8–10 pts) to nudge without forcing.
- Powerbuilding advisory (no isolation on a day) fires only at info severity — it is informational, not a blocker.

## Session 2 Decisions

- `SetRating` changed from a 4-option string enum to a numeric `1 | 2 | 3 | 4 | 5` type. This gives algorithm functions a clean numeric input without a conversion step. Old string values are migrated via `normalizeDatabase`.
- `setRatingNumeric` exported from `trainingMath.ts` is now the single source of truth for rating→number conversion (identity function). The local `setRatingValue` in App.tsx has been removed.
- `WeekProgressScreen` derives its current week from the block cursor (`getCurrentWorkoutForUser`) rather than raw `block.currentWeek` to guarantee Week and Today are always looking at the same block day.
- The `exerciseComplete` and `allExercisesComplete` checks in LiveLogger now treat a free-form exercise (no linked planned sets) as complete after ≥1 non-skipped set, and Add Set is always available in free-form mode.
- e1RM chart prefers `session.weekNumber`, then looks up the week from block structure by `workoutDayId`, then falls back to calendar date label.

## Data Model Decisions

- Exercises are global by default.
- Custom exercises can be user-owned with `ownerUserId`.
- Gyms are user-owned.
- Gyms contain machines/equipment/unavailable equipment/substitutions.
- Gym-specific machine/cable differences are stored as `GymExerciseAdjustment`.
- `GymExerciseAdjustment.factor` modifies recommendations when gym-specific history is not already available.
- Barbell/free-weight movements should mostly carry across gyms unless manually flagged.
- Programs can be active, draft, or archived.
- Historical blocks are currently represented as archived `Program` records.
- Programs include `changeLog` for generation/edit/duplication history.
- Blocks include `priorityExerciseIds` in addition to display names.
- Week planning uses `TrainingWeek.isDraft` plus `TrainingWeek.savedWorkoutsBeforeDraft` as the single source of truth for draft vs saved state. Draft workouts are not trainable until Save Week clears the draft metadata.
- Split favorites are stored as `favoriteUserIds` on `SplitTemplate`.
- Planned set prescriptions are now future-ready with optional set number, rep range, target RIR, and percentage-of-top-set fields.

## UI/UX Decisions

- Dark mode by default.
- Use lucide-react icons.
- Use large buttons and mobile-friendly inputs in workout flows.
- Use a searchable `ExercisePicker` instead of a long exercise dropdown.
- In workout day editing, `ExercisePicker` should prefer split-day target muscles and movement patterns before broad search.
- Weekly Overview is the central way to see and edit generated training days.
- Builder is improved but still contains enough that a later component/page split is warranted.
- SBD settings means squat, bench, and deadlift only. Other multi-joint exercises belong in general exercise selection or the optional Exercise Avoider.
- Exercise Avoider is only shown for suggested/generated exercise selection, not as a major manual-build step.
- In-progress workouts are first-class persisted `WorkoutSession` records, not temporary UI state.
- Week Progress is based on the active block week, with calendar/date display as secondary.
- The first exercise analytics chart is e1RM over completed sessions; formulas are centralized in `src/lib/trainingMath.ts` so Session 2 can replace/refine them.
- Bodybuilding dashboard should focus on planned weekly volume, frequency, distribution, target flags, and suggested adjustments.
- Program gaps should show issue, why it matters, severity, suggested fix, and action buttons where possible.

## Library Protection + Default/Custom Separation Decisions

- `source?: "default" | "custom"` is a first-class field on both `Exercise` and `SplitTemplate`, backfilled from `ownerUserId` during `normalizeDatabase`.
- `copiedFromId?: string` on both records which default item a custom copy originated from.
- `userModified?: boolean` on both — set `true` when a user edits a default item. `normalizeDatabase` skips core-field refresh for exercises/splits where `userModified = true`, preserving user edits through seed updates.
- `hasVariations?: boolean` on `Exercise` — backfilled by `normalizeDatabase` by scanning which exercises reference this ID as `parentExerciseId`.
- `variationType?: string` on `Exercise` — user-editable label for the variation style (e.g., "Paused", "Box").
- `isArchived?: boolean` on `Exercise` — soft-delete for default exercises (hard-delete is used for custom).

**Default = editable, not read-only.**
- Default exercises and splits are fully editable. Editing a default item marks `userModified = true`.
- Defaults can be reset to seed values via `resetExerciseToDefault()` / `resetSplitToDefault()`.
- Defaults can be duplicated into custom copies via `duplicateExercise()` / `duplicateSplit()`.
- Archiving (hiding) a default exercise sets `isArchived = true`; it reappears after reset.

**Custom = editable + deletable.**
- Custom exercises can be hard-deleted with confirmation.
- Custom splits can be deleted with confirmation.

- Exercise library: All / Default / Custom / Hidden tabs replace the old source dropdown.
- Split library: All / Default / Custom tabs in the left panel.
- `normalizeDatabase` removes deprecated default splits (stored, no `ownerUserId`, not in seed) but skips `userModified` splits during field refresh.
- Variation metadata: existing exercises `ex_close_grip_bench`, `ex_front_squat`, `ex_highbar_squat`, `ex_rdl`, `ex_chin_up` have `isVariation: true` and `parentExerciseId` set. Five new standalone exercises added: `ex_paused_squat`, `ex_box_squat`, `ex_paused_bench`, `ex_deficit_deadlift`, `ex_rack_pull`.
- Exercise editor variation section: "This is a variation of another exercise" toggle shows parent exercise dropdown + variation type field when enabled.

## Rejected Or Avoided Decisions

- Do not keep “Priority Lifts” as a plain text box.
- Do not build exercise transfer prediction in V3.1.
- Do not overhaul analytics or settings before the training-intelligence layer proves out.
- Do not normalize the Supabase persistence schema yet; Phase 1 should stay on a JSONB snapshot while the local domain model is still moving quickly.
- Do not use “compound lift settings” to govern every multi-joint exercise. Keep SBD controls separate from broader exercise filtering.
- Do not treat each gym as a totally separate exercise universe.
- Do not make weak spots only about “weak off chest” or “slow off floor” right now.
- Do not randomly generate workouts without considering programming principles.
- Do not start cloud sync or ML before the local-first programming flow is clear.
- Do not perform large unrelated rewrites in future sessions.

## Latest Decisions

- Store per-set units on `LoggedSet` so imported and logged history can be converted accurately at read time instead of assuming the user unit.
- Treat the exercise progress modal as exercise-unit driven: display `lb`/`kg` from the selected exercise (or parent in family view) and convert imported/logged records into that unit before comparing best e1RM or plotting history.
- Preserve original imported/logged set units in workout history export rather than silently rewriting them to the exercise default.
