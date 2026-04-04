create or replace function public.whd_clear_game_data(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.prompts where room_id = p_room_id;
  delete from public.confessions where room_id = p_room_id;
  delete from public.guesses where room_id = p_room_id;
end;
$$;

create or replace function public.whd_switch_room_to_sayless(
  p_room_id uuid,
  p_player_id uuid,
  p_team_count integer default null,
  p_cards_per_player integer default null,
  p_round_count integer default null,
  p_turn_seconds integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_actor public.players%rowtype;
  v_team_count integer := public.sl_sanitize_team_count(p_team_count);
  v_cards_per_player integer := public.sl_sanitize_cards_per_player(p_cards_per_player);
  v_round_count integer := public.sl_sanitize_round_count(p_round_count);
  v_turn_seconds integer := public.sl_sanitize_turn_seconds(p_turn_seconds);
  v_team_names text[];
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'whosdoneit';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'Game switching is only available in lobby.';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_actor.is_host <> true then
    raise exception 'Only the room creator can switch games.';
  end if;

  perform public.whd_clear_game_data(p_room_id);
  perform public.sl_clear_game_data(p_room_id);
  delete from public.sayless_room_state where room_id = p_room_id;

  update public.players
  set score = 0
  where room_id = p_room_id;

  v_team_names := public.sl_random_team_names(
    v_team_count,
    coalesce(v_room.team_names, array[]::text[])
  );

  update public.rooms
  set
    game_type = 'sayless',
    phase = 'lobby',
    team_count = v_team_count,
    team_names = v_team_names,
    current_prompt_index = 0,
    reveal_player_index = 0,
    reveal_truth_visible = false,
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'whosdoneit';

  perform public.sl_reassign_teams(p_room_id, v_team_count, false);

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
    v_cards_per_player,
    v_round_count,
    v_turn_seconds,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    public.sl_zero_array(v_team_count)
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
end;
$$;

create or replace function public.sl_switch_room_to_whd(
  p_room_id uuid,
  p_player_id uuid,
  p_prompt_seconds integer default null,
  p_round_count integer default null,
  p_answering_seconds integer default null,
  p_guessing_seconds integer default null,
  p_reveal_seconds integer default null,
  p_fast_mode boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_actor public.players%rowtype;
  v_prompt_seconds integer := least(greatest(coalesce(p_prompt_seconds, 150), 5), 180);
  v_round_count integer := least(greatest(coalesce(p_round_count, 1), 1), 10);
  v_answering_seconds integer := least(greatest(coalesce(p_answering_seconds, 25), 5), 180);
  v_guessing_seconds integer := least(greatest(coalesce(p_guessing_seconds, 35), 5), 180);
  v_reveal_seconds integer := least(greatest(coalesce(p_reveal_seconds, 8), 5), 180);
  v_fast_mode boolean := coalesce(p_fast_mode, false);
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'Game switching is only available in lobby.';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_actor.is_host <> true then
    raise exception 'Only the room creator can switch games.';
  end if;

  perform public.sl_clear_game_data(p_room_id);
  delete from public.sayless_room_state where room_id = p_room_id;
  perform public.whd_clear_game_data(p_room_id);

  update public.players
  set
    score = 0,
    team_index = null
  where room_id = p_room_id;

  update public.rooms
  set
    game_type = 'whosdoneit',
    phase = 'lobby',
    team_count = 2,
    team_names = array[]::text[],
    current_prompt_index = 0,
    reveal_player_index = 0,
    reveal_truth_visible = false,
    phase_deadline_at = null,
    prompt_seconds = v_prompt_seconds,
    round_count = v_round_count,
    answering_seconds = v_answering_seconds,
    guessing_seconds = v_guessing_seconds,
    reveal_seconds = v_reveal_seconds,
    fast_mode = v_fast_mode
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

grant execute on function public.whd_clear_game_data(uuid) to anon, authenticated;
grant execute on function public.whd_switch_room_to_sayless(uuid, uuid, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.sl_switch_room_to_whd(uuid, uuid, integer, integer, integer, integer, integer, boolean) to anon, authenticated;
