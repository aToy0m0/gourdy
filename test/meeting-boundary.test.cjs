const {quietBoundary}=require('../src/meeting-boundary.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
function audio(seconds,silent){const b=Buffer.alloc(seconds*16000*4);for(let i=0;i<b.length/4;i++)b.writeFloatLE(silent(i/16000)?0:.08,i*4);return b;}
test('発話中の60秒を避け無音内だけ200ms重ねる',()=>{const b=quietBoundary(audio(10,t=>t>=6&&t<7),55,60,120);assert.ok(b.at>=61.2&&b.at<=61.8);assert.equal(b.padding,.1);assert.equal(b.reason,'silence');});
test('無音がない/短すぎる場合は重ねず理由を記録',()=>{for(const silence of [()=>false,t=>t>4.9&&t<5.1])assert.deepEqual(quietBoundary(audio(10,silence),55,60,120),{at:60,padding:0,reason:'no-silence'});});
test('無音が複数あると公称境界に近いものを選ぶ',()=>{assert.equal(quietBoundary(audio(10,t=>t<1||t>=4&&t<6),55,60,120).at,60);});
