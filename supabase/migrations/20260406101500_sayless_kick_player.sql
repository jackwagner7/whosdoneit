create or replace function public.sl_kick_player(
  p_room_id uuid,
  p_player_id uuid,
  p_target_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_actor public.players%rowtype;
  v_target public.players%rowtype;
begin
  select *
  into v_actor
  from public.players
  where id = p_player_id
    and room_id = p_room_id;

  if not found or v_actor.is_host <> true then
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
    raise exception 'Players can only be removed in the lobby.';
  end if;

  select *
  into v_target
  from public.players
  where id = p_target_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Player not found.';
  end if;

  if v_target.is_host = true or v_target.id = p_player_id then
    raise exception 'The host cannot remove that player.';
  end if;

  delete from public.players
  where id = p_target_player_id
    and room_id = p_room_id;
end;
$$;

grant execute on function public.sl_kick_player(uuid, uuid, uuid) to anon, authenticated;
