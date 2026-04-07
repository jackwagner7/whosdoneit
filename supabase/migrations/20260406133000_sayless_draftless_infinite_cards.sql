alter table public.sayless_room_cards
  drop constraint if exists sayless_room_cards_room_card_unique;

create or replace function public.sl_create_random_turn_card(
  p_room_id uuid,
  p_player_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  v_entry_id uuid;
  v_owner_id uuid;
  v_next_sort_order integer;
begin
  select id
  into v_card_id
  from public.sayless_cards
  order by random(), id asc
  limit 1;

  if v_card_id is null then
    raise exception 'No Say Less cards are available.';
  end if;

  select coalesce(max(sort_order), -1) + 1
  into v_next_sort_order
  from public.sayless_room_cards
  where room_id = p_room_id;

  select coalesce(
    p_player_id,
    (
      select active_player_id
      from public.sayless_room_state
      where room_id = p_room_id
    ),
    (
      select id
      from public.players
      where room_id = p_room_id
      order by created_at asc, id asc
      limit 1
    )
  )
  into v_owner_id;

  if v_owner_id is null then
    raise exception 'Could not determine a player for this room.';
  end if;

  insert into public.sayless_room_cards (
    room_id,
    card_id,
    drafted_by_player_id,
    sort_order,
    status
  )
  values (
    p_room_id,
    v_card_id,
    v_owner_id,
    v_next_sort_order,
    'pending'
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.sl_start_game(
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
  v_player_count integer;
  v_library_count integer;
  v_required_cards integer;
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

  if v_room.phase <> 'lobby' then
    raise exception 'The game has already started.';
  end if;

  select count(*) into v_player_count from public.players where room_id = p_room_id;

  if v_room.team_count = 1 then
    if v_player_count < 1 then
      raise exception 'Need at least one player to start.';
    end if;
  else
    if exists (
      with team_slots as (
        select generate_series(0, v_room.team_count - 1) as team_index
      ),
      team_counts as (
        select
          team_slots.team_index,
          count(player.id) as player_count
        from team_slots
        left join public.players as player
          on player.room_id = p_room_id
         and player.team_index = team_slots.team_index
        group by team_slots.team_index
      )
      select 1
      from team_counts
      where player_count < 2
    ) then
      raise exception 'Need at least two players in every team.';
    end if;
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);
  v_required_cards := case
    when v_state.draft_mode = 'draftless' then 1
    else public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player)
  end;

  select count(*) into v_library_count from public.sayless_cards;
  if v_library_count < v_required_cards then
    if v_state.draft_mode = 'draftless' then
      raise exception 'Need at least one Say Less card before starting draftless mode.';
    end if;

    raise exception
      'Need % cards for this lobby, but only % are in the deck. Lower cards per player or add more cards.',
      v_required_cards,
      v_library_count;
  end if;

  if v_state.draft_mode = 'manual' then
    perform public.sl_begin_draft(p_room_id);
    return;
  end if;

  perform public.sl_clear_game_data(p_room_id);
  perform public.sl_reset_player_scores(p_room_id);

  if v_state.draft_mode = 'autodraft' then
    perform public.sl_populate_random_room_cards(p_room_id);
  end if;

  perform public.sl_start_playing_turn(
    p_room_id,
    0,
    0,
    public.sl_zero_array(v_room.team_count)
  );
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
  v_actor public.players%rowtype;
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

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  if not (
    v_state.active_player_id = p_player_id
    or (v_state.host_phone_only = true and v_actor.is_host = true)
  ) then
    raise exception 'It is not your turn.';
  end if;

  if v_state.paused_turn_seconds_remaining is not null then
    raise exception 'This turn is paused.';
  end if;

  if v_state.turn_deadline_at is not null then
    raise exception 'This turn has already started.';
  end if;

  if v_state.draft_mode = 'draftless' then
    v_next_card_id := public.sl_create_random_turn_card(p_room_id, v_state.active_player_id);
  else
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
  end if;

  update public.sayless_room_state
  set
    active_card_entry_id = v_next_card_id,
    turn_deadline_at = now() + make_interval(secs => v_state.turn_seconds),
    paused_turn_seconds_remaining = null
  where room_id = p_room_id;
end;
$$;

create or replace function public.sl_advance_within_turn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.sayless_room_state%rowtype;
  v_next_card_id uuid;
begin
  v_state := public.sl_ensure_room_state(p_room_id);

  if v_state.draft_mode = 'draftless' then
    v_next_card_id := public.sl_create_random_turn_card(p_room_id, v_state.active_player_id);

    update public.sayless_room_state
    set
      active_card_entry_id = v_next_card_id,
      paused_turn_seconds_remaining = null
    where room_id = p_room_id;

    update public.rooms
    set phase_deadline_at = null
    where id = p_room_id
      and game_type = 'sayless';

    return;
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
    paused_turn_seconds_remaining = null
  where room_id = p_room_id;

  update public.rooms
  set phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_advance_to_next_turn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_team_turn_counts integer[];
  v_next_team_index integer;
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

  if v_state.draft_mode <> 'draftless' and public.sl_has_cleared_entire_deck(p_room_id) then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  if v_state.draft_mode <> 'draftless' then
    perform public.sl_reset_passed_cards(p_room_id);
  end if;

  v_team_turn_counts := public.sl_normalize_team_turn_counts(
    v_state.team_turn_counts,
    v_room.team_count
  );
  v_team_turn_counts[v_state.active_team_index + 1] :=
    coalesce(v_team_turn_counts[v_state.active_team_index + 1], 0) + 1;

  if v_state.draft_mode = 'draftless'
    and public.sl_round_turns_complete(p_room_id, v_team_turn_counts) then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  v_next_team_index := public.sl_next_team_index(p_room_id, v_state.active_team_index + 1);

  if v_next_team_index is null then
    raise exception 'Could not find the next team.';
  end if;

  perform public.sl_start_playing_turn(
    p_room_id,
    v_state.current_round_index,
    v_next_team_index,
    v_team_turn_counts
  );
end;
$$;

notify pgrst, 'reload schema';
