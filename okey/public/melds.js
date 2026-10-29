// Find the exact ordered partition, retaining each physical tile and joker assignment.
export function winningGroups(hand) {
  if (hand.length !== 14) return null;
  const wild = t => t.joker === true;
  const value = t => t;
  const pools = Array.from({length:52},()=>[]), jokers=[];
  for(const tile of hand){if(wild(tile))jokers.push(tile);else{const v=value(tile);pools[v.color*13+v.number-1].push(tile)}}
  const counts=pools.map(p=>p.length), failed=new Set();
  const entry=(tile,index)=>({tile,as:{color:Math.floor(index/13),number:index%13+1},wild:wild(tile)});
  if(counts.reduce((n,v)=>n+v%2,0)<=jokers.length){
    const spare=[...jokers], groups=[];
    pools.forEach((pool,i)=>{for(let j=0;j<pool.length;j+=2)groups.push({type:'pair',tiles:[entry(pool[j],i),entry(pool[j+1]||spare.pop(),i)]})});
    while(spare.length)groups.push({type:'pair',tiles:[entry(spare.pop(),0),entry(spare.pop(),0)]});
    return {kind:'pairs',groups};
  }
  function solve(left,remaining){
    if(!remaining)return [];
    const first=counts.findIndex(n=>n>0);
    if(first<0)return remaining>=3?[{type:'run',indices:Array.from({length:remaining},(_,i)=>i)}]:null;
    const key=left+':'+counts.join('');if(failed.has(key))return null;
    const color=Math.floor(first/13),number=first%13+1;
    function attempt(indices,type){
      if(indices.length>remaining)return null;
      const used=[];let cost=0;
      for(const i of indices){if(counts[i]){counts[i]--;used.push(i)}else cost++}
      const rest=cost<=left?solve(left-cost,remaining-indices.length):null;
      for(const i of used)counts[i]++;
      return rest?[{type,indices},...rest]:null;
    }
    for(let mask=1;mask<16;mask++){
      if(!(mask&(1<<color)))continue;
      const cs=[0,1,2,3].filter(c=>mask&(1<<c));
      if(cs.length>=3){const found=attempt(cs.map(c=>c*13+number-1),'set');if(found)return found}
    }
    for(let start=1;start<=12;start++)for(let end=start+2;end<=14;end++){
      if(start===1&&end===14)continue;
      if(!(number>=start&&number<=end)&&!(number===1&&end===14))continue;
      const found=attempt(Array.from({length:end-start+1},(_,i)=>color*13+(start+i-1)%13),'run');if(found)return found;
    }
    failed.add(key);return null;
  }
  const partition=solve(jokers.length,14);if(!partition)return null;
  return {kind:'melds',groups:partition.map(g=>({type:g.type,tiles:g.indices.map(i=>entry(pools[i].shift()||jokers.shift(),i))}))};
}
