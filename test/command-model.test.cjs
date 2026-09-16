const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {CommandModel}=require('../src/command-model.cjs'),{Store,defaults}=require('../src/store.cjs');
const payload=Buffer.from('GGUF-test-model'),asset={file:'model.gguf',url:'https://example.invalid/model',bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex')};
test('初期・旧設定はオプトアウト、モデル確認で通信しない',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-optin-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const fetch=t.mock.method(globalThis,'fetch',()=>{throw new Error('unexpected network')});
 const settings=structuredClone(defaults);delete settings.commandEnabled;
 await fs.writeFile(path.join(folder,'app-data.json'),JSON.stringify({settings,history:[]}));
 const store=new Store(folder);await store.load();assert.equal(store.data.settings.commandEnabled,false);assert.equal(defaults.commandEnabled,false);
 const model=new CommandModel(folder,()=>{},asset);assert.equal((await model.inspect()).state,'missing');assert.equal(fetch.mock.callCount(),0);
});
test('ダウンロードを検証して確定、再起動確認、破損検知',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-model-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 t.mock.method(globalThis,'fetch',async()=>new Response(payload,{headers:{'content-length':String(payload.length)}}));
 const states=[],model=new CommandModel(folder,state=>states.push({...state}),asset);
 await model.download();assert.equal(model.state.state,'ready');assert.deepEqual(await fs.readFile(model.file),payload);await assert.rejects(fs.stat(model.file+'.partial'),{code:'ENOENT'});
 assert.ok(states.some(s=>s.state==='downloading'));assert.ok(states.some(s=>s.state==='verifying'));
 assert.equal((await new CommandModel(folder,()=>{},asset).inspect()).state,'ready');
 await fs.writeFile(model.file,Buffer.alloc(payload.length));const corrupt=new CommandModel(folder,()=>{},asset);assert.equal((await corrupt.inspect()).state,'error');await corrupt.download();assert.deepEqual(await fs.readFile(model.file),payload);
});
test('HTTP失敗・同サイズ破損・サイズ違いは使わず再試行できる',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-model-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 let response=()=>new Response('Unavailable',{status:503});t.mock.method(globalThis,'fetch',async()=>response());
 const model=new CommandModel(folder,()=>{},asset);
 for(const make of [()=>new Response('Unavailable',{status:503}),()=>new Response(Buffer.alloc(payload.length)),()=>new Response(payload.subarray(1))]){
  response=make;await assert.rejects(model.download());assert.equal(model.state.state,'error');await assert.rejects(fs.stat(model.file),{code:'ENOENT'});await assert.rejects(fs.stat(model.file+'.partial'),{code:'ENOENT'});
 }
 response=()=>new Response(payload);await model.download();assert.equal(model.state.state,'ready');
});
test('中止は一時ファイルを削除し二重ダウンロードを拒否する',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-model-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){c.enqueue(payload.subarray(0,2));}})));
 const model=new CommandModel(folder,()=>{},asset),pending=model.download();assert.throws(()=>model.download(),/中/);
 const rejected=assert.rejects(pending,/中止/);setTimeout(()=>model.cancel(),50);await rejected;
 assert.equal(model.state.state,'missing');await assert.rejects(fs.stat(model.file),{code:'ENOENT'});await assert.rejects(fs.stat(model.file+'.partial'),{code:'ENOENT'});
});
