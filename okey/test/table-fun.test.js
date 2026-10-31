import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/game.js';
import { teaBill, excuseLines } from '../public/table-fun.js';

function table(mode = 'teams', now = () => 1000) {
  const arena = new Arena({ now });
  const room = arena.create({ id: 'a', name: 'Arben' }, false, { mode, roundLimit: 5 });
  for (const [id, name] of [['b', 'Blerim'], ['c', 'Dritan'], ['d', 'Ilir']]) arena.join({ id, name }, room.code);
  arena.start('a'); room.nextPuffAt = Infinity;
  return { arena, room };
}

test('Besa is a bluff with or without a joker; it never exposes or changes a hand', () => {
  let now = 1000; const { arena, room } = table('teams', () => now);
  for (const joker of [false, true]) {
    room.players[0].hand = [{ id: 'secret', ...(joker ? { joker: true } : { color: 0, number: 8 }) }];
    const before = structuredClone(room.players.map(p => p.hand));
    arena.gesture('a', 'besa', 'b');
    const event = arena.snapshot(room, 'b').events.at(-1);
    assert.equal(event.gesture, 'besa'); assert.equal(event.target, null);
    assert.deepEqual(Object.keys(event).sort(), ['at', 'gesture', 'name', 'player', 'seq', 'target', 'type']);
    assert.equal(arena.snapshot(room, 'b').players[0].hand, undefined);
    assert.deepEqual(room.players.map(p => p.hand), before);
    assert.equal(room.turn, 0); assert.equal(room.phase, 'discard');
    assert.throws(() => arena.gesture('a', 'besa'), /Luft/); now += 2500;
  }
  room.players[0].out = true; assert.throws(() => arena.gesture('a', 'besa'), /laufenden/);
  room.players[0].out = false; arena.finish(room, room.players[0], 'melds');
  assert.throws(() => arena.gesture('a', 'besa'), /laufenden/);
});

test('only the losing side can make excuses; all clients receive the same server-selected line', () => {
  const { arena, room } = table();
  assert.throws(() => arena.gesture('b', 'excuse'), /Niederlage/);
  arena.finish(room, room.players[0], 'melds');
  for (const id of ['a', 'c']) assert.throws(() => arena.gesture(id, 'excuse'), /Niederlage/);
  arena.gesture('b', 'excuse', 'a');
  const event = room.events.at(-1);
  assert.ok(excuseLines('teams').includes(event.line)); assert.equal(event.target, null);
  for (const p of room.players) assert.deepEqual(arena.snapshot(room, p.id).events.at(-1), event);
  assert.throws(() => arena.gesture('b', 'excuse'), /Luft/);
  room.matchComplete = true; room.matchWinners = [1];
  assert.throws(() => arena.gesture('d', 'excuse'), /Niederlage/, 'final winners differ from last round winners');
  arena.gesture('a', 'excuse');
  room.matchWinners = [0, 1]; assert.throws(() => arena.gesture('c', 'excuse'), /Niederlage/, 'tied champions have not lost');
  assert.ok(!excuseLines('individual').some(line => line.includes('Teampartner')));
});

test('Çay bill uses team penalties including joker doubling, handles ties, and never changes scores', () => {
  const { arena, room } = table();
  room.players[1].hand = [{ id: 'b13', color: 0, number: 13 }];
  room.players[3].hand = [{ id: 'd8', color: 1, number: 8 }];
  arena.finish(room, room.players[0], 'melds', true);
  const before = structuredClone(room.scores);
  assert.deepEqual(teaBill(room).payers, [{ label: 'Team B', names: ['Blerim', 'Ilir'], points: 42 }]);
  assert.deepEqual(room.scores, before); assert.deepEqual(room.totals, [-10, 42]);
  room.matchComplete = true; room.totals = [90, 60];
  assert.equal(teaBill(room).payers[0].label, 'Team A'); assert.equal(teaBill(room).scope, 'Ganze Partie');
  room.totals = [60, 60]; assert.equal(teaBill(room).payers.length, 2);
  room.totals = [0, 0]; assert.equal(teaBill(room).payers.length, 0);
  room.status = 'playing'; assert.equal(teaBill(room), null);
});

test('individual Çay bill names all tied highest scorers from the completed round', () => {
  const { arena, room } = table('individual');
  arena.finish(room, room.players[0], 'melds');
  room.scores.at(-1).points = [0, 20, 40, 40];
  room.players[2].name = 'A later seat occupant';
  assert.deepEqual(teaBill(room).payers.map(p => p.label), ['Dritan', 'Ilir']);
});

test('Denkmeister happens once after 45 seconds per human turn, never for bots or expired turns', () => {
  let now = 0; const { arena, room } = table('teams', () => now);
  const thinkers = () => room.events.filter(e => e.type === 'thinker');
  now = 44999; arena.tick(); assert.equal(thinkers().length, 0);
  now = 45000; assert.ok(arena.tick().includes(room)); assert.equal(thinkers().length, 1);
  assert.equal(thinkers()[0].name, 'Arben');
  now = 50000; arena.tick(); assert.equal(thinkers().length, 1);
  arena.discard('a', room.players[0].hand[0].id);
  now = 95000; arena.tick(); assert.equal(thinkers().length, 2); assert.equal(thinkers()[1].name, 'Blerim');
  arena.draw('b', 'stock'); now += 1000; arena.tick(); assert.equal(thinkers().length, 2, 'drawing does not reset the joke');
  arena.discard('b', room.players[1].hand[0].id);
  room.players[2].bot = true; room.botAt = Infinity; now += 45000; arena.tick(); assert.equal(thinkers().length, 2);
  room.players[2].bot = false; now = room.deadline; arena.tick(); assert.equal(thinkers().length, 2);
});

test('Buj uses every line before repeating, independent of other events, rounds and callers', async () => {
  const { bujLines } = await import('../public/table-fun.js');
  let now = 1000; const { arena, room } = table('teams', () => now), heard = [];
  assert.equal(new Set(bujLines).size, bujLines.length);
  for (let i = 0; i < bujLines.length * 3; i++) {
    const caller = room.players[i % 4].id;
    now += 2500; arena.gesture(caller, 'buj');
    const event = room.events.at(-1);
    assert.ok(bujLines.includes(event.line));
    assert.ok(!heard.slice(-(bujLines.length - 1)).includes(event.line), 'a line cannot repeat among the most recent twenty');
    for (const p of room.players) assert.equal(arena.snapshot(room, p.id).events.at(-1).line, event.line);
    heard.push(event.line);
    const rotation = [...room.bujRotation];
    assert.throws(() => arena.gesture(caller, 'buj'), /Luft/);
    assert.deepEqual(room.bujRotation, rotation, 'rejected gestures do not consume a line');
    // Twenty unrelated events reproduced the former seq % 21 repetition.
    for (let n = 0; n < 20; n++) arena.event(room, 'puff', { player: 'a', name: 'Arben' });
    if (i === 7) { arena.finish(room, room.players[0], 'melds'); arena.start('a'); }
    assert.equal(arena.snapshot(room, caller).bujRotation, undefined);
  }
  for (let start = 0; start < heard.length; start += bujLines.length)
    assert.deepEqual(new Set(heard.slice(start, start + bujLines.length)), new Set(bujLines));
});
