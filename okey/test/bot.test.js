import test from 'node:test';
import assert from 'node:assert/strict';
import { botReply, configureBot } from '../src/bot.js';
const config = { botUsername: 'GoyimGjurzi_bot', publicUrl: 'https://example.test/okey', allowPublic: false, allowedIds: ['42'] };
const message = (text, type = 'private', id = 42) => ({ text, from: { id }, chat: { id, type } });
test('bot opens Okey and forwards room invitation through private and group links', () => {
  assert.equal(botReply(config, message('/play')).reply_markup.inline_keyboard[0][0].web_app.url, 'https://example.test/okey/');
  assert.deepEqual(botReply(config, message('/nisja')), botReply(config, message('/play')));
  assert.equal(botReply(config, message('/start room_ab12cd')).reply_markup.inline_keyboard[0][0].web_app.url, 'https://example.test/okey/?room=AB12CD');
  const group = botReply(config, message('/start room_AB12CD', 'group')).reply_markup.inline_keyboard[0][0];
  assert.equal(group.url, 'https://t.me/GoyimGjurzi_bot?start=room_AB12CD'); assert.equal(group.web_app, undefined);
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
