const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');

for(const [width,height] of [[320,600],[1440,900]])test(`number and free-tile sorting at ${width}x${height}`,{timeout:30000},async()=>{
  const {createApplication}=await import('../src/server.js');const app=createApplication({port:0});await app.listen();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(5000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(()=>{localStorage.setItem('okey-muted','true');const WS=WebSocket;window.WebSocket=class extends WS{constructor(url){super(url);window.sortSocket=this}}});
  const positions=()=>page.locator('#rack-tiles .tile').evaluateAll(els=>Object.fromEntries(els.map(e=>[e.dataset.tile,{x:e.offsetLeft,y:e.offsetTop}])));
  try{
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=Arben`);await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');
    await page.click('[data-action=solo]');await page.check('input[name=rounds][value="5"]');await page.locator('#match-form button[type=submit]').click();
    await page.waitForFunction(()=>document.body.dataset.stage==='playing');
    const room=[...app.arena.rooms.values()][0];room.nextPuffAt=Infinity;
    const values=[[1,0],[2,0],[3,0],[9,1],[2,2],[10,2],null,[12,2],[6,0],[4,0],[5,0],[7,1],[7,1],[1,1],[3,3]];
    const hand=values.map((v,i)=>v?{id:`s-${i}`,number:v[0],color:v[1]}:{id:`s-${i}`,joker:true});room.players[0].hand=hand;
    room.players[0].lastGesture=-Infinity;await page.evaluate(()=>window.sortSocket.send(JSON.stringify({type:'gesture',gesture:'tea'})));await page.waitForSelector('[data-tile=s-0]');
    const key=`okey-rack:${room.code}:${room.matchNumber}:${room.round}`;
    const kept=['s-0','s-1','s-2','s-5','s-6','s-7','s-11','s-12'];
    async function reset(){
      await page.evaluate(({key,ids})=>{
        const layer=document.querySelector('#rack-tiles'),tile=layer.querySelector('.tile'),bounds={w:layer.clientWidth-tile.offsetWidth,h:layer.clientHeight-tile.offsetHeight,tw:tile.offsetWidth,th:tile.offsetHeight};
        const positions=Object.fromEntries(ids.map((id,i)=>[id,{x:((i%8)*(bounds.tw+3)+(i>=9?6:0)+(i>=10?6:0))/bounds.w,y:i<8?0:1}]));
        sessionStorage.setItem(key,JSON.stringify({key:key.slice('okey-rack:'.length),positions,bounds}));
      },{key,ids:hand.map(t=>t.id)});
      await page.reload();await page.waitForSelector('[data-tile=s-0].bundled');await page.evaluate(()=>document.querySelector('#table-event').replaceChildren());
    }
    for(const button of ['sort','sort-numbers','sort-combinations']){
      await reset();await page.check('#sort-only-free');const before=await positions();
      await page.locator('[data-tile=s-3]').click();await page.waitForSelector('#tile-action-popover:not([hidden])');
      await page.click('#'+button);const after=await positions();
      for(const id of kept)assert.deepEqual(after[id],before[id],`${button}: kept ${id} stays in place`);
      assert.equal(await page.locator('#tile-action-popover').isVisible(),false);
      assert.equal(await page.locator('#toast').innerText(),'','sorting produces no toast over the rack');
      if(button==='sort-numbers'){
        const free=hand.filter(t=>!kept.includes(t.id)).sort((a,b)=>after[a.id].y-after[b.id].y||after[a.id].x-after[b.id].x);
        assert.deepEqual(free.map(t=>t.number),free.map(t=>t.number).sort((a,b)=>a-b));
      }
      await page.reload();await page.waitForSelector('[data-tile=s-0]');const reloaded=await positions();
      for(const id of kept)assert.deepEqual(reloaded[id],before[id],'server render and reload keep fixed positions');
      assert.equal(await page.locator('#sort-only-free').isChecked(),true);
    }
    await page.uncheck('#sort-only-free');await page.click('#sort-numbers');const sorted=await positions();
    const visual=hand.slice().sort((a,b)=>sorted[a.id].y-sorted[b.id].y||sorted[a.id].x-sorted[b.id].x);
    assert.equal(visual.at(-1).joker,true);const numbers=visual.filter(t=>!t.joker).map(t=>t.number);assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));
    const boxes=await page.locator('.rack-sort button,.sort-free').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,visible:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}));
    for(const box of boxes){assert.ok(box.x>=0&&box.right<=width&&box.bottom<=height);assert.ok(box.visible,'sorting controls are reachable')}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(Math.min(boxes[i].right,boxes[j].right)-Math.max(boxes[i].x,boxes[j].x)<=.5,'sort controls do not overlap');
    if(process.env.LAYOUT_SCREENSHOT_DIR){await mkdir(process.env.LAYOUT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOT_DIR,`sorting-${width}.png`)})}
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await app.close()}
});
