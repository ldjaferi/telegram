import { randomInt, randomBytes } from 'node:crypto';
import { TEAM_QUESTIONS, TEAM_MESSAGE_MS } from '../public/team-chat.js';
import { bestCombinations } from '../public/combinations.js';
import { canMakeExcuse, excuseLines } from '../public/table-fun.js';

export const GESTURES = ['finger', 'buj', 'fart', 'tea', 'besa', 'excuse'];
export const BLUFF_COOLDOWN_MS = 8000;
export const SMOKE_DURATION_MS = 3000;
export const SHISHA_COOLDOWN_MS = 15000;
const BOT_NAMES = ['Onkel Cengiz', 'Tante Leyla', 'Çay-König'];
export function deck() {
  const tiles = [];
  for (let copy = 0; copy < 2; copy++) for (let color = 0; color < 4; color++)
    for (let number = 1; number <= 13; number++) tiles.push({ id: `${copy}-${color}-${number}`, color, number });
  return [...tiles, { id: 'joker-0', joker: true }, { id: 'joker-1', joker: true }];
}
export const isWild = tile => tile.joker === true;
export const valueOf = tile => tile;

// Exact partition into runs/sets, including 12-13-1 and seven identical pairs.
export function winningHand(hand) {
  if (hand.length !== 14) return null;
  const counts = Array(52).fill(0);
  let wilds = 0;
  for (const tile of hand) {
    if (isWild(tile)) wilds++;
    else { const v = valueOf(tile); counts[v.color * 13 + v.number - 1]++; }
  }
  if (counts.reduce((n, v) => n + v % 2, 0) <= wilds) return 'pairs';
  const failed = new Set();
  function solve(jokers, remaining) {
    if (!remaining) return true;
    const first = counts.findIndex(n => n > 0);
    if (first < 0) return remaining >= 3;
    const key = `${jokers}:${counts.join('')}`;
    if (failed.has(key)) return false;
    const color = Math.floor(first / 13), number = first % 13 + 1;
    function tryMeld(indices) {
      if (indices.length > remaining) return false;
      const used = []; let cost = 0;
      for (const i of indices) { if (counts[i]) { counts[i]--; used.push(i); } else cost++; }
      const ok = cost <= jokers && solve(jokers - cost, remaining - indices.length);
      for (const i of used) counts[i]++;
      return ok;
    }
    for (let mask = 1; mask < 16; mask++) {
      if (!(mask & (1 << color))) continue;
      const colors = [0, 1, 2, 3].filter(c => mask & (1 << c));
      if (colors.length >= 3 && tryMeld(colors.map(c => c * 13 + number - 1))) return true;
    }
    for (let start = 1; start <= 12; start++) for (let end = start + 2; end <= 14; end++) {
      if (start === 1 && end === 14) continue;
      if (!(number >= start && number <= end) && !(number === 1 && end === 14)) continue;
      const run = Array.from({ length: end - start + 1 }, (_, i) => color * 13 + (start + i - 1) % 13);
      if (tryMeld(run)) return true;
    }
    failed.add(key); return false;
  }
  return solve(wilds, 14) ? 'melds' : null;
}

function usefulness(tile, hand) {
  if (isWild(tile)) return 100;
  const a = valueOf(tile);
  let score = 0; const colors = new Set();
  for (const other of hand) {
    if (other.id === tile.id || isWild(other)) continue;
    const b = valueOf(other);
    if (a.number === b.number && a.color !== b.color) colors.add(b.color);
    if (a.color === b.color) {
      const d = Math.abs(a.number - b.number);
      if (d === 1 || (a.number === 1 && b.number === 13) || (a.number === 13 && b.number === 1)) score += 3;
      if (d === 2 || (a.number === 1 && b.number === 12) || (a.number === 12 && b.number === 1)) score += 1;
      if (d === 0) score += 0.4;
    }
  }
  return score + colors.size * 3 + (colors.size >= 2 ? 3 : 0);
}
export function botDiscard(hand) {
  for (const tile of [...hand].sort((a,b) => Number(isWild(b)) - Number(isWild(a)))) if (winningHand(hand.filter(t => t.id !== tile.id))) return tile;
  return [...hand].sort((a, b) => usefulness(a, hand) - usefulness(b, hand))[0];
}

export class Arena {
  constructor({ now = () => Date.now(), turnMs = 120000 } = {}) { this.rooms = new Map(); this.now = now; this.turnMs = turnMs; }
  roomFor(id) { return [...this.rooms.values()].find(r => r.players.some(p => p.id === id)); }
  groupTable(user, chatId) {
    const group = String(chatId);
    const existing = [...this.rooms.values()].find(r => r.groupChatId === group);
    if (existing) { existing.humanActivity = this.now(); existing.touched = this.now(); return existing; }
    if (this.roomFor(user.id)) throw Error('Du sitzt bereits an einem anderen Tisch. Verlasse ihn zuerst im Spiel und sende dann erneut /nisja.');
    const room = this.create(user);
    room.groupChatId = group;
    room.players[0].connected = false;
    return room;
  }
  player(user, bot = false) { return { id: user.id, name: user.name, bot, hand: [], out: false, wins: 0, connected: true, lastGesture: -Infinity }; }
  create(user, solo = false, options = {}) {
    if (this.roomFor(user.id)) throw Error('Verlasse zuerst deinen aktuellen Tisch.');
    if (this.rooms.size >= 100) throw Error('Alle Tische sind belegt.');
    let code; do { code = randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const mode = options.mode ?? (solo ? 'individual' : 'teams'), roundLimit = options.roundLimit ?? 5;
    if (!['teams', 'individual'].includes(mode) || ![5, 7].includes(roundLimit)) throw Error('Wähle Teams oder Einzel und 5 oder 7 Runden.');
    const r = { mode, roundLimit, roundLimitChosen: options.roundLimit !== undefined, scores: [], totals: Array(mode === 'teams' ? 2 : 4).fill(0), matchComplete: false, matchWinners: [], matchNumber: 1, code, owner: user.id, players: [this.player(user)], status: 'lobby', round: 0, events: [], seq: 0, humanActivity: this.now(), touched: this.now() };
    this.rooms.set(code, r);
    if (solo) this.start(user.id);
    return r;
  }
  seatChoices(r) {
    return { code: r.code, mode: r.mode, round: r.round, roundLimit: r.roundLimit,
      players: r.players.map((p, seat) => ({ id: p.id, name: p.name, seat, team: seat % 2,
        available: p.bot && (r.status !== 'playing' || !p.out) })) };
  }
  join(user, code, botId) {
    const old = this.roomFor(user.id);
    if (old?.code === code) return old;
    if (old) throw Error('Verlasse zuerst deinen aktuellen Tisch.');
    const r = this.rooms.get(code);
    if (!r) throw Error('Diesen Tisch gibt es nicht mehr.');
    const choose = message => { throw Object.assign(Error(message), { code: 'choose_seat', choices: this.seatChoices(r) }); };
    let vacant = r.players.findIndex(p => p.bot);
    if (r.round > 0 || botId !== undefined) {
      if (botId === undefined) choose('Wähle einen Computerplatz und spiel direkt mit.');
      vacant = r.players.findIndex(p => p.id === botId && p.bot && (r.status !== 'playing' || !p.out));
      if (vacant < 0) choose('Dieser Platz ist nicht mehr frei. Wähle einen anderen Computer.');
    }
    if (vacant < 0 && r.players.length >= 4) throw Error('Der Tisch ist voll. Alle vier Plätze sind bereits besetzt.');
    if (vacant >= 0) {
      // Seat, tiles, scores and turn phase belong to the ongoing game, not to the bot identity.
      const previous = r.players[vacant];
      r.players[vacant] = { ...previous, id: user.id, name: user.name, bot: false, connected: true };
      if (r.teamMessages) delete r.teamMessages[vacant % 2];
      if (r.status === 'playing' && r.turn === vacant) this.deadline(r);
      this.event(r, 'seat-taken', { player: user.id, name: user.name, previousName: previous.name });
    } else r.players.push(this.player(user));
    r.humanActivity = this.now(); r.touched = this.now(); return r;
  }
  chooseTeam(id, team) {
    const r = this.roomFor(id);
    if (!r || r.status !== 'lobby' || r.round || r.mode !== 'teams' || ![0, 1].includes(team)) throw Error('Teams können nur vor der Partie gewählt werden.');
    while (r.players.length < 4) r.players.push(this.player({id:`seat-${r.code}-${r.players.length}`,name:'Freier Platz'}, true));
    const from = r.players.findIndex(p => p.id === id);
    if (from % 2 === team) return;
    const to = r.players.findIndex((p,i) => i % 2 === team && p.bot);
    if (to < 0) throw Error('Dieses Team ist bereits voll.');
    [r.players[from],r.players[to]] = [r.players[to],r.players[from]];
  }
  event(r, type, data = {}) { r.events.push({ seq: ++r.seq, type, at: this.now(), ...data }); r.events = r.events.slice(-20); r.touched = this.now(); }
  configure(id, options = {}) {
    const r = this.roomFor(id);
    if (!r || r.owner !== id || r.round !== 0) throw Error('Nur der Gastgeber kann vor der Partie die Regeln ändern.');
    const mode = options.mode ?? r.mode, roundLimit = options.roundLimit ?? r.roundLimit;
    if (!['teams', 'individual'].includes(mode) || ![5, 7].includes(roundLimit)) throw Error('Wähle Teams oder Einzel und 5 oder 7 Runden.');
    r.mode = mode; r.roundLimit = roundLimit; if (options.roundLimit !== undefined) r.roundLimitChosen = true; r.totals = Array(mode === 'teams' ? 2 : 4).fill(0); r.touched = this.now();
  }
  newMatch(id) {
    const r = this.roomFor(id);
    if (!r || r.owner !== id || !r.matchComplete) throw Error('Erst die aktuelle Partie beenden.');
    r.round = 0; r.scores = []; r.totals.fill(0); r.matchComplete = false; r.matchWinners = [];
    r.roundLimitChosen = false; r.matchNumber++; r.status = 'lobby'; r.result = null;
    for (const p of r.players) { p.hand = []; p.out = false; p.lastDraw = null; }
    this.event(r, 'new-match');
  }
  start(id) {
    const r = this.roomFor(id);
    if (!r || r.owner !== id || r.status === 'playing' || r.matchComplete) throw Error('Nur der Gastgeber kann die nächste Runde starten.');
    while (r.players.length < 4) { const i = r.players.length - 1; r.players.push(this.player({ id: `bot-${r.code}-${i}`, name: BOT_NAMES[i] }, true)); }
    const tiles = deck();
    for (let i = tiles.length - 1; i > 0; i--) { const j = randomInt(i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
    r.teamMessages = {}; r.round++; r.turn = (r.round - 1) % 4; r.phase = 'discard'; r.status = 'playing'; r.result = null; r.winningHand = null; r.discards = [[], [], [], []]; r.lastDiscard = null; r.lastDiscards = [null, null, null, null];
    r.shishaReadyAt = 0; r.nextPuffAt = this.now() + 14000 + randomInt(10000);
    for (let i = 0; i < 4; i++) { r.players[i].hand = tiles.splice(0, i === r.turn ? 15 : 14); r.players[i].out = false; r.players[i].lastDraw = null; }
    r.stock = tiles; this.deadline(r); this.event(r, 'start'); return r;
  }
  deadline(r) { r.deadline = this.now() + this.turnMs; r.botAt = this.now() + 1400; r.thinkerShown = false; }
  requireTurn(id, phase) {
    const r = this.roomFor(id); const p = r?.players.find(p => p.id === id);
    if (!r || r.status !== 'playing' || p.out || r.players[r.turn].id !== id || r.phase !== phase) throw Error('Du bist damit noch nicht dran.');
    return [r, p];
  }
  draw(id, source) {
    const [r, p] = this.requireTurn(id, 'draw');
    if (source !== 'stock' && source !== 'discard') throw Error('Ungültiger Stapel.');
    let tile;
    if (source === 'discard') {
      if (!r.lastDiscard || !r.discards[r.lastDiscard.seat].length) throw Error('Hier liegt kein Stein.');
      tile = r.discards[r.lastDiscard.seat].pop();
      if (r.lastDiscards[r.lastDiscard.seat]) r.lastDiscards[r.lastDiscard.seat].taken = true;
      r.lastDiscard = null;
    } else {
      if (!r.stock.length) { this.finish(r, null, 'stock'); return; }
      tile = r.stock.pop();
    }
    p.hand.push(tile); p.lastDraw = { id: tile.id, at: this.now() }; r.phase = 'discard'; r.botAt = this.now() + 700; r.touched = this.now();
  }
  discard(id, tileId, claim = false) {
    const [r, p] = this.requireTurn(id, 'discard');
    const index = p.hand.findIndex(t => t.id === tileId);
    if (index < 0) throw Error('Dieser Stein gehört dir nicht.');
    const remaining = p.hand.filter(t => t.id !== tileId);
    const kind = winningHand(remaining);
    if (claim && !kind) throw Object.assign(Error('A budall ie a'), { code: 'invalid_claim' });
    const [tile] = p.hand.splice(index, 1); r.discards[r.turn].push(tile); r.lastDiscard = { seat: r.turn }; r.lastDiscards[r.turn] = { tile, taken: false };
    this.event(r, 'discard', { player: id });
    if (claim && kind) { this.finish(r, p, kind, isWild(tile)); return; }
    this.next(r);
  }
  onlyOneSide(r) { return r.mode === 'teams' ? new Set(r.players.flatMap((p, seat) => p.out ? [] : [seat % 2])).size <= 1 : r.players.filter(p => !p.out).length <= 1; }
  next(r) {
    if (this.onlyOneSide(r)) { this.finish(r, r.players.find(p => !p.out), 'last'); return; }
    do { r.turn = (r.turn + 1) % 4; } while (r.players[r.turn].out);
    r.phase = 'draw'; this.deadline(r);
  }
  finish(r, player, kind, joker = false) {
    if (r.status !== 'playing') return;
    r.status = 'finished'; r.result = { winner: player?.id || null, name: player?.name || null, kind, joker };
    r.winningHand = player && kind !== 'last' ? [...player.hand] : null;
    if (player) player.wins++;
    const winnerSeat = player ? r.players.indexOf(player) : -1;
    const winner = winnerSeat < 0 ? -1 : r.mode === 'teams' ? winnerSeat % 2 : winnerSeat;
    const points = Array(r.totals.length).fill(0);
    const penalties = r.players.map((p, seat) => {
      const team = r.mode === 'teams' ? seat % 2 : seat;
      const value = team === winner ? 0 : bestCombinations(p.hand).points;
      points[team] += value * (joker ? 2 : 1);
      return value;
    });
    if (winner >= 0 && joker) points[winner] = -10;
    r.scores.push({ round: r.round, points, penalties, winner, joker, kind, names: r.players.map(p => p.name) });
    r.totals = r.totals.map((n, i) => n + points[i]);
    r.matchComplete = r.round >= r.roundLimit;
    if (r.matchComplete) r.matchWinners = r.totals.flatMap((n, i) => n === Math.min(...r.totals) ? [i] : []);
    this.event(r, 'finish', { player: player?.id, joker });
  }
  surrender(id) {
    const r = this.roomFor(id); const p = r?.players.find(p => p.id === id);
    if (!r || r.status !== 'playing' || p.out) throw Error('Du bist nicht in einer laufenden Runde.');
    if (r.teamMessages) delete r.teamMessages[r.players.indexOf(p) % 2];
    p.out = true; this.event(r, 'throw', { player: id, name: p.name });
    if (this.onlyOneSide(r)) this.finish(r, r.players.find(p => !p.out), 'last');
    else if (r.players[r.turn].id === id) this.next(r);
    return r;
  }
  teamPair(id) {
    const r = this.roomFor(id), seat = r?.players.findIndex(p => p.id === id);
    const me = r?.players[seat], partner = r?.players[(seat + 2) % 4];
    if (!r || r.mode !== 'teams' || r.status !== 'playing' || !me || me.out) throw Error('Teamfragen sind nur in einer laufenden Teamrunde möglich.');
    if (!partner || partner.bot || partner.out) throw Error('Dafür brauchst du einen mitspielenden menschlichen Teampartner.');
    return { r, me, partner, team: seat % 2 };
  }
  askTeam(id, question) {
    const { r, me, partner, team } = this.teamPair(id);
    if (typeof question !== 'string' || !Object.hasOwn(TEAM_QUESTIONS, question)) throw Error('Unbekannte Teamfrage.');
    if (!partner.connected) throw Error('Dein Teampartner ist gerade nicht verbunden.');
    const previous = r.teamMessages?.[team];
    if (previous && previous.expiresAt > this.now() && !previous.answer) throw Error('Eure letzte Frage wartet noch auf eine Antwort.');
    if (this.now() - (me.lastTeamQuestion ?? -Infinity) < 3000) throw Error('Warte kurz vor der nächsten Teamfrage.');
    me.lastTeamQuestion = this.now();
    r.teamMessages ||= {};
    r.teamMessages[team] = { id: randomBytes(8).toString('hex'), from: id, to: partner.id, question, answer: null, at: this.now(), expiresAt: this.now() + TEAM_MESSAGE_MS };
    r.touched = this.now();
  }
  answerTeam(id, messageId, answer) {
    const { r, team } = this.teamPair(id), message = r.teamMessages?.[team];
    if (!message || message.id !== messageId || message.to !== id || message.answer || message.expiresAt <= this.now()) throw Error('Diese Teamfrage ist nicht mehr offen.');
    if (typeof answer !== 'string' || !Object.hasOwn(TEAM_QUESTIONS[message.question].answers, answer)) throw Error('Unbekannte Antwort.');
    message.answer = answer; message.answeredAt = this.now(); message.expiresAt = this.now() + TEAM_MESSAGE_MS;
    r.touched = this.now();
  }
  teamMessage(r, id) {
    if (r.status !== 'playing' || r.mode !== 'teams') return null;
    const seat = r.players.findIndex(p => p.id === id), message = r.teamMessages?.[seat % 2];
    if (!message || message.expiresAt <= this.now() || ![message.from, message.to].includes(id)) return null;
    if (![message.from, message.to].every(id => r.players.some(p => p.id === id && !p.out && !p.bot))) return null;
    return { ...message };
  }
  gesture(id, gesture, target) {
    const r = this.roomFor(id), p = r?.players.find(p => p.id === id);
    if (!r || !GESTURES.includes(gesture)) throw Error('Unbekannte Geste.');
    if (gesture === 'besa' && (r.status !== 'playing' || p.out)) throw Error('Besa gibt es während deiner laufenden Runde.');
    if (gesture === 'excuse' && !canMakeExcuse(r, r.players.indexOf(p))) throw Error('Ausreden gibt es nach einer Niederlage.');
    if (gesture === 'besa' || gesture === 'excuse') target = null;
    if (target && (!r.players.some(p => p.id === target) || target === id)) throw Error('Wähle einen Mitspieler.');
    if (this.now() - p.lastGesture < 2500) throw Error('Erst mal Luft holen.');
    const lines = gesture === 'excuse' ? excuseLines(r.mode) : null;
    p.lastGesture = this.now(); this.event(r, 'gesture', { player: id, name: p.name, gesture, target: target || null,
      ...(lines ? { line: lines[randomInt(lines.length)] } : {}) });
  }
  bluff(id) {
    const r = this.roomFor(id), p = r?.players.find(p => p.id === id);
    if (!r || r.status !== 'playing' || p.out) throw Error('Joker-Bluff geht nur während deiner laufenden Runde.');
    if (!p.hand.some(tile => isWild(tile))) throw Error('Für den Joker-Bluff brauchst du einen Joker auf deinem Brett.');
    if (this.now() < (p.lastBluff ?? -Infinity) + BLUFF_COOLDOWN_MS || this.now() - p.lastGesture < 2500) throw Error('Brust raus. Kurz durchatmen. Gleich kannst du wieder bluffen.');
    p.lastBluff = this.now(); p.lastGesture = this.now();
    this.event(r, 'bluff', { player: id, name: p.name });
  }
  shisha(id) {
    const r = this.roomFor(id), p = r?.players.find(p => p.id === id);
    if (!r || r.status !== 'playing' || p.out) throw Error('Ein fester Zug geht nur während deiner laufenden Runde.');
    if (this.now() < r.shishaReadyAt) throw Error('Erst wieder klare Sicht. Die Shisha braucht kurz Pause.');
    r.shishaReadyAt = this.now() + SHISHA_COOLDOWN_MS;
    r.nextPuffAt = Math.max(r.nextPuffAt, this.now() + 8000);
    this.event(r, 'smoke', { player: id, name: p.name, duration: SMOKE_DURATION_MS });
  }
  leave(id) {
    const r = this.roomFor(id); if (!r) return null;
    const p = r.players.find(p => p.id === id);
    if (r.teamMessages) delete r.teamMessages[r.players.indexOf(p) % 2];
    if (r.status === 'playing' && !p.out) this.surrender(id);
    // A departing player becomes a vacant, surrendered seat until the round ends.
    if (r.round > 0) { p.id = `left-${randomBytes(4).toString('hex')}`; p.bot = true; p.connected = false; }
    else r.players = r.players.filter(p => p.id !== id);
    if (r.owner === id) r.owner = r.players.find(p => !p.bot)?.id;
    if (!r.players.some(p => !p.bot)) this.rooms.delete(r.code);
    return r;
  }
  tick() {
    const changed = new Set();
    for (const r of this.rooms.values()) {
      if (this.now() - r.humanActivity >= 600000) { this.rooms.delete(r.code); r.expired = true; changed.add(r); continue; }
      if (r.status !== 'playing') continue;
      if (this.now() >= r.nextPuffAt) {
        const smokers = r.players.filter(p => !p.out && (p.bot || p.connected));
        if (smokers.length) {
          const smoker = smokers[randomInt(smokers.length)];
          this.event(r, 'puff', { player: smoker.id, name: smoker.name }); changed.add(r);
        }
        r.nextPuffAt = this.now() + 18000 + randomInt(12000);
      }
      const p = r.players[r.turn], automatic = p.bot && this.now() >= r.botAt, timedOut = this.now() >= r.deadline;
      if (!p.bot && p.connected && !p.out && !timedOut && !r.thinkerShown && this.now() >= r.deadline - this.turnMs + 45000) {
        r.thinkerShown = true;
        this.event(r, 'thinker', { player: p.id, name: p.name }); changed.add(r);
      }
      if (!automatic && !timedOut) continue;
      if (r.phase === 'draw') {
        const offer = r.lastDiscard ? r.discards[r.lastDiscard.seat].at(-1) : null;
        const candidate = offer ? [...p.hand, offer] : null;
        const bestDiscard = candidate ? botDiscard(candidate) : null;
        const take = offer && (winningHand(candidate.filter(t => t.id !== bestDiscard.id)) ||
          (bestDiscard.id !== offer.id && usefulness(offer, p.hand) > Math.min(...p.hand.map(t => usefulness(t, p.hand)))));
        this.draw(p.id, take ? 'discard' : 'stock');
      } else {
        const tile = botDiscard(p.hand);
        this.discard(p.id, tile.id, Boolean(winningHand(p.hand.filter(t => t.id !== tile.id))));
        if (timedOut && !p.bot) this.event(r, 'timeout', { player: p.id, name: p.name });
      }
      changed.add(r);
    }
    return [...changed];
  }
  snapshot(r, id) {
    const me = r.players.find(p => p.id === id);
    return {
      code: r.code, owner: r.owner, status: r.status, round: r.round, turn: r.turn, phase: r.phase,
      mode: r.mode, roundLimit: r.roundLimit, roundLimitChosen: r.roundLimitChosen, scores: r.scores, totals: r.totals, matchComplete: r.matchComplete, matchWinners: r.matchWinners, matchNumber: r.matchNumber,
      teamMessage: this.teamMessage(r, id), lastDraw: me?.lastDraw || null, rules: 'fixed-jokers', stockCount: r.stock?.length || 0, deadline: r.deadline, serverNow: this.now(), result: r.result,
      hand: me?.hand || [], players: r.players.map((p, seat) => ({ seat, team: seat % 2, id: p.id, name: p.name, bot: p.bot, out: p.out, connected: p.connected, count: p.hand.length, wins: p.wins })),
      canBluff: Boolean(r.status === 'playing' && me && !me.out && me.hand.some(tile => isWild(tile))),
      bluffReadyAt: Math.max(Number.isFinite(me?.lastBluff) ? me.lastBluff + BLUFF_COOLDOWN_MS : 0, Number.isFinite(me?.lastGesture) ? me.lastGesture + 2500 : 0),
      shishaReadyAt: r.shishaReadyAt || 0,
      lastDiscards: r.lastDiscards || [],
      discards: r.discards?.map(pile => pile.at(-1) || null) || [],
      availableDiscard: r.lastDiscard ? r.discards[r.lastDiscard.seat].at(-1) : null,
      revealed: r.status === 'finished' ? r.winningHand : null,
      events: r.events
    };
  }
}
