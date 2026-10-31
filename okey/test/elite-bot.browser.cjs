const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
for(const [width,height] of [[320,600],[390,844],[1440,900]])test(`fourth difficulty is selectable and seats remain compact at ${width}`,{timeout:30000},async()=>{
  const {createApplication}=await import('../src/server.js');const app=createApplication({port:0});await app.listen();
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined}),page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
  await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(()=>localStorage.setItem('okey-muted','true'));
  try{
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=Arben`);
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='LOKAL AM TISCH');
    await page.click('[data-action=solo]');
    const options=await page.locator('#bot-level option').allTextContents();assert.equal(options.length,4);assert.equal(options[3],'Ma mer mos luj se ki tmbyt');assert.ok(options[2].startsWith('Si Baba'));
    await page.selectOption('#bot-level','tmbyt');await page.check('input[name=rounds][value="5"]');
    const box=await page.locator('#bot-level').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    await page.locator('#match-form button[type=submit]').click();await page.waitForFunction(()=>document.body.dataset.stage==='playing');
    const room=[...app.arena.rooms.values()][0];assert.equal(room.botLevel,'tmbyt');
    assert.equal(await page.locator('.seat-status [title="Ma mer mos luj se ki tmbyt"]').count(),3);
    await page.reload();await page.waitForFunction(()=>document.body.dataset.stage==='playing');
    assert.equal(await page.locator('.seat-status [title="Ma mer mos luj se ki tmbyt"]').count(),3);
    const layout=await page.locator('.seat-status').evaluateAll(els=>els.map(e=>({scroll:e.scrollWidth,width:e.clientWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
    for(const b of layout){assert.ok(b.scroll<=b.width+1);assert.ok(b.left>=0&&b.right<=width)}
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await app.close()}
});
