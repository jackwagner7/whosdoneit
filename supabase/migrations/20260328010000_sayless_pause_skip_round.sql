alter table public.sayless_room_state
  add column if not exists paused_turn_seconds_remaining integer;

alter table public.sayless_room_state
  drop constraint if exists sayless_room_state_paused_turn_seconds_remaining_check;

alter table public.sayless_room_state
  add constraint sayless_room_state_paused_turn_seconds_remaining_check
  check (
    paused_turn_seconds_remaining is null
    or paused_turn_seconds_remaining between 0 and 180
  );

create or replace function public.sl_ensure_room_state(p_room_id uuid)
returns public.sayless_room_state
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
    8,
    3,
    60,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    public.sl_zero_array(v_room.team_count)
  )
  on conflict (room_id) do nothing;

  select *
  into v_state
  from public.sayless_room_state
  where room_id = p_room_id;

  return v_state;
end;
$$;

create or replace function public.sl_finish_round(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sl_ensure_room_state(p_room_id);

  update public.sayless_room_state
  set
    active_player_id = null,
    active_card_entry_id = null,
    turn_deadline_at = null,
    paused_turn_seconds_remaining = null
  where room_id = p_room_id;

  update public.rooms
  set
    phase = 'round_summary',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_start_playing_turn(
  p_room_id uuid,
  p_current_round_index integer default null,
  p_starting_team_index integer default null,
  p_team_turn_counts integer[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_round_index integer;
  v_starting_team_index integer;
  v_team_turn_counts integer[];
  v_next_team_index integer;
  v_next_player_id uuid;
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
  v_round_index := greatest(coalesce(p_current_round_index, v_state.current_round_index), 0);
  v_starting_team_index := least(
    greatest(coalesce(p_starting_team_index, v_state.starting_team_index), 0),
    v_room.team_count - 1
  );
  v_team_turn_counts := public.sl_normalize_team_turn_counts(
    coalesce(p_team_turn_counts, v_state.team_turn_counts),
    v_room.team_count
  );
  v_next_team_index := public.sl_next_team_index(p_room_id, v_starting_team_index);

  if v_next_team_index is null then
    raise exception 'Need at least one player in a team to play.';
  end if;

  v_next_player_id := public.sl_turn_player_id(
    p_room_id,
    v_next_team_index,
    coalesce(v_team_turn_counts[v_next_team_index + 1], 0)
  );

  if v_next_player_id is null then
    raise exception 'Could not determine the next active player.';
  end if;

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
    v_round_index,
    v_starting_team_index,
    v_next_team_index,
    v_next_player_id,
    null,
    null,
    null,
    v_team_turn_counts
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

  update public.rooms
  set
    phase = 'playing',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_advance_within_turn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_card_id uuid;
begin
  if public.sl_has_cleared_entire_deck(p_room_id) then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  v_next_card_id := public.sl_pending_card_entry_id(p_room_id);
  if v_next_card_id is null then
    perform public.sl_reset_passed_cards(p_room_id);
    v_next_card_id := public.sl_pending_card_entry_id(p_room_id);
  end if;

  if v_next_card_id is null then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  perform public.sl_ensure_room_state(p_room_id);

  update public.sayless_room_state
  set
    active_card_entry_id = v_next_card_id,
    paused_turn_seconds_remaining = null
  where room_id = p_room_id;

  update public.rooms
  set phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
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

  update public.rooms
  set
    phase = 'drafting',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
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

  v_next_card_id := public.sl_pending_card_entry_id(p_room_id);
  if v_next_card_id is null then
    perform public.sl_reset_passed_cards(p_room_id);
    v_next_card_id := public.sl_pending_card_entry_id(p_room_id);
  end if;

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

  if v_state.paused_turn_seconds_remaining is not null then
    raise exception 'Turn is paused.';
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

create or replace function public.sl_continue_from_round_summary(
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
  v_player public.players%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_next_round_index integer;
  v_next_starting_team_index integer;
  v_team_turn_counts integer[];
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_player.is_host <> true then
    raise exception 'Only the room creator can do that.';
  end if;

  if v_room.phase <> 'round_summary' then
    raise exception 'Round summary is not active.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  if v_state.current_round_index + 1 >= v_state.round_count then
    update public.rooms
    set
      phase = 'finished',
      phase_deadline_at = null
    where id = p_room_id
      and game_type = 'sayless';
    return;
  end if;

  v_next_round_index := v_state.current_round_index + 1;
  v_next_starting_team_index := public.sl_lowest_score_team_index(
    p_room_id,
    v_room.team_count
  );
  v_team_turn_counts := public.sl_zero_array(v_room.team_count);

  update public.sayless_room_cards
  set status = 'pending'
  where room_id = p_room_id;

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
    v_next_round_index,
    v_next_starting_team_index,
    v_next_starting_team_index,
    null,
    null,
    null,
    null,
    v_team_turn_counts
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

  perform public.sl_start_playing_turn(
    p_room_id,
    v_next_round_index,
    v_next_starting_team_index,
    v_team_turn_counts
  );
end;
$$;

create or replace function public.sl_play_again(
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
  v_player public.players%rowtype;
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

  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_player.is_host <> true then
    raise exception 'Only the room creator can do that.';
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

  update public.rooms
  set
    phase = 'lobby',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_toggle_turn_pause(
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
  v_actor public.players%rowtype;
  v_remaining integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'playing' then
    raise exception 'It is not an active round.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  if v_state.active_player_id is null or v_state.active_card_entry_id is null then
    raise exception 'No active turn to control.';
  end if;

  if v_state.active_player_id <> p_player_id and v_actor.is_host <> true then
    raise exception 'It is not your turn.';
  end if;

  if v_state.paused_turn_seconds_remaining is not null then
    if v_state.paused_turn_seconds_remaining <= 0 then
      perform public.sl_advance_to_next_turn(p_room_id);
      return;
    end if;

    update public.sayless_room_state
    set
      turn_deadline_at = now() + make_interval(secs => greatest(v_state.paused_turn_seconds_remaining, 1)),
      paused_turn_seconds_remaining = null
    where room_id = p_room_id;

    return;
  end if;

  if v_state.turn_deadline_at is null then
    raise exception 'Turn is not running.';
  end if;

  v_remaining := greatest(
    0,
    ceil(extract(epoch from (v_state.turn_deadline_at - now())))
  )::integer;

  update public.sayless_room_state
  set
    turn_deadline_at = null,
    paused_turn_seconds_remaining = v_remaining
  where room_id = p_room_id;
end;
$$;

create or replace function public.sl_skip_round(
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
  v_actor public.players%rowtype;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'playing' then
    raise exception 'It is not an active round.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  if v_state.active_player_id is null then
    raise exception 'No active turn to control.';
  end if;

  if v_state.active_player_id <> p_player_id and v_actor.is_host <> true then
    raise exception 'It is not your turn.';
  end if;

  perform public.sl_finish_round(p_room_id);
end;
$$;

create or replace function public.sl_drive_active_test_bot_turn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_active_player public.players%rowtype;
  v_action text;
  v_action_count integer;
  v_action_index integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found or v_room.phase <> 'playing' then
    return;
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  if v_state.active_player_id is null then
    return;
  end if;

  select *
  into v_active_player
  from public.players
  where id = v_state.active_player_id
    and room_id = p_room_id;

  if not found or not public.sl_is_test_bot_name(v_active_player.name) then
    return;
  end if;

  if v_state.paused_turn_seconds_remaining is not null then
    return;
  end if;

  if v_state.turn_deadline_at is null then
    perform public.sl_start_player_turn(p_room_id, v_active_player.id);
  end if;

  v_action_count := 2 + floor(random() * 4)::integer;

  for v_action_index in 1..v_action_count loop
    select *
    into v_room
    from public.rooms
    where id = p_room_id
      and game_type = 'sayless';

    exit when not found or v_room.phase <> 'playing';

    v_state := public.sl_ensure_room_state(p_room_id);
    exit when
      v_state.active_player_id is null
      or v_state.active_card_entry_id is null
      or v_state.paused_turn_seconds_remaining is not null;

    select *
    into v_active_player
    from public.players
    where id = v_state.active_player_id
      and room_id = p_room_id;

    exit when not found or not public.sl_is_test_bot_name(v_active_player.name);

    v_action := case
      when random() < 0.72 then 'correct'
      else 'pass'
    end;

    begin
      perform public.sl_submit_turn_action(p_room_id, v_active_player.id, v_action);
    exception
      when others then
        exit;
    end;
  end loop;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found or v_room.phase <> 'playing' then
    return;
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  if
    v_state.active_player_id is null
    or v_state.turn_deadline_at is null
    or v_state.paused_turn_seconds_remaining is not null
  then
    return;
  end if;

  select *
  into v_active_player
  from public.players
  where id = v_state.active_player_id
    and room_id = p_room_id;

  if found and public.sl_is_test_bot_name(v_active_player.name) then
    perform public.sl_advance_to_next_turn(p_room_id);
  end if;
end;
$$;

grant execute on function public.sl_toggle_turn_pause(uuid, uuid) to anon, authenticated;
grant execute on function public.sl_skip_round(uuid, uuid) to anon, authenticated;
