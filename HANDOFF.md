# HANDOFF.md

## What This App Is

Iron Orbit Training is a local-first PWA for workout programming and tracking across powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health. It is meant to replace an Excel workout tracking system and eventually become an adaptive training coach.

The app uses a local-first training database with an explicit local-only mode and an optional Supabase account mode. It works well on iPhone Safari, is installable as a PWA, and is now wired for cloud snapshot sync.

---

## Current Handoff — Logger Smart Finish + Skip Entire Exercise Hold (Session 27)

### What changed

**Primary logger action is now context-aware**
- The separate always-visible `Finish Exercise` button is removed from the live logger action row.
- The green primary button now chooses its label from the active session state:
  - `Save Set` / `Next Set` while required sets still remain
  - `Finish Exercise` when the current pending set is the last remaining required set for that exercise
  - `Finish Workout` when that same set also closes the final incomplete exercise in the workout
- This now uses uncovered required-set coverage instead of only checking the last planned index, so out-of-order completion works correctly.

**Skip Set now supports hold-to-skip-exercise**
- Tap `Skip Set` still skips only the current set.
- Holding `Skip Set` for about 600 ms opens a confirmation modal for skipping the entire exercise.
- Confirming `Skip Exercise` marks every remaining incomplete non-deleted set in the current exercise as skipped while preserving already completed work.

**Completion and skipped counts stay aligned**
- Final-set save/skip flows now build completion summary state from the post-action session preview so skipped/completed totals reflect the newly logged set immediately.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Smart primary labels across in-order and out-of-order last-set flows
- Hold vs tap behavior on `Skip Set` on iPhone Safari
- Skip-entire-exercise navigation into the next exercise and last-exercise workout finish flow

## Current Handoff — Apply Feedback + RPE Increment Guard Fix (Session 26)

### What changed

**Apply feedback is visible again**
- The live logger now shows quiet confirmation text after Apply succeeds:
  - `Applied to current set.`
  - `Current set already matches the recommendation.`
- This uses derived draft-vs-recommendation matching plus a short-lived `recentlyAppliedRecommendationKey`, instead of bringing back sticky applied-state bugs.

**Logger-facing RPE stays clean**
- `Apply to Current Set` now sanitizes any recommended RPE to the app’s normal 0.5-step logger values before writing it into the draft.
- The recommendation model can still use its internal adjusted target RPE for load math, but the live logger draft now keeps the visible target RPE practical and clean.

**Rounded-load copy is clearer**
- When the exact target lands between available load jumps, recommendation copy now explains that the app is using the closest practical load instead of silently pushing odd decimal RPE into the draft.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Apply `180 -> 165` should update the weight input and show `Applied to current set.`
- Manually changing the draft after Apply should remove the applied confirmation
- Same-as-current recommendation should hide Apply and show the quiet exact-match text
- Logger RPE should not show values like `6.75`

## Current Handoff — Prescription Correction: Missed Reps Dominate + Apply Fix (Session 25)

### What changed

**Missed reps now dominate contradictory RPE input**
- `deriveActualRpeFromFeel()` now resolves explicit-RPE vs feel conflicts more safely when target reps were missed.
- If reps were missed and feel is `1` or `2`, the logger now uses the harder of:
  - explicit actual RPE
  - feel-derived RPE
- This prevents `11 reps` with feel `1` from being treated like a clean `@7` success.

**Missed-rep penalties are stronger in the logger model**
- Large rep misses now force a stronger decrement bias.
- A `3+` rep miss with feel `1` now pushes harder than the prior pass, so cases like `190 x 11` against planned `190 x 14 @ 7` land closer to `175` than `180`.

**Apply button now uses the current recommendation explicitly**
- `Apply to Current Set` now takes the currently rendered recommendation as an explicit argument and writes it into the active draft via a shared draft-apply helper.
- Reps/RPE also fall back to the current planned set when needed, so the active inputs update immediately and consistently.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- `190 x 11`, feel `1`, next target `14 @ 7` should now land around `175`
- Apply should immediately change the active draft when recommendation differs
- Same-as-current recommendation should still suppress Apply

## Current Handoff — Prescription Model Correction: Missed Reps + Manual Overrides (Session 24)

### What changed

**Manual overrides now become the recommendation source of truth**
- Next-set recommendations still come from the most recent saved actual set before the selected set.
- Hold recommendations now explicitly respect successful manual increases instead of pulling back toward older lower suggestions when the override matched target reps/RPE.

**Missed reps now have their own prescription penalty**
- `buildSetRecommendation()` now compares the saved set against that set’s own planned reps, not just the next target and not just e1RM/RPE.
- Missing reps now adds an explicit decrement penalty:
  - `1` rep missed: small practical drop when warranted
  - `2` reps missed: moderate drop
  - `3+` reps missed: strong drop, especially for secondary/isolation work
- Harder feel stacks with the missed-rep penalty instead of erasing it through rounding.

**Apply state stays live instead of stale**
- `Apply to Current Set` still writes into the current selected set draft only.
- Same-as-current recommendations stay suppressed, and no sticky “applied” state is carried from earlier selections.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Successful manual increase should hold the new weight on the next same-target set
- `190 x 11` vs planned `190 x 14 @ 7` should now drop more meaningfully
- Apply button should visibly update the active draft after manual-override flows
- Source label should reflect the latest saved prior set

## Current Handoff — Logger Draft State + Missed Target Prescription Fix (Session 23)

### What changed

**Draft input now belongs to the selected set**
- Live logger draft state is rebuilt from the selected set instead of being preserved across set switches.
- Switching between pending sets, completed sets, edit mode, and exercises now discards unsaved values from the previous selection.
- Set feel now resets per set:
  - saved feel loads when editing a logged set
  - unsaved/new sets default back to `3`

**Editing old sets no longer pollutes current pending sets**
- Canceling completed-set editing now falls back to the active pending set draft instead of leaving edited values behind.
- Set switching now relies on a shared `buildDraftFromSet(...)` path so weight/reps/RPE/feel/notes come from the chosen set only.

**Next-set recommendation is stricter about missed targets**
- If the source set missed the target reps and the next target is not easier, the recommendation now biases toward reducing load.
- This now works even when explicit RPE is missing or when feel/RPE alone would otherwise suggest a hold.
- Same-as-current recommendation cards are suppressed, and “applied” state is now derived from the current draft instead of stale session flags.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Unsaved draft leakage across set switches
- Feel resetting to `3` on unsaved/new set switches
- Edit completed set -> cancel -> pending set isolation
- Missed-rep example like `190 x 12` vs planned `14 @ RPE 7`
- Same-as-current recommendation suppression
- No stale “Applied” message when switching sets

## Current Handoff — Prescription + Suggestion Polish (Session 22)

### What changed

**Next-set recommendations are less redundant**
- Live logger suggestions now suppress the `Apply to Current Set` action when the current draft already matches the recommendation within half an increment.
- Redundancy checks now consider suggested weight plus suggested reps/RPE when present, so manual edits no longer get nagged by an identical recommendation.

**Feel-driven load changes now survive rounding**
- `buildSetRecommendation()` now uses an exercise prescription profile to distinguish main compounds, secondary compounds, and isolation/accessory work.
- Feel ratings now force practical next-step movement when appropriate:
  - feel `1` drops at least one increment when possible
  - feel `4`/`5` increases at least one increment when safe
  - isolation/accessory movements weight set feel more heavily than e1RM
- Guardrails still cap jumps, keep easier targets from drifting heavier than the last set, and keep recommendations below observed e1RM.

**Suggestion copy is clearer**
- Copy now explains when a calculated change was smaller than the exercise increment.
- Isolation/accessory copy explicitly says feel is weighted more than e1RM.
- Compound lifts still cite observed e1RM more directly, but without contradictory “easy/hard” messaging.

### Validation
- `npx eslint src/App.tsx` ✓
- `npx eslint src/lib/trainingIntelligence/weightPrescription.ts` ✓
- `npm run build` ✓
- `npm run lint` ✗ pre-existing repo-wide failures from generated `.claude/.../dist` files and service worker globals

### Manual verification still recommended
- Current draft already equals recommendation → no `Apply to Current Set`
- Manual weight change carries forward without redundant identical recommendation
- Cable/isolation feel `1` and `5` flows move by real increments
- Bench/squat/deadlift still feel conservative and do not jump absurdly
- Rounding explanation copy reads cleanly in the logger
- Units remain correct for lb/kg/bodyweight-added-load cases

## Current Handoff — Completed Workout Summary/Edit Mode Cleanup (Session 19)

## Current Handoff — Completed Workout Unified Editor Fix (Session 20)

## Current Handoff — Completed Workout Button Cleanup + Today Go Back Fix (Session 21)

### What changed

**Completed cards are less cluttered**
- Today completed cards now use:
  - clickable `completed` badge for summary
  - one `Edit Workout` action
- Week completed cards now use the same simplified pattern:
  - clickable `completed` badge for summary
  - one `Edit Workout` action
- Removed the duplicate top-row/bottom-row completed edit actions from the main Week card view.

**Today `Go Back` now prefers the real completed workout**
- `Go Back` no longer only rewinds the block pointer.
- It now looks for the most relevant previously completed workout session in the active block:
  - prefers earlier workouts completed today
  - otherwise uses the most recent prior completed workout in the block
- If found, it opens that exact session’s completed summary without changing status or creating a duplicate.

### Validation
- Targeted lint: `npx eslint src/App.tsx` ✓
- Build: `npm run build` ✓
- Manual browser verification: not completed in this session

### What changed

**Completed summary is read-only again**
- `CompletedWorkoutReview` no longer shows the fake `Quick Edit Summary` form.
- The summary page now acts as a true read-only view with:
  - workout stats
  - session notes
  - read-only logged set tables
  - primary `Edit Workout` action

**One real completed workout editor**
- The only real completed-workout editing flow is now the live logger in `completed-edit` mode.
- `Edit Workout` opens the same session id in `LiveLogger`, where the user can:
  - edit existing sets
  - delete sets
  - add sets
  - add exercises
  - save/finish the workout again

**Week now aligns with the same model**
- Week cards and Week Editor completed-session actions now route edit behavior into the same logger editor flow.
- Week still allows viewing the completed summary, but editing no longer happens in a separate summary-table UI.

**Incomplete additions are now intentional resume triggers**
- Opening a completed workout editor does not mark it in-progress.
- Editing existing completed values still preserves completed state.
- Intentional unfinished additions such as `Add Set` and `Add Exercise` now transition the session to resumable editing state if the user leaves before finishing.

### Validation
- Targeted lint: `npx eslint src/App.tsx` ✓
- Build: `npm run build` ✓
- Manual browser verification: not completed in this session

### What changed

**Completed workout viewing no longer mutates session status**
- Opening a completed workout from Today or Week now keeps the session `completed`.
- `View Summary`, `Quick Edit Summary`, `Back to Summary`, and `Back to Today` no longer create a fake resumable workout.
- The logger no longer treats every session with `completedAt` as automatically being in edit mode.

**Completed-summary and completed-edit are now separated by navigation mode**
- Logger navigation now uses an explicit mode:
  - `active-logger`
  - `completed-edit`
- The completed workout banner and summary/back buttons only appear when the user intentionally enters `completed-edit`.
- `Edit / Continue Workout` opens the same session in logger-style editing without immediately changing it to `in-progress`.

**Back buttons are now safer**
- In completed-edit mode:
  - `Back to Summary` returns to the completed summary
  - `Back to Today` returns to Today
- If the user has unsaved draft inputs in completed-edit mode, leaving now prompts:
  - `Leave editing? Unsaved changes may be lost.`

**Completed summary stays a true summary**
- Today completed cards now use:
  - `View Summary`
  - `Edit / Continue`
- Quick summary edits still save to the same completed session and keep it completed.
- The completion overlay `Add Exercise` / `Edit / Continue Workout` actions no longer silently flip review/completed sessions back to in-progress just to reopen the logger UI.

### Validation
- Targeted lint: `npx eslint src/App.tsx` ✓
- Build: `npm run build` ✓
- Full repo lint: `npm run lint` still fails for pre-existing reasons outside this change:
  - generated files under `.claude/.../dist`
  - service worker globals in generated/copied service-worker files
- Manual browser verification: not completed in this session

### Current caveat
- Completed-edit mode is now UI-only unless the session was already truly active. That fixes the accidental `Resume Workout` bug.
- A future polish pass could add a more explicit persisted “dirty completed edit” concept if you want partially reopened completed sessions to surface as resumable only after intentional unfinished additions.

## Current Handoff — Completed Workout Edit + Add Exercise Flow Fix (Session 18)

### What changed

**Completed workouts are no longer dead ends**
- `src/App.tsx` now routes completed-session review through a shared app-level review flow instead of trapping the user in screen-local review islands.
- Added explicit logger navigation context so reopening a completed workout knows whether to return to:
  - completed summary
  - Today
  - Week

**Completed sessions can reopen in the same logger session**
- Editing a completed workout now reuses the same `WorkoutSession.id`.
- Reopening a completed session moves it back to editable logger mode without clearing its logged work.
- Original `completedAt` is preserved when the user reopens the session to continue editing.

**Today now exposes actionable completed workouts**
- Added a `Completed today` section on Today with:
  - `View`
  - `Edit`
- This keeps same-day completed sessions reachable even after the block pointer advances to the next workout.

**Logger back/resume behavior is explicit**
- When the logger is opened from a completed workout, it now shows an `Editing completed workout` notice.
- The logger exposes clear exit actions:
  - `Back to Summary` when the user came from a completed summary
  - `Back to Today`

**Add Exercise after completion is fixed**
- Adding an exercise to a reopened completed session now appends to the existing session and immediately navigates to the newly added exercise using the new log id.
- This avoids the stale-state bug where the logger tried to jump using the pre-update exercise list.

### Validation
- Targeted lint: `npx eslint src/App.tsx` ✓
- Build: `npm run build` ✓
- Full repo lint: `npm run lint` still fails because eslint is scanning generated files under `.claude/.../dist` plus service-worker globals outside this change
- Manual browser verification: blocked in this environment because starting the local dev server on `127.0.0.1:5174` returned `EPERM`

### Manual verification checklist
1. Start a workout and log at least one exercise.
2. Finish the workout and confirm the review summary shows `Edit / Continue Workout`.
3. Return to Today and confirm the workout appears under `Completed today`.
4. From Today, press `View` and confirm the completed summary opens.
5. From Today or the summary, press `Edit` / `Edit / Continue Workout` and confirm the same session reopens in the logger.
6. Confirm existing completed sets are still present and tappable for edit.
7. Add a set to an existing exercise and confirm it saves on the same session.
8. Add a new exercise and confirm the logger jumps to that new exercise in the same session.
9. Finish the workout again and confirm no duplicate session is created.

## Current Handoff — Algorithm Phase 1: Observed e1RM + Reverse Prescription (Session 17)

### What changed

**New math layer: observed e1RM and reverse prescription**
- `src/lib/trainingIntelligence/e1rm.ts` — Added `ObservedE1RMResult` type and `calculateObservedE1RMResult()`. Added `"epley-rpe"` formula (RPE-aware Epley using effective reps). Updated `calculateObservedE1RM()` default to use RPE-aware Epley when RPE is provided.
- `src/lib/trainingIntelligence/weightPrescription.ts` — Added three new exported functions:
  - `deriveActualRpeFromFeel()` — maps feel rating (1–5) to actual RPE relative to target RPE
  - `adjustTargetRpeForReadiness()` — applies small readiness modifier (±0.25–0.75) to target RPE
  - `prescribeLoadFromObservedE1RM()` — reverse Epley prescription with guardrails

**Live logger recommendation pipeline replaced**
- `src/App.tsx` `buildSetRecommendation()` — replaced the multiplier-based `algNextSetAdjustment` call with the new e1RM pipeline:
  - derive actual RPE from feel or explicit RPE entry
  - calculate observed e1RM (RPE-aware Epley)
  - adjust target RPE for readiness
  - reverse-prescribe target load
  - round to exercise increment
  - show concise reason in suggestion copy
- All three `buildSetRecommendation` call sites updated to pass `readiness` and `unit`.

**Formulas**

Observed e1RM (RPE-aware Epley):
- RIR = clamp(10 − RPE, 0, 5)
- effectiveReps = reps + RIR
- e1RM = weight × (1 + effectiveReps / 30)

Reverse prescription:
- targetRIR = clamp(10 − targetRPE, 0, 5)
- targetEffectiveReps = targetReps + targetRIR
- targetWeight = e1RM / (1 + targetEffectiveReps / 30)

Verified examples:
- 100 lb × 6 @ RPE 10 → e1RM 120 lb ✓
- 100 lb × 6 @ RPE 8 → e1RM 126.7 lb ✓
- e1RM 120, target 12 @ RPE 7 → 80 lb (not 297.5 lb) ✓
- e1RM 120, target 6 @ RPE 10 → 100 lb ✓

**Nominal e1RM deferred to Phase 2**
- `calculateObservedE1RMResult` returns raw single-set observed e1RM only.
- Phase 2 will add a nominal e1RM layer normalised for readiness, workout score, fatigue, trend, and exercise variation.
- TODOs are documented in `e1rm.ts` and `weightPrescription.ts`.

### Validation
- Lint: passing
- Build: passing
- All spec math examples verified with node inline test

### Manual verification checklist
- [ ] Log 100 lb × 6 @ RPE 10, confirm next-set suggestion is ~80 lb for 12 @ RPE 7
- [ ] Feel 5 on a set lowers actual RPE estimate by ~1
- [ ] Feel 1 on a set raises actual RPE estimate by ~1
- [ ] Readiness 85+ adds ~0.5 to target RPE in prescription
- [ ] Readiness 55 subtracts ~0.5 from target RPE in prescription
- [ ] Unit stays lb for lb exercises; no cross-unit confusion
- [ ] Suggestions round to exercise increment and note the rounding
- [ ] Pain rating ≥ 6 produces "Stop or substitute" override, not a load suggestion
- [ ] Bodyweight sets without added load produce no recommendation

---

## Previous Handoff — Completed Set Editing + True Delete Flow Fix (Session 16)

### What changed

**Logger now separates logging mode from editing mode**
- `src/App.tsx` now distinguishes:
  - the current logging target (`selectedLoggingIndex` / current planned slot)
  - the completed set being edited (`editingSetId`)
- Tapping a completed set now enters explicit edit mode instead of silently pushing its values into the current pending set.
- Canceling edit exits edit mode and returns the form to the active logging target.

**Set lineup is now driven by lineup items instead of raw array index assumptions**
- The live logger builds a session-local lineup from:
  - visible planned sets
  - matching logged completions/skips
  - extra logged sets that do not map to a visible planned slot
- This makes pending-set deletion, completed-set editing, and resume behavior more stable after session modifications.

**Delete now works for planned and completed sets**
- Delete confirmation now supports:
  - completed sets
  - skipped sets
  - pending planned sets
- Deleting a logged set removes it from the session.
- Deleting a planned set hides that planned slot for the current session so it does not come back as a normal pending row.
- Skip remains separate and still records a skipped set.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Complete a set, tap it, and confirm the form enters edit mode with that set’s actual values.
2. Save changes and confirm only that completed set updates.
3. Cancel edit and confirm the current logging draft comes back cleanly.
4. Delete a pending planned set and confirm the denominator drops for the active session.
5. Delete a completed set and confirm it stays gone after resume.

## Current Handoff — Swipe Delete Visual + Actual Delete Fix (Session 15)

### What changed

**Closed rows now fully cover the delete background**
- The completed set row in `src/App.tsx` now uses:
  - hidden/opacity-gated delete background
  - an opaque foreground card with `z-10`
- The orange delete panel is only visible while a swipe is actively open or dragging on mobile/touch.
- Closed rows no longer leak the delete background through semi-transparent card styling.

**Delete now removes the logged set for this session**
- Delete no longer behaves like a reset/undo that leaves the same planned slot looking like a normal pending set.
- When a completed set is deleted:
  - its logged set entry is removed from `log.sets`
  - its `plannedSetId` is added to a session-local hidden list on the `LoggedExercise`
  - counts drop accordingly because the set no longer exists in the session log
- Skip remains separate and still records an explicit skipped set.

**Resume and set-pointer safety stayed intact**
- After delete, the session pointer is clamped against the updated visible planned-set list.
- Resume still uses the filtered visible planned sets, so deleted planned completions stay gone instead of reappearing after re-entry.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Load a logger with completed sets and confirm closed rows show no orange delete background.
2. Swipe a completed row open on mobile/touch and confirm the delete panel reveals cleanly behind the card.
3. Confirm desktop still shows only the compact trash action.
4. Delete a completed set and confirm hard/completed counts decrease while skipped does not increase.
5. Resume the workout and confirm the deleted set does not reappear.

## Current Handoff — Swipe Delete Device Behavior Fix (Session 14)

### What changed

**Swipe is now mobile/touch only**
- The live logger in `src/App.tsx` now uses a device capability check based on:
  - `(hover: none) and (pointer: coarse)`
- When that query matches, swipe reveal stays enabled for completed set rows.
- When it does not match, swipe reveal is disabled and the row never shifts left.

**Desktop now uses a compact delete button only**
- Desktop/computer behavior no longer shows the orange delete reveal behind completed rows.
- Completed set rows instead keep a small trash button that opens the existing delete confirmation.
- Mouse interaction does not open the swipe panel.

**Stale swipe state is cleared more aggressively**
- The logger now clears swipe-open and drag state when:
  - resuming/re-entering a session
  - switching exercises
  - the device mode changes to desktop/non-swipe
  - the open row no longer exists
- This prevents stale mobile swipe state from leaking into desktop rendering.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Open or resume a workout with completed sets on desktop and confirm no orange delete panel is visible.
2. Confirm desktop rows do not shift and only show the compact trash action.
3. Confirm mobile/touch still supports swipe-left reveal with one row open at a time.
4. Confirm resume still works and no blank page appears.

## Current Handoff — Resume Workout Swipe Null Crash Fix (Session 13)

### What changed

**Swipe state reads are now null-safe**
- The completed-set row renderer in `src/App.tsx` no longer reads swipe fields directly from a nullable `swipeState`.
- The crashy swipe offset logic now uses safe defaults for:
  - `isHorizontalSwipe`
  - `deltaX`
- Resume can now render the logger even when there is no active swipe gesture state.

**Transient swipe UI is cleared on logger re-entry**
- On logger re-entry / session resume, the component now clears:
  - `openSwipeSetId`
  - `pendingDeleteSetIndex`
  - active `swipeState`
- If `openSwipeSetId` points to a set that no longer exists, it is automatically cleared.
- If the pending delete index is out of range after state changes, it is also cleared safely.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Start a workout and log at least two sets.
2. Swipe one completed set open, leave the logger, then resume the workout.
3. Confirm the logger opens normally with no blank page.
4. Confirm swipe delete, cancel, and confirm-delete still work afterward.

## Current Handoff — Resume Workout Blank Page Hotfix (Session 12)

### What changed

**Resume flow now validates before opening the logger**
- `src/App.tsx` now uses a shared resume validator before opening an in-progress session from:
  - the Today `Resume Workout` button
  - `Resume Other In-Progress`
  - the header `Live` button
- The validator checks:
  - session existence
  - `in-progress` status
  - whether the session still has exercises
  - whether the current exercise pointer still maps to a valid exercise/log entry
  - whether the saved set pointer needs clamping after logger edits
- Invalid/stale sessions now clear the active resume pointer and return the user to Today with:
  - `That workout could not be resumed.`

**Logger now repairs stale pointers instead of assuming saved state is perfect**
- The live logger now rehydrates to the nearest valid exercise/set instead of blindly trusting `currentExerciseIndex`, `currentSetIndex`, or a stale row-level exercise id.
- If the saved active exercise is missing, complete, or no longer valid, the logger moves to the earliest valid incomplete exercise, otherwise the first valid one.
- If the current set pointer is out of range, it is clamped to the next valid set slot before rendering.

**Recovery screens replace blank-state failure**
- If logger state is unrecoverable, the app now shows a recovery panel instead of a blank page:
  - `Workout could not be resumed`
  - `The saved workout state was incomplete or stale.`
- Recovery actions:
  - `Return to Today`
  - `Abandon Workout`
- If an in-progress session has no exercises, the logger now shows a safe recovery screen with:
  - `Return to Today`
  - `Add Exercise`
  - `Cancel`

**Delete-set regression guard**
- Deleting a completed set now also clamps the saved `currentSetIndex` for the active exercise.
- This prevents a stale post-delete set pointer from breaking later resume attempts.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Start a workout, log a set, leave the logger, and confirm `Resume Workout` returns to the logger instead of a blank page.
2. Delete a completed set, leave, resume, and confirm the logger still opens normally.
3. Finish one exercise, leave, resume, and confirm the logger lands on the next incomplete exercise.
4. Confirm completed/abandoned workouts do not keep showing as resumable.
5. If possible, simulate a stale session pointer and confirm the Today recovery message appears instead of a blank page.

## Current Handoff — Swipe Delete UX Fix (Session 11)

### What changed

**Single-open swipe state**
- The live logger swipe-delete rows in `src/App.tsx` now use one open-row state:
  - `openSwipeSetId?: string`
- Only one completed set row can stay open at a time.
- Starting a swipe on a new row closes any previously open row automatically.

**Cleaner gesture behavior**
- Swipe tracking now uses:
  - `startX`
  - `startY`
  - axis lock
  - horizontal-vs-vertical dominance check
- Delete reveal only opens after a meaningful left swipe threshold (`52px`).
- Small accidental swipes snap closed.
- Vertical scrolling is no longer hijacked by brittle delete logic.

**Cleaner row layout**
- Each swipable row now uses a cleaner mobile-list structure:
  - outer clipped container
  - fixed-width delete background behind the content
  - sliding content card above it
- The orange delete panel no longer leaves multiple rows visually open at once or awkwardly exposes the underlying row text.
- Tapping an already-open row closes it instead of editing it.
- Tapping outside the open row closes it.

**Delete confirmation behavior**
- Cancel now closes both the confirmation and the open swipe row.
- Confirm delete removes the set and clears the open swipe state.
- Delete remains a mistake-correction action only; Skip remains the path for intentionally missed sets.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Swipe one completed set row left and confirm only that row opens.
2. Swipe a second completed set row left and confirm the first closes.
3. Tap outside the open row and confirm it closes.
4. Tap the row while open and confirm it closes instead of entering edit mode.
5. Confirm small swipes do not open delete.
6. Confirm vertical scrolling still feels natural in the logger.

## Current Handoff — Bodyweight Logger + RPE Reduction Hotfix (Session 10)

### What changed

**Bodyweight display now uses BW instead of fake zero-load units**
- Added a bodyweight-aware display layer in `src/App.tsx` and `src/lib/trainingMath.ts`.
- Planned preview cards, live logger set rows, recent history, and completed-set displays now render:
  - `BW`
  - `BW + 25 lb`
  instead of `0 kg`, `0 lb`, `- kg`, or `- lb`.
- Bodyweight movements now use bodyweight-specific empty-state copy:
  - `No recent added load. Use bodyweight or enter added load.`

**Live logger added-load flow**
- Bodyweight logger input now uses `Added load (lb/kg)` labeling with a grey `BW` placeholder.
- Blank added load means bodyweight for that set.
- When added load is entered, the logger stores/display it as external load in the user/exercise weight unit instead of treating bodyweight as `0 kg`.
- Next-set draft carry-forward no longer turns a prior BW set into a literal `0` in the input.

**RPE-based reduction logic is more meaningful**
- `src/lib/algorithms/setAdjustment.ts` now applies a meaningful reduction floor before rounding when actual RPE is materially above target.
- Large RPE gaps now reduce load by percentage intent first, then round, instead of letting “nearest increment” erase the adjustment.
- Isolation/cable/machine work gets a slightly stronger reduction floor than big compounds.
- Conflicting cases like “easy feel but RPE much higher than target” now respect the RPE mismatch and reduce with clearer copy.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Open a bodyweight movement like Pull-Up in the planned preview and confirm the badge/copy shows `BW` or bodyweight guidance, never `0 kg` / `- kg`.
2. In the live logger, confirm the weight field shows grey `BW` placeholder for bodyweight movements.
3. Log a bodyweight set with blank added load and confirm the lineup/completed display shows `BW × reps @ RPE`.
4. Log a weighted bodyweight set and confirm it shows `BW + X lb/kg`.
5. Confirm bodyweight recent history/analytics cards no longer show `-` where `BW` should appear.
6. Test a high-RPE accessory example like `100 lb × 10 @ RPE 10` toward `@ RPE 8` and confirm the reduction is meaningful before rounding.
7. Confirm reduction copy stays clear and unit-correct, including rounded messages.

## Current Handoff — Live Logger Preview + Mobile Delete Polish (Session 9)

### What changed

**Preview cards now respect the exercise display unit**
- The Today/preview workout cards in `src/App.tsx` now use the same display-unit path as the live logger.
- Recommendation baselines are converted into the exercise display unit before preview copy is built, so the preview card no longer mixes `kg` and `lb` in the badge, observed e1RM, recent performance, and rounding text.
- Preview recent-performance copy now uses concise wording:
  - `Recent: 80 lb × 10 @ RPE 9`
  - `Observed e1RM: 255 lb.`
  - `Conservative target: 175 lb for 8 reps @ RPE 7.`

**Blank weight states are cleaner**
- Preview cards and live logger set rows no longer render broken empty labels such as `- kg` or `- lb`.
- When no load history exists, the preview uses `No recent entry. Enter starting weight.`
- Bodyweight movements now show `Bodyweight` or `Added load optional` instead of a fake empty load.

**Live logger mobile delete + action visibility**
- Live logger set rows now support swipe-left reveal on touch screens for deleting logged sets.
- A quieter fallback delete icon remains on each completed set row.
- Delete still uses confirmation text that steers users toward `Skip` for missed sets, and deleted sets are removed entirely so they do not count as skipped or hard sets.
- The logger action row is now sticky at the bottom of the card so `Next Set` / `Finish Exercise` / `Finish Workout` stays visible on mobile.

**Set-feel flow decision**
- Feel buttons still only select feel; they do not auto-advance.
- This pass intentionally kept progression conservative to avoid accidental saves/advances during training. The speed improvement in this session is the sticky primary action rather than implicit advance behavior.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Open a planned workout whose exercise display unit is `lb` and confirm the preview badge, observed e1RM, conservative target, recent performance, and rounding copy all stay in `lb`.
2. Confirm preview cards with no saved load do not show `- kg` or `- lb`.
3. Confirm bodyweight preview cards show `Bodyweight` or `Added load optional`.
4. In the live logger, confirm planned rows with no load use clean fallback text instead of empty unit labels.
5. On mobile/touch, swipe left on a completed set row and confirm Delete is revealed.
6. Confirm the fallback delete icon still opens the delete path without making Delete louder than Skip.
7. Delete a set and confirm the workout summary/hard-set counts reflect full removal rather than a skip.
8. Confirm the sticky bottom action row keeps the main Next/Finish action visible while logging.

## Current Handoff — Data Management UX Simplification + Unified Import/Export (Session 8)

### What changed

**Data Management is simpler**
- The Settings → Data Management panel now centers on three primary sections:
  - `Import Training Data`
  - `Export Training Data`
  - `Backup`
- Technical CSV actions and copy helpers still exist, but they now live under collapsed sections:
  - `AI Formatting Help`
  - `Advanced CSV Options`

**Unified import flow**
- Added a new unified `Import Training Data` modal in `src/App.tsx`.
- It accepts:
  - workout history CSV
  - exercise/baseline CSV
  - pasted CSV/table text
  - `.xlsx` / `.xlsm` workbooks with `Exercises` and/or `Workout History` sheets
- The new parser in `src/lib/importers/trainingDataImport.ts` auto-detects:
  - exercise baseline imports
  - workout history imports
  - mixed workbook imports containing both sections
- Review is now grouped at the top level with:
  - Exercise Matches / Baselines
  - Workout History
  - Conflicts / Needs Review
  - Rows skipped or invalid

**Unified export flow**
- Added one primary export action: `Export Training Data`.
- This downloads one Excel-compatible workbook file (`.xls`) containing:
  - `Exercises`
  - `Workout History`
- The workbook export is generated in `src/lib/importers/exporters.ts` without a new dependency, using a multi-sheet Excel-compatible XML workbook format.
- Advanced CSV exports remain available under `Advanced CSV Options`.

**AI prompt cleanup**
- Added one primary prompt in `src/lib/importers/importPrompts.ts`:
  - `TRAINING_DATA_AI_PROMPT`
- The main prompt now covers both:
  - Exercises
  - Workout History
- Old separate prompts are no longer front-and-center in Data Management.
- Header copy is simplified to:
  - `Copy Headers`
  - optional advanced per-section header copy buttons

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Open Settings → Data Management and confirm the panel now emphasizes Import Training Data, Export Training Data, and Backup.
2. Confirm `Advanced CSV Options` is collapsed by default.
3. Confirm `AI Formatting Help` is collapsed by default.
4. Use `Copy AI Formatting Prompt` and verify clipboard output includes both Exercises and Workout History sections.
5. Import an exercise baseline CSV through the new unified import modal.
6. Import a workout history CSV through the new unified import modal.
7. Import an `.xlsx` / `.xlsm` workbook with an `Exercises` tab and verify it routes into the exercise review.
8. Import a workbook with `Exercises` and `Workout History` tabs and verify both sections appear in one review flow.
9. Export Training Data and confirm the downloaded workbook contains `Exercises` and `Workout History` sheets.
10. Confirm the older advanced CSV buttons still work.

## Current Handoff — Importer Analytics + Baseline Fill Fix (Session 7)

### What changed

**Imported baselines now create analytics-visible history**
- Exercise baseline imports no longer stop at `exerciseBaselines`.
- `src/lib/importers/exerciseLibraryImport.ts` now creates real completed off-program sessions with:
  - `name: "Imported Exercise Baselines"`
  - `source: "exercise_baseline_import"`
  - one representative logged set per imported exercise row
- The importer also writes a matching `exercisePerformanceLog` entry for compatibility with existing recommendation/history helpers.
- Deduping now checks imported baseline history keys so re-importing the same row does not create obvious duplicate analytics entries.

**Baseline fill behavior**
- Blank, missing, null, or zero baseline fields now count as safe auto-fill targets.
- If a matched exercise has no meaningful existing baseline, imported baseline values are filled automatically.
- If a matched exercise already has meaningful data, the review default is now `Add historical data` instead of silently replacing anything.
- `Keep existing baseline` still leaves the baseline untouched; `Replace baseline` and `Keep newer baseline` require explicit choice.

**Exercise analytics**
- `ExerciseProgressPanel` now reads both:
  - completed session history
  - `exercisePerformanceLogs`
- Analytics shows:
  - most recent set
  - most recent weight / reps / RPE
  - e1RM (imported if present, calculated from the set if not)
  - source label
  - recent history list
- If only one data point exists, the panel now shows the point/card plus:
  - `One data point available. Add more sessions to show a trend.`
- If no e1RM trend exists but history does, the panel shows recent history instead of looking blank.

**Variation / family analytics**
- Variation exercises can now be opened directly in analytics from the library variation cards.
- Child exercise analytics shows its own exact history by default and also shows parent context (`Variation of ...`) when applicable.
- Parent or child analytics can optionally enable `Include variations` to view the full exercise family.

**Export updates**
- Workout history CSV export now includes:
  - imported baseline/history rows
  - `source`
  - `e1rm`
- Exercise CSV headers/prompt schema now include:
  - `source`
  - `category`
  - `baselineSource`
  - `baselineUpdatedAt`

### Important implementation note
- Legacy `Set` values from the imported exercise sheet are treated as “number of sets represented by this baseline,” not expanded into repeated identical logged sets.
- The importer creates one representative analytics set and preserves the multi-set context in notes / performance-log metadata. This avoids artificially inflating session volume.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Import an exercise baseline CSV and confirm `Imported Exercise Baselines` history becomes visible in analytics.
2. Import a row into an exercise with zero/blank baseline and confirm the baseline auto-fills.
3. Import a row into an exercise with existing meaningful baseline and confirm the default action is history-only rather than replace.
4. Open analytics for a variation and confirm its exact history appears.
5. Open analytics for a parent and confirm `Include variations` brings child history into the family view.
6. Confirm most recent set shows weight, reps, RPE, e1RM, date, and source.
7. Confirm one imported data point does not leave the chart area blank.
8. Re-import the same baseline CSV and confirm duplicate history is skipped where possible.

## Current Handoff — Exercise Baseline Importer + Import Merge Review (Session 6)

### What changed

**Exercise baseline data model**
- Added `ExerciseBaseline` to `src/types/domain.ts` and `exerciseBaselines?: ExerciseBaseline[]` on `TrainingDatabase`.
- Baselines are explicitly user-specific and separate from the global exercise library, so imported personal numbers do not reintroduce built-in seed weights.
- `normalizeDatabase` now initializes `exerciseBaselines` and migrates baseline ownership during user-ID remaps.

**Exercise import/export**
- Added `src/lib/importers/exerciseLibraryImport.ts`.
- Supported import sources:
  - Iron Orbit exercise CSV
  - legacy `Exercise, Weight, Set, Rep, RPE, e1RM` CSV
  - legacy workbook `Exercises` tab from `.xlsx` / `.xlsm`
  - pasted CSV in either supported CSV schema
- Legacy workbook parsing rules:
  - rows with text in `Exercise` and blanks in `Weight:Set:Rep:RPE:e1RM` are treated as category headers when they match known categories
  - category context is preserved until the next category header
  - blank rows are ignored
  - text-only non-category rows are imported as exercises with no baseline
- Exercise CSV export now includes baseline fields:
  - `baselineWeight, baselineSets, baselineReps, baselineRpe, baselineE1RM, baselineSource, baselineUpdatedAt, notes`

**Import merge review**
- Added a dedicated exercise/baseline review flow in Settings → Data Management.
- Review detects:
  - matched existing exercises
  - new custom exercises
  - suggested variations
  - safe baseline adds
  - baseline conflicts
- Merge behavior:
  - no imported performance data → map/create exercise only, no baseline overwrite
  - imported performance + no existing baseline → safe baseline add
  - imported performance + existing baseline → default to keep existing baseline, never silently overwrite
  - user can instead replace baseline, keep newer baseline, add historical data, create custom exercise, create variation, map to another exercise, or skip
- Historical import fallback uses `exercisePerformanceLogs` instead of silently replacing a baseline.

**Matching and variation support**
- Expanded alias matching in `exerciseMatcher.ts` for legacy spreadsheet names including:
  - `Comp Bench Press`
  - `Incline DB Press`
  - `Low Bar Squat`
  - `Low Bar Squat (Paused)`
  - `Low Bar Squat (Tempo)`
  - `Paused Deadlifts`
  - `BELTLESS Sumo Deadlift`
  - `Barbell RDL`
  - `DB Shoulder Press`
  - `Cable AB Crunch`
- Matcher now carries variation-parent suggestions for likely imported variations.

**Settings / Data Management**
- Added:
  - `Import Exercises / Baselines`
  - `Export Full Backup JSON`
  - `Copy Workout History AI Prompt`
  - `Copy Exercise Import AI Prompt`
- The exercise import modal also includes:
  - exercise-import AI prompt
  - legacy sheet extraction prompt
  - copyable exercise CSV headers

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Import an Iron Orbit exercises CSV and confirm baseline fields review correctly.
2. Import a legacy workbook with an `Exercises` tab and confirm category rows are skipped as headers.
3. Confirm `Comp Bench Press` maps to `Competition Bench Press`.
4. Confirm `Incline DB Press` maps to `Incline Dumbbell Press`.
5. Confirm `Low Bar Squat (Paused)` suggests a variation instead of silently mapping poorly.
6. Import a row with baseline data into an exercise with no existing baseline and confirm it defaults to a safe add.
7. Import baseline data into an exercise that already has a baseline and confirm the default action keeps the existing baseline.
8. Choose `Replace baseline` and confirm the baseline updates only after explicit review.
9. Choose `Add historical data` and confirm the baseline stays intact while a history log entry is added.
10. Export Exercises CSV and confirm baseline columns are present.
11. Fresh install behavior remains unchanged: no seeded fake starter weights.

## Current Handoff — Import/Export + UI Cleanup (Session 5)

### What changed

**Import/Export foundation (`src/lib/importers/`)**
- `importerTypes.ts` — Updated to the 15-column CSV schema: `date, workout_name, exercise_name, set_number, weight, unit, reps, rpe, rir, difficulty, notes, set_type, duration_seconds, distance, source`. Kept legacy `ImportRow`/`ImportResult` types for backward compat.
- `exerciseMatcher.ts` — New. `matchImportedExerciseName(importedName, exercises)` returns `ExerciseMatchResult` with `confidence: high|medium|low`, `suggestedAction`, `needsReview`, and `reason`. Uses exact normalized match, alias table (comp squat → Competition Squat, bench → Competition/Barbell Bench Press, etc.), partial/substring match, and word-overlap scoring. High-confidence matches auto-link; medium/low go to review.
- `csvWorkoutImport.ts` — New. `parseCSVText()` parses raw CSV text into `CSVImportRow[]` with warnings/errors. `buildImportReviewSummary()` groups rows by workout+exercise and runs exercise matching. `applyImportGroups()` writes confirmed groups into `db.sessions` as off-program completed sessions, deduplicates by `date+exerciseId+set_number+weight+reps+rpe`, tags source as `csv_import`.
- `exporters.ts` — New. `exportExercisesCSV()`, `exportWorkoutHistoryCSV()`, `exportFullBackupJSON()`, and browser download helpers (`downloadExercisesCSV`, `downloadWorkoutHistoryCSV`, `downloadFullBackupJSON`).
- `importPrompts.ts` — New. `AI_CSV_PROMPT` and `CSV_COLUMN_HEADERS` constants for the copy-prompt UI.

**App.tsx — new components**
- `Modal` — Generic full-screen overlay with sticky header and close button. Used as the mobile import flow container.
- `ImportWorkoutCSVFlow` — Three-step CSV import: (1) file upload or paste + Copy AI Prompt button, (2) review summary with exercise match resolution, (3) done/result. Uses `ImportGroupRow` for per-exercise match review with inline exercise picker for overrides.
- `DataManagementPanel` — New Panel in SettingsScreen. Export Exercises CSV, Export Workout History CSV, and Import Workout History CSV (opens `ImportWorkoutCSVFlow` in a Modal).

**App.tsx — ProgressScreen cleanup**
- ProgressScreen now accepts `updateDb` prop (passed from call site at line 622).
- Removed inline `programGaps.map(...)` — replaced with `<ProgramGapPanel>` which already has "Show N secondary warnings" collapse/expand and group-by-category rendering.

**App.tsx — LibraryScreen mobile editor modal**
- Exercise editor panel is wrapped in a mobile overlay div: `fixed inset-0 z-50 overflow-y-auto bg-iron-950 xl:static xl:inset-auto xl:z-auto xl:overflow-visible xl:bg-transparent`.
- On mobile (< xl), clicking Edit shows the editor as a full-screen overlay with a sticky header + close button.
- On xl+, the div is `static` so the editor renders normally in the right grid column.

### Validation
- Lint: passing
- Build: passing (tsc -b + vite build)

### Manual verification checklist
1. Settings → Data Management panel visible
2. "Export Exercises CSV" downloads a valid CSV
3. "Export Workout History CSV" downloads a valid CSV
4. "Import Workout History CSV" opens the import modal
5. Copy AI Prompt button copies the prompt text
6. Paste a sample CSV → Parse & Review shows summary
7. Exercise with "bench" maps to correct exercise (high confidence)
8. Unknown exercise enters review flow, picker works
9. Confirm import → sessions appear in Progress/Analytics
10. Duplicate import attempt → duplicates skipped
11. Analytics / ProgressScreen: Program Gaps show top issues first, secondary warnings collapsed
12. On mobile (< 1280px viewport): clicking Edit on an exercise opens full-screen overlay
13. Close/cancel in exercise editor overlay returns to list
14. Lint + build pass

---

## Current Handoff — Library UX Follow-Up (Session 4)

### What changed

**Cloud sync wording**
- Added `editSaveContext(authMode, cloudStatus)` helper near `renderCloudStatusLabel`.
- Replaces hardcoded "saved locally" in both the exercise editor default banner and the split builder default banner.
- In cloud mode: shows "Syncing to cloud…", "Saved to cloud.", or "Sync failed — changes are queued locally." based on `cloud.status`.
- In local mode or unknown: shows "Changes are saved locally."
- `LibraryScreen` and `SplitLibraryManager` now accept `authMode` + `cloudStatus` props; call site passes `authMode={authMode}` and `cloudStatus={cloud.status}`.

**Searchable parent exercise selector**
- Replaced giant `<select>` dropdown in the variation parent picker with:
  - Text input that filters exercises by name as you type.
  - Dropdown results list (max-height scrollable) showing matching non-variation, non-archived exercises.
  - Once selected, shows a volt-colored pill with the parent name and a Clear (×) button.
  - `parentSearch` state in `LibraryScreen` — set to parent name when using "Add Variation" from card.
- No self-parent option; circular variation prevented by only showing non-variation exercises.

**"Add Variation" from parent cards**
- `startAddVariation(parent: Exercise)` function added — prefills draft with parent's muscle/equipment/category metadata, sets `isVariation: true`, `parentExerciseId` to parent.
- `GitBranch` icon button added to all non-variation exercise cards.
- Variation child cards in the collapsible section also support Edit/Duplicate/Delete.

**Variation grouping**
- By default, exercises with `isVariation: true` are hidden from the flat exercise list (unless `query` is set or `showVariations` toggle is on).
- Parent cards show a collapsible "N variations" section below them (visible only when no search query and `showVariations` is off).
  - Toggle (ChevronDown) expands/collapses via `expandedVariantParentIds` Set state.
  - A `+` button in the section header launches `startAddVariation` for that parent.
- "Show variations" toggle button in the exercise list header — when on, variations appear inline in the flat list with `showVariations` state.
- Variation cards in the flat list show "Variation of [Parent Name]" with a `GitBranch` icon.

**Delete guard for exercises with children**
- `deleteExercise` now checks for child variations before hard-deleting a custom exercise.
- If children exist: shows an alert listing the count and asks user to delete/reassign them first.

**New imports**
- `GitBranch`, `ChevronDown`, `X` added to lucide-react imports.

### Validation
- Lint: passing
- Build: passing

### Manual verification checklist
1. Cloud mode — edit a default exercise → banner shows "Syncing to cloud…" / "Saved to cloud." (not "saved locally")
2. Local mode — edit a default exercise → banner shows "Changes are saved locally."
3. Cloud mode — edit a default split → same cloud-aware wording
4. Parent exercise picker — type partial name, see filtered list, click to select, pill shows parent name
5. Clear button on parent pill resets search
6. Exercise card "Add Variation" (GitBranch) button → draft prefilled from parent, variation toggle ON, parent pre-selected
7. Variation grouping — default view hides variations, shows "N variations" under parent
8. Expand → child variation cards appear with Edit/Duplicate/Delete
9. "Show variations" toggle → variations appear inline in flat list with "Variation of [Name]" label
10. Search query → variations appear inline regardless of `showVariations` toggle
11. Delete custom exercise with children → alert shown, deletion blocked
12. Delete custom exercise without children → confirm dialog, then deleted
13. Lint + build pass

---

## Prior Handoff for Codex — Split Template Library Cleanup

### What changed

Curated the built-in split template library from 9 templates to 12. All templates now use frequency-aware exercise slot counts and have accurate descriptions and muscle coverage.

**Templates renamed:**
- `Bodybuilding Push/Pull/Legs 3-Day` → `Bodybuilding PPL 3-Day`
- `Bodybuilding Push/Pull/Legs 6-Day` → `Bodybuilding PPL 6-Day`

**Templates added (new IDs):**
- `Full Body 4-Day` (`split_full_body_4`) — A/B full-body rotation, most muscles 2x/week
- `Powerbuilding 5-Day` (`split_powerbuilding_5`) — squat/bench/deadlift days plus two accessory sessions
- `Conditioning + Strength` (`split_conditioning_strength`) — two strength days plus a dedicated conditioning day

**Requirement changes by template:**

*Bodybuilding PPL 3-Day (1x/week — more slots per session):*
- Push: chest upgraded to x2; front-delts slot removed (pressing covers it)
- Pull: mid-back x1 added; biceps remains x2
- Legs: unchanged

*Bodybuilding PPL 6-Day (2x/week — moderate slots per session):*
- Push A: front-delts slot removed
- Pull A: biceps reduced from x2 to x1
- Push B: rear-delts slot removed (pull muscle; was misplaced here)
- Pull B: upper-back replaced with mid-back for A/B variation; biceps reduced from x2 to x1
- Legs A: abs slot removed (focus on quad/ham/calf)
- Legs B: abs slot removed (focus on posterior chain)

*Maintenance 2-Day:*
- Weekly set targets reduced; redundant arm/calf slots removed from Day 2; side-delts replaces vertical-press for the shoulder slot

*Maintenance 3-Day:*
- front-delts replaced with side-delts in Day 2 (pressing already covers anterior shoulder)
- Weekly set targets reduced slightly

*Deload / Recovery Week:*
- Abs slot removed from Day 1; conditioning slot removed from Day 3
- Weekly set targets reduced to 2 sets per muscle

**Frequency-aware slot rule (now documented in seed):**
- 1x/week: more exercise slots per session (e.g., chest x2 on PPL 3-Day Push)
- 2x/week: one exercise slot per muscle per session is sufficient
- 3x/week: one slot per session; keep per-session volume modest

### Current built-in split templates (12 total)

1. Bodybuilding PPL 3-Day (`split_bodybuilding_ppl_3`)
2. Bodybuilding PPL 6-Day (`split_bodybuilding_ppl_6`)
3. Upper/Lower 4-Day (`split_upper_lower_4`)
4. Full Body 3-Day (`split_full_body_3`)
5. Full Body 4-Day (`split_full_body_4`) ← new
6. Powerbuilding Upper/Lower 4-Day (`split_powerbuilding_ul_4`)
7. Powerbuilding 5-Day (`split_powerbuilding_5`) ← new
8. Maintenance 2-Day (`split_maintenance_2`)
9. Maintenance 3-Day (`split_maintenance_3`)
10. General Fitness 3-Day (`split_general_fitness_3`)
11. Conditioning + Strength (`split_conditioning_strength`) ← new
12. Deload / Recovery Week (`split_deload_recovery`)

### Normalization behavior

- Existing built-in templates are refreshed by seed ID on next load (name, description, requirements, weeklySetTargets).
- The three new templates are auto-inserted into existing databases via the missing-ID backfill in `normalizeDatabase`.
- Custom (user-owned) split templates are never overwritten.

### Validation

- Lint: passing
- Build: passing

### Remaining manual verification

- Split library shows all 12 templates with correct requirement counts
- PPL 3-Day Push shows 2 chest slots, no front-delts slot
- PPL 6-Day pull days show biceps x1; pull B shows mid-back instead of upper-back
- Deload shows 3 sessions of 3 exercises each at 2 sets per muscle
- New templates (Full Body 4-Day, Powerbuilding 5-Day, Conditioning + Strength) appear in split picker

## Prior Handoff — Supabase Persistence Phase 1: Auth + Cloud Snapshot Sync

## Prior Handoff — Workout Expansion Cleanup: Exercise Library, Splits, and Seed Defaults

### What changed

- Removed built-in fake starter weights from seeded workout templates and fresh local profiles.
- Seeded workout/session history is now blank by default, so new installs do not inherit fake 225/315-style load history.
- Expanded the built-in exercise library with richer metadata coverage for:
  - pressing, pulling, shoulder, quad, hamstring/glute, arm, calf/core, and conditioning movements
  - default unit/increment
  - bodyweight/time/unilateral flags
  - exercise family, variation group, fatigue profile, specificity, prescription profile, and role hints
- Added missing starter movements including:
  - Assisted Pull-Up
  - Front Raise
  - Cable Pull-Through
  - Ab Wheel
  - Bike
  - Rower
  - Sled Push
- Cleaned up exercise metadata details:
  - `Dumbbell Bench Press` renamed to `Flat Dumbbell Press`
  - `Dips` renamed to `Weighted Dip`
  - `Single-Arm Dumbbell Row` renamed to `One-Arm Dumbbell Row`
  - `Overhead Cable Triceps Extension` renamed to `Overhead Triceps Extension`
  - hamstring curl movement patterns corrected to `knee-flexion`
  - weighted pull-ups/dips now carry higher fatigue defaults than easy bodyweight accessories
- Rebuilt default split templates around real requirement slots instead of placeholder structures.

### New built-in split templates (prior pass — 9 templates)

- Bodybuilding Push/Pull/Legs 3-Day
- Bodybuilding Push/Pull/Legs 6-Day
- Upper/Lower 4-Day
- Full Body 3-Day
- Maintenance 2-Day
- Maintenance 3-Day
- Powerbuilding Upper/Lower 4-Day
- Deload / Recovery Week
- General Fitness 3-Day

### Programming defaults updated

- Weekly hard-set guidance is now more conservative and goal-aware.
- Per-session exercise-count guidance is now stored in `trainingRules.ts` for future warnings and planning logic.
- Bodybuilding defaults now bias moderate-to-higher reps and higher RPE on safer accessory work.
- Maintenance and deload defaults now bias fewer sets, lower RPE, and less redundant exercise selection.

### Normalization / migration behavior

- Existing local databases now backfill the richer built-in exercise metadata.
- Existing built-in exercises are refreshed by built-in ID so older installs receive the updated names and metadata.
- Existing built-in split templates are refreshed from seed definitions and any newly added default templates are inserted on load.
- Custom exercises and custom split templates remain user-owned and are not overwritten.

### Validation

- Lint: passing
- Build: passing

### Remaining manual verification

- Fresh app start:
  - no fake planned weights in default templates
  - no fake last-used history leaking into generated weights
- Library:
  - expanded exercise list appears in Exercise Library
  - renamed exercises and new conditioning/core entries appear as expected
- Split builder / generation:
  - PPL, Upper/Lower, Maintenance, Powerbuilding, Deload, and General Fitness templates show correct requirement counts
  - generated planned weights stay blank unless real history exists
- Legacy data:
  - older local DBs normalize safely into the richer built-in metadata and rebuilt default split definitions

### Mode simplification pass: separate local-only and cloud instances

**What changed**
- The old fake/local user picker remains removed from the active UI.
- App startup now stops at a mode gate when there is no Supabase session.
- Users must explicitly choose:
  - Sign in / sign up for Supabase account mode
  - Continue Local Only
- Signing in no longer auto-uploads or auto-merges this device's local-only data into the cloud account.
- The automatic local-vs-cloud conflict screen was removed from normal startup and sign-in.
- Local-only storage and cloud-account cache storage now live in separate slots.

**Local-only mode**
- When there is no Supabase session, the app shows the mode gate instead of entering the main app automatically.
- Choosing `Continue Local Only` opens the app with local storage only.
- A hidden local profile is ensured automatically in the stored database so the rest of the app can continue using the existing user-scoped data model without a visible login picker.
- Local-only data remains device/browser-specific and no cloud calls are made.
- Local-only data is stored separately from cloud-account cache data, so signing into Supabase does not treat it as the active account snapshot.

**Supabase account mode**
- When signed in, Supabase auth is the only cloud identity source.
- `session.user.id` is the `app_snapshots.user_id` owner.
- The app fetches the cloud snapshot before entering cloud mode and uses it as the source of truth.
- If no cloud snapshot exists yet, the app starts a separate fresh cloud-account instance instead of offering a startup overwrite decision.
- The local database is rebound to the Supabase account profile when safe, so the app’s internal user-scoped records no longer depend on the old fake login flow.
- Existing old local/fake profile data is migrated onto the Supabase user ID only when it is clearly local-only/fake data; it is not blindly copied across different Supabase accounts.

**Explicit import only**
- Local-only data no longer appears in a startup conflict chooser.
- In cloud mode, Settings now provides `Import Local Data Into Cloud`.
- Available actions there:
  - `Add / Merge`
  - `Replace Cloud`
  - `Cancel`
- `Add / Merge` is conservative and ID-based. Same-ID items prefer the newer `updatedAt` when available; otherwise cloud wins. Local-only IDs are added, cloud-only IDs are kept.

**Compatibility**
- Older stored databases with multiple fake users do not crash.
- The app selects the active/first stored local profile automatically for local-only mode.
- New seeded databases now create one default local profile instead of the old visible fake two-user setup.
- Legacy single-key local storage is migrated into the new local-only storage slot when needed.

**Validation**
- Lint: passing
- Build: passing

**Remaining manual verification**
- Real browser/manual verification still needs to be done in a configured environment:
  - signed out startup: mode gate appears and no fake picker appears
  - `Continue Local Only` opens the app and local data persists after refresh
  - signing in with existing cloud data loads the cloud account directly with no conflict popup
  - private/incognito sign-in loads the same snapshot
  - sign out keeps local data and returns to the mode gate
  - explicit `Import Local Data Into Cloud` works only after the user chooses merge or replace

### Repair pass: hydration loop + cross-device sync stability

**Root cause found**
- The first Phase 1 hook was hydrating from Supabase too broadly:
  - startup manually hydrated
  - `onAuthStateChange` could hydrate again
  - non-data auth events like token refresh were not filtered
- Cloud saving was also tied to a broad `db`-change effect, which made sync behavior feel coupled to render/state churn instead of actual user mutations.
- Fresh/incognito windows loaded a newly seeded local DB with a very recent `updatedAt`, which could incorrectly beat an older real cloud snapshot and prevent cross-device restore.
- Local load also always preferred the localStorage backup over IndexedDB instead of picking the newer local source.

**What changed in the repair**
- Cloud hydration now happens only at controlled times:
  - initial app load with an existing session
  - once after `SIGNED_IN`
- `TOKEN_REFRESHED`, `USER_UPDATED`, and similar auth events do not rehydrate app data.
- After hydration completes, local state owns the session. Cloud save success updates sync status only; it does not re-fetch/re-apply the snapshot.
- Autosave is now scheduled from real local persistence writes with a 3-second debounce, not from a general `useEffect(() => ..., [db])`.
- Added guard refs for:
  - `isHydratingFromCloud`
  - `hasHydratedFromCloud`
  - `isSavingToCloud`
  - `lastAppliedCloudSnapshotUpdatedAt`
  - `lastSavedCloudSnapshotUpdatedAt`
  - pending debounce timer
  - last saved serialized snapshot
  - hydrated user tracking
- Incognito/private-window restore is improved by treating seed/default local state as lower priority than a valid cloud snapshot, even if the fresh local seed timestamp is newer.
- Local DB bootstrap now chooses the newer of IndexedDB vs localStorage backup instead of always preferring the backup.

**Validation**
- Lint: passing
- Build: passing

**Remaining manual verification**
- Real Supabase table verification still needs to be done in a configured environment:
  - edit data
  - wait for autosave or click `Sync Now`
  - confirm `app_snapshots` row contents in Supabase
  - sign in from a private/incognito window with the same account
  - confirm cloud snapshot loads once and editing no longer reverts

### What landed

**Supabase client + env gating**
- Added `src/lib/supabaseClient.ts` using `@supabase/supabase-js`.
- Frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only.
- If env vars are missing, the app stays fully usable in local mode and cloud sync shows a disabled status instead of crashing.

**Snapshot sync model**
- Added top-level `updatedAt?: string` to `TrainingDatabase`.
- Local IndexedDB remains the working source of truth.
- Added Supabase snapshot helpers in `src/lib/cloudSync.ts`.
- Snapshot envelope shape is:
  - `version`
  - `updatedAt`
  - `data` = full current `TrainingDatabase`
- On sign-in/startup:
  - local DB loads first
  - Supabase session is checked
  - `app_snapshots` is fetched if signed in
  - cloud mode reads/writes a separate per-user cache on this device
  - local-only data is not used unless the user explicitly imports it later
- On local edits:
  - local save still happens immediately
  - cloud save is debounced at 3 seconds when signed in
- Manual `Sync Now` is available in Settings for cloud mode only.

**Auth**
- Added email/password Supabase auth controls in Settings:
  - sign up
  - sign in
  - sign out
  - signed-in email display
- If sign-up requires email confirmation, the UI tells the user to confirm before signing in.
- Existing local PIN profile login remains untouched.

**UI**
- Header now shows a lightweight cloud sync status pill that links users to Settings.
- Settings now includes a Cloud Sync panel with:
  - auth controls
  - sync status
  - last synced time
  - local snapshot time
  - manual sync
  - error messaging

**Supabase SQL**
- Added `supabase/migrations/001_app_snapshots.sql`.
- Added `supabase/README.md` with SQL Editor setup steps for teams not using the Supabase CLI yet.

### Rules preserved

- Local-only mode still works exactly as before when not signed in.
- Missing Supabase env vars do not break the app.
- No service-role or secret key is used in the browser app.
- This phase stores one JSONB snapshot row per Supabase auth user; full table normalization is still deferred.

### Known limitations in this phase

- Conflict handling is intentionally simple: latest snapshot wins.
- Snapshot sync stores the full current training database document, including the current local multi-user document shape.
- No advanced offline merge/conflict resolution yet.
- Manual cross-device Supabase verification still needs to be done in a real configured environment.
- Dev-server browser verification was blocked in this Codex session by sandbox port binding (`listen EPERM` on `127.0.0.1:5174`).

### Lint/build

- **Lint:** passing
- **Build:** passing

### Recommended next step

- Manually test cross-device persistence in a real Supabase-configured environment:
  - no-env local fallback
  - sign up / sign in / sign out
  - create/edit local data
  - auto snapshot sync
  - refresh persistence
  - second-device load
  - `Sync Now`
- After persistence testing passes, resume V3 programming work.

## Current Handoff for Codex — Library UX Fix: Editable Defaults, Custom Section, Variation Builder

### What landed

**Goal:** Fix the product model so Default = editable (not read-only), add Default/Custom tabs, give each exercise proper Edit/Delete/Reset/Duplicate actions, and add variation controls to the exercise editor.

**Domain changes (`src/types/domain.ts`):**
- Added `userModified?: boolean`, `hasVariations?: boolean`, `variationType?: string`, `isArchived?: boolean` to `Exercise`.
- Added `userModified?: boolean` to `SplitTemplate`.
- (From prior session) `source?: "default" | "custom"` and `copiedFromId?: string` on both.

**Migration (`src/lib/db.ts`):**
- `normalizeDatabase` now skips core-field refresh for exercises where `userModified === true` (preserves user edits to defaults).
- Same for splits: refresh skipped if `userModified === true`.
- `hasVariations` backfilled: any exercise that has at least one other exercise pointing to it via `parentExerciseId` gets `hasVariations = true`.
- Deprecated default splits (no `ownerUserId`, not in seed) are still removed on load.

**Seed data (`src/data/seedData.ts`):** (from prior session, unchanged)
- Five variation exercises tagged: `ex_close_grip_bench`, `ex_front_squat`, `ex_highbar_squat`, `ex_rdl`, `ex_chin_up`.
- Five new standalone variation exercises: `ex_paused_squat`, `ex_box_squat`, `ex_paused_bench`, `ex_deficit_deadlift`, `ex_rack_pull`.

**App.tsx:**
- Imports: replaced `Lock` with `EyeOff` (archive) and `RotateCcw` (reset). Added `builtInExercises` and `seedSplitTemplates` imports from seedData for reset logic.
- Exercise editor: `saveEditExercise()` now works for ALL exercises (default and custom). Editing a default marks `userModified = true`. Variation fields added to draft (`isVariation`, `parentExerciseId`, `variationType`) and populated in `startEditExercise()`.
- Exercise editor panel: collapsible "This is a variation" section with parent exercise dropdown + variation type text field. Advanced options (fatigue rating, movement patterns, allowed units, checkboxes, tags) moved into the collapsible Advanced section.
- Exercise card metadata: shows `(edited)` badge for `userModified` defaults, `variation` and `has variations` labels.
- Exercise card actions: Edit (all), Duplicate (all), Reset/RotateCcw for `userModified` defaults with a seed match, Delete/Trash for custom, EyeOff/Hide for default non-archived.
- `deleteExercise()`: hard-delete for custom (confirm), soft-archive (`isArchived=true`) for default (confirm).
- `resetExerciseToDefault()`: restores full seed values, clears `userModified` and `isArchived`.
- Exercise library source filter: replaced dropdown with All / Default / Custom / Hidden tabs.
- `duplicateExercise()`: creates custom copy with `source: "custom"`, `copiedFromId`, opens edit form.
- SplitLibraryManager: `updateSplit()` removed `ownerUserId` guard — all splits are editable. Marks `userModified = true` for defaults.
- SplitLibraryManager: `resetSplitToDefault()` restores seed days/name/goal/notes, clears `userModified`.
- SplitLibraryManager: `deleteSplit()` still custom-only.
- Split Builder: unified edit form for all splits (no read-only conditional). Default splits show Reset button when `userModified`. Custom splits show Delete button.
- Split list: All / Default / Custom tabs.
- `createSplit()`: sets `source: "custom"`.

### Lint/build
- **Lint:** passing
- **Build:** passing

### Known TODOs
- Grouped variation picker in the exercise selector (e.g., expand Competition Squat to show Paused/Box/High-Bar) is not yet implemented. Fields exist; grouped display is future work.
- Movement pattern filter was removed from exercise library to reduce clutter. Can be re-added to Advanced Filters if needed.
- No global "Reset all defaults" button yet. Per-item reset exists.

---

## Prior Handoff — V3 Phase 2: Goal/Block Programming Rules

### What landed in V3 Phase 2

**Philosophy:** The goal hierarchy is now enforced throughout the generator and prescription engine. `block.goalOverride` takes precedence over `block.goal`, which takes precedence over `program.goal`. All exercise selection, slot planning, scoring, and prescription logic resolves `goalUsed` before computing anything.

**Domain changes (`src/types/domain.ts`):**
- Added `goalOverride?: TrainingGoal` to `TrainingBlock` — explicit block-level goal that overrides the program-level goal for all training logic.

**New helper (`trainingRules.ts`):**
- `getGoalUsed(programGoal, blockGoalOverride?, splitGoal?)` — resolves the effective training goal for a block. Returns `blockGoalOverride ?? splitGoal ?? programGoal`.

**Week progression engine (`programmingRules.ts`):**
- Added `getWeekProgressionModifier({ goalType, blockType, weekIndex, totalWeeks, exerciseRole, fatigueTag })` — returns `{ rpeAdjust, repsAdjust, setsAdjust }` for the given week position.
  - Deload: −1 RPE, −1 set for all roles.
  - Peaking main lifts: up to +1.5 RPE across the block, rep reduction in weeks 3+.
  - Bodybuilding/powerbuilding: +0.5 RPE ramp, +1 rep in week 1 for accessories, optional set reduction for high-fatigue exercises in final week.
  - Powerlifting: +1.0 RPE ramp for main lifts with rep reduction at 60%+ progression; +0.5 RPE for accessories.
  - Maintenance/general-health: flat (no progression).
- `getPrescriptionForExerciseSlot` now applies `weekMod` instead of the old simple `lateBlock +0.5 RPE` logic.

**Exercise selection improvements (`programmingRules.ts`):**
- Fixed `getRequirementSlotPlan` chest slot 1 for bodybuilding: previously fell through to `hypertrophy_accessory` for slot 1; now returns `primary_compound` with broad category preference.
- `scoreExerciseForSlot` goal-aware bonuses/penalties:
  - Bodybuilding slot ≥1: +10 for `hypertrophy_accessory`, `isolation`, `pump_accessory`.
  - Powerbuilding slot ≥2: +8 for `hypertrophy_accessory`, `isolation`.
  - Maintenance/general-health: −10 for `high`-fatigue exercises outside `main_lift` role.
- Powerbuilding slot 3+ (chest/back) returns `hypertrophy_accessory` (same as bodybuilding) instead of plain `isolation`.

**Goal resolution wired everywhere:**
- `App.tsx` `chooseForMe()`: resolves `goalUsed = getGoalUsed(program.goal, block?.goalOverride ?? block?.goal)` and passes it to all `getRequirementSlotPlan` / `scoreExerciseForSlot` calls.
- `App.tsx` `buildPlannedExerciseFromExercise()`: resolves `goalUsed` and uses it for prescription and weight recommendation.
- `programGenerator.ts`: Added `blockGoalOverride?` to `ProgramRequest`; `chooseExercisesForDay` and `plannedExerciseFor` resolve `goalUsed = getGoalUsed(request.goal, request.blockGoalOverride)`.
- `programAnalysis.ts`: `effectiveGoal = block?.goalOverride ?? block?.goal ?? program.goal` drives all goal-conditional warnings (bodybuilding diversity, general-health patterns, maintenance volume, squat pattern, posterior chain).

**Advisory warnings (`programAnalysis.ts`):**
- Powerbuilding advisory: warns when a day has ≥4 exercises but no isolation or machine compound exercise (encourages accessory variety).
- All existing goal-conditional warnings (`general-health`, `bodybuilding`, `maintenance`) now use `effectiveGoal` instead of `program.goal`, so block-level goal overrides take effect.

### Key rules preserved
- All existing logic is backward-compatible. `goalOverride` is optional; if absent, falls back to `block.goal` then `program.goal`.
- Advisory warnings remain advisory — no auto-rewrites.
- Requirement counts and user-selected splits are still respected.

### Lint/build
- **Lint:** passing
- **Build:** passing

### Recommended next step
- V3 Phase 3: Wire `exerciseMetadata.ts` helpers (`getExerciseFamily`, `getFatigueProfile`) into the fatigue budget in `programmingRules.ts` for richer day-level fatigue accounting using the 7-dimension profile.
- Add `blockGoalOverride` UI to block editor so users can explicitly set a training phase goal.

---

## Prior Handoff — V3 Phase 1: Exercise Metadata Foundation

### What landed in V3 Phase 1

**Philosophy:** All existing metadata fields and generator logic are preserved. This pass adds a 7th fatigue dimension, two new movement patterns, a pure helper module, and full seed coverage — so every exercise in the library now has training-aware metadata.

**Domain changes (`src/types/domain.ts`):**
- `MovementPattern` extended with: `"trunk-flexion"`, `"ankle-extension"`
- `ExerciseFatigueProfile.axialFatigue?: FatigueLevel` — 7th optional dimension (spinal/axial loading)

**New module: `src/lib/exerciseMetadata.ts`**
Pure helper functions with safe defaults — all work correctly even when an exercise has no explicit metadata:
- `getExerciseFamily(exercise)` — returns `exerciseFamily` or derives it from category/movementPattern
- `getMovementPattern(exercise)` — returns `movementPattern` with "isolation" fallback
- `getFatigueProfile(exercise)` — returns all 7 dimensions with safe defaults
- `getSpecificity(exercise)` — returns squat/bench/deadlift 0–1 with 0 defaults
- `getPrescriptionProfile(exercise)` — returns rep/RPE/set ranges with conservative defaults
- `getRoleHint(exercise, goalType)` — checks `defaultRoleByGoal` then falls back to `inferBaseExerciseRole`
- `isHighFatigueExercise(exercise)` — true when systemic or local fatigue is "high" or "very_high"
- `isLowBackFatigueExercise(exercise)` — true when lowBackFatigue or axialFatigue is "high" or "very_high"
- `isPressingFamily(exercise)` — true for bench/press family exercises
- `isSbdMainLift(exercise)` — true for competition squat/bench/deadlift
- `normalizeExerciseMetadata(exercise)` — derives all missing fields at runtime from existing properties
- `fatigueProfileToTag(fp)` — converts 7-dimension profile to "low"/"moderate"/"high" scalar tag

**Seed coverage (`src/data/seedData.ts`):**
All ~60 exercises now have full metadata. Previously 17 had metadata; the remaining ~43 were added this pass. Every exercise now has `exerciseFamily`, `variationGroup`, `fatigueProfile` (with `axialFatigue`), `prescriptionProfile`, `defaultRoleByGoal`, and where appropriate `specificity` and updated `movementPattern`.

**Migration (`src/lib/db.ts`):**
- `normalizeDatabase` now patches `axialFatigue` onto stored fatigueProfiles that were persisted before this pass

### Key rules preserved
- All changes are backward-compatible; no existing data or generator logic was modified.
- `normalizeDatabase` handles migration for stored exercises missing `axialFatigue`.
- `exerciseMetadata.ts` functions are pure — no side effects, no DB reads.

### Lint/build
- **Lint:** passing (`eslint .`, 0 errors)
- **Build:** passing (`tsc -b && vite build`)

### Recommended next step
- V3 Phase 2: Wire `exerciseMetadata.ts` helpers into the generator and progression logic. Specifically: use `getFatigueProfile` for day-level fatigue budgeting, use `getPrescriptionProfile` overrides for next-week progression suggestions, and use `getExerciseFamily` for family-level volume tracking.

---

## Current Handoff for Codex — V3.1C Exercise Metadata Hardening

### What landed in V3.1C

**Philosophy:** User still controls split / day / focus / muscle requirements / exercise counts. The app now has richer per-exercise knowledge to optimize inside those constraints, with more targeted warnings based on goal and block type.

**Exercise model additions (src/types/domain.ts):**
- `MovementPattern` extended with: `"incline-press"`, `"knee-extension"`, `"hip-extension"`, `"shoulder-abduction"`, `"spinal-extension"`, `"trunk-stability"`
- Three new interfaces: `ExerciseFatigueProfile` (6 fatigue dimensions: systemic, local, jointStress, lowBack, pressing, grip), `ExerciseSpecificity` (squat/bench/deadlift 0–1), `ExercisePrescriptionProfile` (preferredRepRange, preferredRpeRange, defaultSetRange, avoidLowRepLoading, failureTolerance)
- New optional fields on `Exercise`: `exerciseFamily`, `variationGroup`, `fatigueProfile`, `specificity`, `prescriptionProfile`, `defaultRoleByGoal`

**Seed metadata added (src/data/seedData.ts):**
17 key exercises now have rich metadata: ex_squat_comp, ex_bench_comp, ex_deadlift_comp, ex_front_squat, ex_rdl, ex_barbell_row, ex_cable_row, ex_pull_up, ex_db_incline_press, ex_close_grip_bench, ex_incline_barbell_press, ex_cable_lateral_raise, ex_db_lateral_raise, ex_cable_triceps_pressdown, ex_push_up, ex_back_extension, ex_hip_thrust.

**Programming rules improvements (src/lib/trainingIntelligence/programmingRules.ts):**
- `getExerciseRoleForGoal(exercise, goalType)` — checks `defaultRoleByGoal` first, then falls back to `inferBaseExerciseRole`
- `scoreExerciseForSlot` now uses `getExerciseRoleForGoal` instead of `inferBaseExerciseRole`
- Family diversity penalty: -20 per same `exerciseFamily` already in day; -28 per same `variationGroup` already in day; -12 per weekly variationGroup repeat
- `fatigueProfile` fine-grained checks: high pressingFatigue exercises penalized when press budget is already high; high lowBackFatigue exercises penalized when low-back budget is already high; very_high systemic fatigue penalized when another high-fatigue exercise is already on the day
- `getPrescriptionForExerciseSlot` applies `prescriptionProfile` overrides at end: `avoidLowRepLoading` floors reps to preferredRepRange.min; `preferredRepRange` clamps reps; `preferredRpeRange` clamps targetRpe; `defaultSetRange` clamps sets
- `getRequirementSlotPlan` triceps exception: powerlifting/strength days assign slot 1 triceps as `secondary_compound` (to favor close-grip bench or dips) rather than `isolation`

**Goal/block-aware warnings (src/lib/programAnalysis.ts):**
- Peaking blocks: warn when accessory count > 4
- Deload blocks: warn when estimated weekly sets > 30
- Bodybuilding/general-health: warn when any day has ≥3 exercises sharing the same movement pattern
- General-health: warn when vertical pull, hip hinge/squat, or core brace patterns are missing
- Maintenance: warn when total weekly sets exceed 60

**Migration (src/lib/db.ts):**
- `normalizeDatabase` now copies `exerciseFamily`, `variationGroup`, `fatigueProfile`, `specificity`, `prescriptionProfile`, `defaultRoleByGoal` from built-in definitions to matching stored exercises that lack these fields.

### Key rules preserved
- User-controlled requirement counts are never reduced or overridden.
- All warnings remain advisory; no auto-rewrites of splits or prescriptions.
- New metadata only adds new optional fields; backward compatibility is maintained via `normalizeDatabase`.

### Lint/build
- **Lint:** passing (`eslint .`, 0 errors)
- **Build:** passing (`tsc -b && vite build`)

### Recommended next step
- V3.2 should wire `getExerciseRoleForGoal` and `prescriptionProfile` into next-week progression suggestions (name exercises, suggest load/rep/set changes, require user approval before applying).
- Expand rich metadata to remaining seed exercises beyond the initial 17.

---

## Current Handoff for Codex — V3.1 Training Intelligence Foundation

### V3.1B Constraint-Aware Program Optimization

- The programming layer now explicitly optimizes inside the user’s chosen split instead of trying to silently “fix” the split.
- Requirement counts still stay user-controlled and hard-capped.
- Choose For Me and generated plans now consider:
  - slot role
  - day fatigue budget
  - low-back and axial stacking
  - repeated exercise limits
  - repeated bench-variation limits
- Added role overrides for common exercises where default classification was too blunt, including Push-Up, Back Extension, Pull-Up, RDL, Hip Thrust, Cable Triceps Pressdown, and lateral-raise style work.
- Dynamic prescriptions now better separate:
  - main lift
  - primary / secondary compound
  - accessory compound
  - isolation / hypertrophy accessory
- Program analysis now adds concise advisory warnings for repetition, recoverability, pressing bias, and hard-to-optimize day structures.
- Warnings remain advisory only. The app still respects the split the user created.

### V3.1A Programming Rules Adjustment

- Added exercise-role-based generation for requirement slots.
- Requirement counts remain user-controlled; the app now improves exercise variety inside those slots instead of reducing or overriding them.
- `Choose For Me` and `programGenerator` now assign slot roles like `main_lift`, `secondary_compound`, `isolation`, and `hypertrophy_accessory`.
- Dynamic prescriptions now use goal, block type, day focus, exercise role, slot order, and fatigue cost to set sets, reps, RPE, and rest.
- Same-muscle multi-slot requests now try to diversify movement role and fatigue profile, so chest `3/3` is less likely to become three redundant heavy barbell presses.
- Program balance warnings remain advisory only. The app can warn about pressing bias, but it still respects the user’s chosen requirement counts.
- Full Training Intelligence / broader progression logic is still deferred to later passes.

### What landed in this pass

- Added `src/lib/trainingIntelligence/` as the new deterministic training-intelligence layer.
- Kept the system rules-based and local: no AI runtime, no black-box recommendations, no cloud work.
- Added research-backed goal/block target rules with conservative defaults for rep ranges, RPE ranges, set volume, specificity, fatigue tolerance, and progression style.
- Added readiness scoring cleanup with baseline-centered scoring and conservative load/volume/confidence modifiers.
- Added set performance scoring, observed e1RM calculation, normalized e1RM scaffold, same-exercise baseline selection, same-exercise weight recommendation, confidence scoring, and concise recommendation-reason text.
- Lightly wired the new recommendation layer into planned workout cards, the live logger weight analysis, off-program starting weight suggestions, and generated planned exercise weights.

### Key product rules now in place

- V3.1 uses same-exercise history only. No exercise-family transfer or variation prediction yet.
- Observed e1RM stays close to the completed set itself; normalized e1RM only makes small readiness/context adjustments.
- Readiness baseline is normal, not idealized. Neutral check-ins should land around baseline, not near-perfect.
- Recommendation confidence drops when history is old, sparse, or internally conflicting.
- Recommendation text stays short and factual.

### Deferred on purpose

- Exercise transfer prediction across variations or families.
- Full normalized e1RM personalization curve.
- Full analytics overhaul.
- Settings overhaul.
- Cloud sync.
- Program generator v2 / broader programming overhaul.

### Recommended next step

- V3.2 should wire this foundation into next-set and next-week progression decisions more directly, while keeping manual approval and deterministic rules.

---

## Current Handoff for Codex — V2 Hotfix Continuation

> **Read this section first.** It summarises the current state of the branch and what needs to happen next before the app is stable enough to move into the Training Intelligence / Weight Estimator v1 phase.

### V2 Final Polish Hotfix — Block Planner Reset / Skip WIP / Mobile Actions

- Reset Block Planner now clears the saved builder draft, removes the user's draft program from IndexedDB, resets local planner controls, and hides the stale draft Weekly Overview.
- Skip This Workout now marks the matching in-progress workout session as abandoned before syncing block progress, so Week shows skipped instead of in progress and Today no longer offers the skipped workout as resumable.
- Today action layout now keeps Start/Resume as the primary action, then stacks Go Back / Move To Next Day / Skip This Workout, then Edit Current Day / Go Off Program with full-width mobile buttons.
- V2 should be considered stabilized after this hotfix if manual testing passes. Next phase remains V3 Training Intelligence v1 / algorithm iteration work.

### Next-session handoff

- **Branch:** `v2.1-BugHotfix`
- **Project state:** Late V2 stabilization. The app is in blocker-fix mode only; do not start V3 or Weight Estimator v1 until this stabilization pass is manually verified.
- **What was fixed in the latest session:** direct planned-exercise swap/edit controls in `WorkoutDayEditor`; Easy/5 recommendation path and recommendation identity cleanup; manual weight carry-forward from the previous actual set; stricter week planned/completed truth; completed-block handling with Block Complete actions instead of fake next-week prompts.
- **Files changed in the latest session:** `src/App.tsx`, `src/lib/algorithms/setAdjustment.ts`, `src/lib/blockProgression.ts`, `src/lib/trainingMath.ts`, `src/types/domain.ts`, `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`.
- **Manual testing still needed:** swap a single exercise in Today/Week editor and confirm only that row changes; Easy/5 after a manual starting weight; Easy/5 after applying a prior decrease; unplanned Week 2/3 truth; final-week block completion flow.
- **Known remaining bugs/TODOs:** end-to-end verification for recommendation scoping, stale set edit mode, and continuous-loop week copying; mobile overflow screenshots still needed; generator/library follow-ups stay deferred until V3 prep.
- **Lint / build:** passing (`eslint .`, `tsc -b && vite build`).
- **Recommended next step after merging:** run the manual stabilization scenarios in the browser, then merge once the gym-flow checks pass.
- **Reminder:** V3 Training Intelligence v1 should begin only after V2 stabilization is verified and no workout-blocking bug remains.

### App state

Iron Orbit Training is in late V2 alpha/hotfix work. The app is deployed to Vercel and is testable end-to-end, but several blocker-class bugs remain from real gym testing that must be fixed before new features begin.

### Current branch and build

- **Branch:** `v2.1-BugHotfix`
- **Uncommitted working-tree changes:** `src/App.tsx`, `src/types/domain.ts`, `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`
- **Lint:** passing (`eslint .`, 0 errors)
- **Build:** passing (`tsc -b && vite build`, 1595 modules)

### What was recently worked on (this branch)

All work is in `src/App.tsx` and `src/types/domain.ts`. Changes are staged but not yet committed.

| Area | What changed |
|------|-------------|
| **Requirement counting** | `countFulfilled` rewritten: explicit-first with `anyTagged` guard; counts capped at `req.requiredExerciseCount`. `isExtra` field on `PlannedExercise` for over-cap extras. |
| **Choose For Me** | `chooseForMe` now tags `fulfillsRequirementId` on every picked exercise. |
| **Add Extra Anyway** | Modal added when adding to a full requirement; extra exercises get `isExtra=true` and are never counted toward slots. |
| **Activating a block** | `activateProgram` archives in-progress sessions before activating. |
| **Coach suggestion** | Scoped to `effectiveSetIndex === lastNonSkippedSet.setNumber` (target set only). Wording: "Suggestion from Set N", "Use X for this set", "Apply to Current Set". Applied → compact badge. |
| **Today draft gating** | `weekLocked` lifted to outer scope; `isWeekDraft()` used as source of truth. When locked, entire workout card/exercise list hidden; only planning-notice panel shown. |
| **WeekEditor buttons** | Three buttons: **Save Week** (clears draft), **Exit Editor** (keeps draft), **Discard Draft** (restores snapshot). `weekSnapshotRef` captures workouts at mount. |
| **NumberField spinner** | `max` prop added; `onChange` fires immediately on every valid change; blur clamps to `[min, max]`. Days/week: `min={1} max={7}`. |
| **Source-of-truth helpers** | `isWeekDraft`, `isWorkoutDayPlanned`, `isWeekPlanned` added at module scope. |

### V2 Final Stabilization Pass — 2026-05-08

This pass focused only on blocker stabilization before Weight Estimator v1.

| Area | What changed |
|------|--------------|
| **Requirement caps** | `programGenerator.ts` now fills `SplitDay.requirements` as hard slots and tags `fulfillsRequirementId`; generated plans no longer add extra same-muscle exercises when requirements are full. |
| **Choose For Me** | `WorkoutDayEditor.chooseForMe()` now uses derived requirements, fills each requirement only up to `requiredExerciseCount`, honors requirement movement pattern when present, and reports unfilled slots instead of adding extras. |
| **Draft source of truth** | `TrainingWeek.savedWorkoutsBeforeDraft` stores the saved baseline when Week Editor opens. Save clears draft metadata; Exit preserves draft; Discard restores the baseline or empties the unsaved week. |
| **Today gating** | Today uses the shared `isWeekDraft`/`isWeekPlanned` helpers. If a week is draft or unplanned, the workout card and exercise list are hidden completely. |
| **Week overview UI** | The richer weekday card selector was restored for editable weekly overview and Week Editor day selection. |

### V2 Final Stabilization Pass — Exercise Editing / Mobile / Reviews

- Exercise Library editing now applies to seed and user-created exercises while preserving `exercise.id`; movement patterns remain hidden under Advanced Options.
- Mobile workout logging layout was tightened with min-width-safe logger grids, single-column phone inputs/actions, bottom spacing, and explicit vertical scroll behavior.
- Coach recommendation display now recomputes from the selected target set's prior completed source set. Recommendation identity includes source/target exercise and set indexes.
- Set lineup tapping now selects pending, completed, and skipped sets. Back selects the previous set instead of deleting it. Editing a skipped set with actual values unskips/completes it.
- Week completed days now open a Completed Session Review instead of the planned day editor. Logged set values, setRating, notes, and skipped state can be edited and saved.
- Off-program completed sessions appear in Week history and use the same review/edit flow without modifying active block plans.
- Completed-session edits rebuild exercise performance logs so analytics reflect the edited history.
- V3 Training Intelligence v1 remains deferred until these V2 stabilization changes are manually verified.

### V2 Final Bugfix — Scroll / Off-Program Weights / Set Counting

- Restored normal document scrolling by removing the app shell overflow trap, keeping horizontal clipping on the document, and allowing `html/body/#root` to use normal vertical scroll.
- Off-program builder now writes the displayed starting weight into the first `offProgramPlannedSets` entry before the session starts; added off-program exercises use the same path.
- Manual weight carry-forward now prefers the previous completed actual set when the next set has no explicit planned/applied weight.
- Recommendation display uses the selected target set's prior valid completed source set, so Easy/Hard adjustments use the real load the user actually logged.
- Applied recommendations update off-program planned sets as well as programmed planned sets, so navigation does not lose the applied target weight.
- Completed/off-program history now counts valid completed sets only, excluding skipped and warmup sets, and exercise performance logs preserve all completed off-program sets.
- Browser smoke checked desktop and 390px mobile vertical scroll on Today; lint and build pass.
- If the manual gym tests pass, this branch is ready for V3 Training Intelligence v1 / algorithm iteration work.

### Current verification

- **Lint:** passing (`eslint .`)
- **Build:** passing (`tsc -b && vite build`)
- **Browser smoke:** app loaded on local dev server at `http://127.0.0.1:5175/`; Today and Week page rendered after the changes.

### Remaining follow-up

- Full manual gym-flow verification is still recommended for requirement caps, Discard Draft, and Today gating against real local user data.

#### BUG-D — Recommendation scoping needs verification

**Intended behavior (implemented but not yet verified end-to-end):**
- Set 1 rated Easy → recommendation "Suggestion from Set 1 / Use X for this set" appears only on Set 2.
- Moving to Set 3 hides Set 1's suggestion.
- Returning to Set 2 shows it again if not applied.
- Applying shows compact `✓ Applied to this set` and removes the Apply button.
- Each subsequent set generates its own independent recommendation.
- setRating=5 + actual RPE ≤ target RPE must never recommend decreasing.

**Needs:** Manual verification by Codex against `setAdjustment.ts` logic and `isOnSuggestionTarget` gating in LiveLogger.

**Relevant code:**
- `isOnSuggestionTarget` + suggestion rendering in `LiveLogger` (~line 1030 area)
- `setAdjustment.ts` in `src/lib/algorithms/`
- `persistedAppliedRec` derivation

#### BUG-E — Set navigation / Update Set mode needs verification

**Intended behavior (implemented but not yet verified):**
- Tapping a logged set pre-fills the form with that set's values.
- Logging normally advances the cursor without leaving "Update Set" mode active.
- `setSelectedSetIndex(null)` is called on normal `logSet` path.

**Needs:** Verification that the stale `selectedSetIndex` bug is truly resolved and no edge case re-introduces it.

**Relevant code:**
- `selectedSetIndex`, `effectiveSetIndex`, `isEditingPastSet` in `LiveLogger`
- `logSet()` path, particularly the `setSelectedSetIndex(null)` call

#### BUG-F — Continuous loop week copying needs verification

**Intended behavior (implemented but not yet verified):**
- `copyWeekExercises` blocks copy when `splitDayId` values differ OR `focus` labels differ.
- Week 2 Lower day should not receive Week 1 Upper exercises.

**Needs:** Verification against a real 1-day/week continuous-loop block in the app.

**Relevant code:**
- `copyWeekExercises()` in App.tsx (~line 3875 area)
- `WeekEditor` mount `useEffect` pre-check

### Confirmed product rules to preserve

**Requirements**
- One exercise fulfills exactly one requirement slot. `fulfillsRequirementId` is the primary source of truth.
- Secondary muscles do not fulfill requirements (only `primaryMuscles` checked).
- Requirement caps are hard limits by default. `countFulfilled` is capped at `req.requiredExerciseCount`.
- Extra exercises require explicit "Add Extra Anyway" action (`isExtra=true`).
- Choose For Me must never add extras automatically.

**Week drafts**
- `isDraft=true` while WeekEditor is open.
- Exit Editor: keeps draft, closes editor.
- Discard Draft: restores snapshot, sets `isDraft=false`, closes.
- Save Week: sets `isDraft=false`, closes.
- Today must not show incomplete/draft weeks as trainable.

**Today**
- If `isWeekDraft` or `!isWeekPlanned`, hide workout card completely.
- "Go Off Program" is always available.

**In-progress sessions**
- Only one per user at a time.
- Starting a new workout archives the previous in-progress session.

**Recommendations**
- setRating 5/Easy + actual RPE ≤ target RPE: never recommend decreasing.
- Recommendation shown only on the immediate next set after the source set.
- Applied state persists via `applied=true` in DB.
- Each set generates its own independent recommendation.

### Recommended next Codex priorities (in order)

1. Fix BUG-A: requirement cap enforcement in Choose For Me and the program-generator path.
2. Fix BUG-B: WeekEditor Discard Draft snapshot timing / restore correctness.
3. Fix BUG-C: Today gating so `!isWeekPlanned` hides workout card regardless of `isDraft` flag.
4. Verify BUG-D: recommendation scoping and `setAdjustment.ts` logic.
5. Verify BUG-E: set tapping / Update Set mode.
6. Verify BUG-F: continuous loop week copying.
7. After all 6 are resolved: move to Training Intelligence v1 / Weight Estimator v1 (see ROADMAP.md).

### Architecture reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | All screens and UI components (~5000 lines) — main editing target |
| `src/types/domain.ts` | Core TypeScript domain model |
| `src/lib/db.ts` | IndexedDB load/save + `normalizeDatabase` migration |
| `src/lib/trainingMath.ts` | e1RM, RPE, readiness, set summaries, Week Review |
| `src/lib/programGenerator.ts` | Block/week/day generation — relevant for BUG-A |
| `src/lib/programmingLogic.ts` | `buildPlannedExerciseFromExercise` |
| `src/lib/algorithms/setAdjustment.ts` | Per-set recommendation logic — relevant for BUG-D |
| `src/lib/algorithms/loadPrescription.ts` | Weight estimator stub |
| `src/data/seedData.ts` | Built-in exercises and split templates |

---

## Current Project Status

- **Branch:** `v2.1-BugHotfix`
- **Build:** Passing (`tsc -b && vite build`)
- **Lint:** Passing (`eslint .`, no errors)

Modified files (cumulative on this branch, not yet committed):
- `src/App.tsx`
- `src/types/domain.ts`
- `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`

---

## V2 Final Gating Hotfix — Completed Work

### 1. Today Screen — Workout Card Hidden While Week Is Draft

**Problem:** Today showed a warning banner when `weekLocked` but still rendered the workout card, exercise list, navigation buttons, and "Edit Current Day" underneath it.

**Fix:** `weekLocked` derivation lifted from the IIFE inside the panel to the outer `TodayScreen` scope, using `isWeekDraft(todayPlan?.week)`. When `weekLocked === true`, the entire workout section is replaced by a `border-ember/40` notice panel containing:
- "Week N is being planned"
- "Finish planning and save Week N in the Week Planner…"
- "Continue Planning Week N" → navigates to Week tab
- "Go Off Program" → starts an off-program session

No draft exercises are shown. The normal card renders only when `!weekLocked`.

`showEditDay` and `WorkoutDayView` are also gated behind `!weekLocked`.

### 2. WeekEditor — Exit Editor / Discard Draft / Save Week

**Problem:** The only buttons were "Done — Save Week N" (marked saved) and "Cancel" (called `onClose` silently). Cancel's behavior was ambiguous — it kept `isDraft=true` in the DB.

**Fix:**

Three explicit buttons:

| Button | Behavior |
|--------|----------|
| **Save Week N** | Calls `updateDb` to set `isDraft=false`, then `onClose()`. Week is now trainable. |
| **Exit Editor** | Calls `onClose()` only. Week stays `isDraft=true`; Today remains locked. |
| **Discard Draft** | `confirm()` → restores `weekSnapshotRef.current` into DB + sets `isDraft=false` → `onClose()`. |

**Snapshot mechanism:** `weekSnapshotRef = useRef<WorkoutDay[] | null>(null)`. On the first render (before any edits), the component deep-clones `week.workouts` via `JSON.parse(JSON.stringify(...))`. WorkoutDayEditor auto-saves each edit, so the snapshot preserves the state at editor-open time. "Discard Draft" writes this snapshot back to the DB.

### 3. Planned-State Source of Truth

Three module-level helpers added above `builderDraftKey`:

```typescript
function isWeekDraft(week): boolean  // true when week.isDraft === true
function isWorkoutDayPlanned(day): boolean  // true when day has at least one exercise
function isWeekPlanned(week): boolean  // true when not draft AND has at least one planned day
```

`TodayScreen` now uses `isWeekDraft(todayPlan?.week)` directly.

### 4. Coach Suggestion — Scoped to Target Set

**Problem:** `recommendation` was derived from `lastNonSkippedSet` on every render and displayed regardless of which set was currently selected. Set 1's suggestion showed on Set 3, 4, etc.

**Fix:**

```typescript
const suggestionTargetIndex = lastNonSkippedSet ? lastNonSkippedSet.setNumber : -1;
const isOnSuggestionTarget = effectiveSetIndex === suggestionTargetIndex;
```

`lastNonSkippedSet.setNumber` is 1-based. The target 0-based set index for showing the suggestion equals `setNumber` (since target = the set after the last logged set, i.e., index = count of logged sets = `setNumber`).

Display gated on: `recommendation && !lastSetWasSkipped && isOnSuggestionTarget`.

**Navigation behavior:**
- Set 1 logged → `suggestionTargetIndex = 1` → show on Set 2 (index 1). ✓
- User taps Set 3 (index 2) → `2 !== 1` → hidden. ✓
- User returns to Set 2 → `1 === 1` → shown again if not applied. ✓

### 5. Suggestion Wording — "Apply to Current Set"

When showing on the target set, the language is now contextually correct:

| Element | Old text | New text |
|---------|----------|----------|
| Label | "Coach suggestion" | "Suggestion from Set N" |
| Title | "Increase next set" | "Use 80kg for this set" |
| Button | "Apply 80kg to Set 3" | "Apply to Current Set" |
| Applied state | Full card + "✓ Applied to Set 3" | Compact `✓ Applied to this set` badge |

The full card is replaced by a small `bg-volt/10` inline badge when `isApplied`. No Apply button persists.

### 6. New Per-Set Recommendations

Each logged set calls `algNextSetAdjustment` independently. `persistedAppliedRec` matches by `action.setId === lastNonSkippedSet.id`, so Set 2's applied recommendation does not block Set 3 from showing Set 2's new recommendation.

### 7. NumberField — Spinner + Clamping

**Problem:** NumberField only called parent `onChange` on `onBlur`, so browser spinner arrows (↑/↓) changed the local display but never committed the new value to app state.

**Fix:** Added `max?: number` prop. `onChange` handler now calls `onChange(parsed)` immediately for every valid change event (spinner arrows, keyboard, paste). `onBlur` clamps to `[min ?? value, max ?? value]` and commits the final clamped value.

Days/week field: `<NumberField ... min={1} max={7} />`.

### Files Modified (V2 Final Gating Hotfix)

| File | Changes |
|------|---------|
| `src/App.tsx` | `useRef` added to React imports; `isWeekDraft`, `isWorkoutDayPlanned`, `isWeekPlanned` helpers; `TodayScreen` weekLocked lifted + full card hidden; `WeekEditor` snapshot ref + `discardDraft` + renamed buttons; LiveLogger suggestion `isOnSuggestionTarget` gate + rephrased wording + compact applied state; `NumberField` `max` prop + immediate onChange + blur clamping; Days/week `min={1} max={7}` |

---

## V2 Final Bugfix — Completed Work

### 1. Requirement Counting Fix — One Exercise, One Slot

**Problem:** `countFulfilled` used legacy muscle matching with parent-child hierarchy, causing a `lats` exercise to count for both a `"lats"` requirement AND a `"back"` requirement simultaneously. Result: display showed 3/1 or 2/1 for a fully-filled slot.

**Fix:** New explicit-first logic with a strict legacy fallback:
```typescript
function countFulfilled(exercises, req): number {
  const explicit = exercises.filter((p) => p.fulfillsRequirementId === req.id && !p.isExtra).length;
  if (explicit > 0) return explicit;
  // Legacy fallback ONLY if NO exercise in the day has any fulfillsRequirementId set
  const anyTagged = exercises.some((p) => !!p.fulfillsRequirementId && !p.isExtra);
  if (anyTagged) return 0;
  // ... untagged muscle-matching path
}
```

`reqProgress` caps each count at `req.requiredExerciseCount` to prevent overcounting display.

### 2. Choose For Me Tags `fulfillsRequirementId`

**Problem:** `chooseForMe()` never set `fulfillsRequirementId` on the exercises it picked. All generated exercises were untagged, falling into the legacy muscle-matching path — which caused double-counting.

**Fix:** `chooseForMe()` now builds a `{ exercise, reqId }` pair list and tags `planned.fulfillsRequirementId = item.reqId` for every exercise it picks.

### 3. Add Extra Anyway Modal

**Problem:** No way to add a 4th exercise when a requirement cap was 3. The UI silently blocked adding more.

**Fix:**
- New `isExtra?: boolean` field on `PlannedExercise` (domain.ts).
- New `pendingExtraExercise: Exercise | null` state in `WorkoutDayEditor`.
- When `addExercise` detects `reqFull && !asExtra`, it calls `setPendingExtraExercise(exercise)` instead of proceeding.
- A confirmation modal appears: "Add Extra Anyway?" with the requirement name, current fill count, and a note that extras don't count toward slots.
- Extras get `isExtra = true`, `fulfillsRequirementId = undefined`.
- `countFulfilled` and `reqProgress` skip `isExtra` exercises so they never inflate the count.
- Extra exercises are displayed in the prescription list with an `extra` badge (grey pill) instead of a requirement badge.

### 4. New Active Block Archives In-Progress Sessions

**Problem:** Activating a new program from the Block Builder left any in-progress workout session alive. Today would still try to resume it, pointing at a block that was no longer active.

**Fix:** Inside `activateProgram`, before setting `program.status = "active"`:
```typescript
draft.sessions.forEach((session) => {
  if (session.userId === user.id && session.status === "in-progress") {
    session.status = "abandoned";
    session.updatedAt = nowIso();
  }
});
```

### 5. Coach Suggestion Applied to Correct Set

**Problem:** `applySuggestion` targeted `planned?.plannedSets[currentSetIndex]` — but this is the set currently being edited, which is the *same* set just logged, not the *next* one.

**Fix:** `logSet` tags the generated recommendation with `targetSetNumber = currentSetIndex + 2` (1-based next set):
```typescript
if (rec?.action) rec.action.targetSetNumber = currentSetIndex + 2;
```
`applySuggestion` uses `targetSetNumber` in the display label ("Apply 80kg to Set 3") and targets the `nextUnloggedPlanned` set for the `plannedWeight` write-through.

### 6. Recommendation Persists Across Navigation

**Problem:** `suggestionApplied` was React component state. Navigating away and back reset it to `false`, making the "Applied to next set" confirmation disappear.

**Fix:**
- `applySuggestion` now writes `rec.applied = true` to both `session.recommendations` and `db.recommendations` via `updateDb`.
- New derived value `persistedAppliedRec` reads from `liveSession.recommendations` on each render:
```typescript
const persistedAppliedRec = lastNonSkippedSet
  ? liveSession.recommendations.find((r) => r.action?.setId === lastNonSkippedSet.id && r.applied === true)
  : undefined;
```
- The apply button checks `suggestionApplied || !!persistedAppliedRec` for applied state.
- `applied?: boolean` and `targetSetNumber?: number` added to `Recommendation.action` in domain.ts.

### 7. Update Set Stale Mode Bug Fixed

**Problem:** After logging Set 1 normally, `currentSetIndex` advanced to 1. But `selectedSetIndex` (set to 0 when the user tapped Set 1's lineup item) was never cleared. On the next render, `selectedSetIndex (0) < currentSetIndex (1)` evaluated as true → `isEditingPastSet = true` → the form showed "Update Set" incorrectly.

**Fix:** `logSet` calls `setSelectedSetIndex(null)` on the normal logging path, clearing the edit-in-place state.

### 8. Today Screen Locked While Week Is Draft

**Problem:** The Week Editor could be open in one tab while the user tried to start a workout from Today in another. The planned week was mid-edit (incomplete exercises, placeholder sets).

**Fix:**
- New `isDraft?: boolean` field on `TrainingWeek` (domain.ts).
- `WeekEditor` mount `useEffect` sets `week.isDraft = true` in the DB.
- `WeekEditor.saveAndClose` sets `week.isDraft = false` before calling `onClose`.
- `TodayScreen` receives `editingWeekNumber?: number` prop (already threaded through App-level state).
- Lock logic:
```typescript
const weekBeingEdited = editingWeekNumber !== undefined && editingWeekNumber === currentWeekNumber;
const weekIsDraft = todayPlan?.week?.isDraft === true;
const weekLocked = weekBeingEdited || weekIsDraft;
```
- When locked: Start Workout button is disabled; a warning banner shows "Week N is being planned — finish planning before starting a workout"; a "Continue Planning Week N" button navigates to the Week tab.

### 9. Week Editor Day Selector Matches Draft Block Style

**Problem:** WeekEditor used pill tabs for day selection, but the Program tab's Weekly Overview (editable mode) used a 7-day calendar grid. The same WorkoutDayEditor was presented differently depending on which path opened it.

**Fix:** `WeeklyOverview` with `editable=true` now renders pill tabs (`Day N – SplitName` format) instead of the 7-day grid. The grid is only used in read-only mode.

### 10. Continuous Loop Week Copy — Tighter Mismatch Guard

**Problem:** `copyWeekExercises` only blocked copying when `sourceDay.splitDayId && targetDay.splitDayId && sourceDay.splitDayId !== targetDay.splitDayId`. This missed two failure cases:
- One day has `splitDayId` and the other doesn't (undefined vs. ID comparison was always false).
- Both days have no `splitDayId` but different `focus` labels (e.g., "Push" → "Pull").

**Fix:**
```typescript
// Block if split day identities differ
if (sourceDay.splitDayId !== targetDay.splitDayId) return;
// Block if one has a split assignment and the other doesn't
if (!!sourceDay.splitDayId !== !!targetDay.splitDayId) return;
// Block if focus labels differ
if (sourceDay.focus && targetDay.focus && sourceDay.focus !== targetDay.focus) return;
```
The pre-check in `WeekEditor`'s `useEffect` was updated to mirror the same guard conditions.

### Domain Changes (V2 Final Bugfix)

```typescript
// PlannedExercise
isExtra?: boolean;   // exercises added beyond requirement cap

// TrainingWeek
isDraft?: boolean;   // true while WeekEditor is open

// Recommendation.action
targetSetNumber?: number;  // which set (1-based) the rec targets
applied?: boolean;         // true once applySuggestion was called
```

### Files Modified (V2 Final Bugfix)

| File | Changes |
|------|---------|
| `src/types/domain.ts` | `PlannedExercise.isExtra`, `TrainingWeek.isDraft`, `Recommendation.action.targetSetNumber`, `Recommendation.applied` |
| `src/App.tsx` | `countFulfilled` explicit-first with anyTagged guard; `reqProgress` capped + `extraExercises`; `pendingExtraExercise` state + modal; `addExercise` full requirement guard + extra path; `chooseForMe` tags `fulfillsRequirementId`; `activateProgram` archives in-progress sessions; `logSet` tags `targetSetNumber` + calls `setSelectedSetIndex(null)`; `persistedAppliedRec` derivation; `applySuggestion` persists `applied=true` in DB; recommendation UI checks `persistedAppliedRec`; `TodayScreen` week-draft locking; `WeekEditor` `isDraft` tracking; `WeeklyOverview` editable pill tabs; `copyWeekExercises` tighter mismatch guard |
| `src/lib/algorithms/setAdjustment.ts` | Rewritten: setFeel 1–5 matrix with correct Easy/5 never-decreases rule; RPE delta and missedReps combined correctly; `fatiguePerSet` computation; `enforceDirectionCheck` guard in `buildRec` |

---

## V2 Gym-Test Hotfix 2 Changes

**CSS / Layout:**
- `styles.css`: `overflow-x: hidden` → `overflow-x: clip` on `html, body, #root`. Fixes vertical scroll being blocked on some browsers.

**Today Screen:**
- "Edit Current Day" only shown when `selectedDay.exercises.length > 0` (week must be planned).
- No-block state: "Go Off Program" renamed → "Start Individual Workout".
- "Go Off Program" / "Start Individual Workout" now opens an **Off-Program Builder** instead of immediately creating a blank session. Builder: pick exercises, set targets (sets/reps/RPE), see last-logged weight, then Start. "Start Empty Session" still available.

**Logger:**
- Skip Set button opens a reason picker (chips: Fatigue, Pain, Poor form, Time, Other + skip without reason). Reason stored in set notes.
- Set lineup: all logged sets (including skipped) are now tappable. Tapping a skipped set pre-fills from the planned set targets.
- `setRating=5` can no longer trigger a load reduction. Guards added to `missedReps` and `formPoor` branches in `setAdjustment.ts`.

**Week Tab:**
- `planningWeekNumber` lifted to App-level `editingWeekNumber` state. Week Editor persists across tab navigation.
- Day tabs in Week Editor now use `Day N – SplitName` format (position-indexed, always unique).
- Each day card now has an "Edit" button (hidden for completed sessions) that opens an inline WorkoutDayEditor.

**Library:**
- Custom exercises (owned by user) now show a pencil Edit button. Clicking pre-fills the Custom Exercise form. "Add Exercise" becomes "Save Changes" while editing.

**Block Builder:**
- Removed the "Flow" info panel (Library > Block > Today). Not useful in practice.

---

## Tab Ownership (V2 Hotfix Final)

**Block tab (`programs` screen):**
- Owns block building, split selection, draft blocks, block activation, block history, program gap analysis.
- Does NOT show the active weekly overview when a block is already active. Active blocks show a compact summary card with a "View current week →" link to the Week tab.
- Weekly/day overview is only shown when a **draft** block is being reviewed or edited.

**Week tab (`week` screen):**
- Owns current week progress, per-day session summaries, completed workout review, and Week Review when the week is complete.
- Supports week history: a week selector shows all weeks in the active block; completed weeks remain accessible after advancing.
- Week Review shows when `isBlockWeekComplete` is true. It includes "Start Week N+1" and a "Plan Next Week" placeholder (coming soon).

**Analytics tab (`progress` screen):**
- Exercise analytics default to **Overall** mode (sorted by date, short date labels).
- **Current Block** mode filters to active block sessions, using `W{n}D{n}` labels to avoid duplicate W1 entries.
- e1RM chart titled "Estimated Progress" for non-barbell/non-strength exercises.
- Volume/tonnage is not shown in exercise analytics.

**Today / Logger:**
- Off-program exercise additions show a scope modal: "This session only" (active) or "Future planned workouts" (disabled, coming soon).
- Added exercises are marked `offProgram: true` on `LoggedExercise` and do not alter the active block plan.

---
- `src/App.tsx`
- `src/data/seedData.ts`
- `src/lib/db.ts`
- `src/lib/trainingMath.ts`
- `src/types/domain.ts`

```bash
npm run lint    # passes
npm run build   # passes — tsc -b && vite build, 1595 modules transformed
```

---

## V2 Gym-Test Hotfix — Completed Work

### Key Product Decisions

**Edit Current Day vs Go Off Program** (Today screen):
- "Edit Current Day" opens `WorkoutDayEditor` inline for the active planned day. Changes apply to that day/week only. Does not alter completed history.
- "Go Off Program" creates a free session (`offProgram: true`, no `workoutDayId`). User adds exercises via the logger's Add Exercise flow. Logged work saves to session/exercise history. Does not modify the active block or future weeks.

**Off-program sessions** are identified by `WorkoutSession.offProgram === true`. They have no `programId`, `blockId`, or `workoutDayId`. All `LoggedExercise` items in the session have `offProgram: true`.

**Skip last set auto-advance**: `skipSet()` now checks `isCurrentSetLastPlannedSet`. If the skipped set is the last planned set of the current exercise, it automatically navigates to the next exercise or finishes the workout. No extra click needed.

**Set lineup tappable on mobile**: Completed set items in the lineup have `cursor-pointer` and an `onClick` handler. Tapping pre-fills the Weight/Reps/RPE/rating form fields with that set's actual values for reference. The completed set remains in the log; this is a reference/copy feature, not a re-log.

**Prescription number inputs fixed**: `NumberField` now uses local string state. The input allows free typing (including backspace and clear). The parent `onChange` is only called on blur. RPE sanitization (`sanitizeRpe`) runs on the parent's blur callback. Preview text ("3 sets · 8 reps · RPE 7") stays in sync because it reads from the db-persisted value, which updates on blur.

**Recommendation "increase" label fix**: `setAdjustment.ts` compares `suggestedWeight` (after rounding to increment) to `loggedSet.actualWeight`. If they are equal and the title was "Small increase available" or "Consider a small increase", the title becomes "Maintain load" and no Apply button is shown.

**Continuous-loop week copy**: `copyWeekExercises()` skips any workout day where `sourceDay.splitDayId !== targetDay.splitDayId`. WeekEditor shows a banner when copying was skipped due to split day mismatch. Day tabs show the split day name from the split template.

**Exercise swap metadata**: `PlannedExercise` now has `originalExerciseId?`, `replacementExerciseId?`, `swappedAt?`, `swapScope?` fields in domain.ts. These are ready for future swap-tracking UI. No write path exists yet — tracked as TODO.

**Movement patterns hidden**: Custom exercise form hides movement patterns under an "Advanced Options" toggle. `SplitDayEditor` already did this; LibraryScreen now matches.

**Block name placeholder**: Block Builder name field shows `"e.g. Powerbuilding Block"` placeholder. Default is empty string — no pre-population.

**Mobile overflow protection**: `overflow-x: hidden; max-width: 100%` added to `html, body, #root` in `styles.css`. Specific element-level overflow issues require screenshots for targeted fixes.

### Files Modified (V2 Gym-Test Hotfix)

| File | Changes |
|------|---------|
| `src/types/domain.ts` | `WorkoutSession.offProgram?: boolean`; `PlannedExercise` swap metadata fields |
| `src/lib/algorithms/setAdjustment.ts` | Fix "increase" label when `suggestedWeight === actualWeight` after rounding |
| `src/App.tsx` | `TextField` placeholder prop; `NumberField` blur-commit pattern; `TodayScreen` Edit Current Day + Go Off Program; `LiveLogger` off-program empty session guard; `skipSet()` last-set auto-advance; set lineup tappable items; custom exercise Advanced Options for movement patterns; `copyWeekExercises()` split day compatibility; `WeekEditor` split day context + copy label |
| `src/styles.css` | Global overflow-x protection |
| `BUGS.md` | New bugs section for gym-test hotfix; mobile overflow noted as high-priority |
| `HANDOFF.md` | This section |

### Intentionally Deferred (V2 Gym-Test Hotfix)

- Exercise swap write path — data model ready, no UI for recording a swap yet.
- Off-program session display in archive/history — marked `offProgram: true` in db, history UI doesn't yet show the flag visually.
- Specific mobile overflow element fixes — need screenshots.
- Weight Estimator v2, cloud sync, algorithm overhaul — out of scope for this pass.

---

## Session History Summary

### Session 1 Iteration 2
- LocalStorage mirror backup added to db.ts
- `normalizeDatabase` fills newer fields and enforces one active program per user
- Split templates with per-user favorites
- Exercise library compact UI
- `buildPlannedExerciseFromExercise` centralized in programmingLogic.ts
- `PlannedSet` extended with `setNumber`, `repRange`, `targetRir`, `percentageOfTopSet`

### Session 2
- `SetRating` changed from string enum to `1 | 2 | 3 | 4 | 5`
- `normalizeDatabase` migrates old string ratings to numeric
- All string-based rating comparisons updated to numeric
- Live Logger rating buttons become 1–5 grid
- `exerciseComplete` and `allExercisesComplete` edge cases fixed
- `WeekProgressScreen` derives current week from block cursor
- e1RM chart X-axis falls back to block week number lookup
- `@humanfs/core` pinned to 0.19.1 to fix lint

### Session 1 Iteration 3
- Active block → Today workout → set-by-set logging flow stabilized
- `WorkoutSession` stores `updatedAt`, `weekNumber`, `currentExerciseIndex`, `currentSetIndex`
- In-progress sessions persist and resume
- Live Logger: set lineup, current set highlight, Next/Skip/Add Set, Finish Exercise/Workout, Abandon Workout
- Week Progress tab added
- Exercise Analytics: first e1RM line chart
- Program Gap Analysis: deduplication, rule conflict grouping
- Workout day exercise selection: step chips for target muscles

### V2 Iteration 1 (pre-this-session)
- V2 data model fields added: `fulfillsRequirementId` on `PlannedExercise`, `exerciseCategory`, `isSBDMainLift`, `systemicFatigue`, `localFatigue`, `repDropSensitivity`, `failureTolerance` on Exercise
- `SplitDayRequirement` interface added to domain
- `PARENT_MUSCLE_CHILDREN` and `exerciseFulfillsRequirement` added to App.tsx
- `muscleOptions` expanded to include `"lower-chest"`, `"adductors"`, `"abductors"`
- New `MuscleGroup` values: `"lower-chest"`, `"adductors"`, `"abductors"` (25 total)
- `sanitizeRpe`, `isBlockWeekComplete`, `generateWeekReview`, `WeekReview` interface added to trainingMath.ts
- 38 new exercises added to seedData.ts (full coverage: chest, back, shoulders, arms, legs, core)
- New exercises merge into existing user DBs via `normalizeDatabase` in db.ts

---

## V2 Iteration 2 — Completed Work

### 1. `countFulfilled` — One Exercise, One Requirement Slot

**File:** `src/App.tsx`, inside `WorkoutDayEditor`

**Old behavior:** Used muscle matching across `primaryMuscles` (and previously also `directVolumeMuscles`), so one broad exercise could count toward multiple requirements simultaneously.

**New behavior:** Uses `fulfillsRequirementId` as the primary signal.

```typescript
function countFulfilled(exercises: typeof day.exercises, req: SplitDayRequirement): number {
  const explicit = exercises.filter((p) => p.fulfillsRequirementId === req.id).length;
  const untagged = exercises.filter((p) => !p.fulfillsRequirementId);
  const legacyMatched = untagged.filter((p) => {
    const ex = db.exercises.find((e) => e.id === p.exerciseId);
    return ex && exerciseFulfillsRequirement(ex, req);
  }).length;
  return explicit + legacyMatched;
}
```

- Exercises with an explicit `fulfillsRequirementId` are counted only for the requirement they were tagged for.
- Exercises without `fulfillsRequirementId` (legacy data) fall back to muscle matching so old saved programs do not break.
- One exercise added through the guided chooser fills exactly one requirement slot.

### 2. `addExercise` — Tags Each Exercise With `fulfillsRequirementId`

**File:** `src/App.tsx`, inside `WorkoutDayEditor`

When an exercise is added through the guided requirement chooser, it is tagged with the currently active requirement's ID:

```typescript
function addExercise(exercise: Exercise) {
  if (alreadyAddedIds.includes(exercise.id)) return;
  const reqId = currentReq?.id;  // capture the active requirement
  updateDay((target) => {
    const planned = buildPlannedExerciseFromExercise({ db, user, program, day: target, exercise, order: target.exercises.length + 1 });
    planned.fulfillsRequirementId = reqId;  // tag with this requirement
    target.exercises.push(planned);
  });
  // advance to next unfulfilled requirement
}
```

If `currentReq` is undefined (e.g., "show all exercises" mode or no requirements defined), `reqId` is `undefined` and the exercise is treated as untagged (falls into the legacy muscle-matching path for counting).

### 3. `exerciseFulfillsRequirement` — `primaryMuscles` Only, Parent/Child Hierarchy

**File:** `src/App.tsx`, top-level (module scope)

Uses `primaryMuscles` only (not `directVolumeMuscles`). Parent muscles accept child matches; specific muscles require an exact match.

```typescript
const PARENT_MUSCLE_CHILDREN: Partial<Record<MuscleGroup, MuscleGroup[]>> = {
  "back": ["lats", "upper-back", "mid-back", "traps", "spinal-erectors"],
  "chest": ["upper-chest", "lower-chest"],
  "quads": ["quads"],
  "hamstrings": ["hamstrings"],
  "glutes": ["glutes"],
  "biceps": ["biceps"],
  "triceps": ["triceps"],
};

function exerciseFulfillsRequirement(exercise: Exercise, req: SplitDayRequirement): boolean {
  const primary = exercise.primaryMuscles;
  if (primary.includes(req.targetMuscle)) return true;
  if (isParentMuscle(req.targetMuscle)) {
    const children = PARENT_MUSCLE_CHILDREN[req.targetMuscle] ?? [];
    return primary.some((m) => children.includes(m));
  }
  return false;
}
```

**Key rules:**
- A `"back"` requirement accepts an exercise whose `primaryMuscles` includes any of: `lats`, `upper-back`, `mid-back`, `traps`, `spinal-erectors`.
- A `"lats"` requirement accepts only exercises with `"lats"` in `primaryMuscles` — not `"back"`, not `"upper-back"`.
- A `"chest"` requirement accepts `"upper-chest"` or `"lower-chest"`.
- A `"upper-chest"` requirement only accepts `"upper-chest"` exactly.

### 4. SplitDayEditor — Exercise Requirements UI

**File:** `src/App.tsx`, `SplitDayEditor` component

A new "Exercise requirements" section was added inside every split day card, between the movement patterns section and the notes field.

**Features:**
- **Add button** — creates a new `SplitDayRequirement` with the day's first muscle group as default (or `"chest"` if none), count = 1, auto-priority.
- **Muscle dropdown** — `<select>` populated from `muscleOptions` (all 25 `MuscleGroup` values).
- **Count input** — number input (min 1, max 6) for `requiredExerciseCount`.
- **Remove button** — removes the requirement and renumbers priorities.
- Empty state message shown when no requirements are defined.

Requirements are stored in `SplitDay.requirements: SplitDayRequirement[]`. Changes flow through `onChange` and are persisted to the split template immediately.

### 5. RPE 0.5 Increments

**File:** `src/App.tsx`

**`NumberField` updated** to accept an optional `step` prop:

```typescript
function NumberField({ label, value, step, onChange }: {
  label: string; value: number; step?: number; onChange: (value: number) => void
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field mt-2" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}
```

**Planned RPE field** in `WorkoutDayEditor` now uses `step={0.5}` and wraps its `onChange` in `sanitizeRpe()`:

```typescript
<NumberField label="RPE" step={0.5} value={planned.plannedSets[0]?.targetRpe || 7}
  onChange={(rpe) => updateDay((target) => {
    target.exercises.find((item) => item.id === planned.id)?.plannedSets.forEach((set) => {
      set.targetRpe = sanitizeRpe(rpe);
    });
  })} />
```

`sanitizeRpe(value)` is defined in `trainingMath.ts`: clamps to [6, 10] and rounds to nearest 0.5.

The actual RPE `BigInput` in the live logger already used `step="0.5"` before this iteration.

### 6. Tonnage Removed From UI

**Before:** WeekProgressScreen workout rows showed "Tonnage" as a metric. ProgressScreen "Weekly Review" panel showed "Tonnage".

**After:**

**WeekProgressScreen workout rows** (per completed session, per day) now show:
- Hard sets (actual non-skipped sets logged)
- Skipped (sets skipped)
- Avg RPE (average actual RPE of completed sets)
- Avg feel (average setRating / 5)
- Score (/100)

**ProgressScreen Weekly Review panel** now shows:
- Completed (workouts in last 7 days)
- Hard sets (non-warmup, non-skipped sets across recent completed sessions)
- Avg RPE (average actual RPE of those sets)

Hard sets and avg RPE for ProgressScreen are computed inline from the last 7 days of completed sessions:

```typescript
const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
const recentSessions = db.sessions.filter((s) => s.userId === user.id && s.status === "completed" && new Date(s.startedAt).getTime() >= sevenDaysAgo);
const weeklyHardSets = recentSessions.flatMap((s) => s.loggedExercises).flatMap((log) => log.sets.filter((set) => !set.skipped && set.kind !== "warmup"));
const weeklyAvgRpe = weeklyHardSets.length ? weeklyHardSets.reduce(...) / weeklyHardSets.filter((s) => s.actualRpe).length : 0;
```

`summarizeWeek()` still exists and returns `tonnage` — that function is used for `weekly.completedWorkouts` but the tonnage field is no longer rendered.

### 7. Week Review Panel

**File:** `src/App.tsx`, `WeekReviewPanel` component + call site in `WeekProgressScreen`

**When it appears:** At the bottom of the `WeekProgressScreen` workout list panel, when `isBlockWeekComplete(block, sessions)` returns `true` (all days in current week are either completed or skipped).

**What it shows:**
- Header: "Week N Complete!" with week N/totalWeeks
- Metrics grid: Completed (workouts), Skipped, Hard sets, Avg RPE
- Secondary grid: Avg feel (/5), Avg readiness (when available)
- Suggestions panel (from `generateWeekReview`): bullet-point suggestions with a note that nothing changes automatically
- "Start Week N+1" button — requires explicit user click

**What it does NOT do:**
- Does not auto-advance the block to the next week
- Does not auto-apply any load or rep changes
- Does not change any planned sets or program structure

Clicking "Start Week N+1" shows a confirmation message: "Head to Today to begin your next training day. The block will advance automatically when you start your first session of Week N+1." The block only advances when the user starts a new session through the Today flow.

### 8. Imports Added

**`src/App.tsx` trainingMath imports:**
```typescript
import {
  ...,
  sanitizeRpe,
  isBlockWeekComplete,
  generateWeekReview
} from "./lib/trainingMath";
```

**`src/App.tsx` type imports:**
```typescript
import type {
  ...,
  TrainingBlock,
  ...
} from "./types/domain";
```

---

## Data Model Changes (V2 Iterations 1+2)

### `MuscleGroup` (domain.ts)
Now 25 values:
```typescript
export type MuscleGroup =
  | "chest" | "upper-chest" | "lower-chest"
  | "back" | "lats" | "upper-back" | "mid-back" | "traps" | "spinal-erectors"
  | "quads" | "hamstrings" | "glutes" | "calves" | "adductors" | "abductors"
  | "biceps" | "triceps"
  | "front-delts" | "side-delts" | "rear-delts"
  | "abs" | "obliques" | "forearms"
  | "full-body" | "conditioning";
```

### `PlannedExercise` (domain.ts)
```typescript
fulfillsRequirementId?: ID;  // which SplitDayRequirement this exercise was added for
```

### `SplitDayRequirement` (domain.ts)
```typescript
export interface SplitDayRequirement {
  id: ID;
  targetMuscle: MuscleGroup;
  requiredExerciseCount: number;
  priority: number;
  notes?: string;
}
```

### `Exercise` (domain.ts) — V2 Iteration 1 additions
```typescript
exerciseCategory?: ExerciseCategoryLabel;  // "sbd" | "main_compound" | "secondary_compound" | "machine_compound" | "isolation" | "bodyweight" | "conditioning"
isSBDMainLift?: boolean;
systemicFatigue?: FatigueLevel;
localFatigue?: FatigueLevel;
repDropSensitivity?: FatigueLevel;
failureTolerance?: "low" | "moderate" | "high";
```

### `WeekReview` (trainingMath.ts)
```typescript
export interface WeekReview {
  weekNumber: number;
  totalWeeks: number;
  completedWorkouts: number;
  skippedWorkouts: number;
  plannedWorkouts: number;
  hardSetsCompleted: number;
  averageRpe: number;
  averageSetRating: number;
  averageReadiness: number | null;
  isAllDone: boolean;
  suggestions: string[];
}
```

All new fields are backward-compatible. `normalizeDatabase` in `db.ts` fills missing fields on load.

---

## Current App Flow

```
Login (PIN) → Today
                ├─ Active block scheduled workout → Live Logger → Finish → Week Progress
                └─ No active block → Programs

Programs → Block Builder → Activate → Today
Library  → Split Library → SplitDayEditor → (set muscles + requirements per day)
                         → Use split in Block Builder
Settings → Profile / Gym Manager
Progress → e1RM metrics, exercise history top sets, bodybuilding dashboard, program gaps, weekly review
Week     → WeekProgressScreen: current week workouts, per-day session summary, Week Review panel (when week complete)
```

---

## How Exercise Requirements Work

1. **Split day definition:** Each `SplitDay` has `requirements: SplitDayRequirement[]`. Each requirement specifies a `targetMuscle`, `requiredExerciseCount`, and `priority`.

2. **WorkoutDayEditor guided chooser:** When editing a workout day linked to a split day, the UI walks through requirements in priority order. The current active requirement is highlighted. The exercise picker filters to the requirement's `targetMuscle` (using `exerciseFulfillsRequirement`).

3. **Requirement matching:** `exerciseFulfillsRequirement` checks `primaryMuscles` only. Parent muscles (back, chest) accept child exercises. Specific muscles require exact match.

4. **Tagging:** When the user adds an exercise, `addExercise` captures `currentReq?.id` and sets `planned.fulfillsRequirementId = reqId` on the new `PlannedExercise`.

5. **Counting:** `countFulfilled(exercises, req)` counts exercises with `fulfillsRequirementId === req.id` as the primary path. Untagged exercises fall back to muscle matching (legacy compatibility).

6. **Advancement:** The UI automatically advances to the next unfulfilled requirement after each exercise is added.

7. **Override:** The user can toggle "Show all exercises" to bypass requirement filtering and add any exercise freely (these get `fulfillsRequirementId = undefined`).

---

## Files Changed in V2 Iteration 2

| File | Changes |
|------|---------|
| `src/App.tsx` | `countFulfilled` rewritten; `addExercise` tags with `fulfillsRequirementId`; `SplitDayEditor` requirements UI added; `NumberField` gets `step` prop; planned RPE uses `step={0.5}` + `sanitizeRpe`; tonnage removed from WeekProgressScreen and ProgressScreen; `WeekReviewPanel` component added; `WeekProgressScreen` calls `isBlockWeekComplete`; trainingMath imports expanded; `TrainingBlock` added to type imports |
| `src/lib/trainingMath.ts` | `sanitizeRpe`, `WeekReview` interface, `isBlockWeekComplete`, `generateWeekReview` added (V2 Iteration 1, used in V2 Iteration 2) |
| `src/types/domain.ts` | `"lower-chest"`, `"adductors"`, `"abductors"` added to `MuscleGroup`; `fulfillsRequirementId` added to `PlannedExercise`; V2 exercise classification fields added (V2 Iteration 1) |
| `src/data/seedData.ts` | 38 new exercises added; PPL split days updated with `requirements` arrays (V2 Iteration 1) |
| `src/lib/db.ts` | `builtInExercises` import added; exercise merge step in `normalizeDatabase` (V2 Iteration 1) |

---

## Intentionally Deferred

- Movement-pattern-based requirements (items 2b from V2 spec) — deferred, muscle-based only for now
- RPE sanitization on import (importer pipeline already exists but not wired to `sanitizeRpe`)
- Next-set recommendation display improvement (item 6) — the algorithm and panel already exist; UX polish deferred
- Five-week block position modeling (item 11) — `generateWeekReview` uses `weekNumber`/`totalWeeks` but suggestion text is generic; block-position-aware suggestions deferred
- Full public CSV importer
- Exercise variation grouping
- Gym-specific conversion learning improvements
- Normalized vs observed e1RM charting
- Advanced fatigue modeling
- Exercise-level feedback redesign
- Detailed set types (warmup / top / backdown / drop / AMRAP)
- True program generator overhaul
- PWA/Vercel deployment polish
- Cloud sync
- Automated test suite

---

## Known Bugs / TODOs

1. **Program page density** — Builder/Programs tab still stacks block builder, weekly overview, day editor, gap analysis, and previous blocks. Needs a UX separation pass.

2. **`@humanfs/core` ESLint pin** — `@humanfs/core@0.19.2` has a broken publish. Pinned to 0.19.1 with `npm install @humanfs/core@0.19.1 --no-save`. If `npm install` upgrades it, re-run the pin.

3. **Split requirements not auto-generated for new splits** — New split days created in the UI start with no requirements. The user must add them manually. The `normalizeDatabase` migration generates requirements from `muscleGroups` for existing split days that lack them, but newly created splits do not auto-populate.

4. **`fulfillsRequirementId` not retroactively set on existing exercises** — Exercises added before this iteration have no `fulfillsRequirementId`. They fall back to muscle matching for `countFulfilled`. If a day has mixed tagged/untagged exercises, the count can be imprecise.

5. **Program generation does not yet use requirements** — `programGenerator.ts` selects exercises based on split day `muscleGroups` and `targetMuscles`, not `requirements`. Requirements are only used in the WorkoutDayEditor manual chooser. Wiring the generator to respect requirements is a future task.

6. **`generateWeekReview` suggestions are generic** — Suggestions are based on averageRpe, averageSetRating, and block position but do not yet recommend specific load/rep changes per exercise.

7. **No automated tests** — No unit tests for `programGenerator`, `programAnalysis`, `trainingMath`, or `db` normalization.

8. **`summarizeWeek` still returns `tonnage`** — The field exists in the return type but is no longer rendered anywhere in the UI. It can be removed in a future cleanup pass if no other code depends on it.

---

## Recommended Next Iteration (V2 Iteration 3)

**Focus: Weight Estimator v1 + Exercise Library Depth**

### Priorities

1. **Expand exercise library seed data** using the improved muscle hierarchy. Each exercise should have accurate `primaryMuscles`, `secondaryMuscles`, `category`, `equipment`, `defaultIncrement`, `fatigueRating`, and all V2 classification fields.

2. **Improve muscle hierarchy** across the full body — confirm all 25 `MuscleGroup` values are well-represented in the library.

3. **Build Weight Estimator v1:**
   - Estimate baseline e1RM from recent history for the exercise
   - Recommend planned weight from target reps and RPE
   - Apply block/week position modifiers (week 1 = conservative, week 3-4 = peak)
   - Apply readiness modifiers conservatively (do not over-discount)
   - Round to exercise `defaultIncrement`
   - Return confidence level and plain-English reason
   - Wire into `WorkoutDayEditor` planned weight suggestion

4. **Wire `setRating`/actual RPE into next-set recommendations more visibly** — make the coach suggestion panel always visible after any set is logged (not just when the algorithm returns a non-hold recommendation).

5. **Improve Week Review suggestions** — make them specific enough to suggest next-week load, rep, or set-count changes per exercise without auto-applying them. User approval required before any change lands.

6. **Keep manual-first** — all suggestions are displayed, not auto-applied.

---

## Architecture Reference

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app shell, all screens and UI components (~3600+ lines) |
| `src/types/domain.ts` | Core TypeScript domain model |
| `src/lib/db.ts` | IndexedDB load/save/reset/replace + migration normalization |
| `src/lib/trainingMath.ts` | e1RM, RPE chart, readiness scoring, weight suggestions, set adjustment suggestions, gym conversion learning, volume/session summaries, Week Review |
| `src/lib/programGenerator.ts` | Split parsing, structured program/block/week/day generation |
| `src/lib/programAnalysis.ts` | Program gap analysis, bodybuilding dashboard data |
| `src/lib/programmingLogic.ts` | `buildPlannedExerciseFromExercise`, `defaultCompoundSettings`, starter prescription |
| `src/lib/algorithms/` | `setAdjustment.ts`, `loadPrescription.ts`, `e1rm.ts`, `readiness.ts`, `trainingRules.ts` |
| `src/lib/blockProgression.ts` | `syncActiveBlockProgress` — keeps block cursor in sync with sessions |
| `src/data/seedData.ts` | Built-in exercises (60+), split templates, seed users, seed gyms |
| `src/hooks/useTrainingDb.ts` | React hook around local database load/update/import/reset |
| `src/main.tsx` | React entry, service worker registration/unregistration |

---

## Commands

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
npm run lint
npm run build
```

If `@humanfs/core` breaks lint after a fresh install:
```bash
npm install @humanfs/core@0.19.1 --no-save
```

## Latest Session Notes

- Analytics unit normalization fixed for exercise progress views.
- `LoggedSet` now stores `unit`, and import paths preserve the original `lb`/`kg` unit on imported history rows.
- Exercise analytics now choose display units by exercise first (`exercise.defaultUnit` when weight-based), then user unit fallback.
- Most recent set, best e1RM, recent history, and chart points are converted into the selected display unit before rendering.
- Workout history export now preserves per-set unit when available instead of always falling back to the exercise default.
- `normalizeDatabase()` backfills missing historical set units from the exercise default or user unit for older local data.
