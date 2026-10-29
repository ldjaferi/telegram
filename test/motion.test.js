import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MotionBuffer,roomUiKey} from '../public/motion.js';
const state=(tick,status='running',code='ROOM')=>({code,tick,status,tickMs:125,serverTime:10000+tick*125,startAt:10000,endAt:130000,players:[{id:'a',alive:true,direction:'right',body:[{x:tick,y:4},{x:tick-1,y:4}],score:0,connected:true}],foodStyle:'cheeks',results:[]});
test('jittered packets render continuous forward movement at display cadence',()=>{
  const buffer=new MotionBuffer();buffer.push(state(0,'countdown'),0);
  const arrivals=[[130,1],[235,2],[392,3],[500,4],[645,5],[748,6],[892,7],[1002,8]];
  let previous=0,movingFrames=0;
  for(let time=0;time<1150;time+=1000/60){
    while(arrivals.length&&arrivals[0][0]<=time){const [at,tick]=arrivals.shift();buffer.push(state(tick),at);}
    const x=buffer.sample(time)[0].body[0].x;
    assert.ok(x>=previous-1e-9,'the snake must never jump backwards');
    assert.ok(x-previous<=1.15*(1000/60)/125+1e-8,'packet arrival must not cause a positional jump');
    if(x>previous)movingFrames++;
    previous=x;
  }
  assert.ok(movingFrames>45,'motion should advance on substantially more than 30 frames per second');
});
test('duplicate presence snapshot does not reset the animation',()=>{
  const buffer=new MotionBuffer();buffer.push(state(0,'countdown'),0);buffer.push(state(1),125);buffer.push(state(2),250);
  const before=buffer.sample(270)[0].body[0].x;
  buffer.push({...state(2),serverTime:10290},290);
  const after=buffer.sample(290)[0].body[0].x;
  assert.ok(after>=before);assert.ok(after-before<.2);assert.equal(buffer.frames.length,3);
});
test('missing packets freeze at last authoritative position; round reset clears history',()=>{
  const buffer=new MotionBuffer();buffer.push(state(1),125);buffer.push(state(2),250);
  for(let time=300;time<=2000;time+=16)assert.ok(buffer.sample(time)[0].body[0].x<=2);
  buffer.push(state(0,'countdown','NEXT'),2100);assert.equal(buffer.sample(2200)[0].body[0].x,0);
  buffer.push(state(1,'running','NEXT'),2250);assert.equal(buffer.latest.code,'NEXT');assert.equal(buffer.frames.length,2);
});
test('HUD ignores body-only ticks but updates score, connection and timer',()=>{
  const a=state(1),b=state(2);assert.equal(roomUiKey(a,'a',true),roomUiKey(b,'a',true));
  b.players[0].score=10;assert.notEqual(roomUiKey(a,'a',true),roomUiKey(b,'a',true));
  assert.notEqual(roomUiKey(a,'a',true),roomUiKey(a,'a',false));
  assert.notEqual(roomUiKey(a,'a',true),roomUiKey(state(9),'a',true));
});
