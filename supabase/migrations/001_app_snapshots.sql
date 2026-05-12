create extension if not exists pgcrypto;

create table if not exists public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create or replace function public.set_app_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_snapshots_updated_at on public.app_snapshots;

create trigger set_app_snapshots_updated_at
before update on public.app_snapshots
for each row
execute function public.set_app_snapshots_updated_at();

alter table public.app_snapshots enable row level security;

drop policy if exists "Users can select their own snapshot" on public.app_snapshots;
create policy "Users can select their own snapshot"
on public.app_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own snapshot" on public.app_snapshots;
create policy "Users can insert their own snapshot"
on public.app_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own snapshot" on public.app_snapshots;
create policy "Users can update their own snapshot"
on public.app_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own snapshot" on public.app_snapshots;
create policy "Users can delete their own snapshot"
on public.app_snapshots
for delete
to authenticated
using (auth.uid() = user_id);
