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
- Use `normalizeDatabase` in `src/lib/db.ts` to handle older local data after model changes.
- Domain types live in `src/types/domain.ts`.
- Seed data lives in `src/data/seedData.ts`.
- Programming logic lives in `src/lib/programGenerator.ts`.
- Program gap/hypertrophy dashboard logic lives in `src/lib/programAnalysis.ts`.
- Training math, RPE logic, readiness, set suggestions, and gym conversion learning live in `src/lib/trainingMath.ts`.
- UI is currently concentrated in `src/App.tsx`; this is acceptable for the first MVP but should eventually be split carefully.

## Workout-Programming Decisions

- Use transparent rules-based logic first, not ML.
- Use e1RM and RPE percentage charts for load estimates.
- Use readiness to reduce or slightly increase training stress.
- Use actual reps, actual RPE, set rating, form rating, muscle feel, pain, and fatigue signals for suggestions.
- Program generation should use selected key exercises, goal, block type, days/week, block length, selected split days, priority muscles, and user history.
- Selected key lifts are exercise IDs, not free-text “Priority Lifts”.
- Program gap analysis should inspect active program structure:
  - Muscle volume.
  - Muscle frequency.
  - Pressing vs pulling balance.
  - Movement patterns.
  - Missing accessory categories.
  - Fatigue clustering.

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
- Do not use “compound lift settings” to govern every multi-joint exercise. Keep SBD controls separate from broader exercise filtering.
- Do not treat each gym as a totally separate exercise universe.
- Do not make weak spots only about “weak off chest” or “slow off floor” right now.
- Do not randomly generate workouts without considering programming principles.
- Do not start cloud sync or ML before the local-first programming flow is clear.
- Do not perform large unrelated rewrites in future sessions.
