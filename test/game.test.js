import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Arena,WIDTH,HEIGHT} from '../src/game.js';
function fixture(practice=false) {
  let time=10000;let food='cheeks';const saved=[];
  const arena=new Arena({now:()=>time,random:()=>.3,store:{getFood:()=>food,saveRound:r=>saved.push(structuredClone(r))}});
  const room=arena.create({id:'a',name:'Anna'},practice);
  if(!practice)arena.join({id:'b',name:'Ben'},room.code);
  arena.start('a');time+=3000;
  return {arena,room,saved,setFood:v=>food=v,advance:ms=>time+=ms};
}
test('only the host starts a multiplayer round',()=>{
  const arena=new Arena({store:{getFood:()=> 'cheeks'}});const r=arena.create({id:'a',name:'A'});
  arena.join({id:'b',name:'B'},r.code);assert.throws(()=>arena.start('b'),/Raumleiter/);
});
test('one player can train in a multiplayer room; next round switches with a friend',()=>{
  let now=10000;const saved=[];
  const arena=new Arena({now:()=>now,store:{getFood:()=> 'cheeks',saveRound:r=>saved.push(structuredClone(r))}});
  const room=arena.create({id:'a',name:'A'});
  arena.start('a');assert.equal(room.practice,false);assert.equal(room.training,true);
  now+=3000;arena.step(room);assert.equal(room.status,'running');assert.equal(room.players[0].alive,true);
  arena.surrender('a');arena.step(room);assert.equal(room.status,'finished');assert.equal(saved[0].practice,true);
  arena.join({id:'b',name:'B'},room.code);arena.start('a');assert.equal(room.training,false);
  now+=3000;arena.surrender('b');arena.step(room);assert.equal(saved[1].practice,false);
});
test('simultaneous head-on collision kills both, independent of player order',()=>{
  for(const reverse of [false,true]){const {arena,room,saved}=fixture();
    Object.assign(room.players[0],{body:[{x:4,y:5},{x:3,y:5}],direction:'right'});
    Object.assign(room.players[1],{body:[{x:6,y:5},{x:7,y:5}],direction:'left'});
    if(reverse)room.players.reverse();arena.step(room);
    assert.ok(room.players.every(p=>!p.alive));assert.equal(room.status,'finished');assert.equal(saved.length,1);assert.ok(room.results.every(p=>p.rank===1));
  }
});
test('head swapping kills both players',()=>{
  const {arena,room}=fixture();Object.assign(room.players[0],{body:[{x:4,y:5},{x:3,y:5}],direction:'right'});Object.assign(room.players[1],{body:[{x:5,y:5},{x:6,y:5}],direction:'left'});
  arena.step(room);assert.ok(room.players.every(p=>!p.alive));
});
test('moving into the vacating own tail is allowed',()=>{
  const {arena,room}=fixture(true);const p=room.players[0];p.body=[{x:5,y:5},{x:5,y:6},{x:4,y:6},{x:4,y:5}];p.direction='left';room.food=[];arena.step(room);assert.equal(p.alive,true);assert.deepEqual(p.body[0],{x:4,y:5});
});
test('food grows snake and adds server-calculated score',()=>{
  const {arena,room}=fixture(true);room.food=[{x:5,y:4}];arena.step(room);assert.equal(room.players[0].score,10);assert.equal(room.players[0].body.length,5);
  const occupied=new Set(room.players[0].body.map(p=>`${p.x},${p.y}`));assert.ok(room.food.every(p=>!occupied.has(`${p.x},${p.y}`)));
});
test('no reversal or prototype directions; bounded queue consumes once per tick',()=>{
  const {arena,room}=fixture(true),p=room.players[0];arena.input('a','left');arena.input('a','__proto__');assert.deepEqual(p.queue,[]);
  arena.input('a','down');arena.input('a','left');arena.input('a','up');assert.deepEqual(p.queue,['down','left']);arena.step(room);assert.equal(p.direction,'down');arena.step(room);assert.equal(p.direction,'left');
});
test('settings apply next round, and training is marked',()=>{
  const {arena,room,setFood,saved}=fixture(true);setFood('star');assert.equal(room.foodStyle,'cheeks');arena.surrender('a');arena.step(room);assert.equal(saved[0].practice,true);arena.start('a');assert.equal(room.foodStyle,'star');
});
test('reconnect preserves score and body; disconnection times out',()=>{
  const {arena,room,advance}=fixture(true);arena.disconnect('a');advance(1000);arena.connect('a');assert.equal(room.players[0].connected,true);assert.equal(room.players[0].body.length,4);
  arena.disconnect('a');advance(10001);arena.step(room);assert.equal(room.status,'finished');
});
test('join during round rejected; last disconnected lobby expires',()=>{
  const {arena,room}=fixture();assert.throws(()=>arena.join({id:'c',name:'C'},room.code),/läuft/);
  const f=fixture(true);f.arena.surrender('a');f.arena.step(f.room);f.arena.disconnect('a');f.advance(31000);f.arena.sweep();assert.equal(f.arena.rooms.size,0);
});
test('all eight spawns are inside board, unique and non-overlapping',()=>{
  const arena=new Arena({store:{getFood:()=> 'cheeks'}});const room=arena.create({id:'0',name:'0'});
  for(let i=1;i<8;i++)arena.join({id:String(i),name:String(i)},room.code);assert.throws(()=>arena.join({id:'9',name:'9'},room.code),/voll/);arena.start('0');
  const cells=room.players.flatMap(p=>p.body);assert.equal(new Set(cells.map(p=>`${p.x},${p.y}`)).size,32);assert.ok(cells.every(p=>p.x>=0&&p.x<WIDTH&&p.y>=0&&p.y<HEIGHT));
});
