const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function botReply(config,message) {
  if(!message?.from?.id || message.from.is_bot || !message.chat?.id || typeof message.text!=='string')return null;
  const [rawCommand,parameter]=message.text.trim().split(/\s+/);
  const [command,target]=rawCommand.split('@');
  if(target && target.toLowerCase()!==config.botUsername.toLowerCase())return null;
  if(!['/start','/play','/help','/id'].includes(command))return null;
  const id=String(message.from.id);
  const allowed=config.allowPublic || config.adminIds.includes(id) || config.allowedIds.includes(id);
  let text,reply_markup;
  if(command==='/id')text=`Deine Telegram-ID: ${id}`;
  else if(!allowed)text=`Das Spiel ist noch privat. Deine Telegram-ID für die Freischaltung: ${id}`;
  else if(command==='/help')text='Futter sammeln, länger werden, Kollisionen vermeiden. 2–8 Spieler, zwei Minuten pro Runde. Der Raumleiter startet; das Futter legt der Admin fest. Auf dem Handy mit Richtungstasten oder Wischen steuern.';
  else {
    const match=/^room_([A-Fa-f0-9]{8})$/.exec(parameter||'');
    const code=match?.[1].toUpperCase();
    text=code?`Deine Einladung zu Raum ${code}. Öffne das Spielfeld und spiele mit!`:'SNAKE CLUB 🐍\nEin Raum. Deine Freunde. Jede Menge Appetit.\nErstelle eine Runde und teile den Einladungslink.';
    const button=message.chat.type==='private'
      ? {text:'Snake spielen ↗',web_app:{url:`${config.publicUrl}${code?'/?room='+code:''}`}}
      : {text:'Snake im Bot öffnen ↗',url:`https://t.me/${config.botUsername}?start=${code?'room_'+code:'play'}`};
    reply_markup={inline_keyboard:[[button]]};
  }
  return {chat_id:message.chat.id,text,...(reply_markup?{reply_markup}:{})};
}

export async function runBot(config,store,signal) {
  const call=async(method,payload)=>{
    const res=await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.any([signal,AbortSignal.timeout(40000)])});
    const data=await res.json();if(!data.ok) throw new Error(`Telegram ${method}: ${data.error_code}`);return data.result;
  };
  try {
    const me=await call('getMe',{});config.botUsername=me.username;
    await call('setMyCommands',{commands:[{command:'play',description:'Snake spielen'},{command:'id',description:'Meine Telegram-ID anzeigen'},{command:'help',description:'Spielregeln'}]});
    await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Snake spielen',web_app:{url:config.publicUrl}}});
  } catch(error) {if(!signal.aborted) console.error('Bot setup failed; check credentials and network.');}
  let offset=Number(store.get('telegram_offset')||0);
  while(!signal.aborted) {
    try {
      const updates=await call('getUpdates',{offset,timeout:25,allowed_updates:['message']});
      for(const update of updates) {
        const reply=botReply(config,update.message);
        if(reply)try {await call('sendMessage',reply);} catch {console.error('Bot reply could not be delivered.');}
        offset=update.update_id+1;store.set('telegram_offset',offset);
      }
    } catch {if(!signal.aborted) {console.error('Bot polling unavailable; retrying.');await delay(5000);}}
  }
}
