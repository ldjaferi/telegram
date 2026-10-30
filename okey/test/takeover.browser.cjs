const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');

for (const [entry, width, height] of [['browser',375,600],['telegram',844,390]]) {
  test(`invitation, seat selection, stale choice and takeover via ${entry}`, {timeout:30000}, async () => {
    const { createApplication } = await import('../src/server.js');
    const app = createApplication({port:0}); await app.listen();
    const room = app.arena.create({id:'host',name:'Gastgeber'},true,{mode:'teams',roundLimit:7});
    room.nextPuffAt = Infinity;
    const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined});
    const context = await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:'reduce'});
    const page = await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
    await page.addInitScript(({entry,code})=>{
      localStorage.setItem('okey-muted','true');
      if(entry==='telegram')window.Telegram={WebApp:{initDataUnsafe:{start_param:'room_'+code},ready(){},expand(){}}};
    },{entry,code:room.code});
    const capture=async stage=>{
      if(process.env.LAYOUT_SCREENSHOT_DIR){
        await mkdir(process.env.LAYOUT_SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOT_DIR,`takeover-${entry}-${stage}.png`)});
      }
    };
    try {
      await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=NeuerSpieler${entry==='browser'?'&room='+room.code:''}`);
      await page.waitForSelector('[data-bot-seat]');
      assert.equal(await page.locator('[data-bot-seat]').count(),3);
      assert.equal(room.players.filter(p=>!p.bot).length,1,'preview does not join a seat');
      const wanted = room.players[2], wantedId=wanted.id, stolenId=room.players[1].id;
      const hand=[...wanted.hand], totals=[...room.totals];
      assert.match(await page.locator(`[data-bot-seat="${wantedId}"]`).innerText(),/Team A.*Gegenüber: Gastgeber/s);
      await page.locator('[data-refresh-seats]').scrollIntoViewIfNeeded();
      await page.locator('[data-refresh-seats]').click();
      await page.waitForSelector('[data-bot-seat]');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('[data-bot-seat]').first().scrollIntoViewIfNeeded(); await capture('choices');
      // Another client gets this seat while the displayed list is still open.
      app.arena.join({id:'racer',name:'SchnellerKollege'},room.code,stolenId);
      await page.locator(`[data-bot-seat="${stolenId}"]`).click();
      await page.waitForFunction(()=>document.querySelectorAll('[data-bot-seat]').length===2);
      assert.match(await page.locator('#modal-content').innerText(),/nicht mehr frei/);
      await page.locator(`[data-bot-seat="${wantedId}"]`).click();
      await page.waitForFunction(()=>document.body.dataset.stage==='playing'&&!document.querySelector('#modal').open);
      assert.equal(room.players[2].name,'NeuerSpieler'); assert.equal(room.players[2].bot,false);
      assert.deepEqual(room.players[2].hand,hand);assert.deepEqual(room.totals,totals);
      assert.equal(await page.locator('#rack-tiles [data-tile]').count(),14);
      assert.match(await page.locator('#seat-top .seat-name').innerText(),/Gastgeber/);
      await capture('joined');
      await page.reload();
      await page.waitForFunction(()=>document.body.dataset.stage==='playing');
      assert.equal(await page.locator('[data-bot-seat]').count(),0,'reconnect uses the existing seat');
      assert.deepEqual(errors,[]);
    } catch(error){await capture('failure');throw error;}
    finally {await browser.close();await app.close();}
  });
}
