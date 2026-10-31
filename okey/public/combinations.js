import { rackMatch } from './rack.js';
import { winningGroups } from './melds.js';

// Exact weighted set packing over physical tiles (at most 15), not a greedy sort.
// Single pairs only count when the entire fourteen-tile hand is seven pairs.
export function bestCombinations(hand) {
  if (hand.length > 15) throw Error('Maximal 15 Steine.');
  const win = hand.length === 14 ? winningGroups(hand) : null;
  if (win) return { points: 0, groups: win.groups.map(g => g.tiles.map(e => e.tile)), rest: [] };
  const n = hand.length, full = (1 << n) - 1, candidates = Array.from({ length: n }, () => []);
  for (let mask = 1; mask <= full; mask++) {
    const tiles = []; let value = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { tiles.push(hand[i]); value += hand[i].joker ? 0 : hand[i].number; }
    if (tiles.length < 3 || tiles.length > 13) continue;
    const match = rackMatch(tiles);
    if (!match?.complete || match.kind === 'pair') continue;
    const group = { mask, value, ids: match.ids };
    for (let i = 0; i < n; i++) if (mask & (1 << i)) candidates[i].push(group);
  }
  const memo = new Map([[0, { value: 0, count: 0, groups: [] }]]);
  function solve(mask) {
    if (memo.has(mask)) return memo.get(mask);
    const i = 31 - Math.clz32(mask & -mask);
    let best = solve(mask & ~(1 << i));
    for (const group of candidates[i]) if ((group.mask & mask) === group.mask) {
      const tail = solve(mask ^ group.mask), value = group.value + tail.value, count = group.ids.length + tail.count;
      // Equal coverage: keep long runs intact instead of splitting them into smaller melds.
      if (value > best.value || (value === best.value && (count > best.count || (count === best.count && 1 + tail.groups.length < best.groups.length)))) best = { value, count, groups: [group.ids, ...tail.groups] };
    }
    memo.set(mask, best); return best;
  }
  const best = solve(full), used = new Set(best.groups.flat()), byId = new Map(hand.map(t => [t.id, t]));
  const rest = hand.filter(t => !used.has(t.id));
  return { points: rest.reduce((sum, t) => sum + (t.joker ? 0 : t.number), 0), groups: best.groups.map(ids => ids.map(id => byId.get(id))), rest };
}
