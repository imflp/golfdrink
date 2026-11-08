-- GOLF&DRINK: rounds, holes, sips and shots (phase 1)
-- Game actions go through security definer functions so the client never
-- writes game tables directly and every action is checked for membership.

alter table rounds alter column team_id drop not null;
alter table rounds add column name text not null default 'Kolo';
alter table rounds add column created_by uuid references profiles;
alter table rounds add column join_code text unique
  default upper(substr(md5(gen_random_uuid()::text), 1, 6));

create or replace function require_member(rid uuid) returns void
language plpgsql security definer stable set search_path = public as $$
begin
  if auth.uid() is null or not is_round_member(rid) then
    raise exception 'Nie si hráčom tohto kola';
  end if;
end;
$$;

-- Create a round and join it as its first player
create or replace function create_round(p_name text, p_par int default 5)
returns rounds language plpgsql security definer set search_path = public as $$
declare r rounds;
begin
  if auth.uid() is null then raise exception 'Nie si prihlásený'; end if;
  if p_par is null or p_par < 1 or p_par > 30 then raise exception 'Par musí byť 1 až 30'; end if;
  insert into rounds (name, default_par, status, started_at, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Kolo'), p_par, 'live', now(), auth.uid())
  returning * into r;
  insert into round_players (round_id, user_id) values (r.id, auth.uid());
  return r;
end;
$$;

-- Join a running round with its 6-character code
create or replace function join_round(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'Nie si prihlásený'; end if;
  select id into rid from rounds
  where join_code = upper(trim(p_code)) and status <> 'finished';
  if rid is null then raise exception 'Kolo s týmto kódom neexistuje alebo už skončilo'; end if;
  insert into round_players (round_id, user_id) values (rid, auth.uid())
  on conflict do nothing;
  return rid;
end;
$$;

-- Open the next hole (bar); closes the previous one
create or replace function open_hole(p_round uuid, p_venue text)
returns holes language plpgsql security definer set search_path = public as $$
declare h holes; v uuid; n int; p int;
begin
  perform require_member(p_round);
  if (select status from rounds where id = p_round) = 'finished' then
    raise exception 'Kolo už skončilo';
  end if;
  update holes set closed_at = now() where round_id = p_round and closed_at is null;
  insert into venues (name) values (coalesce(nullif(trim(p_venue), ''), 'Podnik')) returning id into v;
  select coalesce(max(number), 0) + 1 into n from holes where round_id = p_round;
  select default_par into p from rounds where id = p_round;
  insert into holes (round_id, venue_id, number, par) values (p_round, v, n, p) returning * into h;
  return h;
end;
$$;

create or replace function current_hole(p_round uuid) returns holes
language sql security definer stable set search_path = public as $$
  select * from holes where round_id = p_round and closed_at is null
  order by number desc limit 1;
$$;

-- +1 sip on the player's open beer in the current hole (starts a beer if none)
create or replace function add_sip(p_round uuid)
returns int language plpgsql security definer set search_path = public as $$
declare h holes; d uuid; c int;
begin
  perform require_member(p_round);
  h := current_hole(p_round);
  if h.id is null then raise exception 'Najprv otvor jamku (podnik)'; end if;
  select id into d from drinks
  where hole_id = h.id and user_id = auth.uid() and type = 'beer' and finished_at is null
  order by started_at desc limit 1;
  if d is null then
    insert into drinks (hole_id, user_id, type, volume_ml) values (h.id, auth.uid(), 'beer', 500)
    returning id into d;
  end if;
  insert into sip_events (drink_id, user_id) values (d, auth.uid());
  select count(*) into c from sip_events where drink_id = d and not undone;
  return c;
end;
$$;

-- Undo the last sip on the open beer
create or replace function undo_sip(p_round uuid)
returns int language plpgsql security definer set search_path = public as $$
declare h holes; d uuid; s uuid; c int;
begin
  perform require_member(p_round);
  h := current_hole(p_round);
  select id into d from drinks
  where hole_id = h.id and user_id = auth.uid() and type = 'beer' and finished_at is null
  order by started_at desc limit 1;
  if d is null then return 0; end if;
  select id into s from sip_events where drink_id = d and not undone order by created_at desc limit 1;
  if s is not null then update sip_events set undone = true where id = s; end if;
  select count(*) into c from sip_events where drink_id = d and not undone;
  return c;
end;
$$;

-- Mark the open beer as finished; its score becomes sips - par
create or replace function finish_beer(p_round uuid)
returns int language plpgsql security definer set search_path = public as $$
declare h holes; d uuid; c int;
begin
  perform require_member(p_round);
  h := current_hole(p_round);
  select id into d from drinks
  where hole_id = h.id and user_id = auth.uid() and type = 'beer' and finished_at is null
  order by started_at desc limit 1;
  if d is null then raise exception 'Nemáš rozpité pivo'; end if;
  select count(*) into c from sip_events where drink_id = d and not undone;
  if c = 0 then raise exception 'Pivo bez glgu sa nedá dopiť'; end if;
  update drinks set finished_at = now() where id = d;
  return c - h.par;
end;
$$;

-- A shot: -2 to the total score
create or replace function add_shot(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare h holes;
begin
  perform require_member(p_round);
  h := current_hole(p_round);
  if h.id is null then raise exception 'Najprv otvor jamku (podnik)'; end if;
  insert into drinks (hole_id, user_id, type, volume_ml, finished_at)
  values (h.id, auth.uid(), 'shot', 40, now());
end;
$$;

-- Only the creator ends the round; location sharing stops with it
create or replace function finish_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rounds where id = p_round and created_by = auth.uid()) then
    raise exception 'Kolo môže ukončiť len ten, kto ho založil';
  end if;
  update holes set closed_at = now() where round_id = p_round and closed_at is null;
  update rounds set status = 'finished', ended_at = now() where id = p_round;
  delete from locations_live where round_id = p_round;
end;
$$;

revoke execute on function create_round, join_round, open_hole, current_hole, add_sip,
  undo_sip, finish_beer, add_shot, finish_round, require_member from public, anon;
grant execute on function create_round, join_round, open_hole, current_hole, add_sip,
  undo_sip, finish_beer, add_shot, finish_round to authenticated;

-- Live updates for the scorecard
alter publication supabase_realtime add table holes, drinks, sip_events, round_players;
