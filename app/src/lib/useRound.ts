import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Drink, Hole, Player } from './score';

export type RoundInfo = { id: string; name: string; status: string; join_code: string; default_par: number; created_by: string | null };

export function useRound(roundId: string) {
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [sipsByDrink, setSipsByDrink] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [r, p, h] = await Promise.all([
      supabase.from('rounds').select('id, name, status, join_code, default_par, created_by').eq('id', roundId).single(),
      supabase.from('round_players').select('user_id, profiles(nickname)').eq('round_id', roundId),
      supabase.from('holes').select('id, number, par, closed_at, venues(name)').eq('round_id', roundId).order('number'),
    ]);
    const err = r.error ?? p.error ?? h.error;
    if (err) return setError(err.message);
    setRound(r.data as RoundInfo);
    setPlayers(
      (p.data ?? []).map((x: any) => ({ user_id: x.user_id, nickname: x.profiles?.nickname ?? '?' }))
    );
    const hs: Hole[] = (h.data ?? []).map((x: any) => ({
      id: x.id, number: x.number, par: x.par, closed_at: x.closed_at, venue: x.venues?.name ?? 'Podnik',
    }));
    setHoles(hs);
    if (hs.length === 0) {
      setDrinks([]);
      setSipsByDrink({});
      return;
    }
    const d = await supabase.from('drinks').select('id, hole_id, user_id, type, finished_at').in('hole_id', hs.map((x) => x.id));
    if (d.error) return setError(d.error.message);
    const ds = (d.data ?? []) as Drink[];
    setDrinks(ds);
    const beerIds = ds.filter((x) => x.type === 'beer').map((x) => x.id);
    if (beerIds.length === 0) return setSipsByDrink({});
    const s = await supabase.from('sip_events').select('drink_id').in('drink_id', beerIds).eq('undone', false);
    if (s.error) return setError(s.error.message);
    const counts: Record<string, number> = {};
    for (const row of s.data ?? []) counts[row.drink_id] = (counts[row.drink_id] ?? 0) + 1;
    setSipsByDrink(counts);
    setError(null);
  }, [roundId]);

  // Coalesce bursts of realtime events into one reload
  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`round-${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holes', filter: `round_id=eq.${roundId}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sip_events' }, scheduleLoad)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [roundId, load, scheduleLoad]);

  return { round, players, holes, drinks, sipsByDrink, error, reload: load };
}
