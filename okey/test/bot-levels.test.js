import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, deck, winningHand } from '../src/game.js';
import { BOT_LEVELS, analyseHand, chooseDiscard } from '../src/bot-strategy.js';
let serial=0;
const tile=(color,number)=>({id:`test-${serial++}`,color,number});
const run=(color,start,n)=>Array.from({length:n},(_,i)=>tile(color,start+i));
const valid=()=>[...run(0,1,3),...run(1,4,3),...run(2,7,4),...[0,1,2,3].map(c=>tile(c,11))];

test('difficulty defaults to bur, validates on creation/configuration, persists and is public',()=>{
  const a=new Arena();const r=a.create({id:'a',name:'A'});
  assert.equal(r.botLevel,'bur');
  assert.throws(()=>a.configure('a',{botLevel:'omniscient'}));
  for(const level of BOT_LEVELS){a.configure('a',{botLevel:level});assert.equal(a.snapshot(r,'a').botLevel,level);}
  a.start('a');assert.equal(r.botLevel,'baba');assert.throws(()=>a.configure('a',{botLevel:'fmi'}));
  a.finish(r,null,'stock');r.matchComplete=true;a.newMatch('a');assert.equal(r.botLevel,'baba');
  assert.throws(()=>a.create({id:'b',name:'B'},false,{botLevel:'invalid'}));
});
test('every level takes a certain win and prefers the joker scoring bonus',()=>{
  for(const level of BOT_LEVELS){
    const extra={id:'bonus-joker',joker:true},hand=[...valid(),extra];
    assert.equal(chooseDiscard(hand,{level,winning:winningHand}).id,extra.id);
  }
});
test('solid bot preserves completed melds; easy can make a legal mistake',()=>{
  const hand=[...run(0,1,3),...run(1,4,3),...run(2,7,4),tile(3,3),tile(3,4),tile(1,10),tile(2,12),tile(0,13)];
  const before=JSON.stringify(hand),chosen=chooseDiscard(hand,{level:'bur',winning:winningHand});
  assert.ok(hand.slice(10).includes(chosen),'do not dismantle three finished groups');
  assert.equal(chooseDiscard(hand,{level:'fmi',winning:winningHand,random:()=>0}),hand[0]);
  assert.equal(JSON.stringify(hand),before);
});
test('strong analysis discounts waits when both required copies are publicly visible',()=>{
  const hand=[tile(0,5),tile(0,7)];
  const live=analyseHand(hand,{level:'baba'}).score();
  const dead=analyseHand(hand,{level:'baba',visible:[tile(0,6),tile(0,6)]}).score();
  assert.ok(live>dead);
  assert.equal(analyseHand(hand,{level:'bur'}).score(),analyseHand(hand,{level:'bur',visible:[tile(0,6),tile(0,6)]}).score());
});
test('bot turn does not inspect opponent or partner hands',()=>{
  let now=0;const a=new Arena({now:()=>now}),r=a.create({id:'a',name:'A'},true,{botLevel:'baba',mode:'teams'});
  r.turn=1;r.phase='discard';r.players[1].hand=deck().filter(t=>!t.joker).filter((t,i)=>i%3===0).slice(0,15);
  r.nextPuffAt=Infinity;
  for(const seat of [0,2,3])Object.defineProperty(r.players[seat],'hand',{get(){throw Error('Private hand accessed');}});
  now=2000;assert.doesNotThrow(()=>a.tick());assert.equal(r.players[1].hand.length,14);
});
test('public pickups are recorded and cleared at a new round',()=>{
  const a=new Arena(),r=a.create({id:'a',name:'A'},true,{botLevel:'baba'});
  const t=r.players[0].hand[0];a.discard('a',t.id);a.draw(r.players[1].id,'discard');
  assert.deepEqual(r.publicPickups,[{seat:1,tile:t}]);
  a.finish(r,null,'stock');a.start('a');assert.deepEqual(r.publicPickups,[]);
});
