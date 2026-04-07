alter table public.rooms
  drop constraint if exists rooms_team_count_check;

alter table public.rooms
  add constraint rooms_team_count_check
  check (team_count between 1 and 5);

alter table public.sayless_room_state
  add column if not exists draft_mode text not null default 'manual',
  add column if not exists host_phone_only boolean not null default false;

alter table public.sayless_room_state
  drop constraint if exists sayless_room_state_draft_mode_check;

alter table public.sayless_room_state
  add constraint sayless_room_state_draft_mode_check
  check (draft_mode in ('manual', 'autodraft', 'draftless'));

create or replace function public.sl_sanitize_team_count(p_value integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_value, 2), 1), 5);
$$;

create or replace function public.sl_sanitize_draft_mode(p_value text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(btrim(lower(p_value)), '') in ('manual', 'autodraft', 'draftless')
      then btrim(lower(p_value))
    else 'manual'
  end;
$$;

create or replace function public.sl_round_turns_complete(
  p_room_id uuid,
  p_team_turn_counts integer[]
)
returns boolean
language sql
stable
set search_path = public
as $$
  with room_data as (
    select team_count
    from public.rooms
    where id = p_room_id
      and game_type = 'sayless'
  ),
  team_slots as (
    select generate_series(0, greatest((select team_count from room_data) - 1, 0)) as team_index
  ),
  team_player_counts as (
    select
      team_slots.team_index,
      count(player.id) as player_count
    from team_slots
    left join public.players as player
      on player.room_id = p_room_id
     and player.team_index = team_slots.team_index
    group by team_slots.team_index
  )
  select coalesce(
    bool_and(coalesce(p_team_turn_counts[team_index + 1], 0) >= player_count),
    false
  )
  from team_player_counts
  where player_count > 0;
$$;

create or replace function public.sl_populate_random_room_cards(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.sayless_room_state%rowtype;
  v_player_ids uuid[];
  v_fallback_player_id uuid;
  v_player_count integer;
  v_target integer;
begin
  v_state := public.sl_ensure_room_state(p_room_id);

  select array_agg(id order by created_at asc, id asc), count(*)
  into v_player_ids, v_player_count
  from public.players
  where room_id = p_room_id;

  v_target := public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player);
  if v_target <= 0 then
    return;
  end if;

  v_fallback_player_id := v_player_ids[1];

  insert into public.sayless_room_cards (
    room_id,
    card_id,
    drafted_by_player_id,
    sort_order,
    status
  )
  select
    p_room_id,
    card_id,
    coalesce(
      v_player_ids[((selection.sort_order % greatest(cardinality(v_player_ids), 1)) + 1)],
      v_fallback_player_id
    ),
    selection.sort_order,
    'pending'
  from (
    select
      id as card_id,
      row_number() over (order by random(), id asc) - 1 as sort_order
    from public.sayless_cards
    order by random(), id asc
    limit v_target
  ) as selection;
end;
$$;

drop function if exists public.sl_create_room(text, text, text, integer, integer, integer, integer);

create or replace function public.sl_create_room(
  host_name text,
  player_color text default null,
  player_emoji text default null,
  team_count integer default null,
  cards_per_player integer default null,
  round_count integer default null,
  turn_seconds integer default null,
  draft_mode text default null,
  host_phone_only boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_name text := public.whd_normalize_name(host_name);
  v_color text := public.whd_normalize_color(player_color);
  v_emoji text := public.whd_normalize_emoji(player_emoji);
  v_team_count integer := public.sl_sanitize_team_count(team_count);
  v_cards_per_player integer := public.sl_sanitize_cards_per_player(cards_per_player);
  v_round_count integer := public.sl_sanitize_round_count(round_count);
  v_turn_seconds integer := public.sl_sanitize_turn_seconds(turn_seconds);
  v_draft_mode text := public.sl_sanitize_draft_mode(draft_mode);
  v_host_phone_only boolean := coalesce(host_phone_only, false);
  v_code text;
  v_attempt integer := 0;
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;

  while v_attempt < 12 loop
    v_attempt := v_attempt + 1;
    v_code := public.whd_random_room_code(4);

    begin
      insert into public.rooms (
        code,
        game_type,
        phase,
        team_count,
        team_names
      )
      values (
        v_code,
        'sayless',
        'lobby',
        v_team_count,
        public.sl_random_team_names(v_team_count)
      )
      returning * into v_room;

      exit;
    exception
      when unique_violation then
        if v_attempt >= 12 then
          raise exception 'Could not generate a unique room code.';
        end if;
    end;
  end loop;

  insert into public.players (
    room_id,
    name,
    color,
    emoji,
    team_index,
    is_host,
    score
  )
  values (
    v_room.id,
    v_name,
    v_color,
    v_emoji,
    0,
    true,
    0
  )
  returning * into v_player;

  insert into public.sayless_room_state (
    room_id,
    cards_per_player,
    round_count,
    turn_seconds,
    draft_mode,
    host_phone_only,
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
    v_room.id,
    v_cards_per_player,
    v_round_count,
    v_turn_seconds,
    v_draft_mode,
    v_host_phone_only,
    0,
    0,
    0,
    null,
    null,
    null,
    null,
    public.sl_zero_array(v_room.team_count)
  );

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'player', to_jsonb(v_player)
  );
end;
$$;

drop function if exists public.sl_update_room_settings(uuid, uuid, integer, integer, integer, integer);

create or replace function public.sl_update_room_settings(
  p_room_id uuid,
  p_player_id uuid,
  p_team_count integer,
  p_cards_per_player integer,
  p_round_count integer,
  p_turn_seconds integer,
  p_draft_mode text default null,
  p_host_phone_only boolean default null
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
  v_team_count integer := public.sl_sanitize_team_count(p_team_count);
  v_cards_per_player integer := public.sl_sanitize_cards_per_player(p_cards_per_player);
  v_round_count integer := public.sl_sanitize_round_count(p_round_count);
  v_turn_seconds integer := public.sl_sanitize_turn_seconds(p_turn_seconds);
  v_draft_mode text;
  v_host_phone_only boolean;
  v_team_names text[];
begin
  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_player.is_host <> true then
    raise exception 'Only the room creator can do that.';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'Settings can only be changed in the lobby.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);
  v_draft_mode := public.sl_sanitize_draft_mode(coalesce(p_draft_mode, v_state.draft_mode));
  v_host_phone_only := coalesce(p_host_phone_only, v_state.host_phone_only, false);

  v_team_names := public.sl_random_team_names(
    v_team_count,
    coalesce(v_room.team_names[1:v_team_count], array[]::text[])
  );

  update public.rooms
  set
    team_count = v_team_count,
    team_names = v_team_names
  where id = p_room_id
    and game_type = 'sayless';

  perform public.sl_reassign_teams(p_room_id, v_team_count, false);

  insert into public.sayless_room_state (
    room_id,
    cards_per_player,
    round_count,
    turn_seconds,
    draft_mode,
    host_phone_only,
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
    v_draft_mode,
    v_host_phone_only,
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
    draft_mode = excluded.draft_mode,
    host_phone_only = excluded.host_phone_only,
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

drop function if exists public.whd_switch_room_to_sayless(uuid, uuid, integer, integer, integer, integer);

create or replace function public.whd_switch_room_to_sayless(
  p_room_id uuid,
  p_player_id uuid,
  p_team_count integer default null,
  p_cards_per_player integer default null,
  p_round_count integer default null,
  p_turn_seconds integer default null,
  p_draft_mode text default null,
  p_host_phone_only boolean default null
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
  v_draft_mode text := public.sl_sanitize_draft_mode(p_draft_mode);
  v_host_phone_only boolean := coalesce(p_host_phone_only, false);
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
    draft_mode,
    host_phone_only,
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
    v_draft_mode,
    v_host_phone_only,
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
    draft_mode = excluded.draft_mode,
    host_phone_only = excluded.host_phone_only,
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

create or replace function public.sl_host_add_player(
  p_room_id uuid,
  p_player_id uuid,
  p_name text,
  p_color text,
  p_emoji text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_actor public.players%rowtype;
  v_name text := public.whd_normalize_name(p_name);
  v_color text := public.whd_normalize_color(p_color);
  v_emoji text := public.whd_normalize_emoji(p_emoji);
  v_team_index integer;
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'Players can only be added in the lobby.';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_actor.is_host <> true then
    raise exception 'Only the room creator can do that.';
  end if;

  if exists (
    select 1
    from public.players
    where room_id = p_room_id
      and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already taken in this room.';
  end if;

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
  select team_index
  into v_team_index
  from team_counts
  order by player_count asc, team_index asc
  limit 1;

  insert into public.players (
    room_id,
    name,
    color,
    emoji,
    team_index,
    is_host,
    score
  )
  values (
    p_room_id,
    v_name,
    v_color,
    v_emoji,
    coalesce(v_team_index, 0),
    false,
    0
  );
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

  select count(*) into v_library_count from public.sayless_cards;
  if v_library_count < public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player) then
    raise exception
      'Need % cards for this lobby, but only % are in the deck. Lower cards per player or add more cards.',
      public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player),
      v_library_count;
  end if;

  if v_state.draft_mode = 'manual' then
    perform public.sl_begin_draft(p_room_id);
    return;
  end if;

  perform public.sl_clear_game_data(p_room_id);
  perform public.sl_reset_player_scores(p_room_id);
  perform public.sl_populate_random_room_cards(p_room_id);
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

  if not (
    v_state.active_player_id = p_player_id
    or (v_state.host_phone_only = true and v_actor.is_host = true)
  ) then
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

  if public.sl_has_cleared_entire_deck(p_room_id) then
    perform public.sl_finish_round(p_room_id);
    return;
  end if;

  perform public.sl_reset_passed_cards(p_room_id);

  v_state := public.sl_ensure_room_state(p_room_id);
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

create or replace function public.sl_maybe_advance_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_player_count integer;
  v_target integer;
  v_room_card_count integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    return;
  end if;

  if v_room.phase = 'playing' then
    v_state := public.sl_ensure_room_state(p_room_id);
    if v_state.turn_deadline_at is not null and v_state.turn_deadline_at <= now() then
      perform public.sl_advance_to_next_turn(p_room_id);
    end if;
    return;
  end if;

  if v_room.phase <> 'drafting' then
    return;
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);
  select count(*) into v_player_count from public.players where room_id = p_room_id;
  v_target := public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player);
  select count(*) into v_room_card_count from public.sayless_room_cards where room_id = p_room_id;

  if v_room_card_count >= v_target and v_target > 0 then
    perform public.sl_start_playing_turn(
      p_room_id,
      0,
      0,
      public.sl_zero_array(v_room.team_count)
    );
  end if;
end;
$$;

grant execute on function public.sl_create_room(text, text, text, integer, integer, integer, integer, text, boolean) to anon, authenticated;
grant execute on function public.sl_update_room_settings(uuid, uuid, integer, integer, integer, integer, text, boolean) to anon, authenticated;
grant execute on function public.whd_switch_room_to_sayless(uuid, uuid, integer, integer, integer, integer, text, boolean) to anon, authenticated;
grant execute on function public.sl_host_add_player(uuid, uuid, text, text, text) to anon, authenticated;
