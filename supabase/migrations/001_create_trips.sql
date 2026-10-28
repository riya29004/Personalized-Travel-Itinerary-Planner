create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  itinerary jsonb not null,
  trip_input jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.trips enable row level security;

create policy "Users can read their own trips"
  on public.trips for select
  using (auth.uid() = user_id);

create policy "Users can insert their own trips"
  on public.trips for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own trips"
  on public.trips for delete
  using (auth.uid() = user_id);
