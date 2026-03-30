create or replace function public.sl_clear_game_data(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sayless_room_cards where room_id = p_room_id;
  delete from public.sayless_draft_hands where room_id = p_room_id;
  delete from public.sayless_draft_deck where room_id = p_room_id;
  delete from public.sayless_draft_rejections where room_id = p_room_id;
  delete from public.sayless_round_results where room_id = p_room_id;
end;
$$;

create or replace function public.sl_begin_draft(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
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

  perform public.sl_clear_game_data(p_room_id);
  perform public.sl_reset_player_scores(p_room_id);

  insert into public.sayless_room_state (
    room_id,
    cards_per_player,
    round_count,
    turn_seconds,
    current_round_index,
    starting_team_index,
    active_team_index,
    active_player_id,
    active_card_entry_id,
    turn_deadline_at,
    paused_turn_seconds_remaining,
    team_turn_counts
  )
  values (
    p_room_id,
    v_state.cards_per_player,
    v_state.round_count,
    v_state.turn_seconds,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    public.sl_zero_array(v_room.team_count)
  )
  on conflict (room_id) do update
  set
    cards_per_player = excluded.cards_per_player,
    round_count = excluded.round_count,
    turn_seconds = excluded.turn_seconds,
    current_round_index = excluded.current_round_index,
    starting_team_index = excluded.starting_team_index,
    active_team_index = excluded.active_team_index,
    active_player_id = excluded.active_player_id,
    active_card_entry_id = excluded.active_card_entry_id,
    turn_deadline_at = excluded.turn_deadline_at,
    paused_turn_seconds_remaining = excluded.paused_turn_seconds_remaining,
    team_turn_counts = excluded.team_turn_counts;

  insert into public.sayless_draft_deck (
    room_id,
    card_id,
    deck_position
  )
  select
    p_room_id,
    card.id,
    row_number() over (order by random(), card.id) - 1
  from public.sayless_cards as card;

  update public.rooms
  set
    phase = 'drafting',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;
