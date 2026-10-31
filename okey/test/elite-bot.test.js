import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, deck, winningHand } from '../src/game.js';
import { analyseHand, chooseDiscard } from '../src/bot-strategy.js';
import { bestCombinations } from '../public/combinations.js';
import { createPublicMemory, recordPublicMove, unseenCounts, tileType, matchPolicy, discardDanger, planEliteDiscard, chooseEliteDraw, ELITE_LIMITS } from '../src/elite-bot.js';
const tiles=deck(),t=(c,n,copy=0)=>tiles.find(t=>t.id===`${copy}-${c}-${n}`),joker=tiles.at(-1);
const run=(c,start,length)=>Array.from({length},(_,i)=>t(c,(start+i-1)%13+1));
const win=[...run(0,1,3),...run(1,4,3),...run(2,7,4),...[0,1,2,3].map(c=>t(c,11))];
function random(seed){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)}
function hand(seed){const rng=random(seed),d=deck();for(let i=d.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d.slice(0,15)}

test('exact bot penalties agree with round scoring, including joker, wrapping run and seven pairs',()=>{
  const hands=[win,[...win.slice(1),joker],[...run(0,12,3),...run(1,1,11)],...Array.from({length:20},(_,i)=>hand(i+20).slice(0,14))];
  hands.push(...[false,true].map(wild=>[...Array.from({length:7},(_,i)=>[t(0,i+1),t(0,i+1,1)]).flat().slice(0,wild?13:14),...(wild?[joker]:[])]));
  for(const h of hands){const a=analyseHand(h);assert.equal(a.isWinning(),Boolean(winningHand(h)));assert.equal(a.deadwood(),bestCombinations(h).points)}
  const h=hand(33),a=analyseHand(h);for(let i=0;i<15;i++)assert.equal(a.deadwood(a.full&~(1<<i)),bestCombinations(h.filter((_,j)=>i!==j)).points);
});
test('public memory survives the event window, tracks held tiles and excludes hidden draws',()=>{
  const a=new Arena(),r=a.create({id:'a',name:'A'},true,{botLevel:'tmbyt'}),offer=r.players[0].hand[0];
  a.discard('a',offer.id);a.draw(r.players[1].id,'discard');assert.ok(r.publicMemory.players[1].held[offer.id]);
  for(let i=0;i<30;i++)a.event(r,'test');assert.ok(r.publicMemory.players[1].held[offer.id]);
  a.discard(r.players[1].id,offer.id);assert.equal(r.publicMemory.players[1].held[offer.id],undefined);
  const hidden=r.stock.at(-1);a.draw(r.players[2].id,'stock');assert.equal(r.publicMemory.seen[hidden.id],undefined);
  assert.equal(r.publicMemory.players[2].passes[tileType(offer)],1);
  a.finish(r,null,'stock');a.start('a');assert.deepEqual(r.publicMemory,createPublicMemory());
});
test('unseen pool deduplicates physical tiles and never includes exhausted copies',()=>{
  const a=t(0,6),b=t(0,6,1);const counts=unseenCounts([a],[a,a,b,joker]);assert.equal(counts[tileType(a)],0);assert.equal(counts[52],1);assert.equal(counts.reduce((a,b)=>a+b,0),103);
});
test('public pickups increase discard danger; own teammate is never treated as an opponent',()=>{
  const memory=createPublicMemory(),a=t(0,6),b=t(0,7);
  const before=discardDanger(b,memory,1);recordPublicMove(memory,'pickup',1,a);
  assert.ok(discardDanger(b,memory,1)>before);assert.equal(discardDanger(b,memory,1,{partner:true}),0);
  recordPublicMove(memory,'discard',1,a);assert.ok(discardDanger(b,memory,1)<2);
});
test('match strategy defends leads and pursues wins and joker bonus when behind, especially late',()=>{
  const leading=matchPolicy({totals:[0,100],index:0,round:5}),trailing=matchPolicy({totals:[100,0],index:0,round:5}),early=matchPolicy({totals:[100,0],index:0,round:1});
  assert.ok(leading.penalty>trailing.penalty);assert.ok(leading.danger>trailing.danger);assert.ok(trailing.win>leading.win);assert.ok(trailing.joker>early.joker);assert.ok(trailing.reserve>leading.reserve);
});
test('search respects node budget, never mutates inputs, and has a deterministic deadline fallback',()=>{
  const h=hand(72),before=JSON.stringify(h),a=planEliteDiscard(h,{clock:()=>0}),b=planEliteDiscard(h,{clock:()=>0});
  assert.ok(a.samples>0);assert.ok(a.nodes<=ELITE_LIMITS.nodes);assert.equal(a.tile.id,b.tile.id);assert.equal(JSON.stringify(h),before);
  let ms=0;const timed=planEliteDiscard(h,{clock:()=>ms+=20}),staticPlan=planEliteDiscard(h,{futureDraws:0});
  assert.equal(timed.samples,0);assert.equal(timed.tile.id,staticPlan.tile.id);assert.equal(staticPlan.nodes,0);
});
test('new level immediately takes a winning offer and always finishes with a free joker',()=>{
  const offer=win.at(-1),h=[...win.slice(0,-1),t(3,1)];assert.equal(chooseEliteDraw(h,offer,{clock:()=>0}),'discard');
  assert.equal(chooseDiscard([...win,joker],{level:'tmbyt',winning:winningHand}),joker);
  assert.equal(chooseEliteDraw(h,null),'stock');
});
for(const phase of ['draw','discard'])test(`fourth-level ${phase} turn cannot inspect private hands or stock order`,()=>{
  let now=0;const a=new Arena({now:()=>now}),r=a.create({id:'a',name:'A'},true,{botLevel:'tmbyt',mode:'teams'});
  r.turn=1;r.phase=phase;r.players[1].hand=hand(77).slice(0,phase==='draw'?14:15);r.nextPuffAt=Infinity;
  for(const seat of [0,2,3])Object.defineProperty(r.players[seat],'hand',{get(){throw Error('Private hand accessed')}});
  const stockLength=r.stock.length;r.stock=new Proxy(r.stock,{get(target,key){if(key==='length')return stockLength;throw Error('Stock inspected before draw')}});
  if(phase==='draw'){const offer=t(3,13);r.lastDiscard={seat:0};r.discards[0]=[offer];recordPublicMove(r.publicMemory,'discard',0,offer)}
  // Capture the final draw command so even the engine's legitimate pop is not needed.
  if(phase==='draw')a.draw=(id,source)=>{assert.equal(id,r.players[1].id);assert.ok(['stock','discard'].includes(source))};
  now=2000;assert.doesNotThrow(()=>a.tick());
});
