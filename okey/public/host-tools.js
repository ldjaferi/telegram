export function installHostTools({getRoom,getUser,now,send,post,modal,toast,esc}) {
  const panel=document.createElement('section');panel.id='host-tools';
  document.querySelector('#tools-content').append(panel);
  const pause=document.createElement('div');pause.className='host-pause-banner';pause.setAttribute('role','status');pause.hidden=true;document.body.append(pause);
  let signature='';
  const button=(action,text,target='',kind='secondary')=>`<button class="button ${kind}" data-host="${action}" data-player="${esc(target)}">${text}</button>`;
  function render() {
    const r=getRoom(),u=getUser();pause.hidden=!r?.paused;
    pause.textContent='Çay-Pause · Spiel und Zugtimer angehalten';
    const next=JSON.stringify([r?.code,r?.owner,r?.status,r?.locked,r?.paused,r?.reportsEnabled,r?.groupLinked,r?.socialReport,r?.awards,r?.players.map(p=>[p.id,p.name,p.bot,p.gesturesMutedUntil])]);
    if(next===signature)return;signature=next;
    panel.hidden=!r;if(!r){panel.innerHTML='';return;}
    const host=r.owner===u?.id;
    panel.innerHTML=`<div class="host-suite-heading"><h3>${host?'Dein Tisch · Host-Werkzeuge':'Am Tisch'}</h3><p>${r.locked?'Tisch für neue Spieler gesperrt.':'Tisch offen für neue Spieler.'}</p></div>
      ${host?`<div class="host-grid">${button(r.locked?'unlock':'lock',r.locked?'Tisch öffnen':'Tisch sperren')}${r.status==='playing'?button(r.paused?'resume':'pause',r.paused?'Weiterspielen':'Çay-Pause'):''}</div>
      <h4>Mitspieler verwalten</h4><div class="host-player-list">${r.players.filter(p=>!p.bot&&p.id!==u.id).map(p=>`<div class="host-player"><strong>${esc(p.name)}</strong><div>${button(p.gesturesMutedUntil>now()?'unquiet':'quiet',p.gesturesMutedUntil>now()?'Gesten freigeben':'Gestenpause · 5 Min.',p.id)}${button('transfer','Host übergeben',p.id)}${button('remove','Vom Tisch entfernen',p.id)}</div></div>`).join('')||'<p>Noch keine menschlichen Mitspieler am Tisch.</p>'}</div>
      <h4>Kollegen plagen</h4><div class="host-grid"><button class="button secondary" data-social="nudge">Wo blibsch?</button>${r.groupLinked?`<button class="button secondary" data-social="buj">Buj in die Gruppe</button><button class="button secondary" data-social="revanche">Zur Revanche rufen</button><button class="button secondary" data-social="poll">Spielabend-Abstimmung</button>`:''}</div>
      ${r.groupLinked?`<p class="host-note">Aufrufe gehen in eure Telegram-Gruppe. Erinnerungen: höchstens alle 5 Minuten pro Kollege.</p>${button(r.reportsEnabled?'reports-off':'reports-on',r.reportsEnabled?'Automatische Berichte: an':'Automatische Berichte: aus')}`:'<p class="host-note">Gruppenaufrufe und automatische Berichte gibt es an Tischen, die mit /nisja in Telegram eröffnet wurden. Einladungslinks funktionieren auch hier.</p>'}`:''}
      <h4>Titel des Abends</h4>${r.awards?.length?`<ul class="host-awards">${r.awards.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>Die Titel entstehen aus abgeschlossenen Runden, Çays und Brettwürfen.</p>'}
      ${r.socialReport?'<button class="button secondary" data-social="report">Partie-Bericht ansehen</button>':''}`;
  }
  async function action(e) {
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
