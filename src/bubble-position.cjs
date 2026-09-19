// Coordinates are Electron DIP, matching the 280px mini stage's CSS scale.
function bubblePosition(mini,area){
 const width=Math.min(315,area.width),height=174;
 const x=Math.max(area.x,Math.min(mini.x,area.x+area.width-width));
 const y=Math.max(area.y,Math.min(mini.y-height,area.y+area.height-height));
 const microphoneX=mini.x+111*mini.width/280;
 // Keep the tail out of the rounded corners if the microphone is off-screen.
 const tailX=Math.max(18,Math.min(microphoneX-x,width-18));
 return {bounds:{x,y,width,height},tailX};
}
module.exports={bubblePosition};
