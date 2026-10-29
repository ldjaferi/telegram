import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createHmac} from 'node:crypto';
import {createApplication} from '../src/server.js';
const base={dev:true,host:'127.0.0.1',port:0,publicUrl:'http://127.0.0.1:3100',dbPath:':memory:',adminIds:[],allowedIds:[],allowPublic:false,botToken:'',botUsername:'',trustProxy:false};
async function fixture(t,overrides={}) {
  const app=createApplication({...base,...overrides});const address=await app.listen();t.after(()=>app.close());const origin=`http://127.0.0.1:${address.port}`;
  const call=async(path,data,token,extra={})=>{const res=await fetch(origin+'/api'+path,{method:data===undefined?'GET':'POST',headers:{Origin:overrides.dev===false?overrides.publicUrl:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,...await res.json()};};
  async function connect(token){const {ticket}=await call('/socket-ticket',{},token);const ws=new WebSocket(origin.replace('http','ws')+'/socket?ticket='+ticket,{origin:overrides.dev===false?overrides.publicUrl:origin});ws.states=[];ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state')ws.states.push(m.room);});await once(ws,'open');return ws;}
  return {app,call,connect,origin};
}
test('two independent clients share round, admin is enforced, score persists, reconnect works',async t=>{
  const {app,call,connect}=await fixture(t);
  const a=await call('/dev-login',{name:'Anna',admin:true}),b=await call('/dev-login',{name:'Ben',admin:false});
  const wa=await connect(a.token),wb=await connect(b.token);
  assert.equal((await call('/admin/food',{food:'star'},b.token)).status,403);
  const created=await call('/rooms',{},a.token);assert.equal(created.status,200);
  assert.equal((await call('/join',{code:created.room.code},b.token)).status,200);
  assert.equal((await call('/start',{},b.token)).status,400);
  assert.equal((await call('/start',{},a.token)).status,200);
  const room=app.arena.rooms.get(created.room.code);
  assert.equal((await call('/admin/food',{food:'star'},a.token)).status,200);assert.equal(room.foodStyle,'cheeks');
  wa.send(JSON.stringify({type:'direction',direction:'down',score:999999}));
  await new Promise(r=>setTimeout(r,30));assert.equal(room.players[0].score,0);assert.deepEqual(room.players[0].queue,['down']);
  assert.equal(wa.states.at(-1).code,wb.states.at(-1).code);assert.equal(wb.states.at(-1).players.length,2);
  wb.close();await once(wb,'close');const wb2=await connect(b.token);assert.equal(room.players[1].connected,true);assert.equal(room.players.length,2);
  room.startAt=0;app.arena.surrender(b.user.id);app.arena.step(room);assert.equal(room.status,'finished');assert.equal(app.store.leaderboard().length,2);
  await call('/start',{},a.token);assert.equal(room.foodStyle,'star');
  wa.close();wb2.close();
});
test('development login cannot be exposed; production rejects unsigned auth and foreign origin',async t=>{
  assert.throws(()=>createApplication({...base,host:'0.0.0.0'}),/loopback/);
  const {call}=await fixture(t,{dev:false,publicUrl:'https://goyim.xhaferi.al',botToken:'test',adminIds:['123']});
  assert.equal((await call('/dev-login',{})).status,404);
  assert.equal((await call('/auth',{initData:'user=123'})).status,401);
  assert.equal((await call('/rooms',{})).status,401);
  assert.equal((await call('/auth',{},null,{Origin:'https://attacker.example'})).status,403);
  const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'Admin'})});fields.sort();
  const secret=createHmac('sha256','WebAppData').update('test').digest();fields.set('hash',createHmac('sha256',secret).update([...fields].map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
  const result=await call('/auth',{initData:fields.toString()});assert.equal(result.status,200);assert.equal(result.user.isAdmin,true);
});
test('reused websocket ticket rejected',async t=>{
  const {call,origin}=await fixture(t);const a=await call('/dev-login',{name:'A'});const {ticket}=await call('/socket-ticket',{},a.token);
  const url=origin.replace('http','ws')+'/socket?ticket='+ticket;const w1=new WebSocket(url,{origin});await once(w1,'open');
  const w2=new WebSocket(url,{origin});const [error]=await once(w2,'error');assert.match(error.message,/401/);w1.close();
});
test('solo start through normal room API runs and never adds a ranked result',async t=>{
  const {app,call,connect}=await fixture(t);const player=await call('/dev-login',{name:'Solo'});
  const socket=await connect(player.token);
  const created=await call('/rooms',{},player.token);assert.equal(created.status,200);
  assert.equal((await call('/start',{},player.token)).status,200);
  const room=app.arena.rooms.get(created.room.code);room.startAt=0;app.arena.step(room);
  assert.equal(room.status,'running');assert.equal(app.arena.snapshot(room).training,true);
  app.arena.surrender(player.user.id);app.arena.step(room);
  assert.equal((await call('/leaderboard',undefined,player.token)).players.length,0);
  assert.equal((await call('/start',{},player.token)).status,200);
  socket.close();
});
