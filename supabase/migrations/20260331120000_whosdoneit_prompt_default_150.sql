alter table public.rooms
  alter column prompt_seconds set default 150;

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
