import {test} from 'node:test';
import assert from 'node:assert/strict';
import {botReply} from '../src/bot.js';
const config={botUsername:'GoyimSnake_bot',publicUrl:'https://goyim.xhaferi.al',adminIds:['123'],allowedIds:['456'],allowPublic:false};
const message=(text,id=123,type='private')=>({text,from:{id},chat:{id:99,type}});
test('private game button opens Mini App without requiring a Main Mini App',()=>{
  const reply=botReply(config,message('/play'));
  assert.deepEqual(reply.reply_markup.inline_keyboard[0][0],{text:'Snake spielen ↗',web_app:{url:config.publicUrl}});
});
test('room invitation survives the private bot entry',()=>{
  const reply=botReply(config,message('/start room_abcd1234',456));
  assert.equal(reply.reply_markup.inline_keyboard[0][0].web_app.url,'https://goyim.xhaferi.al/?room=ABCD1234');
});
test('groups use a bot deep link and never a private-chat-only button',()=>{
  const reply=botReply(config,message('/play@GoyimSnake_bot room_ABCD1234',123,'supergroup'));
  assert.deepEqual(reply.reply_markup.inline_keyboard[0][0],{text:'Snake im Bot öffnen ↗',url:'https://t.me/GoyimSnake_bot?start=room_ABCD1234'});
});
test('unknown users can get their ID but cannot launch game',()=>{
  const reply=botReply(config,message('/start',789));assert.equal(reply.reply_markup,undefined);assert.match(reply.text,/privat/);
  assert.equal(botReply(config,message('/id',789)).text,'Deine Telegram-ID: 789');
});
test('invalid invites are discarded; other bots and unrelated messages are ignored',()=>{
  assert.equal(botReply(config,message('/start room_../../evil')).reply_markup.inline_keyboard[0][0].web_app.url,config.publicUrl);
  assert.equal(botReply(config,message('/play@Other_bot')),null);
  assert.equal(botReply(config,message('hello')),null);
  assert.equal(botReply(config,null),null);
});
