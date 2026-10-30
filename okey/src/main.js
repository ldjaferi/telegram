import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createApplication } from './server.js';
import { runBot } from './bot.js';

const port = Number(process.env.PORT || 3200);
const app = createApplication({
  port, host: process.env.HOST || '127.0.0.1', dev: process.env.NODE_ENV !== 'production',
  publicUrl: (process.env.PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/$/, ''),
  botToken: process.env.CREDENTIALS_DIRECTORY ? readFileSync(join(process.env.CREDENTIALS_DIRECTORY, 'bot-token'), 'utf8').trim() : process.env.BOT_TOKEN || '',
  botUsername: process.env.BOT_USERNAME || '',
  botOffsetPath: process.env.BOT_OFFSET_PATH || 'data/bot-offset',
  socialPath: join(dirname(process.env.BOT_OFFSET_PATH || 'data/bot-offset'),'social.json'),
  allowedIds: (process.env.ALLOWED_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  allowPublic: process.env.ALLOW_PUBLIC_PLAY === 'true'
});
await app.social.load();
await app.listen(); console.log(`OKEY, ABER FRECH. ${app.config.publicUrl}`);
const controller = new AbortController();
const botTask = app.config.botToken ? runBot(app.config, controller.signal, app.arena, app.social).catch(error => {
  if (!controller.signal.aborted) { console.error(error.message); process.exitCode = 1; controller.abort(); return app.close(); }
}) : Promise.resolve();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  if (stopping) return; stopping = true; controller.abort(); await botTask; await app.close(); process.exit(0);
});
