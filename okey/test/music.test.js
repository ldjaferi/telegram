import test from 'node:test';
import assert from 'node:assert/strict';
import { TableMusic, TileClack } from '../public/music.js';
test('music schedules bounded voices, avoids duplicate loops, and fades on mute',()=>{
  const nodes=[];const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value}});
  const context={currentTime:0,destination:{},createGain(){const n={gain:parameter(),connect(){},disconnect(){}};nodes.push(n);return n},createOscillator(){const n={frequency:parameter(),connect(){},disconnect(){},start(t){this.starts=t},stop(t){this.stops=t}};nodes.push(n);return n},createBiquadFilter(){return {frequency:parameter(),connect(){},disconnect(){}}}};
  const music=new TableMusic(context);try{music.start();const timer=music.timer;music.start();assert.equal(timer,music.timer);assert.ok(music.bus.gain.value<=.05);for(let i=0;i<64;i++)music.note(i,i*.32);for(const n of nodes.filter(n=>'starts'in n))assert.ok(n.stops>n.starts&&n.stops-n.starts<2);music.stop();assert.equal(music.timer,null);assert.equal(music.bus.gain.value,0);}finally{music.stop()}
});

test('contacts alternate Klick/Klack; ignored, muted and suspended contacts do not advance', () => {
  const sources = []; let enabled = true;
  const context = { sampleRate: 44100, currentTime: 1, state: 'running', destination: {},
    createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; },
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBufferSource() { const source = { connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; this.onended(); } }; sources.push(source); return source; }
  };
  const clip = new TileClack(context, '/unused.mp3', () => enabled);
  clip.play(); clip.play(); assert.equal(sources.length, 1, 'overlapping contacts are ignored');
  const klick = sources[0].buffer; sources[0].onended();
  context.currentTime += .06; clip.play(); assert.equal(sources.length, 1, 'contact burst is bounded');
  enabled = false; context.currentTime += 1; clip.play(); assert.equal(sources.length, 1);
  enabled = true; context.state = 'suspended'; clip.play(); assert.equal(sources.length, 1);
  context.state = 'running'; clip.play(); const klack = sources[1].buffer;
  assert.notEqual(klick, klack); assert.ok(klick.duration < klack.duration);
  clip.stop(); assert.equal(sources[1].stopped, true);
  context.currentTime += 1; clip.play(); assert.equal(sources[2].buffer, klick);
  sources[2].onended(); context.currentTime += 1; clip.play(); assert.equal(sources[3].buffer, klack);
  for (const sound of [klick, klack]) {
    const data = sound.getChannelData(0);
    assert.ok(sound.duration < .1);
    assert.equal(Math.abs(data[0]), 0);
    assert.ok(Math.abs(data.at(-1)) < .001, 'clean tail without a cut-off click');
    const peak = Math.max(...data.map(Math.abs)); assert.ok(peak > .1 && peak <= .73, 'audible without clipping');
    assert.ok(data.every(Number.isFinite));
  }
});

import { shishaBubbles } from '../public/music.js';
test('small and strong shisha draws have distinct bounded bubbles and stop on mute',()=>{
  function render(strong){
    const voices=[],gains=[];
    const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value}});
    const source=()=>{const n={frequency:param(),connect(){},disconnect(){this.disconnected=true},start(t){this.startAt=t},stop(t){this.stopAt=t}};voices.push(n);return n};
    const c={currentTime:2,sampleRate:8000,destination:{},createGain(){const n={gain:param(),connect(){},disconnect(){this.disconnected=true}};gains.push(n);return n},createOscillator:source,createBufferSource:source,createBiquadFilter(){return{frequency:param(),connect(){},disconnect(){}}},createBuffer(channels,length){const data=new Float32Array(length);return{getChannelData(){return data}}}};
    const stop=shishaBubbles(c,strong);
    const duration=Math.max(...voices.map(v=>v.stopAt))-c.currentTime;
    assert.ok(voices.every(v=>v.stopAt>v.startAt));
    stop();assert.equal(gains[0].gain.value,0);assert.ok(voices.every(v=>v.stopAt<=c.currentTime+.051));
    for(const v of voices)v.onended();assert.ok(gains[0].disconnected);assert.ok(voices.every(v=>v.disconnected));
    return {count:voices.length,duration};
  }
  const small=render(false),strong=render(true);assert.ok(strong.count>small.count);assert.ok(small.duration<1);assert.ok(strong.duration>1.5&&strong.duration<2);
});
