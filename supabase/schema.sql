create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  phase text not null default 'lobby',
  current_prompt_index integer not null default 0,
  reveal_player_index integer not null default 0,
  reveal_truth_visible boolean not null default false,
  prompt_seconds integer not null default 20,
  round_count integer not null default 1,
  answering_seconds integer not null default 25,
  guessing_seconds integer not null default 35,
  reveal_seconds integer not null default 8,
  fast_mode boolean not null default false,
  phase_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rooms_phase_check check (
    phase in ('lobby', 'prompting', 'answering', 'guessing', 'revealing', 'leaderboard', 'finished')
  ),
  constraint rooms_prompt_seconds_check check (prompt_seconds between 5 and 180),
  constraint rooms_round_count_check check (round_count between 1 and 10),
  constraint rooms_answering_seconds_check check (answering_seconds between 5 and 180),
  constraint rooms_guessing_seconds_check check (guessing_seconds between 5 and 180),
  constraint rooms_reveal_seconds_check check (reveal_seconds between 5 and 180)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  emoji text not null default '🙂',
  score integer not null default 0,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  submitted_by_player_id uuid not null references public.players(id) on delete cascade,
  text text not null,
  prompt_order integer not null default 0,
  score_applied boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prompts_one_per_player unique (room_id, submitted_by_player_id)
);

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  answer boolean not null,
  created_at timestamptz not null default now(),
  constraint confessions_one_per_prompt unique (prompt_id, player_id)
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  guessing_player_id uuid not null references public.players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete cascade,
  guessed_answer boolean not null,
  created_at timestamptz not null default now(),
  constraint guesses_one_per_target unique (prompt_id, guessing_player_id, target_player_id),
  constraint guesses_no_self_guess check (guessing_player_id <> target_player_id)
);

create unique index if not exists players_room_name_unique
  on public.players (room_id, lower(name));
create unique index if not exists players_room_color_unique
  on public.players (room_id, lower(color));

create index if not exists players_room_id_idx on public.players (room_id);
create index if not exists prompts_room_id_idx on public.prompts (room_id);
create index if not exists confessions_room_id_idx on public.confessions (room_id);
create index if not exists confessions_prompt_id_idx on public.confessions (prompt_id);
create index if not exists guesses_room_id_idx on public.guesses (room_id);
create index if not exists guesses_prompt_id_idx on public.guesses (prompt_id);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.prompts enable row level security;
alter table public.confessions enable row level security;
alter table public.guesses enable row level security;

drop policy if exists "public_rw_rooms" on public.rooms;
drop policy if exists "public_rw_players" on public.players;
drop policy if exists "public_rw_prompts" on public.prompts;
drop policy if exists "public_rw_confessions" on public.confessions;
drop policy if exists "public_rw_guesses" on public.guesses;

create policy "public_rw_rooms" on public.rooms for all using (true) with check (true);
create policy "public_rw_players" on public.players for all using (true) with check (true);
create policy "public_rw_prompts" on public.prompts for all using (true) with check (true);
create policy "public_rw_confessions" on public.confessions for all using (true) with check (true);
create policy "public_rw_guesses" on public.guesses for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    execute 'alter publication supabase_realtime add table public.players';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prompts'
  ) then
    execute 'alter publication supabase_realtime add table public.prompts';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'confessions'
  ) then
    execute 'alter publication supabase_realtime add table public.confessions';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guesses'
  ) then
    execute 'alter publication supabase_realtime add table public.guesses';
  end if;
end
$$;
