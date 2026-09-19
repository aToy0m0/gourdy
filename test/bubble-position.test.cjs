const test=require('node:test'),assert=require('node:assert/strict');
const {bubblePosition}=require('../src/bubble-position.cjs');
test('bubble tail follows microphone at both screen edges, after drag and at all mini sizes',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1280,y:-100,width:1280,height:924}]){
  for(const width of [140,168,280,420]){
   for(const x of [area.x,area.x+350,area.x+area.width-width]){
    const mini={x,y:area.y+600,width},result=bubblePosition(mini,area);
    assert.ok(result.bounds.x>=area.x);
    assert.ok(result.bounds.x+result.bounds.width<=area.x+area.width);
    assert.ok(Math.abs(result.bounds.x+result.tailX-(x+111*width/280))<1e-8);
   }
  }
 }
});
test('off-screen microphone keeps tail away from rounded corners',()=>{
 const area={x:0,y:0,width:1920,height:1040};
 assert.equal(bubblePosition({x:-500,y:100,width:168},area).tailX,18);
 assert.equal(bubblePosition({x:2200,y:100,width:168},area).tailX,297);
});
