export type Hole = { id: string; number: number; par: number; closed_at: string | null; venue: string };
export type Drink = { id: string; hole_id: string; user_id: string; type: 'beer' | 'shot'; finished_at: string | null };
export type Player = { user_id: string; nickname: string };

export type HoleCell = { score: number | null; inProgressSips: number; shots: number };
export type ScoreRow = { player: Player; cells: Record<string, HoleCell>; total: number };

/**
 * Golf scoring: each finished beer scores (sips - par), each shot scores -2.
 * Lower is better. A beer still in progress does not count yet.
 */
export function buildScorecard(
  players: Player[],
  holes: Hole[],
  drinks: Drink[],
  sipsByDrink: Record<string, number>
): ScoreRow[] {
  const parByHole: Record<string, number> = {};
  for (const h of holes) parByHole[h.id] = h.par;

  const rows = players.map((player) => {
    const cells: Record<string, HoleCell> = {};
    for (const h of holes) cells[h.id] = { score: null, inProgressSips: 0, shots: 0 };
    let total = 0;
    for (const d of drinks) {
      if (d.user_id !== player.user_id || !cells[d.hole_id]) continue;
      const cell = cells[d.hole_id];
      if (d.type === 'shot') {
        cell.shots += 1;
        cell.score = (cell.score ?? 0) - 2;
        total -= 2;
      } else if (d.finished_at) {
        const s = (sipsByDrink[d.id] ?? 0) - parByHole[d.hole_id];
        cell.score = (cell.score ?? 0) + s;
        total += s;
      } else {
        cell.inProgressSips = sipsByDrink[d.id] ?? 0;
      }
    }
    return { player, cells, total };
  });
  return rows.sort((a, b) => a.total - b.total);
}

export function formatScore(n: number): string {
  return n > 0 ? `+${n}` : n === 0 ? 'E' : `${n}`;
}
