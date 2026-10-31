import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createApplication} from '../src/server.js';

test('real sockets enforce host permissions, pause broadcasts, removals notify targets, transfer revokes old host, social HTTP checks sessions',async()=>{
 const app=createApplication({port:0});await app.listen();const base=`http://127.0.0.1:${app.server.address().port}`,sockets=[];
 async function client(name){
  const post=async(path,data={},token='')=>{const res=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(data)});return{status:res.status,...await res.json()};};
  const login=await post('/api/login',{name}),ticket=await post('/api/ticket',{},login.token);
  const ws=new WebSocket(base.replace('http','ws')+'/socket?ticket='+ticket.ticket,{origin:base});sockets.push(ws);
  const queue=[],waiting=[];ws.on('message',raw=>{const m=JSON.parse(raw);if(waiting.length)waiting.shift()(m);else queue.push(m);});
  const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket timeout')),3000);waiting.push(m=>{clearTimeout(timer);resolve(m);});});
  const until=async test=>{for(let i=0;i<40;i++){const m=await next();if(test(m))return m;}throw Error('No matching state');};
  await until(m=>m.type==='ready');return{id:login.user.id,send:(type,data={})=>ws.send(JSON.stringify({type,...data})),until,post:(action)=>post('/api/social',action,login.token)};
 }
 try{
  const a=await client('Host'),b=await client('Buddy'),c=await client('Third');a.send('create',{roundLimit:5});const {room:r}=await a.until(m=>m.room?.code);
  b.send('join',{code:r.code});await b.until(m=>m.room?.players.length===2);c.send('join',{code:r.code});await c.until(m=>m.room?.players.length===3);
  b.send('host',{action:'remove',target:a.id});assert.match((await b.until(m=>m.type==='error')).message,/Gastgeber/);
  a.send('start',{withBots:true});await c.until(m=>m.room?.status==='playing');
  a.send('host',{action:'pause'});const state=await b.until(m=>m.room?.paused);assert.equal(state.room.players[0].hand,undefined);
  b.send('discard',{tileId:'forged'});assert.equal((await b.until(m=>m.type==='error')).type,'error');
  a.send('host',{action:'resume'});await b.until(m=>m.room && !m.room.paused);
  a.send('host',{action:'remove',target:b.id});assert.equal((await b.until(m=>m.type==='state' && m.room===null)).room,null);assert.match((await b.until(m=>m.type==='notice')).message,/entfernt/);
  b.send('join',{code:r.code});assert.match((await b.until(m=>m.type==='error')).message,/entfernt/);
  let sent=0;app.social.call=async()=>sent++;app.arena.roomFor(a.id).groupChatId='-100';
  assert.equal((await c.post({action:'poll'})).status,400);assert.equal(sent,0);
  assert.equal((await a.post({action:'poll'})).status,200);assert.equal(sent,1);
  a.send('host',{action:'transfer',target:c.id});await c.until(m=>m.room?.owner===c.id);a.send('host',{action:'lock'});assert.match((await a.until(m=>m.type==='error')).message,/Gastgeber/);
  const unauth=await fetch(base+'/api/social',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"action":"poll"}'});assert.equal(unauth.status,401);
 }finally{for(const ws of sockets)ws.terminate();await app.close();}
});
