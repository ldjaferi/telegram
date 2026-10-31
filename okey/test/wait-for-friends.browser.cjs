const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');

for(const fill of [false,true])test(`friends table waits, then starts ${fill?'with four humans':'only after choosing bots'}`,{timeout:30000},async()=>{
  const {createApplication}=await import('../src/server.js');
  const app=createApplication({port:0});await app.listen();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  const errors=[];
  async function open(name,code){
    const page=await browser.newPage({viewport:fill?{width:1440,height:900}:{width:375,height:600},reducedMotion:'reduce'});
    page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
    await page.addInitScript(()=>localStorage.setItem('okey-muted','true'));
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=${name}${code?'&room='+code:''}`);
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');return page;
  }
  try{
    const host=await open('Arben');await host.click('[data-action=create]');
    await host.check('input[name=rounds][value="7"]');await host.locator('#match-form button[type=submit]').click();
    await host.waitForSelector('[data-action=start-with-bots]');
    const room=[...app.arena.rooms.values()][0];
    const assertWaiting=()=>{assert.equal(room.status,'lobby');assert.equal(room.round,0);assert.ok(room.players.every(p=>p.hand.length===0));assert.equal(room.roundLimit,7)};
    assertWaiting();assert.equal(await host.locator('#modal').isVisible(),false);
    assert.match(await host.locator('.lobby-presence').innerText(),/1 von 4/);
    await host.click('[data-action=wait-for-friends]');assertWaiting();
    await host.reload();await host.waitForSelector('[data-action=start-with-bots]');assertWaiting();
    const buddy=await open('Blerim',room.code);await buddy.waitForFunction(()=>document.body.dataset.stage==='lobby');
    await host.waitForFunction(()=>document.querySelector('.lobby-presence').textContent.includes('2 von 4'));
    assert.equal(await buddy.locator('[data-action=start-with-bots],[data-action=start],[data-action=settings]').count(),0,'only host has start/settings controls');
    if(fill){
      for(const name of ['Dritan','Ilir']){const p=await open(name,room.code);await p.waitForFunction(()=>document.body.dataset.stage==='lobby')}
      await host.waitForSelector('[data-action=start]');assertWaiting();
      assert.equal(await host.locator('[data-action=start-with-bots]').count(),0);
      assert.match(await host.locator('.lobby-presence').innerText(),/4 von 4/);
    }else{
      // Explicitly changing rules must also leave the friends table waiting.
      await host.click('[data-action=settings]');assert.equal(await host.locator('input[name=rounds][value="7"]').isChecked(),true);
      await host.locator('#match-form button[type=submit]').click();await host.waitForSelector('[data-action=start-with-bots]');assertWaiting();
    }
    if(process.env.LAYOUT_SCREENSHOT_DIR){await mkdir(process.env.LAYOUT_SCREENSHOT_DIR,{recursive:true});await host.evaluate(()=>scrollTo(0,0));await host.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOT_DIR,`friends-wait-${fill?'full':'bots'}.png`),fullPage:true})}
    await host.click(fill?'[data-action=start]':'[data-action=start-with-bots]');
    await host.waitForFunction(()=>document.body.dataset.stage==='playing');await buddy.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(await host.locator('#modal').isVisible(),false,'start does not reopen the round form');
    assert.equal(room.round,1);assert.equal(room.roundLimit,7);assert.equal(room.players.filter(p=>p.bot).length,fill?0:2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await app.close()}
});
