alter table public.players
  add column if not exists emoji text;

update public.players
set emoji = coalesce(emoji, '🙂');

alter table public.players
  alter column emoji set default '🙂',
  alter column emoji set not null;
