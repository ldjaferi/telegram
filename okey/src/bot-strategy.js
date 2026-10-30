// Decisions use only the bot's own tiles and publicly exposed tiles.
export const BOT_LEVELS = ['fmi', 'bur', 'baba'];
const type = t => t.joker ? 52 : t.color * 13 + t.number - 1;
const bits = mask => { let n=0; while(mask){mask&=mask-1;n++;} return n; };

export function analyseHand(hand, { level='bur', visible=[] }={}) {
  const n=hand.length, full=(1<<n)-1, byType=Array.from({length:53},()=>[]);
  hand.forEach((t,i)=>byType[type(t)].push(i));
  const groups=new Set();
  function addPattern(types) {
    if(types.length>n || types.filter(t=>!byType[t].length).length>byType[52].length) return;
    function build(k,mask) {
      if(k===types.length){groups.add(mask);return;}
      for(const i of [...byType[types[k]],...byType[52]]) if(!(mask&(1<<i))) build(k+1,mask|(1<<i));
    }
    build(0,0);
  }
  for(let color=0;color<4;color++) for(let start=1;start<=12;start++) for(let end=start+2;end<=14;end++) {
    if(start===1&&end===14) continue;
    addPattern(Array.from({length:end-start+1},(_,i)=>color*13+(start+i-1)%13));
  }
  for(let number=0;number<13;number++) for(let colors=1;colors<16;colors++) if(bits(colors)>=3)
    addPattern([0,1,2,3].filter(c=>colors&(1<<c)).map(c=>c*13+number));
  const containing=Array.from({length:n},()=>[]);
  for(const mask of groups) for(let i=0;i<n;i++) if(mask&(1<<i)) containing[i].push(mask);
  const memo=new Map([[0,{value:0,covered:0}]]);
  const weight=mask=>hand.reduce((sum,t,i)=>sum+((mask&(1<<i))?20+(t.joker?0:t.number*.1):0),0);
  const weights=new Map([...groups].map(m=>[m,weight(m)]));
  function solve(mask) {
    if(memo.has(mask)) return memo.get(mask);
    const i=31-Math.clz32(mask&-mask);
    let best=solve(mask&~(1<<i));
    for(const g of containing[i]) if((g&mask)===g) {
      const tail=solve(mask^g),value=tail.value+weights.get(g);
      if(value>best.value) best={value,covered:tail.covered|g};
    }
    memo.set(mask,best);return best;
  }
  const known=new Map([...hand,...visible].map(t=>[t.id,t]));
  const seen=Array(53).fill(0);for(const t of known.values())seen[type(t)]++;
  const availability=t=>level==='baba'?Math.max(0,2-seen[t])/2:1;
  function score(mask=full) {
    const best=solve(mask),rest=mask&~best.covered;
    let value=best.value, pairs=0, wild=0;
    const counts=Array(53).fill(0);
    for(let i=0;i<n;i++) if(mask&(1<<i)) counts[type(hand[i])]++;
    for(let k=0;k<52;k++) pairs+=Math.floor(counts[k]/2);
    wild=counts[52];
    for(let i=0;i<n;i++) if(rest&(1<<i)) {
      const a=hand[i]; if(a.joker){value+=14;continue;}
      value-=a.number*.12;
      for(let j=i+1;j<n;j++) if(rest&(1<<j)) {
        const b=hand[j];if(b.joker)continue;
        if(a.number===b.number&&a.color!==b.color) {
          value+=2.5*[0,1,2,3].filter(c=>c!==a.color&&c!==b.color).reduce((sum,c)=>sum+availability(c*13+a.number-1),0);
        }
        if(a.color===b.color) {
          const low=Math.min(a.number,b.number),high=Math.max(a.number,b.number),d=high-low;
          if(d===1) { if(low>1)value+=3*availability(a.color*13+low-2);if(high<13)value+=3*availability(a.color*13+high);if(high===13)value+=3*availability(a.color*13); }
          if(d===2)value+=3*availability(a.color*13+low);
          if(low===1&&high===13)value+=3*availability(a.color*13+11);
          if(low===1&&high===12)value+=3*availability(a.color*13+12);
        }
      }
    }
    // A seven-pair plan competes with the meld plan rather than being ignored.
    return Math.max(value,pairs*36+wild*15-(bits(mask)-pairs*2-wild)*2);
  }
  return { score, full };
}

export function chooseDiscard(hand, {level='bur', visible=[], nextPickups=[], winning, random=Math.random}={}) {
  if(!BOT_LEVELS.includes(level))throw Error('Ungültige Bot-Stufe.');
  // Finish on every level; prefer a joker finish for the game's scoring rules.
  for(const t of [...hand].sort((a,b)=>Number(Boolean(b.joker))-Number(Boolean(a.joker))))
    if(winning(hand.filter(x=>x.id!==t.id)))return t;
  if(level==='fmi'&&random()<.35) {
    const choices=hand.filter(t=>!t.joker);return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]||hand[0];
  }
  const analysis=analyseHand(hand,{level,visible});
  const danger=t=>!t.joker?nextPickups.reduce((v,p)=>v+(p.joker?0:p.number===t.number&&p.color!==t.color?1.4:p.color===t.color&&Math.abs(p.number-t.number)<=2?1.1:0),0):5;
  let best=hand[0],bestScore=-Infinity;
  hand.forEach((t,i)=>{
    let value=analysis.score(analysis.full&~(1<<i));
    if(level==='fmi')value+=(random()-.5)*24;
    if(level==='baba')value-=Math.min(8,danger(t));
    if(value>bestScore){best=t;bestScore=value;}
  });
  return best;
}
