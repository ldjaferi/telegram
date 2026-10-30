import test from 'node:test';
import assert from 'node:assert/strict';
import { TableMusic, TileClack } from '../public/music.js';
test('music schedules bounded voices, avoids duplicate loops, and fades on mute',()=>{
  const nodes=[];const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value}});
  const context={currentTime:0,destination:{},createGain(){const n={gain:parameter(),connect(){},disconnect(){}};nodes.push(n);return n},createOscillator(){const n={frequency:parameter(),connect(){},disconnect(){},start(t){this.starts=t},stop(t){this.stops=t}};nodes.push(n);return n},createBiquadFilter(){return {frequency:parameter(),connect(){},disconnect(){}}}};
  const music=new TableMusic(context);try{music.start();const timer=music.timer;music.start();assert.equal(timer,music.timer);assert.ok(music.bus.gain.value<=.05);for(let i=0;i<64;i++)music.note(i,i*.32);for(const n of nodes.filter(n=>'starts'in n))assert.ok(n.stops>n.starts&&n.stops-n.starts<2);music.stop();assert.equal(music.timer,null);assert.equal(music.bus.gain.value,0);}finally{music.stop()}
});

test('spoken contact clip does not overlap, queue after mute, or play while hidden',async()=>{
  const original=globalThis.fetch;let resolveAudio;
  globalThis.fetch=async()=>({ok:true,arrayBuffer:()=>new Promise(resolve=>{resolveAudio=resolve})});
  const sources=[];let enabled=true;
  const context={currentTime:1,state:'running',destination:{},decodeAudioData:async()=>({duration:.5}),
    createGain:()=>({gain:{},connect(){},disconnect(){}}),
    createBufferSource(){const s={connect(){},disconnect(){},start(){this.started=true},stop(){this.stopped=true;this.onended()}};sources.push(s);return s;}};
  try{
    const clip=new TileClack(context,'/klack.mp3',()=>enabled);
    await Promise.resolve();const pending=clip.play();clip.stop();resolveAudio(new ArrayBuffer(1));await pending;
    assert.equal(sources.length,0,'muting cancels a pending load');
    await clip.play();await clip.play();assert.equal(sources.length,1);
    enabled=false;clip.stop();assert.equal(sources[0].stopped,true);
    context.currentTime+=1;await clip.play();assert.equal(sources.length,1);
    enabled=true;await clip.play();assert.equal(sources.length,2);clip.stop();
  }finally{globalThis.fetch=original;}
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
