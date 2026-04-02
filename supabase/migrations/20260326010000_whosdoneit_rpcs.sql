create or replace function public.whd_color_pool()
returns text[]
language sql
immutable
as $$
  select array[
    '#2563eb',
    '#0ea5e9',
    '#06b6d4',
    '#14b8a6',
    '#10b981',
    '#22c55e',
    '#84cc16',
    '#eab308',
    '#f59e0b',
    '#f97316',
    '#f97393',
    '#ec4899',
    '#d946ef',
    '#a855f7',
    '#8b5cf6',
    '#6366f1',
    '#ef4444',
    '#dc2626',
    '#b91c1c',
    '#475569'
  ]::text[];
$$;

create or replace function public.whd_default_player_color()
returns text
language sql
immutable
as $$
  select (public.whd_color_pool())[1];
$$;

create or replace function public.whd_default_player_emoji()
returns text
language sql
immutable
as $$
  select '🙂'::text;
$$;

create or replace function public.whd_normalize_name(p_name text)
returns text
language sql
immutable
as $$
  select btrim(coalesce(p_name, ''));
$$;

create or replace function public.whd_normalize_color(p_color text)
returns text
language sql
immutable
as $$
  with normalized as (
    select lower(btrim(coalesce(p_color, ''))) as value
  )
  select case
    when normalized.value = any(public.whd_color_pool()) then normalized.value
    else public.whd_default_player_color()
  end
  from normalized;
$$;

create or replace function public.whd_normalize_emoji(p_emoji text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_emoji, '')) = '' then public.whd_default_player_emoji()
    else btrim(p_emoji)
  end;
$$;

create or replace function public.whd_normalize_prompt(p_prompt text)
returns text
language sql
immutable
as $$
  select btrim(coalesce(p_prompt, ''));
$$;

create or replace function public.whd_add_seconds(p_seconds integer)
returns timestamptz
language sql
volatile
as $$
  select now() + make_interval(secs => greatest(1, coalesce(p_seconds, 0)));
$$;

create or replace function public.whd_add_milliseconds(p_milliseconds integer)
returns timestamptz
language sql
volatile
as $$
  select now() + (greatest(1, coalesce(p_milliseconds, 0)) * interval '1 millisecond');
$$;

create or replace function public.whd_encode_round_prompt_index(
  p_round_index integer,
  p_prompt_index integer
)
returns integer
language sql
immutable
as $$
  select greatest(0, floor(coalesce(p_round_index, 0))::integer) * 1000
    + greatest(0, floor(coalesce(p_prompt_index, 0))::integer);
$$;

create or replace function public.whd_random_room_code(p_length integer default 4)
returns text
language sql
volatile
as $$
  with chars as (
    select 'ABCDEFGHJKLMNPQRSTUVWXYZ'::text as value
  )
  select string_agg(
    substr(chars.value, 1 + floor(random() * length(chars.value))::integer, 1),
    '' order by gs
  )
  from chars, generate_series(1, greatest(1, coalesce(p_length, 4))) as gs;
$$;

create or replace function public.whd_is_test_bot_name(p_name text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_name, '') ~ '^Test Bot [0-9]+$';
$$;

create or replace function public.whd_expected_guess_count(p_player_count integer)
returns integer
language sql
immutable
as $$
  select greatest(coalesce(p_player_count, 0), 0)
    * greatest(coalesce(p_player_count, 0) - 1, 0);
$$;

create or replace function public.whd_build_test_prompt(p_seed integer)
returns text
language sql
immutable
as $$
  with prompt_pool as (
    select array[
      'eaten breakfast for dinner',
      'sent a text to the wrong person',
      'watched a full season in one day',
      'laughed at the wrong moment',
      'forgotten why you entered a room',
      'tried a strange food and liked it'
    ]::text[] as value
  )
  select 'Test prompt: Have you ever '
    || prompt_pool.value[
      (abs(coalesce(p_seed, 0)) % cardinality(prompt_pool.value)) + 1
    ]
    || '?'
  from prompt_pool;
$$;

create or replace function public.whd_current_prompt_id(
  p_room_id uuid,
  p_current_prompt_index integer
)
returns uuid
language sql
stable
as $$
  select prompt.id
  from public.prompts as prompt
  where prompt.room_id = p_room_id
  order by prompt.prompt_order asc, prompt.created_at asc, prompt.id asc
  offset greatest(mod(greatest(coalesce(p_current_prompt_index, 0), 0), 1000), 0)
  limit 1;
$$;

create or replace function public.whd_host_player_id(p_room_id uuid)
returns uuid
language sql
stable
as $$
  select player.id
  from public.players as player
  where player.room_id = p_room_id
    and player.is_host = true
  order by player.created_at asc, player.id asc
  limit 1;
$$;

create or replace function public.whd_reveal_interest_bucket(
  p_truth boolean,
  p_guessed_innocent_count integer,
  p_guessed_guilty_count integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_innocent integer := greatest(coalesce(p_guessed_innocent_count, 0), 0);
  v_guilty integer := greatest(coalesce(p_guessed_guilty_count, 0), 0);
  v_total integer := v_innocent + v_guilty;
  v_innocent_ratio numeric;
  v_guilty_ratio numeric;
begin
  if v_total <= 0 then
    return 9;
  end if;

  v_innocent_ratio := v_innocent::numeric / v_total::numeric;
  v_guilty_ratio := v_guilty::numeric / v_total::numeric;

  if v_innocent = v_total and coalesce(p_truth, false) = false then
    return 1;
  end if;
  if v_innocent = v_total and coalesce(p_truth, false) = true then
    return 2;
  end if;
  if v_innocent_ratio > 0.79 and coalesce(p_truth, false) = false then
    return 3;
  end if;
  if v_innocent_ratio > 0.79 and coalesce(p_truth, false) = true then
    return 4;
  end if;
  if v_guilty = v_total and coalesce(p_truth, false) = true then
    return 5;
  end if;
  if v_guilty = v_total and coalesce(p_truth, false) = false then
    return 6;
  end if;
  if v_guilty_ratio > 0.79 and coalesce(p_truth, false) = true then
    return 7;
  end if;
  if v_guilty_ratio > 0.79 and coalesce(p_truth, false) = false then
    return 8;
  end if;

  return 9;
end;
$$;

create or replace function public.whd_reveal_player_ids(
  p_room_id uuid,
  p_prompt_id uuid
)
returns uuid[]
language sql
stable
as $$
  with participants as (
    select player.id, player.created_at
    from public.players as player
    join public.confessions as confession
      on confession.player_id = player.id
     and confession.prompt_id = p_prompt_id
    where player.room_id = p_room_id
  ),
  guesses_by_target as (
    select
      guess.target_player_id as player_id,
      count(*) filter (where guess.guessed_answer = false) as guessed_innocent_count,
      count(*) filter (where guess.guessed_answer = true) as guessed_guilty_count
    from public.guesses as guess
    where guess.prompt_id = p_prompt_id
      and guess.guessing_player_id in (select id from participants)
      and guess.target_player_id in (select id from participants)
    group by guess.target_player_id
  ),
  ranked as (
    select
      participant.id as player_id,
      participant.created_at,
      coalesce(target_guesses.guessed_innocent_count, 0) as guessed_innocent_count,
      coalesce(target_guesses.guessed_guilty_count, 0) as guessed_guilty_count,
      public.whd_reveal_interest_bucket(
        confession.answer,
        coalesce(target_guesses.guessed_innocent_count, 0)::integer,
        coalesce(target_guesses.guessed_guilty_count, 0)::integer
      ) as interest_bucket
    from participants as participant
    join public.confessions as confession
      on confession.prompt_id = p_prompt_id
     and confession.player_id = participant.id
    left join guesses_by_target as target_guesses
      on target_guesses.player_id = participant.id
  )
  select coalesce(
    array_agg(
      ranked.player_id
      order by
        ranked.interest_bucket asc,
        (ranked.guessed_innocent_count + ranked.guessed_guilty_count) desc,
        ranked.created_at asc,
        ranked.player_id asc
    ),
    '{}'::uuid[]
  )
  from ranked;
$$;

create or replace function public.whd_pretruth_reveal_wait_ms(
  p_truth boolean,
  p_guessed_innocent_count integer,
  p_guessed_guilty_count integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_bucket integer := public.whd_reveal_interest_bucket(
    p_truth,
    p_guessed_innocent_count,
    p_guessed_guilty_count
  );
  v_primary_group text := 'innocent';
  v_primary_wait integer := 560;
  v_secondary_wait integer := 560;
  v_between_group_wait integer := 560;
  v_reveal_wait integer := 1300;
  v_primary_count integer;
  v_secondary_count integer;
  v_total integer := 240;
begin
  case v_bucket
    when 1 then
      v_primary_group := 'innocent';
      v_primary_wait := 240;
      v_secondary_wait := 240;
      v_between_group_wait := 240;
      v_reveal_wait := 560;
    when 2 then
      v_primary_group := 'innocent';
      v_primary_wait := 240;
      v_secondary_wait := 240;
      v_between_group_wait := 240;
      v_reveal_wait := 1300;
    when 3 then
      v_primary_group := 'innocent';
      v_primary_wait := 240;
      v_secondary_wait := 240;
      v_between_group_wait := 1300;
      v_reveal_wait := 560;
    when 4 then
      v_primary_group := 'innocent';
      v_primary_wait := 240;
      v_secondary_wait := 560;
      v_between_group_wait := 1300;
      v_reveal_wait := 1300;
    when 5 then
      v_primary_group := 'guilty';
      v_primary_wait := 240;
      v_secondary_wait := 240;
      v_between_group_wait := 240;
      v_reveal_wait := 560;
    when 6 then
      v_primary_group := 'guilty';
      v_primary_wait := 240;
      v_secondary_wait := 240;
      v_between_group_wait := 240;
      v_reveal_wait := 1300;
    when 7 then
      v_primary_group := 'guilty';
      v_primary_wait := 240;
      v_secondary_wait := 240;
      v_between_group_wait := 1300;
      v_reveal_wait := 560;
    when 8 then
      v_primary_group := 'guilty';
      v_primary_wait := 240;
      v_secondary_wait := 560;
      v_between_group_wait := 1300;
      v_reveal_wait := 1300;
    else
      null;
  end case;

  if v_primary_group = 'innocent' then
    v_primary_count := greatest(coalesce(p_guessed_innocent_count, 0), 0);
    v_secondary_count := greatest(coalesce(p_guessed_guilty_count, 0), 0);
  else
    v_primary_count := greatest(coalesce(p_guessed_guilty_count, 0), 0);
    v_secondary_count := greatest(coalesce(p_guessed_innocent_count, 0), 0);
  end if;

  v_total := v_total + v_reveal_wait;
  if v_primary_count > 1 then
    v_total := v_total + (v_primary_count - 1) * v_primary_wait;
  end if;
  if v_secondary_count > 1 then
    v_total := v_total + (v_secondary_count - 1) * v_secondary_wait;
  end if;
  if v_primary_count > 0 and v_secondary_count > 0 then
    v_total := v_total + v_between_group_wait;
  end if;

  return v_total + 700;
end;
$$;

create or replace function public.whd_pretruth_reveal_deadline(
  p_room_id uuid,
  p_prompt_id uuid,
  p_reveal_player_index integer
)
returns timestamptz
language plpgsql
volatile
as $$
declare
  v_reveal_player_ids uuid[];
  v_target_player_id uuid;
  v_guessed_innocent_count integer;
  v_guessed_guilty_count integer;
  v_truth boolean;
begin
  v_reveal_player_ids := public.whd_reveal_player_ids(p_room_id, p_prompt_id);
  v_target_player_id := v_reveal_player_ids[greatest(coalesce(p_reveal_player_index, 0), 0) + 1];

  if v_target_player_id is null then
    return null;
  end if;

  select
    count(*) filter (where guess.guessed_answer = false),
    count(*) filter (where guess.guessed_answer = true)
  into
    v_guessed_innocent_count,
    v_guessed_guilty_count
  from public.guesses as guess
  where guess.prompt_id = p_prompt_id
    and guess.target_player_id = v_target_player_id
    and guess.guessing_player_id = any(v_reveal_player_ids);

  select confession.answer
  into v_truth
  from public.confessions as confession
  where confession.prompt_id = p_prompt_id
    and confession.player_id = v_target_player_id
  limit 1;

  return public.whd_add_milliseconds(
    public.whd_pretruth_reveal_wait_ms(
      coalesce(v_truth, false),
      coalesce(v_guessed_innocent_count, 0),
      coalesce(v_guessed_guilty_count, 0)
    )
  );
end;
$$;

create or replace function public.whd_fill_missing_confessions(
  p_room_id uuid,
  p_prompt_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.confessions (room_id, prompt_id, player_id, answer)
  select p_room_id, p_prompt_id, player.id, false
  from public.players as player
  where player.room_id = p_room_id
    and not exists (
      select 1
      from public.confessions as confession
      where confession.prompt_id = p_prompt_id
        and confession.player_id = player.id
    )
  on conflict (prompt_id, player_id) do nothing;
$$;

create or replace function public.whd_submit_test_bot_prompts(p_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.prompts (room_id, submitted_by_player_id, text)
  select
    p_room_id,
    player.id,
    public.whd_build_test_prompt(
      (
        row_number() over (order by player.created_at asc, player.id asc)
        + char_length(player.name)
      )::integer
    )
  from public.players as player
  where player.room_id = p_room_id
    and public.whd_is_test_bot_name(player.name)
    and not exists (
      select 1
      from public.prompts as prompt
      where prompt.room_id = p_room_id
        and prompt.submitted_by_player_id = player.id
    )
  on conflict (room_id, submitted_by_player_id) do nothing;
$$;

create or replace function public.whd_submit_test_bot_confessions(
  p_room_id uuid,
  p_prompt_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.confessions (room_id, prompt_id, player_id, answer)
  select
    p_room_id,
    p_prompt_id,
    player.id,
    random() >= 0.5
  from public.players as player
  where player.room_id = p_room_id
    and public.whd_is_test_bot_name(player.name)
    and not exists (
      select 1
      from public.confessions as confession
      where confession.prompt_id = p_prompt_id
        and confession.player_id = player.id
    )
  on conflict (prompt_id, player_id) do nothing;
$$;

create or replace function public.whd_submit_test_bot_guesses(
  p_room_id uuid,
  p_prompt_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  with participants as (
    select player.id
    from public.players as player
    join public.confessions as confession
      on confession.player_id = player.id
     and confession.prompt_id = p_prompt_id
    where player.room_id = p_room_id
  ),
  test_bots as (
    select player.id
    from public.players as player
    where player.room_id = p_room_id
      and public.whd_is_test_bot_name(player.name)
      and player.id in (select id from participants)
  )
  insert into public.guesses (
    room_id,
    prompt_id,
    guessing_player_id,
    target_player_id,
    guessed_answer
  )
  select
    p_room_id,
    p_prompt_id,
    bot.id,
    target.id,
    random() >= 0.5
  from test_bots as bot
  cross join participants as target
  where bot.id <> target.id
    and not exists (
      select 1
      from public.guesses as guess
      where guess.prompt_id = p_prompt_id
        and guess.guessing_player_id = bot.id
        and guess.target_player_id = target.id
    )
  on conflict (prompt_id, guessing_player_id, target_player_id) do nothing;
$$;

create or replace function public.whd_apply_prompt_scores_once(p_prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_updated integer;
begin
  update public.prompts
  set score_applied = true
  where id = p_prompt_id
    and score_applied = false;

  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    return;
  end if;

  with score_delta as (
    select
      guess.guessing_player_id as player_id,
      count(*)::integer as delta
    from public.guesses as guess
    join public.confessions as confession
      on confession.prompt_id = p_prompt_id
     and confession.player_id = guess.target_player_id
    where guess.prompt_id = p_prompt_id
      and guess.guessed_answer = confession.answer
    group by guess.guessing_player_id
  )
  update public.players as player
  set score = player.score + score_delta.delta
  from score_delta
  where score_delta.player_id = player.id;
end;
$$;

create or replace function public.whd_create_room(
  host_name text,
  player_color text default null,
  player_emoji text default null,
  prompt_seconds integer default null,
  round_count integer default null,
  answering_seconds integer default null,
  guessing_seconds integer default null,
  reveal_seconds integer default null,
  fast_mode boolean default null
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
  v_prompt_seconds integer := least(greatest(coalesce(prompt_seconds, 150), 5), 180);
  v_round_count integer := least(greatest(coalesce(round_count, 1), 1), 10);
  v_answering_seconds integer := least(greatest(coalesce(answering_seconds, 25), 5), 180);
  v_guessing_seconds integer := least(greatest(coalesce(guessing_seconds, 35), 5), 180);
  v_reveal_seconds integer := least(greatest(coalesce(reveal_seconds, 8), 5), 180);
  v_fast_mode boolean := coalesce(fast_mode, false);
  v_code text;
  v_attempt integer;
begin
  if v_name = '' then
    raise exception 'Name is required.';
  end if;

  v_attempt := 0;
  while v_attempt < 12 loop
    v_attempt := v_attempt + 1;
    v_code := public.whd_random_room_code(4);

    begin
      insert into public.rooms (
        code,
        game_type,
        phase,
        team_count,
        current_prompt_index,
        reveal_player_index,
        reveal_truth_visible,
        phase_deadline_at,
        prompt_seconds,
        round_count,
        answering_seconds,
        guessing_seconds,
        reveal_seconds,
        fast_mode
      )
      values (
        v_code,
        'whosdoneit',
        'lobby',
        2,
        0,
        0,
        false,
        null,
        v_prompt_seconds,
        v_round_count,
        v_answering_seconds,
        v_guessing_seconds,
        v_reveal_seconds,
        v_fast_mode
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
    null,
    true,
    0
  )
  returning * into v_player;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'player', to_jsonb(v_player)
  );
end;
$$;

create or replace function public.whd_join_room(
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

  if v_room.game_type <> 'whosdoneit' then
    raise exception 'That room is for a different game.';
  end if;

  if exists (
    select 1
    from public.players
    where room_id = v_room.id
      and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already taken in this room.';
  end if;

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
    null,
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

create or replace function public.whd_update_player_profile(
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

create or replace function public.whd_update_room_settings(
  p_room_id uuid,
  p_player_id uuid,
  p_prompt_seconds integer,
  p_round_count integer,
  p_answering_seconds integer,
  p_guessing_seconds integer,
  p_reveal_seconds integer,
  p_fast_mode boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_prompt_seconds integer;
  v_round_count integer;
  v_answering_seconds integer;
  v_guessing_seconds integer;
  v_reveal_seconds integer;
  v_fast_mode boolean;
begin
  select *
  into v_player
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_player.is_host <> true then
    raise exception 'Only the room creator can edit settings.';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  v_prompt_seconds := least(greatest(coalesce(p_prompt_seconds, v_room.prompt_seconds), 5), 180);
  v_round_count := least(greatest(coalesce(p_round_count, v_room.round_count), 1), 10);
  v_answering_seconds := least(greatest(coalesce(p_answering_seconds, v_room.answering_seconds), 5), 180);
  v_guessing_seconds := least(greatest(coalesce(p_guessing_seconds, v_room.guessing_seconds), 5), 180);
  v_reveal_seconds := least(greatest(coalesce(p_reveal_seconds, v_room.reveal_seconds), 5), 180);
  v_fast_mode := coalesce(p_fast_mode, v_room.fast_mode);

  if v_room.phase <> 'lobby' then
    v_prompt_seconds := v_room.prompt_seconds;
    v_round_count := v_room.round_count;
  end if;

  update public.rooms
  set
    prompt_seconds = v_prompt_seconds,
    round_count = v_round_count,
    answering_seconds = v_answering_seconds,
    guessing_seconds = v_guessing_seconds,
    reveal_seconds = v_reveal_seconds,
    fast_mode = v_fast_mode
  where id = p_room_id;
end;
$$;

create or replace function public.whd_start_game(
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
  v_player_count integer;
  v_host_player_id uuid;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'lobby' then
    raise exception 'Game can only be started from lobby.';
  end if;

  select count(*)
  into v_player_count
  from public.players
  where room_id = p_room_id;

  if v_player_count < 2 then
    raise exception 'Game requires at least 2 players.';
  end if;

  v_host_player_id := public.whd_host_player_id(p_room_id);
  if v_host_player_id is null then
    raise exception 'Room host is missing.';
  end if;
  if v_host_player_id <> p_player_id then
    raise exception 'Only the room creator can start the game.';
  end if;

  update public.players
  set score = 0
  where room_id = p_room_id;

  delete from public.prompts where room_id = p_room_id;
  delete from public.confessions where room_id = p_room_id;
  delete from public.guesses where room_id = p_room_id;

  update public.rooms
  set
    phase = 'prompting',
    current_prompt_index = 0,
    reveal_player_index = 0,
    reveal_truth_visible = false,
    phase_deadline_at = public.whd_add_seconds(v_room.prompt_seconds)
  where id = p_room_id
    and phase = 'lobby';
end;
$$;

create or replace function public.whd_submit_prompt(
  p_room_id uuid,
  p_player_id uuid,
  p_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_text text := public.whd_normalize_prompt(p_text);
begin
  if v_text = '' then
    raise exception 'Prompt text is required.';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.phase <> 'prompting' then
    raise exception 'Prompt stage is not active.';
  end if;

  insert into public.prompts (
    room_id,
    submitted_by_player_id,
    text
  )
  values (
    p_room_id,
    p_player_id,
    v_text
  )
  on conflict (room_id, submitted_by_player_id)
  do update set text = excluded.text;
end;
$$;

create or replace function public.whd_submit_confession(
  p_room_id uuid,
  p_prompt_id uuid,
  p_player_id uuid,
  p_answer boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.confessions (
    room_id,
    prompt_id,
    player_id,
    answer
  )
  values (
    p_room_id,
    p_prompt_id,
    p_player_id,
    p_answer
  )
  on conflict (prompt_id, player_id)
  do update set answer = excluded.answer;
$$;

create or replace function public.whd_submit_guesses(
  p_room_id uuid,
  p_prompt_id uuid,
  p_guessing_player_id uuid,
  p_guesses jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.guesses (
    room_id,
    prompt_id,
    guessing_player_id,
    target_player_id,
    guessed_answer
  )
  select
    p_room_id,
    p_prompt_id,
    p_guessing_player_id,
    payload.target_player_id,
    payload.guessed_answer
  from jsonb_to_recordset(coalesce(p_guesses, '[]'::jsonb)) as payload(
    target_player_id uuid,
    guessed_answer boolean
  )
  where payload.target_player_id <> p_guessing_player_id
  on conflict (prompt_id, guessing_player_id, target_player_id)
  do update set guessed_answer = excluded.guessed_answer;
$$;

create or replace function public.whd_maybe_advance_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_current_prompt_id uuid;
  v_round_index integer;
  v_player_count integer;
  v_prompt_count integer;
  v_confession_count integer;
  v_participant_count integer;
  v_guess_count integer;
  v_reveal_player_ids uuid[];
  v_reveal_player_count integer;
  v_fast_mode boolean;
  v_next_reveal_index integer;
  v_host_player_id uuid;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and game_type = 'whosdoneit';

  if not found then
    return;
  end if;

  if v_room.phase = 'prompting' then
    if exists (
      select 1
      from public.players
      where room_id = p_room_id
        and public.whd_is_test_bot_name(name)
    ) then
      perform public.whd_submit_test_bot_prompts(p_room_id);
      select *
      into v_room
      from public.rooms
      where id = p_room_id;
      if v_room.phase <> 'prompting' then
        return;
      end if;
    end if;

    select count(*) into v_player_count from public.players where room_id = p_room_id;
    select count(*) into v_prompt_count from public.prompts where room_id = p_room_id;

    if v_prompt_count < v_player_count
      and (v_room.phase_deadline_at is null or v_room.phase_deadline_at > now()) then
      return;
    end if;

    if v_prompt_count = 0 then
      v_host_player_id := public.whd_host_player_id(p_room_id);
      if v_host_player_id is null then
        raise exception 'Room host is missing.';
      end if;

      perform public.whd_submit_prompt(p_room_id, v_host_player_id, 'Have you ever done it?');
      select *
      into v_room
      from public.rooms
      where id = p_room_id;
    end if;

    v_round_index := floor(greatest(v_room.current_prompt_index, 0) / 1000.0)::integer;

    with shuffled as (
      select
        prompt.id,
        row_number() over (order by random()) - 1 as prompt_order
      from public.prompts as prompt
      where prompt.room_id = p_room_id
    )
    update public.prompts as prompt
    set
      prompt_order = shuffled.prompt_order,
      score_applied = false
    from shuffled
    where prompt.id = shuffled.id;

    delete from public.confessions where room_id = p_room_id;
    delete from public.guesses where room_id = p_room_id;

    update public.rooms
    set
      phase = 'answering',
      current_prompt_index = public.whd_encode_round_prompt_index(v_round_index, 0),
      reveal_player_index = 0,
      reveal_truth_visible = false,
      phase_deadline_at = public.whd_add_seconds(v_room.answering_seconds)
    where id = p_room_id
      and phase = 'prompting';

    return;
  end if;

  v_current_prompt_id := public.whd_current_prompt_id(p_room_id, v_room.current_prompt_index);
  if v_current_prompt_id is null then
    return;
  end if;

  if v_room.phase = 'answering' then
    if exists (
      select 1
      from public.players
      where room_id = p_room_id
        and public.whd_is_test_bot_name(name)
    ) then
      perform public.whd_submit_test_bot_confessions(p_room_id, v_current_prompt_id);
      select *
      into v_room
      from public.rooms
      where id = p_room_id;
      if v_room.phase <> 'answering' then
        return;
      end if;
    end if;

    select count(*) into v_player_count from public.players where room_id = p_room_id;
    select count(*) into v_confession_count from public.confessions where prompt_id = v_current_prompt_id;

    if v_confession_count < v_player_count
      and (v_room.phase_deadline_at is null or v_room.phase_deadline_at > now()) then
      return;
    end if;

    perform public.whd_fill_missing_confessions(p_room_id, v_current_prompt_id);

    update public.rooms
    set
      phase = 'guessing',
      phase_deadline_at = public.whd_add_seconds(v_room.guessing_seconds)
    where id = p_room_id
      and phase = 'answering'
      and current_prompt_index = v_room.current_prompt_index;

    return;
  end if;

  if v_room.phase = 'guessing' then
    if exists (
      select 1
      from public.players
      where room_id = p_room_id
        and public.whd_is_test_bot_name(name)
    ) then
      perform public.whd_submit_test_bot_guesses(p_room_id, v_current_prompt_id);
      select *
      into v_room
      from public.rooms
      where id = p_room_id;
      if v_room.phase <> 'guessing' then
        return;
      end if;
    end if;

    select count(*)
    into v_participant_count
    from public.confessions
    where prompt_id = v_current_prompt_id;

    select count(*)
    into v_guess_count
    from public.guesses
    where prompt_id = v_current_prompt_id
      and guessing_player_id in (
        select confession.player_id
        from public.confessions as confession
        where confession.prompt_id = v_current_prompt_id
      )
      and target_player_id in (
        select confession.player_id
        from public.confessions as confession
        where confession.prompt_id = v_current_prompt_id
      );

    if v_guess_count < public.whd_expected_guess_count(v_participant_count)
      and (v_room.phase_deadline_at is null or v_room.phase_deadline_at > now()) then
      return;
    end if;

    perform public.whd_apply_prompt_scores_once(v_current_prompt_id);

    v_reveal_player_ids := public.whd_reveal_player_ids(p_room_id, v_current_prompt_id);
    v_reveal_player_count := coalesce(array_length(v_reveal_player_ids, 1), 0);
    v_fast_mode := v_room.fast_mode = true;
    v_next_reveal_index := case when v_fast_mode then v_reveal_player_count else 0 end;

    update public.rooms
    set
      phase = 'revealing',
      reveal_player_index = v_next_reveal_index,
      reveal_truth_visible = v_fast_mode,
      phase_deadline_at = case
        when v_fast_mode then public.whd_add_seconds(v_room.reveal_seconds)
        else public.whd_pretruth_reveal_deadline(p_room_id, v_current_prompt_id, 0)
      end
    where id = p_room_id
      and phase = 'guessing'
      and current_prompt_index = v_room.current_prompt_index;

    return;
  end if;

  if v_room.phase = 'revealing' then
    v_reveal_player_ids := public.whd_reveal_player_ids(p_room_id, v_current_prompt_id);
    v_reveal_player_count := coalesce(array_length(v_reveal_player_ids, 1), 0);

    if v_room.reveal_player_index >= v_reveal_player_count then
      if v_room.phase_deadline_at is not null and v_room.phase_deadline_at > now() then
        return;
      end if;

      update public.rooms
      set
        phase = 'leaderboard',
        phase_deadline_at = null,
        reveal_truth_visible = false
      where id = p_room_id
        and phase = 'revealing';

      return;
    end if;

    if v_room.reveal_truth_visible = false then
      if v_room.phase_deadline_at is null then
        update public.rooms
        set phase_deadline_at = public.whd_pretruth_reveal_deadline(
          p_room_id,
          v_current_prompt_id,
          v_room.reveal_player_index
        )
        where id = p_room_id
          and phase = 'revealing'
          and reveal_player_index = v_room.reveal_player_index
          and reveal_truth_visible = false;
        return;
      end if;

      if v_room.phase_deadline_at > now() then
        return;
      end if;

      update public.rooms
      set
        reveal_truth_visible = true,
        phase_deadline_at = public.whd_add_seconds(v_room.reveal_seconds)
      where id = p_room_id
        and phase = 'revealing'
        and reveal_player_index = v_room.reveal_player_index
        and reveal_truth_visible = false;

      return;
    end if;

    if v_room.phase_deadline_at is null or v_room.phase_deadline_at > now() then
      return;
    end if;

    v_next_reveal_index := v_room.reveal_player_index + 1;

    if v_next_reveal_index >= v_reveal_player_count then
      update public.rooms
      set
        reveal_player_index = v_reveal_player_count,
        reveal_truth_visible = true,
        phase_deadline_at = public.whd_add_seconds(v_room.reveal_seconds)
      where id = p_room_id
        and phase = 'revealing'
        and reveal_player_index = v_room.reveal_player_index;

      return;
    end if;

    update public.rooms
    set
      reveal_player_index = v_next_reveal_index,
      reveal_truth_visible = false,
      phase_deadline_at = public.whd_pretruth_reveal_deadline(
        p_room_id,
        v_current_prompt_id,
        v_next_reveal_index
      )
    where id = p_room_id
      and phase = 'revealing'
      and reveal_player_index = v_room.reveal_player_index;
  end if;
end;
$$;

create or replace function public.whd_advance_reveal(
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
  v_actor public.players%rowtype;
  v_current_prompt_id uuid;
  v_reveal_player_ids uuid[];
  v_reveal_player_count integer;
  v_current_reveal_player_id uuid;
  v_next_index integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  if v_room.phase <> 'revealing' then
    raise exception 'Reveal step is not active.';
  end if;

  v_current_prompt_id := public.whd_current_prompt_id(p_room_id, v_room.current_prompt_index);
  if v_current_prompt_id is null then
    raise exception 'No prompt is active.';
  end if;

  v_reveal_player_ids := public.whd_reveal_player_ids(p_room_id, v_current_prompt_id);
  v_reveal_player_count := coalesce(array_length(v_reveal_player_ids, 1), 0);
  v_current_reveal_player_id := v_reveal_player_ids[v_room.reveal_player_index + 1];

  if v_current_reveal_player_id is null then
    if v_actor.is_host <> true then
      raise exception 'Only the room creator can do that.';
    end if;

    update public.rooms
    set
      phase = 'leaderboard',
      phase_deadline_at = null,
      reveal_truth_visible = false
    where id = p_room_id
      and phase = 'revealing';

    return;
  end if;

  if v_room.reveal_truth_visible = false then
    raise exception 'Reveal first.';
  end if;

  if v_current_reveal_player_id <> p_player_id and v_actor.is_host <> true then
    raise exception 'Only the current reveal player or host can do that.';
  end if;

  v_next_index := v_room.reveal_player_index + 1;

  if v_next_index >= v_reveal_player_count then
    update public.rooms
    set
      reveal_player_index = v_reveal_player_count,
      reveal_truth_visible = true,
      phase_deadline_at = public.whd_add_seconds(v_room.reveal_seconds)
    where id = p_room_id
      and phase = 'revealing'
      and reveal_player_index = v_room.reveal_player_index;

    return;
  end if;

  update public.rooms
  set
    reveal_player_index = v_next_index,
    reveal_truth_visible = false,
    phase_deadline_at = public.whd_pretruth_reveal_deadline(
      p_room_id,
      v_current_prompt_id,
      v_next_index
    )
  where id = p_room_id
    and phase = 'revealing'
    and reveal_player_index = v_room.reveal_player_index;
end;
$$;

create or replace function public.whd_start_next_round(
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
  v_actor public.players%rowtype;
  v_prompt_count integer;
  v_round_index integer;
  v_prompt_index integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_actor.is_host <> true then
    raise exception 'Only the room creator can do that.';
  end if;

  select count(*) into v_prompt_count from public.prompts where room_id = p_room_id;
  v_round_index := floor(greatest(v_room.current_prompt_index, 0) / 1000.0)::integer;
  v_prompt_index := mod(greatest(v_room.current_prompt_index, 0), 1000);

  if v_prompt_index + 1 >= v_prompt_count and v_round_index + 1 >= v_room.round_count then
    update public.rooms
    set
      phase = 'finished',
      phase_deadline_at = null,
      reveal_truth_visible = false
    where id = p_room_id;
    return;
  end if;

  if v_prompt_index + 1 >= v_prompt_count and v_round_index + 1 < v_room.round_count then
    delete from public.prompts where room_id = p_room_id;
    delete from public.confessions where room_id = p_room_id;
    delete from public.guesses where room_id = p_room_id;

    update public.rooms
    set
      phase = 'prompting',
      current_prompt_index = public.whd_encode_round_prompt_index(v_round_index + 1, 0),
      reveal_player_index = 0,
      reveal_truth_visible = false,
      phase_deadline_at = public.whd_add_seconds(v_room.prompt_seconds)
    where id = p_room_id
      and phase = 'leaderboard';
    return;
  end if;

  update public.rooms
  set
    phase = 'answering',
    current_prompt_index = public.whd_encode_round_prompt_index(v_round_index, v_prompt_index + 1),
    reveal_player_index = 0,
    reveal_truth_visible = false,
    phase_deadline_at = public.whd_add_seconds(v_room.answering_seconds)
  where id = p_room_id
    and phase = 'leaderboard';
end;
$$;

create or replace function public.whd_play_again(
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
  v_actor public.players%rowtype;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_actor.is_host <> true then
    raise exception 'Only the room creator can play again.';
  end if;

  update public.players
  set score = 0
  where room_id = p_room_id;

  delete from public.prompts where room_id = p_room_id;
  delete from public.confessions where room_id = p_room_id;
  delete from public.guesses where room_id = p_room_id;

  update public.rooms
  set
    phase = 'lobby',
    current_prompt_index = 0,
    reveal_player_index = 0,
    reveal_truth_visible = false,
    phase_deadline_at = null
  where id = p_room_id;
end;
$$;

grant execute on function public.whd_create_room(text, text, text, integer, integer, integer, integer, integer, boolean) to anon, authenticated;
grant execute on function public.whd_join_room(text, text, text, text) to anon, authenticated;
grant execute on function public.whd_update_player_profile(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.whd_update_room_settings(uuid, uuid, integer, integer, integer, integer, integer, boolean) to anon, authenticated;
grant execute on function public.whd_start_game(uuid, uuid) to anon, authenticated;
grant execute on function public.whd_submit_prompt(uuid, uuid, text) to anon, authenticated;
grant execute on function public.whd_submit_confession(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.whd_submit_guesses(uuid, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.whd_maybe_advance_room(uuid) to anon, authenticated;
grant execute on function public.whd_advance_reveal(uuid, uuid) to anon, authenticated;
grant execute on function public.whd_start_next_round(uuid, uuid) to anon, authenticated;
grant execute on function public.whd_play_again(uuid, uuid) to anon, authenticated;
