import { performance } from 'node:perf_hooks';
import { analyseHand } from './bot-strategy.js';

export const ELITE_LIMITS = Object.freeze({ milliseconds:18, nodes:48, samples:8, depth:2, candidates:3 });
export const tileType=t=>t.joker?52:t.color*13+t.number-1;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Fixed-size summaries retain observations from the entire round. Only public
// tiles enter this structure; concealed stock draws must never be recorded.
export function createPublicMemory(){
  return {seen:{},players:Array.from({length:4},()=>({pickups:Array(53).fill(0),discards:Array(53).fill(0),passes:Array(53).fill(0),held:{}}))};
}
export function recordPublicMove(memory,kind,seat,tile){
  if(!memory||!tile)return;
  const player=memory.players[seat],type=tileType(tile);
  memory.seen[tile.id]={...tile};
  if(kind==='pass'){player.passes[type]++;return;}
  for(const other of memory.players)delete other.held[tile.id];
  if(kind==='pickup'){player.pickups[type]++;player.held[tile.id]={...tile}}
  else if(kind==='discard')player.discards[type]++;
}
export function unseenCounts(hand,visible=[]){
  const counts=Array(53).fill(2),known=new Map([...hand,...visible].map(t=>[t.id,t]));
  for(const tile of known.values())counts[tileType(tile)]=Math.max(0,counts[tileType(tile)]-1);
  return counts;
}
export function matchPolicy({totals=[],index=0,round=1,roundLimit=5}={}){
  const opponents=totals.filter((_,i)=>i!==index),deficit=opponents.length?(totals[index]||0)-Math.min(...opponents):0;
  const remaining=Math.max(1,roundLimit-round+1),risk=clamp(deficit/(35*remaining),-1,1);
  return {risk,penalty:.65-.4*risk,danger:1.8-.8*risk,win:180+60*risk,joker:75+50*risk,reserve:4+4*risk};
}
const fromType=(type,id)=>type===52?{id,joker:true}:{id,color:Math.floor(type/13),number:type%13+1};
function affinity(a,b){
  if(a.joker)return 3;
  if(b.joker)return 0;
  if(a.number===b.number)return a.color===b.color?.45:1.5;
  if(a.color!==b.color)return 0;
  const low=Math.min(a.number,b.number),high=Math.max(a.number,b.number),d=high-low;
  return d===1?1.4:d===2?1:low===1&&high>=12?1:0;
}
export function discardDanger(tile,memory,nextSeat,{partner=false}={}){
  if(partner||!memory?.players[nextSeat])return 0;
  const p=memory.players[nextSeat];let danger=tile.joker?7:0;
  for(const held of Object.values(p.held))danger+=2*affinity(tile,held);
  for(let type=0;type<53;type++){
    const link=affinity(tile,fromType(type,''));
    danger+=link*(Math.log1p(p.pickups[type])*.7-Math.log1p(p.discards[type])*.35);
  }
  danger-=Math.log1p(p.discards[tileType(tile)])*1.5+Math.log1p(p.passes[tileType(tile)])*.7;
  return clamp(danger,0,12);
}
function seededRandom(hand,counts){
  let seed=2166136261;
  for(const n of [...hand.map(tileType).sort((a,b)=>a-b),...counts])seed=Math.imul(seed^(n+1),16777619)>>>0;
  return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}
function samplePath(counts,random,depth){
  const pool=[...counts],path=[];
  for(let step=0;step<depth;step++){
    const total=pool.reduce((a,b)=>a+b,0);if(!total)break;
    let target=random()*total,type=0;while(type<52&&target>=pool[type])target-=pool[type++];
    pool[type]--;path.push(type);
  }
  return path;
}
function evaluator(options,knownHand){
  const policy=matchPolicy(options.match),visible=[...(options.visible||[]),...knownHand];
  const danger=tile=>discardDanger(tile,options.memory,options.nextSeat,{partner:options.nextIsPartner})*policy.danger;
  function rank(hand){
    const analysis=analyseHand(hand,{level:'baba',visible});
    return hand.map((tile,i)=>{
      const mask=analysis.full&~(1<<i),win=analysis.isWinning(mask);
      const rest=hand.filter((_,j)=>i!==j),risk=danger(tile);
      const value=win?400+policy.win+(tile.joker?policy.joker:0)
        :analysis.score(mask)-policy.penalty*analysis.deadwood(mask)+rest.filter(t=>t.joker).length*policy.reserve-risk;
      return {tile,hand:rest,value,win,risk};
    }).sort((a,b)=>Number(b.win)-Number(a.win)||(a.win&&b.win?Number(Boolean(b.tile.joker))-Number(Boolean(a.tile.joker)):0)||b.value-a.value);
  }
  function score(hand){const a=analyseHand(hand,{level:'baba',visible});return a.score()-policy.penalty*a.deadwood()+hand.filter(t=>t.joker).length*policy.reserve}
  return {rank,score};
}
function candidates(ranked){
  const types=new Set();return ranked.filter(r=>{const t=tileType(r.tile);if(types.has(t))return false;types.add(t);return true}).slice(0,ELITE_LIMITS.candidates);
}
function search(roots,knownHand,options,evalHand){
  const now=options.clock||(()=>performance.now()),start=now(),counts=unseenCounts(knownHand,options.visible);
  const random=options.random||seededRandom(knownHand,counts);
  let nodes=0,samples=0;const totals=roots.map(()=>0);
  if(roots.every(r=>!r.depth))return finish();
  for(let sample=0;sample<ELITE_LIMITS.samples;sample++){
    const path=samplePath(counts,random,ELITE_LIMITS.depth),cycle=[];
    if(!path.length)break;
    for(const root of roots){
      let hand=root.hand,value=root.value,risks=root.risk||0;
      for(let step=0;step<root.depth&&step<path.length;step++){
        if(nodes>=ELITE_LIMITS.nodes||now()-start>=ELITE_LIMITS.milliseconds)return finish();
        const tile=fromType(path[step],`sim-${sample}-${step}`),best=evalHand.rank([...hand,tile])[0];nodes++;
        hand=best.hand;value=best.value+(best.win?0:best.risk);risks+=best.win?0:best.risk*.4;
        if(best.win)break;
      }
      cycle.push(root.depth?value-risks:root.value);
    }
    // Commit only complete common-sample cycles, never favour the first root
    // just because the CPU deadline expired while evaluating another root.
    cycle.forEach((value,i)=>totals[i]+=value);samples++;
  }
  return finish();
  function finish(){return {values:roots.map((r,i)=>samples?totals[i]/samples:r.value),nodes,samples,elapsedMs:now()-start}}
}
export function planEliteDiscard(hand,options={}){
  const evalHand=evaluator(options,hand),ranked=evalHand.rank(hand);
  if(ranked[0].win)return {...ranked[0],nodes:0,samples:0};
  const roots=candidates(ranked).map(r=>({...r,depth:Math.min(ELITE_LIMITS.depth,Math.max(0,options.futureDraws??2))}));
  const rollout=search(roots,hand,options,evalHand);
  const values=roots.map((r,i)=>r.value*.5+rollout.values[i]*.5);
  const best=values.indexOf(Math.max(...values));
  return {...roots[best],value:values[best],...rollout};
}
export function chooseEliteDraw(hand,offer,options={}){
  if(!offer)return 'stock';
  const evalHand=evaluator(options,[...hand,offer]),ranked=evalHand.rank([...hand,offer]);
  if(ranked[0].win)return 'discard';
  const open=candidates(ranked.filter(r=>r.tile.id!==offer.id));
  const depth=Math.min(ELITE_LIMITS.depth,Math.max(0,options.futureDraws??2));
  const roots=[...open.map(r=>({...r,depth:Math.max(0,depth-1)})),{hand,value:evalHand.score(hand),risk:0,depth}];
  const rollout=search(roots,[...hand,offer],options,evalHand);
  if(!rollout.samples)return open[0]?.value>roots.at(-1).value+.5?'discard':'stock';
  return Math.max(...rollout.values.slice(0,-1))>rollout.values.at(-1)+.5?'discard':'stock';
}
