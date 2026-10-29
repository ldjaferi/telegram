// Original, quiet Hijaz-inspired plucked melody with a soft hand-drum pulse.
export class TableMusic {
  constructor(context){this.context=context;this.bus=context.createGain();this.bus.gain.value=0;this.bus.connect(context.destination);this.timer=null;this.step=0;}
  start(){
    if(this.timer)return;
    const c=this.context;this.next=c.currentTime+.08;this.bus.gain.cancelScheduledValues(c.currentTime);this.bus.gain.setTargetAtTime(.045,c.currentTime,.3);
    const tick=()=>{while(this.next<c.currentTime+.25){this.note(this.step++,this.next);this.next+=.32}};
    tick();this.timer=setInterval(tick,100);
  }
  stop(){clearInterval(this.timer);this.timer=null;const c=this.context;this.bus.gain.cancelScheduledValues(c.currentTime);this.bus.gain.setTargetAtTime(0,c.currentTime,.04);}
  pluck(midi,at,length=.45,level=.5){
    const c=this.context,o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
    o.type='triangle';o.frequency.value=440*2**((midi-69)/12);f.type='lowpass';f.frequency.value=1450;
    g.gain.setValueAtTime(.001,at);g.gain.linearRampToValueAtTime(level,at+.008);g.gain.exponentialRampToValueAtTime(.001,at+length);
    o.connect(f);f.connect(g);g.connect(this.bus);o.start(at);o.stop(at+length+.02);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect()};
  }
  note(step,at){
    const melody=[62,null,63,66,67,null,66,63,62,null,57,null,62,63,66,null,69,null,70,69,67,null,66,63,66,67,63,null,62,null,null,null];
    const i=step%64,n=melody[i%32];if(n!==null)this.pluck(n+(i>=32&&i%8===4?12:0),at,.42,.48);
    if(step%8===0)this.pluck(38,at,1.1,.35);
    if(step%4===0||step%8===5){const c=this.context,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(step%8===0?130:210,at);o.frequency.exponentialRampToValueAtTime(65,at+.1);g.gain.setValueAtTime(.38,at);g.gain.exponentialRampToValueAtTime(.001,at+.15);o.connect(g);g.connect(this.bus);o.start(at);o.stop(at+.16);o.onended=()=>{o.disconnect();g.disconnect()};}
  }
}

// Water gurgles: irregular rising bubbles over a quiet, filtered draw sound.
export function shishaBubbles(context, strong = false) {
  const c=context, at=c.currentTime+.015, length=strong?1.85:.68;
  const bus=c.createGain();bus.gain.value=strong?.6:.42;bus.connect(c.destination);
  const voices=[];let active=0;
  function voice(source,nodes){
    active++;voices.push(source);
    source.onended=()=>{for(const node of nodes)node.disconnect();if(--active===0)bus.disconnect()};
  }
  const count=strong?19:6;
  for(let i=0;i<count;i++){
    const time=at+i*(length-.16)/count+Math.random()*.025;
    const oscillator=c.createOscillator(), gain=c.createGain(), pitch=105+Math.random()*190;
    oscillator.type='sine';oscillator.frequency.setValueAtTime(pitch,time);oscillator.frequency.exponentialRampToValueAtTime(pitch*1.8,time+.075);
    gain.gain.setValueAtTime(.001,time);gain.gain.linearRampToValueAtTime(.13+Math.random()*.07,time+.012);gain.gain.exponentialRampToValueAtTime(.001,time+.12);
    oscillator.connect(gain);gain.connect(bus);voice(oscillator,[oscillator,gain]);oscillator.start(time);oscillator.stop(time+.13);
  }
  const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*length),c.sampleRate), data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(.15+.85*Math.sin(i/c.sampleRate*47)**6);
  const water=c.createBufferSource(), filter=c.createBiquadFilter(), envelope=c.createGain();
  water.buffer=buffer;filter.type='lowpass';filter.frequency.value=480;
  envelope.gain.setValueAtTime(.001,at);envelope.gain.linearRampToValueAtTime(.11,at+.06);envelope.gain.exponentialRampToValueAtTime(.001,at+length);
  water.connect(filter);filter.connect(envelope);envelope.connect(bus);voice(water,[water,filter,envelope]);water.start(at);water.stop(at+length);
  return ()=>{bus.gain.cancelScheduledValues(c.currentTime);bus.gain.setTargetAtTime(0,c.currentTime,.015);for(const source of voices){try{source.stop(c.currentTime+.05)}catch{}}};
}
