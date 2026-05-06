# HANDOFF.md

## What This App Is

Iron Orbit Training is a local-first PWA for workout programming and tracking across powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health. It is meant to replace an Excel workout tracking system and eventually become an adaptive training coach.

The app should support multiple local users, each with separate data. It should work well on iPhone Safari, be installable as a PWA, and remain architected for future cloud sync.

## Current Project Status

The app is runnable and builds successfully. It has a working React/TypeScript PWA shell, local IndexedDB persistence, seed users, dashboards, exercise library, gym manager, program generation, live workout logging, program gap analysis, weekly overview, block history, gym-specific machine/cable adjustment factors, sequence-based block progression, and a numeric set-feel rating system.

Current verified commands:

```bash
npm run lint
npm run build
```

Both passed at the end of Session 2. Note: `@humanfs/core@0.19.2` (an ESLint transitive dep) has a broken package publish. Session 2 pinned it to `0.19.1` inside node_modules. If `npm install` upgrades it to 0.19.2 again, run `npm install @humanfs/core@0.19.1 --no-save` to fix lint.

The dev server was running at:

```text
http://127.0.0.1:5174/
```

Session 1 iteration 2 note: an older process held port 5174 during verification and could not be killed from the sandbox, so the updated app was verified at `http://127.0.0.1:5175/`. Use 5174 when available; otherwise 5175 is fine for local UI checks.

## Session 1 Iteration 2 Updates

- Persistence remains local-first with IndexedDB as the primary document store in `src/lib/db.ts`.
- `src/lib/db.ts` now also writes a synchronous localStorage mirror backup of the same database document and can load from it, reducing refresh/restart data-loss risk if an async IndexedDB write is interrupted.
- `useTrainingDb.updateDb` now awaits `saveDatabase` before publishing the next React state.
- `normalizeDatabase` now fills newer fields including split favorites, exercise history arrays, gym variant arrays, planned set numbers, and enforces one active program per user.
- Split templates have per-user favorites through `SplitTemplate.favoriteUserIds`; favorites persist and sort first in Split Library.
- Exercise Library is now compact: search, filters, a scrollable exercise list, an add-exercise form, and per-exercise progress buttons.
- Exercise progress panel is wired to completed session history and future `exercisePerformanceLogs`; detailed charts are intentionally deferred.
- Program Flow text is collapsed into a compact helper.
- Block Builder now separates SBD settings from the Exercise Avoider. SBD settings refer only to squat, bench, and deadlift.
- Exercise Avoider only appears when using suggested/generate mode.
- Manual build remains the default.
- Workout day exercise picking is grouped by the selected split day’s target muscles and movement patterns.
- Adding an exercise to a workout day auto-fills editable starter sets, reps, RPE/RIR, rep ranges, and notes.
- Starter prescription logic is centralized in `src/lib/programmingLogic.ts` as `getBlockExercisePrescription`.
- `PlannedSet` now has optional `setNumber`, `repRange`, `targetRir`, and `percentageOfTopSet` fields to prepare for Session 2 warmup/top/backdown/variable prescription work.

## Session 2 Updates

- `SetRating` type changed from `"Easy" | "Good" | "Hard" | "Failed"` to `1 | 2 | 3 | 4 | 5` (1=terrible/much harder than expected, 5=very easy/better than expected).
- `normalizeDatabase` in `db.ts` migrates old string ratings to numeric on load. Existing saved data is automatically converted.
- `setRatingNumeric` in `trainingMath.ts` is now exported (identity function for the numeric type) and is the single source of truth. The duplicate `setRatingValue` function in `App.tsx` has been removed.
- All string-based rating comparisons in `trainingMath.ts` (`suggestPlannedWeight`, `recommendNextWorkoutAdjustments`, `suggestNextSetAdjustment`, `summarizeWeek`, `calculateWorkoutScore`) have been updated to numeric comparisons.
- Live Logger rating buttons are now a 1-5 number grid with a descriptive label ("Set feel — 1=much harder than expected, 5=much easier").
- Final-set edge case fixed: `exerciseComplete` and `allExercisesComplete` now correctly handle sessions with no linked planned exercise. An exercise with no planned sets is considered complete once at least one non-skipped set is logged. The Add Set button is now always enabled for free-form sessions.
- `WeekProgressScreen` now derives its current week from `getCurrentWorkoutForUser` (the block cursor) rather than raw `block.currentWeek`, so Week is always in sync with Today's progression pointer.
- e1RM chart X-axis label falls back to looking up the week number from block structure by `workoutDayId` when `session.weekNumber` is not set directly.
- Seed data updated to use numeric set ratings (3 = Good, 2 = Hard).
- `@humanfs/core` pinned to 0.19.1 to unblock `npm run lint` (0.19.2 has a broken package publish).

## Session 1 Iteration 3 Updates

- Stabilized the execution path: active block -> Today workout -> set-by-set logging -> completed session -> Week Progress -> Exercise Analytics.
- `WorkoutSession` now stores `updatedAt`, `weekNumber`, `currentExerciseIndex`, and `currentSetIndex`; in-progress sessions persist and resume after leaving Today or refreshing.
- `LoggedSet` now supports `setNumber` and `skipped`.
- Today now resumes an existing in-progress session for the scheduled workout and sends empty planned days back to Program for exercise selection.
- Live Logger now shows the full set lineup for the current exercise, highlights the current set, and supports Next Set, Skip Set, Add Set, Back, Finish Exercise, Finish Workout, and Abandon Workout.
- Week Progress tab added. It shows active block, block week, planned days, status, completed session summaries, actual/skipped sets, tonnage, readiness placeholder, and future score placeholders.
- Exercise Analytics now shows a first e1RM line chart when completed logs exist. It uses centralized helpers in `src/lib/trainingMath.ts`.
- Added `calculateE1RMFromSet` and `calculateSessionExerciseE1RM` in `src/lib/trainingMath.ts`.
- Program Gap Analysis now deduplicates warnings and groups output by Rule Conflicts, Volume, Balance, Fatigue, and Recovery/Spacing in the UI.
- SBD rule conflicts are grouped into a single warning with affected exercises, placements, and days.
- Workout day exercise selection now uses step chips for split-day target muscles. The current muscle is highlighted, covered muscles turn green, and an override checkbox shows all exercises.
- Choose For Me now filters eligible exercises before selection using SBD rules, Exercise Avoider selections, target muscles, target movement patterns, and active gym availability. If no valid exercises remain, it warns instead of silently adding restricted lifts.

## Current Architecture

- `src/App.tsx`: Main app shell and most UI components. This file is large and contains screens, builders, dashboard UI, logger UI, picker UI, weekly overview, block history, and utility component helpers.
- `src/types/domain.ts`: Core TypeScript domain model.
- `src/lib/db.ts`: IndexedDB load/save/reset/replace and migration normalization.
- `src/lib/trainingMath.ts`: e1RM, RPE chart, readiness scoring, weight suggestions, intra-workout set adjustment suggestions, gym-specific conversion learning, volume/session summaries.
- `src/lib/programGenerator.ts`: Split parsing, structured program/block/week/day generation, planned exercises/sets, priority exercise handling.
- `src/lib/programAnalysis.ts`: Program gap analysis and hypertrophy dashboard data.
- `src/data/seedData.ts`: Built-in exercises, split templates, seed users, seed gyms, seed templates, sample session, weak-point seed data.
- `src/hooks/useTrainingDb.ts`: React hook around local database load/update/import/reset.
- `src/main.tsx`: React entry and service worker registration/unregistration. In dev, it unregisters old service workers and deletes Iron Orbit caches to avoid stale app shells.
- `src/styles.css`: Tailwind setup and shared component classes.
- `public/manifest.webmanifest`: PWA manifest.
- `public/service-worker.js`: Offline-friendly service worker for production.
- `README.md`: Basic setup and MVP scope.

## Implemented So Far

- Vite React TypeScript project.
- Tailwind styling.
- PWA manifest, service worker, and generated icons.
- Local IndexedDB persistence.
- Local PIN login with seed users:
  - `nathan` / `2468`
  - `ava` / `1357`
- User-specific gyms, sessions, templates, programs, readiness, maxes, and preferences.
- Exercise library with built-in powerlifting/bodybuilding/general-health exercises.
- Custom exercise creation.
- Gym manager with machines, cables, substitutions, unavailable equipment, and conversion factors.
- Workout templates with drag reorder.
- Searchable exercise picker with filters for name, muscle, equipment, movement pattern, and gym availability.
- Program/block generation with selected split, structured key lifts, priority muscles, days/week, weeks, block type, and constraints.
- Weekly overview with training/rest days, workout name, focus, key exercises, estimated duration, and major muscles.
- Editable workout days from weekly overview.
- Live workout logger with readiness, planned/actual weight, reps, RPE, set rating, form, feel, pump, pain, soreness, notes, rest timer, and suggestions.
- Intra-workout adjustment rules for missed reps, high RPE, failed sets, poor form, pain, and poor accessory stimulus.
- e1RM and RPE chart calculations.
- Bodybuilding dashboard based on planned weekly volume, frequency, distribution, under/over target muscles, fatigue warnings, and suggested adjustments.
- Powerlifting dashboard with squat/bench/deadlift e1RM and estimated total.
- Program gap analysis for low muscle volume, too much pressing vs pulling, missing hamstring work, rear-delt undertraining, squat exposure, fatigue clustering, and missing posterior-chain work.
- Program gap action buttons for add-exercise actions where available.
- Previous block history with read-only preview and duplication to active block.
- JSON import/export backup.
- Database normalization for older local data missing new fields.

## Partially Implemented

- Split builder: built-in split templates exist, but there is no polished custom split builder where the user selects muscles per day. `generateSplitFromText` exists but is not enough.
- Block builder: functional but too crowded inside the Builder tab.
- Workout template builder: exists, but its product purpose overlaps with block/day editing and needs rethinking.
- Previous block history: can preview and duplicate, but cannot delete old blocks yet.
- Program gap analysis: useful foundation, but thresholds are crude and not personalized.
- Gym-specific conversion factors: data model, manual factors, and simple learning exist, but the user flow for logging the same exercise at two gyms and viewing the learned factor needs more polish.
- Today section: can start a selected template/program day, but generated programs do not flow into Today as cleanly as desired.
- User profiles: seed data has maxes/preferences, but profile editing for maxes, avoided compounds, goals, and block constraints is incomplete.

## Broken Or Confusing

- Builder tab is too long and mixes block builder, generated split, weekly overview, workout day editor, program gap analysis, template builder, and previous blocks.
- It is unclear where split templates come from. They are in `src/data/seedData.ts`, but the product should surface them in a Library/Split area.
- Split templates should live in the library as editable/reusable assets.
- A PPL split should let the user choose which muscles go on each day.
- If the split is 4 days but the block is 5 days, the block builder should explicitly loop through split days and show the schedule.
- Previous blocks need delete/archive management.
- The difference between Workout Template Builder, Block Builder, Exercise Picker, and Weekly Day Editor is unclear.
- Generated workouts/programs need a better path into Today.
- The dropdown called “Powerbuilding Base Week” in the template builder does not make product sense as currently presented.
- The app currently has too many disconnected tabs.
- Desired flow: Library/Settings -> Split Builder -> Block Builder -> Today/Dashboard.
- Bodybuilding dashboard is improved but still needs more useful progression and recovery context.
- Program generation can over-select heavy compounds if priority lifts and split templates overlap; this was improved but needs deeper programming rules.
- Existing local IndexedDB data can retain old generated programs. `normalizeDatabase` helps, but users may need reset/import/export if old bad programs clutter history.

## Decisions Made In First Session

- Use Vite React TypeScript instead of Next.js for a lightweight PWA.
- Use IndexedDB as a local-first database with one document-shaped `TrainingDatabase`.
- Keep login local and simple; not high-security encryption.
- Store exercises globally and gyms as context/variants/conversion layers.
- Use transparent rules-based coaching instead of ML for MVP.
- Replace “Priority Lifts” text with selected exercise IDs from the exercise database.
- Redefine weak spots as program gaps rather than athlete weaknesses.
- Put program gap analysis in `src/lib/programAnalysis.ts`.
- Put gym conversion learning in `src/lib/trainingMath.ts`.
- Add `normalizeDatabase` in `src/lib/db.ts` for backward compatibility.
- Do not register the service worker in dev; unregister old service workers and clear Iron Orbit caches to avoid stale app shells.

## Current User Requirements To Preserve

The app should be cohesive and advanced for powerlifting, bodybuilding/hypertrophy, and general health. It should support:

- Multiple local users with separate saved data.
- User profiles.
- Custom max inputs.
- Powerlifting and bodybuilding programming.
- Custom split builder.
- Exercise library and searchable exercise picker.
- Block builder.
- Today section.
- Weekly overview.
- Previous block history.
- Feedback after workouts.
- Predictive/adaptive weight recommendations.
- Gym selector.
- Gym-specific machine/weight adjustments.
- Exercises carrying across gyms when appropriate.
- A way to avoid certain compounds on certain blocks.
- A way to delete previous blocks.
- Cleaner navigation.

## Exact Next Steps For The Next Codex Session

1. Read `AGENTS.md`, `HANDOFF.md`, `ROADMAP.md`, `DECISIONS.md`, `BUGS.md`, `FEATURES.md`, `package.json`, and relevant source files.
2. Do not code immediately. Summarize current state and identify the minimum files needed for the task.
3. Propose a scoped plan and wait for approval.
4. Start with product flow cleanup:
   - Move split templates/split editing toward Library or a dedicated Split Builder.
   - Separate Block Builder from Workout Template Builder.
   - Make Today pull from active generated program cleanly.
5. Add previous block deletion.
6. Add profile/max editing and avoided-compound controls.
7. Improve program generation logic so split day muscle choices strongly control exercise selection.
8. Keep running `npm run lint` and `npm run build`.

## Commands

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
npm run lint
npm run build
```

If `npm` is unavailable in Codex desktop, use the temporary npm CLI approach documented in `AGENTS.md`.

## Risks And Assumptions

- `src/App.tsx` is too large. A future refactor should split it into components only when tied to a concrete UI cleanup task.
- IndexedDB is local-only; export/import is important until cloud sync exists.
- Current program generation is rules-based and can still produce imperfect training plans.
- Program gap thresholds are generic and should become goal/user-level configurable.
- Machine conversion factors are early and need more visible user confirmation.
- There is no automated unit test suite yet.
