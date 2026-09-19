// Renderer coordinates are CSS pixels; Electron window regions use DIP.
function miniShapeRects(rects,viewport,size,zoom){
  if(!viewport||!Number.isFinite(zoom)||zoom<=0||!Number.isInteger(viewport.width)||!Number.isInteger(viewport.height)||viewport.width<1||viewport.height<1)throw new Error('録音ウィンドウの表示倍率が不正です。');
  if(Math.abs(viewport.width*zoom-size.width)>1||Math.abs(viewport.height*zoom-size.height)>1)return null;
  if(!Array.isArray(rects)||!rects.length||rects.length>3000||rects.some(r=>!r||!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>viewport.width||r.y+r.height>viewport.height))throw new Error('録音ウィンドウの形状が不正です。');
  return rects.map(r=>{const x=Math.floor(r.x*zoom),y=Math.floor(r.y*zoom);return {x,y,width:Math.min(size.width,Math.ceil((r.x+r.width)*zoom))-x,height:Math.min(size.height,Math.ceil((r.y+r.height)*zoom))-y};}).filter(r=>r.width>0&&r.height>0);
}
module.exports={miniShapeRects};
