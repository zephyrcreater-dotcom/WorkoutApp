# Supabase Phase 1 Setup

This project uses Supabase Phase 1 for:

- email/password auth
- one JSONB app snapshot per Supabase user
- local-first fallback when Supabase is missing or unavailable

## Frontend env vars

Create `.env.local` with:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only use the anon/publishable key in the browser app. Do not put a service-role key in `.env.local`.

## SQL setup

If you are not using the Supabase CLI yet:

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Open `supabase/migrations/001_app_snapshots.sql`.
4. Paste the SQL into the editor and run it.

That migration creates:

- `public.app_snapshots`
- `unique(user_id)` so each auth user gets one snapshot row
- RLS policies using `auth.uid() = user_id`
- an `updated_at` trigger

## Table shape

`app_snapshots` stores one row per authenticated Supabase user:

- `user_id`
- `data jsonb`
- `version`
- `updated_at`

The frontend writes this snapshot envelope:

```json
{
  "version": 1,
  "updatedAt": "2026-05-12T12:34:56.000Z",
  "data": { "full": "TrainingDatabase object" }
}
```

## Current sync rule

- Local IndexedDB loads first.
- If signed in, the app fetches the cloud snapshot.
- Latest `updatedAt` wins.
- Local changes still save immediately.
- Cloud sync is debounced and can also be triggered with `Sync Now`.

Conflict resolution is intentionally simple in Phase 1. Full merge/offline conflict handling is deferred.
