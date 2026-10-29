import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function botReply(config, message, arena) {
  if (!message?.from?.id || message.from.is_bot || !message.chat?.id || typeof message.text !== 'string') return null;
  const [raw, parameter] = message.text.trim().split(/\s+/), [command, target] = raw.split('@');
  if (target && target.toLowerCase() !== config.botUsername.toLowerCase()) return null;
  if (!['/start', '/nisja', '/play', '/help', '/id'].includes(command)) return null;
  const id = String(message.from.id), allowed = config.allowPublic || config.allowedIds.includes(id);
  let text, reply_markup;
  if (command === '/id') text = `Deine Telegram-ID: ${id}`;
  else if (!allowed) text = `Dieser Okey-Tisch ist noch privat. Deine Telegram-ID für die Freischaltung: ${id}`;
  else if (command === '/help') text = 'Okey mit festen Jokern: Ziehen, abwerfen, 14 Steine zu Reihen, Gruppen oder sieben Paaren ordnen. Mit /nisja geht es an den Tisch. Freie Plätze übernehmen Computer. Brettwerfen gibt die Runde auf – die anderen spielen weiter. Gesten inklusive.';
  else if (['group', 'supergroup'].includes(message.chat.type) && ['/nisja', '/play'].includes(command)) {
    try {
      if (!arena) throw Error('Der Spielserver ist gerade nicht bereit. Bitte versuche es später erneut.');
      const room = arena.groupTable({ id, name: String(message.from.first_name || message.from.username || 'Spieler').slice(0, 32) }, message.chat.id);
      const owner = room.players.find(p => p.id === room.owner)?.name || 'Der Gastgeber';
      text = room.status === 'playing'
        ? 'An eurem Tisch läuft bereits eine Runde. Wer mitspielt, kann hier zurück an den Tisch.'
        : `Tavolina esht gati.\nTippt auf „Hajde bojrum“ – ihr kommt alle an denselben Tisch.\n${owner} startet die Runde, sobald ihr bereit seid. Maximal vier Spieler.`;
      reply_markup = { inline_keyboard: [[{ text: 'Hajde bojrum', url: `https://t.me/${config.botUsername}?startapp=room_${room.code}` }]] };
    } catch (error) { text = error.message; }
  }
  else {
    const code = /^room_([a-f0-9]{6})$/i.exec(parameter || '')?.[1].toUpperCase();
    const url = `${config.publicUrl.replace(/\/$/, '')}/${code ? '?room=' + code : ''}`;
    text = code ? `Dein Platz an Tisch ${code} wartet. Komm dazu!` : 'OKEY — ABER FRECH.\nSchöne Steine. Schlechte Manieren.\nSpiel mit Freunden oder gegen drei Computergegner.';
    reply_markup = { inline_keyboard: [[message.chat.type === 'private'
      ? { text: 'Okey spielen ↗', web_app: { url } }
      : { text: 'Okey spielen ↗', url: `https://t.me/${config.botUsername}?startapp=${code ? 'room_' + code : 'nisja'}` }]] };
  }
  return { chat_id: message.chat.id, text, ...(reply_markup ? { reply_markup } : {}) };
}

export async function configureBot(config, call) {
  const me = await call('getMe', {});
  if (config.botUsername && me.username.toLowerCase() !== config.botUsername.toLowerCase()) throw Error('Bot-Identität stimmt nicht mit der Konfiguration überein.');
  config.botUsername = me.username;
  const hook = await call('getWebhookInfo', {});
  if (hook.url) throw Error('Ein Webhook ist eingerichtet; Polling wurde nicht gestartet.');
  await call('setMyCommands', { commands: [
    { command: 'nisja', description: 'Okey spielen — allein oder mit Freunden' },
    { command: 'help', description: 'Spielregeln und Bedienung' },
    { command: 'id', description: 'Meine Telegram-ID anzeigen' }
  ] });
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Okey spielen', web_app: { url: config.publicUrl.replace(/\/$/, '') + '/' } } });
  await call('setMyDescription', { description: 'OKEY — aber frech. Okey mit festen Jokern mit Holzbrettern, Comic-Joker und schlechten Manieren. Spiele mit Freunden oder Computergegnern. Wirf Steine ab, verteile Gesten oder gleich das ganze Brett.' });
  await call('setMyShortDescription', { short_description: 'Okey mit festen Jokern. Holzbretter, freche Gesten und Freunde am Tisch. Jetzt spielen!' });
}

export async function runBot(config, signal, arena) {
  const call = async (method, payload) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, AbortSignal.timeout(40000)])
      });
      const data = await response.json();
      if (!data.ok) { const error = Error(`Telegram ${method}: ${data.error_code}`); error.telegram = true; throw error; }
      return data.result;
    } catch (error) { if (error.telegram) throw error; throw Error(`Telegram ${method} nicht erreichbar.`); }
  };
  await configureBot(config, call);
  console.log(`Telegram @${config.botUsername}: Menü und Befehle eingerichtet.`);
  const offsetFile = config.botOffsetPath || 'data/bot-offset';
  let offset = 0;
  try { offset = Number(await readFile(offsetFile, 'utf8')); if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Ungültiger Polling-Stand.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(offsetFile), { recursive: true });
  while (!signal.aborted) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      for (const update of updates) {
        const reply = botReply(config, update.message, arena);
        if (reply) await call('sendMessage', reply);
        offset = update.update_id + 1;
        await writeFile(offsetFile + '.tmp', String(offset), { mode: 0o600 });
        await rename(offsetFile + '.tmp', offsetFile);
      }
    } catch {
      if (!signal.aborted) { console.error('Bot-Polling unterbrochen; neuer Versuch folgt.'); await delay(5000, undefined, { signal }).catch(() => {}); }
    }
  }
}
