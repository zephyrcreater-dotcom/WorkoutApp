# FEATURES.md

## Current Feature List

- Mobile-first PWA shell.
- Installable PWA metadata and production service worker.
- Local IndexedDB persistence.
- Local user switch/login.
- User-specific data separation.
- Seed powerbuilding user and general-health user.
- Exercise library.
- Custom exercise creation.
- Searchable exercise picker.
- Gym manager.
- Gym-specific machine/cable data.
- Gym-specific exercise conversion factors.
- Program/block generator.
- Structured key lift selection.
- Weekly overview.
- Editable workout days.
- Workout templates.
- Live workout logger.
- Readiness check-in.
- Set-by-set logging.
- RPE, reps, weight, set rating, form, feel, pump, pain, soreness, notes.
- Rest timer.
- Intra-workout weight adjustment suggestions.
- e1RM calculations.
- Powerlifting dashboard.
- Bodybuilding dashboard foundation.
- Program gap analysis.
- Previous block history and duplication.
- JSON export/import.

## Planned Feature List

- Dedicated Split Library.
- Custom Split Builder with user-owned splits.
- Cleaner Block Builder.
- Today section that clearly follows active block schedule.
- Previous block deletion.
- User profile editing.
- Custom max/training max editing.
- Avoided compounds and block constraints.
- Better workout feedback after completion.
- More precise adaptive weight recommendations.
- Improved gym-specific machine conversion user flow.
- Unit tests.
- Future cloud sync.
- Future AI/ML coaching.

## User Roles / Profiles

Current intended users:

- Advanced powerlifting plus hypertrophy/bodybuilding/powerbuilding user.
- General health/basic fitness user.

Profiles should support:

- Name/username.
- PIN/password for local switching.
- Goal.
- Experience level.
- Unit preference.
- Bodyweight history.
- Maxes/training maxes.
- Training preferences.
- Available days.
- Preferred duration.
- Active gym.
- Injury/pain notes.
- Program history.
- Exercise history.

## Workout Generation Requirements

Program generation should create:

- Full block.
- Weekly structure.
- Daily workouts.
- Exercise selection.
- Sets/reps/RPE.
- Suggested starting weights.
- Progression rules.
- Deload rules.
- Substitution options.
- Notes/cues.

It should consider:

- Goal.
- Days/week.
- Split days.
- Available gym/equipment.
- Current maxes/training maxes.
- Experience.
- Block type.
- Block length.
- Priority muscles/lifts.
- Meet/goal dates eventually.
- Workout duration.
- Injury/pain limitations.
- Preferred exercises.
- Exercises to avoid.

## Split Builder Requirements

Needed:

- Built-in splits.
- User-owned custom splits.
- Number of training days.
- Name of each day.
- Muscles trained each day.
- Main lift focus.
- Movement pattern focus.
- Exercises per day.
- Priority muscles/lifts.
- Volume targets.
- Day focus: strength, hypertrophy, technical, recovery, conditioning, hybrid.
- Split looping when a block has more days than the split template.

Important issue:

- Split templates should live in Library, not be hidden only in Block Builder.

## Block Builder Requirements

Needed:

- Block type.
- Block length.
- Training days per week.
- Target RPE progression.
- Volume progression.
- Deload frequency.
- Main lift frequency.
- Goal/meet date eventually.
- Priority lifts.
- Priority muscles.
- Target weekly sets.
- Strength/size/conditioning/technique/recovery emphasis.
- Ability to avoid certain compounds in certain blocks.
- Clear generated weekly preview.
- Edit workout days before/after generation.

## Exercise Library Requirements

Each exercise should support:

- Name.
- Muscle group.
- Primary muscles.
- Secondary muscles.
- Equipment.
- Movement pattern.
- Tags for powerlifting/bodybuilding/general health.
- Gym availability.
- Substitutions.
- Notes.
- Video link.
- Setup cues.
- Track by bodyweight/external weight.
- Track per side/total weight.
- Cable/machine/free-weight category.
- Competition lift/variation/accessory/isolation/compound/conditioning/mobility tags.
- Direct and indirect volume contribution.
- Best tracked by load, reps, distance, time, or bodyweight.

Current picker supports:

- Search by name, muscle, equipment, movement pattern, and gym availability.

## Dashboard Requirements

Powerlifting dashboard should show:

- Squat e1RM.
- Bench e1RM.
- Deadlift e1RM.
- Estimated total.
- Recent top sets.
- Competition lift trends.
- Program gaps relevant to strength.
- Meet countdown later.

Bodybuilding dashboard should show:

- Weekly volume by muscle.
- Sets per muscle per week.
- Frequency per muscle.
- Exercise distribution.
- Recovery/fatigue warnings.
- Under target muscles.
- Over target muscles.
- Recent progression by exercise.
- Current block goal.
- Suggested adjustments.

Current block dashboard should show:

- Block type.
- Week number.
- Volume progression.
- Intensity progression.
- Deload timing.
- Current fatigue.
- Adherence.
- Recommended changes.

Weekly review should show:

- Completed workouts.
- Missed workouts.
- Volume by muscle.
- Main lift performance.
- PRs.
- Fatigue.
- Pain/soreness.
- Suggested changes.

## Gym Selector Requirements

Required behavior:

- Exercises exist globally.
- Gyms can have equipment variations.
- User can log same exercise at different gyms.
- App remembers gym-specific working weights.
- User can mark a machine as feeling different.
- App adapts future recommendations based on selected gym.
- Store gym-specific adjustment factor per exercise or machine variation.
- Allow manual override/reset of conversion factor.
- Keep barbell/free-weight exercises mostly consistent across gyms unless manually flagged.

Current implementation:

- `GymExerciseAdjustment` in `src/types/domain.ts`.
- Manual factors in Gym screen.
- Simple learned factor update in `learnGymExerciseAdjustment` in `src/lib/trainingMath.ts`.
- Suggestions apply conversion when relevant through `suggestPlannedWeight`.

## Feedback / Progression Model Requirements

The first version uses transparent rules:

- Estimate e1RM from load/reps/RPE.
- Use RPE-to-percentage chart.
- Compare target RPE to actual RPE.
- Compare target reps to actual reps.
- Factor set rating.
- Factor form rating.
- Factor muscle feel rating.
- Factor readiness.
- Detect performance drops within workout.
- Suggest load changes for next sets.
- Suggest progression/regression for next week.
- Suggest deloads when fatigue/performance signals justify it.
- Suggest substitutions when pain or poor stimulus repeats.

Examples:

- If actual RPE is 2+ over target, reduce next set 2.5-7.5%.
- If planned reps fail, reduce next set 5-10%.
- If set is Easy and RPE below target, allow a small increase.
- If form is poor, hold or reduce load.
- If pain is high, stop or substitute.
- If muscle feel is poor on accessories, suggest cue/tempo/substitution.
- If readiness is low, reduce top set RPE and/or remove an optional accessory set.
