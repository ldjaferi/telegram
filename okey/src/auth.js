import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export function validateTelegram(initData, token, now=Date.now()) {
  if(typeof initData!=='string' || initData.length>8192 || !token) throw new Error('Telegram-Anmeldung fehlt.');
  const params=new URLSearchParams(initData);
  if(new Set(params.keys()).size!==[...params.keys()].length) throw new Error('Ungültige Telegram-Daten.');
  const hash=params.get('hash');
  if(!/^[a-f0-9]{64}$/i.test(hash||'')) throw new Error('Ungültige Telegram-Signatur.');
  params.delete('hash');
  const data=[...params.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const expected=createHmac('sha256',secret).update(data).digest();
  if(!timingSafeEqual(expected,Buffer.from(hash,'hex'))) throw new Error('Ungültige Telegram-Signatur.');
  const age=now/1000-Number(params.get('auth_date'));
  if(!Number.isFinite(age) || age < -30 || age>3600) throw new Error('Bitte öffne das Spiel erneut über Telegram.');
  const user=JSON.parse(params.get('user')||'null');
  if(!user || !Number.isSafeInteger(user.id) || user.id<=0) throw new Error('Telegram-Benutzer fehlt.');
  return {id:String(user.id),name:String(user.first_name||user.username||'Spieler').slice(0,32),startParam:params.get('start_param')||''};
}

export class Sessions {
  constructor() { this.sessions=new Map(); this.tickets=new Map(); }
  create(user) {
    this.sweep();
    if(this.sessions.size>=2000) throw new Error('Zu viele aktive Anmeldungen.');
    const token=randomBytes(32).toString('base64url');
    this.sessions.set(token,{user,expires:Date.now()+12*3600000}); return token;
  }
  get(token) { const s=this.sessions.get(token); return s && s.expires>Date.now()?s:null; }
  ticket(session) { this.sweep(); if(this.tickets.size>=2000) throw new Error('Zu viele Verbindungsanfragen.'); const t=randomBytes(24).toString('base64url'); this.tickets.set(t,{...session,validUntil:Date.now()+30000}); return t; }
  consume(t) { const s=this.tickets.get(t); this.tickets.delete(t); return s && s.validUntil>Date.now() && s.expires>Date.now()?s:null; }
  sweep() { for(const [t,s] of this.sessions) if(s.expires<=Date.now()) this.sessions.delete(t); for(const [t,s] of this.tickets) if(s.validUntil<=Date.now()) this.tickets.delete(t); }
}
