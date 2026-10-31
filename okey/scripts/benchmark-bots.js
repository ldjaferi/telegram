// Paired deals swap difficulties while keeping the same shuffle and seats.
// Usage: node scripts/benchmark-bots.js [seed=9000] [pairs=16] [rounds=1] [individual|teams]
import { Arena, deck } from '../src/game.js';
import { performance } from 'node:perf_hooks';
const [seed=9000,pairs=16,rounds=1]=process.argv.slice(2,5).map(Number),mode=process.argv[5]||'individual';
const levels=['tmbyt','baba'],result={seed,pairs,rounds,mode,games:0,roundWins:{tmbyt:0,baba:0,stock:0},points:{tmbyt:0,baba:0},matchWins:{tmbyt:0,baba:0,ties:0}},times=[];
function shuffled(seed){const d=deck();for(let i=d.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=Math.floor(seed/4294967296*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
for(let pair=0;pair<pairs;pair++)for(let swap=0;swap<2;swap++){
  let now=0;const arena=new Arena({now:()=>now}),r=arena.create({id:'bench',name:'Bench'},true,{mode,roundLimit:rounds===7?7:5});
  const assigned=r.players.map((_,seat)=>levels[(seat+swap)%2]);
  for(let round=0;round<rounds;round++){
    if(round)arena.start(r.owner);
    const d=shuffled(seed+pair*101+round*10007);r.turn=round%4;r.phase='discard';r.nextPuffAt=Infinity;
    for(let seat=0;seat<4;seat++){r.players[seat].hand=d.splice(0,seat===r.turn?15:14);r.players[seat].bot=true}
    r.stock=d;
    for(let step=0;r.status==='playing'&&step<800;step++){
      now+=2000;r.humanActivity=now;r.botLevel=assigned[r.turn];const start=performance.now();arena.tick();if(r.botLevel==='tmbyt')times.push(performance.now()-start);
    }
    if(r.status!=='finished')throw Error('Round failed to finish');
    const winner=r.players.findIndex(p=>p.id===r.result.winner);result.roundWins[winner<0?'stock':assigned[winner]]++;
    const points=r.scores.at(-1).points;points.forEach((p,index)=>result.points[assigned[index]]+=p);result.games++;
  }
  const totals=mode==='teams'?r.totals:levels.map(level=>r.totals.reduce((sum,p,i)=>sum+(assigned[i]===level?p:0),0));
  const first=mode==='teams'?assigned[0]:'tmbyt',second=first==='tmbyt'?'baba':'tmbyt';result.matchWins[totals[0]===totals[1]?'ties':totals[0]<totals[1]?first:second]++;
  if(swap===1)process.stderr.write(`Completed ${pair+1}/${pairs} paired deals\n`);
}
times.sort((a,b)=>a-b);result.eliteTurnMs={median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)};
console.log(JSON.stringify(result,null,2));
