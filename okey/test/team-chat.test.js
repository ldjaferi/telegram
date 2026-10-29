import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/game.js';
import { TEAM_QUESTIONS, TEAM_MESSAGE_MS } from '../public/team-chat.js';

function table() {
  let now = 10000;
  const a = new Arena({ now: () => now });
  const r = a.create({ id: 'a', name: 'Ali' }, false, { mode: 'teams', roundLimit: 5 });
  for (const id of ['b', 'c', 'd']) a.join({ id, name: id }, r.code);
  a.start('a');
  return { a, r, advance: ms => { now += ms; } };
}

test('team questions and every fixed answer stay between opposite seats, separate teams are independent', () => {
  const { a, r, advance } = table(), events = structuredClone(r.events);
  for (const [question, definition] of Object.entries(TEAM_QUESTIONS)) for (const answer of Object.keys(definition.answers)) {
    a.askTeam('a', question);
    const message = a.snapshot(r, 'c').teamMessage;
    assert.equal(message.from, 'a'); assert.equal(message.to, 'c'); assert.equal(message.question, question);
    assert.deepEqual(a.snapshot(r, 'a').teamMessage, message);
    assert.equal(a.snapshot(r, 'b').teamMessage, null); assert.equal(a.snapshot(r, 'd').teamMessage, null);
    assert.equal(a.snapshot(r, 'outsider').teamMessage, null);
    a.askTeam('b', 'status'); const other = a.snapshot(r, 'd').teamMessage;
    assert.equal(other.from, 'b'); assert.equal(other.to, 'd');
    assert.throws(() => a.answerTeam('a', message.id, answer), /nicht mehr offen/);
    assert.throws(() => a.answerTeam('b', message.id, answer), /nicht mehr offen/);
    assert.throws(() => a.answerTeam('c', 'stale-id', answer), /nicht mehr offen/);
    assert.throws(() => a.answerTeam('c', message.id, question === 'close' ? 'strong' : 'yes'), /Unbekannte Antwort/);
    a.answerTeam('c', message.id, answer);
    assert.equal(a.snapshot(r, 'a').teamMessage.answer, answer);
    assert.deepEqual(a.snapshot(r, 'd').teamMessage, other);
    assert.throws(() => a.answerTeam('c', message.id, answer), /nicht mehr offen/);
    a.answerTeam('d', other.id, 'strong'); advance(TEAM_MESSAGE_MS);
  }
  assert.deepEqual(r.events, events);
});

test('pending questions, cooldown, expiry and fixed message validation', () => {
  const { a, r, advance } = table();
  for (const question of ['__proto__', 'constructor', 'free text', ['close'], null]) assert.throws(() => a.askTeam('a', question), /Unbekannte Teamfrage/);
  a.askTeam('a', 'close'); let message = a.snapshot(r, 'c').teamMessage;
  assert.throws(() => a.askTeam('c', 'status'), /wartet noch/);
  assert.throws(() => a.askTeam('a', 'status'), /wartet noch/);
  for (const answer of ['__proto__', 'constructor', 'free text', ['yes'], null]) assert.throws(() => a.answerTeam('c', message.id, answer), /Unbekannte Antwort/);
  a.answerTeam('c', message.id, 'yes');
  assert.throws(() => a.askTeam('a', 'status'), /Warte kurz/);
  advance(3000); a.askTeam('a', 'status'); message = a.snapshot(r, 'c').teamMessage;
  advance(TEAM_MESSAGE_MS); assert.equal(a.snapshot(r, 'a').teamMessage, null);
  assert.throws(() => a.answerTeam('c', message.id, 'strong'), /nicht mehr offen/);
  a.askTeam('c', 'status'); assert.equal(a.snapshot(r, 'a').teamMessage.from, 'c');
});

test('team questions reject unavailable partners, other modes and clear on departure, surrender and new rounds', () => {
  for (const unavailable of ['bot', 'out']) {
    const { a, r } = table(); r.players[2][unavailable] = true;
    assert.throws(() => a.askTeam('a', 'close'), /menschlichen Teampartner/);
  }
  const { a, r } = table(); r.players[2].connected = false;
  assert.throws(() => a.askTeam('a', 'close'), /nicht verbunden/);
  r.players[2].connected = true; r.mode = 'individual';
  assert.throws(() => a.askTeam('a', 'close'), /Teamrunde/);
  r.mode = 'teams'; a.askTeam('a', 'close'); const message = a.snapshot(r, 'c').teamMessage;
  r.players[2].connected = false; r.players[2].connected = true;
  assert.deepEqual(a.snapshot(r, 'c').teamMessage, message);
  a.finish(r, null, 'stock'); assert.equal(a.snapshot(r, 'c').teamMessage, null);
  a.start('a'); assert.equal(a.snapshot(r, 'c').teamMessage, null);
  for (const action of ['surrender', 'leave']) {
    const { a, r } = table(); a.askTeam('a', 'close'); a[action]('c');
    assert.equal(a.snapshot(r, 'a').teamMessage, null);
    assert.throws(() => a.askTeam('a', 'status'), /menschlichen Teampartner/);
  }
});

test('invalid Mshile has distinctive error without changing hand or turn; Buj replaces nose', () => {
  const { a, r } = table();
  r.players[0].hand = Array.from({ length: 15 }, (_, i) => ({ id: `bad-${i}`, color: 0, number: i === 14 ? 11 : 8 }));
  const before = structuredClone(r);
  assert.throws(() => a.discard('a', 'bad-0', true), { message: 'A budall ie a', code: 'invalid_claim' });
  assert.deepEqual(r, before);
  assert.throws(() => a.gesture('a', 'nose'), /Unbekannte Geste/);
  a.gesture('a', 'buj'); assert.equal(r.events.at(-1).gesture, 'buj');
});
