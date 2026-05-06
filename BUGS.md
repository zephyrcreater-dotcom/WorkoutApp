# BUGS.md

## Known Bugs

0. Program page is still dense.
   - Status: Improved but not fully solved.
   - Current behavior: Program Flow is compact and Exercise Avoider is hidden in manual mode, but Block Planner, Weekly Overview, day editor, Program Gap Analysis, and Previous Blocks still share one page.
   - Suggested fix: In Session 2 or a focused UX pass, separate review/history from active day editing.

0.1. Week Progress scoring is placeholder-only.
   - Status: Expected limitation.
   - Current behavior: Week Progress shows block week, statuses, readiness, sets, skipped sets, and tonnage, but not a final readiness/performance score.
   - Suggested fix: Session 2 should add the scoring model using readiness, set performance, RPE/RIR, completion, skipped/added sets, and feedback.

1. Previous blocks can be deleted.
   - Status: Fixed in Session 1.
   - Note: Deletion uses confirmation and removes the archived/draft program from local data.

2. Today reads the active generated program.
   - Status: Improved in Session 1 iteration 2.
   - Current behavior: Today shows the scheduled active-block workout or a no-active-program state.
   - Remaining risk: Current-day/week selection is simple and should become calendar-aware later.

3. Builder tab is too long and confusing.
   - Status: Product/UX bug.
   - Current behavior: Block planner, generated split, weekly overview, day editor, program gap analysis, template builder, and previous blocks are all stacked.
   - Suggested fix: Separate Split Library/Split Builder, Block Builder, and Block History into clearer flows.

4. Workout Template Builder purpose is unclear.
   - Status: Product/UX bug.
   - Current behavior: It overlaps with weekly day editor and block builder.
   - Suggested fix: Decide whether templates are reusable standalone workouts or whether block-generated days are the primary workflow.

5. The template dropdown “Powerbuilding Base Week” does not make sense.
   - Status: Confusing UX.
   - Suspected area: `TemplateEditor` in `src/App.tsx` and seed templates in `src/data/seedData.ts`.
   - Suggested fix: Rename/reframe templates or move them into Library.

6. Split templates are user-editable assets.
   - Status: Improved in Session 1 iteration 2.
   - Current behavior: Split Library supports custom splits, editing days/muscles/patterns, duplicate/delete, and favorites.
   - Remaining risk: The editing UI is useful but still not a polished final split-builder experience.

7. Program generation can still over-select fatigue-heavy compounds.
   - Status: Logic limitation.
   - Current behavior: Key lifts and split logic can include too many compound lifts in a week.
   - Suspected area: `src/lib/programGenerator.ts`.
   - Suggested fix: Add block-level compound limits, avoid-compound settings, frequency targets, and fatigue scores.

8. Program gap analysis thresholds are generic.
   - Status: Logic limitation.
   - Current behavior: `src/lib/programAnalysis.ts` uses hardcoded hypertrophy ranges.
   - Suggested fix: Make thresholds goal-, experience-, priority-, and block-type-aware.

9. Gym-specific conversion learning is not very visible during logging.
   - Status: UX gap.
   - Current behavior: Factors exist in Gym screen and are used in suggestions, but the logger needs a clearer “this machine feels different” flow.
   - Suspected areas: `LiveLogger`, `GymScreen`, `src/lib/trainingMath.ts`.

10. No automated unit tests.
    - Status: Missing engineering safety.
    - Suggested fix: Add tests for `programGenerator`, `programAnalysis`, `trainingMath`, and `db` normalization.

## Confusing Current Behavior

- It is unclear where a split template comes from.
- If a split has fewer days than the block, looping behavior is not obvious in the UI.
- Program history can fill with many archived/generated blocks during testing.
- Existing IndexedDB data may show old bad/generated blocks unless reset or deleted.
- The app has both historical `weakPoints` seed data and newer `programGaps`; UI now favors program gaps, but old weak-point data still exists in the model.

## Broken Flows Or Missing Connections

- Library manages split templates, including user favorites.
- Settings does not yet expose max editing or avoided compounds.
- Today is now a cleaner active-block scheduled workout experience, but calendar behavior remains basic.
- Previous block duplication and delete work.
- Generated block changes do not yet have a robust audit/history UI beyond `changeLog`.
- Exercise progress charts are only placeholders; the panel and data connection exist, but formulas/visualizations are deferred.
- Exercise progress has a first e1RM line chart, but the formula is intentionally simple and should be improved in Session 2.

## File Areas Likely Involved

- `src/App.tsx`: Most UI flows.
- `src/types/domain.ts`: Data model additions.
- `src/lib/programGenerator.ts`: Program generation bugs.
- `src/lib/programAnalysis.ts`: Program gap and bodybuilding dashboard logic.
- `src/lib/trainingMath.ts`: Weight recommendations and gym conversions.
- `src/lib/db.ts`: Migration/normalization for existing local data.
- `src/data/seedData.ts`: Built-in splits, exercises, gyms, seed users.
