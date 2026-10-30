import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/game.js';
import { createApplication } from '../src/server.js';
import { createHmac } from 'node:crypto';
import { WebSocket } from 'ws';

for (const mode of ['teams', 'individual']) test(`bot takeover preserves the running ${mode} game and current turn`, () => {
  let now = 0;
  const arena = new Arena({ now: () => now }), r = arena.create({ id: 'host', name: 'Host' }, true, { mode, roundLimit: 7 });
  arena.discard('host', r.players[0].hand[0].id);
  const bot = r.players[1], hand = [...bot.hand], stock = [...r.stock], discards = structuredClone(r.discards);
  r.totals[0] = 23; bot.wins = 2;
  assert.throws(() => arena.join({ id: 'guest', name: 'Guest' }, r.code), e => e.code === 'choose_seat' && e.choices.players.filter(p => p.available).length === 3);
  assert.equal(arena.roomFor('guest'), undefined);
  now = 110000;
  arena.join({ id: 'guest', name: 'Guest' }, r.code, bot.id);
  assert.deepEqual(r.players[1].hand, hand); assert.deepEqual(r.stock, stock); assert.deepEqual(r.discards, discards);
  assert.equal(r.players[1].wins, 2); assert.equal(r.totals[0], 23); assert.equal(r.round, 1);
  assert.equal(r.owner, 'host'); assert.equal(r.turn, 1); assert.equal(r.phase, 'draw'); assert.equal(r.deadline, now + 120000);
  now += 2000; arena.tick(); assert.equal(r.phase, 'draw', 'old bot timer no longer controls the seat');
  arena.draw('guest', 'stock'); assert.equal(r.players[1].hand.length, 15);
  assert.equal(arena.snapshot(r, 'guest').players[1].team, 1);
  assert.equal(arena.snapshot(r, 'host').hand.some(t => hand.some(h => h.id === t.id)), false);
});

test('takeover after a bot draw keeps its exact hand, last draw and discard obligation', () => {
  const arena = new Arena(), r = arena.create({ id: 'host', name: 'Host' }, true);
  arena.discard('host', r.players[0].hand[0].id);
  const bot = r.players[1]; arena.draw(bot.id, 'stock');
  const before = structuredClone(bot), deadline = r.deadline;
  arena.join({ id: 'guest', name: 'Guest' }, r.code, bot.id);
  assert.deepEqual(r.players[1].hand, before.hand); assert.deepEqual(r.players[1].lastDraw, before.lastDraw);
  assert.equal(r.phase, 'discard'); assert.ok(r.deadline >= deadline);
  assert.throws(() => arena.draw('guest', 'stock'));
  arena.discard('guest', before.hand[0].id); assert.equal(r.turn, 2);
});

test('stale choices, human seats, departed seats and cross-table moves cannot replace people or resurrect surrendered players', () => {
  const arena = new Arena(), r = arena.create({ id: 'host', name: 'Host' }, true);
  const botId = r.players[1].id;
  arena.join({ id: 'first', name: 'First' }, r.code, botId);
  assert.throws(() => arena.join({ id: 'second', name: 'Second' }, r.code, botId), e => e.code === 'choose_seat');
  assert.equal(arena.roomFor('second'), undefined);
  assert.throws(() => arena.join({ id: 'second', name: 'Second' }, r.code, 'host'), e => e.code === 'choose_seat');
  assert.equal(arena.join({ id: 'first', name: 'First' }, r.code, r.players[2].id), r, 'existing players return to their own seat');
  assert.equal(r.players[1].id, 'first');
  arena.create({ id: 'other', name: 'Other' });
  assert.throws(() => arena.join({ id: 'other', name: 'Other' }, r.code, r.players[2].id), /aktuellen Tisch/);
  arena.leave('first'); const departed = r.players[1];
  assert.equal(departed.out, true);
  assert.throws(() => arena.join({ id: 'second', name: 'Second' }, r.code, departed.id), e => e.code === 'choose_seat');
  assert.equal(arena.seatChoices(r).players[1].available, false);
});

test('finished round scores and revealed winning hand survive replacement, including next round', () => {
  const arena = new Arena(), r = arena.create({ id: 'host', name: 'Host' }, true);
  const winner = r.players[2]; arena.finish(r, winner, 'melds');
  const history = structuredClone(r.scores), totals = [...r.totals], result = { ...r.result }, hand = [...winner.hand];
  arena.join({ id: 'guest', name: 'Guest' }, r.code, winner.id);
  assert.deepEqual(r.scores, history); assert.deepEqual(r.totals, totals); assert.deepEqual(r.result, result);
  assert.deepEqual(arena.snapshot(r, 'host').revealed, hand);
  arena.start('host'); assert.equal(r.players[2].id, 'guest'); assert.equal(r.players[2].bot, false);
  assert.equal(arena.snapshot(r, 'guest').revealed, null);
});

test('fully occupied and expired tables offer no takeover, and the preview does not extend inactivity', () => {
  let now = 0;
  const arena = new Arena({now:()=>now}), r = arena.create({id:'host',name:'Host'},true);
  for (const seat of [1,2,3]) arena.join({id:`human-${seat}`,name:`Human ${seat}`},r.code,r.players[seat].id);
  now = 590000;
  assert.throws(()=>arena.join({id:'fifth',name:'Fifth'},r.code),error=>error.code==='choose_seat'&&error.choices.players.every(p=>!p.available));
  assert.equal(r.humanActivity,0);
  now=600000;arena.tick();
  assert.throws(()=>arena.join({id:'fifth',name:'Fifth'},r.code),/nicht mehr/);
});

test('signed Telegram and browser guests select seats over WebSocket, race safely and reconnect without private hand previews', async () => {
  const origin = 'https://example.test', botToken = 'takeover-test-token';
  const app = createApplication({ dev: false, port: 0, allowPublic: true, publicUrl: origin + '/okey', botToken });
  await app.listen(); const base = `http://127.0.0.1:${app.server.address().port}/okey`, sockets = [];
  const room = app.arena.create({ id: 'host', name: 'Host' }, true, { mode: 'teams', roundLimit: 5 });
  async function client(name, telegram = false, prior) {
    let initData = '';
    if (telegram) {
      const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now()/1000)), user: JSON.stringify({ id: 99, first_name: name }), start_param: `room_${room.code}` });
      const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
      p.set('hash', createHmac('sha256', key).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
      initData = p.toString();
    }
    async function post(path, body, token = '') {
      const res = await fetch(base+path, { method:'POST', headers:{ Origin:origin, 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body:JSON.stringify(body) });
      assert.equal(res.status,200); return res.json();
    }
    const login = prior || await post('/api/login',{ name, initData }), ticket = await post('/api/ticket',{},login.token);
    const ws = new WebSocket(base.replace('http','ws')+'/socket?ticket='+ticket.ticket,{ origin }); sockets.push(ws);
    const queue = [], waiters = [];
    ws.on('message',raw=>{const m=JSON.parse(raw); if(waiters.length)waiters.shift()(m);else queue.push(m);});
    const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('socket timeout')),3000);waiters.push(m=>{clearTimeout(t);resolve(m);});});
    const until=async predicate=>{for(let i=0;i<30;i++){const m=await next();if(predicate(m))return m;}throw Error('missing message');};
    return {login,ready:await until(m=>m.type==='ready'),until,send:data=>ws.send(JSON.stringify(data))};
  }
  try {
    const telegram = await client('Telegram',true), browser = await client('Browser');
    assert.equal(telegram.ready.user.startParam,`room_${room.code}`);
    const join={type:'join',code:room.code};
    for (const c of [telegram,browser]) {
      c.send(join); const options=await c.until(m=>m.type==='seat-options');
      assert.equal(options.players.filter(p=>p.available).length,3);
      assert.equal(options.hand,undefined);
      assert.ok(options.players.every(p=>!('hand' in p)&&!('lastDraw' in p)));
    }
    browser.send({type:'draw',source:'stock'}); await browser.until(m=>m.type==='error');
    const bot=room.players[2], hand=[...bot.hand];
    telegram.send({...join,botId:bot.id}); const accepted=await telegram.until(m=>m.room?.players[2].id==='99');
    assert.deepEqual(accepted.room.hand,hand); assert.equal(accepted.room.players[2].bot,false);
    browser.send({...join,botId:bot.id}); const stale=await browser.until(m=>m.type==='seat-options');
    assert.equal(stale.players[2].available,false); assert.equal(app.arena.roomFor(browser.login.user.id),undefined);
    browser.send({...join,botId:room.players[1].id}); await browser.until(m=>m.room?.code===room.code);
    const again=await client('Telegram',false,telegram.login); assert.deepEqual(again.ready.room.hand,hand);
    assert.equal(again.ready.room.players[2].id,'99');
  } finally {for(const ws of sockets)ws.terminate();await app.close();}
});
