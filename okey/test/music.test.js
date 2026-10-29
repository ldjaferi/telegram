import test from 'node:test';
import assert from 'node:assert/strict';
import { TableMusic } from '../public/music.js';
test('music schedules bounded voices, avoids duplicate loops, and fades on mute',()=>{
  const nodes=[];const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value}});
  const context={currentTime:0,destination:{},createGain(){const n={gain:parameter(),connect(){},disconnect(){}};nodes.push(n);return n},createOscillator(){const n={frequency:parameter(),connect(){},disconnect(){},start(t){this.starts=t},stop(t){this.stops=t}};nodes.push(n);return n},createBiquadFilter(){return {frequency:parameter(),connect(){},disconnect(){}}}};
  const music=new TableMusic(context);try{music.start();const timer=music.timer;music.start();assert.equal(timer,music.timer);assert.ok(music.bus.gain.value<=.05);for(let i=0;i<64;i++)music.note(i,i*.32);for(const n of nodes.filter(n=>'starts'in n))assert.ok(n.stops>n.starts&&n.stops-n.starts<2);music.stop();assert.equal(music.timer,null);assert.equal(music.bus.gain.value,0);}finally{music.stop()}
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
