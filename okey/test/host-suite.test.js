import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Arena} from '../src/game.js';
import {SocialHub} from '../src/social.js';
const user=id=>({id:String(id),name:'Player '+id});
function setup(){let time=Date.now();const arena=new Arena({now:()=>time});const r=arena.create(user(1),false,{roundLimit:5,mode:'individual'});arena.join(user(2),r.code);return{arena,r,get time(){return time},advance:n=>time+=n};}

test('host authority, table lock, reconnect, transfer and server-side moderation checks',()=>{
 const {arena:a,r}=setup();
 for(const action of ['pause','resume','lock','unlock','remove','quiet','transfer','reports-off']) assert.throws(()=>a.hostAction('2',action,'1'),/Gastgeber/);
 a.hostAction('1','lock');assert.throws(()=>a.join(user(3),r.code),/gesperrt/);assert.equal(a.join(user(2),r.code),r);
 a.hostAction('1','unlock');a.join(user(3),r.code);
 assert.throws(()=>a.hostAction('1','remove','1'),/anderen/);assert.throws(()=>a.hostAction('1','transfer','fake'),/Mitspieler/);
 a.hostAction('1','transfer','2');assert.equal(r.owner,'2');assert.throws(()=>a.hostAction('1','lock'),/Gastgeber/);
 a.hostAction('2','reports-off');assert.equal(a.snapshot(r,'1').reportsEnabled,false);
});

test('pause freezes human timer and bots, denies forged moves, resumes exact remaining time',()=>{
 const f=setup(),a=f.arena,r=f.r;a.start('1');f.advance(30000);
 a.hostAction('1','pause');const frozen=r.players[0].hand.map(t=>t.id),left=r.pause.remaining;
 assert.equal(left,90000);assert.throws(()=>a.discard('1',frozen[0]),/dran/);assert.throws(()=>a.surrender('2'),/pausiert/);
 f.advance(900000);a.tick();assert.equal(a.rooms.get(r.code),r);assert.deepEqual(r.players[0].hand.map(t=>t.id),frozen);
 a.hostAction('1','resume');assert.equal(r.deadline-f.time,left);
 a.discard('1',frozen[0]);a.draw('2','stock');a.discard('2',r.players[1].hand[0].id);
 assert.equal(r.players[r.turn].bot,true);a.hostAction('1','pause');const state=JSON.stringify(r.players.map(p=>p.hand));f.advance(3000);a.tick();assert.equal(JSON.stringify(r.players.map(p=>p.hand)),state);
 a.hostAction('1','resume');f.advance(1401);a.tick();assert.equal(r.phase,'discard');
});

test('removal blocks rejoin, preserves physical tiles, turn and points, bot takes over',()=>{
 const {arena:a,r}=setup();a.start('1');a.discard('1',r.players[0].hand[0].id);a.draw('2','stock');
 const hand=r.players[1].hand,points=r.totals,phase=r.phase;a.hostAction('1','remove','2');
 assert.equal(r.players[1].hand,hand);assert.equal(r.players[1].bot,true);assert.equal(r.phase,phase);assert.equal(r.turn,1);assert.equal(r.totals,points);
 assert.equal(a.roomFor('2'),undefined);assert.throws(()=>a.join(user(2),r.code,r.players[1].id),/entfernt/);
 const all=[...r.stock,...r.players.flatMap(p=>p.hand),...r.discards.flat()];assert.equal(all.length,106);assert.equal(new Set(all.map(t=>t.id)).size,106);
 assert.equal(a.snapshot(r,'1').players[1].hand,undefined);
});

test('gesture pause stops all fun channels but not legal moves; expires after five minutes',()=>{
 const f=setup(),a=f.arena,r=f.r;a.start('1');a.hostAction('1','quiet','2');
 assert.throws(()=>a.gesture('2','tea'),/Spassaktionen/);assert.throws(()=>a.shisha('2'),/Spassaktionen/);assert.throws(()=>a.bluff('2'),/Spassaktionen/);
 a.discard('1',r.players[0].hand[0].id);a.draw('2','stock');a.discard('2',r.players[1].hand[0].id);
 f.advance(300001);a.gesture('2','tea');assert.equal(r.funStats['2'].tea,1);
 a.hostAction('1','quiet','2');a.hostAction('1','unquiet','2');f.advance(3000);a.shisha('2');
});

test('ten-table cap is enforced and abandoned paused tables still expire',()=>{
 let now=Date.now();const a=new Arena({now:()=>now});for(let i=0;i<10;i++)a.create(user(i));assert.throws(()=>a.create(user(99)),/belegt/);
 const r=a.roomFor('0');a.start('0');a.hostAction('0','pause');r.players[0].connected=false;now+=600001;a.tick();assert.equal(a.rooms.size,0);
});

function socialFixture(){const f=setup();const config={allowPublic:true,botUsername:'test_bot',publicUrl:'https://example.test'};const hub=new SocialHub(f.arena,config,{now:()=>f.time});const calls=[];hub.call=async(method,args)=>{calls.push([method,args]);return true;};hub.botId=900;return{...f,f,hub,calls,config};}
const message=(text,id=1,chat=-100,type='supergroup',target)=>({text,from:{id,first_name:'Player '+id},chat:{id:chat,type},...(target?{reply_to_message:{from:{id:target,first_name:'Buddy'}}}:{})});

test('nudge validates host and group contacts, escapes names, limits spam and respects private opt-out',async()=>{
 const {arena:a,r,hub:h,calls,f}=socialFixture();r.groupChatId='-100';h.remember(message('/nisja'));h.remember(message('/wo',1,-100,'supergroup',2));h.data.users['2'].name='<b>Buddy</b>';
 await assert.rejects(h.perform('2','nudge','1'),/Gastgeber/);await assert.rejects(h.perform('1','nudge','999'),/bekannten/);
 await h.perform('1','nudge','2');assert.equal(calls.at(-1)[1].chat_id,'-100');assert.match(calls.at(-1)[1].text,/&lt;b&gt;/);assert.match(calls.at(-1)[1].reply_markup.inline_keyboard[0][0].url,new RegExp(r.code));
 await assert.rejects(h.perform('1','nudge','2'),/Sekunden/);
 delete r.groupChatId;f.advance(300001);await assert.rejects(h.perform('1','nudge','2'),/start/);
 h.remember(message('/start',2,2,'private'));await h.perform('1','nudge','2');assert.equal(calls.at(-1)[1].chat_id,'2');
 h.remember(message('/stop',2,2,'private'));f.advance(300001);await assert.rejects(h.perform('1','nudge','2'),/start/);
});

test('group commands produce polls and Buj; foreign bot commands ignored; cross-group host cannot send',async()=>{
 const {r,hub:h,calls,f}=socialFixture();r.groupChatId='-100';h.remember(message('/nisja'));
 assert.equal(await h.command(message('/buj@other_bot')),false);
 await h.command(message('/spielabend'));assert.equal(calls.at(-1)[0],'sendPoll');assert.equal(calls.at(-1)[1].options.length,4);assert.equal(calls.at(-1)[1].is_anonymous,false);
 f.advance(1001);await assert.rejects(h.command(message('/spielabend')),/Sekunden/);
 f.advance(1001);await h.command(message('/buj'));assert.match(calls.at(-1)[1].text,/Buj:/);
 f.advance(31000);await h.command(message('/revanche'));assert.match(calls.at(-1)[1].text,/Revanche/);
 f.advance(1001);await assert.rejects(h.command(message('/wo',1,-200,'supergroup',2)),/nisja/);
});

test('reports and tied evening titles use actual results, are group-isolated and survive reload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gjurzi-social-'));let h;try{
 let now=Date.now();const a=new Arena({now:()=>now,onFinish:r=>h.finish(r)});h=new SocialHub(a,{socialPath:join(dir,'social.json'),botUsername:'test_bot'},{now:()=>now});
 const r=a.groupTable(user(1),-100);a.join(user(2),r.code);a.configure('1',{roundLimit:5,mode:'teams'});
 const calls=[];h.call=async(m,p)=>calls.push([m,p]);
 for(let i=0;i<5;i++){a.start('1');now+=3000;a.gesture('1','tea');a.finish(r,r.players[0],'test');}
 assert.equal(r.matchComplete,true);assert.match(r.socialReport,/PARTIE BEENDET/);assert.match(r.socialReport,/Team A/);assert.ok(r.awards.some(x=>x.includes('Baba vom Tisch: Player 1 (5')));assert.ok(r.awards.some(x=>x.includes('Çay-Gönner: Player 1 (5')));
 assert.equal(h.outbox.length,1);await h.drain();await h.drain();assert.equal(calls.length,1);assert.equal(calls[0][1].chat_id,'-100');
 await h.saving;const reload=new SocialHub(a,{socialPath:join(dir,'social.json')},{now:()=>now});await reload.load();assert.equal(reload.data.reports['group:-100'].text,r.socialReport);assert.equal(reload.data.reports['group:-200'],undefined);
 a.newMatch('1');a.hostAction('1','reports-off');for(let i=0;i<5;i++){a.start('1');a.finish(r,null,'stock');}assert.equal(h.outbox.length,0);
 }finally{await h?.saving;assert.ok(dir.startsWith(join(tmpdir(),'gjurzi-social-')));await rm(dir,{recursive:true,force:true});}
});

test('Telegram moderation checks both admins, denies targets who are admins; confirmation bound to requester/chat and rechecks rights',async()=>{
 const {hub:h,calls,f}=socialFixture();let actorAdmin=false,targetAdmin=false;
 h.call=async(m,p)=>{calls.push([m,p]);if(m==='getChatMember'){if(p.user_id===900)return{status:'administrator',can_restrict_members:true};if(p.user_id===1)return{status:actorAdmin?'creator':'member'};return{status:targetAdmin?'administrator':'member',user:{is_bot:false}};}return true;};
 const m=message('/ruhe',1,-100,'supergroup',2);await assert.rejects(h.moderate(m,'ruhe'),/benötigen/);assert.ok(!calls.some(x=>x[0]==='restrictChatMember'));
 actorAdmin=true;targetAdmin=true;await assert.rejects(h.moderate(m,'ruhe'),/Administratoren/);targetAdmin=false;await h.moderate(m,'ruhe');assert.equal(calls.find(x=>x[0]==='restrictChatMember')[1].until_date,Math.floor(f.time/1000)+300);
 await h.moderate(message('/sperren',1,-100,'supergroup',2),'sperren');const key=[...h.pending.keys()][0];
 await h.callback({id:'x',data:'ban:'+key,from:{id:2},message:{chat:{id:-100},message_id:8}});assert.ok(!calls.some(x=>x[0]==='banChatMember'));
 actorAdmin=false;await assert.rejects(h.callback({id:'y',data:'ban:'+key,from:{id:1},message:{chat:{id:-100},message_id:8}}),/benötigen/);assert.ok(!calls.some(x=>x[0]==='banChatMember'));
 actorAdmin=true;await h.moderate(message('/entsperren 2'),'entsperren');assert.equal(calls.at(-2)[0],'unbanChatMember');assert.equal(calls.at(-2)[1].only_if_banned,true);
});
