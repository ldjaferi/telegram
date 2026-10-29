import test from 'node:test';
import assert from 'node:assert/strict';
import { FreeRack } from '../public/rack.js';
function fixture(){
  const previous=globalThis.ResizeObserver;globalThis.ResizeObserver=class{observe(){}};
  const events=[],capture=new Set(),layer={};
  const root={querySelector:()=>layer,addEventListener(type,fn,capturing){events.push({type,fn,capturing})},setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)};
  let selected=null,moves=0,taps=0;
  const rack=new FreeRack(root,{markup:()=>'',selected:()=>selected,onSelect:id=>{taps++;selected=selected===id?null:id},onMove:id=>{moves++;selected=id}});
  globalThis.ResizeObserver=previous;
  rack.positions.a={x:.2,y:0,z:1};rack.hand=[{id:'a',color:0,number:1}];rack.render=()=>{};rack.paint=()=>{};rack.save=()=>{};rack.bounds=()=>({w:200,h:100,tw:30,th:40});
  const tile={dataset:{tile:'a'},closest(){return this},style:{},classList:{add(){},remove(){}},click(){throw Error('Synthetic tile clicks must not be used')}};
  const event=(x=10,y=10)=>({target:tile,button:0,pointerId:1,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
  return {rack,event,events,get selected(){return selected},get taps(){return taps},get moves(){return moves}};
}
test('quick touch selects once; compatibility click cannot undo it; second quick tap deselects',()=>{
  const f=fixture();f.rack.down(f.event());f.rack.move(f.event(14,12));f.rack.up(f.event(14,12));
  assert.equal(f.selected,'a');assert.equal(f.taps,1);assert.equal(f.moves,0);
  let stopped=false;const ghost={detail:1,preventDefault(){},stopImmediatePropagation(){stopped=true}};
  f.events.find(e=>e.type==='click'&&e.capturing).fn(ghost);assert.ok(stopped);assert.equal(f.selected,'a');
  f.rack.down(f.event());f.rack.up(f.event());assert.equal(f.selected,null);assert.equal(f.taps,2);
});
test('touch drag moves after distance threshold without hold; cancellation restores position',()=>{
  const f=fixture();f.rack.down(f.event());f.rack.move(f.event(30,20));f.rack.up(f.event(30,20));
  assert.equal(f.taps,0);assert.equal(f.moves,1);assert.equal(f.selected,'a');assert.ok(f.rack.positions.a.x>.2);
  const before={...f.rack.positions.a};f.rack.down(f.event());f.rack.move(f.event(100,50));f.rack.cancel();assert.deepEqual(f.rack.positions.a,before);assert.equal(f.moves,1);
});
