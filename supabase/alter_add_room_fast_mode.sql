alter table public.rooms
  add column if not exists fast_mode boolean;

update public.rooms
set
  fast_mode = coalesce(fast_mode, false);

alter table public.rooms
  alter column fast_mode set default false,
  alter column fast_mode set not null;
