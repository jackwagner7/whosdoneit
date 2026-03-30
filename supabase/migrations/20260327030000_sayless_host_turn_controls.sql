create or replace function public.sl_submit_turn_action(
  p_room_id uuid,
  p_player_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_actor public.players%rowtype;
  v_active_player public.players%rowtype;
  v_active_card public.sayless_room_cards%rowtype;
  v_card public.sayless_cards%rowtype;
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

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  if v_state.active_player_id is null then
    perform public.sl_maybe_advance_game(p_room_id);
    return;
  end if;

  if v_state.active_player_id <> p_player_id and v_actor.is_host <> true then
    raise exception 'It is not your turn.';
  end if;

  select *
  into v_active_player
  from public.players
  where id = v_state.active_player_id
    and room_id = p_room_id;

  if not found or v_active_player.team_index is null then
    raise exception 'Active player not found.';
  end if;

  if v_state.active_card_entry_id is null then
    perform public.sl_maybe_advance_game(p_room_id);
    return;
  end if;

  select *
  into v_active_card
  from public.sayless_room_cards
  where id = v_state.active_card_entry_id
    and room_id = p_room_id;

  if not found then
    perform public.sl_maybe_advance_game(p_room_id);
    return;
  end if;

  if v_active_card.status = 'cleared' then
    raise exception 'Wait for the next card.';
  end if;

  if p_action = 'pass' then
    update public.sayless_room_cards
    set status = 'passed'
    where id = v_active_card.id
      and room_id = p_room_id;

    perform public.sl_advance_within_turn(p_room_id);
    return;
  end if;

  if p_action <> 'correct' then
    raise exception 'Invalid turn action.';
  end if;

  select *
  into v_card
  from public.sayless_cards
  where id = v_active_card.card_id;

  update public.sayless_room_cards
  set status = 'cleared'
  where id = v_active_card.id
    and room_id = p_room_id;

  insert into public.sayless_round_results (
    room_id,
    round_index,
    team_index,
    player_id,
    card_entry_id,
    points
  )
  values (
    p_room_id,
    v_state.current_round_index,
    v_active_player.team_index,
    v_active_player.id,
    v_active_card.id,
    v_card.points
  );

  update public.players
  set score = score + v_card.points
  where id = v_active_player.id
    and room_id = p_room_id;

  perform public.sl_advance_within_turn(p_room_id);
end;
$$;
