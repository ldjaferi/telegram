import test from 'node:test';
import assert from 'node:assert/strict';
import { rackMatch, rackBundles, settleRack, dropRack } from '../public/rack.js';
const tile=(number,color=0,copy=0)=>({id:`${copy}-${color}-${number}`,number,color});
const b={w:281,tw:35,h:70,th:46};
function safe(hand,p,bounds=b){
 assert.deepEqual(Object.keys(p).sort(),hand.map(t=>t.id).sort());
 for(const t of hand){assert.ok(Number.isFinite(p[t.id].x)&&p[t.id].x>=0&&p[t.id].x<=1);assert.ok([0,1].includes(p[t.id].y));}
 for(let i=0;i<hand.length;i++)for(let j=i+1;j<hand.length;j++){const a=p[hand[i].id],c=p[hand[j].id];if(a.y===c.y)assert.ok(Math.abs(a.x-c.x)*bounds.w>=bounds.tw+2.99,`${hand[i].id} overlaps ${hand[j].id}`);}
}
test('magnets accept actual runs, distinct-colour sets, pairs and chest jokers',()=>{
 assert.equal(rackMatch([tile(3),tile(1),tile(2)]).kind,'run');
 assert.deepEqual(rackMatch([tile(3),tile(1),tile(2)]).ids,['0-0-1','0-0-2','0-0-3']);
 assert.equal(rackMatch([tile(5,2),tile(5,0),tile(5,1)]).kind,'set');
 assert.equal(rackMatch([tile(5),tile(5,0,1)]).kind,'pair');
 assert.equal(rackMatch([tile(1),tile(3),{id:'joker-0',joker:true}]).kind,'run');
 assert.equal(rackMatch([tile(12),tile(13),tile(1)]).kind,'run');
 assert.equal(rackMatch([tile(13),tile(1)]).complete,false);
 for(const hand of [[tile(1),tile(2,1),tile(3,2)],[tile(5),tile(5,0,1),tile(5,1)],[tile(13),tile(1),tile(2)],[tile(1),tile(3),tile(5)]])assert.equal(rackMatch(hand),null);
});
test('dropping nearby completes, orders and bonds a run; extraction leaves no overlap',()=>{
 const hand=[tile(1),tile(3),tile(2),tile(9,1)];
 let p={'0-0-1':{x:0,y:0},'0-0-3':{x:38/b.w,y:0},'0-0-2':{x:.4,y:1},'0-1-9':{x:.9,y:1}};
 const joined=dropRack(hand,p,['0-0-2'],{x:30/b.w,y:0},b);p=joined.positions;safe(hand,p);
 assert.equal(joined.match.kind,'run');assert.equal(joined.match.complete,true);
 assert.ok(p['0-0-1'].x<p['0-0-2'].x&&p['0-0-2'].x<p['0-0-3'].x);
 const group=rackBundles(hand,p,b).find(g=>g.complete);assert.equal(group.ids.length,3);
 p=dropRack(hand,p,group.ids,{x:.2,y:1},b).positions;safe(hand,p);assert.ok(group.ids.every(id=>p[id].y===1));
 p=dropRack(hand,p,['0-0-2'],{x:.8,y:0},b).positions;safe(hand,p);assert.equal(p['0-0-2'].y,0);assert.ok(!rackBundles(hand,p,b).some(g=>g.complete&&g.ids.includes('0-0-2')));
});
test('same value in different colours snaps into one complete group',()=>{
 const hand=[tile(7,0),tile(7,1),tile(7,2)];const p=Object.fromEntries(hand.map((t,i)=>[t.id,{x:i*38/b.w,y:i===2?1:0}]));
 const result=dropRack(hand,p,[hand[2].id],{x:.1,y:0},b);safe(hand,result.positions);assert.equal(result.match.kind,'set');assert.equal(rackBundles(hand,result.positions,b)[0].complete,true);
});
test('crowded legacy positions, repeated drops and rotation preserve every tile without collisions',()=>{
 const hand=Array.from({length:15},(_,i)=>tile(i%13+1,Math.floor(i/13)));
 let p=Object.fromEntries(hand.map(t=>[t.id,{x:.5,y:.3}]));
 p=settleRack(hand,p,b);safe(hand,p);
 let seed=19;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let i=0;i<250;i++){
  const bounds=i%2?b:{w:409,tw:48,h:80,th:62};p=settleRack(hand,p,bounds);safe(hand,p,bounds);
  const id=hand[Math.floor(rand()*hand.length)].id;
  p=dropRack(hand,p,[id],{x:rand(),y:rand()},bounds).positions;safe(hand,p,bounds);
 }
});
test('connected combinations survive different tile sizes on rotation',()=>{
 const hand=[tile(1),tile(2),tile(3),tile(8,1)];const p=Object.fromEntries(hand.map((t,i)=>[t.id,{x:i*38/b.w,y:i===3?1:0}]));
 const wide={w:650,tw:48,h:80,th:62};const resized=settleRack(hand,p,wide,b);safe(hand,resized,wide);
 assert.equal(rackBundles(hand,resized,wide).find(g=>g.complete)?.ids.length,3);
});
test('the moved middle tile bridges its old gap and prefers a natural run over a nearby joker set',()=>{
 const hand=[{id:'joker-0',joker:true},tile(2,1),tile(1),tile(2),tile(3)];
 const p=Object.fromEntries(hand.map((t,i)=>[t.id,{x:i*44/b.w,y:0}]));
 const result=dropRack(hand,p,['0-0-2'],{x:120/b.w,y:0},b);
 safe(hand,result.positions);assert.equal(result.match.kind,'run');assert.deepEqual(result.match.ids,['0-0-1','0-0-2','0-0-3']);
});
