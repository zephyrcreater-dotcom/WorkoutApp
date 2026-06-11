# HANDOFF.md

## Current Handoff — Tab Navigation Workspace Restoration (Session 71)

- Top-level tab navigation must restore the last workspace inside each tab instead of resetting to the tab's default screen. Today has its own `todayWorkspaceMode` state, separate from `activeTab`/`screen`, so returning to Today can restore off-program builder, programmed logger, off-program logger, plan wall, review, or scheduled overview. Clicking Today should not reset to default unless the saved workspace is invalid or the user explicitly chooses Current Day/Back to Today.
- Root cause: `offProgramBuilder` state was local to `TodayScreen`, which unmounts every time the user switches tabs (conditional rendering via `{screen === "today" && <TodayScreen />}`). On remount, the lazy `useState` initializer tried to restore from localStorage, but this failed when exercises hadn't been flushed to storage yet (async `useEffect` timing) or when the builder was active with 0 exercises.
- Fix: `offProgramBuilder` state (`OffProgramBuilderState`) is now owned by `App`, not `TodayScreen`. `App` never unmounts during a session, so the builder state survives all tab switches without any localStorage round-trips.
- `TodayScreen` receives `offProgramBuilder` and `setOffProgramBuilder` as props (React.Dispatch). All existing setter calls inside `TodayScreen` work unchanged.
- `goOffProgram()` now just sets `active: true` on the existing App-level state (preserving any existing exercises) instead of re-loading from localStorage.
- localStorage persistence for builder draft still runs in `App` via `useEffect` and is used only for page-refresh restoration (boot hydration).
- `OffProgramExerciseDraft` type is now declared at module scope (as an alias for `PersistedOffProgramBuilderItem`). `OffProgramBuilderState = { active: boolean; exercises: OffProgramExerciseDraft[] }` is also module-scope.

## Current Handoff — Per-Tab Workspace Persistence Architecture (Session 70)

- App navigation must persist per-tab workspace state. Today can restore: scheduled overview, programmed live workout, off-program builder draft, off-program active workout, or review — depending on the explicit last `todayWorkspaceMode`. Off-program builder drafts are not active workout sessions and must not auto-open as live workouts unless Start Workout was pressed. Refresh and tab navigation restore the last valid workspace; stale/missing/completed/abandoned drafts fall back safely.
- `TodayWorkspaceMode = "scheduled-overview" | "programmed-workout" | "off-program-builder" | "off-program-workout"` is now persisted in `AppUiSnapshot` and tracked in `App` state.
- Boot hydration only restores the logger if `todayWorkspaceMode` is `"programmed-workout"` or `"off-program-workout"`. Legacy snapshots without the field skip off-program session restoration to avoid surfacing stale sessions for users upgrading.
- Off-program builder draft (selected exercises + sets/reps/RPE) is now persisted to localStorage under `iron_orbit_off_program_builder_draft_{userId}`. It is saved whenever the builder is active and restored when `goOffProgram()` is called or `TodayScreen` mounts with `todayWorkspaceMode === "off-program-builder"`.
- `openLoggerSession()` and `resumeWorkoutSession()` both set `todayWorkspaceMode` based on `session.offProgram`. `navigateToScreen("today")` only routes to the logger if `todayWorkspaceMode` explicitly indicates an active logger session.
- `goOffProgram()` sets workspace mode to `"off-program-builder"`. Cancel resets it to `"scheduled-overview"`. Starting a workout is handled by `openLoggerSession` setting `"off-program-workout"`.

## Current Handoff — Off-Program Draft Routing + Unit Fix (Session 69)

- Off-program builder drafts and active workout sessions must be separate states. A builder draft should persist but must not auto-open as an active workout when navigating Settings → Today; only a started active session should restore into the logger. Off-program starting weight/history units must resolve from logged history unit, exercise loading profile, machine stack, user default, then lb fallback, and must not relabel lb values as kg.
- `navigateToScreen("today")` now only auto-routes to the logger for off-program sessions if `activeSessionId` is explicitly set (meaning the user was actively in the logger this browser session). Stale off-program sessions from a previous visit do not hijack Today navigation. Regular (non-off-program) planned block sessions still always restore as before.
- Off-program builder "Last logged" display now uses `lastLog.unit` (the unit stored in the performance log) instead of `user.unit`. "Starting weight" display now uses `getExerciseDisplayUnit(ex, user)` which resolves: exercise defaultUnit → user.unit → lb fallback. This ensures Cable Triceps Kickback and similar exercises show lb when their history/profile is lb.

## Current Handoff — Logger Action Button State Machine (Session 68)

- Logger primary action button is now state-machine driven. Current/pending sets show Next Set, final set of a non-final exercise shows Finish Exercise, final set of the final exercise shows Finish Workout, and only editing an already completed set shows Save Changes. All finish/advance actions save the active dirty set first via the existing `finishExercise()` save-first guard.
- Changing values on the current pending set must NOT switch the primary button to Save Set. It is still a current/pending set, so the button remains Next Set (or Finish Exercise/Finish Workout if it is the final set). Only clicking into an already-completed set triggers Save Changes.
- `derivedPrimaryAction` type is now `"save-changes" | "next-set" | "finish-exercise" | "finish-workout"`. The old `"save-set"` branch is removed.

## Current Handoff — Today Shell Stability + Logger Immediate Draft Persistence (Session 67)

- App shell/sidebar layout must be stable across tabs; Today should not use a wrapper that shifts the sidebar/menu.
- Today/Logger editor values must write to active workout session draft immediately, not only on Save Set.
- Tab navigation must restore the same active workout/session, exercise, set, readiness check-in, and typed weight/reps/RPE/feel/note values.
- Plan defaults initialize once; dirty/session draft values win afterward.

## Current Handoff — Block Builder Initialization Loop Guard (Session 66)

- Block Builder initialization must avoid render/effect loops. Template selection and draft hydration should populate split/day/requirements once per explicit action. Suggested block names should be derived placeholders, not repeatedly written into state. Requirement auto-selection should be guarded so it does not reopen/reset the picker every render.

## Current Handoff — Today/Logger Active Session Draft Persistence (Session 65)

- Today/Logger must preserve an active workout session across tab navigation. Entered check-in values, active exercise/set, typed weight/reps/RPE, difficulty, notes, added/skipped/deleted sets, and added/removed exercises should persist immediately in a session draft. Returning to Today should restore the active session, not rebuild from the plan. Plan/library defaults initialize only once and must not overwrite dirty/started session state.
- Logger exercise/set selection and unsaved set-editor values now need a durable draft layer separate from the planned workout definition. The active session still owns logged exercises/sets in the database, while in-progress UI state such as selected set, dirty typed inputs, and unsaved readiness form values is restored from the active session draft on logger re-entry.
- Navigating to Analytics, Settings, Library, Week, or Block while a workout is in progress must not destroy the logger context. Returning to `Today` should reopen the live logger for that same session instead of dropping back to the Today dashboard or regenerating the workout from the block plan.

## Current Handoff — Active Workout State Isolation From Library Edits (Session 64)

- Active Today/Logger workout session state must be isolated from Library/default exercise edits. Library/settings changes update future defaults and metadata, but must not silently overwrite active workout progress, logged sets, active set values, skipped/deleted/added sets, or unsaved workout edits. If a workout has started or is dirty, rehydration from plan/library/Supabase must not replace the local session state.
- Started Today workouts now need a session-owned `plannedExerciseSnapshot` per logged exercise. Logger resume, set targeting, and planned-set lookup must prefer that snapshot over live program/template definitions.
- Library/loading-profile edits may still update live display metadata such as exercise name or muscle tags through the shared exercise library, but planned set targets, actual logged sets, and active draft values must continue to come from the session snapshot/local session state unless the user explicitly applies new defaults later.

## Current Handoff — Shared Exercise Source + Workflow-Preserving Picker + Logger Remove (Session 63)

- All exercise pickers must use the shared Library source so default/custom/variation exercises appear consistently. Creating exercises or variations from inside Today/Logger/Week/Block workflows must preserve unsaved local edits and return to the same picker context. Mobile picker inputs must avoid iOS zoom with 16px+ font sizes and keyboard-safe scrolling. Machine/cable loading profile UI should show one clear increment path, not both default and custom inputs. Today/Logger workout edit mode needs a remove exercise action that removes only from the workout, not the Library.
- `ExercisePicker`, requirement autofill candidate generation, and Library list/search now need to stay on the same shared exercise-source helper. Search must cover ids, parent names, variation metadata, default exercises, custom exercises, and visible variations from one merged source before per-picker filters are applied.
- Creating from inside a picker should stay in the picker. The current fix path is an inline picker-side create flow for both new exercises and variations, so Week/Block requirement state, Today inline day edits, and Logger session edits are preserved without routing to Library.
- Logger exercise removal is session-only. Removing an exercise must never delete it from Library, must preserve the rest of the session, and must move the active logger selection predictably: previous exercise if available, otherwise next, otherwise the no-exercises state.

## What This App Is

Iron Orbit Training is a local-first PWA for workout programming and tracking across powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health. It is meant to replace an Excel workout tracking system and eventually become an adaptive training coach.

## Current Handoff — Manual Requirement Slot Assignment Wins (Session 62)

- Manual requirement-slot selection must respect the selected target slot. If the user is filling Chest and manually selects an incline/upper-chest exercise, it should fill Chest because that was the target slot. Auto-fill uses smart specificity; manual selection uses explicit target-slot assignment. Requirement counting should honor explicit `fulfillsRequirementId`/assigned slot before inferred muscle allocation.
- Requirement counting order is now: explicit assigned slot first, then explicit auto-fill assignment when present, then inferred specificity allocation for unassigned exercises.
- Broad `Add Exercise` flows that are not opened for a specific requirement slot should stay unassigned and continue using normal inferred allocation after add.

## Current Handoff — Upper Chest Autofill Candidate Source Sync (Session 61)

- Upper Chest autofill had a targeted failure where picker results showed valid upper-chest exercises but Auto-fill found none. Picker-visible candidates and autofill candidates must come from the same source/filter logic; parent Chest fullness must not exclude child Upper Chest candidates.
- Requirement autofill should start from the same requirement-visible picker candidate set, then exclude only exact duplicates already selected on the day before ranking the remaining matches.
- The `No new matching exercises found` warning came from the `chooseForMe()` path when no candidate survived into the `selected` array. Duplicate-only exhaustion should produce a clearer reason than the generic no-match message.
- Default exercise metadata should treat `Incline Dumbbell Press` as upper-chest biased (`upper-chest` + `chest`). Built-in metadata refreshes may correct existing default-library copies, but custom/user-modified exercises must not be overwritten.

## Current Handoff — Block Builder Setup UI Cleanup (Session 59)

- Block Builder dropdowns should show only one chevron. Start Week should not be part of the primary new-block setup; default to Week 1 or move it under advanced schedule settings. Any gray/secondary builder control that looks clickable must either work or be visibly disabled.
- Template and goal selects in the Block Builder should use one consistent custom-select treatment so native browser arrows do not stack with a manual chevron.
- Planning Rules and Progression/Fatigue rows should read as intentional toggles with clear expand/collapse affordances, and disabled secondary actions like `Deploy Block` should look unavailable instead of broken.
- Block Builder initialization must avoid render/effect loops. Template selection and draft hydration should populate split/day/requirements once per explicit action. Suggested block names should be derived placeholders, not repeatedly written into state. Requirement auto-selection should be guarded so it does not reopen/reset the picker every render.

## Current Handoff — Custom Exercise Requirement Counting Canonicalization (Session 60)

- Custom exercises and variations must count toward Week/Block requirements the same as default exercises.
- Requirement counting should use a shared `getExerciseMuscleKeys` helper that reads all relevant custom/default exercise muscle fields, normalizes to canonical keys, and falls back to library/parent lookup when planned exercise instances are missing muscle data.
- When exercises match both parent and child requirements, allocation must assign them to the most specific unmet requirement first. For example, upper-chest + chest exercises fill Upper Chest before generic Chest. Filtering by muscle and assigning requirement slots are separate steps.

## Current Handoff — Requirement Autofill Specificity + Unified Status (Session 58)

- Requirement autofill must allocate specific muscle requirements before generic parent requirements. If Upper Chest exists as a requirement, upper-chest exercises should fill that slot before generic Chest slots.
- Requirement chips, warning text, and completion states must use the same computed requirement status and never contradict each other.
- Generic parent requirements should prefer general parent matches first, then fall back to child-biased matches only after the specific child requirements are satisfied.
- Explicit/manual requirement assignments must be preserved; auto-fill only fills remaining open slots.
- Requirement matching must use canonical muscle keys. Display labels like `Upper Chest` must normalize to the same key as requirements like `upper-chest`. Specific requirements get first claim before generic parent requirements. Requirement chips, warnings, and completion messages must all use one computed requirement status.
- Requirement counting must use the same canonical muscle source as exercise display/library rows. Use a helper to collect and normalize all muscle fields from an exercise. Specific requirements like upper-chest, side-delts, rear-delts, mid-back, and upper-back must be counted before generic parent muscles.

## Current Handoff — Universal Workout Prescription + Ordering Pass (Session 57)

- Workout prescription logic should apply across all workouts and muscles. Prescriptions must be role-aware using day type, block type, movement pattern, muscle, equipment, fatigue, and week number. Machine quad compounds like hack squat/leg press/belt squat should be treated as hypertrophy-friendly main quad movements, not heavy hinges. Exercise ordering should place main compounds first, secondary compounds next, and accessories after, while preserving manual user order and manual prescription edits.

## Current Handoff — Week Planning Role-Aware Prescriptions (Session 55)

- Week planning exercise prescriptions should be role-aware. Sets/reps/RPE must vary by movement role, fatigue, muscle group, equipment, and week number. Week 2 hypertrophy should progress slightly from Week 1 without increasing everything at once. Compounds should be moderate volume/effort; isolations can use higher reps/RPE; heavy hinges should stay conservative. Manual user edits must not be overwritten.

## Current Handoff — Block Builder Template-First Manual Fill Flow (Session 52)

- Block Builder flow should be template-first but manual-fill friendly. Selecting a template should populate weekly split, day names/focus, and muscle requirement slots without auto-filling all exercises. The user should then fill requirements manually through the inline picker or use Choose for me contextually. Top-level builder actions should be Save Draft and Deploy/Save Block, not Generate Weeks. New Block should start a clean draft; Resume Draft should resume existing draft.

## Current Handoff — Blocks Home Template Launchpad + Recommendations (Session 53)

- Blocks home templates should explain what they do: split preview, days/week, goal/focus, suitability, and good-for copy. Add a rule-based Recommended for you section, especially recommending Powerbuilding 4-Day when SBD/powerbuilding history exists. Use Template should populate split/day/requirements but not autofill exercises. Custom Block starts blank.

## Current Handoff — Requirement Picker Sync Fix (Session 54)

- Week/Block requirement-fill picker must derive its effective muscle filter from the selected requirement. After adding an exercise, recompute requirement counts and auto-advance to the next missing requirement. Picker title, active chip, filter, and results must always stay in sync.
- Requirement-fill picker should derive its effective muscle filter from the selected requirement, but the manual Add Exercise picker must keep editable filters. Do not show disabled dropdowns as if they are interactive. In requirement mode, either show a scoped chip or provide Change filter that switches to manual mode.
- Requirement-scoped exercise pickers should start filtered to the selected requirement but allow manual muscle filter override. The selected requirement remains the target slot unless changed; manual override only changes search results. After adding, clear override and auto-advance to the next missing requirement.

The app uses a local-first training database with an explicit local-only mode and an optional Supabase account mode. It works well on iPhone Safari, is installable as a PWA, and is now wired for cloud snapshot sync.

---

## Current Handoff — Logger Set/Action Loop Diagnostic Rule (Session 51)

- Logger set/action bugs must be diagnosed by tracing state mutations before patching.
- Logger actual sets are source of truth during a session; planned sets are recommendations only.
- No effect/render path may regenerate set IDs or rebuild actual sets after user edits/adds/deletes.
- Active set/exercise changes should come from explicit user actions, not repeated hydration effects.
- Logger set mutations must be atomic optimistic updates. Save/Skip/Delete/+Set/Next should compute one next workout state, update local UI immediately, persist that exact state, and block/defer stale Supabase/localStorage hydration from overwriting pending local changes. Next Set must commit the active set before advancing.

---

## Current Handoff — Logger Set Edit + Finish Exercise Save Fix (Session 47)

- Logger Finish Exercise must save the active dirty/valid set before finishing or advancing. Edit Set actions must load and update only the exact selected set by id/index, never by status.

### What changed

- Logger set-row targeting now resolves through the exact lineup item (actual set id, planned set id/index, or lineup key fallback) before loading edit/select state.
- Set action-sheet "Edit Set / Jump to Set" now uses the same exact lineup targeting path as direct set-row taps.
- Set action-sheet "Skip Set" now targets the exact selected set's planned index instead of relying on whichever set was currently active.
- Finish Exercise now has an additional dirty-draft guard for selected pending sets so valid unsaved values are saved first, then finish/advance behavior runs.

### Validation

- `npm run build` ✓

### Files changed

- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Logger Primary Action Determinism Fix (Session 49)

- Logger primary action must be deterministic: dirty set = Save Set, non-dirty with next set = Next Set, non-dirty last set = Finish Exercise. Dirty state should only change from user edits, not hydration/default comparison. Last-set detection must use actual current exercise set array including added sets. Exercise/set IDs must be stable and not regenerated during render.

### What changed

- Replaced mixed planned-coverage/button-state branching with one deterministic derived logger primary action.
- Primary action now derives from stable state only: editing mode, user-dirty+valid draft, and active set position within the current exercise lineup (including added sets).
- Removed past-last planned override text that could force misleading labels.
- Kept save-first finish behavior in place for dirty+valid active sets via existing finish/save handlers.

### Validation

- `npm run build` ✓

### Files changed

- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Logger Set State Stability Fix (Session 50)

- Logger set state must be stable: set IDs are generated once, never during render; actual logged sets must not be rebuilt from planned sets after user edits; + Set appends exactly one stable set; Delete Set removes exactly one selected set; Next Set advances through actual sets only; button labels derive from actual set count and dirty state.

### What changed

- Added explicit focused-set state for actual logged sets so save/add/delete/next actions do not fall back to recalculating the current row from planned coverage after every render.
- `+ Set` now moves focus to the newly appended pending set instead of leaving selection in a stale derived state.
- `Next Set` now advances focus through the existing lineup once instead of reusing the save path.
- `Delete Set` now removes only the selected row and moves focus predictably; deleting a normal logged planned set no longer hides the underlying planned row.

### Validation

- `npm run build` ✓

### Files changed

- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Reopened Workout Custom Exercise Logger Action Fix (Session 48)

- Custom/off-program exercises added to completed or reopened workouts must be normalized into the same workout-exercise runtime shape as planned exercises. They must support + Set, Edit Set, Save Set, and Finish Exercise. Logger actions must target exact exercise instance and set id/index, never planned-only data or status-only matching.

### What changed

- Added runtime planned-set normalization for logger exercises that do not resolve to a program planned exercise, ensuring stable planned set ids/set numbers/targets exist.
- Updated logger `+ Set` flow to support off-program/custom exercises by appending to `offProgramPlannedSets` when no program planned exercise instance exists.
- Updated exercise context menu `Add Set` to target the exact exercise instance id rather than relying on whichever exercise was active in closure state.
- Kept Finish Exercise save-first behavior and exact set targeting so added custom exercises can save/finish consistently.

### Validation

- `npm run build` ✓

### Files changed

- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Exercise Picker Library Sync Bug Fix (Session 46)

### What changed

- **Root cause found and fixed**: `ExercisePicker` had a filter gate on line 6843 (pre-edit):
  ```js
  (!grouped || query || muscle !== "all" || pattern !== "all" || targetPatternMatch)
  ```
  When `grouped=true`, no user-applied filters, and `targetMuscles=[]` (e.g. "Add Exercise" after all requirements are already met), this collapsed to just `targetPatternMatch` — meaning only exercises whose `movementPattern` matched the day's patterns (e.g. `["vertical-pull","triceps-isolation"]`) made it into `allMatches`. The flat list therefore showed only 6–10 exercises (those matching the day's movement patterns) instead of the full library.

- **Fix**: Added `!targetMuscles.length ||` to that condition:
  ```js
  (!grouped || !targetMuscles.length || query || muscle !== "all" || pattern !== "all" || targetPatternMatch)
  ```
  Now, when `targetMuscles=[]` (no requirement sections to organize), the movement-pattern gate is skipped and the full exercise library is eligible. The pattern filter still applies when `targetMuscles` is non-empty (requirement-slot filling mode) so the organized grouped sections continue to work correctly.

- **Result limit increased**:
  - Grouped + no target muscles (full-library flat browse in a scrollable sheet): `allMatches.length` — all exercises visible, no artificial cap.
  - Grouped + target muscles (requirement slot picker, sections shown): 36-item flat fallback (unchanged behavior, mostly superseded by grouped sections).
  - Default non-grouped (inline embed): 50 (up from 12).

**Invariants to preserve:**
- All Add Exercise pickers must use the same shared exercise library source as the Library page. Custom exercises and variations must appear everywhere: Today/Edit Workout, Week/Edit Workout, Logger, Block Builder, Week Planner, and inline requirement pickers.
- Picker-specific filters should apply after merging default/custom library data.
- Creating an exercise/variation from inside a picker must preserve workflow state and return to the same picker.
- Muscle groups stay expanded during multi-select.
- Mobile inputs must use 16px+ font size and keyboard-safe layouts.
- Movement-pattern gate only applies in grouped mode when `targetMuscles` is non-empty (i.e., when requirement-organized sections will be rendered).

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Exercise Picker/Library Sync + Mobile Input Fixes (Session 45)

### What changed

- **Shared exercise source**: `ExercisePicker` now filters out archived (`isArchived`) exercises from both `allMatches` and `muscleOnlyPool`, so hidden exercises no longer appear in pickers. The `muscleOnlyPool` for grouped sections also correctly applies the owner/user filter. All pickers receive `db.exercises` from the same global state, so custom exercises created anywhere immediately appear in all pickers.
- **Inline create exercise in any picker**: `ExercisePicker` now accepts an optional `updateDb` prop. When provided, a "Create new exercise" button appears at the bottom of every picker. Tapping it opens a compact inline form (name, primary muscle, equipment) without navigating away from the current workflow. On save, the exercise is added to the database and immediately picked/selected in place. All picker instances (TodayScreen off-program, Today inline add, LiveLogger ×2, WorkoutDayEditor inline req + add sheet + swap ×2, TemplateEditor) now pass `updateDb`.
- **Muscle group picker stays expanded on selection**: `LibraryMusclePicker`'s `useEffect` that sets `expandedGroupId` no longer lists `selected` as a dependency — it only fires when the picker opens. Selecting/deselecting muscles within a group no longer collapses the group.
- **Mobile input zoom prevention**: Added `@media (pointer: coarse) { input, select, textarea { font-size: 16px; } }` globally in `styles.css` so iOS Safari never auto-zooms on focus. ExercisePicker's quick-create form inputs also carry `style={{ fontSize: "16px" }}` as a belt-and-suspenders.
- **Mobile picker layout (dvh)**: `.apollo-picker-panel` now uses `height: 100dvh` / `max-height: 100dvh` on mobile and `min(90dvh, 56rem)` on `sm:` breakpoint, replacing the old `90vh` that didn't track keyboard shrinkage.
- **Add exercise modals use `max-h-[85dvh]`**: Logger/Today add-exercise overlay sections changed from `max-h-[85vh]` to `max-h-[85dvh]`.
- **Library mobile inspector safe-area**: The sticky bottom button bar in the exercise inspector uses `pt-3 safe-bottom` instead of `py-3` so the iOS home indicator never covers Save/Cancel buttons.
- **Library header wraps on small screens**: `flex flex-wrap` + `min-w-0` on the label area + `shrink-0` on the "Add Exercise" button prevents the header from overflowing on narrow viewports.

**Invariants to preserve:**
- Exercise pickers across Library, Today/Edit Workout, Logger, Week planner, and Block Builder must use one shared exercise library source so custom exercises and variations appear everywhere.
- Creating a new exercise/variation from inside a workflow must preserve unsaved edits and return to the same picker/workflow.
- Mobile inputs must avoid iOS zoom/cutoff by using 16px+ input font sizes and keyboard-safe scrolling.
- Muscle group pickers should stay expanded during multi-select until explicitly collapsed.
- `ExercisePicker` `updateDb` prop is optional — pickers without it simply omit the create button.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `src/styles.css`
- `HANDOFF.md`

---
## Current Handoff — Block Builder Cleanup (Session 44)

### What changed

- **Template/Reset bug fixed**: Selecting a template (via dropdown or "Use" button on home) now syncs `daysPerWeek` from `split.daysPerWeek` into `request` state. Previously, resetting and selecting a new template left `daysPerWeek` at the old value, causing day count mismatch.
- **WeeklyOverview lime removed**: Non-editable `WeeklyOverview` and non-compact `WeekDayCardSelector` day card focus lines replaced `text-volt`/`border-volt`/`bg-volt` with blue (`border-[#0a84ff]/40 bg-[#0a84ff]/5`) and iron (`text-iron-400`). Separator changed from ` - ` to ` · `.
- **Builder WeeklyOverview**: Only shown when a `draftProgram` exists; otherwise shows a placeholder "Click Generate weeks to build" state.
- **Planning Rules collapsed summary**: When the Planning Rules accordion is collapsed, shows a sub-line with `{blockType} · {Continuous|Restart}`.
- **Block Type more-menu**: Block type segmented control shows Hypertrophy / Strength / Peaking + a `•••` button. Clicking `•••` opens a dropdown with the remaining types: Accumulation, Intensification, Deload, Pivot, Maintenance, Conditioning, Custom. If a non-primary type is selected, its chip appears inline.
- **`ab-alt` SplitLoopMode removed from UI**: Type only has `continuous | weekly-reset`; removed dead `ab-alt` option that caused a TS error.
- **Right preview panel — Muscle coverage chips**: When a `workingProgram` exists, chips appear below the block meta. Muscles that appear in the split template's `targetMuscles` are blue (`border-[#0a84ff]/30 bg-[#0a84ff]/8 text-[#8fb9ff]`). Muscles generated by exercises that are outside the template requirements are orange (`border-[#f4842a]/30 bg-[#f4842a]/8 text-[#f4842a]`).
- **Gap Analysis moved to right column**: `ProgramGapPanel` removed from left column and now renders below the preview box in the right column (only when `workingProgram` exists).

**Invariants to preserve:**
- `SplitLoopMode = "continuous" | "weekly-reset"` — do not add `ab-alt` back to the UI segmented control (it's not in the type).
- `showBlockTypeMenu` state lives in `BuilderScreen` alongside `showAdvancedRules`.
- Gap Analysis lives in the right column (`lg:col-span-1`), not the left form column.
- Muscle chips use `summarizePlannedVolume` for the muscle set and `splitTemplate.days[*].targetMuscles` for the "required" set to classify covered vs extra.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Block Tab Full Visual Rebuild (Session 43)

### What changed

- **Blocks Home landing page**: The "programs" screen now shows a proper Blocks home before the builder. Includes: large "Blocks" title with subtitle, Draft in progress banner (orange-bordered), Active block card with week badge, Templates list with "Use" CTAs, and Archived blocks with "Reuse" actions.
- **Build Block form rebuilt**: Replaced the old single-column settings dump with a guided builder:
  - Compact header: `< Blocks` breadcrumb, Save draft, Generate (short on mobile) / Generate weeks (desktop)
  - Inline segmented progress bar showing sections complete (e.g. "5 of 6")
  - Row-style Basics inputs (Name, Goal, Start week, Template)
  - Plus/minus Volume controls (Duration, Days/week)
  - Planning Rules accordion: block type segmented control, split loop segmented control, progression rules Configure button
  - Desktop two-column layout: form on left (lg:col-span-2), preview panel on right (weekly schedule + volume forecast bars)
- **Weekly split rail improved**: Compact horizontal scrollable rail with border-b-2 selection indicator; day cards show abbreviated day name + workout name only (no focus sub-line).
- **Day editor elevated**: After generating, the day editor shows below the split rail with a large day title (h3), week/focus subtitle, and "Day settings" collapsible. Requirement chips use title-case labels (e.g. "Upper Chest" not "upper-chest").
- **Exercise rows compacted**: Week-variant exercise rows now use a numbered avatar box (1/2/3…) + compact inline metadata: `Name · N×reps · RPE x · Muscle` — no stacked card layout.
- **Mobile nav updated**: "Block" tab is now visible on mobile nav (replaced Analytics/progress with Block in the mobile filter — Analytics remains accessible on desktop nav).
- **Mobile header mobile-friendly**: Activate is hidden on small screens (shown as full-width secondary row below the header when a draft exists). "Generate weeks" shortens to "Generate" on mobile.

**Invariant to preserve:**
- Block tab visual direction: Blocks home, Build Block, Day Editor, and Gap Analysis should follow the new crafted dark iOS/Apollo-style references. Block setup should be guided and compact, Day Editor should be the main working area, exercise requirement filling should stay automatic/inline, and Gap Analysis should remain minimal/compact for now rather than becoming a full dashboard.
- `BuilderScreen` has internal `blocksView: "home" | "builder"` state. Navigating to "programs" always lands on home; home has Resume (draft) and New block buttons to enter the builder.
- Mobile nav shows Today, Week, Block, Library, Settings (Analytics filtered out for mobile).
- `mobileNavItems = navItems.filter(item => item.id !== "progress")` — do not change back to filtering "programs".

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Block Builder Advanced Sections Compact Rebuild (Session 42)

### What changed

- Rebuilt Block Builder advanced/supporting sections into compact Apollo-style layouts:
  - SBD Settings now uses row-based controls instead of large cards.
  - Exercise Avoider now keeps specific-exercise picker hidden by default behind `Choose exercises`.
  - Block Builder Exercise Picker default mode now uses compact list rows and collapsible filters.
  - Program Gap Analysis now renders as a compact checklist-style section with subtle warning treatment.
- Preserved existing functionality and data sources for all toggles, avoid rules, picker selections, and gap analysis actions.

**Invariant to preserve:**
- Block Builder advanced sections should be compact Apollo-style sections. SBD Settings should be row-based, Exercise Avoider should not show the full picker by default, Exercise Picker should use compact rows with collapsed filters, and Program Gap Analysis should be a checklist-style gap view instead of card/dashboard panels.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Block Builder Apollo Visual Rebuild (Session 41)

### What changed

- Block Builder was visually rebuilt into a compact Apollo-style planner layout:
  - compact header with back and top action buttons
  - compact block setup section
  - horizontal weekly split rail
  - selected day editor as the main visible editing area
  - advanced planning/settings sections collapsed by default
- Replaced lime-leaning CTA usage in the main Block Builder flow with Apollo blue primary actions.
- Removed the old heavy card-stack/planner-preview rhythm and reduced vertical padding/spacing to keep editable content visible sooner.
- Preserved all existing options and controls, but moved lower-frequency controls into collapsed advanced sections.

**Invariant to preserve:**
- Block Builder should use a compact Apollo-style layout: header actions, compact block setup, horizontal weekly split rail, selected day editor, visible requirements/exercises, and advanced planning rules collapsed by default. Avoid lime styling, dashboard cards, and giant repeated settings panels.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Exercise Analytics Route Reconnected (Session 40)

### What changed

- Added/reconnected an exercise-specific analytics route that uses real stored session/exercise data only.
- Today exercise rows now open Exercise Analytics for that exercise (instead of dead-end behavior).
- Completed Session Review exercise rows are now clickable and open Exercise Analytics for the selected exercise.
- Week completed workout rows still open Completed Session Review first; exercise analytics is reached by clicking an exercise inside that review.
- Back from Exercise Analytics returns to the prior review context when opened from a completed session review.

**Invariant to preserve:**
- Exercise-specific analytics page must be reachable from Today exercise rows and from exercise rows inside Completed Session Review. Week workout rows should still open Session Review first; clicking an exercise from that review opens Exercise Analytics. The analytics page should show real exercise history, average RPE/feel, hard/skipped sets, e1RM trend when available, and past set history. Do not fake analytics data.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Workout Analytics/Review Entry Points Reconnected (Session 39)

### What changed

- Reconnected Today completed-workout analytics entry:
  - `View Results` opens the selected workout’s completed session review.
  - Completed workout exercise-list rows are now clickable and open the same workout review instead of doing nothing.
- Reconnected Week overview row routing:
  - completed rows open the completed session review page
  - in-progress/review rows open the in-progress review page
- Reconnected Week planning/edit day-rail behavior for completed days:
  - clicking a day with completed workout data opens that day’s review/stats instead of entering edit flows.

**Invariant to preserve:**
- Workout analytics/review must be reachable from Today View Results, completed Week rows, and completed days in Week planning/settings. These clicks should populate the existing session review page with the selected workout’s real data.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Week Workout Row Review Routing Restore (Session 38)

### What changed

- Week workout rows now open Week review/detail pages directly for active session states:
  - completed rows open completed session stats/review
  - in-progress/review rows open in-progress review with `Continue workout`
- Row click no longer routes into week/day editing or exercise picker flows.
- In-progress Week review no longer exposes an `Edit day` action from the review surface, preventing accidental planning-mode transitions from row review.
- Completed session review header now includes compact avg RPE/avg feel context when available, alongside hard/skipped/score stats.

**Invariant to preserve:**
- Week workout rows should open workout review/detail pages. Completed workouts open completed session stats/review; in-progress workouts open an in-progress review with Continue Workout. Row click should not edit the week or open exercise picker.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx`
- `HANDOFF.md`

---

## Current Handoff — Week Planner Entry Route Fix (Session 37)

### What changed

**Plan Week from Today now routes to the day editor only**
- Fixed a bug where clicking "Plan Week N" from Today/Home immediately opened the broad exercise picker sheet.
- Root cause: a `useEffect` in `WorkoutDayEditor` unconditionally called `setShowPicker(true)` whenever `day.exercises.length === 0`, overriding the initial-state guard added in the previous session.
- Fix: added `if (!weekVariant)` guard so the sheet picker is never auto-opened in the week planner variant.
- The inline requirement picker (auto-opened for the first unmet requirement) is unaffected.

**Invariant to preserve:**
- Plan Week from Today must route to the day editor only and must not open the broad exercise picker on entry.
- In `WorkoutDayEditor`, the `useEffect` that calls `setShowPicker(true)` on empty days must remain guarded by `!weekVariant`.

### Validation
- `npm run build` ✓

### Files changed
- `src/App.tsx` only

---

## Current Handoff — Library UI Redesign: Exercise Inspector + Condensed Muscle Picker (Session 36)

### What changed

**Exercise Library is now a cleaner two-pane flow**
- Rebuilt the Library exercises view into a denser Apollo-style layout:
  - compact filter/header area
  - flatter exercise rows with thin dividers
  - blue active rail/highlight for the selected row
  - row metadata focused on muscles, equipment, type, and variation count
- Removed the always-visible action-icon strip from exercise rows. Exercise actions now live primarily in the inspector.

**Add/Edit now uses a compact Exercise Inspector**
- Replaced the long add/edit form with a shorter inspector-style panel that keeps the main fields visible first:
  - name
  - equipment
  - category
  - loading profile
  - primary/secondary muscle summaries
  - notes
- Save/Add actions now use Apollo blue in the Library flow instead of the older green-leaning primary treatment.
- On mobile, the inspector now opens as a full-screen detail layer. On desktop, it stays as the right-side pane.

**Muscles are now grouped and refined in a dedicated picker**
- Added a UI-only muscle grouping layer for:
  - Chest
  - Back
  - Shoulders
  - Arms
  - Legs
  - Core
  - Conditioning
- Primary and secondary muscles now show compact summaries in the inspector instead of giant button walls.
- `Edit` opens a dedicated grouped muscle picker that expands one top-level group at a time and preserves the existing stored muscle string values.

**Advanced exercise controls are still present but quieter**
- Variations, parent exercise linking, movement patterns, allowed units, tags, fatigue rating, and gym-specific flags are now tucked into a collapsible Advanced section.
- Inspector actions preserve progress, duplicate, add variation, reset, and hide/delete flows.

**Exercise progress visuals now match the blue Library direction better**
- Updated the Library-linked exercise progress chart/buttons away from lime-accented states and onto the Apollo blue treatment.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Confirm the new mobile inspector and grouped muscle picker feel good on iPhone-sized widths.
- Confirm saving edits and new exercises behaves as expected with real local exercise data.
- Confirm hidden/default/custom filters and variation expand/collapse feel clear with a larger real library.

### Browser verification status
- Live browser verification was blocked in this environment:
  - `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` failed with `EPERM`
  - direct built-app `file://.../dist/index.html` verification was blocked by the in-app browser URL policy

---

## Current Handoff — Week Flow Phase 2: In-Progress + Picker Cleanup (Session 35)

### What changed

**In-progress review now feels like a real workout handoff**
- Tightened the Week in-progress review into a more useful screen with:
  - one blue `Continue workout` action
  - compact workout summary
  - explicit workout/exercise count
  - clearer per-exercise planned/completed progress
- Removed the leftover “sparse dashboard” feel from this surface.

**Week flow buttons now use Apollo blue instead of lime**
- Added Week-specific Apollo action styles so Week child screens no longer depend on the older green-leaning primary button treatment.
- Updated:
  - `Continue workout`
  - `Edit workout`
  - `Save changes`
  - Week completed-session edit actions
  - Week extra-exercise confirmation

**Week editor picker is now a dedicated sheet**
- The Week editor no longer renders the add/swap picker inline as old rounded cards.
- Add/swap now opens a dedicated Week-style picker sheet with:
  - compact header
  - cancel in the top bar
  - search at the top
  - compact filter row
  - list-style results instead of card grids
- This Week-only picker cleanup does not redesign other unrelated picker uses elsewhere in the app.

**Week editor rows are cleaner**
- Removed the inline swap-picker block from exercise rows.
- Kept compact list rows and logger-style steppers, but made add/swap flows cleaner and less visually noisy.
- Back-to-Week in the Week editor now exits the editor directly instead of forcing the discard-confirm path.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Confirm the Week picker sheet feels good on phone widths and that add/swap flows are obvious.
- Confirm the new Apollo-blue Week actions feel right next to Today/logger without drawing too much attention.
- Confirm Back to Week vs Cancel behavior in the Week editor matches the intended draft flow for real usage.

---

## Current Handoff — Week Flow Redesign: Review + Edit Pass (Session 34)

### What changed

**Week overview is now even lighter**
- Replaced the quick-stat mini-grid with a single compact summary line:
  - completed
  - in progress
  - skipped
  - avg feel
- Kept the Apollo-style progress header, week tabs, and compact workout rows from the prior pass.
- In-progress workouts no longer jump straight into a vague status state from the Week list.

**Week now has a useful in-progress review**
- Clicking an in-progress or review-state workout from Week now opens a dedicated in-progress review surface.
- The review shows:
  - workout/day context
  - useful summary metrics
  - `Continue workout`
  - `Edit day`
  - planned/logged exercise details
- `Continue workout` still resumes the existing logger flow unchanged.

**Completed session review now matches the Apollo direction**
- Removed the old metric-card grid and the older boxed `Completed Workout` shell.
- Rebuilt completed review into a flatter session screen with:
  - back link
  - session header/context
  - compact summary strip
  - optional short insight
  - cleaner exercise log sections
- The set tables were restyled to read more like a compact logbook than dashboard cards.

**Week edit mode now uses a dedicated Week-style editor**
- The Week editor shell was redesigned with:
  - back to Week
  - one save/cancel command row
  - compact horizontal day selector
  - flatter section structure
- The shared workout day editor now has a Week-specific variant used only in the Week flow.
- Week editing now shows:
  - subtle requirement tags
  - compact exercise rows
  - inline stepper-style controls for sets/reps/RPE
  - quiet swap/remove actions
  - subdued add/choose controls
- The older editor path remains intact for other screens that still use it.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Confirm in-progress review feels useful on phone widths and that `Continue workout` resumes exactly as expected.
- Confirm the Week editor’s compact stepper controls still feel comfortable on touch devices.
- Confirm completed review table scrolling feels clean on smaller screens with no awkward overflow.

---

## Current Handoff — Week / Block Progress Apollo Redesign (Session 33)

### What changed

**Week now uses one compact block summary instead of dashboard cards**
- Replaced the old two-row metric-card grid with a single text-led header summary.
- Added:
  - block/week heading
  - completion line
  - thin Apollo-blue progress bar
  - compact quick-stats row for completed, skipped, in-progress, and set feel
- Removed the heavier “old dashboard” visual rhythm from the Week tab.

**Week selector is flatter and cleaner**
- Restyled week switching into a compact horizontal tab strip.
- Active week now uses Apollo-blue underline/text instead of lime/fill-heavy pills.
- Completed/planned/draft states stay visible, but in a quieter text-first treatment.

**Workout cards became compact progress rows**
- Replaced the large rounded workout cards and nested metric tiles with flatter list rows.
- Each row now emphasizes:
  - day line
  - workout name
  - subtle right-aligned status
  - compact planned/focus line
  - one dense metrics sentence
- Completed status is now subdued blue, in-progress uses Apollo blue, skipped uses muted orange, and planned/unplanned stay gray.
- Existing click behavior is preserved:
  - completed rows open completed review
  - in-progress/review rows resume
  - edit workout actions remain available
  - inline day editing remains available

**Suggestions and off-program history are quieter**
- Removed the large per-row suggestions box treatment.
- Suggestions now show as a single compact insight line only when useful.
- Off-program history is now collapsed by default behind one compact row and can expand inline.

**Week-complete review was also slimmed down**
- Reduced the heavy metric-card feel in the week-complete panel.
- Kept all existing review actions and computed values, but presented them with flatter spacing and lighter hierarchy.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Confirm the Week tab spacing and typography on iPhone Safari and desktop feel aligned with Today/logger.
- Confirm completed rows, in-progress rows, and edit actions still feel clear on touch devices.
- Confirm the collapsed off-program history pattern feels discoverable enough in real use.

---

## Current Handoff — Today Edit Flow Fix + Exercise Detail View (Session 32)

### What changed

**Today edit mode now has one command area**
- Removed the duplicate nested `Save changes / Cancel` controls from the inline workout editor.
- Edit mode now keeps a single global command row in the Workout section header.
- The per-exercise edit area no longer re-renders a second editing header.

**Exercise rows now open a dedicated detail view**
- In normal Today mode, tapping an exercise row now opens a dedicated exercise detail screen within the Today flow.
- Expanded-details rows now open that same detail view instead of bouncing back into Today or resuming the workout.
- The detail view has a back link that returns to Today cleanly.

**Edit mode row interaction is now safer**
- While editing, row taps no longer navigate away and risk losing the draft.
- Instead, each exercise row expands inline controls for that exercise:
  - sets
  - reps
  - RPE
  - target weight
  - remove
- The explicit save/cancel flow remains unchanged.

**Exercise detail uses real existing data**
- The new exercise detail view shows:
  - exercise heading
  - Today workout context
  - planned prescription
  - recent performance
  - history table
  - ratings summary
  - e1RM trend chart when enough data exists
  - placeholder when chart/history data is sparse
- It reuses existing history/e1RM helpers rather than creating a new analytics model.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Confirm normal Today row taps always open Exercise Detail instead of any logger/today loop.
- Confirm edit-mode row expansion feels clear on touch devices.
- Confirm the detail view reads well on smaller mobile widths, especially the history table.

---

## Current Handoff — Today Style Alignment With Logger (Session 31)

### What changed

**Today now sits closer to the logger’s visual language**
- Tightened the vertical rhythm so the page feels less sparse and less like floating dashboard sections.
- Kept the same workout-first structure, but made the title, subtitle, metadata, CTA, and section spacing more compact and app-like.
- Preserved the single-column desktop layout with no right-side summary rail.

**Workout area now reads as a clearer section**
- Added a cleaner `Workout` section label above the exercise area.
- Refined the summary/toggle row so it feels more intentional and less like loose utility text.
- Kept the details toggle and inline edit mode behavior unchanged.

**Exercise rows got a logger-style polish pass**
- Reduced the heavy active-row fill while keeping the blue left rail.
- Tightened row height and spacing slightly.
- Strengthened the right-aligned target weight and softened the chevron.
- Kept the flat list treatment with thin dividers and no icon clutter.

**Readiness now feels more like a compact snapshot**
- Reworked readiness from row-by-row table styling into a tighter 2x2/4-across compact grid.
- Kept the same values and placement below the workout area.
- Removed the plainer settings-table feel while avoiding giant metric cards or dashboard styling.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Compare Today against the logger on actual phone and desktop viewports for spacing consistency.
- Confirm the updated readiness grid feels balanced on narrow mobile widths.
- Confirm the slightly tighter row sizing still feels comfortably tappable on touch devices.

---

## Current Handoff — Today Details Toggle + Inline Edit Mode (Session 30)

### What changed

**Details toggle now behaves correctly**
- The Today summary row now shows only one state at a time:
  - `Show details` when details are collapsed
  - `Hide details` when details are expanded
- The toggle is hidden during inline editing and replaced with quiet edit actions instead.

**Expanded details no longer use the old Workout Plan UI**
- Removed the old `WorkoutDayView`-style expanded panel from Today.
- Expanded details now render as Apollo-style rows in the same visual system as the collapsed list:
  - exercise name
  - right-aligned target weight
  - compact sets/reps/RPE line
  - optional recent-history line
  - short role/fatigue context when available
- Removed the verbose role-based prescription paragraphs and the older boxed/card-heavy presentation.

**Edit now stays inline on Today**
- The old Today-launched `WorkoutDayEditor` mount was removed from this flow.
- `Edit` now switches the workout area into an inline draft editor inside the Today page.
- The draft editor supports:
  - sets
  - reps
  - RPE
  - target weight
  - remove exercise
  - add exercise
- Save is explicit. Changes are not written to the program until `Save changes`.
- `Cancel` discards the local draft and returns to the normal Today list/details view.

**Readiness got a compact polish pass**
- Kept readiness below the workout area.
- Added subtler row polish and compact state chips so it feels less like a plain table while staying lightweight.
- Kept values and readiness logic unchanged.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓

### Manual verification still recommended
- Confirm the inline editor comfortably fits smaller phone widths with no horizontal overflow.
- Confirm add/remove exercise flows feel right inside Today on touch devices.
- Confirm `Save changes` / `Cancel` behavior on real device/browser flows.

---

## Current Handoff — Today Workout-First Apollo Layout (Session 29)

### What changed

**Today now follows the approved workout-first hierarchy**
- Reordered the real Today screen so the main flow is now:
  - `Today`
  - workout name + compact metadata
  - blue `Resume` CTA
  - inline secondary actions
  - workout list summary + exercise rows
  - readiness summary
- Kept all existing Today handlers in place for resume, back, next day, skip, edit, off-program, exercise-row tap, and details expansion.

**The exercise list is now the center of the page**
- Flattened the exercise presentation into a cleaner Apollo-style list with:
  - thin dividers
  - right-aligned target weight
  - chevrons
  - a subtle blue active/next rail
- Removed the heavier card feel and kept the logger launch behavior unchanged.

**Readiness moved below the workout list**
- Replaced the larger readiness-overview card treatment with a more compact section below the exercise list.
- The readiness block now shows one header line plus four simple metric rows for sleep, stress, soreness, and motivation.
- Removed extra icon noise and helper copy that made the section feel more like a dashboard card.

**Desktop stays single-column with no right rail**
- Kept the existing left sidebar and compact top header.
- Preserved the stronger centered main column and did not reintroduce any right-side workout summary or readiness panel.
- Let desktop keep intentional empty space to the right instead of filling it with duplicate content.

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓
- Manual browser/device verification not run in this environment

### Manual verification still recommended
- Mobile Today spacing, tap targets, and bottom-nav feel on iPhone Safari
- Desktop main-column balance after the workout-first reorder
- Today action row behavior in the new placement
- Exercise row launch/resume behavior and `Show details` expansion

---

## Current Handoff — Today Screen Apollo Pass (Session 28)

### What changed

**Today now has a dedicated identity instead of a generic training card**
- Reworked the main Today state into a mobile-first layout with a stronger hierarchy:
  - dominant `Today` heading
  - secondary workout title
  - compact metadata line
  - one clear blue `Resume` CTA
- Kept navigation and logger wiring intact. The main action still routes into the existing logger/start flow.

**Readiness is now a compact overview card**
- Added a tighter readiness summary directly under the workout header.
- The card shows:
  - readiness score
  - small baseline/helper copy
  - four compact metrics for sleep, stress, soreness, and motivation
- If no readiness check-in exists yet, the card stays present with a quiet placeholder state instead of disappearing.

**Exercise plan is now a cleaner tappable list**
- Replaced the older expandable Today card feel with sharper list rows that show:
  - exercise name
  - compact prescription line
  - right-aligned planned/recommended load
  - chevron affordance
- Added a subtle blue rail/highlight for the current or next exercise when a resumable session exists.
- Preserved the optional workout-detail expansion below the new summary row instead of redesigning the logger itself.

**Desktop Today is now a widened single-column layout**
- Removed the redundant desktop right-side workout summary panel entirely.
- Kept the existing left sidebar.
- Widened the main Today content into a cleaner single content column so desktop feels like an expanded premium mobile view instead of a dashboard.
- Kept completed-today history in the main flow rather than a separate rail.

**Top chrome now matches the Today direction more closely**
- Today uses a more compact brand/settings treatment in the top bar.
- The mobile bottom nav was updated to a floating Apollo-style treatment with five items:
  - Today
  - Week
  - Library
  - Analytics
  - Settings

### Validation
- `npx eslint src/App.tsx` ✓
- `npm run build` ✓
- `npm run lint` ✗ still blocked by pre-existing generated `.claude/.../dist` files and service-worker global linting

### Manual verification still recommended
- Mobile Today layout on iPhone Safari sizing/tap comfort
- Desktop width/balance of the widened single content column
- Resume CTA and exercise-row navigation into the logger
- Floating bottom nav feel on-device
- Real browser verification was blocked in this environment:
  - local dev server still failed with `listen EPERM` on `127.0.0.1:5174`
  - the in-app browser would not open the built `file://.../dist/index.html` due to browser URL policy

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
