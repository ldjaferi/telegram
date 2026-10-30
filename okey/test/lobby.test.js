import test from 'node:test';
import assert from 'node:assert/strict';
import {Arena} from '../src/game.js';
import {createApplication} from '../src/server.js';
test('team selection preserves opposite partners and rejects a full team',()=>{
 const a=new Arena(),r=a.create({id:'a',name:'A'});a.join({id:'b',name:'B'},r.code);a.chooseTeam('b',0);
 assert.equal(r.players[2].id,'b');a.join({id:'c',name:'C'},r.code);assert.throws(()=>a.chooseTeam('c',0),/voll/);
 a.start('a');assert.equal(r.players[2].id,'b');assert.throws(()=>a.chooseTeam('a',1));
});
test('automatic activity does not keep abandoned tables alive',()=>{
 let now=0;const a=new Arena({now:()=>now}),r=a.create({id:'a',name:'A'},true);
 now=599999;a.event(r,'puff');assert.equal(a.tick().includes(r),true);assert.ok(a.rooms.has(r.code));
 now=600000;assert.ok(a.tick().includes(r));assert.equal(a.rooms.size,0);assert.equal(r.expired,true);
});
test('public production accepts named browser guests with server-generated identities',async()=>{
 const app=createApplication({dev:false,port:0,publicUrl:'https://example.test',botToken:'test',allowPublic:true});await app.listen();
 try{const base=`http://127.0.0.1:${app.server.address().port}`;
 const res=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify({name:'Guest',id:'42'})});
 assert.equal(res.status,200);const data=await res.json();assert.match(data.user.id,/^local-/);assert.equal(data.user.name,'Guest');
 }finally{await app.close();}
});
