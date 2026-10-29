// Render authoritative snapshots on a continuous clock rather than restarting
// each animation when a network packet arrives. No client-side game simulation.
export class MotionBuffer {
  constructor() { this.reset(); }
  reset() {
    this.frames=[];this.latest=null;this.offset=null;this.playback=null;this.sampledAt=null;
  }
  push(state,receivedAt) {
    const previous=this.latest;
    if(state.status!=='running') {this.reset();this.latest=state;return;}
    if(previous && (previous.code!==state.code || state.tick<previous.tick))this.reset();
    if(this.frames.length && state.tick===this.frames.at(-1).state.tick) {
      // Reconnect/presence updates must not restart movement for the same tick.
      this.frames.at(-1).state=state;this.latest=state;return;
    }
    if(this.frames.length && receivedAt-this.frames.at(-1).receivedAt>state.tickMs*4)this.reset();
    const offset=receivedAt-state.serverTime;
    this.offset=this.offset===null?offset:Math.min(this.offset,offset);
    if(!this.frames.length && previous?.code===state.code && previous.tick===state.tick-1) {
      this.frames.push({state:previous,time:state.serverTime-state.tickMs,receivedAt:receivedAt-state.tickMs});
    }
    this.frames.push({state,time:state.serverTime,receivedAt});
    if(this.frames.length>12)this.frames.shift();
    this.latest=state;
  }
  sample(now) {
    if(!this.frames.length)return this.latest?.players||[];
    const latest=this.frames.at(-1),tickMs=latest.state.tickMs;
    const target=Math.min(latest.time,now-this.offset-tickMs*1.2);
    if(this.playback===null)this.playback=target;
    else {
      const elapsed=Math.max(0,now-this.sampledAt);
      // Keep time monotonic; gently catch up when lower latency shifts the clock.
      this.playback=Math.max(this.playback,Math.min(target,this.playback+elapsed*1.15));
    }
    this.sampledAt=now;
    let before=this.frames[0],after=before;
    for(const frame of this.frames) {
      after=frame;if(frame.time>=this.playback)break;before=frame;
    }
    const progress=after.time===before.time?1:Math.max(0,Math.min(1,(this.playback-before.time)/(after.time-before.time)));
    const oldPlayers=new Map(before.state.players.map(p=>[p.id,p]));
    return after.state.players.map(p=>{
      const old=oldPlayers.get(p.id);
      if(!old?.alive || !p.alive || !old.body.length)return p;
      return {...p,body:p.body.map((point,i)=>{
        const start=old.body[Math.min(i,old.body.length-1)];
        return {x:start.x+(point.x-start.x)*progress,y:start.y+(point.y-start.y)*progress};
      })};
    });
  }
}

export function roomUiKey(room,userId,connected) {
  if(!room)return `home:${connected}`;
  return JSON.stringify([room.code,room.hostId,room.status,room.practice,room.training,room.foodStyle,
    Math.ceil((room.startAt-room.serverTime)/1000),Math.ceil((room.endAt-room.serverTime)/1000),userId,connected,
    room.players.map(p=>[p.id,p.name,p.color,p.connected,p.alive,p.score]),room.results]);
}
