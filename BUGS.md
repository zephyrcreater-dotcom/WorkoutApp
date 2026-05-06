# BUGS.md

## Known Bugs

### Build / Tooling

**B0.1 — `@humanfs/core` ESLint broken publish**
- Status: Workaround applied.
- `@humanfs/core@0.19.2` ships without `src/index.js`, breaking ESLint 9.x. Pinned to 0.19.1 with `npm install @humanfs/core@0.19.1 --no-save`.
- Risk: `npm install` may re-upgrade to 0.19.2. Re-run the pin command if `npm run lint` breaks.

---

### Data / Logic

**B1 — `fulfillsRequirementId` not retroactively set on existing exercises**
- Status: Known limitation.
- Exercises added before V2 Iteration 2 have no `fulfillsRequirementId`. They fall back to muscle matching in `countFulfilled`. If a day has mixed tagged/untagged exercises, the count may be imprecise.
- Suggested fix: A future normalization step could attempt to assign `fulfillsRequirementId` to existing exercises by matching them to requirements in order.

**B2 — Split requirements not auto-generated for new splits**
- Status: Known gap.
- New split days created in the UI start with no requirements. Users must add them manually.
- `normalizeDatabase` auto-generates requirements from `muscleGroups` for existing splits missing them, but new days created post-migration start empty.
- Suggested fix: Auto-populate one requirement per muscle group when a muscle is toggled on in `SplitDayEditor`.

**B3 — Program generator does not use `SplitDayRequirement`**
- Status: Known gap.
- `programGenerator.ts` selects exercises from `muscleGroups`/`targetMuscles`, not from `requirements`. Requirements currently only guide the WorkoutDayEditor manual chooser.
- Suggested fix: V2 Iteration 3 or later — make the generator use requirements as exercise selection slots.

**B4 — `generateWeekReview` suggestions are generic**
- Status: Logic limitation.
- Suggestions are based on average RPE, average set rating, and block week position, but do not yet name specific exercises or recommend specific load/rep adjustments.
- Suggested fix: V2 Iteration 3 — per-exercise load change suggestions in Week Review.

**B5 — `summarizeWeek` still returns `tonnage` in its return type**
- Status: Minor dead field.
- The field is computed and returned but no longer rendered anywhere in the UI.
- Suggested fix: Remove `tonnage` from `summarizeWeek` return type in a future cleanup pass (low priority).

---

### UX / Product

**B6 — Program page is still dense**
- Status: Improved but not fully solved.
- Block Planner, Weekly Overview, Day Editor, Program Gap Analysis, and Previous Blocks still share one long page.
- Suggested fix: Separate review/history from active editing in a focused UX pass.

**B7 — Split template builder experience is functional but not polished**
- Status: Improved in V2 Iteration 2 (requirements UI added) but still rough.
- The requirements section uses a plain `<select>` and numeric input. No drag-to-reorder, no inline description, no preview of which exercises match.
- Suggested fix: Future UX pass with richer requirement cards.

**B8 — Program generation can still over-select fatigue-heavy compounds**
- Status: Logic limitation.
- Key lifts and split logic can include too many heavy compounds in a week.
- Suggested fix: Block-level compound limits, fatigue score distribution, frequency targets.

**B9 — Gym-specific conversion learning is not visible during logging**
- Status: UX gap.
- Factors exist and are used, but the logger does not have a clear "this machine feels different" action.

---

## Resolved In V2 Iteration 2

- Tonnage removed from WeekProgressScreen and ProgressScreen. Replaced with hard sets, avg RPE, avg feel.
- `countFulfilled` now uses `fulfillsRequirementId` as primary signal; legacy exercises fall back to muscle matching.
- `addExercise` tags exercises with `fulfillsRequirementId = currentReq?.id`.
- `SplitDayEditor` now has an Exercise Requirements section (add/remove/edit muscle + count per requirement).
- `NumberField` accepts `step` prop; planned RPE fields use `step={0.5}` + `sanitizeRpe()`.
- `WeekReviewPanel` shows when `isBlockWeekComplete` is true; displays metrics, suggestions, and a "Start Week N+1" confirmation button.
- Week advancement requires explicit user action — nothing auto-applies.

## Resolved Earlier

- Previous blocks can be deleted (Session 1).
- Today reads the active generated program (Session 1 Iter 2).
- `SetRating` migrated from string to numeric; all string comparisons updated (Session 2).
- `exerciseComplete` and `allExercisesComplete` edge cases fixed for sessions with no planned sets (Session 2).
- `WeekProgressScreen` derives current week from block cursor (Session 2).

---

## No Automated Tests

- No unit tests for `programGenerator`, `programAnalysis`, `trainingMath`, or `db` normalization.
- Recommended: Add tests in V2 Iteration 3 or later as a build-safety measure.
