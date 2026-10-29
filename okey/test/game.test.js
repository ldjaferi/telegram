import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, deck, isWild, winningHand, botDiscard, BLUFF_COOLDOWN_MS, SHISHA_COOLDOWN_MS, SMOKE_DURATION_MS } from '../src/game.js';
const joker = () => ({id:`j${seq++}`,joker:true});
let seq = 0;
const t = (color, number) => ({ id: `t${seq++}`, color, number });
const run = (color, numbers) => numbers.map(n => t(color, n));
const valid = () => [...run(0, [1, 2, 3]), ...run(1, [4, 5, 6]), ...run(2, [7, 8, 9, 10]), ...[0, 1, 2, 3].map(c => t(c, 11))];

test('106 unique physical tiles including two fixed jokers; hands and stock conserve the set', () => {
  assert.equal(deck().length, 106); assert.equal(new Set(deck().map(t => t.id)).size, 106);
  const a = new Arena(); const r = a.create({ id: 'a', name: 'A' }, true);
  assert.deepEqual(r.players.map(p => p.hand.length), [15, 14, 14, 14]);
  assert.equal(r.stock.length, 49); assert.equal(r.indicator, undefined); assert.equal(deck().filter(isWild).length,2);
  assert.equal(new Set([...r.stock, ...r.players.flatMap(p => p.hand)].map(t => t.id)).size, 106);
});
test('exact classic melds, high ace, forbidden wraparound and identical pairs', () => {
  assert.equal(winningHand(valid()), 'melds');
  const high = [...run(0, [12, 13, 1]), ...valid().slice(3)];
  assert.equal(winningHand(high), 'melds');
  assert.equal(winningHand([...run(0, [13, 1, 2]), ...valid().slice(3)]), null);
  assert.equal(winningHand([...run(0, [1, 1, 1]), ...valid().slice(3)]), null);
  assert.equal(winningHand(Array.from({ length: 7 }, (_, i) => [t(0, i + 1), t(0, i + 1)]).flat()), 'pairs');
  assert.equal(winningHand(Array.from({ length: 7 }, (_, i) => [t(0, i * 2 + 1), t(1, i * 2 + 1)]).flat()), null);
  assert.equal(winningHand(valid().slice(1)), null);
});
test('only the two printed jokers are wild; every numbered tile keeps its value', () => {
  const hand=valid();hand[1]=joker();assert.equal(winningHand(hand),'melds');
  hand[1]=t(3,13);assert.equal(winningHand(hand),null);
  for(const tile of deck())assert.equal(isWild(tile),tile.id.startsWith('joker-'));
  const pairs=Array.from({length:7},(_,i)=>[t(0,i+1),t(0,i+1)]).flat();pairs[0]=joker();assert.equal(winningHand(pairs),'pairs');
});

test('turn authority, draw count, invalid wins and private snapshots', () => {
  const a = new Arena(); const r = a.create({ id: 'a', name: 'A' }, true);
  assert.throws(() => a.draw('a', 'stock')); assert.throws(() => a.discard(r.players[1].id, r.players[1].hand[0].id));
  assert.throws(() => a.discard('a', 'foreign-tile'));
  r.players[0].hand = [...valid(), t(2, 13)];
  const unwanted = r.players[0].hand.at(-1).id;
  assert.throws(() => a.discard('a', r.players[0].hand[0].id, true)); assert.equal(r.players[0].hand.length, 15);
  const snapshot = a.snapshot(r, 'a');
  assert.equal(snapshot.players[1].hand, undefined); assert.equal(snapshot.stock, undefined);
  assert.equal(snapshot.hand.length, 15); assert.equal(snapshot.revealed, null);
  a.discard('a', unwanted, true); assert.equal(r.status, 'finished'); assert.equal(r.result.winner, 'a'); assert.equal(r.players[0].wins, 1);
});
test('surrender is public, retains spectators, skips their turn and gives last seat the win', () => {
  const a = new Arena(); const r = a.create({ id: 'a', name: 'A' }, true);
  a.surrender('a'); assert.equal(r.turn, 1); assert.equal(r.status, 'playing'); assert.equal(r.players[0].out, true);
  assert.equal(a.snapshot(r, r.players[1].id).events.at(-1).type, 'throw');
  assert.throws(() => a.surrender('a')); a.gesture('a', 'fart', r.players[1].id);
  assert.throws(() => a.gesture('a', 'finger')); assert.throws(() => a.gesture('a', 'fake'));
  a.surrender(r.players[2].id); a.surrender(r.players[1].id);
  assert.equal(r.result.winner, r.players[3].id); assert.equal(r.result.kind, 'last');
});
test('discard draws remove only the offered tile; bots finish valid hands', () => {
  const a = new Arena(); const r = a.create({ id: 'a', name: 'A' }, true); const tile = r.players[0].hand[0];
  a.discard('a', tile.id); const id = r.players[1].id; a.draw(id, 'discard');
  assert.equal(r.players[1].hand.at(-1).id, tile.id); assert.equal(r.discards[0].length, 0);
  assert.equal(r.lastDiscard, null); assert.throws(() => a.draw(id, 'stock'));
  const hand = [...valid(), t(2, 13)]; assert.equal(botDiscard(hand).id, hand.at(-1).id);
});
test('empty stock ends in a draw; owner transfers on leaving', () => {
  const a = new Arena(); const r = a.create({ id: 'a', name: 'A' }); a.join({ id: 'b', name: 'B' }, r.code); a.start('a');
  a.discard('a', r.players[0].hand[0].id); r.stock = []; a.draw('b', 'stock'); assert.equal(r.result.kind, 'stock');
  a.leave('a'); assert.equal(r.owner, 'b'); a.start('b'); assert.equal(r.status, 'playing');
});
test('complete automatic games terminate and preserve physical tile ownership', () => {
  let now = 0; const a = new Arena({ now: () => now, turnMs: 1000 });
  for (let game = 0; game < 6; game++) {
    const r = a.create({ id: `human-${game}`, name: 'Test' }, true);
    for (let step = 0; step < 350 && r.status === 'playing'; step++) {
      now += 2000; a.tick();
      const all = [...r.stock, ...r.discards.flat(), ...r.players.flatMap(p => p.hand)];
      assert.equal(all.length, 106); assert.equal(new Set(all.map(t => t.id)).size, 106);
    }
    assert.equal(r.status, 'finished');
  }
});

test('Joker-Bluff requires a current real joker and only broadcasts the announcement', () => {
  let now = 10000;
  const a = new Arena({ now: () => now }); const r = a.create({ id: 'a', name: 'Ali' });
  assert.throws(() => a.bluff('a'), /laufenden Runde/); a.start('a');
  const p = r.players[0]; p.hand = [...valid(), t(0, 13)];
  assert.equal(a.snapshot(r, 'a').canBluff, false);
  assert.throws(() => a.bluff('a'), /Joker auf deinem Brett/);
  p.hand[0] = t(3,13);
  assert.throws(() => a.bluff('a'), /Joker auf deinem Brett/);
  p.hand[0] = joker(); const original = structuredClone(p.hand), turn = r.turn, phase = r.phase;
  assert.equal(a.snapshot(r, 'a').canBluff, true);
  a.bluff('a');
  assert.deepEqual(p.hand, original); assert.equal(r.turn, turn); assert.equal(r.phase, phase);
  assert.deepEqual(r.events.at(-1), { seq: r.seq, type: 'bluff', at: now, player: 'a', name: 'Ali' });
  assert.equal(a.snapshot(r, 'a').bluffReadyAt, now + BLUFF_COOLDOWN_MS);
  assert.equal(a.snapshot(r, r.players[1].id).players[0].canBluff, undefined);
  assert.equal(a.snapshot(r, r.players[1].id).players[0].hand, undefined);
  assert.throws(() => a.bluff('a'), /durchatmen/);
  now += BLUFF_COOLDOWN_MS; r.turn = 1; a.bluff('a'); // Off-turn announcements are allowed.
  p.hand[0] = t(0, 13); now += BLUFF_COOLDOWN_MS;
  assert.equal(a.snapshot(r, 'a').canBluff, false); assert.throws(() => a.bluff('a'), /Joker auf deinem Brett/);
  p.hand[0] = t(3, 13); a.surrender('a');
  assert.equal(a.snapshot(r, 'a').canBluff, false); assert.throws(() => a.bluff('a'), /laufenden Runde/);
  p.out = false; r.status = 'finished'; assert.throws(() => a.bluff('a'), /laufenden Runde/);
});

test('strong shisha draws share a table cooldown, last three seconds and do not change play', () => {
  let now = 10000; const a = new Arena({ now: () => now }); const r = a.create({ id: 'a', name: 'Ali' });
  assert.throws(() => a.shisha('a'), /laufenden Runde/); a.start('a');
  const before = JSON.stringify({ hands: r.players.map(p => p.hand), stock: r.stock, turn: r.turn, phase: r.phase, deadline: r.deadline });
  const offTurn = r.players[1].id; a.shisha(offTurn);
  assert.equal(JSON.stringify({ hands: r.players.map(p => p.hand), stock: r.stock, turn: r.turn, phase: r.phase, deadline: r.deadline }), before);
  assert.deepEqual(r.events.at(-1), { seq: r.seq, type: 'smoke', at: now, player: offTurn, name: r.players[1].name, duration: 3000 });
  assert.equal(SMOKE_DURATION_MS, 3000); assert.equal(a.snapshot(r, 'a').shishaReadyAt, now + SHISHA_COOLDOWN_MS);
  assert.throws(() => a.shisha('a'), /Pause/); now += SHISHA_COOLDOWN_MS; a.shisha('a');
  a.surrender(offTurn); assert.throws(() => a.shisha(offTurn), /laufenden Runde/);
  r.status = 'finished'; assert.throws(() => a.shisha('a'), /laufenden Runde/);
});

test('occasional small puffs pick an active player, broadcast once and do not force a turn', () => {
  let now = 1000; const a = new Arena({ now: () => now }); const r = a.create({ id: 'a', name: 'Ali' }, true);
  r.players[1].out = true; r.players[2].bot = false; r.players[2].connected = false;
  r.nextPuffAt = now; const turn = r.turn, phase = r.phase, hands = JSON.stringify(r.players.map(p => p.hand));
  const changed = a.tick(); assert.deepEqual(changed, [r]); const puff = r.events.at(-1);
  assert.equal(puff.type, 'puff'); assert.ok(['a', r.players[3].id].includes(puff.player));
  assert.equal(r.turn, turn); assert.equal(r.phase, phase); assert.equal(JSON.stringify(r.players.map(p => p.hand)), hands);
  assert.ok(r.nextPuffAt >= now + 18000); assert.deepEqual(a.tick(), []);
  r.status = 'finished'; r.nextPuffAt = now; assert.deepEqual(a.tick(), []);
});

test('every seat publishes its last discard, marks a taken tile, and clears history next round',()=>{
  const a=new Arena();const r=a.create({id:'a',name:'A'},true);
  assert.deepEqual(a.snapshot(r,'a').lastDiscards,[null,null,null,null]);
  for(let seat=0;seat<4;seat++){
    const p=r.players[seat];if(seat>0)a.draw(p.id,seat===1?'discard':'stock');
    const tile=p.hand[0];a.discard(p.id,tile.id);
    for(const guest of r.players){const snap=a.snapshot(r,guest.id);assert.equal(snap.lastDiscards[seat].tile.id,tile.id);assert.equal(snap.lastDiscards[seat].taken,false);assert.ok(snap.players.every(p=>p.hand===undefined));}
  }
  const snap=a.snapshot(r,'a');assert.ok(snap.lastDiscards.every(Boolean));assert.equal(snap.lastDiscards[0].taken,true);
  assert.equal(snap.availableDiscard.id,snap.lastDiscards[3].tile.id);
  a.finish(r,null,'stock');a.start('a');assert.deepEqual(a.snapshot(r,'a').lastDiscards,[null,null,null,null]);
});
