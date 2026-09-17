// Match the native hit region to the visible UI, so transparent corners pass clicks through.
async function updateMiniShape(){
  const canvas=document.createElement('canvas');const width=innerWidth,height=innerHeight;canvas.width=width;canvas.height=height;document.documentElement.style.setProperty('--mini-scale',width/280);
  const needed=Math.ceil(348*width/280);
  if(height!==needed){await window.dictation.miniLayout(needed);return;}
  const context=canvas.getContext('2d');
  for(const id of ['shell']){
    const shell=document.getElementById(id);if(shell.hidden||shell.hasAttribute('hidden'))continue;
    const bounds=shell.getBoundingClientRect();
    context.save();context.translate(bounds.x,bounds.y);context.scale(width/280,width/280);
    const path=new Path2D(shell.querySelector('path').getAttribute('d'));
    context.fill(path);context.lineWidth=12;context.stroke(path);context.restore();
  }
  for(const selector of ['#wave','#hide','#resize-handle','#shortcut-tip']){
    const element=document.querySelector(selector);if(element.hidden)continue;
    const r=element.getBoundingClientRect();context.fillRect(r.x,r.y,r.width,r.height);
  }
  const pixels=context.getImageData(0,0,width,height).data,rects=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;){
    if(!pixels[(y*width+x)*4+3]){x++;continue;}
    const start=x;while(x<width&&pixels[(y*width+x)*4+3])x++;
    rects.push({x:start,y,width:x-start,height:1});
  }
  await window.dictation.miniShape(rects,{width,height});document.body.dataset.windowShape='ready';
}
const shapeError=e=>{document.getElementById('status').textContent='外形を設定できません';document.getElementById('status').title=e.message;window.dictation.reportError(e.message).catch(console.error)};
updateMiniShape().catch(shapeError);
function scheduleMiniShape(){cancelAnimationFrame(shapeFrame);shapeFrame=requestAnimationFrame(()=>updateMiniShape().catch(shapeError));}
for(const id of ['info','shortcut-tip'])new MutationObserver(scheduleMiniShape).observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});

new MutationObserver(scheduleMiniShape).observe(document.body,{attributes:true,attributeFilter:['class']});

let shapeFrame;
window.addEventListener('resize',()=>{cancelAnimationFrame(shapeFrame);shapeFrame=requestAnimationFrame(()=>updateMiniShape().catch(shapeError));});
for(const [id,kind] of [['drag-handle','move'],['resize-handle','resize']]){
  const element=document.getElementById(id);let active=false,chain=Promise.resolve();
  const send=action=>{chain=chain.then(()=>window.dictation.miniGesture(action,kind)).catch(shapeError);return chain;};
  element.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();active=true;element.setPointerCapture(event.pointerId);send('start');});
  element.addEventListener('pointermove',()=>{if(active)send('update');});
  const end=()=>{if(active){active=false;send('end');}};
  element.addEventListener('pointerup',end);element.addEventListener('lostpointercapture',end);element.addEventListener('pointercancel',end);
}
