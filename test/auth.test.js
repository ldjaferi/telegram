import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateTelegram,Sessions} from '../src/auth.js';
const token='12345:test-token-only';
export function sign(fields,botToken=token) {
  const params=new URLSearchParams(fields);params.sort();
  const data=[...params].map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(botToken).digest();params.set('hash',createHmac('sha256',secret).update(data).digest('hex'));return params.toString();
}
test('signed Telegram data validates; spoofing and stale data fail',()=>{
  const now=Date.now(),fields={auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id:123,first_name:'Anna'}),start_param:'room_ABCDEF12'};
  assert.equal(validateTelegram(sign(fields),token,now).id,'123');
  assert.throws(()=>validateTelegram(sign(fields).replace('Anna','Mallory'),token,now),/Signatur/);
  assert.throws(()=>validateTelegram(sign(fields),token,now+3601000),/erneut/);
  assert.throws(()=>validateTelegram(sign(fields)+'&auth_date=0',token,now),/Ungültige/);
  assert.throws(()=>validateTelegram(sign(fields),token,now-60000),/erneut/);
});
test('socket tickets are single use and sessions expire',()=>{
  const sessions=new Sessions();const t=sessions.create({id:'a'});const s=sessions.get(t);const ticket=sessions.ticket(s);assert.equal(sessions.consume(ticket).user.id,'a');assert.equal(sessions.consume(ticket),null);s.expires=0;assert.equal(sessions.get(t),null);
});
