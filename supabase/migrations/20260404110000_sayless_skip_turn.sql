create or replace function public.sl_skip_turn(
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

  perform public.sl_advance_to_next_turn(p_room_id);
end;
$$;

grant execute on function public.sl_skip_turn(uuid, uuid) to anon, authenticated;
