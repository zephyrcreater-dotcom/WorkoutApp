export const CSV_COLUMN_HEADERS =
  "date,workout_name,exercise_name,set_number,weight,unit,reps,rpe,rir,difficulty,notes,set_type,duration_seconds,distance,source";

export const AI_CSV_PROMPT = `Convert my workout log into a CSV using exactly these columns:
date, workout_name, exercise_name, set_number, weight, unit, reps, rpe, rir, difficulty, notes, set_type, duration_seconds, distance, source.

Rules:
- Use YYYY-MM-DD for date.
- Use one row per set.
- If weight is unknown, leave it blank.
- If RPE is unknown, leave it blank.
- If the set is time-based, use duration_seconds instead of reps.
- If the exercise name is abbreviated, expand it to the most likely full exercise name.
- For set_type use: working, warmup, backoff, top, drop, or skipped.
- Do not invent numbers.
- Return only the CSV, no explanation.`;

export const EXERCISE_IMPORT_COLUMN_HEADERS =
  "name,primaryMuscles,secondaryMuscles,equipment,unit,increment,source,parentExerciseName,isVariation,variationType,exerciseFamily,movementPattern,variationGroup,category,baselineWeight,baselineSets,baselineReps,baselineRpe,baselineE1RM,baselineSource,baselineUpdatedAt,notes";

export const EXERCISE_IMPORT_AI_PROMPT = `Convert my exercise list into a CSV using exactly these columns:
name, primaryMuscles, secondaryMuscles, equipment, unit, increment, source, parentExerciseName, isVariation, variationType, exerciseFamily, movementPattern, variationGroup, category, baselineWeight, baselineSets, baselineReps, baselineRpe, baselineE1RM, baselineSource, baselineUpdatedAt, notes.

Rules:
- Use one row per exercise.
- If weight/sets/reps/RPE/e1RM are unknown, leave them blank.
- Do not invent numbers.
- If an exercise is a variation, fill parentExerciseName.
- Use semicolons to separate multiple muscles.
- Return only CSV.`;

export const LEGACY_EXERCISE_SHEET_AI_PROMPT = `From this spreadsheet’s Exercises tab, extract only Exercise, Weight, Set, Rep, RPE, and e1RM. Treat rows with only Exercise text and no numbers as category headers. Return one row per exercise.`;

export const TRAINING_DATA_AI_PROMPT = `Convert my training data into an import-ready spreadsheet for Iron Orbit.

Create an Excel-style table or CSV using these two possible sections:

SECTION 1: Exercises
Use these columns:
name, primaryMuscles, secondaryMuscles, equipment, unit, increment, parentExerciseName, isVariation, variationType, exerciseFamily, movementPattern, variationGroup, category, baselineWeight, baselineSets, baselineReps, baselineRpe, baselineE1RM, notes.

SECTION 2: Workout History
Use these columns:
date, workout_name, exercise_name, set_number, weight, unit, reps, rpe, rir, difficulty, notes, set_type, duration_seconds, distance, source.

Rules:
- Use one row per exercise in the Exercises section.
- Use one row per set in the Workout History section.
- Use YYYY-MM-DD for dates.
- Use semicolons to separate multiple muscles.
- If an exercise is a variation, fill parentExerciseName.
- Use exercise science knowledge to infer primary muscles, secondary muscles, equipment, movement pattern, exercise family, and variation group when they are not listed.
- Do not invent weights, reps, RPE, dates, e1RM, or workout history values.
- If weight/sets/reps/RPE/e1RM are unknown, leave them blank.
- Standardize obvious exercise abbreviations, e.g. DB = Dumbbell, BB = Barbell, RDL = Romanian Deadlift.
- Legacy Excel sheets with an Exercises tab containing Exercise, Weight, Set, Rep, RPE, and e1RM are supported.
- Return only the CSV/table. Do not include explanation.`;

export const TRAINING_DATA_HEADER_SECTIONS = `Exercises:
${EXERCISE_IMPORT_COLUMN_HEADERS}

Workout History:
${CSV_COLUMN_HEADERS}`;
