const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const scope={};vm.runInNewContext(fs.readFileSync('src/mini-motion.js','utf8').split('const bubbleShell')[0]+';this.state=bubbleState;this.outline=bubbleOutline;',scope);
function perimeter(d){const n=d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number),points=[];let p=n.slice(0,2);for(let i=2;i<n.length;i+=6){const c=n.slice(i,i+6);for(let j=0;j<=40;j++){const t=j/40,u=1-t;points.push([u*u*u*p[0]+3*u*u*t*c[0]+3*u*t*t*c[2]+t*t*t*c[4],u*u*u*p[1]+3*u*u*t*c[1]+3*u*t*t*c[3]+t*t*t*c[5]]);}p=c.slice(4);}return points;}
test('最終輪郭は当初のSVGを保持する',()=>{const original=fs.readFileSync('src/index.html','utf8').match(/data-idle="([^"]+)"/)[1];assert.equal(scope.outline(scope.state(1)),original);});
test('1001時点で実輪郭と内泡の余白を保ち、小内泡は移動完了後に発生',()=>{
 for(let i=0;i<=1000;i++){const s=scope.state(i/1000),p=perimeter(scope.outline(s));for(const [cx,cy,r]of [[95,91,66*s.record],[188,177,31*s.gear]]){if(r>0)assert.ok(Math.min(...p.map(([x,y])=>Math.hypot(x-cx,y-cy)))>r+4,'outline clearance at '+i);}
 if(s.gear)assert.equal(s.small,1);if(s.mic)assert.ok(s.record>.7);if(s.settings)assert.ok(s.gear>.8);}
});
