-- GOLF&DRINK: initial schema (phase 0)
create extension if not exists postgis;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null,
  avatar_url text,
  phone_hash text unique,
  birth_date date,
  created_at timestamptz not null default now()
);

create table friendships (
  user_id uuid references profiles on delete cascade,
  friend_id uuid references profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  primary key (user_id, friend_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid references teams on delete cascade,
  user_id uuid references profiles on delete cascade,
  role text not null default 'member',
  primary key (team_id, user_id)
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','live','finished')),
  default_par int not null default 5,
  started_at timestamptz,
  ended_at timestamptz
);

create table round_players (
  round_id uuid references rounds on delete cascade,
  user_id uuid references profiles on delete cascade,
  share_location boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  external_place_id text unique,
  name text not null,
  location geography(point, 4326)
);

create table holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds on delete cascade,
  venue_id uuid references venues,
  number int not null,
  par int not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (round_id, number)
);

create table drinks (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references holes on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  type text not null default 'beer' check (type in ('beer','shot')),
  volume_ml int,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table sip_events (
  id uuid primary key default gen_random_uuid(),
  drink_id uuid not null references drinks on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  undone boolean not null default false
);

create table locations_live (
  user_id uuid references profiles on delete cascade,
  round_id uuid references rounds on delete cascade,
  location geography(point, 4326) not null,
  accuracy real,
  updated_at timestamptz not null default now(),
  primary key (user_id, round_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds on delete cascade,
  team_id uuid references teams on delete cascade,
  inviter_id uuid not null references profiles,
  phone_hash text,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  expires_at timestamptz not null default now() + interval '2 days'
);

-- Score per player and round: finished beers -> sips - par, shots -> -2 each
create view round_scores with (security_invoker = true) as
select
  h.round_id,
  d.user_id,
  coalesce(sum(case when d.type = 'beer' and d.finished_at is not null
    then (select count(*) from sip_events s where s.drink_id = d.id and not s.undone) - h.par
    else 0 end), 0)
  - 2 * count(*) filter (where d.type = 'shot') as score
from drinks d
join holes h on h.id = d.hole_id
group by h.round_id, d.user_id;

-- Helpers for Row Level Security
create function is_round_member(rid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from round_players where round_id = rid and user_id = auth.uid());
$$;

alter table profiles enable row level security;
alter table friendships enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table rounds enable row level security;
alter table round_players enable row level security;
alter table venues enable row level security;
alter table holes enable row level security;
alter table drinks enable row level security;
alter table sip_events enable row level security;
alter table locations_live enable row level security;
alter table invites enable row level security;

create policy "profiles readable by signed-in users" on profiles for select to authenticated using (true);
create policy "own profile write" on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own friendships" on friendships for all to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid()) with check (user_id = auth.uid());
create policy "venues readable" on venues for select to authenticated using (true);
create policy "round members read rounds" on rounds for select to authenticated using (is_round_member(id));
create policy "round members read players" on round_players for select to authenticated using (is_round_member(round_id));
create policy "join self" on round_players for insert to authenticated with check (user_id = auth.uid());
create policy "update own sharing" on round_players for update to authenticated using (user_id = auth.uid());
create policy "round members read holes" on holes for select to authenticated using (is_round_member(round_id));
create policy "round members read drinks" on drinks for select to authenticated
  using (is_round_member((select round_id from holes where id = hole_id)));
create policy "write own drinks" on drinks for insert to authenticated with check (user_id = auth.uid());
create policy "round members read sips" on sip_events for select to authenticated
  using (is_round_member((select h.round_id from drinks d join holes h on h.id = d.hole_id where d.id = drink_id)));
create policy "write own sips" on sip_events for insert to authenticated with check (user_id = auth.uid());
create policy "see locations of own round" on locations_live for select to authenticated using (is_round_member(round_id));
create policy "write own location" on locations_live for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- teams, team_members, rounds insert, holes insert and invites are added in the next migration together with Edge Functions.
