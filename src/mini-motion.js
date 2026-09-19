// Geometry is shared by the static shell and every sampled animation frame.
const bubbleEase=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const bubbleRange=(t,a,b)=>bubbleEase((t-a)/(b-a));
function bubbleState(t){
  const big=.055+.945*bubbleRange(t,0,.66),small=bubbleRange(t,.24,.70);
  return {big,small,x:95+93*small,y:91+86*small,
    record:bubbleRange(t,.42,.80),gear:bubbleRange(t,.72,.94),
    mic:bubbleRange(t,.68,.90),settings:bubbleRange(t,.90,1)};
}
const bubbleFinal='M94 0 C144 0 184 40 184 90 C184 110 181 121 198 128 C222 133 240 152 240 178 C240 207 217 230 188 230 C163 230 148 216 140 196 C136 184 124 180 110 180 C49 188 4 151 4 94 C4 43 44 0 94 0 Z';
const bubbleTarget=bubbleFinal.match(/-?\d+(?:\.\d+)?/g).map(Number);
// Corresponding points follow the same part of the perimeter. The small lobe
// unfolds from the lower-right arc, rather than intersecting a second circle.
const bubbleCircle=[94,0];
const bubbleAngles=[-90,0,24,38,52,66,80,180,270];
for(let i=0;i<8;i++){
  const a=bubbleAngles[i]*Math.PI/180,b=bubbleAngles[i+1]*Math.PI/180,k=4/3*Math.tan((b-a)/4);
  bubbleCircle.push(94+90*(Math.cos(a)-k*Math.sin(a)),90+90*(Math.sin(a)+k*Math.cos(a)),94+90*(Math.cos(b)+k*Math.sin(b)),90+90*(Math.sin(b)-k*Math.cos(b)),94+90*Math.cos(b),90+90*Math.sin(b));
}
function bubbleOutline(s){
  if(s.big===1&&s.small===1)return bubbleFinal;
  const points=bubbleCircle.map((v,i)=>{const center=i%2?90:94;return center+(v+(bubbleTarget[i]-v)*s.small-center)*s.big;});
  let d=`M${points[0]} ${points[1]}`;
  for(let i=2;i<points.length;i+=6)d+=' C'+points.slice(i,i+6).join(' ');
  return d+' Z';
}
const bubbleShell=document.querySelector('#shell path');
bubbleShell.dataset.idle=bubbleOutline(bubbleState(1));bubbleShell.setAttribute('d',bubbleShell.dataset.idle);scheduleMiniShape();
let miniAnimations=[],motionGeneration=0;
window.dictation.on('mini-motion',async ({id,direction})=>{
  const generation=++motionGeneration;
  for(const a of miniAnimations)a.cancel();miniAnimations=[];
  document.body.dataset.motion=direction;
  if(direction==='restore'){delete document.body.dataset.motion;return;}
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?1:480;
  const options={duration,fill:'both',direction:direction==='exit'?'reverse':'normal',easing:'linear'};
  const frames=Array.from({length:61},(_,i)=>({offset:i/60,state:bubbleState(i/60)}));
  const animate=(selector,fn)=>miniAnimations.push(document.querySelector(selector).animate(frames.map(({offset,state})=>({offset,...fn(state,offset)})),options));
  animate('#shell path',s=>({d:`path("${bubbleOutline(s)}")`}));
  animate('#record',s=>({transform:`scale(${s.record})`,opacity:s.record?1:0}));
  animate('#settings',s=>({transform:`scale(${s.gear})`,opacity:s.gear?1:0}));
  animate('#record svg',s=>({transform:`scale(${s.mic})`,opacity:s.mic}));
  animate('#settings svg',s=>({transform:`scale(${s.settings})`,opacity:s.settings}));
  animate('#wave',(_,t)=>({opacity:bubbleRange(t,.75,1)}));
  animate('#info',(_,t)=>({opacity:bubbleRange(t,.9,1)}));
  try{
    if(direction==='enter')await window.dictation.miniMotionReady(id);
    await Promise.all(miniAnimations.map(a=>a.finished));
    if(generation!==motionGeneration)return;
    if(direction==='exit'){
      // Let the final small outline reach the compositor before hiding HWND.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(generation!==motionGeneration)return;
      await window.dictation.miniMotionDone(id,direction);
      return; // Keep the collapsed frame until the next enter/restore.
    }
    await window.dictation.miniMotionDone(id,direction);
    if(generation!==motionGeneration)return;
    for(const a of miniAnimations)a.cancel();miniAnimations=[];delete document.body.dataset.motion;
  }catch(e){
    if(generation!==motionGeneration)return;
    for(const a of miniAnimations)a.cancel();miniAnimations=[];delete document.body.dataset.motion;error(e);
  }
});
