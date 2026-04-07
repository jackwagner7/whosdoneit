create or replace function public.sl_sanitize_cards_per_player(p_value integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_value, 8), 3), 20);
$$;

alter table public.sayless_room_state
  drop constraint if exists sayless_room_state_cards_per_player_check;

alter table public.sayless_room_state
  add constraint sayless_room_state_cards_per_player_check
  check (cards_per_player between 3 and 20);
