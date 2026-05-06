# Iron Orbit Training

Iron Orbit is a mobile-first local-first PWA for advanced workout programming and tracking across powerlifting, hypertrophy/bodybuilding, powerbuilding, conditioning, and general health training.

## Install

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. The app seeds two local users:

- `nathan` / `2468`
- `ava` / `1357`

## Build

```bash
npm run build
npm run preview
```

## Install on iPhone

1. Run the app on a host your iPhone can reach, or deploy the built `dist` folder to any HTTPS static host.
2. Open the app in iPhone Safari.
3. Tap Share.
4. Tap Add to Home Screen.
5. Launch Iron Orbit from the home screen for standalone PWA mode.

Safari requires HTTPS for full PWA behavior outside local development.

## MVP Scope

Implemented foundations:

- Local PIN login and user switching
- Strict user-specific data separation in IndexedDB
- Built-in and custom exercise library
- Unlimited gyms with machine/cable tracking notes and substitutions
- Split and program generation foundations
- Workout templates and day editing
- Live workout logger with readiness check-in, set ratings, RPE, pain, pump, form, and rest timer
- Rules-based intra-workout load suggestions
- e1RM, RPE percentage, volume, weak point, and dashboard calculations
- Structured key-lift selection for program generation
- Weekly active-program overview with editable workout days
- Program gap analysis for volume, frequency, movement balance, fatigue, and missing accessory categories
- Previous block history with read-only preview and duplication
- Gym-specific machine/cable conversion factors for weight recommendations
- Powerlifting, bodybuilding, block, weekly review, and progress dashboards
- JSON export/import backup
- Manifest and service worker for installable offline-friendly PWA behavior

The coaching model is transparent and rule-based by design, with isolated modules under `src/lib` so ML or cloud sync can be added later.
