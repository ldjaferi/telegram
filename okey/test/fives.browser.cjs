const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdir}=require('node:fs/promises');
for(const width of [320,390])test(`slow touch extracts the red five and all-combination sorting reuses it at ${width}`,{timeout:30000},async()=>{
 const {createApplication}=await import('../src/server.js');const app=createApplication({port:0});await app.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.addInitScript(()=>{localStorage.setItem('okey-muted','true');localStorage.setItem('okey-sort-only-free','true');const WS=WebSocket;window.WebSocket=class extends WS{constructor(url){super(url);window.fivesSocket=this}}});
 const hand=[...[5,6,7,8,9,10,11].map(number=>({id:`r${number}`,color:0,number})),...[11,12,13,1].map(number=>({id:`b${number}`,color:2,number})),{id:'b5',color:2,number:5},{id:'s5',color:3,number:5},{id:'b6',color:2,number:6}];
 const groups=()=>page.evaluate(async hand=>{const {rackBundles}=await import('./rack.js'),layer=document.querySelector('#rack-tiles'),tile=layer.querySelector('.tile'),b={w:layer.clientWidth-tile.offsetWidth,tw:tile.offsetWidth};const positions=Object.fromEntries([...layer.children].map(e=>[e.dataset.tile,{x:e.offsetLeft/b.w,y:e.offsetTop?1:0}]));return rackBundles(hand,positions,b).filter(g=>g.complete).map(g=>g.ids)},hand);
 const assertFives=async()=>{const combos=await groups();assert.ok(combos.some(g=>g.length===3&&['r5','b5','s5'].every(id=>g.includes(id))));assert.ok(combos.some(g=>g.length===6&&['r6','r7','r8','r9','r10','r11'].every(id=>g.includes(id))))};
 try{
  await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=Arben`);await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');
  await page.click('[data-action=solo]');await page.check('input[name=rounds][value="5"]');await page.locator('#match-form button[type=submit]').click();await page.waitForFunction(()=>document.body.dataset.stage==='playing');
  const room=[...app.arena.rooms.values()][0];room.nextPuffAt=Infinity;room.players[0].hand=hand;room.players[0].lastGesture=-Infinity;
  await page.evaluate(()=>window.fivesSocket.send(JSON.stringify({type:'gesture',gesture:'tea'})));await page.waitForSelector('[data-tile=r5]');
  const key=`okey-rack:${room.code}:${room.matchNumber}:${room.round}`;
  async function reset(){
   await page.evaluate(({key,hand})=>{const layer=document.querySelector('#rack-tiles'),tile=layer.querySelector('.tile'),bounds={w:layer.clientWidth-tile.offsetWidth,h:layer.clientHeight-tile.offsetHeight,tw:tile.offsetWidth,th:tile.offsetHeight};const positions=Object.fromEntries(hand.map((t,i)=>[t.id,{x:((i%7)*(bounds.tw+3)+(i>=11?6:0))/bounds.w,y:i<7?0:1}]));sessionStorage.setItem(key,JSON.stringify({key:key.slice('okey-rack:'.length),positions,bounds}));},{key,hand});
   await page.reload();await page.waitForSelector('[data-tile=r5].bundled');await page.evaluate(()=>document.querySelector('#table-event').replaceChildren());
  }
  await reset();
  const source=await page.locator('[data-tile=r5]').boundingBox(),target=await page.locator('[data-tile=b5]').boundingBox(),cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:source.x+source.width/2,y:source.y+source.height/2}]});
  // Real slow touch: formerly this silently grabbed the entire seven-tile run.
  await page.waitForTimeout(650);assert.equal(await page.locator('.group-grabbed').count(),0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+target.width/2,y:target.y+target.height/2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await assertFives();assert.equal(await page.locator('#tile-action-popover').isVisible(),false);assert.equal(await page.locator('#sort-only-free').isChecked(),true,'manual extraction ignores sorting protection');
  await page.reload();await page.waitForSelector('[data-tile=r5]');await assertFives();
  await reset();assert.equal(await page.locator('#sort-combinations').innerText(),'Freie Kombis');await page.click('#sort-combinations');
  assert.ok((await groups()).some(g=>g.includes('r5')&&g.includes('r11')),'only-free deliberately preserves the red run');
  await page.uncheck('#sort-only-free');assert.equal(await page.locator('#sort-combinations').innerText(),'Alle Kombis');await page.click('#sort-combinations');await assertFives();
  assert.equal(await page.locator('#toast').innerText(),'');assert.equal(await page.locator('#rack-tiles .tile').count(),14);
  const boxes=await page.locator('.rack-sort button,.sort-free').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}}));
  for(let i=0;i<boxes.length;i++){assert.ok(boxes[i].left>=0&&boxes[i].right<=width);if(i)assert.ok(boxes[i].left>=boxes[i-1].right,'sort labels do not overlap')}
  if(process.env.LAYOUT_SCREENSHOT_DIR){await mkdir(process.env.LAYOUT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/fives-${width}.png`})}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await app.close()}
});
