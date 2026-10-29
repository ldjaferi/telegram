import test from 'node:test';
import assert from 'node:assert/strict';
import { winningGroups } from '../public/melds.js';
import { winningHand, isWild, valueOf } from '../src/game.js';
let id=0;
const t=(color,number)=>({id:String(id++),color,number});
const joker=()=>({id:String(id++),joker:true});
function verify(hand){
  const solved=winningGroups(hand);
  assert.equal(solved?.kind||null,winningHand(hand));
  if(!solved)return;
  const entries=solved.groups.flatMap(g=>g.tiles);
  assert.deepEqual(entries.map(e=>e.tile.id).sort(),hand.map(t=>t.id).sort());
  for(const g of solved.groups){
    for(const e of g.tiles)if(!isWild(e.tile)){const v=valueOf(e.tile);assert.equal(e.as.color,v.color);assert.equal(e.as.number,v.number)}
    if(g.type==='pair'){assert.equal(g.tiles.length,2);assert.deepEqual(g.tiles[0].as,g.tiles[1].as)}
    else if(g.type==='set'){assert.ok(g.tiles.length>=3&&g.tiles.length<=4);assert.equal(new Set(g.tiles.map(e=>e.as.number)).size,1);assert.equal(new Set(g.tiles.map(e=>e.as.color)).size,g.tiles.length)}
    else{assert.ok(g.tiles.length>=3);assert.equal(new Set(g.tiles.map(e=>e.as.color)).size,1);g.tiles.slice(1).forEach((e,i)=>assert.equal(e.as.number,g.tiles[i].as.number%13+1));assert.ok(!g.tiles.slice(1,-1).some(e=>e.as.number===1))}
  }
  return solved;
}
test('winning display orders complete combinations and high ace while retaining physical IDs',()=>{
  const hand=[... [12,13,1].map(n=>t(0,n)),... [4,5,6].map(n=>t(1,n)),...[7,8,9,10].map(n=>t(2,n)),...[0,1,2,3].map(c=>t(c,11))];
  const result=verify(hand.toReversed());assert.equal(result.groups.length,4);
  hand[0]=t(0,2);assert.equal(winningGroups(hand),null);
});
test('winning display assigns fixed jokers; seven pairs stay separate',()=>{
  const hand=[...[1,2].map(n=>t(0,n)),joker(),...[4,5,6].map(n=>t(1,n)),...[7,8,9,10].map(n=>t(2,n)),...[0,1,2,3].map(c=>t(c,11))];
  assert.equal(verify(hand).groups.flatMap(g=>g.tiles).find(e=>e.wild).as.number,3);
  const pairs=Array.from({length:6},(_,i)=>[t(0,i+1),t(0,i+1)]).flat();pairs.push(t(3,13),joker());assert.equal(verify(pairs).groups.length,7);
});
test('display solver agrees with authority across shuffled winning hands with joker substitutions',()=>{
  for(let k=0;k<80;k++){
    const base=[...[1,2,3].map(n=>t(0,n)),...[4,5,6].map(n=>t(1,n)),...[7,8,9,10].map(n=>t(2,n)),...[0,1,2,3].map(c=>t(c,11))];
    base[k%14]=joker();if(k%2)base[(k+5)%14]=joker();
    const shift=k%14;verify([...base.slice(shift),...base.slice(0,shift)]);
  }
});
