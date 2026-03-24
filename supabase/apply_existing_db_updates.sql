alter table public.rooms
  add column if not exists game_type text not null default 'whosdoneit';

alter table public.rooms
  add column if not exists team_count integer not null default 2;

alter table public.rooms
  add column if not exists team_names text[] not null default array[]::text[];

alter table public.players
  add column if not exists team_index integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_game_type_check'
  ) then
    alter table public.rooms
      add constraint rooms_game_type_check
      check (game_type in ('whosdoneit', 'sayless'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rooms_team_count_check'
  ) then
    alter table public.rooms
      add constraint rooms_team_count_check
      check (team_count between 2 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_team_index_check'
  ) then
    alter table public.players
      add constraint players_team_index_check
      check (team_index is null or team_index between 0 and 4);
  end if;
end
$$;

alter table public.rooms
  drop constraint if exists rooms_phase_check;

alter table public.rooms
  add constraint rooms_phase_check
  check (
    phase in (
      'lobby',
      'drafting',
      'prompting',
      'answering',
      'guessing',
      'playing',
      'revealing',
      'leaderboard',
      'round_summary',
      'finished'
    )
  );

create table if not exists public.sayless_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  points integer not null default 1,
  created_at timestamptz not null default now(),
  constraint sayless_cards_points_check check (points between 1 and 5)
);

create table if not exists public.sayless_room_cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  card_id uuid not null references public.sayless_cards(id) on delete cascade,
  drafted_by_player_id uuid not null references public.players(id) on delete cascade,
  sort_order integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint sayless_room_cards_status_check check (
    status in ('pending', 'passed', 'cleared')
  ),
  constraint sayless_room_cards_room_card_unique unique (room_id, card_id)
);

create table if not exists public.sayless_room_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  cards_per_player integer not null default 8,
  round_count integer not null default 3,
  turn_seconds integer not null default 60,
  current_round_index integer not null default 0,
  starting_team_index integer not null default 0,
  active_team_index integer not null default 0,
  active_player_id uuid references public.players(id) on delete set null,
  active_card_entry_id uuid references public.sayless_room_cards(id) on delete set null,
  turn_deadline_at timestamptz,
  team_turn_counts integer[] not null default array[]::integer[],
  created_at timestamptz not null default now(),
  constraint sayless_room_state_cards_per_player_check check (cards_per_player between 3 and 12),
  constraint sayless_room_state_round_count_check check (round_count between 1 and 5),
  constraint sayless_room_state_turn_seconds_check check (turn_seconds between 15 and 180)
);

create table if not exists public.sayless_draft_rejections (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id uuid not null references public.sayless_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, player_id, card_id)
);

create table if not exists public.sayless_draft_hands (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id uuid not null references public.sayless_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, player_id),
  constraint sayless_draft_hands_room_card_unique unique (room_id, card_id)
);

create table if not exists public.sayless_round_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_index integer not null,
  team_index integer not null,
  player_id uuid not null references public.players(id) on delete cascade,
  card_entry_id uuid not null references public.sayless_room_cards(id) on delete cascade,
  points integer not null default 1,
  created_at timestamptz not null default now(),
  constraint sayless_round_results_points_check check (points between 1 and 5),
  constraint sayless_round_results_unique_card_per_round unique (room_id, round_index, card_entry_id)
);

create unique index if not exists sayless_cards_title_unique
  on public.sayless_cards (lower(title));

create index if not exists sayless_room_cards_room_id_idx
  on public.sayless_room_cards (room_id);
create index if not exists sayless_room_cards_status_idx
  on public.sayless_room_cards (room_id, status, sort_order);
create index if not exists sayless_draft_rejections_room_player_idx
  on public.sayless_draft_rejections (room_id, player_id);
create index if not exists sayless_draft_hands_room_id_idx
  on public.sayless_draft_hands (room_id);
create index if not exists sayless_round_results_room_round_idx
  on public.sayless_round_results (room_id, round_index);

alter table public.sayless_cards enable row level security;
alter table public.sayless_room_cards enable row level security;
alter table public.sayless_room_state enable row level security;
alter table public.sayless_draft_rejections enable row level security;
alter table public.sayless_draft_hands enable row level security;
alter table public.sayless_round_results enable row level security;

drop policy if exists "public_rw_sayless_cards" on public.sayless_cards;
drop policy if exists "public_rw_sayless_room_cards" on public.sayless_room_cards;
drop policy if exists "public_rw_sayless_room_state" on public.sayless_room_state;
drop policy if exists "public_rw_sayless_draft_rejections" on public.sayless_draft_rejections;
drop policy if exists "public_rw_sayless_draft_hands" on public.sayless_draft_hands;
drop policy if exists "public_rw_sayless_round_results" on public.sayless_round_results;

create policy "public_rw_sayless_cards" on public.sayless_cards for all using (true) with check (true);
create policy "public_rw_sayless_room_cards" on public.sayless_room_cards for all using (true) with check (true);
create policy "public_rw_sayless_room_state" on public.sayless_room_state for all using (true) with check (true);
create policy "public_rw_sayless_draft_rejections" on public.sayless_draft_rejections for all using (true) with check (true);
create policy "public_rw_sayless_draft_hands" on public.sayless_draft_hands for all using (true) with check (true);
create policy "public_rw_sayless_round_results" on public.sayless_round_results for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sayless_room_cards'
  ) then
    execute 'alter publication supabase_realtime add table public.sayless_room_cards';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sayless_room_state'
  ) then
    execute 'alter publication supabase_realtime add table public.sayless_room_state';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sayless_draft_rejections'
  ) then
    execute 'alter publication supabase_realtime add table public.sayless_draft_rejections';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sayless_draft_hands'
  ) then
    execute 'alter publication supabase_realtime add table public.sayless_draft_hands';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sayless_round_results'
  ) then
    execute 'alter publication supabase_realtime add table public.sayless_round_results';
  end if;
end
$$;

with seed(title, description, points) as (
  values
    ('Chatty Pelican', 'A beach bird who treats every snack break like a podcast interview.', 1),
    ('Parking Lot Philosopher', 'A person delivering deep life advice beside a shopping cart return.', 1),
    ('Karaoke Tax Auditor', 'An auditor who explains every deduction by singing it loudly.', 2),
    ('Emotional Support Goblin', 'A tiny chaotic helper who gives sincere compliments at odd times.', 1),
    ('Suspiciously Fancy Pigeon', 'A city pigeon acting like it owns a velvet-rope nightclub.', 1),
    ('Wi-Fi Exorcist', 'Someone who fixes dead internet with incense and confident nonsense.', 2),
    ('Pirate Dentist', 'A sea bandit who cares more about flossing than treasure.', 1),
    ('Beige Ninja', 'A stealth expert perfectly disguised as office furniture.', 2),
    ('Overcaffeinated Mermaid', 'A mermaid powered entirely by iced coffee and urgency.', 1),
    ('Haunted Air Fryer', 'A countertop appliance with opinions and a spooky preheat sound.', 1),
    ('Space Cowboy Barista', 'A lasso-spinning coffee maker roaming the galaxy.', 2),
    ('Competitive Grandma', 'A sweet elder who treats every board game like the Olympics.', 1),
    ('Sentient Traffic Cone', 'A road cone that has suddenly developed very strong boundaries.', 2),
    ('Wizard Intern', 'A magical apprentice still learning not to cast spells on the printer.', 1),
    ('Disco Librarian', 'A librarian who enforces silence while wearing sequins and finger guns.', 1),
    ('Soda Sommelier', 'An expert who pairs gourmet meals with extremely fizzy drinks.', 2),
    ('Apocalypse Wedding Planner', 'Someone calmly organizing seating charts during the end of the world.', 2),
    ('Vegan Vampire', 'A vampire trying very hard to rebrand around juice cleanses.', 1),
    ('Corn Maze Detective', 'An investigator solving mysteries one dead-end turn at a time.', 2),
    ('Backyard Oracle', 'A prophet who delivers visions from a plastic lawn chair.', 1),
    ('Zombie Life Coach', 'An undead mentor demanding better habits and stronger boundaries.', 1),
    ('Mailbox Influencer', 'A suburban mailbox with a shockingly curated personal brand.', 2),
    ('Dolphin Accountant', 'A marine mammal who somehow keeps impeccable spreadsheets.', 2),
    ('Suburban Gladiator', 'A cul-de-sac parent treating lawn disputes like arena combat.', 1),
    ('Time-Traveling Janitor', 'A cleaner who keeps accidentally mopping across centuries.', 2),
    ('Extremely Online Knight', 'A medieval warrior more worried about replies than dragons.', 1),
    ('Farmers Market Pirate', 'A produce-loving pirate aggressively haggling over heirloom tomatoes.', 2),
    ('Motivational Villain', 'A dramatic bad guy who gives unexpectedly useful pep talks.', 1),
    ('Moonlight Plumber', 'A late-night pipe fixer with the energy of a noir detective.', 2),
    ('Alien Exchange Student', 'A visitor from another galaxy trying to understand school lunch.', 1),
    ('Coworking Werewolf', 'A freelancer whose calendar becomes dangerous during the full moon.', 2),
    ('Coupon Warlord', 'A ruthless strategist who dominates grocery stores with paper discounts.', 1),
    ('Emergency Poet', 'A writer only summoned when a moment needs dramatic wording immediately.', 2),
    ('Tiny Mayor', 'A very small politician with huge civic ambitions.', 1),
    ('Fortune Cookie Lawyer', 'An attorney whose legal advice comes in cryptic one-line prophecies.', 3),
    ('Ghost Realtor', 'A spectral agent enthusiastically marketing charming haunted fixer-uppers.', 1),
    ('Medieval Influencer', 'A castle-era tastemaker curating chainmail looks for the masses.', 1),
    ('Cat Therapist', 'A licensed feline quietly judging your coping mechanisms.', 1),
    ('Dad Rock Bard', 'A lute player performing only power ballads about mowing lawns.', 2),
    ('Plague Doctor DJ', 'A masked party starter dropping beats from behind a beaked helmet.', 2),
    ('Campfire CEO', 'A wilderness leader turning every snack break into a quarterly review.', 1),
    ('Laser Tag Monk', 'A serene spiritual guide who becomes wildly competitive under neon lights.', 2),
    ('Cranky Cupid', 'A romance angel deeply annoyed by everyone involved.', 1),
    ('Yacht Club Sasquatch', 'A legendary forest creature insisting on boat shoes and linen.', 2),
    ('Spreadsheet Cowboy', 'A ranch hand who wrangles data more often than cattle.', 1),
    ('Goth Gardener', 'A brooding plant lover whispering encouragement to black roses.', 1),
    ('Smoothie Shaman', 'A mystical blender expert predicting futures through fruit combinations.', 2),
    ('Hall Monitor Dragon', 'A fire-breathing rule enforcer obsessed with orderly walking lines.', 2),
    ('Submarine Magician', 'An illusionist performing card tricks several stories underwater.', 3),
    ('Chaotic Astronaut', 'A space explorer who somehow loses important things in zero gravity.', 1)
)
insert into public.sayless_cards (title, description, points)
select seed.title, seed.description, seed.points
from seed
where not exists (
  select 1
  from public.sayless_cards existing
  where lower(existing.title) = lower(seed.title)
);

notify pgrst, 'reload schema';
