const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');

for (const touch of [true, false]) test(`extracting and holding combinations with ${touch?'touch':'mouse'}`, {timeout:30000}, async () => {
  const {createApplication} = await import('../src/server.js');
  const app = createApplication({port:0}); await app.listen();
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined});
  const context = await browser.newContext({viewport:touch?{width:320,height:600}:{width:1440,height:900},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'});
  const page = await context.newPage(), errors=[];page.setDefaultTimeout(5000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(()=>{
    localStorage.setItem('okey-muted','true');
    const NativeSocket=WebSocket;
    window.WebSocket=class extends NativeSocket{constructor(url){super(url);window.rackSocket=this;}};
  });
  const cdp=await context.newCDPSession(page);
  const point=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
  const down=async p=>touch?cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}):(await page.mouse.move(p.x,p.y),page.mouse.down());
  const move=async p=>touch?cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]}):page.mouse.move(p.x,p.y);
  const up=async()=>touch?cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}):page.mouse.up();
  const boxes=()=>page.locator('#rack-tiles [data-tile]').evaluateAll(els=>Object.fromEntries(els.map(e=>[e.dataset.tile,{x:e.offsetLeft,y:e.offsetTop}])));
  async function capture(stage){if(process.env.LAYOUT_SCREENSHOT_DIR){await mkdir(process.env.LAYOUT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOT_DIR,`rack-${touch?'touch':'mouse'}-${stage}.png`)});}}
  try {
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=Arben`);
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');
    await page.click('[data-action=solo]');await page.check('input[name=rounds][value="5"]');await page.locator('#match-form button[type=submit]').click();
    await page.waitForFunction(()=>document.body.dataset.stage==='playing');
    const room=[...app.arena.rooms.values()][0];room.nextPuffAt=Infinity;
    room.players[0].hand=[1,2,3].map(n=>({id:`run-${n}`,number:n,color:0})).concat(Array.from({length:12},(_,i)=>({id:`spare-${i}`,number:(i*3)%13+1,color:i%3+1})));
    room.players[0].lastGesture=-Infinity;
    await page.evaluate(()=>window.rackSocket.send(JSON.stringify({type:'gesture',gesture:'tea'})));
    await page.waitForSelector('[data-tile=run-2]');
    const key=`okey-rack:${room.code}:${room.matchNumber||1}:${room.round}`;
    async function reset(){
      await page.evaluate(key=>{
        const layer=document.querySelector('#rack-tiles'),tile=layer.querySelector('.tile');
        const bounds={w:layer.clientWidth-tile.offsetWidth,h:layer.clientHeight-tile.offsetHeight,tw:tile.offsetWidth,th:tile.offsetHeight};
        const positions={};
        for(let i=0;i<3;i++)positions[`run-${i+1}`]={x:i*(bounds.tw+3)/bounds.w,y:0};
        for(let i=0;i<12;i++)positions[`spare-${i}`]={x:(i<4?3*(bounds.tw+3)+6+i*(bounds.tw+9):(i-4)*(bounds.tw+9))/bounds.w,y:i<4?0:1};
        sessionStorage.setItem(key,JSON.stringify({key:key.slice('okey-rack:'.length),positions,bounds}));
      },key);
      await page.reload();await page.waitForSelector('[data-tile=run-2].bundled');
      await page.evaluate(()=>document.querySelector('#table-event').replaceChildren());
    }
    await reset();
    let before=await boxes(),tile=await page.locator('[data-tile=run-2]').boundingBox(),layer=await page.locator('#rack-tiles').boundingBox();
    // No preliminary tap: one continuous drag extracts the middle tile.
    await down(point(tile));await move({x:layer.x+layer.width-tile.width/2-1,y:layer.y+layer.height-tile.height/2-1});await up();
    let after=await boxes();assert.ok(after['run-2'].y>before['run-2'].y+20);
    assert.deepEqual(after['run-1'],before['run-1']);assert.deepEqual(after['run-3'],before['run-3']);
    assert.equal(await page.locator('[data-tile=run-2]').getAttribute('class').then(c=>c.includes('bundled')),false);
    assert.equal(await page.locator('#rack-tiles [data-tile]').count(),15);
    await capture('extracted');

    await reset();tile=await page.locator('[data-tile=run-2]').boundingBox();before=await boxes();
    await down(point(tile));await page.waitForFunction(()=>document.querySelectorAll('.group-grabbed').length===3);
    await capture('held');
    await move({x:point(tile).x+55,y:point(tile).y});await up();after=await boxes();
    for(const id of ['run-1','run-2','run-3'])assert.ok(after[id].x>before[id].x+20,'whole combination moves');
    assert.ok(Math.abs((after['run-2'].x-after['run-1'].x)-(before['run-2'].x-before['run-1'].x))<1);
    assert.equal(await page.locator('.group-grabbed').count(),0,'grip highlight clears after release');

    // The selected tile also offers a tap-to-place alternative on blank wood.
    await reset();if(touch)await page.locator('[data-tile=run-2]').tap();else await page.locator('[data-tile=run-2]').click();
    await page.waitForSelector('.tile-move-hint:not([hidden])');await capture('hint');
    layer=await page.locator('#rack-tiles').boundingBox();tile=await page.locator('[data-tile=run-2]').boundingBox();
    if(touch)await page.touchscreen.tap(layer.x+layer.width-tile.width/2-1,layer.y+tile.height/2);
    else await page.mouse.click(layer.x+layer.width-tile.width/2-1,layer.y+tile.height/2);
    after=await boxes();assert.ok(after['run-2'].x>tile.width*2,'tap-to-place detaches the selected tile');
    assert.equal(await page.locator('[data-tile=run-2].bundled').count(),0);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await app.close();}
});
