create or replace function public.sl_sanitize_team_count(p_value integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_value, 2), 2), 5);
$$;

create or replace function public.sl_sanitize_cards_per_player(p_value integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_value, 8), 3), 12);
$$;

create or replace function public.sl_sanitize_round_count(p_value integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_value, 3), 1), 5);
$$;

create or replace function public.sl_sanitize_turn_seconds(p_value integer)
returns integer
language sql
immutable
as $$
  select least(greatest(coalesce(p_value, 60), 15), 180);
$$;

create or replace function public.sl_sanitize_team_name(p_name text)
returns text
language sql
immutable
as $$
  select left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 24);
$$;

create or replace function public.sl_team_name_pool()
returns text[]
language sql
immutable
as $$
  select array[
    'Chaos Goblins',
    'Snack Bandits',
    'Oops All Clues',
    'Couch Detectives',
    'Hot Mess Express',
    'Mildly Ferocious',
    'Gremlin Energy',
    'Questionable Tactics',
    'Tiny Conspiracies',
    'Loud Whispers',
    'Blank Stares',
    'Panic Button',
    'Wildcard Noodles',
    'Suspicious Legends',
    'The Bit'
  ]::text[];
$$;

create or replace function public.sl_zero_array(p_length integer)
returns integer[]
language sql
immutable
as $$
  select coalesce(
    array_agg(0 order by idx),
    array[]::integer[]
  )
  from generate_series(1, greatest(coalesce(p_length, 0), 0)) as idx;
$$;

create or replace function public.sl_normalize_team_turn_counts(
  p_counts integer[],
  p_team_count integer
)
returns integer[]
language sql
immutable
as $$
  select coalesce(
    array_agg(
      greatest(coalesce(p_counts[idx], 0), 0)
      order by idx
    ),
    array[]::integer[]
  )
  from generate_series(1, public.sl_sanitize_team_count(p_team_count)) as idx;
$$;

create or replace function public.sl_random_team_names(
  p_team_count integer,
  p_existing_names text[] default null
)
returns text[]
language plpgsql
volatile
as $$
declare
  v_team_count integer := public.sl_sanitize_team_count(p_team_count);
  v_output text[] := array[]::text[];
  v_name text;
  v_index integer;
begin
  if p_existing_names is not null then
    foreach v_name in array p_existing_names loop
      v_name := public.sl_sanitize_team_name(v_name);
      if v_name <> '' and not (v_name = any(v_output)) then
        v_output := array_append(v_output, v_name);
        exit when cardinality(v_output) >= v_team_count;
      end if;
    end loop;
  end if;

  for v_name in
    select candidate
    from unnest(public.sl_team_name_pool()) as candidate
    where not (candidate = any(v_output))
    order by random()
  loop
    v_output := array_append(v_output, v_name);
    exit when cardinality(v_output) >= v_team_count;
  end loop;

  while cardinality(v_output) < v_team_count loop
    v_index := cardinality(v_output) + 1;
    v_output := array_append(v_output, format('Team %s', v_index));
  end loop;

  return v_output[1:v_team_count];
end;
$$;

create or replace function public.sl_calculate_draft_target(
  p_player_count integer,
  p_cards_per_player integer
)
returns integer
language sql
immutable
as $$
  select greatest(coalesce(p_player_count, 0), 0)
    * public.sl_sanitize_cards_per_player(p_cards_per_player);
$$;

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

create or replace function public.sl_clear_game_data(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sayless_room_cards where room_id = p_room_id;
  delete from public.sayless_draft_hands where room_id = p_room_id;
  delete from public.sayless_draft_rejections where room_id = p_room_id;
  delete from public.sayless_round_results where room_id = p_room_id;
end;
$$;

create or replace function public.sl_reset_player_scores(p_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.players
  set score = 0
  where room_id = p_room_id;
$$;

create or replace function public.sl_reassign_teams(
  p_room_id uuid,
  p_team_count integer,
  p_randomize boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_count integer := public.sl_sanitize_team_count(p_team_count);
begin
  if p_randomize then
    with ordered as (
      select
        id,
        row_number() over (order by random(), created_at asc, id asc) - 1 as idx
      from public.players
      where room_id = p_room_id
    )
    update public.players as player
    set team_index = mod(ordered.idx, v_team_count)
    from ordered
    where player.id = ordered.id;
  else
    with ordered as (
      select
        id,
        row_number() over (order by created_at asc, id asc) - 1 as idx
      from public.players
      where room_id = p_room_id
    )
    update public.players as player
    set team_index = mod(ordered.idx, v_team_count)
    from ordered
    where player.id = ordered.id;
  end if;
end;
$$;

create or replace function public.sl_next_team_index(
  p_room_id uuid,
  p_start_index integer
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_offset integer;
  v_team_index integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    return null;
  end if;

  for v_offset in 0..greatest(v_room.team_count - 1, 0) loop
    v_team_index := mod(greatest(coalesce(p_start_index, 0), 0) + v_offset, v_room.team_count);
    if exists (
      select 1
      from public.players
      where room_id = p_room_id
        and team_index = v_team_index
    ) then
      return v_team_index;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.sl_turn_player_id(
  p_room_id uuid,
  p_team_index integer,
  p_turn_count integer
)
returns uuid
language sql
stable
set search_path = public
as $$
  with team_players as (
    select
      id,
      row_number() over (order by created_at asc, id asc) - 1 as position,
      count(*) over () as total
    from public.players
    where room_id = p_room_id
      and team_index = p_team_index
  )
  select id
  from team_players
  where position = mod(greatest(coalesce(p_turn_count, 0), 0), total)
  limit 1;
$$;

create or replace function public.sl_lowest_score_team_index(
  p_room_id uuid,
  p_team_count integer
)
returns integer
language sql
stable
set search_path = public
as $$
  with team_slots as (
    select generate_series(0, public.sl_sanitize_team_count(p_team_count) - 1) as team_index
  ),
  team_scores as (
    select
      team_slots.team_index,
      coalesce(sum(player.score), 0) as total_score
    from team_slots
    left join public.players as player
      on player.room_id = p_room_id
      and player.team_index = team_slots.team_index
    group by team_slots.team_index
  )
  select team_index
  from team_scores
  order by total_score asc, team_index asc
  limit 1;
$$;

create or replace function public.sl_has_cleared_entire_deck(p_room_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.sayless_room_cards
    where room_id = p_room_id
  ) and not exists (
    select 1
    from public.sayless_room_cards
    where room_id = p_room_id
      and status <> 'cleared'
  );
$$;

create or replace function public.sl_pending_card_entry_id(p_room_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select id
  from public.sayless_room_cards
  where room_id = p_room_id
    and status = 'pending'
  order by sort_order asc, created_at asc, id asc
  limit 1;
$$;

create or replace function public.sl_reset_passed_cards(p_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sayless_room_cards
  set status = 'pending'
  where room_id = p_room_id
    and status = 'passed';
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
    turn_deadline_at = null
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
  set active_card_entry_id = v_next_card_id
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
    team_turn_counts = excluded.team_turn_counts;

  update public.rooms
  set
    phase = 'drafting',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_clear_active_draft_hand(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sayless_draft_hands
  where room_id = p_room_id
    and player_id = p_player_id;
$$;

create or replace function public.sl_reserve_draft_card(
  p_room_id uuid,
  p_player_id uuid,
  p_ignore_seen boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.sayless_cards%rowtype;
begin
  for v_card in
    select card.*
    from public.sayless_cards as card
    where not exists (
      select 1
      from public.sayless_room_cards as room_card
      where room_card.room_id = p_room_id
        and room_card.card_id = card.id
    )
      and not exists (
        select 1
        from public.sayless_draft_hands as hand
        where hand.room_id = p_room_id
          and hand.card_id = card.id
      )
      and (
        p_ignore_seen
        or not exists (
          select 1
          from public.sayless_draft_rejections as rejection
          where rejection.room_id = p_room_id
            and rejection.player_id = p_player_id
            and rejection.card_id = card.id
        )
      )
    order by random()
  loop
    begin
      insert into public.sayless_draft_hands (
        room_id,
        player_id,
        card_id
      )
      values (
        p_room_id,
        p_player_id,
        v_card.id
      )
      on conflict (room_id, player_id)
      do update set card_id = excluded.card_id;

      insert into public.sayless_draft_rejections (
        room_id,
        player_id,
        card_id
      )
      values (
        p_room_id,
        p_player_id,
        v_card.id
      )
      on conflict (room_id, player_id, card_id) do nothing;

      return to_jsonb(v_card);
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  return null;
end;
$$;

create or replace function public.sl_create_room(
  host_name text,
  player_color text default null,
  player_emoji text default null,
  team_count integer default null,
  cards_per_player integer default null,
  round_count integer default null,
  turn_seconds integer default null
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
    current_round_index,
    starting_team_index,
    active_team_index,
    active_player_id,
    active_card_entry_id,
    turn_deadline_at,
    team_turn_counts
  )
  values (
    v_room.id,
    v_cards_per_player,
    v_round_count,
    v_turn_seconds,
    0,
    0,
    0,
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

create or replace function public.sl_join_room(
  room_code text,
  player_name text,
  player_color text default null,
  player_emoji text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_name text := public.whd_normalize_name(player_name);
  v_color text := public.whd_normalize_color(player_color);
  v_emoji text := public.whd_normalize_emoji(player_emoji);
  v_code text := upper(btrim(coalesce(room_code, '')));
  v_team_index integer;
begin
  if v_code = '' or v_name = '' then
    raise exception 'Room code and name are required.';
  end if;

  select *
  into v_room
  from public.rooms
  where code = v_code;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.game_type <> 'sayless' then
    raise exception 'That room is for a different game.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'This room has already started.';
  end if;

  if exists (
    select 1
    from public.players
    where room_id = v_room.id
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
      on player.room_id = v_room.id
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
    v_room.id,
    v_name,
    v_color,
    v_emoji,
    v_team_index,
    false,
    0
  )
  returning * into v_player;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'player', to_jsonb(v_player)
  );
end;
$$;

create or replace function public.sl_update_team_selection(
  p_room_id uuid,
  p_player_id uuid,
  p_team_index integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_team_index integer;
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
    raise exception 'Teams can only be changed before the game starts.';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  v_team_index := least(greatest(coalesce(p_team_index, 0), 0), v_room.team_count - 1);

  update public.players
  set team_index = v_team_index
  where id = p_player_id
    and room_id = p_room_id;
end;
$$;

create or replace function public.sl_update_room_settings(
  p_room_id uuid,
  p_player_id uuid,
  p_team_count integer,
  p_cards_per_player integer,
  p_round_count integer,
  p_turn_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_team_count integer := public.sl_sanitize_team_count(p_team_count);
  v_cards_per_player integer := public.sl_sanitize_cards_per_player(p_cards_per_player);
  v_round_count integer := public.sl_sanitize_round_count(p_round_count);
  v_turn_seconds integer := public.sl_sanitize_turn_seconds(p_turn_seconds);
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

  perform public.sl_ensure_room_state(p_room_id);
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
    current_round_index,
    starting_team_index,
    active_team_index,
    active_player_id,
    active_card_entry_id,
    turn_deadline_at,
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
    team_turn_counts = excluded.team_turn_counts;
end;
$$;

create or replace function public.sl_shuffle_teams(
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
    raise exception 'Teams can only be shuffled in the lobby.';
  end if;

  perform public.sl_reassign_teams(p_room_id, v_room.team_count, true);
end;
$$;

create or replace function public.sl_update_team_name(
  p_room_id uuid,
  p_player_id uuid,
  p_next_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_next_name text := public.sl_sanitize_team_name(p_next_name);
  v_team_names text[];
begin
  if v_next_name = '' then
    raise exception 'Team name is required.';
  end if;

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

  if not found then
    raise exception 'Player not found.';
  end if;

  if v_player.team_index is null then
    raise exception 'You are not assigned to a team.';
  end if;

  v_team_names := public.sl_random_team_names(
    v_room.team_count,
    coalesce(v_room.team_names, array[]::text[])
  );
  v_team_names[v_player.team_index + 1] := v_next_name;

  update public.rooms
  set team_names = v_team_names
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_update_player_profile(
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
  v_name text := public.whd_normalize_name(p_name);
  v_color text := public.whd_normalize_color(p_color);
  v_emoji text := public.whd_normalize_emoji(p_emoji);
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_player_id
      and room_id = p_room_id
  ) then
    raise exception 'Player not found.';
  end if;

  if exists (
    select 1
    from public.players
    where room_id = p_room_id
      and id <> p_player_id
      and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already taken in this room.';
  end if;

  update public.players
  set
    name = v_name,
    color = v_color,
    emoji = v_emoji
  where id = p_player_id
    and room_id = p_room_id;
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
  v_ready_team_count integer;
  v_total_cards_needed integer;
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

  select count(*)
  into v_ready_team_count
  from (
    select distinct team_index
    from public.players
    where room_id = p_room_id
      and team_index between 0 and v_room.team_count - 1
  ) as ready_teams;

  if v_ready_team_count < v_room.team_count then
    raise exception 'Need at least one player in every team.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  select count(*) into v_player_count from public.players where room_id = p_room_id;
  v_total_cards_needed := public.sl_calculate_draft_target(
    v_player_count,
    v_state.cards_per_player
  );

  select count(*) into v_library_count from public.sayless_cards;

  if v_library_count < v_total_cards_needed then
    raise exception
      'Need % cards for this lobby, but only % are in the deck. Lower cards per player or add more cards.',
      v_total_cards_needed,
      v_library_count;
  end if;

  perform public.sl_begin_draft(p_room_id);
end;
$$;

create or replace function public.sl_get_draft_card_for_player(
  p_room_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_active_hand public.sayless_draft_hands%rowtype;
  v_card public.sayless_cards%rowtype;
  v_draft_count integer;
  v_player_count integer;
  v_target integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'drafting' then
    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
    return null;
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  select count(*)
  into v_draft_count
  from public.sayless_room_cards
  where room_id = p_room_id
    and drafted_by_player_id = p_player_id;

  if v_draft_count >= v_state.cards_per_player then
    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
    return null;
  end if;

  select count(*) into v_player_count from public.players where room_id = p_room_id;
  v_target := public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player);

  if (
    select count(*)
    from public.sayless_room_cards
    where room_id = p_room_id
  ) >= v_target then
    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
    return null;
  end if;

  select *
  into v_active_hand
  from public.sayless_draft_hands
  where room_id = p_room_id
    and player_id = p_player_id;

  if found then
    select *
    into v_card
    from public.sayless_cards
    where id = v_active_hand.card_id
      and not exists (
        select 1
        from public.sayless_room_cards
        where room_id = p_room_id
          and card_id = v_active_hand.card_id
      );

    if found then
      return to_jsonb(v_card);
    end if;

    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
  end if;

  return coalesce(
    public.sl_reserve_draft_card(p_room_id, p_player_id, false),
    public.sl_reserve_draft_card(p_room_id, p_player_id, true)
  );
end;
$$;

create or replace function public.sl_submit_draft_decision(
  p_room_id uuid,
  p_player_id uuid,
  p_card_id uuid,
  p_accept boolean
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
  v_active_hand public.sayless_draft_hands%rowtype;
  v_draft_count integer;
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
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'drafting' then
    raise exception 'Drafting is over.';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  select count(*)
  into v_draft_count
  from public.sayless_room_cards
  where room_id = p_room_id
    and drafted_by_player_id = p_player_id;

  if v_draft_count >= v_state.cards_per_player then
    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
    perform public.sl_maybe_advance_game(p_room_id);
    return;
  end if;

  select count(*) into v_player_count from public.players where room_id = p_room_id;
  v_target := public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player);

  select count(*)
  into v_room_card_count
  from public.sayless_room_cards
  where room_id = p_room_id;

  if v_room_card_count >= v_target then
    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
    perform public.sl_maybe_advance_game(p_room_id);
    return;
  end if;

  select *
  into v_active_hand
  from public.sayless_draft_hands
  where room_id = p_room_id
    and player_id = p_player_id;

  if not found or v_active_hand.card_id <> p_card_id then
    raise exception 'That draft card is no longer active. Grab the next one.';
  end if;

  if exists (
    select 1
    from public.sayless_room_cards
    where room_id = p_room_id
      and card_id = p_card_id
  ) then
    perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
    raise exception 'That card just got taken. Grab the next one.';
  end if;

  if coalesce(p_accept, false) then
    insert into public.sayless_room_cards (
      room_id,
      card_id,
      drafted_by_player_id,
      sort_order,
      status
    )
    values (
      p_room_id,
      p_card_id,
      p_player_id,
      v_room_card_count,
      'pending'
    );
  end if;

  perform public.sl_clear_active_draft_hand(p_room_id, p_player_id);
  perform public.sl_maybe_advance_game(p_room_id);
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
    turn_deadline_at = now() + make_interval(secs => v_state.turn_seconds)
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
  v_player public.players%rowtype;
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

  if v_state.active_player_id <> p_player_id then
    raise exception 'It is not your turn.';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_player.team_index is null then
    raise exception 'Player not found.';
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
    v_player.team_index,
    p_player_id,
    v_active_card.id,
    v_card.points
  );

  update public.players
  set score = score + v_card.points
  where id = p_player_id
    and room_id = p_room_id;

  perform public.sl_advance_within_turn(p_room_id);
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
    team_turn_counts = excluded.team_turn_counts;

  update public.rooms
  set
    phase = 'lobby',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

grant execute on function public.sl_create_room(text, text, text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.sl_join_room(text, text, text, text) to anon, authenticated;
grant execute on function public.sl_update_team_selection(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.sl_update_room_settings(uuid, uuid, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.sl_shuffle_teams(uuid, uuid) to anon, authenticated;
grant execute on function public.sl_update_team_name(uuid, uuid, text) to anon, authenticated;
grant execute on function public.sl_update_player_profile(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.sl_start_game(uuid, uuid) to anon, authenticated;
grant execute on function public.sl_get_draft_card_for_player(uuid, uuid) to anon, authenticated;
grant execute on function public.sl_submit_draft_decision(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.sl_start_player_turn(uuid, uuid) to anon, authenticated;
grant execute on function public.sl_submit_turn_action(uuid, uuid, text) to anon, authenticated;
grant execute on function public.sl_maybe_advance_game(uuid) to anon, authenticated;
grant execute on function public.sl_continue_from_round_summary(uuid, uuid) to anon, authenticated;
grant execute on function public.sl_play_again(uuid, uuid) to anon, authenticated;
