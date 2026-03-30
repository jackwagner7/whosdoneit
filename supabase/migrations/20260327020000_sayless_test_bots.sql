create or replace function public.sl_is_test_bot_name(p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_name, '') ~ '^Test Bot [0-9]+$';
$$;

create or replace function public.sl_add_test_bots(
  p_room_id uuid,
  p_player_id uuid,
  p_count integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_host public.players%rowtype;
  v_available_colors text[];
  v_create_count integer;
  v_next_bot_number integer := 1;
  v_bot_name text;
  v_team_index integer;
  v_index integer;
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
  into v_host
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_host.is_host <> true then
    raise exception 'Only the room creator can add fake players.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'Fake users can only be added in lobby.';
  end if;

  select coalesce(array_agg(palette_color order by random()), array[]::text[])
  into v_available_colors
  from unnest(public.whd_color_pool()) as palette_color
  where not exists (
    select 1
    from public.players
    where room_id = p_room_id
      and lower(color) = lower(palette_color)
  );

  v_create_count := least(
    greatest(coalesce(p_count, 0), 0),
    coalesce(array_length(v_available_colors, 1), 0),
    20
  );

  if v_create_count <= 0 then
    raise exception 'No colors available for additional fake players.';
  end if;

  for v_index in 1..v_create_count loop
    loop
      v_bot_name := format('Test Bot %s', v_next_bot_number);
      exit when not exists (
        select 1
        from public.players
        where room_id = p_room_id
          and lower(name) = lower(v_bot_name)
      );
      v_next_bot_number := v_next_bot_number + 1;
    end loop;

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
      v_bot_name,
      v_available_colors[v_index],
      public.whd_default_player_emoji(),
      v_team_index,
      false,
      0
    );

    v_next_bot_number := v_next_bot_number + 1;
  end loop;

  return v_create_count;
end;
$$;

create or replace function public.sl_drive_test_bot_draft(
  p_room_id uuid,
  p_bot_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.sayless_room_state%rowtype;
  v_draft_count integer;
  v_batch jsonb;
  v_card_id uuid;
  v_card_points integer;
  v_accept boolean;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'sayless';

  if not found or v_room.phase <> 'drafting' then
    return;
  end if;

  v_state := public.sl_ensure_room_state(p_room_id);

  loop
    select count(*)
    into v_draft_count
    from public.sayless_room_cards
    where room_id = p_room_id
      and drafted_by_player_id = p_bot_player_id;

    exit when v_draft_count >= v_state.cards_per_player;

    v_batch := public.sl_get_draft_batch_for_player(p_room_id, p_bot_player_id);
    exit when coalesce(jsonb_array_length(v_batch), 0) = 0;

    v_card_id := (v_batch -> 0 ->> 'id')::uuid;

    select points
    into v_card_points
    from public.sayless_cards
    where id = v_card_id;

    v_accept := coalesce(v_card_points, 0) >= 3 or random() < 0.35;

    perform public.sl_submit_draft_decision(
      p_room_id,
      p_bot_player_id,
      v_card_id,
      v_accept
    );

    select *
    into v_room
    from public.rooms
    where id = p_room_id
      and game_type = 'sayless';

    exit when not found or v_room.phase <> 'drafting';
  end loop;
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
    exit when v_state.active_player_id is null or v_state.active_card_entry_id is null;

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

  if v_state.active_player_id is null or v_state.turn_deadline_at is null then
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

create or replace function public.sl_run_test_bots(
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
  v_host public.players%rowtype;
  v_bot public.players%rowtype;
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
  into v_host
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_host.is_host <> true then
    raise exception 'Only the room creator can run test bots.';
  end if;

  if v_room.phase = 'drafting' then
    for v_bot in
      select *
      from public.players
      where room_id = p_room_id
        and public.sl_is_test_bot_name(name)
      order by created_at asc, id asc
    loop
      perform public.sl_drive_test_bot_draft(p_room_id, v_bot.id);
    end loop;

    perform public.sl_maybe_advance_game(p_room_id);

    select *
    into v_room
    from public.rooms
    where id = p_room_id
      and game_type = 'sayless';
  end if;

  if found and v_room.phase = 'playing' then
    perform public.sl_drive_active_test_bot_turn(p_room_id);
  end if;
end;
$$;

grant execute on function public.sl_add_test_bots(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.sl_run_test_bots(uuid, uuid) to anon, authenticated;
