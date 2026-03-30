create or replace function public.sl_shuffle_uncleared_room_cards(p_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with shuffled as (
    select
      id,
      row_number() over (order by random(), created_at asc, id asc) - 1 as next_sort_order
    from public.sayless_room_cards
    where room_id = p_room_id
      and status <> 'cleared'
  )
  update public.sayless_room_cards as room_card
  set sort_order = shuffled.next_sort_order
  from shuffled
  where room_card.id = shuffled.id;
$$;

create or replace function public.sl_start_player_turn(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_next_card_id uuid;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  if v_room.phase <> 'playing' then
    raise exception 'It is not an active round.';
  end if;

  if v_state.active_player_id <> p_player_id then
    raise exception 'It is not your turn.';
  end if;

  if v_state.paused_turn_seconds_remaining is not null then
    raise exception 'This turn is paused.';
  end if;

  if v_state.turn_deadline_at is not null then
    raise exception 'This turn has already started.';
  end if;

  if public.sl_has_cleared_entire_deck(p_room_id) then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  perform public.sl_reset_passed_cards(p_room_id);
  perform public.sl_shuffle_uncleared_room_cards(p_room_id);

  v_next_card_id := public.sl_pending_card_entry_id(p_room_id);
  if v_next_card_id is null then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  update public.sayless_room_state
  set
    active_card_entry_id = v_next_card_id,
    turn_deadline_at = now() + make_interval(secs => v_state.turn_seconds),
    paused_turn_seconds_remaining = null
  where room_id = p_room_id;
end;
$$;
