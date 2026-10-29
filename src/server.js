import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Arena, GameError, TICK_MS, FOODS } from './game.js';
import { Sessions, validateTelegram } from './auth.js';
import { Store } from './store.js';

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const assets=new Map([['/','index.html'],['/app.js','app.js'],['/art.js','art.js'],['/motion.js','motion.js'],['/style.css','style.css'],['/favicon.svg','favicon.svg']]);
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml'};
class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }

export function createApplication(config) {
  if(config.dev && !['127.0.0.1','::1','localhost'].includes(config.host)) throw new Error('Development login requires a loopback bind address.');
  const store=new Store(config.dbPath); const sessions=new Sessions(); const arena=new Arena({store});
  const sockets=new Map(); const limits=new Map(); let draining=false;
  const isAdmin=id=>config.adminIds.includes(id);
  const allowed=id=>isAdmin(id) || config.allowPublic || config.allowedIds.includes(id);
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  function rate(key,max,window=60000) {
    let entry=limits.get(key); if(!entry || entry.until<Date.now()) { if(limits.size>10000) throw new HttpError(429,'Bitte später erneut versuchen.'); limits.set(key,entry={n:0,until:Date.now()+window}); }
    if(++entry.n>max) throw new HttpError(429,'Zu viele Anfragen. Bitte kurz warten.');
  }
  function originAllowed(origin) {
    if(origin===config.publicUrl) return true;
    if(config.dev && origin) { try { const u=new URL(origin); return ['127.0.0.1','localhost','[::1]'].includes(u.hostname) && u.protocol==='http:'; } catch {} }
    return false;
  }
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415,'JSON erwartet.');
    let bytes=0;const chunks=[];
    for await(const chunk of req) { bytes+=chunk.length;if(bytes>16384) throw new HttpError(413,'Anfrage zu gross.'); chunks.push(chunk); }
    try { const value=JSON.parse(Buffer.concat(chunks).toString()); if(!value || Array.isArray(value) || typeof value!=='object') throw Error(); return value; } catch { throw new HttpError(400,'Ungültige Anfrage.'); }
  }
  function authenticate(req) {
    const token=req.headers.authorization?.replace(/^Bearer /,''); const s=sessions.get(token);
    if(!s) throw new HttpError(401,'Bitte melde dich erneut an.'); return s;
  }
  function broadcast(room) {
    if(!room) return;
    const data=JSON.stringify({type:'state',room:arena.snapshot(room)});
    for(const p of room.players) {
      const ws=sockets.get(p.id);
      if(ws?.readyState===WebSocket.OPEN) { if(ws.bufferedAmount>256000) ws.close(1013,'Verbindung zu langsam'); else ws.send(data); }
    }
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    try {
      const url=new URL(req.url,'http://localhost'); const path=url.pathname;
      if(['GET','HEAD'].includes(req.method) && path==='/healthz') return json(res,draining?503:200,{ok:!draining});
      if(['GET','HEAD'].includes(req.method) && assets.has(path)) {
        const name=assets.get(path); const content=await readFile(publicDir+name);
        res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)],'Cache-Control':'no-cache'});return res.end(req.method==='HEAD'?undefined:content);
      }
      if(!path.startsWith('/api/')) throw new HttpError(404,'Nicht gefunden.');
      // X-Forwarded-For is trusted only behind the configured local reverse proxy.
      const remote=req.socket.remoteAddress;
      const ip=config.trustProxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)?String(req.headers['x-forwarded-for']||remote).split(',').at(-1).trim():remote;
      rate(`ip:${ip}`,240);
      if(req.method==='GET' && path==='/api/config') return json(res,200,{dev:config.dev,botUsername:config.botUsername,food:store.getFood(),setupRequired:!config.dev && (!config.botToken || !config.adminIds.length),draining});
      if(req.method==='POST' && !originAllowed(req.headers.origin)) throw new HttpError(403,'Ungültiger Ursprung.');
      if(req.method==='POST' && path==='/api/auth') {
        rate(`auth:${ip}`,30); const data=await body(req);
        if(!config.botToken) throw new HttpError(503,'Der Telegram-Bot wird noch eingerichtet.');
        let user; try { user=validateTelegram(data.initData,config.botToken); } catch(error) {throw new HttpError(401,error.message);}
        if(!allowed(user.id)) throw new HttpError(403,`Dein Konto ist noch nicht freigeschaltet. Deine Telegram-ID: ${user.id}`);
        user.isAdmin=isAdmin(user.id); return json(res,200,{token:sessions.create(user),user});
      }
      if(req.method==='POST' && path==='/api/dev-login') {
        if(!config.dev) throw new HttpError(404,'Nicht gefunden.');
        rate(`auth:${ip}`,30);const data=await body(req);
        const user={id:`dev-${randomUUID()}`,name:String(data.name||'Spieler').trim().slice(0,24)||'Spieler',isAdmin:data.admin===true};
        return json(res,200,{token:sessions.create(user),user});
      }
      const session=authenticate(req); const user=session.user;
      rate(`user:${user.id}`,180);
      if(req.method==='GET' && path==='/api/me') return json(res,200,{user,room:arena.roomFor(user.id)?arena.snapshot(arena.roomFor(user.id)):null});
      if(req.method==='GET' && path==='/api/leaderboard') return json(res,200,{players:store.leaderboard()});
      if(req.method==='GET' && path==='/api/admin') {
        if(!user.isAdmin) throw new HttpError(403,'Nur für den Admin.');
        return json(res,200,{food:store.getFood(),rooms:arena.rooms.size,players:sockets.size});
      }
      if(req.method!=='POST') throw new HttpError(404,'Nicht gefunden.');
      const data=await body(req);
      if(path==='/api/socket-ticket') return json(res,200,{ticket:sessions.ticket(session)});
      if(path==='/api/admin/food') {
        if(!user.isAdmin) throw new HttpError(403,'Nur der Admin legt das Futter fest.');
        if(!FOODS.includes(data.food)) throw new HttpError(400,'Unbekanntes Futter.');
        store.set('food',data.food); return json(res,200,{food:data.food});
      }
      if(path==='/api/rooms' || path==='/api/join') {
        if(draining) throw new HttpError(503,'Wartung: Bitte später erneut versuchen.');
        if(!sockets.has(user.id)) throw new HttpError(409,'Warte bitte auf die Spielverbindung.');
        rate(`rooms:${user.id}`,10);
        const room=path==='/api/rooms'?arena.create(user,data.practice===true):arena.join(user,String(data.code||'').toUpperCase());
        broadcast(room);return json(res,200,{room:arena.snapshot(room)});
      }
      if(path==='/api/start') {
        if(draining) throw new HttpError(503,'Wartung: Keine neue Runde möglich.');
        const room=arena.start(user.id);broadcast(room);return json(res,200,{ok:true});
      }
      if(path==='/api/leave') {const room=arena.leave(user.id);broadcast(room);return json(res,200,{ok:true});}
      if(path==='/api/surrender') {arena.surrender(user.id);broadcast(arena.roomFor(user.id));return json(res,200,{ok:true});}
      throw new HttpError(404,'Nicht gefunden.');
    } catch(error) {
      const status=error.status || (error instanceof GameError?400:500);
      if(status===500) console.error('Request failed:',error.name);
      if(!res.headersSent) json(res,status,{error:status===500?'Ein Serverfehler ist aufgetreten.':error.message});else res.end();
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    socket.on('error',()=>{});
    const reject=()=>{socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();};
    try {
      if(!originAllowed(req.headers.origin) || sockets.size>=350) return reject();
      const url=new URL(req.url,'http://localhost'); if(url.pathname!=='/socket') return reject();
      const session=sessions.consume(url.searchParams.get('ticket'));if(!session) return reject();
      wss.handleUpgrade(req,socket,head,ws=>{
        const id=session.user.id;
        const old=sockets.get(id);sockets.set(id,ws);if(old) old.close(4001,'In einem anderen Fenster geöffnet');
        ws.isAlive=true;ws.session=session;ws.on('pong',()=>{ws.isAlive=true;});ws.on('error',()=>{});
        const currentRoom=arena.connect(id);
        ws.send(JSON.stringify({type:'connected',room:currentRoom?arena.snapshot(currentRoom):null})); broadcast(currentRoom);
        ws.on('message',raw=>{
          if(sockets.get(id)!==ws) return;
          try {
            rate(`input:${id}`,30,1000);
            if(session.expires<Date.now()) return ws.close(4003,'Anmeldung abgelaufen');
            const msg=JSON.parse(raw.toString());if(msg.type==='direction') arena.input(id,msg.direction);
            else if(msg.type==='ping') ws.send(JSON.stringify({type:'pong',at:msg.at}));
          } catch { ws.close(1008,'Ungültige Eingabe'); }
        });
        ws.on('close',()=>{if(sockets.get(id)===ws) {sockets.delete(id);arena.disconnect(id);broadcast(arena.roomFor(id));}});
      });
    } catch {reject();}
  });
  const ticker=setInterval(()=>{
    try {for(const room of arena.rooms.values()) { if(['countdown','running'].includes(room.status)) {arena.step(room);broadcast(room);} }}
    catch(error) {console.error('Game tick failed:',error.name);draining=true;}
  },TICK_MS);
  const maintenance=setInterval(()=>{
    sessions.sweep();arena.sweep();
    for(const room of arena.rooms.values()) if(['lobby','finished'].includes(room.status)) broadcast(room);
    for(const [k,v] of limits) if(v.until<Date.now()) limits.delete(k);
    for(const ws of sockets.values()) { if(!ws.isAlive || ws.session.expires<Date.now()) ws.terminate();else {ws.isAlive=false;ws.ping();} }
  },15000);
  return {server,arena,store,sessions,config,
    async listen() {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve);});return server.address();},
    drain() {draining=true;},
    async close() {clearInterval(ticker);clearInterval(maintenance);for(const ws of wss.clients) ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));store.close();}
  };
}
