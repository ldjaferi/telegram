import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createApplication } from '../src/server.js';
import { createHmac } from 'node:crypto';
import { isWild } from '../src/game.js';
import { botReply } from '../src/bot.js';

test('group invitation connects signed Telegram colleagues to the waiting table without entering a code', async () => {
  const botToken = 'group-invitation-test-token', origin = 'https://example.test';
  const app = createApplication({ dev: false, port: 0, publicUrl: origin + '/okey', botUsername: 'GoyimGjurzi_bot', botToken, allowPublic: true });
  await app.listen(); const base = `http://127.0.0.1:${app.server.address().port}/okey`; const clients = [];
  const reply = botReply(app.config, { text: '/nisja', from: { id: 42, first_name: 'Ali' }, chat: { id: -100, type: 'supergroup' } }, app.arena);
  const startParam = new URL(reply.reply_markup.inline_keyboard[0][0].url).searchParams.get('startapp');
  async function connect(id) {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: `Player ${id}` }), start_param: startParam });
    const data = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
    const post = async (path, body, token = '') => {
      const res = await fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      assert.equal(res.status, 200); return res.json();
    };
    const login = await post('/api/login', { initData: params.toString() });
    const ticket = await post('/api/ticket', {}, login.token);
    const ws = new WebSocket(base.replace('http', 'ws') + '/socket?ticket=' + ticket.ticket, { origin }); clients.push(ws);
    const queue = [], waiters = [];
    ws.on('message', raw => { const m = JSON.parse(raw); if (waiters.length) waiters.shift()(m); else queue.push(m); });
    const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Socket timeout')), 4000);
      waiters.push(m => { clearTimeout(timer); resolve(m); });
    });
    const until = async predicate => { for (let i = 0; i < 20; i++) { const m = await next(); if (predicate(m)) return m; } throw Error('Missing state'); };
    const ready = await until(m => m.type === 'ready');
    assert.equal(ready.user.startParam, startParam);
    // This is the client's automatic invitation action after receiving ready.
    if (!ready.room) ws.send(JSON.stringify({ type: 'join', code: startParam.slice(5) }));
    return { ws, ready, until };
  }
  try {
    const host = await connect(42);
    assert.equal(host.ready.room.status, 'lobby'); assert.equal(host.ready.room.owner, '42');
    const guest = await connect(99);
    const joined = await guest.until(m => m.room?.players.length === 2);
    assert.equal(joined.room.code, host.ready.room.code); assert.equal(joined.room.status, 'lobby');
    await host.until(m => m.room?.players.length === 2);
    host.ws.send(JSON.stringify({ type: 'start' }));
    assert.match((await host.until(m => m.type === 'error')).message, /5 oder 7/);
    assert.equal(app.arena.roomFor('42').status, 'lobby');
    host.ws.send(JSON.stringify({ type: 'configure', mode: 'teams', roundLimit: 7 }));
    await guest.until(m => m.room?.roundLimit === 7);
    guest.ws.send(JSON.stringify({ type: 'configure', roundLimit: 5 }));
    assert.match((await guest.until(m => m.type === 'error')).message, /Gastgeber/);
    guest.ws.send(JSON.stringify({ type: 'start' }));
    assert.match((await guest.until(m => m.type === 'error')).message, /Gastgeber/);
    host.ws.send(JSON.stringify({ type: 'start' }));
    assert.equal((await guest.until(m => m.room?.status === 'playing')).room.players.length, 4);
  } finally { for (const ws of clients) ws.terminate(); await app.close(); }
});

test('real clients: rooms, secret hands, targeted gestures, surrender, reconnect and rejected tickets', async () => {
  const app = createApplication({ port: 0 }); const addr = await app.listen(); const base = `http://127.0.0.1:${addr.port}`;
  const connections = [];
  async function post(path, body = {}, token = '') {
    const response = await fetch(base + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
  }
  async function client(name, prior) {
    const login = prior || await post('/api/login', { name }); const ticket = await post('/api/ticket', {}, login.token);
    const ws = new WebSocket(`${base.replace('http', 'ws')}/socket?ticket=${ticket.ticket}`, { origin: base }); connections.push(ws);
    const queue = [], waiters = [];
    ws.on('message', raw => { const message = JSON.parse(raw); const waiter = waiters.shift(); if (waiter) waiter(message); else queue.push(message); });
    const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('message timeout')), 4000); waiters.push(m => { clearTimeout(timeout); resolve(m); }); });
    const until = async predicate => { for (let i = 0; i < 30; i++) { const m = await next(); if (predicate(m)) return m; } throw Error('No matching message'); };
    const ready = await until(m => m.type === 'ready');
    return { ws, login, ready, next, until, send: (type, data = {}) => ws.send(JSON.stringify({ type, ...data })) };
  }
  try {
    assert.equal((await fetch(base)).status, 200);
    const forbidden = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(forbidden.status, 403);
    assert.equal((await post('/api/ticket')).status, 401);
    const a = await client('Ali'), b = await client('Leyla');
    a.send('create', { solo: true });
    assert.match((await a.until(m => m.type === 'error')).message, /5 oder 7/);
    assert.equal(app.arena.roomFor(a.login.user.id), undefined);
    a.send('create'); const created = await a.until(m => m.room?.status === 'lobby'); const code = created.room.code;
    b.send('join', { code }); await b.until(m => m.room?.players.length === 2);
    b.send('start'); assert.equal((await b.until(m => m.type === 'error')).type, 'error');
    a.send('configure', { roundLimit: 5 }); a.send('start'); const av = (await a.until(m => m.room?.status === 'playing')).room; const bv = (await b.until(m => m.room?.status === 'playing')).room;
    assert.equal(av.hand.length, 15); assert.equal(bv.hand.length, 14); assert.equal(bv.players[0].hand, undefined);
    assert.equal(bv.hand.some(t => av.hand.some(x => x.id === t.id)), false);
    b.send('discard', { tileId: av.hand[0].id }); await b.until(m => m.type === 'error');
    a.send('gesture', { gesture: 'finger', target: b.login.user.id });
    const gesture = await b.until(m => m.room?.events.some(e => e.type === 'gesture'));
    assert.equal(gesture.room.events.at(-1).target, b.login.user.id);
    a.send('surrender'); const thrown = await b.until(m => m.room?.players[0].out);
    assert.equal(thrown.room.events.at(-1).type, 'throw'); assert.equal(thrown.room.status, 'playing'); assert.equal(thrown.room.turn, 1);
    a.ws.close(); await new Promise(resolve => a.ws.once('close', resolve));
    const again = await client('Ali', a.login); assert.equal(again.ready.room.code, code); assert.equal(again.ready.room.players[0].out, true);
  } finally { for (const ws of connections) ws.terminate(); await app.close(); }
});

test('production cannot use local login; development cannot bind publicly', async () => {
  assert.throws(() => createApplication({ dev: true, host: '0.0.0.0' }));
  assert.throws(() => createApplication({ dev: false }));
  const app = createApplication({ dev: false, port: 0, publicUrl: 'https://okey.example', botToken: 'test-token' }); await app.listen();
  try {
    const res = await fetch(`http://127.0.0.1:${app.server.address().port}/api/login`, { method: 'POST', headers: { Origin: 'https://okey.example', 'Content-Type': 'application/json' }, body: '{"name":"Impostor"}' });
    assert.equal(res.status, 401);
  } finally { await app.close(); }
});

test('production subpath: assets, signed Telegram login, allowed IDs and WebSocket upgrade', async () => {
  const token = 'test-bot-token';
  const app = createApplication({ dev: false, port: 0, publicUrl: 'https://example.test/okey', botToken: token, allowedIds: ['42'] }); await app.listen();
  const base = `http://127.0.0.1:${app.server.address().port}`; let ws;
  function signed(id) {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) });
    const data = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest(); params.set('hash', createHmac('sha256', secret).update(data).digest('hex')); return params.toString();
  }
  async function post(path, body, session = '') {
    return fetch(base + '/okey' + path, { method: 'POST', headers: { Origin: 'https://example.test', 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }, body: JSON.stringify(body) });
  }
  try {
    const redirect = await fetch(base + '/okey', { redirect: 'manual' }); assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/okey/');
    const html = await (await fetch(base + '/okey/')).text(); assert.match(html, /<base href="\/okey\/">/); assert.match(html, /src="app.js"/);
    assert.equal((await fetch(base + '/okey/art.svg')).status, 200);
    const art = await fetch(base + '/okey/bluff.svg'); assert.equal(art.status, 200); assert.match(await art.text(), /Comic-Männerbrust/);
    assert.equal((await fetch(base + '/okey/shisha.svg')).status, 200);
    for (const name of ['rack.js', 'music.js', 'melds.js', 'combinations.js']) { const module = await fetch(base + '/okey/' + name); assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /javascript/); }
    assert.equal((await post('/api/login', { initData: signed(99) })).status, 403);
    assert.notEqual((await post('/api/login', { initData: signed(42) + 'x' })).status, 200);
    const result = await post('/api/login', { initData: signed(42) }); assert.equal(result.status, 200); const login = await result.json();
    const ticket = await (await post('/api/ticket', {}, login.token)).json();
    ws = new WebSocket(`${base.replace('http', 'ws')}/okey/socket?ticket=${ticket.ticket}`, { origin: 'https://example.test' });
    const ready = await new Promise((resolve, reject) => { ws.once('message', raw => resolve(JSON.parse(raw))); ws.once('error', reject); });
    assert.equal(ready.user.id, '42'); assert.equal(ready.type, 'ready');
  } finally { ws?.terminate(); await app.close(); }
});

test('two real clients receive Joker-Bluff and shisha smoke; possession and table cooldown are enforced', async () => {
  const app = createApplication({ port: 0 }); const address = await app.listen(); const base = `http://127.0.0.1:${address.port}`; const clients = [];
  async function client(name) {
    const post = async (path, data, token = '') => (await fetch(base + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) })).json();
    const login = await post('/api/login', { name }), ticket = await post('/api/ticket', {}, login.token);
    const ws = new WebSocket(base.replace('http', 'ws') + '/socket?ticket=' + ticket.ticket, { origin: base }); clients.push(ws);
    const queue = [], waiters = [];
    ws.on('message', raw => { const m = JSON.parse(raw); if (waiters.length) waiters.shift()(m); else queue.push(m); });
    const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('No socket response')), 4000); waiters.push(m => { clearTimeout(timer); resolve(m); }); });
    const until = async check => { for (let i = 0; i < 30; i++) { const m = await next(); if (check(m)) return m; } throw Error('No matching response'); };
    await until(m => m.type === 'ready'); return { id: login.user.id, send: (type, data = {}) => ws.send(JSON.stringify({ type, ...data })), until };
  }
  try {
    const a = await client('Ali'), b = await client('Leyla'); a.send('create'); const lobby = await a.until(m => m.room?.code);
    b.send('join', { code: lobby.room.code }); await b.until(m => m.room?.players.length === 2); a.send('configure', { roundLimit: 5 }); a.send('start'); await a.until(m => m.room?.status === 'playing'); await b.until(m => m.room?.status === 'playing');
    const r = app.arena.roomFor(a.id);
    // Put both wild tiles back into the stock, then give Ali exactly one.
    for (const p of r.players) for (let i = 0; i < p.hand.length; i++) if (isWild(p.hand[i])) {
      const j = r.stock.findIndex(t => !isWild(t)); [p.hand[i], r.stock[j]] = [r.stock[j], p.hand[i]];
    }
    const j = r.stock.findIndex(t => isWild(t)); [r.players[0].hand[0], r.stock[j]] = [r.stock[j], r.players[0].hand[0]];
    b.send('bluff', { hasJoker: true }); assert.match((await b.until(m => m.type === 'error')).message, /Joker auf deinem Brett/);
    a.send('bluff');
    const av = (await a.until(m => m.room?.events.at(-1)?.type === 'bluff')).room;
    const bv = (await b.until(m => m.room?.events.at(-1)?.type === 'bluff')).room;
    assert.deepEqual(av.events.at(-1), bv.events.at(-1)); assert.equal(av.canBluff, true); assert.equal(bv.canBluff, false);
    assert.deepEqual(Object.keys(bv.events.at(-1)).sort(), ['at', 'name', 'player', 'seq', 'type']);
    assert.equal(bv.players[0].hand, undefined); assert.equal(bv.players[0].canBluff, undefined);
    a.send('bluff'); assert.match((await a.until(m => m.type === 'error')).message, /durchatmen/);
    b.send('shisha', { duration: 999999 });
    const smokeA = (await a.until(m => m.room?.events.at(-1)?.type === 'smoke')).room;
    const smokeB = (await b.until(m => m.room?.events.at(-1)?.type === 'smoke')).room;
    assert.deepEqual(smokeA.events.at(-1), smokeB.events.at(-1)); assert.equal(smokeA.events.at(-1).duration, 3000);
    assert.equal(smokeA.shishaReadyAt, smokeB.shishaReadyAt); assert.equal(smokeA.players[1].hand, undefined);
    a.send('shisha'); assert.match((await a.until(m => m.type === 'error')).message, /Pause/);
  } finally { for (const ws of clients) ws.terminate(); await app.close(); }
});
