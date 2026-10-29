import { randomBytes, randomUUID } from 'node:crypto';

export const WIDTH = 30;
export const HEIGHT = 30;
export const TICK_MS = 125;
export const FOODS = ['cheeks', 'cherry', 'star'];
export const COLORS = ['#b6f36a', '#b5a0ff', '#ffb779', '#76d8ef', '#fb8cad', '#f2db6f', '#91dfba', '#e6bdff'];
const DELTA = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const key = p => `${p.x},${p.y}`;
export class GameError extends Error {}

export class Arena {
  constructor({ store, now = Date.now, random = Math.random, maxRooms = 40 } = {}) {
    this.rooms = new Map(); this.store = store; this.now = now; this.random = random; this.maxRooms = maxRooms;
  }
  roomFor(id) { return [...this.rooms.values()].find(r => r.players.some(p => p.id === id)); }
  create(user, practice = false) {
    if (this.roomFor(user.id)) throw new GameError('Verlasse zuerst deinen aktuellen Raum.');
    if (this.rooms.size >= this.maxRooms) throw new GameError('Alle Räume sind belegt. Bitte versuche es später.');
    let code;
    do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const room = { code, practice, hostId: user.id, status: 'lobby', players: [], food: [], foodStyle: this.store.getFood(), tick: 0, created: this.now(), updated: this.now(), results: [], roundId: null };
    this.rooms.set(code, room); this.join(user, code); return room;
  }
  join(user, code) {
    const room = this.rooms.get(code);
    if (!room) throw new GameError('Diesen Raum gibt es nicht mehr.');
    const current = this.roomFor(user.id);
    if (current && current !== room) throw new GameError('Verlasse zuerst deinen aktuellen Raum.');
    let player = room.players.find(p => p.id === user.id);
    if (!player) {
      if (room.players.length >= (room.practice ? 1 : 8)) throw new GameError('Dieser Raum ist voll.');
      if (room.status === 'running' || room.status === 'countdown') throw new GameError('Die Runde läuft. Bitte warte bis zur nächsten Runde.');
      player = { id: user.id, name: user.name, color: COLORS[room.players.length], body: [], direction: 'right', queue: [], alive: false, score: 0, connected: true, disconnectedAt: null };
      room.players.push(player);
    }
    player.connected = true; player.disconnectedAt = null; room.updated = this.now(); return room;
  }
  connect(id) { const r = this.roomFor(id); if (r) { const p = r.players.find(p => p.id === id); p.connected = true; p.disconnectedAt = null; } return r; }
  disconnect(id) { const r = this.roomFor(id); if (r) { const p = r.players.find(p => p.id === id); p.connected = false; p.disconnectedAt = this.now(); } }
  leave(id) {
    const room = this.roomFor(id); if (!room) return;
    const p = room.players.find(p => p.id === id);
    if (room.status === 'running' || room.status === 'countdown') throw new GameError('Während der Runde kannst du aufgeben. Verlasse den Raum danach.');
    room.players = room.players.filter(p => p.id !== id);
    if (!room.players.length) this.rooms.delete(room.code);
    else { if (room.hostId === id) room.hostId = room.players[0].id; this.recolor(room); }
    return room;
  }
  recolor(room) { room.players.forEach((p, i) => { p.color = COLORS[i]; }); }
  start(id) {
    const room = this.roomFor(id);
    if (!room || room.hostId !== id) throw new GameError('Nur der Raumleiter startet die Runde.');
    if (!['lobby', 'finished'].includes(room.status)) throw new GameError('Die Runde läuft bereits.');
    if (room.players.some(p => !p.connected)) throw new GameError('Warte auf die Verbindung aller Spieler.');
    // A lone player can warm up in a multiplayer room. Never rank a solo round.
    room.training = room.practice || room.players.length === 1;
    room.foodStyle = this.store.getFood(); room.status = 'countdown'; room.startAt = this.now() + 3000;
    room.endAt = room.startAt + 120000; room.tick = 0; room.results = []; room.food = []; room.roundId = randomUUID();
    const spawns = [[4,4,'right'],[25,25,'left'],[25,4,'down'],[4,25,'up'],[14,4,'down'],[15,25,'up'],[4,15,'right'],[25,14,'left']];
    room.players.forEach((p, i) => {
      const [x,y,direction] = spawns[i]; const [dx,dy] = DELTA[direction];
      Object.assign(p, { body: [0,1,2,3].map(n => ({x: x-dx*n, y: y-dy*n})), direction, queue: [], alive: true, score: 0, diedTick: null });
    });
    this.fillFood(room); return room;
  }
  input(id, direction) {
    if (typeof direction !== 'string' || !Object.hasOwn(DELTA,direction)) return;
    const room = this.roomFor(id); if (!room || !['countdown','running'].includes(room.status)) return;
    const p = room.players.find(p => p.id === id); if (!p.alive || p.queue.length >= 2) return;
    const last = p.queue.at(-1) || p.direction;
    if (direction !== last && direction !== OPPOSITE[last]) p.queue.push(direction);
  }
  surrender(id) {
    const room = this.roomFor(id); if (!room || !['countdown','running'].includes(room.status)) return;
    const p = room.players.find(p => p.id === id); p.alive = false; p.diedTick = room.tick; p.body = [];
  }
  fillFood(room) {
    const occupied = new Set([...room.players.flatMap(p => p.body), ...room.food].map(key));
    const free = [];
    for (let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++) if(!occupied.has(`${x},${y}`)) free.push({x,y});
    while(room.food.length < Math.max(5, room.players.length * 2) && free.length) {
      room.food.push(free.splice(Math.floor(this.random()*free.length), 1)[0]);
    }
  }
  step(room) {
    const now = this.now();
    if (room.status === 'countdown' && now >= room.startAt) room.status = 'running';
    if (room.status !== 'running') return;
    room.tick++;
    const alive = room.players.filter(p => p.alive);
    const proposals = new Map();
    const food = new Set(room.food.map(key));
    for (const p of alive) {
      p.direction = p.queue.shift() || p.direction;
      const [dx,dy] = DELTA[p.direction];
      const head = {x:p.body[0].x+dx,y:p.body[0].y+dy};
      proposals.set(p.id, {head, grows:food.has(key(head))});
    }
    // Every move is evaluated against the same pre-tick state. Tails vacate unless eating.
    const occupied = new Set(alive.flatMap(p => proposals.get(p.id).grows ? p.body : p.body.slice(0,-1)).map(key));
    const headCounts = new Map();
    for (const {head} of proposals.values()) headCounts.set(key(head), (headCounts.get(key(head)) || 0)+1);
    const eaten = new Set();
    for (const p of alive) {
      const {head,grows} = proposals.get(p.id);
      const crashed = head.x<0 || head.y<0 || head.x>=WIDTH || head.y>=HEIGHT || occupied.has(key(head)) || headCounts.get(key(head))>1;
      if(crashed || (!p.connected && now-p.disconnectedAt>10000)) { p.alive=false; p.diedTick=room.tick; p.body=[]; continue; }
      p.body.unshift(head);
      if(grows) { p.score+=10; eaten.add(key(head)); } else p.body.pop();
    }
    room.food = room.food.filter(f => !eaten.has(key(f))); this.fillFood(room); room.updated=now;
    const survivors=room.players.filter(p=>p.alive);
    if(survivors.length <= (room.training ? 0 : 1) || now >= room.endAt) this.finish(room);
  }
  finish(room) {
    room.status='finished'; room.updated=this.now();
    const sorted=[...room.players].sort((a,b)=>Number(b.alive)-Number(a.alive) || b.score-a.score || (b.diedTick||0)-(a.diedTick||0));
    let rank=1;
    room.results=sorted.map((p,i)=> {
      const prev=sorted[i-1];
      if(prev && (prev.alive!==p.alive || prev.score!==p.score || prev.diedTick!==p.diedTick)) rank=i+1;
      return {id:p.id,name:p.name,color:p.color,score:p.score,rank,alive:p.alive};
    });
    this.store.saveRound({...room,practice:room.training});
  }
  sweep() {
    for(const room of this.rooms.values()) {
      if(['lobby','finished'].includes(room.status)) {
        room.players=room.players.filter(p=>p.connected || this.now()-p.disconnectedAt<30000);
        if(!room.players.some(p=>p.id===room.hostId)) room.hostId=room.players[0]?.id;
        this.recolor(room);
      }
      if(!room.players.length || (room.players.every(p=>!p.connected) && this.now()-room.updated>120000)) this.rooms.delete(room.code);
    }
  }
  snapshot(room) {
    return {code:room.code,practice:room.practice,training:room.training??room.practice,hostId:room.hostId,status:room.status,foodStyle:room.foodStyle,food:room.food,tick:room.tick,startAt:room.startAt,endAt:room.endAt,serverTime:this.now(),width:WIDTH,height:HEIGHT,tickMs:TICK_MS,results:room.results,players:room.players.map(({queue,disconnectedAt,...p})=>p)};
  }
}
