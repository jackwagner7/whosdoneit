alter table public.rooms
  add column if not exists game_type text not null default 'whosdoneit';

alter table public.rooms
  add column if not exists team_count integer not null default 2;

alter table public.rooms
  add column if not exists team_names text[] not null default array[]::text[];

alter table public.players
  add column if not exists team_index integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_game_type_check'
  ) then
    alter table public.rooms
      add constraint rooms_game_type_check
      check (game_type in ('whosdoneit', 'sayless'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_team_count_check'
  ) then
    alter table public.rooms
      add constraint rooms_team_count_check
      check (team_count between 2 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_team_index_check'
  ) then
    alter table public.players
      add constraint players_team_index_check
      check (team_index is null or team_index between 0 and 4);
  end if;
end
$$;
