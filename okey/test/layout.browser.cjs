// Run separately from the server tests: npm run test:layout.
// CHROMIUM_PATH may point at a system browser; otherwise use Playwright's browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const viewports = [
  [320, 600], [320, 640], [375, 600], [390, 720], [390, 736], [412, 780], [768, 1024],
  [844, 390], [1024, 600], [1366, 768], [1440, 900]
];
const screenshotDir = process.env.LAYOUT_SCREENSHOT_DIR;
const label = viewport => viewport.join('x');

async function geometry(page) {
  return page.evaluate(() => {
    const rect = el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
        visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' };
    };
    const all = selector => [...document.querySelectorAll(selector)].map(rect).filter(r => r.visible);
    const table = document.querySelector('.table'), tr = rect(table), style = getComputedStyle(table);
    const edge = parseFloat(style.getPropertyValue('--edge')), head = parseFloat(style.getPropertyValue('--head'));
    const interactive = [...document.querySelectorAll('#center button,#center a')].filter(el => rect(el).visible);
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      stage: document.body.dataset.stage, table: tr,
      felt: { x: tr.x + edge, right: tr.right - edge, y: tr.y + head, bottom: tr.bottom },
      seats: all('.seat'), players: all('.player-info'), discards: all('.seat-discard'),
      piles: all('.piles .tile,.piles .tile-back,.piles .no-discard,.piles .empty-tile'),
      menu: all('.table-heading'), toolbar: all('#table-actions'), metadata: all('.rack-meta'),
      header: all('#room-tag,#round-tag,#scores-button,#tools-button,#sound,#rules,.brand-message'),
      rack: all('#rack')[0], tiles: all('#rack-tiles [data-tile]'), playButtons: all('.play-actions button'),
      copy: all('#center .welcome-title,#center .welcome-sub,#center .welcome-buttons button,#center .center-links'),
      textAndButtons: all('#center p,#center strong,#center button,#center .match-settings-summary'),
      controls: interactive.map(el => ({ ...rect(el), text: el.textContent,
        reachable: el.contains(document.elementFromPoint(rect(el).x + rect(el).width / 2, rect(el).y + rect(el).height / 2)) }))
    };
  });
}
function overlaps(a, b, tolerance = .5) {
  return Math.min(a.right, b.right) - Math.max(a.x, b.x) > tolerance &&
    Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > tolerance;
}
function assertSeparate(rects, message) {
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
    assert.ok(!overlaps(rects[i], rects[j]), `${message}: rectangles ${i} and ${j}`);
}
function assertViewport(g, scrollingEntry = false) {
  assert.ok(g.scrollWidth <= g.width + 1, `${g.stage}: horizontal overflow`);
  if (!scrollingEntry) assert.ok(g.scrollHeight <= g.height + 1, `${g.stage}: vertical overflow (${g.scrollHeight}/${g.height})`);
}
function assertPlaying(g) {
  assertViewport(g);
  assert.equal(g.tiles.length, 15, 'all fifteen tiles remain visible');
  assertSeparate(g.tiles, 'rack tiles overlap');
  assertSeparate(g.header, 'header items overlap');
  if (g.width <= 600 && g.height > g.width) assert.ok(g.height - g.rack.bottom <= 12, 'board is anchored at the bottom without an empty action row');
  assertSeparate([...g.discards, ...g.piles], 'public tiles overlap');
  assertSeparate([...g.menu, g.table, ...g.toolbar, ...g.metadata, g.rack, ...g.playButtons], 'interface sections overlap');
  for (const player of g.players) assert.ok(!overlaps(player, g.felt), 'player intrudes onto felt');
  for (const tile of [...g.discards, ...g.piles]) {
    assert.ok(tile.x >= g.felt.x - 1 && tile.right <= g.felt.right + 1 && tile.y >= g.felt.y - 1 && tile.bottom <= g.felt.bottom + 1, 'public tile outside table');
  }
  for (const tile of g.tiles) assert.ok(tile.x >= g.rack.x && tile.right <= g.rack.right + 1 && tile.y >= g.rack.y && tile.bottom <= g.rack.bottom, 'tile outside rack');
  const boardExtra = g.rack.height - 2 * g.tiles[0].height;
  assert.ok(boardExtra >= 24 && boardExtra <= 36, `rack height should follow two tile rows, got ${boardExtra}px spare`);
  for (const button of g.playButtons) assert.ok(button.bottom <= g.height, 'play button below viewport');
}
async function assertControlsReachable(page, selector) {
  for (const el of await page.locator(selector).all()) {
    if (!await el.isVisible()) continue;
    await el.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await el.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), `control is reachable: ${await el.textContent()}`);
  }
}
async function capture(page, viewport, stage) {
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.resolve(screenshotDir, `${label(viewport)}-${stage}.png`) });
  }
}

for (const viewport of viewports) test(`welcome, lobby, play, resize and results at ${label(viewport)}`, { timeout: 30000 }, async () => {
  const { createApplication } = await import('../src/server.js');
  const app = createApplication({ port: 0 }); await app.listen();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.addInitScript(() => {
    localStorage.setItem('okey-muted', 'true');
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket { constructor(url) { super(url); window.layoutSocket = this; } };
  });
  async function sync(room) {
    room.players[0].lastGesture = -Infinity;
    await page.evaluate(() => window.layoutSocket.send(JSON.stringify({ type: 'gesture', gesture: 'tea' })));
    await page.waitForFunction(() => document.querySelector('#table-event .event-card'));
    await page.evaluate(() => document.querySelector('#table-event').replaceChildren());
  }
  try {
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?name=GastgeberMitLangemNamen`);
    await page.waitForFunction(() => document.querySelector('#connection').textContent === 'LOKAL AM TISCH');
    let g = await geometry(page);
    assertViewport(g, true); assert.equal(g.seats.length, 0, 'no demo players collide with the welcome text');
    assertSeparate(g.copy, 'welcome text and buttons overlap');
    await assertControlsReachable(page, '#center button,#center a');
    await page.evaluate(() => scrollTo(0, 0));
    await capture(page, viewport, 'welcome');

    await page.click('[data-action=create]');
    await page.check('input[name=rounds][value="5"]');
    await page.locator('#match-form button[type=submit]').click();
    await page.waitForFunction(() => document.body.dataset.stage === 'lobby');
    const room = [...app.arena.rooms.values()][0];
    for (const [id, name] of [['b', 'Kollege mit langem Namen'], ['c', 'TeampartnerMitLangemNamen'], ['d', 'Noch ein längerer Spielername']]) app.arena.join({ id, name }, room.code);
    await sync(room);
    g = await geometry(page); assertViewport(g, true);
    assert.equal(g.seats.length, 0, 'lobby uses the team picker, not overlapping seat previews');
    await assertControlsReachable(page, '#center button,#center a');
    await page.evaluate(() => scrollTo(0, 0));
    assertSeparate(g.textAndButtons, 'lobby text and buttons overlap');
    await capture(page, viewport, 'lobby');
    await page.click('[data-action=settings]');
    await page.locator('#match-form button[type=submit]').click();
    await page.waitForFunction(() => document.body.dataset.stage === 'playing');
    room.nextPuffAt = Infinity;
    room.players[0].hand = Array.from({ length: 15 }, (_, i) => ({ id: `layout-${i}`, color: i % 4, number: i % 13 + 1 }));
    room.lastDiscards = room.players.map((p, i) => ({ tile: { id: `discard-${i}`, color: i, number: 13 }, taken: false }));
    room.discards[3] = [room.lastDiscards[3].tile]; room.lastDiscard = { seat: 3 };
    await sync(room); await page.click('#sort');
    assertPlaying(await geometry(page));
    await capture(page, viewport, 'playing');

    assert.equal(await page.locator('#room-tag .table-code').innerText(), `CODE ${room.code}`);
    assert.equal(await page.locator('#round-tag').innerText(), 'Runde 1 / 5');
    assert.ok(await page.locator('#room-tag').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'code does not overflow');
    await page.click('#tools-button');
    const menuBox = await page.locator('#tools-dialog').boundingBox();
    assert.ok(menuBox.x>=0 && menuBox.y>=0 && menuBox.x+menuBox.width<=viewport[0] && menuBox.y+menuBox.height<=viewport[1], 'table menu fits viewport');
    assert.equal(await page.locator('#tools-dialog [data-gesture]').count(),0,'fun actions stay in the lightning menu');
    assert.equal(await page.locator('#host-tools details[open]').count(),0,'secondary controls start collapsed');
    await assertControlsReachable(page, '#tools-dialog button,#tools-dialog summary');
    await capture(page, viewport, 'menu');
    await page.locator('[data-section=players] summary').click();
    assert.equal(await page.locator('.host-player').count(),3);
    await assertControlsReachable(page, '.host-player button');
    await page.locator('[data-host=lock]').click();
    await page.waitForSelector('[data-host=unlock]');
    assert.equal(await page.locator('[data-section=players]').getAttribute('open'),'','expanded section survives a live update');
    await page.locator('[data-host=unlock]').click();
    await page.waitForSelector('[data-host=lock]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'tools-button');
    await page.click('#fun-button');
    await assertControlsReachable(page, '#fun-dialog button');
    await page.click('#close-fun');

    // Exercise the real touch handlers and verify the board still contains every tile.
    const tile = page.locator('#rack-tiles [data-tile]').first(), id = await tile.getAttribute('data-tile');
    await tile.tap();
    await page.waitForSelector('#tile-action-popover:not([hidden])');
    const popover = await page.locator('#tile-action-popover').boundingBox();
    assert.ok(popover.x>=0 && popover.y>=0 && popover.x+popover.width<=viewport[0] && popover.y+popover.height<=viewport[1], 'selected-tile actions fit viewport');
    await assertControlsReachable(page, '#tile-action-popover button');
    const before = await tile.boundingBox(), layer = await page.locator('#rack-tiles').boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: before.x + before.width / 2, y: before.y + before.height / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: layer.x + layer.width - before.width / 2 - 2, y: before.y + before.height / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.locator(`[data-tile="${id}"]`).boundingBox();
    assert.ok(Math.abs(after.x - before.x) > 10, 'touch can move a tile across the board');
    assertPlaying(await geometry(page));
    await page.click('.tile-action-dismiss');
    assert.equal(await page.locator('#tile-action-popover').isVisible(), false, 'tile menu can be dismissed before sorting');
    await page.click('#sort-combinations'); assertPlaying(await geometry(page));

    // A live resize must preserve tile geometry and the compact two-row board.
    await page.setViewportSize({ width: viewport[1], height: viewport[0] });
    await page.waitForTimeout(100);
    assertSeparate((await geometry(page)).tiles, 'tiles overlap after rotation');
    await page.setViewportSize({ width: viewport[0], height: viewport[1] });
    await page.waitForTimeout(100); assertPlaying(await geometry(page));

    app.arena.finish(room, room.players[0], 'melds'); await sync(room);
    await page.waitForFunction(() => document.body.dataset.stage === 'finished');
    assert.match(await page.locator('.result-title').innerText(),/GastgeberMitLangemNamen hat gewonnen/);
    const quip=await page.locator('.result-quip').innerText();
    await sync(room);assert.equal(await page.locator('.result-quip').innerText(),quip,'same round keeps its victory line');
    g = await geometry(page); assertViewport(g);
    assert.ok(g.controls.every(c => c.reachable), 'result buttons are visible and reachable');
    assert.equal(g.seats.length, 0, 'result text has a clear area without player previews');
    assertSeparate(g.textAndButtons, 'result text and buttons overlap');
    for (const item of g.textAndButtons) assert.ok(item.x >= g.felt.x && item.right <= g.felt.right && item.y >= g.felt.y && item.bottom <= g.felt.bottom, 'result inside table');
    await capture(page, viewport, 'finished');
    for (const resultState of ['joker','match','tie']) {
      room.result.joker=resultState!=='tie';
      room.matchComplete=resultState!=='joker';room.matchWinners=resultState==='tie'?[0,1]:[1];
      await sync(room);g=await geometry(page);assertViewport(g);
      assert.ok(g.controls.every(c=>c.reachable),`${resultState}: buttons reachable`);
      assertSeparate(g.textAndButtons,`${resultState}: result text and buttons overlap`);
      for(const item of g.textAndButtons)assert.ok(item.y>=g.felt.y&&item.bottom<=g.felt.bottom,`${resultState}: result inside table`);
      if(resultState==='joker')assert.match(await page.locator('.result-copy').innerText(),/E mshele me Joker/);
      if(resultState==='match'){
        assert.match(await page.locator('.result-winners').innerText(),/Kollege mit langem Namen.*Noch ein längerer Spielername/);
        assert.match(await page.locator('.result-copy').innerText(),/Letzte Runde gewonnen: GastgeberMitLangemNamen/,'last round winner is distinguished from match winners');
      }
      if(resultState==='tie')assert.equal(await page.locator('.result-quip').count(),0,'tie has no misleading victory line');
      await capture(page,viewport,resultState);
    }
    if(viewport[0]===375){
      const clip=await page.evaluate(async()=>{
        const response=await fetch('klack.mp3'),context=new AudioContext();
        const buffer=await context.decodeAudioData(await response.arrayBuffer());
        const samples=buffer.getChannelData(0),rms=Math.sqrt(samples.reduce((sum,s)=>sum+s*s,0)/samples.length);
        await context.close();return {mime:response.headers.get('content-type'),duration:buffer.duration,rms};
      });
      assert.equal(clip.mime,'audio/mpeg');assert.ok(clip.duration>.1&&clip.duration<1&&clip.rms>.005,'short spoken clip decodes with audible samples');
    }
    assert.deepEqual(errors, [], 'no browser errors');
  } catch (error) {
    await capture(page, viewport, 'failure'); throw error;
  } finally { await browser.close(); await app.close(); }
});
