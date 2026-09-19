const MIN_WIDTH=140,MAX_WIDTH=420,DEFAULT_WIDTH=168;
function miniBounds(saved,area){
 const validNumber=n=>Number.isFinite(n)&&Math.abs(n)<2147483647;
 const width=Number.isInteger(saved?.width)?Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,saved.width)):DEFAULT_WIDTH;
 const height=Math.round(width*348/280);
 const x=validNumber(saved?.x)?Math.round(saved.x):area.x+area.width-width-24;
 const y=validNumber(saved?.y)?Math.round(saved.y):area.y+area.height-height-24;
 return {x:Math.max(area.x,Math.min(x,area.x+area.width-width)),y:Math.max(area.y,Math.min(y,area.y+area.height-height)),width,height};
}
module.exports={miniBounds,MIN_WIDTH,MAX_WIDTH};
