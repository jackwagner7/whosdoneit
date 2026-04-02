alter table public.rooms
  add column if not exists prompt_seconds integer,
  add column if not exists round_count integer;

update public.rooms
set
  prompt_seconds = coalesce(prompt_seconds, 150),
  round_count = coalesce(round_count, 1);

alter table public.rooms
  alter column prompt_seconds set default 150,
  alter column prompt_seconds set not null,
  alter column round_count set default 1,
  alter column round_count set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'rooms_phase_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      drop constraint rooms_phase_check;
  end if;

  alter table public.rooms
    add constraint rooms_phase_check
    check (
      phase in ('lobby', 'prompting', 'answering', 'guessing', 'revealing', 'leaderboard', 'finished')
    );

  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_prompt_seconds_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_prompt_seconds_check
      check (prompt_seconds between 5 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_round_count_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_round_count_check
      check (round_count between 1 and 10);
  end if;
end
$$;
