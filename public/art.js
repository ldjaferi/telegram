export function drawFood(ctx,style,x,y,size,variant=0) {
  ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);
  if(style==='cheeks') {
    const skins=[['#f4b294','#ce7f6c'],['#d79470','#ad634b'],['#a9674f','#784536']];const [fill,stroke]=skins[variant%skins.length];
    ctx.fillStyle='#10190f30';ctx.beginPath();ctx.ellipse(0,28,34,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(-26,-27);ctx.bezierCurveTo(-38,-10,-41,12,-25,25);ctx.bezierCurveTo(-13,36,-3,28,0,20);ctx.bezierCurveTo(4,29,17,34,28,23);ctx.bezierCurveTo(42,9,35,-12,26,-27);ctx.quadraticCurveTo(0,-21,-26,-27);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-1);ctx.bezierCurveTo(-5,6,-4,15,0,20);ctx.stroke();
    ctx.strokeStyle='#fff5';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-25,-5);ctx.quadraticCurveTo(-31,5,-24,13);ctx.stroke();
    ctx.fillStyle='#b95f6a66';ctx.beginPath();ctx.ellipse(-19,15,7,4,-.2,0,Math.PI*2);ctx.ellipse(20,15,7,4,.2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff6';ctx.beginPath();ctx.arc(26,-8,3,0,Math.PI*2);ctx.fill();
  } else if(style==='cherry') {
    ctx.strokeStyle='#86b957';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-16,10);ctx.quadraticCurveTo(0,-16,4,-34);ctx.quadraticCurveTo(6,-5,22,13);ctx.stroke();
    ctx.fillStyle='#b6f36a';ctx.beginPath();ctx.ellipse(16,-24,15,6,-.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ef7c94';for(const [x,y] of [[-17,13],[22,20]]) {ctx.beginPath();ctx.arc(x,y,19,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#ffe3d9';ctx.beginPath();ctx.arc(-23,6,4,0,Math.PI*2);ctx.arc(16,13,4,0,Math.PI*2);ctx.fill();
  } else {
    ctx.fillStyle='#f5d97e';ctx.strokeStyle='#cc9b43';ctx.lineWidth=3;ctx.beginPath();
    for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2?18:39;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#65502c';for(const x of [-9,9]){ctx.beginPath();ctx.arc(x,-1,3,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#65502c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,6,6,0,Math.PI);ctx.stroke();
  }
  ctx.restore();
}

export function drawSnake(ctx,body,color,cell,direction='right',alpha=1,cellY=cell) {
  if(!body.length)return;
  const thickness=Math.min(cell,cellY);
  ctx.save();ctx.globalAlpha=alpha;ctx.lineWidth=thickness*.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;
  ctx.beginPath();body.forEach((p,i)=>{const x=(p.x+.5)*cell,y=(p.y+.5)*cellY;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  ctx.fillStyle=color;const head=body[0];ctx.beginPath();ctx.arc((head.x+.5)*cell,(head.y+.5)*cellY,thickness*.43,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#15200e';const angles={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2};const angle=angles[direction];
  for(const side of [-1,1]){const x=(head.x+.5)*cell+Math.cos(angle)*thickness*.12-Math.sin(angle)*side*thickness*.19,y=(head.y+.5)*cellY+Math.sin(angle)*thickness*.12+Math.cos(angle)*side*thickness*.19;ctx.beginPath();ctx.arc(x,y,thickness*.075,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
