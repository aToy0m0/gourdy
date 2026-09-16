const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {shortcutKeys}=require('../src/voice-commands.cjs');
const {replaceExact}=require('../src/replacements.cjs');
const {Recordings,MAX_BYTES}=require('../src/recordings.cjs');
const {validateEdits}=require('../src/corrections.cjs');
const {validatePlan}=require('../src/command-plan.cjs');
test('LLMの操作列を全件検査し、不明キー・制御文字・過大な回数を拒否する',()=>{
 const plan=actions=>({actions,reason:''}),key=(key,count=1)=>({key,text:'',count});
 assert.equal(validatePlan(plan([key('Right',3),{key:'Text',text:'★😀',count:1}])).actions.length,2);
 for(const action of [key('Win+R'),key('Right',101),key('Left',-1),{key:'Text',text:'\n',count:1},{key:'Text',text:'\ud800',count:1}])assert.throws(()=>validatePlan(plan([key('Right'),action])));
 assert.throws(()=>validatePlan(plan([key('Right',100),key('Left',100),key('Right')])));
 assert.throws(()=>validatePlan(plan([])));
 assert.deepEqual(shortcutKeys('Super+Shift+J'),[91,16,74]);assert.throws(()=>shortcutKeys('Super+banana'));
});
test('完全一致置換は長い一致を優先し、連鎖せず、似た語を勝手に置換しない',()=>{
 const rows=[{from:'クロード',to:'Claude'},{from:'Claude',to:'別名'},{from:'クロード社',to:'Anthropic'}];
 assert.equal(replaceExact('クロード社とクロード、クロート',rows),'AnthropicとClaude、クロート');
 assert.equal(replaceExact('対象',[{from:'',to:'未完成'},{from:'対象',to:''}]),'対象');
 assert.throws(()=>replaceExact('x',[{from:'x',to:'y'},{from:'x',to:'z'}]));
});
test('辞書が100件でも完全一致しない語と否定・数字・指示文を保持する',()=>{
 const text='15万円は支払いません。右の資料を要約してください。';
 assert.equal(replaceExact(text,Array.from({length:100},(_,i)=>({from:`製品${i}号`,to:`Product${i}`}))),text);
});
test('同じ箇所の辞書候補を複数選択しても先着順で確定しない',()=>{
 const text='はし';const candidates=['橋','箸'].map((after,id)=>({id,kind:'dictionary',start:0,end:2,before:text,after,automatic:false}));
 const analysis={tokens:[],protected:[],candidates},segment={start:0,end:2,text};
 assert.equal(validateEdits(text,analysis,segment,{selected:[0,1],edits:[]}).edits.length,0);
 assert.equal(validateEdits(text,analysis,segment,{selected:[1],edits:[]}).edits[0].review,false);
});
test('途中で終了した録音を実ファイル長から復旧し、音声を削除できる',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-audio-'));const recordings=new Recordings(dir);
 try{const id=await recordings.start();const pcm=Buffer.alloc(64000);pcm.writeFloatLE(0.1);await recordings.append(pcm);
   await recordings.active.handle.close();recordings.active=null; // Simulated crash: header still has zero length.
   const reopened=new Recordings(dir);await reopened.recover();const row=(await reopened.list())[0];assert.equal(row.id,id);assert.equal(row.state,'interrupted');assert.equal(row.duration,1);
   const wav=await fs.readFile(reopened.file(id,'wav'));assert.equal(wav.readUInt32LE(40),64000);assert.deepEqual(wav.subarray(44),pcm);
   await reopened.remove(id);assert.deepEqual(await reopened.list(),[]);assert.throws(()=>reopened.file('../escape','wav'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('5分の音声サイズ・保存上限・7日の期限を守る',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-audio-'));const recordings=new Recordings(dir);
 try{for(let i=0;i<11;i++){await recordings.start();await recordings.append(Buffer.alloc(4));await recordings.finish();}assert.equal((await recordings.list()).length,10);
   const row=(await recordings.list())[0];row.at=new Date(Date.now()-8*86400000).toISOString();await fs.writeFile(recordings.file(row.id,'json'),JSON.stringify(row));await recordings.prune();assert.equal((await recordings.list()).length,9);
   await recordings.start();recordings.active.bytes=MAX_BYTES;await assert.rejects(recordings.append(Buffer.alloc(4)),/5分/);recordings.active.bytes=0;await recordings.finish();
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
