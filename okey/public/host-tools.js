export function installHostTools({getRoom,getUser,now,send,post,modal,toast,esc}) {
  const panel=document.createElement('section');panel.id='host-tools';
  document.querySelector('#tools-content').append(panel);
  const pause=document.createElement('div');pause.className='host-pause-banner';pause.setAttribute('role','status');pause.hidden=true;document.body.append(pause);
  let signature='';
  const button=(action,text,target='',kind='secondary')=>`<button class="button ${kind}" data-host="${action}" data-player="${esc(target)}">${text}</button>`;
  function render() {
    const r=getRoom(),u=getUser();pause.hidden=!r?.paused;
    pause.textContent='Çay-Pause · Spiel und Zugtimer angehalten';
    const next=JSON.stringify([r?.code,r?.owner,r?.status,r?.locked,r?.paused,r?.reportsEnabled,r?.groupLinked,r?.socialReport,r?.awards,r?.players.map(p=>[p.id,p.name,p.bot,p.connected,p.gesturesMutedUntil])]);
    if(next===signature)return;signature=next;
    panel.hidden=!r;if(!r){panel.innerHTML='';return;}
    const expanded = new Set([...panel.querySelectorAll('details[open]')].map(el => el.dataset.section));
    const disclosure = (key, title, content) => `<details class="menu-section" data-section="${key}" ${expanded.has(key)?'open':''}><summary>${title}</summary><div class="menu-section-content">${content}</div></details>`;
    const host=r.owner===u?.id;
    const players=r.players.filter(p=>!p.bot&&p.id!==u.id).sort((a,b)=>Number(a.connected)-Number(b.connected));
    const offline=players.filter(p=>!p.connected).length;
    panel.innerHTML=`<p class="menu-status">${r.locked?'Tisch für neue Spieler gesperrt.':'Tisch offen für neue Spieler.'}</p>
      ${host?`<div class="host-grid menu-quick-actions">${r.status==='playing'?button(r.paused?'resume':'pause',r.paused?'Weiterspielen':'Çay-Pause'):''}${button(r.locked?'unlock':'lock',r.locked?'Tisch öffnen':'Tisch sperren')}</div>
      ${disclosure('players',`Mitspieler verwalten${offline?` · ${offline} offline`:''}`,`${offline?'<p class="host-note">Offline-Plätze sind für eine Rückkehr reserviert. Du kannst sie hier freigeben.</p>':''}<div class="host-player-list">${players.map(p=>`<div class="host-player" data-player-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><span class="host-player-status${p.connected?'':' is-offline'}">${p.connected?'Am Tisch':'Offline · Platz reserviert'}</span><div>${!p.connected?button('remove','Vom Tisch entfernen',p.id):''}${button(p.gesturesMutedUntil>now()?'unquiet':'quiet',p.gesturesMutedUntil>now()?'Gesten freigeben':'Gestenpause · 5 Min.',p.id)}${button('transfer','Host übergeben',p.id)}${p.connected?button('remove','Vom Tisch entfernen',p.id):''}</div></div>`).join('')||'<p>Noch keine menschlichen Mitspieler am Tisch.</p>'}</div>`)}
      ${disclosure('telegram','Telegram & Kollegen',`<div class="host-grid"><button class="button secondary" data-social="nudge">Wo blibsch?</button>${r.groupLinked?`<button class="button secondary" data-social="buj">Buj in die Gruppe</button><button class="button secondary" data-social="revanche">Zur Revanche rufen</button><button class="button secondary" data-social="poll">Spielabend-Abstimmung</button>`:''}</div>
      ${r.groupLinked?`<p class="host-note">Aufrufe gehen in eure Telegram-Gruppe. Erinnerungen: höchstens alle 5 Minuten pro Kollege.</p>${button(r.reportsEnabled?'reports-off':'reports-on',r.reportsEnabled?'Automatische Berichte: an':'Automatische Berichte: aus')}`:'<p class="host-note">Gruppenaufrufe gibt es an Tischen, die mit /nisja in Telegram eröffnet wurden.</p>'}`)}`:''}
      ${disclosure('awards','Titel & Spielbericht',`${r.awards?.length?`<ul class="host-awards">${r.awards.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>Nach den Runden gibt es hier eure Titel des Abends.</p>'}${r.socialReport?'<button class="button secondary" data-social="report">Partie-Bericht ansehen</button>':''}`)}`;
  }
  async function action(e) {
    const summary=e.target.closest('#host-tools summary');
    if(summary) {
      if(!summary.parentElement.open) requestAnimationFrame(()=>summary.scrollIntoView({block:'start',behavior:'instant'}));
      return;
    }
    const host=e.target.closest('[data-host]'),social=e.target.closest('[data-social]'),confirm=e.target.closest('[data-host-confirm]');
    if(confirm) {send('host',{action:confirm.dataset.hostConfirm,target:confirm.dataset.player});document.querySelector('#modal').close();return;}
    if(host) {
      const r=getRoom(),a=host.dataset.host,target=host.dataset.player;
      if(['remove','transfer'].includes(a)) {
        const p=r?.players.find(p=>p.id===target);if(!p)return;
        document.querySelector('#tools-dialog').close();
        modal(`<h2>${a==='remove'?'Vom Tisch entfernen?':'Host übergeben?'}</h2><p>${esc(p.name)}${a==='remove'?' kann dieser Partie danach nicht wieder beitreten. In einer begonnenen Partie übernimmt ein Bot den Platz samt Steinen und Punktestand.':' übernimmt die Tischverwaltung. Du spielst als normaler Mitspieler weiter.'}</p><div class="host-grid"><button class="button primary" data-host-confirm="${a}" data-player="${esc(target)}">${a==='remove'?'Entfernen bestätigen':'Host übergeben'}</button><button class="button secondary" data-action="dismiss-message">Abbrechen</button></div>`);
      } else send('host',{action:a,target});
      return;
    }
    if(!social)return;
    const a=social.dataset.social;
    try {
      if(a==='report') {
        document.querySelector('#tools-dialog').close();modal(`<h2>Der Spielbericht</h2><pre class="host-report">${esc(getRoom()?.socialReport||'Noch kein Bericht.')}</pre><button class="button primary" data-social="copy-report">Bericht kopieren</button>`);return;
      }
      if(a==='copy-report') {await navigator.clipboard.writeText(getRoom()?.socialReport||'');toast('Bericht kopiert.');return;}
      if(a==='nudge') {
        const view=await post('/api/social',{action:'view'});
        document.querySelector('#tools-dialog').close();
        modal(`<h2>Wo blibsch?</h2><p>${view.groupLinked?'Der Bot ruft deinen Kollegen in eurer Telegram-Gruppe an den Tisch.':'Der Bot schickt eine private Erinnerung. Dafür muss dein Kollege ihn mit /start geöffnet haben.'}</p><div class="host-contacts">${view.targets.map(p=>`<button class="button secondary" data-social="send-nudge" data-player="${esc(p.id)}" ${!view.groupLinked&&!p.privateReady?'disabled':''}>${esc(p.name)}${!view.groupLinked&&!p.privateReady?' · Bot noch nicht gestartet':''}</button>`).join('')||'<p>Noch keine Telegram-Kollegen bekannt. In der Gruppe /nisja verwenden und auf die Nachricht eines Kollegen mit /wo antworten, oder den Einladungslink teilen.</p>'}</div>`);return;
      }
      social.disabled=true;
      const result=await post('/api/social',{action:a==='send-nudge'?'nudge':a,target:social.dataset.player});toast(result.message);
    } catch(error) {toast(error.message||'Konnte nicht gesendet werden.');} finally {social.disabled=false;}
  }
  document.addEventListener('click',action);
  return render;
}
