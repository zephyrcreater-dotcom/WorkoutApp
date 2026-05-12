# DECISIONS.md

## Product Decisions

- The app is named Iron Orbit Training.
- The product should serve powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health users.
- The app should be mobile-first and installable as a PWA.
- The app should replace an Excel workout tracker first, then become a smart training coach later.
- Multiple local users are required. Local PIN login is acceptable for MVP.
- The app should recommend and explain, but never fight manual overrides.
- Weak spots should currently mean program gaps, not literal athlete weak points.

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
