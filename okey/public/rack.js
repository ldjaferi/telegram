const clamp=v=>Math.max(0,Math.min(1,v));
const GAP=3, SEPARATION=9;

// A candidate must be one actual Okey combination, never just matching colours.
export function rackMatch(tiles){
  if(tiles.length<2 || tiles.length>13)return null;
  const fixed=tiles.filter(t=>!t.joker), wild=tiles.filter(t=>t.joker);
  if(!fixed.length)return null;
  if(tiles.length===2 && fixed.length===2 && fixed[0].color===fixed[1].color && fixed[0].number===fixed[1].number)
    return {kind:'pair',complete:true,ids:tiles.map(t=>t.id)};
  if(tiles.length<=4 && fixed.every(t=>t.number===fixed[0].number) && new Set(fixed.map(t=>t.color)).size===fixed.length)
    return {kind:'set',complete:tiles.length>=3,ids:[...fixed].sort((a,b)=>a.color-b.color).concat(wild).map(t=>t.id)};
  if(!fixed.every(t=>t.color===fixed[0].color) || new Set(fixed.map(t=>t.number)).size!==fixed.length)return null;
  for(let start=1;start<=13;start++){
    const end=start+tiles.length-1;if(end>14)continue;
    const numbers=Array.from({length:tiles.length},(_,i)=>(start+i-1)%13+1);
    if(!fixed.every(t=>numbers.includes(t.number)))continue;
    const spare=[...wild];
    return {kind:'run',complete:tiles.length>=3,ids:numbers.map(n=>(fixed.find(t=>t.number===n)||spare.shift()).id)};
  }
  return null;
}
const rowOf=p=>p.y<.5?0:1;
const capacity=b=>Math.max(1,Math.floor((b.w+b.tw+GAP)/(b.tw+GAP)));
const tileMap=hand=>new Map(hand.map(t=>[t.id,t]));

// Only a newly formed contact with another tile makes a sound. Moving an
// intact group, selecting, sorting, resizing and cancelling stay silent.
export function newRackContact(before,after,movingIds,b){
  const moving=new Set(movingIds),limit=b.tw+SEPARATION+1;
  const touching=(a,c)=>a&&c&&rowOf(a)===rowOf(c)&&Math.abs(a.x-c.x)*b.w<=limit;
  return movingIds.some(id=>Object.keys(after).some(other=>!moving.has(other)&&
    touching(after[id],after[other])&&!touching(before[id],before[other])));
}

export function rackBundles(hand,positions,b){
  const byId=tileMap(hand), found=[];
  for(let row=0;row<2;row++){
    const ids=hand.filter(t=>positions[t.id]&&rowOf(positions[t.id])===row).map(t=>t.id).sort((a,c)=>positions[a].x-positions[c].x);
    for(let i=0;i<ids.length;){
      let best=null;
      for(let end=i+1;end<ids.length;end++){
        const distance=(positions[ids[end]].x-positions[ids[end-1]].x)*b.w;
        if(distance>b.tw+GAP+1.5 || distance<b.tw-1)break;
        const match=rackMatch(ids.slice(i,end+1).map(id=>byId.get(id)));
        if(match && (!best || match.complete || !best.complete))best={...match,row};
      }
      if(best){found.push(best);i+=best.ids.length}else i++;
    }
  }
  return found;
}
function makeUnits(hand,positions,b){
  const bundles=rackBundles(hand,positions,b), used=new Set(), units=[];
  for(const group of bundles){
    const ids=[...group.ids].sort((a,c)=>positions[a].x-positions[c].x);ids.forEach(id=>used.add(id));
    units.push({ids,row:group.row,x:Math.min(...ids.map(id=>positions[id].x))*b.w});
  }
  for(const t of hand)if(!used.has(t.id)){
    const p=positions[t.id] || {x:0,y:0};units.push({ids:[t.id],row:rowOf(p),x:p.x*b.w});
  }
  return units;
}
function assignRows(units,cap){
  let states=new Map([['0:0',{counts:[0,0],cost:0,rows:[]}]]);
  for(const unit of units){
    const next=new Map();
    for(const state of states.values())for(let row=0;row<2;row++){
      if(unit.pinned && row!==unit.row)continue;
      const counts=[...state.counts];counts[row]+=unit.ids.length;if(counts[row]>cap)continue;
      const cost=state.cost+(row===unit.row?0:10+unit.ids.length),key=counts.join(':');
      if(!next.has(key)||next.get(key).cost>cost)next.set(key,{counts,cost,rows:[...state.rows,row]});
    }
    states=next;
  }
  return [...states.values()].sort((a,b)=>a.cost-b.cost)[0]?.rows;
}
function pack(units,original,b){
  const cap=capacity(b);let rows=assignRows(units,cap);
  // Long combinations may span the two rails; never squeeze tiles on top of each other.
  while(!rows){
    const index=units.findIndex(u=>u.ids.length>1&&!u.pinned);
    const fallback=index>=0?index:units.findIndex(u=>u.ids.length>1);
    if(fallback<0)throw Error('Das Brett ist zu schmal für diese Steine.');
    const u=units[fallback];units.splice(fallback,1,...u.ids.map((id,i)=>({ids:[id],row:u.row,x:u.x+i*(b.tw+GAP)})));
    rows=assignRows(units,cap);
  }
  const positions={};
  for(let row=0;row<2;row++){
    const line=units.map((u,i)=>({...u,row:rows[i],width:u.ids.length*b.tw+(u.ids.length-1)*GAP})).filter(u=>u.row===row).sort((a,c)=>a.x-c.x);
    if(!line.length)continue;
    const width=b.w+b.tw,total=line.reduce((n,u)=>n+u.width,0),gap=line.length>1?Math.min(SEPARATION,Math.max(GAP,(width-total)/(line.length-1))):0;
    let end=-gap;
    for(const u of line){u.left=Math.max(u.x,end+gap);end=u.left+u.width}
    let edge=width;
    for(let i=line.length-1;i>=0;i--){const u=line[i];u.left=Math.min(u.left,edge-u.width);edge=u.left-gap}
    for(const u of line)u.ids.forEach((id,i)=>{positions[id]={x:clamp((u.left+i*(b.tw+GAP))/b.w),y:row,z:original[id]?.z||1}});
  }
  return positions;
}
export function settleRack(hand,positions,b,previousBounds=b){
  const cap=capacity(b), current={};let index=0;
  for(const t of hand){const p=positions[t.id];current[t.id]=p?{...p,x:clamp(p.x),y:rowOf(p)}:{x:(index%cap)/Math.max(1,cap-1),y:Math.floor(index/cap)%2,z:1};index++}
  const units=makeUnits(hand,current,previousBounds);for(const unit of units)unit.x*=b.w/previousBounds.w;
  return pack(units,current,b);
}
export function dropRack(hand,positions,movingIds,destination,b){
  const byId=tileMap(hand), moving=movingIds.filter(id=>byId.has(id));
  if(!moving.length)return {positions:settleRack(hand,positions,b),match:null};
  const ids=new Set(moving), row=rowOf(destination),x=clamp(destination.x)*b.w;
  const others=hand.filter(t=>!ids.has(t.id)), line=others.filter(t=>rowOf(positions[t.id])===row).sort((a,c)=>positions[a.id].x-positions[c.id].x);
  let best=null;
  for(let i=0;i<line.length;i++)for(let end=i;end<line.length && end-i+1+moving.length<=capacity(b);end++){
    if(end>i){const left=positions[line[end-1].id].x*b.w,right=positions[line[end].id].x*b.w;const bridging=(x>=left&&x<=right)||moving.some(id=>rowOf(positions[id])===row&&positions[id].x*b.w>=left&&positions[id].x*b.w<=right);if(right-left>b.tw+SEPARATION+5+(bridging?moving.length*(b.tw+SEPARATION+5):0))break;}
    const left=positions[line[i].id].x*b.w,right=positions[line[end].id].x*b.w+b.tw;
    const distance=Math.max(left-(x+b.tw),x-right,0);if(distance>b.tw*.65+8)continue;
    const target=line.slice(i,end+1),match=rackMatch([...target,...moving.map(id=>byId.get(id))]);if(!match)continue;
    const score=(match.complete?1000:0)+match.ids.length*25-match.ids.filter(id=>byId.get(id).joker).length*30-distance-Math.abs((left+right)/2-(x+b.tw/2))*.15;
    if(!best||score>best.score)best={match,score,x:Math.min(left,x),target:target.map(t=>t.id)};
  }
  const joined=best?best.match.ids:moving,removed=new Set(joined);
  const units=makeUnits(hand.filter(t=>!removed.has(t.id)),positions,b);
  units.push({ids:joined,row,x:best?best.x:x,pinned:joined.length<=capacity(b)});
  return {positions:pack(units,positions,b),match:best?.match||null};
}

export class FreeRack {
  constructor(root,{markup,onMove,onSelect,selected}){
    this.root=root;this.layer=root.querySelector('#rack-tiles');this.markup=markup;this.onMove=onMove;this.onSelect=onSelect;this.selected=selected;this.positions={};this.key='';this.hand=[];this.drag=null;this.z=1;
    root.addEventListener('click',e=>{if(e.detail!==0&&performance.now()<(this.skipClick||0)){e.preventDefault();e.stopImmediatePropagation()}},true);
    root.addEventListener('dragstart',e=>e.preventDefault());
    root.addEventListener('pointerdown',e=>this.down(e));root.addEventListener('pointermove',e=>this.move(e));root.addEventListener('pointerup',e=>this.up(e));
    root.addEventListener('pointercancel',()=>this.cancel());root.addEventListener('lostpointercapture',()=>{if(this.drag)this.cancel()});root.addEventListener('keydown',e=>this.keyMove(e));
    root.addEventListener('click',e=>{
      if(e.target.closest('[data-tile]')||performance.now()<(this.skipClick||0))return;
      const id=this.selected();if(!id||!this.positions[id])return;
      const b=this.bounds(),r=this.layer.getBoundingClientRect();
      const result=dropRack(this.hand,this.positions,[id],{x:clamp((e.clientX-r.left-b.tw/2)/b.w),y:clamp((e.clientY-r.top-b.th/2)/b.h)},b);
      const contact=newRackContact(this.positions,result.positions,[id],b);
      this.positions=result.positions;this.save();this.place();this.onMove(id,{contact});
    });
    new ResizeObserver(()=>{if(this.drag)this.cancel();this.place()}).observe(root);
  }
  context(key){
    if(this.key===key)return;this.cancel();this.key=key;this.positions={};this.lastBounds=null;
    try{const saved=JSON.parse(sessionStorage.getItem('okey-rack:'+key)||'null');if(saved?.key===key){for(const [id,p]of Object.entries(saved.positions))if(Number.isFinite(p.x)&&Number.isFinite(p.y))this.positions[id]={x:clamp(p.x),y:clamp(p.y),z:1};if(Number.isFinite(saved.bounds?.w)&&saved.bounds.w>0&&Number.isFinite(saved.bounds?.tw)&&saved.bounds.tw>0)this.lastBounds=saved.bounds}}catch{}
  }
  save(){try{sessionStorage.setItem('okey-rack:'+this.key,JSON.stringify({key:this.key,positions:this.positions,bounds:this.lastBounds}))}catch{}}
  reset(){this.positions={};this.save()}
  arrange(groups){
    this.cancel(); const b=this.bounds(); let index=0;
    const units=groups.filter(g=>g.length).map(group=>{const start=index;index+=group.length;return {ids:group.map(t=>t.id),row:start<Math.ceil(this.hand.length/2)?0:1,x:(start%Math.ceil(this.hand.length/2))*(b.tw+SEPARATION)}});
    this.positions=pack(units,{},b);this.lastBounds=b;this.paint(this.positions,b);this.save();
  }
  bounds(){const t=this.layer.querySelector('.tile');const tw=t?.offsetWidth||32,th=t?.offsetHeight||44;return{tw,th,w:Math.max(1,this.layer.clientWidth-tw),h:Math.max(1,this.layer.clientHeight-th)}}
  render(hand,interactive){this.hand=hand;this.interactive=interactive;if(this.drag)return;this.layer.innerHTML=hand.map(t=>this.markup(t,interactive)).join('');this.place()}
  place(){if(this.drag||!this.hand.length||!this.layer.clientWidth||!this.layer.clientHeight)return;const slots=Math.max(8,Math.ceil(this.hand.length/2));this.layer.style.setProperty('--rack-fit-width',Math.floor((this.layer.clientWidth-(slots-1)*GAP)/slots)+'px');this.layer.style.setProperty('--rack-fit-height',Math.floor((this.layer.clientHeight-GAP)/2)+'px');const b=this.bounds();this.positions=settleRack(this.hand,this.positions,b,this.lastBounds||b);this.lastBounds=b;this.paint(this.positions,b);this.save()}
  paint(positions,b,magnet=null){
    const bundles=rackBundles(this.hand,positions,b), complete=bundles.filter(g=>g.complete), members=new Set(complete.flatMap(g=>g.ids));
    for(const el of this.layer.querySelectorAll('[data-tile],.tile')){
      const id=el.dataset.tile||this.hand[[...this.layer.children].indexOf(el)]?.id,p=positions[id];if(!p)continue;
      el.style.left=p.x*b.w+'px';el.style.top=p.y*b.h+'px';el.style.zIndex=this.drag?.ids.includes(id)?100:1;
      el.classList.toggle('bundled',members.has(id));el.classList.toggle('magnet-target',Boolean(magnet?.ids.includes(id)));
      el.setAttribute('aria-description',members.has(id)?'Teil einer passenden Kombination. Gemeinsam ziehen; zum Herauslösen zuerst antippen.':'Zum Auswählen antippen oder zum Verschieben ziehen.');
    }
    const caption=this.root.querySelector('.rack-engraving');
    if(caption){caption.textContent=magnet?`${magnet.complete?'✓':'＋'} ${ {run:'Reihe',set:'Gruppe',pair:'Paar'}[magnet.kind]} · loslassen`:complete.length?`${complete.length} passende Kombination${complete.length===1?'':'en'} · magnetisch verbunden`:'Steine ziehen · passende Kombinationen verbinden sich';}
  }
  down(e){
    const el=e.target.closest('[data-tile]');if(!el||e.button!==0)return;const id=el.dataset.tile,p=this.positions[id];if(!p)return;
    const group=this.selected()!==id&&!e.altKey?rackBundles(this.hand,this.positions,this.bounds()).find(g=>g.complete&&g.ids.includes(id)):null;
    this.drag={id,ids:group?.ids||[id],el,pointer:e.pointerId,sx:e.clientX,sy:e.clientY,origin:{...p},active:false,threshold:e.pointerType==='touch'?8:4,preview:null};this.root.setPointerCapture(e.pointerId);
  }
  move(e){
    const d=this.drag;if(!d||d.pointer!==e.pointerId)return;
    if(!d.active&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<d.threshold)return;
    e.preventDefault();d.active=true;d.el.classList.add('dragging');const b=this.bounds();
    const anchor=Math.min(...d.ids.map(id=>this.positions[id]?.x??d.origin.x));
    d.preview=dropRack(this.hand,this.positions,d.ids,{x:clamp(anchor+(e.clientX-d.sx)/b.w),y:clamp(d.origin.y+(e.clientY-d.sy)/b.h)},b);
    this.paint(d.preview.positions,b,d.preview.match);
  }
  up(e){
    const d=this.drag;if(!d||d.pointer!==e.pointerId)return;this.drag=null;d.el.classList.remove('dragging');
    if(this.root.hasPointerCapture(e.pointerId))this.root.releasePointerCapture(e.pointerId);this.skipClick=performance.now()+400;
    if(d.active){const contact=d.preview&&newRackContact(this.positions,d.preview.positions,d.ids,this.bounds());if(d.preview)this.positions=d.preview.positions;this.save();this.onMove(d.id,{group:d.ids.length>1,contact:Boolean(contact)});this.render(this.hand,this.interactive)}else this.onSelect(d.id);
  }
  cancel(){const d=this.drag;if(!d)return;this.drag=null;d.el.classList.remove('dragging');if(this.root.hasPointerCapture(d.pointer))this.root.releasePointerCapture(d.pointer);this.render(this.hand,this.interactive)}
  keyMove(e){
    const el=e.target.closest('[data-tile]');if(!el||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const b=this.bounds(),p=this.positions[el.dataset.tile],step=e.shiftKey?4:18;
    const result=dropRack(this.hand,this.positions,[el.dataset.tile],{x:clamp(p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)/b.w),y:e.key==='ArrowDown'?1:e.key==='ArrowUp'?0:p.y},b);
    const contact=newRackContact(this.positions,result.positions,[el.dataset.tile],b);
    this.positions=result.positions;this.place();this.onMove(el.dataset.tile,{contact});
  }
}
