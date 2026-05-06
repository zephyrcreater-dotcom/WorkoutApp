# AGENTS.md

## App Purpose

Iron Orbit Training is a local-first, mobile-first Progressive Web App for advanced workout programming and tracking. It is intended to support:

- Powerlifting users who need maxes, main lift frequency, top sets/backoffs, variations, RPE/percentage logic, meet/block planning, and fatigue management.
- Hypertrophy/bodybuilding users who need muscle volume, frequency, exercise distribution, stimulus quality, recovery warnings, and progressive overload.
- General health users who need simpler programming, lower technical difficulty, balanced movement patterns, sustainable volume, and easy workout logging.

The app should eventually replace an Excel workout tracking system and grow into a smart training coach.

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- lucide-react icons
- IndexedDB through a small local adapter in `src/lib/db.ts`
- PWA manifest and service worker in `public/manifest.webmanifest` and `public/service-worker.js`

There is currently no backend. The architecture should remain cloud-sync-friendly for a future Supabase/Firebase/Postgres sync layer.

## Run, Test, Build

In a normal local environment:

```bash
npm install
npm run dev
npm run lint
npm run build
```

In this Codex desktop environment, `npm` was not on the shell path. The first session used a temporary npm CLI:

```bash
/Applications/Codex.app/Contents/Resources/node /private/tmp/iron-orbit-npm/package/bin/npm-cli.js install --cache /private/tmp/iron-orbit-npm-cache
/Applications/Codex.app/Contents/Resources/node /private/tmp/iron-orbit-npm/package/bin/npm-cli.js run lint --cache /private/tmp/iron-orbit-npm-cache
/Applications/Codex.app/Contents/Resources/node /private/tmp/iron-orbit-npm/package/bin/npm-cli.js run build --cache /private/tmp/iron-orbit-npm-cache
```

Current dev server target:

```bash
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Seed login users:

- `nathan` / `2468`
- `ava` / `1357`

## Coding Rules For Future Codex Sessions

- Inspect relevant files before editing. Do not code from assumptions.
- Start by reading `AGENTS.md`, `HANDOFF.md`, `ROADMAP.md`, `DECISIONS.md`, `BUGS.md`, `FEATURES.md`, `package.json`, and the relevant source files.
- Do not make large unrelated rewrites. Keep changes scoped to the requested product problem.
- Preserve existing working functionality unless it directly conflicts with the current requirement.
- Prefer typed, explicit domain models in `src/types/domain.ts`.
- Keep programming/coaching logic in `src/lib/*`, not buried inside UI event handlers.
- Keep data persistence concerns in `src/lib/db.ts`.
- Keep seed/demo data in `src/data/seedData.ts`.
- Use `apply_patch` for manual edits.
- Run `npm run lint` and `npm run build` after code changes whenever feasible.
- If browser verification is relevant, use the in-app browser workflow for `http://127.0.0.1:5174/`.
- At the end of each major session, update `HANDOFF.md`, `BUGS.md`, `ROADMAP.md`, and `DECISIONS.md`.

## UI/UX Rules

- Mobile-first. Must work well on iPhone Safari and desktop browser.
- Dark mode by default.
- Use large tap targets for workout logging.
- Avoid giant text boxes when structured controls are better.
- Search/picker controls should replace long dropdowns when lists can grow large.
- Do not create disconnected tabs without a clear flow.
- The desired product flow is: Library/Settings -> Split Builder -> Block Builder -> Today/Dashboard.
- Keep the live workout logger fast: minimal taps, autofill previous/suggested weights, quick set ratings, RPE, form, pump, pain, and notes.
- Use cards/panels for repeated items and dashboards, but avoid making the whole app feel like a generic form.

## Data And Storage Rules

- The app is local-first.
- IndexedDB stores the entire training database document through `src/lib/db.ts`.
- Each user must have separated data: profile, gyms, programs, sessions, readiness, maxes, history, and preferences.
- Current PIN login is local convenience only, not real security or encryption.
- Data model must support future cloud sync.
- Exercises should be global where possible; gyms should not create totally separate exercise worlds.
- Gym-specific differences should be modeled as equipment/machine variants and conversion factors, not duplicated exercises unless truly necessary.
- Backward compatibility matters. `normalizeDatabase` in `src/lib/db.ts` exists to migrate older local IndexedDB data.

## Workout Programming Logic Rules

Use research-based programming principles. Do not randomly generate workouts.

The app should consider:

- Optimal weekly sets per muscle.
- Rep ranges by goal.
- Powerlifting specificity.
- Main compound lifts.
- Accessory work.
- Hypertrophy volume.
- Fatigue management.
- Rest days.
- Exercise overlap.
- Muscle coverage.
- Movement patterns.
- Progression over time.
- Deloads and lower-stress blocks.
- RPE/RIR/intensity.
- Whether compounds should be allowed or avoided in a block.
- Whether the user is powerlifting, bodybuilding, or general-health focused.

For powerlifting:

- Consider squat, bench, and deadlift maxes.
- Program main lift frequency intentionally.
- Include variations and accessories that support the goal.
- Support top sets/backoffs and percentage/RPE-based loading.
- Balance strength and hypertrophy.
- Manage recovery from heavy compounds.

For bodybuilding/hypertrophy:

- Track weekly sets per muscle.
- Track frequency per muscle.
- Use exercise variety and progression.
- Balance physique development.
- Manage fatigue and recovery.

For general health:

- Prefer simpler exercise selection.
- Lower technical difficulty.
- Sustainable volume.
- Balanced movement patterns.

## Important Warning

This app is in an early but working MVP state. The code is concentrated in `src/App.tsx` and should eventually be split into components, but do not start a broad refactor unless the user explicitly asks for it or it is required for a narrow feature. Preserve stability first.
