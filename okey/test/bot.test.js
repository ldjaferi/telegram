import test from 'node:test';
import assert from 'node:assert/strict';
import { botReply, configureBot } from '../src/bot.js';
import { Arena } from '../src/game.js';
const config = { botUsername: 'GoyimGjurzi_bot', publicUrl: 'https://example.test/okey', allowPublic: false, allowedIds: ['42'] };
const message = (text, type = 'private', id = 42) => ({ text, from: { id }, chat: { id, type } });
const groupMessage = (id = 42, chatId = -100, type = 'supergroup') => ({ text: '/nisja@GoyimGjurzi_bot', from: { id, first_name: `Player ${id}` }, chat: { id: chatId, type } });

test('group command creates one waiting table and all colleagues get its direct Mini App link', () => {
  const arena = new Arena(), publicConfig = { ...config, allowPublic: true };
  const reply = botReply(publicConfig, groupMessage(), arena);
  const room = arena.roomFor('42');
  assert.equal(reply.chat_id, -100);
  assert.equal(room.status, 'lobby'); assert.equal(room.owner, '42');
  assert.equal(room.players.length, 1); assert.equal(room.players[0].connected, false);
  assert.equal(room.players[0].name, 'Player 42');
  const button = reply.reply_markup.inline_keyboard[0][0];
  assert.equal(button.url, `https://t.me/GoyimGjurzi_bot?startapp=room_${room.code}`);
  assert.equal(button.web_app, undefined);
  assert.deepEqual(botReply(publicConfig, groupMessage(99), arena).reply_markup, reply.reply_markup);
  assert.equal(arena.rooms.size, 1);
  arena.join({ id: '99', name: 'Colleague' }, room.code);
  assert.equal(room.players.length, 2); assert.equal(room.status, 'lobby');
  assert.throws(() => arena.start('99'), /Gastgeber/);
  arena.start('42'); assert.equal(room.status, 'playing');
  assert.match(botReply(publicConfig, groupMessage(99), arena).text, /läuft bereits/);
  assert.equal(arena.rooms.size, 1);
});

test('group tables respect access, isolate chats and do not move players out of another game', () => {
  const arena = new Arena(), publicConfig = { ...config, allowPublic: true };
  assert.equal(botReply(config, groupMessage(99), arena).reply_markup, undefined);
  assert.equal(arena.rooms.size, 0);
  botReply(publicConfig, groupMessage(), arena);
  const original = arena.roomFor('42');
  assert.equal(botReply(publicConfig, groupMessage(42, -200), arena).reply_markup, undefined);
  assert.equal(arena.roomFor('42'), original);
  botReply(publicConfig, groupMessage(99, -200, 'group'), arena);
  assert.notEqual(arena.roomFor('99').code, original.code);
  arena.leave('42');
  botReply(publicConfig, groupMessage(), arena);
  assert.notEqual(arena.roomFor('42').code, original.code);
});

test('full groups and expired tables do not create extra rooms on repeated commands', () => {
  let now = 0; const arena = new Arena({ now: () => now });
  const publicConfig = { ...config, allowPublic: true };
  botReply(publicConfig, groupMessage(), arena); const room = arena.roomFor('42');
  for (const id of ['1', '2', '3']) arena.join({ id, name: id }, room.code);
  const reply = botReply(publicConfig, groupMessage(99), arena);
  assert.match(reply.reply_markup.inline_keyboard[0][0].url, new RegExp(room.code));
  assert.throws(() => arena.join({ id: '99', name: 'Fifth' }, room.code), /voll/);
  assert.equal(arena.rooms.size, 1);
  now += 2 * 3600000 + 1; arena.tick();
  botReply(publicConfig, groupMessage(), arena);
  assert.notEqual(arena.roomFor('42').code, room.code);
});
test('bot opens Okey and forwards room invitation through private and group links', () => {
  assert.equal(botReply(config, message('/play')).reply_markup.inline_keyboard[0][0].web_app.url, 'https://example.test/okey/');
  assert.deepEqual(botReply(config, message('/nisja')), botReply(config, message('/play')));
  assert.equal(botReply(config, message('/start room_ab12cd')).reply_markup.inline_keyboard[0][0].web_app.url, 'https://example.test/okey/?room=AB12CD');
  const group = botReply(config, message('/start room_AB12CD', 'group')).reply_markup.inline_keyboard[0][0];
  assert.equal(group.url, 'https://t.me/GoyimGjurzi_bot?startapp=room_AB12CD'); assert.equal(group.web_app, undefined);
  assert.equal(botReply(config, message('/nisja@Other_bot')), null);
  assert.ok(botReply(config, message('/nisja@GoyimGjurzi_bot')));
  assert.match(botReply(config, message('/help')).text, /\/nisja/);
});
test('private access is preserved and unknown players can obtain their ID', () => {
  assert.equal(botReply(config, message('/nisja', 'private', 99)).reply_markup, undefined);
  assert.match(botReply(config, message('/id', 'private', 99)).text, /99/);
  assert.equal(botReply(config, message('hello')), null);
});
test('setup verifies bot identity and never deletes an existing webhook', async () => {
  const calls = []; const call = async (method, payload) => { calls.push([method, payload]); return method === 'getMe' ? { username: config.botUsername } : method === 'getWebhookInfo' ? { url: '' } : true; };
  await configureBot({ ...config }, call);
  assert.equal(calls.find(([m]) => m === 'setChatMenuButton')[1].menu_button.web_app.url, 'https://example.test/okey/');
  assert.deepEqual(calls.find(([m]) => m === 'setMyCommands')[1].commands.map(c => c.command), ['nisja', 'help', 'id']);
  await assert.rejects(configureBot({ ...config }, async m => m === 'getMe' ? { username: 'other_bot' } : {}), /Identität/);
  await assert.rejects(configureBot({ ...config }, async m => m === 'getMe' ? { username: config.botUsername } : { url: 'https://example.test/hook' }), /Webhook/);
});
