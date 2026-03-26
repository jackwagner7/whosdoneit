create table if not exists public.sayless_draft_deck (
  room_id uuid not null references public.rooms(id) on delete cascade,
  card_id uuid not null references public.sayless_cards(id) on delete cascade,
  deck_position integer not null,
  created_at timestamptz not null default now(),
  primary key (room_id, card_id),
  constraint sayless_draft_deck_position_unique unique (room_id, deck_position)
);

create index if not exists sayless_draft_deck_room_position_idx
  on public.sayless_draft_deck (room_id, deck_position);

alter table public.sayless_draft_deck enable row level security;
drop policy if exists "public_rw_sayless_draft_deck" on public.sayless_draft_deck;
create policy "public_rw_sayless_draft_deck" on public.sayless_draft_deck for all using (true) with check (true);

alter table public.sayless_draft_hands add column if not exists slot_index integer;

update public.sayless_draft_hands
set slot_index = 0
where slot_index is null;

alter table public.sayless_draft_hands
  alter column slot_index set default 0;

alter table public.sayless_draft_hands
  alter column slot_index set not null;

alter table public.sayless_draft_hands
  drop constraint if exists sayless_draft_hands_pkey;

alter table public.sayless_draft_hands
  add constraint sayless_draft_hands_pkey primary key (room_id, player_id, card_id);

create unique index if not exists sayless_draft_hands_player_slot_unique
  on public.sayless_draft_hands (room_id, player_id, slot_index);

create or replace function public.sl_clear_game_data(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sayless_room_cards where room_id = p_room_id;
  delete from public.sayless_draft_hands where room_id = p_room_id;
  delete from public.sayless_draft_deck where room_id = p_room_id;
  delete from public.sayless_draft_rejections where room_id = p_room_id;
  delete from public.sayless_round_results where room_id = p_room_id;
end;
$$;

create or replace function public.sl_deal_next_draft_hand(
  p_room_id uuid,
  p_player_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealt_count integer := 0;
begin
  if exists (
    select 1
    from public.sayless_draft_hands
    where room_id = p_room_id
      and player_id = p_player_id
  ) then
    return 0;
  end if;

  with locked_cards as (
    select
      room_id,
      card_id,
      deck_position
    from public.sayless_draft_deck
    where room_id = p_room_id
    order by deck_position asc
    limit 10
    for update skip locked
  ),
  next_cards as (
    select
      room_id,
      card_id,
      row_number() over (order by deck_position asc) - 1 as slot_index
    from locked_cards
  ),
  moved_cards as (
    delete from public.sayless_draft_deck as deck
    using next_cards
    where deck.room_id = next_cards.room_id
      and deck.card_id = next_cards.card_id
    returning next_cards.card_id, next_cards.slot_index
  )
  insert into public.sayless_draft_hands (
    room_id,
    player_id,
    card_id,
    slot_index
  )
  select
    p_room_id,
    p_player_id,
    moved_cards.card_id,
    moved_cards.slot_index
  from moved_cards;

  get diagnostics v_dealt_count = row_count;
  return v_dealt_count;
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

  insert into public.sayless_draft_deck (
    room_id,
    card_id,
    deck_position
  )
  select
    p_room_id,
    card.id,
    row_number() over (order by random(), card.id) - 1
  from public.sayless_cards as card;

  update public.rooms
  set
    phase = 'drafting',
    phase_deadline_at = null
  where id = p_room_id
    and game_type = 'sayless';
end;
$$;

create or replace function public.sl_get_draft_batch_for_player(
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
  v_draft_count integer;
  v_player_count integer;
  v_target integer;
  v_hand_count integer;
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
    return '[]'::jsonb;
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
    delete from public.sayless_draft_hands
    where room_id = p_room_id
      and player_id = p_player_id;
    return '[]'::jsonb;
  end if;

  select count(*) into v_player_count from public.players where room_id = p_room_id;
  v_target := public.sl_calculate_draft_target(v_player_count, v_state.cards_per_player);

  if (
    select count(*)
    from public.sayless_room_cards
    where room_id = p_room_id
  ) >= v_target then
    delete from public.sayless_draft_hands
    where room_id = p_room_id
      and player_id = p_player_id;
    return '[]'::jsonb;
  end if;

  select count(*)
  into v_hand_count
  from public.sayless_draft_hands
  where room_id = p_room_id
    and player_id = p_player_id;

  if v_hand_count = 0 then
    perform public.sl_deal_next_draft_hand(p_room_id, p_player_id);
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(card) order by hand.slot_index asc)
    from public.sayless_draft_hands as hand
    join public.sayless_cards as card
      on card.id = hand.card_id
    where hand.room_id = p_room_id
      and hand.player_id = p_player_id
  ), '[]'::jsonb);
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
  v_batch jsonb := public.sl_get_draft_batch_for_player(p_room_id, p_player_id);
begin
  return v_batch -> 0;
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
  v_hand_card public.sayless_draft_hands%rowtype;
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
    delete from public.sayless_draft_hands
    where room_id = p_room_id
      and player_id = p_player_id;
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
    delete from public.sayless_draft_hands
    where room_id = p_room_id
      and player_id = p_player_id;
    perform public.sl_maybe_advance_game(p_room_id);
    return;
  end if;

  select *
  into v_hand_card
  from public.sayless_draft_hands
  where room_id = p_room_id
    and player_id = p_player_id
    and card_id = p_card_id;

  if not found then
    raise exception 'That card is no longer in your hand.';
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
  else
    insert into public.sayless_draft_rejections (
      room_id,
      player_id,
      card_id
    )
    values (
      p_room_id,
      p_player_id,
      p_card_id
    )
    on conflict (room_id, player_id, card_id) do nothing;
  end if;

  delete from public.sayless_draft_hands
  where room_id = p_room_id
    and player_id = p_player_id
    and card_id = p_card_id;

  perform public.sl_maybe_advance_game(p_room_id);
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
  v_remaining_draft_cards integer;
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

  select
    (select count(*) from public.sayless_draft_deck where room_id = p_room_id)
    + (select count(*) from public.sayless_draft_hands where room_id = p_room_id)
  into v_remaining_draft_cards;

  if v_room_card_count >= v_target or (v_remaining_draft_cards = 0 and v_room_card_count > 0) then
    perform public.sl_start_playing_turn(
      p_room_id,
      0,
      0,
      public.sl_zero_array(v_room.team_count)
    );
  end if;
end;
$$;

grant execute on function public.sl_get_draft_batch_for_player(uuid, uuid) to anon, authenticated;
