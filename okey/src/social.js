import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomInt, randomBytes } from 'node:crypto';
import { nextBujLine } from '../public/table-fun.js';

export const BUJ_LINES = [
  'Ich wür eu Tipps geh, aber gratis sicher nöd.',
  'Ich gang uf sBoot. I nim keine mit.',
  'dBrocki hät gad 50% Rabatt. Ich spiel erst nachher.',
  'Ihr spieled so langsam, de Çay verlangt scho Miete.',
  'Ich han nöd verlore. Ich han eu Motivation gspendet.',
  'De Joker isch gratis gsi. Drum han ich en gnoh.',
  'Ich lade eu alli ii. Jede zahlt selber.',
  'Mini Tipps sind wie mini Snacks: nur für mich.'
];
export const SOCIAL_COMMANDS = [
  {command:'wo',description:'Wo blibsch? Als Antwort auf einen Kollegen'},
  {command:'buj',description:'Ein gratis Kommentar vom Buj'},
  {command:'revanche',description:'Kollegen zur Revanche rufen'},
  {command:'spielabend',description:'Abstimmung für heute starten'},
  {command:'titel',description:'Titel des Abends anzeigen'},
  {command:'bericht',description:'Letzten Partie-Bericht anzeigen'},
  {command:'ruhe',description:'Admin: Antwort auf Spieler, 5 Minuten Chatpause'},
  {command:'reden',description:'Admin: Chatpause aufheben'},
  {command:'sperren',description:'Admin: Gruppenmitglied sperren (mit Bestätigung)'},
  {command:'entsperren',description:'Admin: Gruppensperre aufheben'},
  {command:'stop',description:'Persönliche Erinnerungen ausschalten'}
];
const numeric = id => /^\d+$/.test(String(id));
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day = now => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const cleanName = name => String(name || 'Kollege').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,32);
export class SocialHub {
  constructor(arena,config={}, {now=()=>Date.now()}={}) {
    this.arena=arena; this.config=config; this.now=now; this.data={users:{},groups:{},evenings:{},reports:{}};
    this.cooldowns=new Map(); this.pending=new Map(); this.outbox=[]; this.saving=Promise.resolve();
  }
  async load() {
    if (!this.config.socialPath) return;
    try { const data=JSON.parse(await readFile(this.config.socialPath,'utf8')); if (data.version!==1) throw Error('Unbekannter Social-Datenstand'); this.data=data; }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  save() {
    if (!this.config.socialPath) return Promise.resolve();
    this.dirty=true;
    if(this.savePending) return this.saving;
    this.savePending=true;
    this.saving=(async()=>{
      const path=this.config.socialPath;
      await mkdir(dirname(path),{recursive:true});
      while(this.dirty) {
        this.dirty=false;
        const data=JSON.stringify({...this.data,version:1});
        await writeFile(path+'.tmp',data,{mode:0o600});await rename(path+'.tmp',path);
      }
    })().finally(()=>{this.savePending=false;});
    this.saving.catch(()=>console.error('Social-Daten konnten nicht gespeichert werden.'));
    return this.saving;
  }
  prune() {
    for(const field of ['users','groups','evenings','reports']) {
      const entries=Object.entries(this.data[field]);
      for(const [id,row] of entries) if(this.now()-(row.at||0)>7*86400000) delete this.data[field][id];
      const limit=field==='users'?1000:100;
      for(const [id] of Object.entries(this.data[field]).sort((a,b)=>a[1].at-b[1].at).slice(0,-limit)) delete this.data[field][id];
    }
    for(const [key,until] of this.cooldowns) if(until<=this.now()) this.cooldowns.delete(key);
    for(const [key,item] of this.pending) if(item.until<=this.now()) this.pending.delete(key);
  }
  remember(message) {
    this.prune();
    const u=message.from; if(!u || u.is_bot || !numeric(u.id)) return;
    const id=String(u.id), old=this.data.users[id] || {};
    this.data.users[id]={...old,name:cleanName(u.first_name || u.username),at:this.now()};
    if(message.chat.type==='private') {
      const command=message.text?.split(/[ @]/)[0];
      if(command==='/start') this.data.users[id].dm=true;
      if(command==='/stop') this.data.users[id].dm=false;
    } else if(['group','supergroup'].includes(message.chat.type)) {
      const key=String(message.chat.id), g=this.data.groups[key] ||= {members:[]};
      g.at=this.now();g.members=[...new Set([...g.members,id])].slice(-100);
      const target=message.reply_to_message?.from;
      if(target && !target.is_bot && numeric(target.id)) {
        this.data.users[String(target.id)]={...this.data.users[String(target.id)],name:cleanName(target.first_name || target.username),at:this.now()};
        g.members=[...new Set([...g.members,String(target.id)])].slice(-100);
      }
    }
    void this.save();
  }
  limit(key,ms) {
    this.prune();
    if((this.cooldowns.get(key)||0)>this.now()) throw Error(`Kurz Çay trinken. In ${Math.ceil((this.cooldowns.get(key)-this.now())/1000)} Sekunden wieder.`);
    if(this.cooldowns.size>2000) throw Error('Bitte später erneut versuchen.');
    this.cooldowns.set(key,this.now()+ms);
  }
  link(r) { return this.config.botUsername ? `https://t.me/${this.config.botUsername}?startapp=room_${r.code}` : `${this.config.publicUrl}/?room=${r.code}`; }
  keyboard(r) { return {inline_keyboard:[[{text:'Hajde bojrum →',url:this.link(r)}]]}; }
  scope(r) { return r.groupChatId ? `group:${r.groupChatId}` : `table:${r.code}`; }
  targets(r,id) {
    const ids=new Set([...(this.data.groups[r.groupChatId]?.members || []),...r.players.filter(p=>!p.bot).map(p=>p.id)]);
    return [...ids].filter(x=>x!==id && numeric(x)).map(x=>({id:x,name:this.data.users[x]?.name || cleanName(r.players.find(p=>p.id===x)?.name),privateReady:!!this.data.users[x]?.dm}));
  }
  view(id) {
    const r=this.arena.roomFor(id); if(!r) throw Error('Nimm zuerst an einem Tisch Platz.');
    return {targets:r.owner===id?this.targets(r,id):[],groupLinked:!!r.groupChatId,available:!!this.call,report:r.socialReport || null,awards:r.awards || []};
  }
  async perform(id,action,target) {
    const r=this.arena.requireHost(id);
    if(!['nudge','revanche','poll','buj'].includes(action)) throw Error('Unbekannte Aktion.');
    if(!this.call) throw Error('Telegram ist gerade nicht verbunden.');
    if(action==='nudge') {
      const to=this.targets(r,id).find(p=>p.id===String(target));
      if(!to) throw Error('Wähle einen bekannten Kollegen aus dieser Gruppe oder vom Tisch.');
      if(!r.groupChatId && !to.privateReady) throw Error('Der Kollege muss den Bot zuerst privat mit /start öffnen. Alternativ Einladungslink kopieren.');
      this.limit(`nudge-target:${to.id}`,300000);this.limit(`social:${r.code}`,15000);
      const name=escape(to.name), chat_id=r.groupChatId || to.id;
      await this.call('sendMessage',{chat_id,parse_mode:'HTML',text:`<a href="tg://user?id=${to.id}">${name}</a>, wo blibsch? De Çay isch scho chalt. Beweg dich. 😄`,reply_markup:this.keyboard(r)});
    } else {
      if(!r.groupChatId) throw Error('Dafür den Tisch mit /nisja in eurer Telegram-Gruppe eröffnen.');
      this.limit(`${action}:${r.groupChatId}`,action==='poll'?3600000:action==='revanche'?300000:30000);
      if(action==='poll') await this.poll(r.groupChatId);
      else if(action==='buj') await this.sendBuj(r.groupChatId);
      else await this.call('sendMessage',{chat_id:r.groupChatId,text:'Grossi Schnurre, chliini Serie. Revanche? 😏',reply_markup:this.keyboard(r)});
    }
    return {message:'Gesendet.'};
  }
  async sendBuj(chatId) {
    const group=this.data.groups[chatId] ||= {members:[],at:this.now()};
    const next={bujRotation:group.bujRotation ? [...group.bujRotation] : undefined};
    const line=nextBujLine(next,BUJ_LINES,randomInt);
    await this.call('sendMessage',{chat_id:chatId,text:`🌚 Buj: ${line}`});
    group.bujRotation=next.bujRotation;
    group.at=this.now();
    await this.save();
  }
  async poll(chatId) {
    return this.call('sendPoll',{chat_id:chatId,question:'Hüt Gjurzi? Wann händ ihr Ziit?',options:[{text:'19:00 – Çay steht bereit'},{text:'20:00 – Hajde bojrum'},{text:'21:00 – Baba kommt später'},{text:'Hüt nöd – Buj spart Strom'}],is_anonymous:false,allows_multiple_answers:true});
  }
  finish(r) {
    const scope=this.scope(r), key=`${day(this.now())}:${scope}`;
    const evening=this.data.evenings[key] ||= {players:{},at:this.now()}; evening.at=this.now();
    const score=r.scores.at(-1);
    for(const [i,p] of r.players.entries()) if(!p.bot) {
      const row=evening.players[p.id] ||= {name:cleanName(p.name),wins:0,points:0,tea:0,throws:0,rounds:0};
      row.name=cleanName(p.name);row.rounds++;row.points+=score.points[r.mode==='teams'?i%2:i];
      if(score.winner===(r.mode==='teams'?i%2:i)) row.wins++;
    }
    // Count actions by identity, including players who left before the final round.
    for(const [id,f] of Object.entries(r.funStats || {})) {
      const row=evening.players[id] ||= {name:cleanName(f.name),wins:0,points:0,tea:0,throws:0,rounds:0};
      row.tea+=f.tea-(f.recordedTea||0);row.throws+=f.throws-(f.recordedThrows||0);f.recordedTea=f.tea;f.recordedThrows=f.throws;
    }
    r.awards=this.awards(evening);
    if(r.matchComplete) {
      const names=r.totals.map((_,i)=>r.mode==='teams'?`Team ${i===0?'A':'B'} (${r.players.filter((p,seat)=>seat%2===i).map(p=>cleanName(p.name)).join(' & ')})`:cleanName(r.players[i].name));
      const ranking=r.totals.map((points,i)=>({points,name:names[i]})).sort((a,b)=>a.points-b.points);
      const loser=ranking.at(-1),draw=ranking.every(x=>x.points===ranking[0].points);
      const joke=draw?'Glichstand. Sogar bim Verliere einig.':`${loser.name}: ${loser.points} Pünkt. Leider spielemer nöd Golf.`;
      r.socialReport=`GJURZI · PARTIE BEENDET\n${ranking.map((x,i)=>`${i+1}. ${x.name}: ${x.points} Punkte`).join('\n')}\n\n${joke}\n\nTitel des Abends (${day(this.now())}):\n${r.awards.join('\n') || 'Heute noch keine Titel.'}`;
      this.data.reports[scope]={text:r.socialReport,at:this.now()};
      if(r.groupChatId && r.reportsEnabled!==false && this.outbox.length<100) this.outbox.push({chat_id:r.groupChatId,text:r.socialReport,reply_markup:this.keyboard(r)});
    }
    this.prune();void this.save();
  }
  awards(evening) {
    const people=Object.values(evening.players),out=[];
    for(const [field,label] of [['wins','👑 Baba vom Tisch'],['points','🧾 Çay-Sponsor'],['throws','🪵 Brettwerfer'],['tea','🫖 Çay-Gönner']]) {
      const max=Math.max(0,...people.map(p=>p[field]));
      const leaders=people.filter(p=>p[field]===max);
      if(max>0) out.push(`${label}: ${leaders.slice(0,6).map(p=>p.name).join(', ')}${leaders.length>6?` + ${leaders.length-6} weitere`:''} (${max}${field==='points'?' Strafpunkte':field==='wins'?' Rundensiege':field==='tea'?' Çays':' Brettwürfe'})`);
    }
    return out;
  }
  async drain() {
    if(this.draining || !this.call || !this.outbox.length) return;
    this.draining=true;const message=this.outbox.shift();
    try {await this.call('sendMessage',message);} catch {console.error('Telegram-Partiebericht nicht zugestellt; abrufbar mit /bericht.');} finally {this.draining=false;}
  }
  async adminCheck(message,targetId) {
    if(message.chat.type!=='supergroup' || message.sender_chat) throw Error('Nur persönlich angemeldete Admins einer Supergruppe können moderieren.');
    if(!numeric(targetId) || String(targetId)===String(message.from.id)) throw Error('Antworte auf die Nachricht eines anderen Mitglieds.');
    const [actor,bot,target]=await Promise.all([this.call('getChatMember',{chat_id:message.chat.id,user_id:message.from.id}),this.call('getChatMember',{chat_id:message.chat.id,user_id:this.botId}),this.call('getChatMember',{chat_id:message.chat.id,user_id:Number(targetId)})]);
    if(!(actor.status==='creator' || actor.status==='administrator' && actor.can_restrict_members) || bot.status!=='administrator' || !bot.can_restrict_members) throw Error('Du und der Bot benötigen das Recht, Mitglieder einzuschränken.');
    if(['creator','administrator'].includes(target.status) || target.user?.is_bot) throw Error('Administratoren und Bots werden hier nicht moderiert.');
    return target;
  }
  async moderate(message,action,confirmed=false) {
    const argument=message.text.trim().split(/\s+/)[1];
    const target=message.reply_to_message?.from || (action==='entsperren' && numeric(argument) ? {id:Number(argument),first_name:argument} : null);
    if(!target) throw Error('Sende den Befehl als Antwort auf die Nachricht des Mitglieds.');
    const member=await this.adminCheck(message,target.id), params={chat_id:message.chat.id,user_id:target.id};
    if(action==='sperren' && !confirmed) {
      this.prune();if(this.pending.size>=100) throw Error('Zu viele offene Bestätigungen.');
      const key=randomBytes(12).toString('hex');this.pending.set(key,{message,until:this.now()+60000});
      return this.call('sendMessage',{chat_id:message.chat.id,text:`${cleanName(target.first_name)} wirklich aus der Telegram-Gruppe sperren? Telegram entfernt dabei auch die bisherigen Nachrichten dieses Mitglieds. ID zum Entsperren: ${target.id}. Bestätigung gilt 60 Sekunden.`,reply_markup:{inline_keyboard:[[{text:'Sperren bestätigen',callback_data:`ban:${key}`},{text:'Abbrechen',callback_data:`cancel:${key}`}]]}});
    }
    if(action==='ruhe') {
      if(member.status!=='member') throw Error('Nur uneingeschränkte Mitglieder können eine neue Chatpause bekommen.');
      await this.call('restrictChatMember',{...params,permissions:{can_send_messages:false},use_independent_chat_permissions:true,until_date:Math.floor(this.now()/1000)+300});
    } else if(action==='reden') {
      // Restore only the group's default permissions, never grant extra permissions.
      const chat=await this.call('getChat',{chat_id:message.chat.id});
      if(!chat.permissions) throw Error('Gruppenrechte konnten nicht ermittelt werden.');
      await this.call('restrictChatMember',{...params,permissions:chat.permissions,use_independent_chat_permissions:true});
    } else if(action==='sperren') await this.call('banChatMember',params);
    else if(action==='entsperren') await this.call('unbanChatMember',{...params,only_if_banned:true});
    return this.call('sendMessage',{chat_id:message.chat.id,text:action==='ruhe'?'Çay-Pause: 5 Minuten Schreibpause.':action==='reden'?'Schreibpause aufgehoben.':action==='sperren'?`Mitglied gesperrt. Aufheben: /entsperren ${target.id}`:'Sperre aufgehoben. Das Mitglied kann wieder beitreten.'});
  }
  async callback(query) {
    if(!query?.data || !/^(ban|cancel):/.test(query.data)) return;
    const [action,key]=query.data.split(':'),item=this.pending.get(key);
    if(!item || item.until<this.now() || query.from.id!==item.message.from.id || query.message?.chat.id!==item.message.chat.id) return this.call('answerCallbackQuery',{callback_query_id:query.id,text:'Diese Bestätigung ist nicht für dich oder abgelaufen.',show_alert:true});
    this.pending.delete(key);
    await this.call('answerCallbackQuery',{callback_query_id:query.id,text:action==='cancel'?'Abgebrochen.':'Wird geprüft …'});
    if(action==='ban') await this.moderate(item.message,'sperren',true);
    await this.call('editMessageReplyMarkup',{chat_id:query.message.chat.id,message_id:query.message.message_id,reply_markup:{inline_keyboard:[]}});
  }
  async command(message) {
    if(!message?.from || message.from.is_bot || typeof message.text!=='string') return false;
    const [command,target]=message.text.trim().split(/\s+/)[0].split('@');
    if(target && target.toLowerCase()!==this.config.botUsername.toLowerCase()) return false;
    if(!SOCIAL_COMMANDS.some(x=>'/'+x.command===command)) return false;
    if(!this.config.allowPublic && !this.config.allowedIds?.includes(String(message.from.id))) throw Error('Du bist noch nicht freigeschaltet.');
    const chatId=String(message.chat.id),id=String(message.from.id),action=command.slice(1);
    this.limit(`command:${id}`,1000);
    if(action==='stop') {if(message.chat.type!=='private') throw Error('Sende /stop direkt an den Bot.');await this.call('sendMessage',{chat_id:chatId,text:'Persönliche Erinnerungen aus. Mit /start wieder einschalten.'});return true;}
    if(['ruhe','reden','sperren','entsperren'].includes(action)) {await this.moderate(message,action);return true;}
    if(!['group','supergroup'].includes(message.chat.type)) throw Error('Diesen Befehl bitte in eurer Spielgruppe verwenden.');
    const r=[...this.arena.rooms.values()].find(r=>r.groupChatId===chatId);
    if(action==='titel' || action==='bericht') {
      this.limit(`read:${chatId}`,15000);
      const text=action==='bericht'?this.data.reports[`group:${chatId}`]?.text:this.awards(this.data.evenings[`${day(this.now())}:group:${chatId}`] || {players:{}}).join('\n');
      await this.call('sendMessage',{chat_id:chatId,text:text || 'Noch keine abgeschlossene Runde ausgewertet.'});return true;
    }
    if(action==='spielabend' || action==='buj') {
      this.limit(`${action==='spielabend'?'poll':'buj'}:${chatId}`,action==='spielabend'?3600000:30000);
      if(action==='spielabend') await this.poll(chatId);
      else await this.sendBuj(chatId);
      return true;
    }
    if(!r) throw Error('Eröffne zuerst mit /nisja einen Tisch in dieser Gruppe.');
    if(r.owner!==id) throw Error('Diesen Aufruf kann nur der Gastgeber starten.');
    if(action==='wo') await this.perform(id,'nudge',String(message.reply_to_message?.from?.id || ''));
    else if(action==='revanche') await this.perform(id,'revanche');
    return true;
  }
}
