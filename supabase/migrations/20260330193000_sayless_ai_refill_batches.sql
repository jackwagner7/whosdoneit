alter table public.sayless_cards
  add column if not exists card_source text not null default 'base',
  add column if not exists generated_room_id uuid references public.rooms(id) on delete cascade,
  add column if not exists generated_for_player_id uuid references public.players(id) on delete set null;

update public.sayless_cards
set card_source = 'base'
where card_source is null;

alter table public.sayless_cards
  drop constraint if exists sayless_cards_source_check;

alter table public.sayless_cards
  add constraint sayless_cards_source_check
  check (card_source in ('base', 'generated'));

drop index if exists public.sayless_cards_title_unique;

create unique index if not exists sayless_base_cards_title_unique
  on public.sayless_cards (lower(title))
  where card_source = 'base';

create table if not exists public.sayless_draft_player_state (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  latest_duplicate_count integer not null default 0,
  generated_batch_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id),
  constraint sayless_draft_player_state_latest_duplicate_count_check
    check (latest_duplicate_count >= 0),
  constraint sayless_draft_player_state_generated_batch_count_check
    check (generated_batch_count >= 0)
);

create index if not exists sayless_draft_player_state_room_id_idx
  on public.sayless_draft_player_state (room_id);

alter table public.sayless_draft_player_state enable row level security;
drop policy if exists "public_rw_sayless_draft_player_state" on public.sayless_draft_player_state;
create policy "public_rw_sayless_draft_player_state"
  on public.sayless_draft_player_state
  for all
  using (true)
  with check (true);

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
  delete from public.sayless_draft_player_state where room_id = p_room_id;
end;
$$;
