const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {chromium}=require('playwright');

async function fixture(){
  const {createApplication}=await import('../src/server.js');
  const app=createApplication({port:0,botToken:'test-token'});await app.listen();
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  const errors=[];
  async function context(storageState){
    const ctx=await browser.newContext({viewport:{width:375,height:600},reducedMotion:'reduce',storageState});
    await ctx.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
    // Exercise the public-browser name form with the real local HTTP/WS server.
    await ctx.route('**/api/config',r=>r.fulfill({json:{dev:false,guestAccess:true,botUsername:''}}));
    await ctx.addInitScript(base=>{if(location.origin===base)localStorage.setItem('okey-muted','true')},base);
    ctx.on('page',p=>{p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message))});
    return ctx;
  }
  async function open(ctx,code='',name){
    const page=await ctx.newPage();await page.goto(base+(code?'/?room='+code:'/'));
    if(name){await page.fill('#guest-name',name);await page.click('#guest-form button')}
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='AM TISCH');return page;
  }
  async function login(name,initData){
    const res=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name,initData})});
    assert.equal(res.status,200);return res.json();
  }
  return {app,browser,base,errors,context,open,login,async close(){await browser.close();await app.close()}};
}

test('closing and reopening an invitation restores the guest and host at a full locked table', {timeout:30000},async()=>{
  const f=await fixture();
  try{
    let hostContext=await f.context();const guestContext=await f.context();
    let host=await f.open(hostContext,'','Arben');
    await host.click('[data-action=create]');await host.check('input[name=rounds][value="5"]');await host.locator('#match-form button[type=submit]').click();
    await host.waitForFunction(()=>document.body.dataset.stage==='lobby');
    const room=[...f.app.arena.rooms.values()][0];
    let guest=await f.open(guestContext,room.code,'Blerim');
    await guest.waitForFunction(()=>document.body.dataset.stage==='lobby');
    for(const name of ['Ilir','Dritan'])f.app.arena.join({id:name,name},room.code);
    await host.click('[data-action=settings]');await host.locator('#match-form button[type=submit]').click();
    await guest.waitForFunction(()=>document.body.dataset.stage==='playing');room.nextPuffAt=Infinity;
    const guestSeat=room.players.findIndex(p=>p.name==='Blerim'),id=room.players[guestSeat].id,owner=room.owner;
    const hand=structuredClone(room.players[guestSeat].hand),totals=[...room.totals];
    await host.click('#tools-button');await host.click('[data-host=lock]');await host.waitForSelector('[data-host=unlock]');await host.click('#close-tools');
    await guest.close();await host.waitForSelector(`.avatar-button[data-player="${id}"]`);
    guest=await f.open(guestContext,room.code);
    await guest.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(await guest.locator('#guest-form,[data-bot-seat]').count(),0);
    assert.equal(room.players[guestSeat].id,id);assert.equal(room.players[guestSeat].connected,true);
    assert.deepEqual(room.players[guestSeat].hand,hand);assert.deepEqual(room.totals,totals);
    await host.waitForFunction(()=>!document.querySelector('.avatar-button[data-host=remove]'));
    const saved=await hostContext.storageState();await hostContext.close();
    hostContext=await f.context(saved);host=await f.open(hostContext,room.code);
    await host.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(room.owner,owner);assert.equal(room.players[0].id,owner);assert.equal(room.players[0].connected,true);
    await host.click('#tools-button');await host.waitForSelector('[data-host=unlock]');
    assert.equal(room.players.length,4);assert.equal(room.players.filter(p=>p.bot).length,0);
    const stranger=await f.open(await f.context(),room.code,'Blerim');
    await stranger.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('gesperrt'));
    assert.equal(room.players.filter(p=>p.name==='Blerim').length,1,'a matching name cannot claim somebody else’s seat');
    assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
});

test('legacy browser sessions migrate, stale sessions ask for a name, Telegram identities stay separate', {timeout:30000},async()=>{
  const f=await fixture();
  try{
    const old=await f.login('Alter Gast'),room=f.app.arena.create(old.user,true,{roundLimit:5});room.nextPuffAt=Infinity;
    const ctx=await f.context(),seed=await ctx.newPage();
    await seed.route(f.base+'/',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));await seed.goto(f.base);
    await seed.evaluate(token=>sessionStorage.setItem('okey-token',token),old.token);await seed.unroute(f.base+'/');
    await seed.goto(f.base+'/?room='+room.code);await seed.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(await seed.evaluate(()=>localStorage.getItem('okey-browser-token')),old.token);
    assert.equal(await seed.evaluate(()=>sessionStorage.getItem('okey-token')),null);await seed.close();
    const returning=await f.open(ctx,room.code);await returning.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(room.owner,old.user.id);await returning.close();

    const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456,first_name:'Telegram Gast'})});
    const data=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    params.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update('test-token').digest()).update(data).digest('hex'));
    const telegram=await ctx.newPage();await telegram.addInitScript(initData=>{window.Telegram={WebApp:{initData,ready(){},expand(){}}}},params.toString());
    await telegram.goto(f.base);await telegram.waitForFunction(()=>document.querySelector('#connection').textContent==='AM TISCH');
    assert.equal(await telegram.locator('#guest-form').count(),0);assert.equal(await telegram.locator('body').getAttribute('data-stage'),'welcome');
    await telegram.click('[data-action=solo]');await telegram.check('input[name=rounds][value="5"]');await telegram.locator('#match-form button[type=submit]').click();
    await telegram.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(f.app.arena.roomFor('123456').owner,'123456');
    assert.equal(await telegram.evaluate(()=>localStorage.getItem('okey-browser-token')),old.token,'Telegram does not overwrite the browser seat');
    await telegram.reload();await telegram.waitForFunction(()=>document.body.dataset.stage==='playing');
    const browserGuest=await f.open(ctx,room.code);await browserGuest.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(room.players[0].id,old.user.id);

    // A server restart/expired token must not trap the guest in a retry loop.
    const staleContext=await f.context({cookies:[],origins:[{origin:f.base,localStorage:[{name:'okey-browser-token',value:'expired-token'}]}]});
    const fresh=await f.open(staleContext,'','Neuer Gast');
    assert.notEqual(await fresh.evaluate(()=>localStorage.getItem('okey-browser-token')),'expired-token');
    assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
});
