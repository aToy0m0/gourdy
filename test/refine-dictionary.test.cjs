const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{createRequire}=require('node:module');
const filename=path.resolve(__dirname,'../src/refine.cjs'),realRequire=createRequire(filename);
function fixture(answer){
 const text='昨日の失敗を後悔しています。',start=text.indexOf('後悔');
 const analysis={tokens:[],bunsetsu:[],protected:[],segments:[{start:0,end:text.length,text}],candidates:[{id:0,start,end:start+2,before:'後悔',after:'公開',kind:'dictionary',automatic:true,evidence:{reading:'こうかい',expected:'こうかい'}}]};
 const calls=[];
 const module={exports:{}};
 const mockSpawn=()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
  child.stdin.on('finish',()=>queueMicrotask(()=>{child.stdout.write(JSON.stringify(analysis));child.emit('close',0);}));
  return child;
 };
 const require=id=>id==='node:child_process'?{spawn:mockSpawn}:id==='node:fs/promises'?{stat:async()=>({isFile:()=>true})}:id==='./local-llm.cjs'?{withLocalLlm:async(settings,signal,run)=>run(async request=>{calls.push(request);return {answer};})}:realRequire(id);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require,module,exports:module.exports,__dirname:path.dirname(filename),structuredClone,queueMicrotask},{filename});
 return {text,calls,run:()=>module.exports.refine(text,{python:process.execPath,candidateOnly:true,glossary:[{term:'公開',reading:'こうかい'},{term:'無関係',reading:'むかんけい'}]},new AbortController().signal)};
}
test('辞書のautomaticフラグに関係なくLLMの原文維持を尊重し、二重判定しない',async()=>{
 const f=fixture('1'),result=await f.run();assert.equal(result.corrected,f.text);assert.equal(f.calls.length,1);
 const input=JSON.parse(f.calls[0].messages[1].content);
 assert.equal(input.original,f.text);assert.equal(input.dictionary.length,1);assert.ok(input.options.some(o=>o.text===f.text));
});
test('辞書候補はLLMが選択したときだけ適用する',async()=>{
 const f=fixture('0'),result=await f.run();assert.equal(result.corrected,'昨日の失敗を公開しています。');
});
test('候補外のLLM回答を原文維持で隠さずエラーにする',async()=>{
 await assert.rejects(fixture('99').run(),/候補と一致しません/);
});
