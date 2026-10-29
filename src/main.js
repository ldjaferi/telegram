import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApplication } from './server.js';
import { runBot } from './bot.js';
const production=process.env.NODE_ENV==='production';
const credential=process.env.CREDENTIALS_DIRECTORY?join(process.env.CREDENTIALS_DIRECTORY,'bot-token'):null;
const ids=value=>(value||'').split(',').map(s=>s.trim()).filter(Boolean);
const config={
  dev:!production,host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||3100),
  publicUrl:(process.env.PUBLIC_URL||'http://127.0.0.1:3100').replace(/\/$/,''),
  dbPath:process.env.DB_PATH||'data/snake.sqlite',
  botToken:credential && existsSync(credential)?readFileSync(credential,'utf8').trim():process.env.BOT_TOKEN||'',
  botUsername:process.env.BOT_USERNAME||'',adminIds:ids(process.env.ADMIN_TELEGRAM_IDS),allowedIds:ids(process.env.ALLOWED_TELEGRAM_IDS),
  allowPublic:process.env.ALLOW_PUBLIC_PLAY==='true',trustProxy:production && process.env.TRUST_PROXY==='true'
};
if(production && !config.publicUrl.startsWith('https://')) throw new Error('Production requires an HTTPS PUBLIC_URL.');
if(production && config.allowPublic && !config.adminIds.length) throw new Error('Configure an admin before enabling public play.');
const app=createApplication(config);await app.listen();
console.log(`Snake Club: ${config.publicUrl} (${config.dev?'local development':'production'})`);
const controller=new AbortController();
const botTask=config.botToken?runBot(config,app.store,controller.signal):Promise.resolve();
let stopping=false;
async function stop() {
  if(stopping) return;stopping=true;app.drain();
  console.log('Draining active rounds…');
  const deadline=Date.now()+130000;
  while([...app.arena.rooms.values()].some(r=>['running','countdown'].includes(r.status)) && Date.now()<deadline) await new Promise(r=>setTimeout(r,500));
  controller.abort();await botTask;await app.close();process.exit(0);
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
