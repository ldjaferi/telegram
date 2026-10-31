const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');

test('shared Besa and excuses, tea receipt, thinking reminder and invalid-claim sound', {timeout:30000}, async () => {
  const {createApplication} = await import('../src/server.js');
  const app = createApplication({port:0}); await app.listen();
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined});
  const pages = [], errors = [];
  const capture = async (page, stage) => {
    if (!process.env.LAYOUT_SCREENSHOT_DIR) return;
    await mkdir(process.env.LAYOUT_SCREENSHOT_DIR, {recursive:true});
    await page.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOT_DIR, `fun-${page.viewportSize().width}-${stage}.png`)});
  };
  try {
    for (const [i, viewport] of [{width:375,height:600},{width:1440,height:900}].entries()) {
      const page = await browser.newPage({viewport, reducedMotion:'reduce'}); pages.push(page);
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
      await page.addInitScript(()=>{
        localStorage.setItem('okey-muted','true'); window.testTones=[];
        const NativeSocket=WebSocket;
        window.WebSocket=class extends NativeSocket {constructor(url){super(url);window.funSocket=this;}};
        const create=AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator=function(){const node=create.call(this),start=node.start.bind(node);node.start=(...args)=>{window.testTones.push(node.type);return start(...args);};return node;};
      });
      const room = [...app.arena.rooms.values()][0];
      await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=${i?'Blerim':'Arben'}${room?'&room='+room.code:''}`);
      if (!room) {
        await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');
        await page.click('[data-action=create]'); await page.check('input[name=rounds][value="5"]');
        await page.locator('#match-form button[type=submit]').click();
      }
      await page.waitForFunction(()=>document.body.dataset.stage==='lobby');
    }
    const [host, other] = pages, room = [...app.arena.rooms.values()][0];
    app.arena.join({id:'c',name:'Dritan'},room.code); app.arena.join({id:'d',name:'Ilir'},room.code);
    async function sync(){
      room.players[0].lastGesture=-Infinity;
      await host.evaluate(()=>window.funSocket.send(JSON.stringify({type:'gesture',gesture:'tea'})));
      await Promise.all(pages.map(p=>p.waitForSelector('.event-card.tea')));
      await Promise.all(pages.map(p=>p.evaluate(()=>document.querySelector('#table-event').replaceChildren())));
    }
    await sync(); await host.click('[data-action=start]');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>document.body.dataset.stage==='playing')));
    room.nextPuffAt=Infinity;
    room.players[0].hand=Array.from({length:15},(_,i)=>({id:`invalid-${i}`,color:i===14?3:0,number:i===14?12:13}));
    await sync(); room.players[0].lastGesture=-Infinity;
    const hand=structuredClone(room.players[0].hand);
    await host.click('#tools-button');
    assert.equal(await host.locator('#tools-dialog [data-gesture=besa]').count(),0,'Besa is not under More');
    await host.click('#close-tools');
    await host.click('#fun-button');
    assert.equal(await host.locator('#fun-button').getAttribute('aria-expanded'),'true');
    assert.equal(room.players[0].out,false,'opening the action menu does not surrender');
    await capture(host,'action-menu');
    await host.keyboard.press('Escape');
    await host.waitForFunction(()=>document.activeElement.id==='fun-button'&&document.querySelector('#fun-button').getAttribute('aria-expanded')==='false');
    assert.equal(await host.locator('#fun-button').getAttribute('aria-expanded'),'false');
    await host.click('#fun-button'); await host.getByRole('button',{name:'Fuge drasen',exact:true}).click();
    await host.waitForSelector('#confirm-throw');
    assert.equal(room.players[0].out,false,'choosing Fuge drasen still waits for confirmation');
    await host.click('#keep-board'); assert.deepEqual(room.players[0].hand,hand);
    await host.click('#fun-button'); await host.locator('[data-gesture=besa]').click();
    assert.equal(await host.locator('#fun-dialog').evaluate(d=>d.open),false);
    await Promise.all(pages.map(p=>p.waitForSelector('.fun-announcement')));
    for(const p of pages)assert.equal(await p.locator('.fun-announcement .event-copy').innerText(),'Besa, ich habe keinen Joker!');
    assert.deepEqual(room.players[0].hand,hand); await capture(host,'besa');
    await Promise.all(pages.map(p=>p.evaluate(()=>document.querySelector('#table-event').replaceChildren())));

    const bujHeard = new Set();
    for (let i=0; i<3; i++) {
      room.players[0].lastGesture=-Infinity;
      for(let n=0;n<20;n++)app.arena.event(room,'draw',{player:room.players[0].id});
      await host.locator('[data-gesture=buj]').click();
      await Promise.all(pages.map(p=>p.waitForSelector('.buj-mode')));
      const line=room.events.at(-1).line;
      assert.ok(!bujHeard.has(line),'Buj does not repeat when other actions advance the event sequence');
      bujHeard.add(line);
      for(const p of pages)assert.equal(await p.locator('.buj-mode .event-copy').innerText(),line,'all players see the server-selected Buj line');
      await Promise.all(pages.map(p=>p.evaluate(()=>document.querySelector('#table-event').replaceChildren())));
    }

    await host.locator('#rack-tiles .tile').first().click(); await host.click('#claim');
    await host.waitForSelector('.invalid-claim');
    assert.deepEqual(await host.evaluate(()=>window.testTones),[],'muted invalid claim is silent');
    assert.deepEqual(room.players[0].hand,hand); assert.equal(room.turn,0);
    await host.click('[data-action=dismiss-message]'); await host.click('#sound');
    await host.evaluate(()=>window.testTones=[]); await host.locator('#rack-tiles .tile').first().click(); await host.click('#claim'); await host.waitForSelector('.invalid-claim');
    assert.ok((await host.evaluate(()=>window.testTones)).includes('sawtooth'),'unmuted invalid claim plays the brass voice');
    await capture(host,'invalid-claim'); await host.click('[data-action=dismiss-message]'); await host.click('#sound');

    // The server tick broadcasts the reminder only once for this turn.
    room.deadline=Date.now()+74000;
    await Promise.all(pages.map(p=>p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Pension'))));
    assert.equal(room.events.filter(e=>e.type==='thinker').length,1);
    await capture(host,'thinker');
    app.arena.finish(room,room.players[1],'melds'); await sync();
    await Promise.all(pages.map(p=>p.waitForFunction(()=>document.body.dataset.stage==='finished')));
    assert.equal(await host.locator('[data-gesture=excuse]').count(),1);
    assert.equal(await other.locator('[data-gesture=excuse]').count(),0);
    await other.click('#tools-button');
    assert.equal(await other.locator('#host-tools [data-host]').count(),0,'guests do not see host controls');
    await other.locator('[data-section=awards] summary').click();
    assert.equal(await other.locator('.host-awards li').count(),room.awards.length,'round awards remain available in More');
    await other.click('#close-tools');
    await capture(host,'result');
    await host.click('[data-action=tea-bill]'); await host.waitForSelector('.tea-bill');
    assert.match(await host.locator('.tea-bill').innerText(),/Arben.*Dritan/s);
    assert.match(await host.locator('.tea-bill').innerText(),/Team A zahlt den Çay/);
    const box=await host.locator('#modal').boundingBox();
    assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=375&&box.y+box.height<=600,'receipt fits a short phone viewport');
    await capture(host,'receipt'); await host.click('[data-action=dismiss-message]');
    room.players[0].lastGesture=-Infinity;
    await host.click('[data-gesture=excuse]');
    await Promise.all(pages.map(p=>p.waitForSelector('.fun-announcement')));
    const line=room.events.at(-1).line;
    for(const p of pages)assert.equal(await p.locator('.fun-announcement .event-copy').innerText(),line);
    await capture(host,'excuse');
    await other.click('#fun-button'); assert.equal(await other.locator('[data-gesture=besa]').isDisabled(),true);
    await other.click('#close-fun');
    await host.click('[data-action=start]'); await host.waitForFunction(()=>document.body.dataset.stage==='playing');
    await host.click('#fun-button'); await host.getByRole('button',{name:'Fuge drasen',exact:true}).click();
    await host.click('#confirm-throw');
    await host.waitForFunction(()=>document.querySelector('#seat-top') && document.querySelector('#turn-label').textContent.includes('Brett weg'));
    assert.equal(room.players[0].out,true,'confirmation really surrenders the round');
    assert.equal(room.status,'playing','remaining players continue');
    assert.deepEqual(errors,[]);
  } finally {await browser.close(); await app.close();}
});
