import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Arena } from './game.js';
import { Sessions, validateTelegram } from './auth.js';

const assets = new Map([['/', 'index.html'], ['/app.js', 'app.js'], ['/melds.js', 'melds.js'], ['/music.js', 'music.js'], ['/rack.js', 'rack.js'], ['/combinations.js', 'combinations.js'], ['/style.css', 'style.css'], ['/art.svg', 'art.svg'], ['/bluff.svg', 'bluff.svg'], ['/shisha.svg', 'shisha.svg']]);
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml' };
export function createApplication(config = {}) {
  config = { host: '127.0.0.1', port: 3200, dev: true, publicUrl: 'http://127.0.0.1:3200', allowedIds: [], allowPublic: false, ...config };
  if (config.dev && !['127.0.0.1', '::1', 'localhost'].includes(config.host)) throw Error('Lokale Anmeldung benötigt Loopback.');
  if (!config.dev && (!config.botToken || !config.publicUrl.startsWith('https://'))) throw Error('Production benötigt Bot-Token und HTTPS PUBLIC_URL.');
  const publicAddress = new URL(config.publicUrl), prefix = publicAddress.pathname.replace(/\/$/, '');
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(prefix || '/')) throw Error('Ungültiger Anwendungspfad.');
  const route = path => !prefix ? path : path.startsWith(prefix + '/') ? path.slice(prefix.length) : null;
  const arena = new Arena(), sessions = new Sessions(), sockets = new Map(), limits = new Map();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  function rate(key, max, ms) {
    let entry = limits.get(key);
    if (!entry || entry.until < Date.now()) { if (limits.size > 10000) throw Error('Bitte später erneut versuchen.'); limits.set(key, entry = { n: 0, until: Date.now() + ms }); }
    if (++entry.n > max) throw Error('Langsam, Champion. Bitte kurz warten.');
  }
  function originAllowed(origin) {
    if (origin === publicAddress.origin) return true;
    if (!config.dev) return false;
    try { const url = new URL(origin); return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch { return false; }
  }
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Error('JSON erwartet.');
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 12000) throw Error('Anfrage zu gross.'); chunks.push(chunk); }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Ungültige Anfrage.');
    return value;
  }
  function broadcast(r) {
    if (!r) return;
    for (const p of r.players) {
      const ws = sockets.get(p.id);
      if (ws?.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 256000) ws.close(1013, 'Verbindung zu langsam');
        else ws.send(JSON.stringify({ type: 'state', room: arena.snapshot(r, p.id) }));
      }
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
    try {
      const requestedPath = new URL(req.url, 'http://localhost').pathname;
      if (prefix && requestedPath === prefix) { res.writeHead(308, { Location: prefix + '/' }); return res.end(); }
      const path = route(requestedPath);
      if (req.method === 'GET' && path === '/healthz') return json(res, 200, { ok: true, game: 'okey' });
      if (req.method === 'GET' && assets.has(path)) {
        const file = assets.get(path); let data = await readFile(new URL(`../public/${file}`, import.meta.url));
        if (file === 'index.html') data = data.toString().replace('__APP_BASE__', prefix + '/');
        res.writeHead(200, { 'Content-Type': mime[file.split('.').at(-1)], 'Cache-Control': 'no-cache' }); return res.end(data);
      }
      if (req.method === 'GET' && path === '/api/config') return json(res, 200, { dev: config.dev, botUsername: config.botUsername || '' });
      if (req.method !== 'POST' || !originAllowed(req.headers.origin)) return json(res, 403, { error: 'Anfrage nicht erlaubt.' });
      rate(`http:${req.socket.remoteAddress}`, 150, 60000);
      const data = await body(req);
      if (path === '/api/login') {
        rate(`login:${req.socket.remoteAddress}`, 30, 60000);
        const user = data.initData ? validateTelegram(data.initData, config.botToken) : config.dev ? { id: `local-${randomUUID()}`, name: String(data.name || 'Gast').trim().slice(0, 24) || 'Gast' } : null;
        if (!user) return json(res, 401, { error: 'Öffne das Spiel über deinen Telegram-Bot.' });
        if (!config.dev && !config.allowPublic && !config.allowedIds.includes(user.id)) return json(res, 403, { error: `Du bist noch nicht freigeschaltet. Telegram-ID: ${user.id}` });
        return json(res, 200, { token: sessions.create(user), user });
      }
      const session = sessions.get(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!session) return json(res, 401, { error: 'Bitte erneut anmelden.' });
      if (path === '/api/ticket') return json(res, 200, { ticket: sessions.ticket(session), user: session.user });
      return json(res, 404, { error: 'Nicht gefunden.' });
    } catch (error) { return json(res, 400, { error: error instanceof SyntaxError ? 'Ungültige Anfrage.' : error.message }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const reject = () => { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); };
    const url = new URL(req.url, 'http://localhost');
    if (route(url.pathname) !== '/socket' || !originAllowed(req.headers.origin) || sockets.size >= 350) return reject();
    const session = sessions.consume(url.searchParams.get('ticket')); if (!session) return reject();
    wss.handleUpgrade(req, socket, head, ws => {
      const user = session.user; const old = sockets.get(user.id); sockets.set(user.id, ws); old?.close(4001, 'In anderem Fenster geöffnet');
      ws.alive = true; ws.session = session; ws.on('pong', () => { ws.alive = true; }); ws.on('error', () => {});
      const current = arena.roomFor(user.id); if (current) current.players.find(p => p.id === user.id).connected = true;
      ws.send(JSON.stringify({ type: 'ready', user, room: current ? arena.snapshot(current, user.id) : null })); broadcast(current);
      ws.on('message', raw => {
        if (sockets.get(user.id) !== ws) return;
        try {
          if (session.expires < Date.now()) return ws.close(4003, 'Anmeldung abgelaufen');
          rate(`ws:${user.id}`, 25, 1000);
          const m = JSON.parse(raw.toString());
          if (m.type === 'create') arena.create(user, m.solo === true, { mode: m.mode, roundLimit: m.roundLimit });
          else if (m.type === 'join') arena.join(user, String(m.code || '').toUpperCase());
          else if (m.type === 'configure') arena.configure(user.id, { mode: m.mode, roundLimit: m.roundLimit });
          else if (m.type === 'new-match') arena.newMatch(user.id);
          else if (m.type === 'start') arena.start(user.id);
          else if (m.type === 'draw') arena.draw(user.id, m.source);
          else if (m.type === 'discard') arena.discard(user.id, m.tileId, m.claim === true);
          else if (m.type === 'surrender') arena.surrender(user.id);
          else if (m.type === 'gesture') arena.gesture(user.id, m.gesture, m.target);
          else if (m.type === 'bluff') arena.bluff(user.id);
          else if (m.type === 'shisha') arena.shisha(user.id);
          else if (m.type === 'leave') { broadcast(arena.leave(user.id)); ws.send(JSON.stringify({ type: 'state', room: null })); return; }
          else throw Error('Unbekannte Aktion.');
          broadcast(arena.roomFor(user.id));
        } catch (error) { ws.send(JSON.stringify({ type: 'error', message: error.message })); }
      });
      ws.on('close', () => {
        if (sockets.get(user.id) !== ws) return;
        sockets.delete(user.id); const r = arena.roomFor(user.id);
        if (r) { r.players.find(p => p.id === user.id).connected = false; broadcast(r); }
      });
    });
  });
  const ticker = setInterval(() => { for (const r of arena.tick()) broadcast(r); }, 250);
  const maintenance = setInterval(() => {
    sessions.sweep(); for (const [key, value] of limits) if (value.until < Date.now()) limits.delete(key);
    for (const ws of sockets.values()) { if (!ws.alive || ws.session.expires < Date.now()) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  }, 15000);
  return {
    server, arena, config,
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); }); return server.address(); },
    async close() { clearInterval(ticker); clearInterval(maintenance); for (const ws of wss.clients) ws.terminate(); await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve)); }
  };
}
