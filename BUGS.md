# BUGS.md

## Known Bugs

### Mobile Layout

**B-MOB-1 — Horizontal overflow / half-screen cutoff on mobile (HIGH PRIORITY)**
- Status: Reported from gym testing. Screenshots pending.
- Some screens (Today, Block, Week) have content cut off horizontally on narrow viewports. Likely caused by fixed-width containers or grid columns that don't collapse.
- Partial mitigation applied: body/root should not overflow-x. Check `src/styles.css` for `overflow-x: hidden` on body. Inspect flex/grid containers in TodayScreen, LiveLogger, and WeekEditor for hard-coded widths.
- Full fix requires screenshots to identify the exact elements. Tracked here for next gym-test pass.

---

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

## Resolved In V2 Hotfix Final

- Block tab no longer shows active weekly overview; shows compact summary + "View current week →" link.
- Week tab owns active week progress, completed session review, week history selector, and Week Review.
- Analytics exercise chart defaults to Overall (by date); Current Block mode uses `W{n}D{n}` labels.
- Off-program exercise additions prompt a scope modal; default is "This session only".
- `LoggedExercise.offProgram` field added to domain.
- `nextPlannedSet` no longer falls back to `at(-1)` (phantom Next Set fixed).
- `skipSet()` guarded by `isPastLastPlannedSet`; Skip Set button disabled past last planned set.
- Finish Exercise shows confirmation when planned sets remain; skips remaining on confirm.
- `applySuggestion()` persists suggested weight to planned set in db.
- Week Review visible at top of Week tab when week is complete.
- `recommendNextWeekAdjustments()` stub added to trainingMath.ts.
- Zero-weight guard in `logSet()` catches both weight=0+reps>0 and weight=0+reps=0.

## Resolved In V2 Gym-Test Hotfix 2

- **Scroll blocked on mobile (B-MOB-1):** Changed `overflow-x: hidden` → `overflow-x: clip` on `html, body, #root` in `styles.css`. `clip` prevents horizontal overflow without affecting the scroll port (which `hidden` silently did on some browsers).
- **"Edit Current Day" shown for unplanned days:** Added `selectedDay.exercises.length > 0` guard. Button now only appears when the week has been planned for that day.
- **"Go Off Program" on no-block state:** Renamed to "Start Individual Workout" for clarity. Behavior unchanged.
- **Week Editor state lost on tab switch:** `planningWeekNumber` lifted from `WeekProgressScreen` local state to App-level `editingWeekNumber` prop. The Week Editor now survives navigating to Today and back.
- **Week Editor duplicate "Day 1" labels:** Day tabs now use `Day N – SplitName` format. Position index (`N`) is always unique; split name is appended when available.
- **Skipped sets not tappable in set lineup:** Changed `isCompletedSet = !!actual && !actual.skipped` → `isLoggedSet = !!actual`. Skipped sets are now tappable. Tapping a skipped set pre-fills the form from the planned set (weight/reps/RPE targets), not from actuals (which are 0).
- **setRating=5 could still recommend decrease:** Added `setFeel < 5` guard to the `missedReps` and `formPoor` decrease branches in `setAdjustment.ts`. A "very easy" rating now bypasses all load-reduction paths.
- **Skip set has no reason:** "Skip Set" button now toggles a reason picker instead of directly skipping. Quick reason chips: Fatigue, Pain, Poor form, Time, Other, or skip without reason. Chosen reason is stored in set notes.
- **Off-program session starts blank:** "Go Off Program" / "Start Individual Workout" now opens a pre-workout builder. Users can pick multiple exercises, configure target sets/reps/RPE for each (with last-logged weight shown), then Start. "Start Empty Session" option still available for quick starts.
- **Custom exercises cannot be edited:** Edit button (pencil icon) added to custom exercise rows in Library. Opens the Custom Exercise form pre-filled with the exercise's current values. "Add Exercise" becomes "Save Changes" when editing.
- **Week tab exercises read-only:** Each day card in the Week tab now has an "Edit" button (hidden for completed sessions). Opens an inline WorkoutDayEditor below the day card. Changes are auto-saved.
- **Block Builder Flow box:** Removed the "Flow" Panel (Library > Block > Today) from BuilderScreen. The concept is now self-evident from the UI structure.

## Resolved In V2 Gym-Test Hotfix

- **Block name pre-populates:** `defaultRequest.name` was already `""`. `TextField` now accepts a `placeholder` prop; block name field shows `"e.g. Powerbuilding Block"` placeholder.
- **Prescription number inputs (backspace broken):** `NumberField` now uses local string state; parent value only commits on blur. Allows clearing, editing, and typing freely. Sanitization (sets ≥ 1, RPE 0.5 increments) happens on blur via parent callback.
- **Recommendation "increase to 120" when already at 120:** `setAdjustment.ts` now compares `suggestedWeight` to `loggedSet.actualWeight` after rounding. If equal, title becomes "Maintain load" and no "Apply" button is shown.
- **Skip last set auto-advance:** `skipSet()` now checks `isCurrentSetLastPlannedSet`. If last set is skipped: advances to next exercise (or finishes workout if final exercise). No extra Next Exercise or Finish Exercise click needed.
- **Set lineup tappable on mobile:** Completed set items in the lineup are now tappable. Tapping a completed set pre-fills the weight/reps/RPE/rating form fields with that set's actual values (for reference). Completed sets remain in the log.
- **Edit Current Day in Today:** "Edit Current Day" toggle button added to Today. Opens `WorkoutDayEditor` for the current planned day inline. Changes apply to the current day/week only.
- **Go Off Program in Today:** "Go Off Program" button added to Today (and on empty block states). Creates an off-program `WorkoutSession` with `offProgram: true`, no `workoutDayId`, and empty `loggedExercises`. Navigates to LiveLogger.
- **LiveLogger off-program empty state:** LiveLogger handles sessions with no exercises: shows "Off-Program Session" prompt with Add Exercise button. No phantom exercises or error state.
- **Off-program session type field:** `WorkoutSession.offProgram?: boolean` added to domain.ts. Sessions created via "Go Off Program" are flagged.
- **Week Editor continuous-loop copy:** `copyWeekExercises()` now checks `splitDayId` compatibility before copying. Upper exercises are not copied to Lower days. WeekEditor shows a banner when split days differ.
- **WeekEditor context:** Day tabs now show split day name if available. Per-day header shows split day name and a note when the previous week's day has a different split day.
- **Exercise swap metadata:** `PlannedExercise` extended with `originalExerciseId`, `replacementExerciseId`, `swappedAt`, `swapScope` fields in domain.ts. UI for recording swaps is a future TODO.
- **Custom exercise movement patterns:** Hidden by default under "Advanced Options" toggle in LibraryScreen custom exercise form.
- **Mobile horizontal overflow:** Added `overflow-x: hidden; max-width: 100%` to `html, body, #root` in `styles.css` as global protection.

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
