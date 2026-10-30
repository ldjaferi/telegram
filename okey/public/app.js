import { TEAM_QUESTIONS } from './team-chat.js';
import { bestCombinations } from './combinations.js';
import { winningGroups } from './melds.js';
import { TableMusic, shishaBubbles, TileClack } from './music.js';
import { FreeRack } from './rack.js';
import { canMakeExcuse, teaBill } from './table-fun.js';
const $ = s => document.querySelector(s);
const appBase = new URL('.', document.baseURI);
const apiUrl = path => new URL(path.replace(/^\//, ''), appBase);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colors = ['Rot', 'Gelb', 'Blau', 'Schwarz'];
// The code gives every guest the same name, including after reconnects.
const tableNames = ['Te Besniku', 'Te Blerimi', 'Te Agroni', 'Te Iliri', 'Te Arbeni', 'Te Besimi', 'Te Dritani', 'Te Lulzimi', 'Te Ardiani', 'Te Gëzimi', 'Te Fatosi', 'Te Petriti', 'Te Flamuri', 'Te Burimi', 'Te Albani', 'Te Taulanti'];
const tableName = code => tableNames[parseInt(code, 16) % tableNames.length];
const faces = ['😎', '👨🏻', '👩🏻', '🧔🏻'];
const gestureArt = { finger: '🖕', buj: '🌚', tea: '☕' };
const gestureCopy = { finger: 'sendet liebe Grüsse', buj: 'Ihr sind alles Opfer und chömed i dhölll', tea: 'gibt einen Çay aus' };
const juiceArt = '<svg class="juice-glass" viewBox="0 -8 64 80" aria-hidden="true" focusable="false"><path d="M12 13h40l-5 49q-1 5-7 5H24q-6 0-7-5z" fill="#eaf3e9" stroke="#fef9e5" stroke-width="3"/><path d="M16 29h32l-4 32q0 2-4 2H24q-4 0-4-2z" fill="#e5a931"/><ellipse cx="32" cy="29" rx="16" ry="4" fill="#f5cb57"/><path d="m22 22 3 32" stroke="#fff6d0" stroke-width="3" stroke-linecap="round"/><path d="M41 17c-13-11-9-23-1-16 8-7 17 3 9 12l-8 8z" fill="#d65140" stroke="#83352a" stroke-width="1.5"/><path d="M41 4q-1-6 5-7" fill="none" stroke="#695333" stroke-width="2"/><path d="M42 3q4-9 13-1-8 5-13 1" fill="#609657"/></svg>';
const victoryLines = [
  'Nicht so angeberisch bitte.',
  'Einmal gewonnen, schon Tischpräsident.',
  'Jetzt bloss keine Siegerrede.',
  'Geniesse es. Die Revanche lädt schon.',
  'Der Çay geht trotzdem auf dich.',
  'Gut gespielt. Leider müssen wir das zugeben.',
  'Dein Ego braucht jetzt einen eigenen Stuhl.',
  'Die Steine waren gut. Die Sprüche kommen noch.',
  'Bitte lächeln, aber nicht bis morgen.',
  'Der Tisch hat Glück. Du stehst noch nicht drauf.',
  'Applaus gibt es nach dem Abwasch.',
  'Du darfst grinsen. Kurz.',
  'Heute Champion, morgen wieder Ausreden.',
  'Die anderen haben dich nur warmspielen lassen.',
  'Kein Grund, gleich Autogramme zu verteilen.',
  'Ein Sieg macht noch keine Statue.',
  'Du gewinnst die Runde. Wir behalten den Humor.',
  'Bitte bleib für normale Menschen erreichbar.',
  'Der Pokal ist leider gerade in der Spülmaschine.',
  'So. Und jetzt wieder bescheiden sitzen.'
];
function victoryLine(){
  const seed=(parseInt(room.code,16)||0)+(room.matchNumber||1)*7+room.round*13;
  return victoryLines[seed%victoryLines.length];
}
let room = null, user = null, socket = null, config = null, selected = null, order = [], target = null, lastEvent = 0, roomCode = null, connected = false, reconnectTimer, toastTimer, eventTimer, serverOffset = 0;
let lastTeamVersion = '', teamMessageTimer;
let newTileId = null, newTileKey = '', newTileTimer, jokerTimer;
let muted = localStorage.getItem('okey-muted') === 'true', audio, music, tileClack;
let audioUnlocked = false, suppressClickUntil = 0;
const freeRack = new FreeRack($('#rack'), { markup: tileMarkup, selected: () => selected, onSelect: id => { selected=selected===id?null:id; suppressClickUntil=Date.now()+400; renderRack(); }, onMove: (id, move) => { selected=move?.group?null:id; suppressClickUntil=Date.now()+400; renderRack(); if(move?.contact&&!muted&&!document.hidden)tileClack?.play(); } });
for(const button of [...document.querySelectorAll('.gestures button'), $('#bluff'), $('#shisha'), $('#fun-button')]) $('#table-actions').append(button);
// Keep the existing wire ID so active rooms can receive the replacement action without a restart.
$('[data-gesture="fart"] span').innerHTML = juiceArt;
$('#bluff').setAttribute('aria-label','Joker-Bluff'); $('#shisha').setAttribute('aria-label','Fester Zug');
let token = sessionStorage.getItem('okey-token') || '';
let smokeTimer, stopBubbles;
const telegram = window.Telegram?.WebApp;
telegram?.ready(); telegram?.expand();
function fitViewport() {
  document.documentElement.style.setProperty('--app-height', Math.floor(Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight)) + 'px');
}
window.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('resize', fitViewport);
fitViewport();
$('#tools-button').onclick = () => { $('#tools-content').append($('#table-tools')); $('#tools-dialog').showModal(); };
$('#close-tools').onclick = () => $('#tools-dialog').close();
$('#tools-dialog').addEventListener('close', () => { document.querySelector('main').append($('#table-tools')); $('#tools-button').focus(); });
$('#fun-button').onclick = () => { $('#fun-dialog').showModal(); $('#fun-button').setAttribute('aria-expanded', 'true'); };
$('#close-fun').onclick = () => $('#fun-dialog').close();
$('#fun-dialog').addEventListener('close', () => {
  $('#fun-button').setAttribute('aria-expanded', 'false');
  if (!$('#modal').open) $('#fun-button').focus();
});
const portraitScreen = matchMedia('(orientation: portrait)');
const smallScreen = matchMedia('(max-width: 900px)');
const touchScreen = matchMedia('(pointer: coarse)');
let rotateHintDismissed = sessionStorage.getItem('okey-rotate-dismissed') === 'true';
function updateRotateHint() {
  const mobile = touchScreen.matches || ['android', 'ios'].includes(telegram?.platform);
  $('#rotate-hint').hidden = rotateHintDismissed || !mobile || !smallScreen.matches || !portraitScreen.matches;
}
for (const query of [portraitScreen, smallScreen, touchScreen]) query.addEventListener('change', updateRotateHint);
$('#dismiss-rotate').onclick = () => { rotateHintDismissed = true; sessionStorage.setItem('okey-rotate-dismissed', 'true'); updateRotateHint(); };
updateRotateHint();

const demoHand = [
  {id:'demo-joker',joker:true}, ...[3, 4, 6].map(number => ({ id: `d0-${number}`, color: 0, number })),
  ...[7, 8, 9].map(number => ({ id: `d2-${number}`, color: 2, number })),
  { id: 'd1-11', color: 1, number: 11 },
  ...[0, 1, 2, 3].map(color => ({ id: `d-${color}-10`, color, number: 10 })),
  ...[1, 2, 3].map(number => ({ id: `d3-${number}`, color: 3, number }))
];
const me = () => room?.players.find(p => p.id === user?.id);
const myTurn = () => connected && room?.status === 'playing' && !me()?.out && room.players[room.turn]?.id === user?.id;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3800); }
function modal(html) { $('#modal-content').dataset.view = ''; delete $('#modal-content').dataset.messageId; $('#modal-content').innerHTML = html; if (!$('#modal').open) $('#modal').showModal(); }
$('#close-modal').onclick = () => $('#modal').close();
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) { const r = $('#modal').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('#modal').close(); } });

function syncMusic(){
  if(!audioUnlocked||!audio)return;
  music ||= new TableMusic(audio);
  if(!muted && room?.status==='playing' && !document.hidden)music.start();else music.stop();
}
function unlockAudio(){
  if(muted || (audioUnlocked && audio?.state === 'running'))return;
  try{audio ||= new (window.AudioContext || window.webkitAudioContext)();tileClack ||= new TileClack(audio,apiUrl('/klack.mp3'),()=>!muted&&!document.hidden);audio.resume().then(()=>{audioUnlocked=true;syncMusic()}).catch(()=>{});}catch{}
}
document.addEventListener('pointerdown',unlockAudio,{passive:true});
document.addEventListener('keydown',unlockAudio);
document.addEventListener('visibilitychange',()=>{syncMusic();if(document.hidden){stopBubbles?.();tileClack?.stop()}});
function sound(kind = 'tile') {
  if (muted || document.hidden) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
    if (kind === 'shisha' || kind === 'puff') { stopBubbles?.(); stopBubbles=shishaBubbles(audio,kind==='shisha'); return; }
    const t = audio.currentTime, gain = audio.createGain(); gain.connect(audio.destination);
    if (kind === 'sad-trombone') {
      const oscillator = audio.createOscillator(), filter = audio.createBiquadFilter();
      oscillator.type = 'sawtooth'; filter.type = 'lowpass'; filter.frequency.value = 800;
      oscillator.connect(filter); filter.connect(gain);
      for (const [i, frequency] of [233.08, 220, 207.65, 196].entries()) {
        const at = t + i * .28;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(.065, at + .035);
        gain.gain.exponentialRampToValueAtTime(.001, at + .26);
      }
      oscillator.frequency.exponentialRampToValueAtTime(146.83, t + 1.1);
      oscillator.start(t); oscillator.stop(t + 1.13);
    } else if (kind === 'throw') {
      const seconds = .3;
      const buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter(); source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 1700; source.connect(filter); filter.connect(gain);
      gain.gain.setValueAtTime(.2, t); gain.gain.exponentialRampToValueAtTime(.001, t + seconds); source.start(t);
    } else if (kind === 'juice') {
      const oscillator = audio.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = 1450; oscillator.connect(gain);
      gain.gain.setValueAtTime(.07, t); gain.gain.exponentialRampToValueAtTime(.001, t + .45); oscillator.start(t); oscillator.stop(t + .46);
    } else {
      const oscillator = audio.createOscillator(); oscillator.type = kind === 'tile' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(kind === 'tile' ? 800 : 520, t); oscillator.frequency.exponentialRampToValueAtTime(180, t + .13); oscillator.connect(gain); gain.gain.setValueAtTime(.12, t); gain.gain.exponentialRampToValueAtTime(.001, t + .15); oscillator.start(t); oscillator.stop(t + .16);
    }
  } catch { /* Muted devices can still play the game. */ }
}
function updateSound() { $('#sound').innerHTML = muted ? '♫<span class="sound-slash">/</span>' : '♫'; $('#sound').title = muted ? 'Musik und Ton einschalten' : 'Musik und Ton ausschalten'; $('#sound').setAttribute('aria-label', $('#sound').title); }
$('#sound').onclick = () => { muted = !muted; localStorage.setItem('okey-muted', String(muted)); updateSound(); if(muted){stopBubbles?.();tileClack?.stop()} else unlockAudio(); syncMusic(); sound(); }; updateSound();

function tileMarkup(tile, interactive = false) {
  const wild = tile.joker === true, v = tile;
  const label = wild ? 'Joker, frei einsetzbar' : `${colors[v.color]} ${v.number}`;
  return `<${interactive ? 'button' : 'span'} class="tile c${wild ? 0 : v.color}${wild ? ' joker' : ''}${tile.id === selected ? ' selected' : ''}${interactive && tile.id === newTileId ? ' newly-drawn' : ''}" ${interactive ? `data-tile="${esc(tile.id)}" draggable="false" aria-pressed="${tile.id === selected}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${interactive && tile.id === newTileId ? '<small class="new-tile-badge">NEU</small>' : ''}${wild ? '<img src="art.svg" alt="Comic-Brust als Joker"><span class="tile-tag">JOKER</span>' : `<span class="number">${v.number}</span><span class="pip">${['◆', '●', '▲', '♠'][v.color]}</span>`}</${interactive ? 'button' : 'span'}>`;
}
function send(type, data = {}) {
  if (socket?.readyState !== WebSocket.OPEN) return toast('Die Verbindung wird gerade wiederhergestellt.');
  socket.send(JSON.stringify({ type, ...data }));
}
function currentTeamMessage() {
  const message = room?.teamMessage;
  return message && message.expiresAt > Date.now() + serverOffset ? message : null;
}
function showTeamMessage(message) {
  const question = TEAM_QUESTIONS[message.question];
  const incoming = message.to === user.id;
  const partner = room.players.find(p => p.id === (incoming ? message.from : message.to));
  const answers = incoming && !message.answer
    ? `<div class="team-choices">${Object.entries(question.answers).map(([key, label]) => `<button class="button primary" data-team-answer="${key}" data-message-id="${esc(message.id)}">${esc(label)}</button>`).join('')}</div>`
    : `<p class="team-reply">${message.answer ? esc(question.answers[message.answer]) : 'Warte auf die Antwort …'}</p><button class="button secondary" data-action="dismiss-message">Weiter spielen</button>`;
  modal(`<p class="eyebrow">NUR FÜR EUER TEAM</p><p>${incoming ? 'Von' : 'An'} ${esc(partner?.name)}</p><h2>${esc(question.text)}</h2>${answers}`);
  $('#modal-content').dataset.view = 'team';
  $('#modal-content').dataset.messageId = message.id;
}
function syncTeamMessage() {
  const message = currentTeamMessage(), content = $('#modal-content');
  clearTimeout(teamMessageTimer);
  if (!message) {
    lastTeamVersion = '';
    if (content.dataset.view === 'team' && (content.dataset.messageId || room?.status !== 'playing' || me()?.out)) $('#modal').close();
    return;
  }
  const version = `${message.id}:${message.answer || 'pending'}`;
  if (version !== lastTeamVersion) { lastTeamVersion = version; showTeamMessage(message); }
  teamMessageTimer = setTimeout(() => {
    if (content.dataset.view === 'team' && content.dataset.messageId === message.id) $('#modal').close();
  }, Math.max(0, message.expiresAt - Date.now() - serverOffset));
}
function teamMenu(partner) {
  if (room.status !== 'playing' || me()?.out || partner.out) return toast('Teamfragen sind nur in einer laufenden Teamrunde möglich.');
  const message = currentTeamMessage();
  if (message && !message.answer) { showTeamMessage(message); return; }
  modal(`<h2>Was möchtest du ${esc(partner.name)} mitteilen?</h2><p>Nur dein Teampartner sieht diese Frage.</p><div class="team-choices">${Object.entries(TEAM_QUESTIONS).map(([key, question]) => `<button class="button primary" data-team-question="${key}">${esc(question.text)}</button>`).join('')}</div><button class="button secondary" data-team-target="${esc(partner.id)}">Geste an ${esc(partner.name)} richten</button>`);
  $('#modal-content').dataset.view = 'team';
}
async function post(path, data = {}) {
  const response = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) { const error = Error(result.error); error.status = response.status; throw error; } return result;
}
async function connect() {
  clearTimeout(reconnectTimer);
  try {
    config ||= await (await fetch(apiUrl('/api/config'))).json();
    if (!token) {
      if (!config.dev && !config.guestAccess && !telegram?.initData) throw Error('Öffne dieses Spiel über den Telegram-Bot.');
      let guestName = '';
      if (!telegram?.initData && !config.dev) guestName = await new Promise(resolve => { modal('<h2>Willkommen am Tisch!</h2><form id=guest-form><label for=guest-name>Wie heisst du?</label><input id=guest-name maxlength=24 required autocomplete=nickname><button class=button type=submit>Hajde bojrum →</button></form>'); $('#guest-form').onsubmit = e => { e.preventDefault(); const name = $('#guest-name').value.trim(); if(name){ $('#modal').close(); resolve(name); } }; });
      const login = await post('/api/login', { initData: telegram?.initData || '', name: guestName || new URLSearchParams(location.search).get('name') || 'Gast' });
      token = login.token; user = login.user; sessionStorage.setItem('okey-token', token);
    }
    const ticket = await post('/api/ticket'); user = ticket.user;
    const socketUrl = new URL('socket', appBase); socketUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; socketUrl.searchParams.set('ticket', ticket.ticket);
    socket = new WebSocket(socketUrl);
    socket.onmessage = e => {
      const message = JSON.parse(e.data);
      if (message.type === 'seat-options') { showSeatChoices(message); return; }
      if (message.type === 'error') {
        if (message.code === 'invalid_claim') {
          sound('sad-trombone');
          modal('<div class="invalid-claim"><span aria-hidden="true">😵‍💫</span><h2>A budall ie a</h2><p>Deine Steine bilden noch keine vollständige Gewinnhand.</p><button class="button primary" data-action="dismiss-message">Weiter spielen</button></div>');
          telegram?.HapticFeedback?.notificationOccurred('error');
        } else toast(message.message);
        return;
      }
      if (message.type === 'ready') { connected = true; user = message.user; $('#connection').textContent = config.dev ? 'LOKAL AM TISCH' : 'AM TISCH'; }
      if (message.type === 'ready' || message.type === 'state') {
        const next = message.room;
        if (next?.code !== roomCode) { roomCode = next?.code; lastEvent = next?.events.at(-1)?.seq || 0; order = []; selected = null; target = null; clearSmoke(); $('#ambient-smoke').replaceChildren(); }
        if (next?.round !== room?.round) { order = []; selected = null; $('#rack').classList.remove('thrown'); }
        markDraw(next);
        room = next;
        if (room && $('#modal-content').dataset.view === 'seat-choice') $('#modal').close();
        if (room) serverOffset = room.serverNow - Date.now();
        render(); syncTeamMessage();
        if (room) for (const event of room.events) if (event.seq > lastEvent) { lastEvent = event.seq; if (Date.now() + serverOffset - event.at < 4500) showEvent(event); }
        if (message.type === 'ready') {
          const start = telegram?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || user.startParam || '';
          const code = new URLSearchParams(location.search).get('room') || (/^room_([A-Fa-f0-9]{6})$/.exec(start)?.[1]);
          if (code && !room) send('join', { code });
          else if (code && room.code !== code.toUpperCase()) toast('Du sitzt noch an einem anderen Tisch. Verlasse ihn über „Mehr“ und öffne danach die Einladung erneut.');
        }
      }
    };
    socket.onclose = e => {
      connected = false; $('#connection').textContent = 'VERBINDUNG WEG'; render();
      if (e.code === 4001) { toast('Dieser Tisch ist in einem anderen Fenster geöffnet.'); return; }
      reconnectTimer = setTimeout(connect, 1800);
    };
    socket.onerror = () => socket.close();
  } catch (error) {
    connected = false; $('#connection').textContent = 'NICHT VERBUNDEN';
    if (error.status === 401 && token) { token = ''; sessionStorage.removeItem('okey-token'); reconnectTimer = setTimeout(connect, 500); }
    else { toast(error.message); if (error instanceof TypeError) reconnectTimer = setTimeout(connect, 3000); }
  }
}

function discardMarkup(index, owner='') {
  const last=room?.lastDiscards?.[index];
  return last ? `<span class="last-discard${last.taken?' taken':''}" title="${esc(owner)}: letzter Abwurf${last.taken?' (bereits genommen)':''}">${tileMarkup(last.tile)}${last.taken?'<small aria-label="Bereits genommen">↗</small>':''}</span>` : '<span class="no-discard" title="Noch kein Abwurf">–</span>';
}
function renderSeats() {
  const mine = room?.players.findIndex(p => p.id === user?.id) ?? 0;
  // Play runs counterclockwise: bottom -> right -> top -> left.
  for (const [position, offset] of [['right', 1], ['top', 2], ['left', 3]]) {
    const seatIndex = (Math.max(0, mine) + offset) % 4;
    const p = room?.players[seatIndex];
    const seat = $(`#seat-${position}`);
    seat.hidden = !room;
    seat.className = `seat seat-${position}${p?.out ? ' out' : ''}${room?.players[room.turn]?.id === p?.id && room?.status === 'playing' ? ' active' : ''}${target && p?.id === target ? ' target' : ''}`;
    seat.innerHTML = p ? `<div class="player-info"><button class="avatar-button" data-target="${esc(p.id || '')}" title="${esc(p.name)}${room?.mode === 'teams' && offset === 2 && !p.bot ? ' eine Teamfrage stellen' : ' als Ziel für Gesten wählen'}" ${p.preview ? 'disabled' : ''}>${faces[offset]}</button><div class="seat-name">${esc(p.name)}</div><div class="seat-status">${p.out ? 'BRETT WEG. EHRE AUCH.' : p.preview ? 'COMPUTERGEGNER' : `${p.bot ? 'BOT · ' : !p.connected ? 'OFFLINE · ' : ''}${p.count} STEINE${p.wins ? ` · ${p.wins} SIEGE` : ''}`}</div></div><div class="seat-discard" aria-label="Letzter Abwurf von ${esc(p.name)}">${room?.round ? discardMarkup(seatIndex,p.name) : ''}</div>` : '<div class="avatar-button">＋</div><div class="seat-name">Platz frei</div><div class="seat-status">FREUNDE WILLKOMMEN</div>';
  }
}
function renderCenter() {
  if (!room) {
    $('#center').innerHTML = '<p class="welcome-title">Na, traust du dich?</p><p class="welcome-sub">Der Çay ist heiss.<br>Deine Gegner auch ein bisschen.</p><div class="welcome-buttons"><button class="button primary" data-action="solo">Alleine mit Computern ↗</button><button class="button secondary" data-action="create">Mit Freunden</button></div><div class="center-links"><button class="text-button" data-action="join-dialog">Tischcode eingeben →</button></div>';
    return;
  }
  if (room.status === 'lobby') {
    $('#center').innerHTML = `<div class="lobby-intro"><p class="welcome-title">${esc(tableName(room.code))}</p>${room.owner === user.id ? '<button class="button primary" data-action="settings">5 oder 7 Runden wählen →</button>' : ''}<p>Du bist dabei, ${esc(user.name)}!</p></div><div class="lobby-teams">${teamChoiceMarkup()}</div><div class="welcome-buttons lobby-actions"><button class="button secondary" data-action="invite">Freunde einladen ↗</button><span class="match-settings-summary">${room.roundLimitChosen ? `${room.roundLimit} Runden` : 'Rundenzahl noch wählen'} · ${room.mode === 'teams' ? 'Teams: gegenüberliegende Plätze' : 'Jeder gegen jeden'}</span></div>`;
    return;
  }
  if (room.status === 'finished') {
    const result = room.result;
    const score=room.scores.at(-1),names=score?.names||room.players.map(p=>p.name);
    const finalNames=room.matchComplete&&room.matchWinners.length===1?names.filter((_,seat)=>room.mode==='teams'?seat%2===room.matchWinners[0]:seat===room.matchWinners[0]).join(' & '):'';
    const title=room.matchComplete?matchTitle():result.winner?`${esc(result.name)} hat gewonnen.`:'Alle Steine weg.';
    const team=!room.matchComplete&&result.winner&&room.mode==='teams'?`Team ${score?.winner===0?'A':'B'}`:'';
    const detail=room.matchComplete?(result.winner?`Letzte Runde gewonnen: ${result.name}${result.joker?' · Joker-Abschluss':''}.`:'Letzte Runde: Vorrat leer.'):result.joker?'E mshele me Joker. Bravo i ke gjek.':result.kind==='pairs'?'Sieben Paare. Doppelt frech.':result.kind==='stock'?'Vorrat leer. Restpunkte zählen für alle.':'';
    const celebrate=room.matchComplete?room.matchWinners.length===1:Boolean(result.winner);
    $('#center').innerHTML = `<p class="result-title">${title}</p>${finalNames||team?`<p class="result-winners">${esc(finalNames||team)}</p>`:''}${celebrate?`<p class="result-quip">${esc(victoryLine())}</p>`:''}${detail?`<p class="result-copy">${esc(detail)}</p>`:''}<div class="welcome-buttons">${room.owner === user.id ? room.matchComplete ? '<button class="button primary" data-action="new-match">Neue Partie ↻</button>' : '<button class="button primary" data-action="start">Nächste Runde →</button>' : '<span class="welcome-sub">Warte auf den Gastgeber.</span>'}<button class="button secondary" data-action="scores">Punktestand</button>${room.revealed ? '<button class="button secondary" data-action="reveal">Gewinnhand</button>' : ''}</div>`;
    $('#center').insertAdjacentHTML('beforeend', `<div class="result-fun"><button class="button secondary" data-action="tea-bill">☕ Çay-Rechnung</button>${canMakeExcuse(room, room.players.findIndex(p => p.id === user.id)) ? '<button class="button secondary" data-gesture="excuse">🙄 Ausrede finden</button>' : ''}</div><p class="tea-caption">${esc(teaBill(room)?.caption || '')}</p>`);
    return;
  }
  const mine=room.players.findIndex(p=>p.id===user.id);
  const canDraw = myTurn() && room.phase === 'draw';
  $('#center').innerHTML = `<div class="piles">
    <div class="pile-unit"><button class="pile-button" data-action="draw-discard" ${canDraw && room.availableDiscard ? '' : 'disabled'} title="Letzten abgeworfenen Stein nehmen">${room.availableDiscard ? tileMarkup(room.availableDiscard) : '<span class="empty-tile">·</span>'}</button><span>NEHMEN</span></div>
    <div class="pile-unit"><button class="pile-button" data-action="draw-stock" ${canDraw ? '' : 'disabled'} title="Verdeckten Stein ziehen"><span class="tile-back">g.</span></button><span>${room.stockCount} STEINE</span></div>
    <div class="pile-unit own-discard">${discardMarkup(mine,'Du')}<span>DEIN ABWURF</span></div>
  </div>`;
}
function renderRack() {
  const hand = room ? room.hand : demoHand;
  order = order.filter(id => hand.some(t => t.id === id));
  for (const tile of hand) if (!order.includes(tile.id)) order.push(tile.id);
  if (!hand.some(t => t.id === selected)) selected = null;
  const sorted = order.map(id => hand.find(t => t.id === id));
  freeRack.context(`${room?.code || 'demo'}:${room?.matchNumber || 1}:${room?.round || 0}`);
  freeRack.render(sorted, Boolean(room?.round));
  if (room?.status !== 'playing' || !me()?.out) $('#rack').classList.remove('thrown');
  $('#sort').disabled = !hand.length; $('#sort-combinations').disabled = !hand.length;
  renderActions();
}
function renderActions() {
  const canDiscard = myTurn() && room.phase === 'discard' && Boolean(selected);
  $('#discard').disabled = !canDiscard; $('#claim').disabled = !canDiscard;
  $('#throw').disabled = !connected || room?.status !== 'playing' || me()?.out;
  $('#fun-button').disabled = !connected || !room;
  $('#leave').hidden = !room;
  $('#selection-hint').textContent = selected ? 'Ausgewählt · Abwerfen oder mit „Mshile“ die Runde beenden' : room?.status === 'playing' ? 'Passende Steine verbinden sich · einzeln lösen: antippen, dann ziehen' : 'Steine antippen · zum Sortieren ziehen oder Pfeiltasten nutzen';
  for (const button of document.querySelectorAll('[data-gesture]')) button.disabled = !connected || !room;
  $('[data-gesture=besa]').disabled = !connected || room?.status !== 'playing' || me()?.out;
  renderBluff();
  renderShisha();
}
function renderShisha() {
  const seconds = Math.max(0, Math.ceil(((room?.shishaReadyAt || 0) - Date.now() - serverOffset) / 1000));
  const active = connected && room?.status === 'playing' && !me()?.out;
  $('#shisha').disabled = !active || seconds > 0;
  const hint = !room || room.status !== 'playing' ? 'Drei Sekunden Rauch für den ganzen Tisch.' : me()?.out ? 'Du schaust zu. Die Shisha wartet auf die nächste Runde.' : seconds ? `Erst wieder klare Sicht … noch ${seconds}s.` : 'Einmal kräftig ziehen. Alle sitzen drei Sekunden im Nebel.';
  $('#shisha-hint').textContent = hint; $('#shisha').title = hint;
}
function renderBluff() {
  const seconds = Math.max(0, Math.ceil(((room?.bluffReadyAt || 0) - Date.now() - serverOffset) / 1000));
  const eligible = connected && room?.canBluff;
  $('#bluff').disabled = !eligible || seconds > 0;
  const hint = !room || room.status !== 'playing' ? 'Mit Joker: eine Ansage an den ganzen Tisch.'
    : me()?.out ? 'Du schaust zu. Bluffen geht erst wieder nächste Runde.'
    : !room.canBluff ? 'Dafür brauchst du einen Joker auf deinem Brett.'
    : seconds > 0 ? `Kurz durchatmen … noch ${seconds}s.` : 'Zeig allen: Ich habe einen Joker!';
  $('#bluff-hint').textContent = hint; $('#bluff').title = hint;
}
function render() {
  document.body.classList.toggle('in-game', Boolean(room));
  document.body.classList.toggle('in-lobby', room?.status === 'lobby');
  document.body.dataset.stage = room?.status || 'welcome';
  renderSeats(); renderCenter(); renderRack(); syncMusic();
  $('#room-tag').innerHTML = room ? `<strong class="table-name">${esc(tableName(room.code))}</strong><div>CODE ${room.code} <span>•</span> RUNDE ${room.round || '–'} / ${room.roundLimit}</div>` : 'Gjurzi · FESTE JOKER <span>•</span> 4 PLÄTZE';
  $('#round-pill').textContent = !room ? 'DEIN LIEBLINGSTISCH IST FREI.' : room.status === 'lobby' ? room.owner === user.id ? 'FREIE PLÄTZE ÜBERNEHMEN COMPUTER.' : 'DER GASTGEBER STARTET DIE RUNDE.' : room.status === 'finished' ? 'DIE NÄCHSTE RUNDE WIRD PERSÖNLICH.' : me()?.out ? 'DU SCHAUST ZU. DIE ANDEREN SPIELEN WEITER.' : myTurn() ? room.phase === 'draw' ? 'DU BIST DRAN · ZIEH EINEN STEIN.' : 'DU BIST DRAN · WIRF EINEN STEIN AB.' : `${room.players[room.turn]?.name.toUpperCase()} IST DRAN.`;
  $('#player-label').innerHTML = `<span class="small-dot"></span> ${room ? `${esc(user.name === 'Du' ? 'DEIN BRETT' : user.name.toUpperCase())} · ${room.hand.length}` : 'DEIN BRETT'}`;
  $('#target-label').textContent = target && room?.players.some(p => p.id === target) ? `An ${room.players.find(p => p.id === target).name} · Avatar zum Abwählen` : 'An den ganzen Tisch';
  renderClock();
  $('#scores-button').disabled = !room;
  if ($('#modal').open && $('#modal-content').dataset.view === 'scores') showScores();
}
function renderClock() {
  renderBluff();
  renderShisha();
  if (room?.status === 'playing') {
    const seconds = Math.max(0, Math.ceil((room.deadline - Date.now() - serverOffset) / 1000));
    $('#turn-label').innerHTML = myTurn() ? `Du bist dran · ${room.phase === 'draw' ? 'Ziehen' : 'Abwerfen'} · <span class="timer">${seconds}s</span>` : me()?.out ? 'Brett weg. Trotzdem dabei.' : `${esc(room.players[room.turn]?.name)} · ${seconds}s`;
  } else $('#turn-label').textContent = 'Ein bisschen Glück. Ein bisschen Frechheit.';
}
setInterval(renderClock, 500);

function clearSmoke() { clearTimeout(smokeTimer); $('#smoke-screen').hidden = true; }
function showPuff(event) {
  if (!room || room.status !== 'playing' || document.hidden) return;
  const mine = room.players.findIndex(p => p.id === user.id), actor = room.players.findIndex(p => p.id === event.player);
  if (actor < 0 || mine < 0) return;
  if (event.type === 'puff' && Date.now()+serverOffset-event.at < 650) sound('puff');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const seat = ['self', 'right', 'top', 'left'][(actor - mine + 4) % 4];
  const puff = document.createElement('div'); puff.className = `small-puff puff-${seat}`;
  puff.innerHTML = '<span class="puff-pipe">〰</span><img class="puff-hookah" src="shisha.svg" alt=""><i></i><i></i><i></i>';
  $('#ambient-smoke').append(puff); setTimeout(() => puff.remove(), 2400);
}
function showSmoke(event) {
  const age = Math.max(0, Date.now() + serverOffset - event.at), duration = event.duration || 3000;
  if (age >= duration) return;
  clearSmoke(); showPuff(event); if(age < 650) sound('shisha');
  $('#smoke-who').textContent = `${event.name} ${event.name === 'Du' ? 'nimmst' : 'nimmt'} einen festen Zug.`;
  $('#smoke-screen').hidden = false;
  // Late packets join the same animation moment instead of adding extra smoke time.
  for (const animation of $('#smoke-screen').getAnimations({ subtree: true })) animation.currentTime = age;
  smokeTimer = setTimeout(clearSmoke, duration - age);
}

function showEvent(event) {
  if (event.type === 'thinker') { toast(`⌛ ${event.name}: Planst du deinen Zug oder deine Pension?`); return; }
  if (event.type === 'seat-taken') { toast(`${event.name} übernimmt den Platz von ${event.previousName}.`); return; }
  if (event.type === 'puff') { showPuff(event); return; }
  if (event.type === 'smoke') { showSmoke(event); return; }
  if (event.type === 'discard') { sound('tile'); return; }
  if (event.type === 'start') { sound(); return; }
  if (event.type === 'timeout') { toast(`${event.name}: Zeit um. Der Zug wurde automatisch gespielt.`); return; }
  if (event.type === 'finish') { sound('win'); if(event.joker) celebrateJoker(event); return; }
  if (!['gesture', 'throw', 'bluff'].includes(event.type)) return;
  if (event.player === user.id && !matchMedia('(max-width: 1000px), (max-height: 540px)').matches) $('#center').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  clearTimeout(eventTimer);
  if (event.type === 'throw') {
    sound('throw');
    if (event.player === user.id) $('#rack').classList.add('thrown');
    $('#table-event').innerHTML = `<div class="flying-board">${'<i></i>'.repeat(5)}</div><div class="event-card"><span class="event-emoji">🤬</span><span class="event-copy">${esc(event.name)} ${event.name === 'Du' ? 'wirfst' : 'wirft'} das Brett.<br>Runde aufgegeben. Würde auch.</span></div>`;
  } else if (event.type === 'bluff') {
    sound('gesture');
    $('#table-event').innerHTML = `<div class="event-card joker-bluff"><span class="bluff-kicker">JOKER-BLUFF</span><span class="bluff-star left" aria-hidden="true">✦</span><img class="bluff-chest" src="bluff.svg" alt="Eine leicht behaarte Comic-Männerbrust wackelt"><span class="bluff-star right" aria-hidden="true">✦</span><span class="event-copy">${esc(event.name)} ${event.name === 'Du' ? 'zeigst' : 'zeigt'} Brust.</span><strong class="bluff-claim">„Ich hab einen Joker!“</strong></div>`;
  } else {
    sound(event.gesture === 'fart' ? 'juice' : 'gesture');
    if (event.gesture === 'besa' || event.gesture === 'excuse') {
      const besa = event.gesture === 'besa';
      $('#table-event').innerHTML = `<div class="event-card fun-announcement"><span class="event-emoji" aria-hidden="true">${besa ? '🤞' : '🙄'}</span><strong>${esc(event.name)}${besa ? ' gibt Besa' : ' hat eine Ausrede'}</strong><span class="event-copy">${besa ? 'Besa, ich habe keinen Joker!' : esc(event.line)}</span></div>`;
      eventTimer = setTimeout(() => $('#table-event').replaceChildren(), 4500);
      return;
    }
    if (event.gesture === 'fart') {
      $('#table-event').innerHTML = `<div class="event-card juice"><span class="event-emoji">${juiceArt}</span><strong>Ein Glas Apfelsaft</strong><span class="event-copy">Ramiz bringt euch einen Apfelsaft mit Ingwershot vom Rewe Karaxha</span></div>`;
      telegram?.HapticFeedback?.impactOccurred('light');
      eventTimer = setTimeout(() => { $('#table-event').replaceChildren(); }, 4500);
      return;
    }
    if (event.gesture === 'buj') {
      $('#table-event').innerHTML = `<div class="event-card buj-mode"><span class="event-emoji" aria-hidden="true">🌚</span><strong>Buj Modus</strong><span class="event-copy">Ihr sind alles Opfer und chömed i dhölll</span><small>${esc(event.name)}</small></div>`;
      eventTimer = setTimeout(() => { $('#table-event').replaceChildren(); }, 4500);
      return;
    }
    const recipient = event.target ? room.players.find(p => p.id === event.target)?.name : null;
    const copy = event.name === 'Du' ? { finger: 'sendest liebe Grüsse', buj: 'Ihr sind alles Opfer und chömed i dhölll', tea: 'gibst einen Çay aus' }[event.gesture] : gestureCopy[event.gesture];
    $('#table-event').innerHTML = `<div class="event-card ${event.gesture}"><span class="event-emoji">${gestureArt[event.gesture]}</span><span class="event-copy">${esc(event.name)} ${copy}${recipient ? `<br>Für ${esc(recipient)}.` : '.'}</span></div>`;
  }
  telegram?.HapticFeedback?.impactOccurred('light');
  eventTimer = setTimeout(() => { $('#table-event').innerHTML = ''; }, event.type === 'bluff' ? 3800 : event.type === 'throw' ? 3300 : 2500);
}

function showTeaBill() {
  const bill = teaBill(room); if (!bill) return;
  modal(`<div class="tea-bill"><span class="tea-bill-icon" aria-hidden="true">☕</span><h2>Die Çay-Rechnung</h2><p>${esc(bill.scope)}</p>${bill.payers.map(payer => `<section><strong>${esc(payer.label)}</strong>${room.mode === 'teams' ? `<p>${payer.names.map(esc).join(' &amp; ')}</p>` : ''}<p>${payer.points} Strafpunkte</p></section>`).join('')}<p><strong>${esc(bill.caption)}</strong></p><p>Zu zahlen: ${bill.payers.length ? 'eine Runde Çay für den Tisch.' : 'ein freundliches Dankeschön.'}</p><button class="button primary" data-action="dismiss-message">Geht klar ☕</button></div>`);
}

function showWinningHand(){
  const solved=winningGroups(room.revealed || []);
  const labels={run:'Reihe',set:'Gruppe',pair:'Paar'};
  const groups=solved?.groups.map((g,i)=>`<section class="winning-group"><h3>${labels[g.type]} ${i+1}</h3><div class="winning-tiles">${g.tiles.map(e=>`<div class="winning-tile">${tileMarkup(e.tile)}${e.wild?`<small>als ${colors[e.as.color]} ${e.as.number}</small>`:''}</div>`).join('')}</div></section>`).join('');
  modal(`<h2>Die Gewinnerhand.</h2><p>${esc(room.result.name)} · ${solved?.kind==='pairs'?'Sieben identische Paare':'Reihen und Gruppen'}</p><div class="winning-groups">${groups || '<p>Diese Hand lässt sich nicht als Gewinnhand gruppieren.</p>'}</div>`);
}

async function invite() {
  const link = config.botUsername && telegram?.initData ? `https://t.me/${config.botUsername}?startapp=room_${room.code}` : `${appBase.href}?room=${room.code}`;
  try { await navigator.clipboard.writeText(link); toast(`${tableName(room.code)}: Einladung kopiert. Tischcode: ${room.code}`); }
  catch { modal(`<h2>${esc(tableName(room.code))}</h2><p>Teile diesen Link oder den Tischcode <strong>${room.code}</strong>.</p><input readonly aria-label="Einladungslink" value="${esc(link)}">`); $('#modal input').select(); }
}
function showSeatChoices(choice) {
  const available = choice.players.filter(p => p.available);
  modal(`<h2>Such dir einen Platz aus.</h2><p>${esc(tableName(choice.code))} · Runde ${choice.round || '–'} / ${choice.roundLimit}</p><p>${available.length ? esc(choice.message) : 'Im Moment ist kein Computerplatz frei.'}</p><div class="seat-choices">${available.map(p => {
    const partner = choice.players[(p.seat + 2) % 4];
    return `<button class="button secondary" data-bot-seat="${esc(p.id)}" data-room-code="${esc(choice.code)}"><strong>${esc(p.name)} ersetzen</strong><span>${choice.mode === 'teams' ? `Team ${p.team === 0 ? 'A' : 'B'} · Gegenüber: ${esc(partner?.name)}` : `Platz ${p.seat + 1} · Jeder gegen jeden`}</span></button>`;
  }).join('')}</div><p>Du übernimmst die Steine und den bisherigen Punktestand dieses Platzes.</p><div class="seat-choice-actions"><button class="button secondary" data-refresh-seats="${esc(choice.code)}">Plätze aktualisieren</button><button class="button secondary" data-action="dismiss-message">Zurück</button></div>`);
  $('#modal-content').dataset.view = 'seat-choice';
}
document.addEventListener('click', e => {
  const botSeat = e.target.closest('[data-bot-seat]');
  if (botSeat) { send('join', { code: botSeat.dataset.roomCode, botId: botSeat.dataset.botSeat }); return; }
  const refreshSeats = e.target.closest('[data-refresh-seats]');
  if (refreshSeats) { send('join', { code: refreshSeats.dataset.refreshSeats }); return; }
  const question = e.target.closest('[data-team-question]');
  if (question) { send('team-ask', { question: question.dataset.teamQuestion }); $('#modal').close(); return; }
  const answer = e.target.closest('[data-team-answer]');
  if (answer) { send('team-answer', { messageId: answer.dataset.messageId, answer: answer.dataset.teamAnswer }); $('#modal').close(); return; }
  const teammate = e.target.closest('[data-team-target]');
  if (teammate) { target = teammate.dataset.teamTarget; $('#modal').close(); render(); return; }
  if (e.target.closest('[data-action=tea-bill]')) { showTeaBill(); return; }
  const gesture = e.target.closest('[data-gesture]'); if (gesture) { $('#fun-dialog').close(); $('#tools-dialog').close(); sound('tile'); send('gesture', { gesture: gesture.dataset.gesture, target: ['fart', 'besa', 'excuse'].includes(gesture.dataset.gesture) ? null : target }); return; }
  const player = e.target.closest('[data-target]'); if (player?.dataset.target) {
    const other = room?.players.find(p => p.id === player.dataset.target);
    if (room?.mode === 'teams' && other && other.team === me()?.team && !other.bot) { teamMenu(other); return; }
    target = target === player.dataset.target ? null : player.dataset.target; render(); return; }
  const team = e.target.closest('[data-team-choice]'); if(team){send('choose-team',{team:Number(team.dataset.teamChoice)});return;}
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'dismiss-message') { $('#modal').close(); return; }
  if (action === 'solo' || action === 'create') setupTable(action === 'solo');
  else if (action === 'start') send('start');
  else if (action === 'settings') setupTable(false, true);
  else if (action === 'new-match') send('new-match');
  else if (action === 'scores') showScores();
  else if (action === 'draw-stock') send('draw', { source: 'stock' });
  else if (action === 'draw-discard') send('draw', { source: 'discard' });
  else if (action === 'invite') invite();
  else if (action === 'join-dialog') {
    modal('<p class="eyebrow">DEIN PLATZ WARTET SCHON</p><h2>Ab an den Tisch.</h2><form id="join-form"><label for="join-code">Tischcode von deinen Freunden</label><input id="join-code" name="code" placeholder="A1B2C3" maxlength="6" pattern="[a-fA-F0-9]{6}" required autocomplete="off"><button class="button primary" type="submit">Dazusetzen →</button></form>');
    $('#join-form').onsubmit = ev => { ev.preventDefault(); send('join', { code: $('#join-code').value.trim() }); $('#modal').close(); }; $('#join-code').focus();
  } else if (action === 'reveal') showWinningHand();
});
$('#rack').addEventListener('click', e => { const tile = e.target.closest('[data-tile]'); if (!tile || Date.now() < suppressClickUntil) return; selected = selected === tile.dataset.tile ? null : tile.dataset.tile; renderRack(); });
$('#discard').onclick = () => { send('discard', { tileId: selected }); };
$('#claim').onclick = () => { send('discard', { tileId: selected, claim: true }); };
$('#bluff').onclick = () => { send('bluff'); $('#tools-dialog').close(); };
$('#shisha').onclick = () => { send('shisha'); $('#tools-dialog').close(); };
$('#sort').onclick = () => {
  const hand = room?.hand || demoHand;
  order = [...hand].sort((a, b) => {
    return Number(Boolean(a.joker))-Number(Boolean(b.joker)) || (a.color||0)-(b.color||0) || (a.number||0)-(b.number||0);
  }).map(t => t.id); freeRack.reset(); renderRack();
};
$('#throw').onclick = () => {
  $('#fun-dialog').close();
  modal('<p class="eyebrow">DAS IST EINE ANSAGE.</p><h2>Fuge drasen?</h2><p>Du gibst diese Runde auf. Alle sehen dein Brett fliegen und spielen weiter. Du bleibst zum Zuschauen und Gestikulieren am Tisch.</p><button id="confirm-throw" class="button primary">Fuge drasen ↗</button><button id="keep-board" class="button secondary">Ich reiss mich zusammen</button>');
  $('#confirm-throw').onclick = () => { send('surrender'); $('#modal').close(); };
  $('#keep-board').onclick = () => $('#modal').close();
};
$('#leave').onclick = () => {
  $('#tools-dialog').close();
  if (room?.status !== 'playing' || me()?.out) { send('leave'); return; }
  modal('<h2>Schon Feierabend?</h2><p>Beim Verlassen gibst du diese Runde auf. Die anderen spielen weiter.</p><button id="confirm-leave" class="button primary">Tisch verlassen</button>');
  $('#confirm-leave').onclick = () => { send('leave'); $('#modal').close(); };
};
$('#rules').onclick = () => modal(`<p class="eyebrow">FESTE JOKER. EXTRA FRECHHEIT.</p><h2>So läuft die Runde.</h2><ul><li>Du hältst 14 Steine. Wer beginnt, hat 15 und wirft zuerst ab. Danach immer einen Stein ziehen und einen abwerfen.</li><li>Gewinne mit Reihen derselben Farbe (z. B. 3–4–5), Gruppen derselben Zahl in verschiedenen Farben oder sieben identischen Paaren. 12–13–1 ist erlaubt, 13–1–2 nicht.</li><li>Die zwei Steine mit Brustmotiv sind immer Joker und ersetzen beliebige Steine. Alle Zahlensteine behalten ihren aufgedruckten Wert. Es gibt keinen Anzeiger.</li><li>Neben jedem Gegner siehst du seinen letzten Abwurf, deinen eigenen in der Mitte. Ein ↗ bedeutet: Dieser Abwurf wurde bereits genommen. Aufnehmen kannst du nur den aktuell angebotenen Stein unter „NEHMEN“.</li><li>Wähle deinen letzten Abwurf und drücke <strong>Mshile</strong>. Der Server prüft deine übrigen 14 Steine.</li><li>Steine auf dem Holzbrett ziehen: Beim Ablegen rasten sie ohne Überlappung auf den beiden Leisten ein. Passende Reihen, Gruppen und Paare verbinden sich magnetisch und werden grün markiert. Eine verbundene Kombination kannst du gemeinsam ziehen. Zum Herauslösen einen einzelnen Stein zuerst antippen und dann ziehen. Alternativ antippen und an einer freien Stelle ablegen; die Pfeiltasten bewegen den gewählten Stein.</li><li>Tippe auf deinen menschlichen Teampartner für die privaten Fragen „A ta msheli“ und „Si je?“. Gegner kannst du weiterhin als Ziel für Gesten auswählen.</li><li><strong>Besa:</strong> Über den Blitz bei den Aktionen kannst du behaupten: „Besa, ich habe keinen Joker!“ – ob es stimmt, weisst nur du. Nach einer Niederlage findest du beim Ergebnis eine Ausrede und die Çay-Rechnung. Die meisten Strafpunkte zahlen scherzhaft den Çay; bei Gleichstand wird geteilt.</li><li><strong>Joker-Bluff:</strong> Nur mit einem Joker auf deinem Brett. Alle sehen eine wackelnde Comic-Männerbrust und deine Ansage „Ich hab einen Joker!“. Deine Hand bleibt verdeckt; nach acht Sekunden kannst du wieder bluffen.</li><li><strong>Fester Zug:</strong> Alle sehen drei Sekunden lang Shisha-Rauch. Er löst sich von selbst auf. Die Pause gilt für den ganzen Tisch: ein grosser Zug alle 15 Sekunden. Kleine Züge passieren gelegentlich automatisch; Steine und Züge werden davon nicht verändert.</li><li>„Fuge drasen“ im Blitz-Menü gibt die Runde auf. Du hast 120 Sekunden pro Zug für Ziehen und Abwerfen zusammen. Danach wird automatisch gespielt. Wer zuletzt übrig bleibt, gewinnt.</li></ul><p>Vor der Partie wählt ihr 5 oder 7 Runden. Gegenüberliegende Plätze bilden im Teammodus Team A und B. Die beste Kombinationseinteilung wird automatisch ermittelt; übrige Zahlenwerte zählen als Strafpunkte. Einzelne Paare zählen nur in einer vollständigen Sieben-Paare-Hand. Das Gewinnerteam bekommt 0 Punkte; beim Joker als letztem Abwurf −10, die Gegner doppelte Restpunkte. Ein nicht verwendbarer Joker zählt 0. Ist der Vorrat leer, zählt jeder seine Restpunkte. Bei Gleichstand teilen sich die Teams den Sieg. Die niedrigste Summe gewinnt.</p>`);

render(); connect();

function markDraw(next) {
  const draw = next?.lastDraw, key = draw ? `${next.code}:${next.matchNumber}:${next.round}:${draw.id}:${draw.at}` : '';
  if (key === newTileKey) return;
  clearTimeout(newTileTimer); newTileKey = key; newTileId = null;
  const remaining = draw ? 4000 - (next.serverNow - draw.at) : 0;
  if (remaining <= 0 || !next.hand.some(t => t.id === draw.id)) return;
  newTileId = draw.id;
  newTileTimer = setTimeout(() => {
    newTileId = null;
    for (const el of document.querySelectorAll('.newly-drawn')) { el.classList.remove('newly-drawn'); el.querySelector('.new-tile-badge')?.remove(); }
  }, Math.min(4000, remaining));
}
function scoreLabel(index) { return room.mode === 'teams' ? `Team ${index === 0 ? 'A' : 'B'}` : room.players[index]?.name || `Platz ${index + 1}`; }
function matchTitle() { return room.matchWinners.length > 1 ? 'Shtahi gji de bojm? Ene nje?' : `U kry. Bravo. ${esc(scoreLabel(room.matchWinners[0]))} gewinnt.`; }
function showScores() {
  if (!room) return;
  const labels = room.totals.map((_, i) => scoreLabel(i));
  const members = room.mode === 'teams' ? `<p class="score-members">${[0,1].map(team => `<strong>Team ${team === 0 ? 'A' : 'B'}:</strong> ${room.players.filter(p => p.team === team).map(p => esc(p.name)).join(' &amp; ')}`).join('<br>')}</p>` : '';
  modal(`<h2>${room.matchComplete ? matchTitle() : 'Punktestand'}</h2>${members}<p>${room.scores.length} von ${room.roundLimit} Runden · Weniger Punkte gewinnt.</p><div class="score-scroll"><table class="score-table"><thead><tr><th>Runde</th>${labels.map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${Array.from({length:room.roundLimit},(_,i)=>{const row=room.scores[i];return `<tr><th>${i+1}${row?.joker?' ✦':''}</th>${labels.map((_,j)=>`<td>${row ? row.points[j] : '–'}</td>`).join('')}</tr>`}).join('')}</tbody><tfoot><tr><th>Total</th>${room.totals.map(n=>`<td>${n}</td>`).join('')}</tr></tfoot></table></div><p class="score-note">✦ Joker-Mshile: Gewinner −10, Gegner doppelt. Nicht verwendbarer Joker: 0 Punkte.</p>`);
  $('#modal-content').dataset.view = 'scores';
}
$('#scores-button').onclick = showScores;
function setupTable(solo, existing = false) {
  const selectedMode = existing ? room.mode : solo ? 'individual' : 'teams';
  modal(`<h2>${existing ? 'Eure Partie' : 'Neue Partie'}</h2><form id="match-form"><label for="match-mode">Spielweise</label><select id="match-mode"><option value="teams">Team A gegen Team B · gegenüber</option><option value="individual">Jeder gegen jeden</option></select><fieldset class="round-options"><legend>Wie viele Runden spielt ihr?</legend><label><input type="radio" name="rounds" value="5" required><span><strong>5</strong> Runden</span></label><label><input type="radio" name="rounds" value="7" required><span><strong>7</strong> Runden</span></label></fieldset><p>Die niedrigste Gesamtpunktzahl gewinnt. ${solo ? 'Du spielst mit drei Computern.' : 'Warte auf deine Kollegen. Freie Plätze übernehmen beim Start Computer.'}</p><button class="button primary" type="submit">${existing ? 'Runde starten' : solo ? 'Losspielen' : 'Tisch erstellen'}</button></form>`);
  $('#match-mode').value = selectedMode;
  if (existing && room.roundLimitChosen) $(`#match-form input[value="${room.roundLimit}"]`).checked = true;
  $('#match-form').onsubmit = event => {
    event.preventDefault();
    if (!$('#match-form').reportValidity()) return;
    const options = { mode: $('#match-mode').value, roundLimit: Number($('#match-form input[name=rounds]:checked').value) };
    if (existing) { send('configure', options); send('start'); } else send('create', { solo, ...options });
    $('#modal').close();
  };
}
$('#sort-combinations').onclick = () => {
  const result = bestCombinations(room?.hand || demoHand), groups = [...result.groups, ...result.rest.map(t => [t])];
  order = groups.flat().map(t => t.id); freeRack.reset(); renderRack(); freeRack.arrange(groups);
  toast(`${result.groups.length} Kombinationen · ${result.points} Restpunkte`);
};
function celebrateJoker(event) {
  const table = $('.table'), age = Math.max(0, Date.now() + serverOffset - event.at);
  if (age >= 2600) return;
  clearTimeout(jokerTimer); clearTimeout(eventTimer); table.classList.remove('joker-finale'); void table.offsetWidth; table.classList.add('joker-finale');
  $('#table-event').innerHTML = '<div class="joker-finale-banner" role="status"><strong>E mshele me Joker. Bravo i ke gjek.</strong><span>−10 · GEGNER DOPPELT</span></div>';
  for (const animation of table.getAnimations()) animation.currentTime = age;
  telegram?.HapticFeedback?.notificationOccurred('success');
  jokerTimer = setTimeout(() => { table.classList.remove('joker-finale'); $('#table-event').replaceChildren(); }, 2600-age);
}

function teamChoiceMarkup() {
  if(room.mode !== 'teams') return '';
  return `<div class="team-picker">${[0,1].map(team => `<section><strong>Team ${team ? 'B' : 'A'}</strong><p>${room.players.filter(p=>p.team===team&&!p.bot).map(p=>esc(p.name)).join(' &amp; ') || 'Noch frei'}</p><button class="button secondary" data-team-choice="${team}">${me()?.team===team?'✓ Dein Team':'Hier mitspielen'}</button></section>`).join('')}</div><p>Team wählen: links A, rechts B. Im Spiel sitzt dein Partner dir gegenüber.</p>`;
}
let tableKnocks = [];
$('.table').addEventListener('click', e => {
  if(e.target.closest('button,a,input,.seat')) return;
  const now=Date.now(); tableKnocks=tableKnocks.filter(t=>now-t<1600);tableKnocks.push(now);
  if(tableKnocks.length===3){tableKnocks=[];modal('<h2>E gjete një koqe!</h2><img src="egg.svg" alt="Zwei lustige Comic-Hoden" width="240" height="200"><button class="button primary" data-action="dismiss-message">Weiter spielen</button>');}
});
