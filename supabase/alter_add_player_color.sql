alter table public.players
  add column if not exists color text;

update public.players
set color = lower(coalesce(color, '#2563eb'));

alter table public.players
  alter column color set default '#2563eb',
  alter column color set not null;
