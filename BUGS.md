# BUGS.md

## Known Bugs

## Algorithm Phase 1: Observed e1RM + Reverse Prescription (Session 17)

- The new e1RM-based live logger pipeline is implemented and all spec math verifies. Manual gym-flow verification is still recommended:
  - Confirm suggestion copy is clear and not contradictory (feel vs RPE copy should agree)
  - Confirm suggestions round correctly for kg exercises (2.5 kg increment)
  - Confirm no suggestion appears for bodyweight sets with no added load
- The old `algNextSetAdjustment` (setAdjustment.ts) is no longer called from the live logger but remains available in `src/lib/algorithms/` if needed elsewhere or for comparison.
- Nominal e1RM (Phase 2) is not yet built. Current prescription uses observed e1RM directly with a small readiness modifier on the target RPE. This is conservative and safe but does not account for fatigue trends or block context.

## Completed Set Editing + True Delete Flow Fix (Session 16)

- The logger now has separate logging/editing state in code, but it still needs real workout-flow verification to confirm every tap path feels right after multiple edits, deletes, skips, and resume cycles.

## Swipe Delete Visual + Actual Delete Fix (Session 15)

- The closed-row delete background leak and the “delete behaves like reset” issue are fixed in code.
- Manual verification is still recommended for delete-after-resume and delete-mid-workout flows to confirm the filtered planned-set behavior feels right in real use.

## Swipe Delete Device Behavior Fix (Session 14)

- Desktop stale-swipe rendering is fixed in code, but manual verification is still recommended on both desktop and touch devices to confirm the coarse-pointer detection matches the expected environments.

## Resume Workout Swipe Null Crash Fix (Session 13)

- The specific `swipeState is null` resume crash is fixed in code.
- Manual verification is still recommended for resume-after-swipe and resume-after-delete flows on a real device/browser session.

## Resume Workout Blank Page Hotfix (Session 12)

- The blank-page resume blocker is fixed in code by validating and repairing in-progress session pointers before opening the logger.
- Manual verification is still recommended for stale-state edge cases created by older local data or unusual logger flows, especially resume after deleting sets and resume after library edits.

## Swipe Delete UX Fix (Session 11)

- The broken “multiple rows visually open at once” swipe state was fixed in code.
- Real-device verification is still recommended to confirm the current swipe threshold feels right on iPhone Safari and does not need minor tuning.

## Bodyweight Logger + RPE Reduction Hotfix (Session 10)

- The new bodyweight display flow is implemented in code, but it still needs real-device/manual verification across all logger and preview surfaces to confirm no remaining `0 lb/kg` or `- lb/kg` strings survive edge cases.
- The stronger reduction floor in `setAdjustment.ts` is intentionally more assertive for isolation/cable/machine work. Real gym testing is still needed to decide whether those isolation reductions should be tuned slightly up or down.

## Live Logger Preview + Mobile Delete Polish (Session 9)

- Swipe-delete was implemented with touch swipe reveal plus a fallback delete icon, but it still needs real-device verification on iPhone Safari to confirm the reveal threshold feels reliable and does not conflict with vertical scrolling.
- This pass did not add feel-button auto-advance. If live testing later shows the sticky action bar is still not fast enough, a guarded double-tap or same-feel-confirm flow can be revisited.

## Data Management UX Simplification + Unified Import/Export (Session 8)

- The primary `Export Training Data` action currently produces an Excel-compatible multi-sheet `.xls` XML workbook, not a zipped `.xlsx` file. It opens in spreadsheet apps, but true `.xlsx` export would require a library or a custom ZIP writer.
- Unified pasted-text import supports one detected workout section and one detected exercise section. If a pasted document contains several repeated tables of the same type, later repeated sections are ignored in this pass.
- Workbook import still supports `.xlsx` and `.xlsm` only. Older binary `.xls` uploads are not supported.

## Importer Analytics + Baseline Fill Fix (Session 7)

- Baseline import deduping now checks imported-history fingerprints across prior imported baseline sessions, but it is still intentionally simple. If a user edits notes/source/date between imports, near-duplicate imported history can still slip through.
- Imported baseline rows become one representative analytics set rather than N cloned sets when legacy `Set` means “3 sets of 10” style volume. This preserves trend usefulness without inflating analytics, but it is not a full historical recreation of every original set.
- Current-block analytics mode still only reflects block-linked workout sessions. Imported baseline sessions are visible in overall exercise analytics, not in the current-block trend view.
- Exercise family analytics uses parent/child variation relationships only. Broader “same family” grouping via `exerciseFamily` beyond explicit parent-child chains is not implemented yet.

## Exercise Baseline Importer (Session 6)

- Legacy workbook support currently targets `.xlsx` and `.xlsm` files that contain a real `Exercises` worksheet inside the modern ZIP/XML workbook format. Old binary `.xls` files are not supported in this pass.
- Workbook parsing assumes a straightforward single-sheet tab layout with exercise data in columns `A:F`. If the workbook uses merged cells, custom header offsets, or a renamed sheet, the importer will fail safely instead of guessing.
- Exercise import review defaults to conservative actions, but there is not yet a dedicated import-history ledger showing every baseline merge decision after the fact.
- Matching is stronger for the named aliases in the current legacy sheet, but ambiguous rows can still require manual mapping or a custom/variation create decision.
- Mapped existing exercises do not currently merge imported exercise metadata back into built-in exercise definitions. This pass only creates new exercises or updates user-specific baselines/history.

## Import/Export Phase (Session 5)

- CSV import deduplication uses a simple fingerprint (date + exerciseId + set_number + weight + reps + rpe). If sets lack set_number, duplicates from re-imports of the same day will not be caught reliably.
- Import only creates `WorkoutSession` records with `offProgram: true`. Imported sessions do not link to programs, blocks, or workout templates. Analytics derived from program structure (planned vs actual) will not reflect imported history.
- `exerciseMatcher.ts` alias table is hand-written. New exercises added to the library that have common abbreviations may not match without updating the alias table.
- Low/medium confidence exercise matches (word overlap) are good enough to flag for review but are not guaranteed to be correct — always check before confirming an import with unreviewed matches.
- The export-exercises CSV writes `ownerUserId`-filtered exercises only (user's own exercises). Built-in exercises archived by the user are excluded.
- Full backup export in DataManagementPanel uses the existing SettingsScreen `exportJson` for JSON backup; the DataManagementPanel export buttons only cover CSV. For full JSON backup, use the Backup panel above DataManagementPanel in Settings.

## Library UX Fix

- Movement pattern filter was removed from the Exercise Library filter row to reduce clutter. Re-add as an Advanced Filters section if needed.
- Grouped variation picker in the exercise selector (e.g., expand Competition Squat to show Paused/Box/High-Bar sub-options) is not yet implemented. The fields (`parentExerciseId`, `hasVariations`) are in place; grouped display in the picker is future work.
- No global "Reset all defaults" action yet. Per-item reset exists for each modified default exercise or split.

## Workout Expansion Cleanup

- Browser/manual verification is still needed for the rebuilt default split templates and fresh-start weight behavior. Lint/build passed, but this Codex session did not run a live browser flow.
- Existing user-authored custom exercises and custom split templates are preserved during normalization, but only non-user-owned built-in definitions are refreshed automatically.

## Supabase Persistence Phase 1

- Local-only mode and cloud-account mode are now separated, but the explicit import flow is still intentionally conservative. It merges known top-level collections by ID and does not attempt deep per-set or per-block reconciliation yet.
- Snapshot sync currently stores the full `TrainingDatabase` JSON document for the signed-in Supabase account. This is deliberate for Phase 1 but not the final normalized cloud schema.
- Cross-device Supabase behavior still needs final manual verification in a real configured environment with valid env vars and RLS-enabled `app_snapshots`, but the hydration loop and seed-data timestamp bug were fixed in the sync repair pass.
- The old visible fake user picker has been removed from the active UI, but older local databases may still contain multiple historical local profiles internally. The app now auto-selects/migrates instead of showing them.
- Signed-out startup now uses a mode gate instead of jumping straight into the main app. This still needs real-device validation for the full choose-local, sign-in, sign-out, and explicit import paths.
- Export/import wording is aligned with separate local-only vs cloud modes, but richer backup tooling and previews are still future work.
- In this Codex sandbox session, local browser verification via `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` was blocked by `listen EPERM`, so runtime UI verification was limited to lint/build rather than live browser testing.
- Temporary sync debug logging exists behind `localStorage["iron-orbit-sync-debug"] = "1"`. It should stay quiet by default, but can be removed later once Supabase sync is verified in the real app environment.

## V3.1 Training Intelligence Foundation

- Same-exercise recommendation v1 is intentionally conservative and does not yet predict across exercise families or variations.
- Normalized e1RM is a scaffold only; adjustments are intentionally small and not yet personalized by exercise or athlete profile.
- Recommendation confidence is available, but no dedicated analytics view exists for auditing recommendation accuracy yet.

## V2 Final Polish Hotfix

- **Block Planner reset left stale Weekly Overview visible:** Fixed. Reset now removes draft programs for the current user, clears the saved builder draft, resets planner controls, and returns the builder to initial setup state.
- **Skip This Workout left matching WIP sessions resumable:** Fixed. Skipping a planned workout now abandons the matching in-progress session before progress sync, so the week status becomes skipped instead of in progress.
- **Today mobile actions were crowded/cut off:** Fixed. Start/Resume remains primary; navigation/skip actions and edit/off-program actions stack full-width on narrow screens.
- **V2 status:** If manual testing passes, this closes the final V2 polish hotfix and the next phase can be V3 Training Intelligence v1.

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

### Blocker — Must Fix Before v2 Stable

**BUG-A — Choose For Me still overfills requirements (HIGH)**
- Status: Fixed in V2 Final Stabilization; needs real-data manual verification.
- Fix: `WorkoutDayEditor.chooseForMe()` and `programGenerator.ts` now both treat `SplitDayRequirement` entries as hard slots. Generated exercises are tagged with `fulfillsRequirementId`, secondary muscles do not fill slots, and neither path creates extras automatically.
- Rule preserved: One exercise per requirement slot. `isExtra=true` requires explicit "Add Extra Anyway".
- Relevant files: `src/App.tsx` → `chooseForMe()`, `countFulfilled`, `WorkoutDayEditor`; `src/lib/programGenerator.ts`; `src/types/domain.ts`.

**BUG-B — Discard Draft saves/promotes instead of discarding (HIGH)**
- Status: Fixed in V2 Final Stabilization; needs real-data manual verification.
- Fix: Removed the fragile render-time ref snapshot. `TrainingWeek.savedWorkoutsBeforeDraft` now captures the saved baseline before draft edits/copying. Save clears the baseline and marks saved; Exit preserves draft; Discard restores the baseline or leaves the week empty/unplanned.
- Rule preserved: Draft is not planned truth until Save Week.
- Relevant files: `src/App.tsx` → `WeekEditor`; `src/types/domain.ts` → `TrainingWeek.isDraft`, `TrainingWeek.savedWorkoutsBeforeDraft`.

**BUG-C — Today shows workout card for unplanned/draft week (HIGH)**
- Status: Fixed in V2 Final Stabilization; needs real-data manual verification.
- Fix: Today now gates on `weekBeingEdited || isWeekDraft(todayPlan?.week) || !isWeekPlanned(todayPlan?.week)`. Draft or unplanned weeks render only the planning notice and off-program action, not the workout card or exercise list.
- Rule preserved: If `!isWeekPlanned(todayPlan?.week)`, hide workout card entirely.
- Relevant files: `src/App.tsx` → `TodayScreen`, `weekLocked` derivation, `isWeekDraft`, `isWeekPlanned` helpers (~line 205).

**BUG-G — Planned exercise swapping/editing is too destructive (HIGH)**
- Status: Fixed in code; needs manual verification.
- Symptom: In Edit Current Day and Week Editor, users must remove exercises to re-open the picker. Swapping a single planned exercise is awkward.
- Fix: `WorkoutDayEditor` now exposes `Edit Exercise`, `Swap Exercise`, and `Remove Exercise` per planned exercise. Swap replaces only the selected row, preserves prescription fields, and warns/marks extra if the replacement no longer satisfies the prior requirement slot.

**BUG-H — Easy/5 recommendation path still misses increases in some real flows (HIGH)**
- Status: Fixed in code; needs manual verification.
- Symptom: Easy/5 after a manual starting weight, or after a prior applied decrease, can fail to produce the next-set increase/maintain recommendation.
- Fix: Recommendation generation now separates the logged source set from the actual next target set, persists target-set identity, and no longer suppresses Easy/5 increase-or-maintain suggestions because of fatigue gating.

**BUG-I — Manual weight carry-forward is inconsistent (HIGH)**
- Status: Fixed in code; needs manual verification.
- Symptom: When a set begins with no planned/suggested weight and the user enters one manually, the next set can fall back to blank or stale planned weight instead of the last actual weight.
- Fix: `emptySetDraft` now uses explicit target-set planned/recommended weight when present; otherwise it carries the previous actual weight forward as the next-set baseline.

**BUG-J — Week planned/completed truth is still too loose (HIGH)**
- Status: Fixed in code; needs manual verification.
- Symptom: Empty week shells can look planned, and selected historical weeks can be labeled completed just because they are not the current week.
- Fix: Week status now distinguishes `unplanned`, `planned`, and `completed` from shared helpers instead of shell existence or “not current week” UI shortcuts.

**BUG-K — End-of-block flow suggests non-existent next weeks (HIGH)**
- Status: Fixed in code; needs manual verification.
- Symptom: Finishing the last week/day can still point the user toward planning Week 4 for a 3-week block.
- Fix: Completed blocks now clamp to a Block Complete state, suppress non-existent next-week prompts, and surface `Review Block`, `Archive Block / Finish Block`, `Repeat Block`, and `Start New Block` actions.

**BUG-D — Recommendation scoping needs end-to-end verification (MEDIUM)**
- Status: Implementation merged, not yet verified in live testing.
- Intended: Set 1's suggestion shows only on Set 2; moving to Set 3 hides it; returning to Set 2 shows it again if not applied. Applied → compact badge only.
- Verify: `isOnSuggestionTarget = effectiveSetIndex === lastNonSkippedSet.setNumber` logic in `LiveLogger`; `setAdjustment.ts` never decreases weight for setRating=5 + RPE ≤ target.
- Relevant files: `src/App.tsx` → `LiveLogger` suggestion rendering; `src/lib/algorithms/setAdjustment.ts`.

**BUG-E — Set tapping / Update Set mode needs end-to-end verification (MEDIUM)**
- Status: Implementation merged (stale `selectedSetIndex` fix added), not yet verified.
- Intended: Tapping a logged set in lineup pre-fills the form. After normal `logSet`, `selectedSetIndex` is reset to `null`. No stale "Update Set" mode after advancing.
- Verify: `selectedSetIndex`, `effectiveSetIndex`, `isEditingPastSet` logic in `LiveLogger`; particularly the `setSelectedSetIndex(null)` call in the normal `logSet` path.
- Relevant files: `src/App.tsx` → `LiveLogger`, `logSet()`.

**BUG-F — Continuous loop week copying needs end-to-end verification (LOW-MEDIUM)**
- Status: Guard tightened, not yet verified with a real continuous-loop block.
- Intended: `copyWeekExercises` skips copy when `splitDayId` values differ OR when `focus` labels differ. Week 2 Lower day should not receive Week 1 Upper exercises.
- Verify: Create a 1-day/week Upper/Lower block in continuous-loop mode; confirm Week 2 gets Lower exercises and Week 3 gets Upper exercises.
- Relevant files: `src/App.tsx` → `copyWeekExercises()`, `WeekEditor` mount `useEffect` pre-check.

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

- **Scrolling blocked on desktop/mobile:** App shell no longer creates a hidden-overflow scroll trap. Document scrolling is restored while horizontal overflow remains clipped. Browser smoke verified Today scrolling on desktop and 390px mobile.
- **Off-program prefilled weight disappeared:** Off-program builder now persists the displayed starting weight into the first planned set before the session starts; logger-added off-program exercises use the same prefill path.
- **Manual weight carry-forward:** When a target set has no explicit planned/applied weight, the next draft defaults to the previous valid completed actual weight.
- **Recommendation base load:** Easy/Hard recommendations are sourced from the prior valid completed set selected for the current target set, so manual/applied/actual load is the base instead of blank history.
- **Off-program completed set count:** Completed review/history now counts valid completed sets, excludes skipped/warmup sets, and no longer collapses multi-set off-program exercises to one set.
- **Off-program set data preservation:** Completed session review and exercise performance logs preserve all off-program set weight/reps/RPE/setRating data.

- **Exercise Library edit support expanded:** Seed and user-created exercises can now be edited from Library. Saves preserve the original exercise ID so historical sessions keep resolving to the edited display name/metadata.
- **Mobile workout logger cutoff:** Logger containers now use min-width-safe grids and phone-sized one-column controls; root/body explicitly allow vertical scroll while clipping horizontal overflow.
- **Recommendation recomputation after skip/back/edit:** The logger now computes the displayed suggestion from the selected target set's prior completed source set, with identity based on source exercise/set and target exercise/set indexes.
- **Set lineup editing:** Pending, completed, and skipped set cards are selectable. Back no longer removes the latest set. Saving a skipped set with actual values marks it completed/unskipped.
- **Completed workout review/edit:** Week completed sessions open a review/edit screen with logged exercises, sets, actual load/reps/RPE, setRating, notes, skipped state, and guarded removal.
- **Week planned vs completed distinction:** Planned days still use `WorkoutDayEditor`; completed days route to Completed Session Review to avoid overwriting completed history with planned data.
- **Off-program review/edit:** Off-program completed sessions are visible in Week history and can be reviewed/edited without touching active block or future week plans.

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

## Resolved In V2 Final Gating Hotfix

- **Today shows workout card while week is being planned:** `weekLocked` lifted to outer scope of TodayScreen. When locked, the entire workout card and exercise list are replaced with a planning-notice panel showing "Continue Planning Week N" and "Go Off Program". Draft exercises are never exposed.
- **WeekEditor Cancel was ambiguous:** Replaced with three explicit buttons: "Save Week N" (marks `isDraft=false`, closes), "Exit Editor" (keeps draft open in DB, closes), "Discard Draft" (confirmation + restores `weekSnapshotRef` + marks `isDraft=false`, closes). A deep snapshot of week workouts is captured on mount.
- **Coach suggestion persisted across all sets:** `isOnSuggestionTarget = effectiveSetIndex === lastNonSkippedSet.setNumber` gates suggestion display. Set 1 suggestion shows only on Set 2; moving to Set 3 hides it; returning to Set 2 shows it again if not applied.
- **Suggestion wording said "next set" on the target set:** Title now "Use X for this set", label "Suggestion from Set N", button "Apply to Current Set".
- **Applied suggestion kept full card visible:** When applied, full card replaced by compact `✓ Applied to this set` inline badge.
- **New set recommendations blocked by prior applied rec:** Each set generates its own recommendation independently. `persistedAppliedRec` is matched by `sourceSetId`, not globally, so Set 2 → Set 3 rec is not blocked by Set 1 → Set 2 having been applied.
- **Days/week spinner arrows did nothing:** `NumberField` now calls `onChange` immediately on every valid change event (not only on blur). Blur clamps to `[min, max]`. Days/week field gets `min={1} max={7}`.
- **`isWeekDraft`/`isWeekPlanned`/`isWorkoutDayPlanned` not centralised:** Three module-level helpers added as the canonical planned-state source of truth. TodayScreen uses `isWeekDraft(todayPlan?.week)`.

## Resolved In V2 Final Bugfix

- **Requirement count shows 3/1 (double-counting):** `countFulfilled` legacy fallback now only activates when *no* exercise in the day has any `fulfillsRequirementId` set (`anyTagged` guard). Counts are capped at `req.requiredExerciseCount` in display.
- **Choose For Me doesn't tag `fulfillsRequirementId`:** `chooseForMe()` now builds `{ exercise, reqId }` pairs and tags each picked exercise with its requirement ID.
- **No way to add extra exercises beyond requirement cap:** New `isExtra?: boolean` on `PlannedExercise`. When a requirement slot is full, adding another triggers a "Add Extra Anyway?" confirmation modal. Extras get an `extra` badge in the prescription list and never inflate requirement counts.
- **Activating new block leaves in-progress session alive:** `activateProgram` now marks all the user's `in-progress` sessions as `abandoned` before activating.
- **Coach suggestion applied to current set, not next set:** `logSet` now tags the recommendation's `action.targetSetNumber = currentSetIndex + 2`. Apply button label shows "Apply 80kg to Set 3".
- **"Applied" state lost on navigation:** `applySuggestion` persists `applied = true` to `db.recommendations` and `session.recommendations`. `persistedAppliedRec` is derived from `liveSession.recommendations` on each render, surviving tab navigation.
- **"Update Set" mode shown incorrectly after normal log:** `logSet` calls `setSelectedSetIndex(null)` on the normal (non-edit) path, clearing the stale lineup selection.
- **Today allows starting workout while week is being planned:** `WeekEditor` sets `week.isDraft = true` on mount, `false` on save. `TodayScreen` detects `weekLocked = weekBeingEdited || weekIsDraft` and shows a warning banner + disables Start Workout.
- **WeeklyOverview editable mode uses 7-day grid instead of pill tabs:** `WeeklyOverview` with `editable=true` now renders pill tabs (`Day N – SplitName` format) matching WeekEditor style.
- **Continuous loop week copy: focus mismatch not caught:** `copyWeekExercises` now blocks copy when `splitDayId !== targetDay.splitDayId` (covers undefined mismatch too) OR when focus labels differ.
- **setFeel=5 (Easy) could still trigger a decrease via form/missedReps path:** `setAdjustment.ts` fully rewritten with explicit setFeel branches. setFeel=5 and setFeel=4 branches never recommend decreases. All logic paths confirmed correct.

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

## Known Limitations

- Analytics family view now converts child/variation entries into the selected exercise unit, but non-load units (`bodyweight`, `time`, `distance`) still fall back to the broader app display behavior rather than a dedicated mixed-metric chart.
- Completed-workout summaries outside the exercise progress modal still use some older direct-number rendering paths and may need the same formatter cleanup later.
