# ROADMAP.md

## High-Priority Fixes

0. Session 2 programming algorithms.
   - The Session 1 iteration 2 UI/data structure is ready for deeper logic.
   - Session 1 iteration 3 added execution plumbing and first e1RM chart placeholders.
   - Build real rules for SBD frequency, exercise selection, warmups, top sets, backdowns, variable reps/RPE, progression, deloads, week scoring, readiness adjustments, and chart calculations.
   - Likely files: `src/lib/programmingLogic.ts`, `src/lib/programGenerator.ts`, `src/lib/trainingMath.ts`, `src/lib/programAnalysis.ts`, `src/App.tsx`.

1. Clean up navigation and product flow.
   - Current flow is improved but Program is still dense.
   - Desired flow: Library/Settings -> Split Builder -> Block Builder -> Today/Dashboard.
   - Likely files: `src/App.tsx`, possibly new component files if a scoped refactor is approved.

2. Split Builder redesign.
   - Split templates now live in Library and support favorites.
   - User should create/edit splits by choosing days, muscles per day, movement patterns, main lift focus, and day focus.
   - A PPL split allows explicit muscle selection per Push/Pull/Legs day, but the UI can still be polished.
   - The block builder should loop split days if days/week exceeds split length.
   - Likely files: `src/App.tsx`, `src/data/seedData.ts`, `src/types/domain.ts`, `src/lib/programGenerator.ts`.

3. Today flow cleanup.
   - Today now reads the active block.
   - Next: make active program current-day/week selection more calendar-aware and support missed/skipped workouts.
   - Likely files: `src/App.tsx`, `src/lib/programGenerator.ts`.

4. Previous block management.
   - Delete/duplicate/read-only preview exist.
   - Next: add archive labels, restore, and cleaner history/audit UI.

5. Profile and max editing.
   - Add user-editable maxes/training maxes for squat, bench, deadlift, overhead press, and custom lifts.
   - Add goal, experience, available days, preferred duration, and avoided compounds/block constraints.
   - Likely files: `src/App.tsx`, `src/types/domain.ts`.

## Medium-Priority Improvements

- Split `src/App.tsx` into focused components after navigation/product flow is settled.
- Improve generated program quality:
  - Better exercise selection by split day.
  - Better fatigue distribution.
  - More explicit rest day placement.
  - Better block-specific rep/RPE/set schemes.
- Build real exercise progress charts using the new exercise progress panel connection:
  - Weight over time.
  - Improve the first e1RM chart formula.
  - Volume over time.
  - Sets/reps over time.
  - RPE/RIR and gym-specific trends.
- Improve program gap analysis:
  - User-goal-specific thresholds.
  - Volume landmarks by experience.
  - Better low-back/posterior-chain detection.
  - More nuanced press/pull balance.
- Improve bodybuilding dashboard:
  - Recent progression by exercise.
  - Recovery trend integration.
  - Per-muscle target ranges configured by goal and priority.
- Improve gym conversion flow:
  - Dedicated “this machine feels different” action in logger.
  - Confirmation of learned factors.
  - Better display of same exercise across gyms.
- Add unit tests for `programGenerator`, `programAnalysis`, `trainingMath`, and `db` migration normalization.

## Long-Term Features

- Cloud sync with Supabase/Firebase/Postgres.
- Real accounts and encrypted sensitive data.
- AI/ML-assisted coaching based on historical performance.
- Meet prep calendar with attempt planning.
- Bodyweight/nutrition/readiness trend modeling.
- Exercise video/cue library.
- Advanced substitution engine by gym, pain, equipment, muscle, movement pattern, and block goal.
- Import from Excel/CSV workout logs.
- More robust offline conflict resolution.

## Suggested Order Of Implementation

1. Read documentation and inspect current source.
2. Fix navigation/product flow.
3. Build a real Split Library/Split Builder.
4. Rework Block Builder around selected split and user constraints.
5. Make Today consume active block schedule.
6. Add previous block deletion.
7. Add max/profile/avoid-compound settings.
8. Add tests for generation and analysis logic.
9. Refactor `src/App.tsx` into components.

## Features Not To Start Yet

- Do not start cloud sync yet.
- Do not start real auth/encryption yet.
- Do not add ML/AI coaching yet.
- Do not do a broad design-system rewrite yet.
- Do not rewrite persistence away from IndexedDB yet.
- Do not build a backend until the local-first UX is stable.

## Next Session Priority List

1. Stop and read all handoff docs before editing.
2. Propose a product-flow plan for Library/Split Builder/Block Builder/Today.
3. Implement previous block deletion if the user wants a small first task.
4. Implement Split Library/Split Builder if the user wants the most important product improvement.
5. Keep lint/build green and update handoff docs at the end.
