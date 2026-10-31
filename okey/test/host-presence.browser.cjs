const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {mkdir} = require('node:fs/promises');
const path = require('node:path');

test('host sees disconnect and reconnect in an open menu and can replace an offline player', {timeout:30000}, async()=>{
  const {createApplication}=await import('../src/server.js');
  const app=createApplication({port:0});await app.listen();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  const errors=[];
  async function open(name,code=''){
    const page=await browser.newPage({viewport:{width:375,height:600},hasTouch:true,reducedMotion:'reduce'});
    page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
    await page.addInitScript(()=>{
      localStorage.setItem('okey-muted','true');const NativeSocket=WebSocket;
      window.WebSocket=class extends NativeSocket{constructor(url){super(url);window.presenceSocket=this;}};
    });
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=${name}${code?'&room='+code:''}`);
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');return page;
  }
  try{
    const host=await open('Arben');
    await host.click('[data-action=create]');await host.check('input[name=rounds][value="5"]');await host.locator('#match-form button[type=submit]').click();
    await host.waitForFunction(()=>document.body.dataset.stage==='lobby');
    const room=[...app.arena.rooms.values()][0];
    app.arena.join({id:'online-colleague',name:'Dritan'},room.code);
    const buddy=await open('Blerim',room.code);
    await buddy.waitForFunction(()=>document.body.dataset.stage==='lobby');
    await host.click('[data-action=settings]');await host.locator('#match-form button[type=submit]').click();
    await host.waitForFunction(()=>document.body.dataset.stage==='playing');
    await buddy.waitForFunction(()=>document.body.dataset.stage==='playing');room.nextPuffAt=Infinity;
    const seat=room.players.findIndex(p=>p.name==='Blerim'),id=room.players[seat].id;
    const hand=structuredClone(room.players[seat].hand),totals=[...room.totals];
    await buddy.click('#tools-button');assert.equal(await buddy.locator('#host-tools [data-host]').count(),0,'only the host can remove players');await buddy.click('#close-tools');
    await host.click('#tools-button');await host.locator('[data-section=players] summary').click();
    const card=host.locator(`.host-player[data-player-id="${id}"]`);
    assert.equal(await card.locator('.host-player-status').innerText(),'Am Tisch');
    await buddy.context().setOffline(true);await buddy.evaluate(()=>window.presenceSocket.close());
    await host.waitForFunction(()=>document.querySelector('[data-section=players] summary').textContent.includes('1 offline'));
    assert.equal(await host.locator('[data-section=players]').getAttribute('open'),'');
    assert.equal(await host.locator('.host-player').first().getAttribute('data-player-id'),id,'offline seats come first');
    assert.equal(await card.locator('.host-player-status').innerText(),'Offline · Platz reserviert');
    assert.equal(room.players[seat].bot,false,'closing the connection does not remove the player');
    await buddy.context().setOffline(false);await buddy.reload();
    await host.waitForFunction(id=>document.querySelector(`.host-player[data-player-id="${id}"] .host-player-status`)?.textContent==='Am Tisch',id);
    assert.deepEqual(room.players[seat].hand,hand,'reconnect keeps the same seat and hand');
    assert.equal(await host.locator('[data-section=players] summary').innerText(),'Mitspieler verwalten');
    await buddy.close();await host.waitForSelector('.host-player-status.is-offline');
    if(process.env.LAYOUT_SCREENSHOT_DIR){await mkdir(process.env.LAYOUT_SCREENSHOT_DIR,{recursive:true});await host.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOT_DIR,'host-offline-menu.png')});}
    await card.locator('[data-host=remove]').click();
    assert.equal(room.players[seat].id,id,'removal waits for confirmation');
    await host.locator('[data-action=dismiss-message]').click();
    await host.click('#tools-button');await card.locator('[data-host=remove]').click();await host.locator('[data-host-confirm=remove]').click();
    await host.waitForFunction(()=>document.querySelector('#seat-left')?.textContent.includes('Ersatz-Baba')||document.querySelector('#seat-right')?.textContent.includes('Ersatz-Baba')||document.querySelector('#seat-top')?.textContent.includes('Ersatz-Baba'));
    assert.equal(room.players[seat].bot,true);assert.notEqual(room.players[seat].id,id);
    assert.deepEqual(room.players[seat].hand,hand);assert.deepEqual(room.totals,totals);
    assert.throws(()=>app.arena.join({id,name:'Blerim'},room.code,room.players[seat].id),/entfernt/);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await app.close();}
});
