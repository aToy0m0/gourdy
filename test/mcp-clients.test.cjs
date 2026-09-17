const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {targets,merge,install}=require('../src/mcp-clients.cjs');
const jsonc=require('jsonc-parser'),toml=require('smol-toml');
const connection={url:'http://127.0.0.1:55888/mcp',headers:{Authorization:'Bearer '+'a'.repeat(64)}};
test('各社のユーザー共通形式とコメントを保ち、重複登録しない',()=>{
 for(const target of targets({home:'home',appData:'roaming'})){
  const text=target.format==='toml'?'# keep\nmodel = "example"\n[mcp_servers.other]\ncommand = "test"\n':target.format==='jsonc'?'{\n // keep\n "servers": {"other": {"command":"test"}},\n "inputs": [],\n}':'{"projects":{"old":{}},"mcpServers":{"other":{"command":"test"}}}';
  const result=merge(text,target,connection),data=target.format==='toml'?toml.parse(result):jsonc.parse(result),key=target.format==='toml'?'mcp_servers':target.key;
  assert.equal(data[key].other.command,'test');assert.equal(data[key].gourdy.url,connection.url);
  assert.equal(data[key].gourdy[target.format==='toml'?'http_headers':'headers'].Authorization,connection.headers.Authorization);
  if(['claude','vscode'].includes(target.id))assert.equal(data[key].gourdy.type,'http');
  if(target.format==='toml'||target.format==='jsonc')assert.ok(result.includes('keep'));
  assert.equal(merge(result,target,connection),result);
 }
});
test('壊れた設定、同名の別設定、重複キーを黙って上書きしない',()=>{
 const target=targets({home:'home',appData:'roaming'})[0];
 for(const text of ['{"mcpServers":', '{"mcpServers":[]}', '{"mcpServers":{"gourdy":{"url":"https://other"}}}', '{"a":1,"a":2}'])assert.throws(()=>merge(text,target,connection));
});
test('選択した対象だけ追記し、元ファイルをバックアップ。失敗は対象別に返す',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'gourdy-mcp-test-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const options={home:folder,appData:path.join(folder,'roaming'),codexHome:path.join(folder,'custom-codex')},list=targets(options);
 await fs.writeFile(list[0].file,'{"keep":true}');await fs.mkdir(path.dirname(list[3].file),{recursive:true});await fs.writeFile(list[3].file,'broken');
 const results=await install(['claude','codex','cursor'],options,connection);
 assert.deepEqual(results.map(r=>r.state),['added','added','error']);assert.equal(await fs.readFile(results[0].backup,'utf8'),'{"keep":true}');
 assert.equal(JSON.parse(await fs.readFile(list[0].file,'utf8')).keep,true);assert.equal(await fs.readFile(list[3].file,'utf8'),'broken');
 await assert.rejects(fs.access(list[2].file));assert.equal((await install(['claude'],options,connection))[0].state,'unchanged');
 await assert.rejects(install(['unknown'],options,connection));assert.ok(!JSON.stringify(results).includes(connection.headers.Authorization));
});
