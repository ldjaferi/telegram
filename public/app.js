import {drawFood,drawSnake} from './art.js';
import {MotionBuffer,roomUiKey} from './motion.js';
const $=id=>document.getElementById(id);
const labels={cheeks:'Knackige Pobacken',cherry:'Süsse Kirschen',star:'Kleine Sternchen'};
let config,user,token,room=null,ws,connected=false,reconnectTimer,attempt=0,selectedFood='cheeks',pendingJoin='',toastTimer,stopped=false;
const motion=new MotionBuffer();let renderedUiKey='',previewFood='';
const telegram=window.Telegram?.WebApp;
let immersive=false,ownsTelegramFullscreen=false;
function setGameView(active) {
  if(active===immersive)return;immersive=active;
  document.body.classList.toggle('in-game',active);
  window.scrollTo(0,0);
  if(!telegram?.initData)return;
  try {
    if(active) {
      telegram.expand();
      if(telegram.isVersionAtLeast?.('8.0')&&!telegram.isFullscreen){telegram.requestFullscreen();ownsTelegramFullscreen=true;}
    } else if(ownsTelegramFullscreen){telegram.exitFullscreen();ownsTelegramFullscreen=false;}
  } catch { /* The edge-to-edge layout also works without native fullscreen. */ }
}
function toast(message) {$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},5000);}
async function api(path,data) {
  const response=await fetch(`/api${path}`,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Die Anfrage ist fehlgeschlagen.');return result;
}
const action=fn=>async(event)=>{event?.preventDefault();try{await fn(event);}catch(error){toast(error.message);}};
function setConnection(value) {
  connected=value;$('connection-dot').classList.toggle('offline',!value);
  $('create-button').disabled=!value;$('practice-button').disabled=!value;
  document.querySelector('#join-form button').disabled=!value;
  if(!value)$('latency').textContent=user?'VERBINDUNG WIRD HERGESTELLT …':'BEREIT, WENN DU ES BIST.';
  if(room)renderRoom();
}
function updateFood(style) {
  if(style===previewFood)return;previewFood=style;
  $('food-label').textContent=labels[style]||labels.cheeks;
  const c=$('food-preview'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);drawFood(ctx,style,90,90,160);
}
function applyState(next) {
  motion.push(next,performance.now());room=next;renderRoom();
}
function renderRoom() {
  const key=roomUiKey(room,user?.id,connected);
  if(key===renderedUiKey)return;renderedUiKey=key;
  $('welcome-view').hidden=!!room;$('room-view').hidden=!room;
  const playing=room && ['running','countdown'].includes(room.status);
  setGameView(!!room&&['countdown','running','finished'].includes(room.status));
  document.body.classList.toggle('round-finished',room?.status==='finished');
  if(!room) {
    $('arena-label').textContent='DEIN NÄCHSTES MATCH';$('arena-meta').textContent='30 × 30 · CLASSIC';
    setOverlay('DER CLUB IST OFFEN','Hungrig?','Deine nächste Runde wartet.');updateFood(config?.food||'cheeks');return;
  }
  const me=room.players.find(p=>p.id===user.id),host=room.hostId===user.id,training=room.training??room.practice;
  const seconds=Math.min(120,Math.max(0,Math.ceil((room.endAt-room.serverTime)/1000)))||0;
  $('hud-score').textContent=`${me?.score||0} Punkte`;
  $('hud-time').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('hud-connection').hidden=connected;
  $('hud-surrender').hidden=!playing||!me?.alive;
  $('game-result-actions').hidden=room.status!=='finished';
  $('hud-restart').hidden=!host;
  $('hud-restart').disabled=!connected||room.players.some(p=>!p.connected);
  $('hud-restart').textContent=room.players.length===1?'Nochmal spielen ↗':'Revanche ↗';
  $('room-code-display').textContent=room.code;$('room-kind').textContent=room.practice?'DEIN TRAINING':'DEIN RAUM';
  $('room-caption').textContent=room.practice?'Etwas aufwärmen. Ganz ohne Publikum.':'Teile den Link. Fülle die Arena.';
  $('invite-button').hidden=room.practice;$('player-count').textContent=`${room.players.length} / ${room.practice?1:8}`;
  $('players').replaceChildren(...room.players.map(p=>{
    const li=document.createElement('li');if(playing&&!p.alive)li.className='dead';
    const dot=document.createElement('span');dot.className='player-dot';dot.style.setProperty('--player-color',p.color);
    const name=document.createElement('span');name.className='player-name';name.textContent=p.name+(p.id===user.id?' (du)':'');
    const tag=document.createElement('span');tag.className='player-tag';tag.textContent=!p.connected?'offline':p.id===room.hostId?'HOST':'';
    const score=document.createElement('span');score.className='player-score';score.textContent=p.score.toString().padStart(2,'0');li.append(dot,name,tag,score);return li;
  }));
  $('start-button').hidden=playing||!host;$('start-button').disabled=!connected||room.players.some(p=>!p.connected);
  $('start-button').textContent=!connected?'Verbindung wird hergestellt …':room.players.length===1?'Alleine spielen →':room.status==='finished'?'Revanche →':'Runde starten →';
  $('surrender-button').hidden=!playing||!me?.alive;$('leave-button').hidden=playing;
  $('room-note').textContent=!connected?'Die Spielverbindung wird wiederhergestellt.':playing?(training?'Solotraining · zählt nicht zur Rangliste.':'2 Minuten · 10 Punkte pro Snack · Wände sind hart.'):host?(room.players.some(p=>!p.connected)?'Warte auf die Verbindung aller Spieler.':room.players.length===1?'Du kannst sofort alleine trainieren. Mit weiteren Spielern startet die nächste Runde als Multiplayer.':'Alle da? Du kannst die Runde starten.'):'Der Raumleiter startet die nächste Runde.';
  $('arena-label').textContent=training&&room.status!=='lobby'?'SOLOTRAINING':room.practice?'TRAINING':`RAUM ${room.code}`;
  $('arena-meta').textContent=playing?`${Math.min(120,Math.max(0,Math.ceil((room.endAt-room.serverTime)/1000)))} SEK · ${room.players.filter(p=>p.alive).length} IM SPIEL`:'30 × 30 · CLASSIC';
  updateFood(room.foodStyle);
  if(room.status==='lobby')setOverlay('BEREIT ZUM SPIELEN?',room.players.length===1?'Los geht’s.':`${room.players.length} / 8`,room.players.length===1?'Spiele direkt alleine oder lade Freunde ein.':'Alle da? Starte die Runde.');
  else if(room.status==='countdown')setOverlay('GLEICH GEHT’S LOS',String(Math.max(1,Math.ceil((room.startAt-room.serverTime)/1000))),'Mach dich bereit.');
  else if(room.status==='finished') {
    const winners=room.results.filter(p=>p.rank===1);const won=winners.some(p=>p.id===user.id);
    setOverlay(training?'TRAINING BEENDET':winners.length>1?'UNENTSCHIEDEN':won?'DIE RUNDE GEHÖRT DIR':'RUNDE GESPIELT',training?`${me?.score||0} Punkte`:winners.length>1?'Gleichstand.':won?'Sssieg!':`${winners[0]?.name||'Runde'} gewinnt`,training?'Noch eine Runde? Du kannst sofort wieder starten.':room.results.map(p=>`${p.name}: ${p.score}`).join(' · '));
  } else if(!me?.alive)setOverlay('DU BIST AUSGESCHIEDEN','Autsch.', 'Schau zu – die Runde läuft weiter.');
  else $('board-overlay').hidden=true;
}
function setOverlay(kicker,title,subtitle) {
  const overlay=$('board-overlay');overlay.hidden=false;overlay.replaceChildren();
  const k=document.createElement('span');k.className='overlay-kicker';k.textContent=kicker;
  const t=document.createElement('strong');t.textContent=title;const s=document.createElement('span');s.textContent=subtitle;overlay.append(k,t,s);
}
async function connect() {
  if(stopped)return;
  clearTimeout(reconnectTimer);
  try {
    const {ticket}=await api('/socket-ticket',{});
    ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/socket?ticket=${encodeURIComponent(ticket)}`);
    ws.onmessage=event=>{
      const message=JSON.parse(event.data);
      if(message.type==='connected') {
        setConnection(true);attempt=0;
        if(message.room)applyState(message.room);else {room=null;motion.reset();renderRoom();}
        if(pendingJoin) {const code=pendingJoin;pendingJoin='';api('/join',{code}).then(r=>applyState(r.room)).catch(e=>{toast(e.message);$('room-code').value=code;});}
      }
      if(message.type==='state')applyState(message.room);
      if(message.type==='pong')$('latency').textContent=`${Math.max(1,Math.round(performance.now()-message.at))} MS · VERBUNDEN`;
    };
    ws.onclose=event=>{
      setConnection(false);
      if([4001,4003].includes(event.code)){stopped=true;toast(event.code===4001?'Das Spiel ist in einem anderen Fenster geöffnet.':'Bitte öffne das Spiel erneut über Telegram.');return;}
      scheduleReconnect();
    };
    ws.onerror=()=>{};
  } catch(error) {setConnection(false);if(attempt===0)toast(error.message);scheduleReconnect();}
}
function scheduleReconnect() {if(stopped)return;reconnectTimer=setTimeout(connect,Math.min(8000,1000*2**attempt++));}
function signedIn(result) {
  token=result.token;user=result.user;
  $('identity').textContent=user.name;$('login-panel').hidden=true;$('telegram-panel').hidden=true;$('play-actions').hidden=false;
  $('admin-button').hidden=!user.isAdmin;$('scores-button').disabled=false;
  if(config.dev)sessionStorage.setItem('snake-session',JSON.stringify({token,user}));
  connect();
}
let lastInput='',lastInputAt=-Infinity,lastInputRound='';
function direction(value) {
  if(!connected||!room||!['running','countdown'].includes(room.status))return;
  const round=`${room.code}:${room.startAt}`,now=performance.now();
  if(lastInputRound!==round){lastInput='';lastInputAt=-Infinity;lastInputRound=round;}
  // Pointer events and held keys must not flood the socket and trigger a reconnect.
  if(now-lastInputAt<35 || (value===lastInput&&now-lastInputAt<75))return;
  ws.send(JSON.stringify({type:'direction',direction:value}));lastInput=value;lastInputAt=now;
}
$('login-button').addEventListener('click',action(async()=>signedIn(await api('/dev-login',{name:$('nickname').value,admin:$('dev-admin').checked}))));
$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')$('login-button').click();});
$('create-button').addEventListener('click',action(async()=>applyState((await api('/rooms',{})).room)));
let startingPractice=false;
$('practice-button').addEventListener('click',action(async()=>{
  if(startingPractice)return;
  startingPractice=true;$('practice-button').disabled=true;
  try {
    // Keep the room open to friends for the next round, but start solo immediately.
    applyState((await api('/rooms',{})).room);
    await api('/start',{});
  } finally {startingPractice=false;$('practice-button').disabled=!connected;}
}));
$('join-form').addEventListener('submit',action(async()=>applyState((await api('/join',{code:$('room-code').value.trim()})).room)));
$('start-button').addEventListener('click',action(()=>api('/start',{})));
async function leaveRoom(){await api('/leave',{});room=null;motion.reset();renderRoom();}
$('leave-button').addEventListener('click',action(leaveRoom));
$('hud-lobby').addEventListener('click',action(leaveRoom));
$('hud-restart').addEventListener('click',action(()=>api('/start',{})));
$('hud-surrender').addEventListener('click',action(()=>api('/surrender',{})));
$('surrender-button').addEventListener('click',action(()=>api('/surrender',{})));
$('invite-button').addEventListener('click',action(async()=>{
  const link=config.botUsername&&!config.dev?`https://t.me/${config.botUsername}?start=room_${room.code}`:`${location.origin}/?room=${room.code}`;
  try{await navigator.clipboard.writeText(link);toast('Einladungslink kopiert. Schick ihn deinen Freunden!');}catch{toast(`Raumcode: ${room.code}`);}
}));
$('scores-button').addEventListener('click',action(async()=>{
  if(!user)return toast('Melde dich zuerst an, um die Rangliste zu sehen.');
  const {players}=await api('/leaderboard');const content=$('scores-content');content.replaceChildren();
  if(!players.length){const p=document.createElement('p');p.className='muted';p.textContent='Noch ist hier Platz für Legenden. Spiele die erste Multiplayer-Runde.';content.append(p);}
  players.forEach((p,i)=>{const row=document.createElement('div');row.className='score-row';const rank=document.createElement('b');rank.textContent=String(i+1).padStart(2,'0');const name=document.createElement('span');name.className='score-name';name.textContent=p.name;const score=document.createElement('b');score.textContent=p.best;const wins=document.createElement('small');wins.textContent=`${p.wins} Siege`;row.append(rank,name,score,wins);content.append(row);});
  $('scores-dialog').showModal();
}));
function selectFood(style){selectedFood=style;document.querySelectorAll('.food-option').forEach(b=>{const selected=b.dataset.food===style;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
$('admin-button').addEventListener('click',action(async()=>{const data=await api('/admin');selectFood(data.food);$('admin-stats').textContent=`${data.rooms} aktive Räume · ${data.players} verbundene Spieler`;$('admin-dialog').showModal();}));
document.querySelectorAll('.food-option').forEach(button=>{const canvas=button.querySelector('canvas');drawFood(canvas.getContext('2d'),button.dataset.food,70,70,120);button.addEventListener('click',()=>selectFood(button.dataset.food));});
$('save-food').addEventListener('click',action(async()=>{await api('/admin/food',{food:selectedFood});config.food=selectedFood;if(!room)updateFood(selectedFood);$('admin-dialog').close();toast('Gespeichert. Das neue Futter gilt ab der nächsten Runde.');}));
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('pointerdown',e=>{e.preventDefault();direction(button.dataset.direction);}));
document.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA'].includes(e.target.tagName)||document.querySelector('dialog[open]'))return;
  const d={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key];
  if(d&&room){e.preventDefault();direction(d);}
});
let touchStart;
$('canvas-wrap').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;touchStart={x:e.clientX,y:e.clientY};$('canvas-wrap').setPointerCapture(e.pointerId);});
$('canvas-wrap').addEventListener('pointermove',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;direction(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');touchStart={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel'])$('canvas-wrap').addEventListener(event,()=>{touchStart=null;});
setInterval(()=>{if(connected&&ws?.readyState===1)ws.send(JSON.stringify({type:'ping',at:performance.now()}));},4000);

const canvas=$('board'),ctx=canvas.getContext('2d');
const grid=document.createElement('canvas');grid.width=canvas.width;grid.height=canvas.height;
const gridContext=grid.getContext('2d');
const snacks=document.createElement('canvas');snacks.width=canvas.width;snacks.height=canvas.height;
const snackContext=snacks.getContext('2d');let snackKey='',lastScene='';
function resizeBoard() {
  const rect=$('canvas-wrap').getBoundingClientRect();if(!rect.width||!rect.height)return;
  const scale=Math.min(window.devicePixelRatio||1,2,1440/Math.max(rect.width,rect.height));
  const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
  if(canvas.width===width&&canvas.height===height&&grid.dataset.ready)return;
  canvas.width=grid.width=snacks.width=width;canvas.height=grid.height=snacks.height=height;
  gridContext.fillStyle='#192315';gridContext.fillRect(0,0,width,height);
  gridContext.strokeStyle='#2b382240';gridContext.lineWidth=1;
  for(let i=1;i<30;i++){const x=i*width/30,y=i*height/30;gridContext.beginPath();gridContext.moveTo(x,0);gridContext.lineTo(x,height);gridContext.moveTo(0,y);gridContext.lineTo(width,y);gridContext.stroke();}
  grid.dataset.ready='true';snackKey='';lastScene='';
}
new ResizeObserver(resizeBoard).observe($('canvas-wrap'));
window.addEventListener('resize',resizeBoard);resizeBoard();
let diagnosticFrames=0,diagnosticStart=0;
function draw(time) {
  requestAnimationFrame(draw);if(document.hidden||!immersive)return;
  const scene=JSON.stringify([room?.code,room?.status,room?.tick,room?.foodStyle,config?.food]);
  if(room?.status!=='running'&&scene===lastScene)return;lastScene=scene;
  const size=canvas.width,height=canvas.height,cell=size/30,cellY=cell,snackSize=cell;ctx.drawImage(grid,0,0);
  if(config?.dev&&room?.status==='running') {
    if(!diagnosticStart)diagnosticStart=time;
    diagnosticFrames++;
    if(time-diagnosticStart>=1000){canvas.dataset.renderFps=String(Math.round(diagnosticFrames*1000/(time-diagnosticStart)));diagnosticFrames=0;diagnosticStart=time;}
  } else {diagnosticFrames=0;diagnosticStart=0;}
  if(room && room.status!=='lobby') {
    const foodKey=JSON.stringify([room.foodStyle,room.food]);
    if(foodKey!==snackKey){snackKey=foodKey;snackContext.clearRect(0,0,size,height);room.food.forEach((f,i)=>drawFood(snackContext,room.foodStyle,(f.x+.5)*cell,(f.y+.5)*cellY,snackSize*1.06,i));}
    ctx.drawImage(snacks,0,0);
    const animated=new Map((room.status==='running'?motion.sample(time):room.players).map(p=>[p.id,p]));
    for(const p of room.players) {
      const visual=p.alive?(animated.get(p.id)||p):p;
      drawSnake(ctx,visual.body,p.color,cell,visual.direction,1,cellY);
    }
  }
}
requestAnimationFrame(draw);
async function boot() {
  config=await api('/config');updateFood(config.food);setConnection(false);
  const query=new URLSearchParams(location.search);const start=telegram?.initDataUnsafe?.start_param||query.get('tgWebAppStartParam')||'';
  // This value only selects an invitation. Identity/permissions always come from server validation.
  pendingJoin=(start.startsWith('room_')?start.slice(5):query.get('room')||'').toUpperCase();if(!/^[A-F0-9]{8}$/.test(pendingJoin))pendingJoin='';
  if(telegram?.initData) {telegram.ready();telegram.expand();if(telegram.isVersionAtLeast?.('7.7'))telegram.disableVerticalSwipes();signedIn(await api('/auth',{initData:telegram.initData}));}
  else if(config.dev) {
    const saved=sessionStorage.getItem('snake-session');
    if(saved){try{const session=JSON.parse(saved);token=session.token;const me=await api('/me');signedIn({...session,user:me.user});if(me.room)applyState(me.room);return;}catch{sessionStorage.removeItem('snake-session');token=null;}}
    $('login-panel').hidden=false;
  } else {
    $('telegram-panel').hidden=false;
    if(config.setupRequired)$('telegram-message').textContent='Das Spielfeld ist bereit. Der Telegram-Zugang wird gerade eingerichtet. Schau bald wieder vorbei.';
    if(config.botUsername){$('telegram-link').href=`https://t.me/${config.botUsername}?start=${pendingJoin?'room_'+pendingJoin:'play'}`;$('telegram-link').hidden=false;}
  }
}
boot().catch(error=>{$('telegram-panel').hidden=false;$('telegram-message').textContent=error.message;toast(error.message);});
