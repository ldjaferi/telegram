import test from 'node:test';
import assert from 'node:assert/strict';
import { bestCombinations } from '../public/combinations.js';
import { Arena } from '../src/game.js';
let seq=0;
const t=(color,number)=>({id:`s${seq++}`,color,number});
const j=()=>({id:`j${seq++}`,joker:true});
const run=(color,nums)=>nums.map(n=>t(color,n));
const valid=()=>[...run(0,[1,2,3]),...run(1,[4,5,6]),...run(2,[7,8,9,10]),...[0,1,2,3].map(c=>t(c,11))];
function table(roundLimit=5){const a=new Arena(),r=a.create({id:'a',name:'Ali'},false,{roundLimit,mode:'teams'});for(const id of ['b','c','d'])a.join({id,name:id},r.code);a.start('a');return {a,r};}
function close(a,r,joker=false){r.turn=0;r.phase='discard';const last=joker?j():t(3,13);r.players[0].hand=[...valid(),last];a.discard('a',last.id,true);}

test('rest points sum numbers; joker completes runs and sets; unused joker costs zero',()=>{
  assert.equal(bestCombinations([t(0,8),t(2,12)]).points,20);
  assert.equal(bestCombinations([...run(0,[8,10]),j(),t(1,12)]).points,12);
  assert.equal(bestCombinations([t(0,9),t(2,9),j(),t(1,12)]).points,12);
  assert.equal(bestCombinations([t(0,8),t(2,12),j()]).points,20);
  assert.equal(bestCombinations(run(0,[12,13,1])).points,0);
  assert.equal(bestCombinations(run(0,[13,1,2])).points,16);
});
test('global optimum prefers two intersecting runs over a tempting set and preserves every physical tile',()=>{
  const hand=[...run(0,[7,8,9]),...run(1,[7,8,9]),t(2,8)];
  const before=JSON.stringify(hand),result=bestCombinations(hand);
  assert.equal(result.points,8);assert.equal(result.groups.length,2);
  assert.deepEqual(new Set(result.groups.flat().concat(result.rest).map(t=>t.id)),new Set(hand.map(t=>t.id)));
  assert.equal(JSON.stringify(hand),before);
});
test('pairs only remove penalties when all fourteen form seven pairs',()=>{
  assert.equal(bestCombinations([t(0,8),t(0,8)]).points,16);
  const pairs=Array.from({length:7},(_,i)=>[t(i%4,i+1),t(i%4,i+1)]).flat();
  assert.equal(bestCombinations(pairs).points,0);assert.equal(bestCombinations(pairs).groups.length,7);
});
test('opposite seats share points, winners zero, joker finish gives minus ten and doubles both opponents',()=>{
  for(const joker of [false,true]){
    const {a,r}=table();r.players[1].hand=[t(0,8),t(2,12)];r.players[2].hand=[t(3,13)];r.players[3].hand=[t(1,5)];
    close(a,r,joker);assert.deepEqual(r.totals,joker?[-10,50]:[0,25]);
    assert.deepEqual(r.scores[0].penalties,[0,20,0,5]);assert.equal(r.events.at(-1).joker,joker);
    a.finish(r,r.players[0],'melds',true);assert.equal(r.scores.length,1);
    assert.deepEqual(a.snapshot(r,'a').players.map(p=>p.team),[0,1,0,1]);
  }
});
test('5 and 7 round matches stop, choose lowest score and only host can reset',()=>{
  for(const limit of [5,7]){
    const {a,r}=table(limit);
    assert.throws(()=>a.configure('a',{roundLimit:7}));
    for(let i=1;i<=limit;i++){for(const p of r.players.slice(1))p.hand=[t(0,8)];close(a,r,i===1);assert.equal(r.matchComplete,i===limit);if(i<limit)a.start('a');}
    assert.deepEqual(r.matchWinners,[0]);assert.equal(r.scores.length,limit);assert.equal(r.totals[0],-10);
    assert.throws(()=>a.start('a'));assert.throws(()=>a.newMatch('b'));a.newMatch('a');
    assert.equal(r.round,0);assert.equal(r.roundLimitChosen,false);assert.deepEqual(r.totals,[0,0]);assert.equal(r.scores.length,0);assert.equal(r.status,'lobby');
    assert.throws(()=>a.configure('b',{roundLimit:7}));assert.throws(()=>a.configure('a',{roundLimit:6}));a.configure('a',{roundLimit:7});assert.equal(r.roundLimit,7);
  }
});
test('empty stock scores both teams and ties are explicit; seats and team totals survive departures',()=>{
  const {a,r}=table();for(const p of r.players)p.hand=[t(0,8)];
  a.finish(r,null,'stock');assert.deepEqual(r.totals,[16,16]);
  a.leave('b');assert.equal(r.players[2].id,'c');
  assert.throws(()=>a.join({id:'new',name:'Replacement'},r.code),error=>error.code==='choose_seat');
  a.join({id:'new',name:'Replacement'},r.code,r.players[1].id);assert.equal(r.players[1].id,'new');assert.deepEqual(r.totals,[16,16]);
  for(let i=2;i<=5;i++){a.start('a');for(const p of r.players)p.hand=[t(0,8)];a.finish(r,null,'stock');}
  assert.deepEqual(r.matchWinners,[0,1]);
});
test('both opponents surrender ends team round and only the drawing player sees the new tile marker',()=>{
  const {a,r}=table();a.discard('a',r.players[0].hand[0].id);a.draw('b','stock');
  assert.equal(a.snapshot(r,'b').lastDraw.id,r.players[1].hand.at(-1).id);assert.equal(a.snapshot(r,'a').lastDraw,null);
  assert.equal(a.snapshot(r,'a').players[1].lastDraw,undefined);
  a.surrender('b');a.surrender('d');assert.equal(r.status,'finished');assert.equal(r.scores[0].winner,0);
});
