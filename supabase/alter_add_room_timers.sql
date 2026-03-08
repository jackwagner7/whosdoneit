alter table public.rooms
  add column if not exists reveal_truth_visible boolean,
  add column if not exists answering_seconds integer,
  add column if not exists guessing_seconds integer,
  add column if not exists reveal_seconds integer,
  add column if not exists phase_deadline_at timestamptz;

update public.rooms
set
  reveal_truth_visible = coalesce(reveal_truth_visible, false),
  answering_seconds = coalesce(answering_seconds, 25),
  guessing_seconds = coalesce(guessing_seconds, 35),
  reveal_seconds = coalesce(reveal_seconds, 8);

alter table public.rooms
  alter column reveal_truth_visible set default false,
  alter column reveal_truth_visible set not null,
  alter column answering_seconds set default 25,
  alter column answering_seconds set not null,
  alter column guessing_seconds set default 35,
  alter column guessing_seconds set not null,
  alter column reveal_seconds set default 8,
  alter column reveal_seconds set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_answering_seconds_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_answering_seconds_check
      check (answering_seconds between 5 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_guessing_seconds_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_guessing_seconds_check
      check (guessing_seconds between 5 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_reveal_seconds_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_reveal_seconds_check
      check (reveal_seconds between 5 and 180);
  end if;
end
$$;
