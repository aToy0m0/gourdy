const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const jsonc=require('jsonc-parser'),toml=require('smol-toml');

function targets({home,appData,codexHome}){
 return [
  {id:'claude',name:'Claude Code',file:path.join(home,'.claude.json'),format:'json',key:'mcpServers'},
  {id:'codex',name:'Codex',file:path.join(codexHome||path.join(home,'.codex'),'config.toml'),format:'toml'},
  {id:'vscode',name:'VS Code（標準プロファイル）',file:path.join(appData,'Code','User','mcp.json'),format:'jsonc',key:'servers'},
  {id:'cursor',name:'Cursor',file:path.join(home,'.cursor','mcp.json'),format:'json',key:'mcpServers'}
 ];
}
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function parse(text,target){
 try{
  if(target.format==='toml')return toml.parse(text);
  const errors=[],value=jsonc.parse(text,errors,{allowTrailingComma:target.format==='jsonc',disallowComments:target.format!=='jsonc'});
  if(errors.length||!object(value))throw new Error();
  // Duplicate keys would make insertion ambiguous, even when a parser accepts them.
  function check(node){if(node?.type==='object'){const names=new Set();for(const p of node.children){const name=p.children[0].value;if(names.has(name))throw new Error();names.add(name);check(p.children[1]);}}else for(const c of node?.children||[])check(c);}
  check(jsonc.parseTree(text));return value;
 }catch{throw new Error('既存の設定を解析できません。構文エラー・重複キーを修正してから再実行してください。');}
}
function merge(text,target,connection){
 const bom=text.startsWith('\uFEFF')?'\uFEFF':'',body=text.slice(bom.length),value=parse(body,target);
 const key=target.format==='toml'?'mcp_servers':target.key;
 if(value[key]!==undefined&&!object(value[key]))throw new Error(`${key}がオブジェクトではありません。`);
 const entry=target.format==='toml'?{url:connection.url,http_headers:connection.headers}:{...(target.id==='cursor'?{}:{type:'http'}),url:connection.url,headers:connection.headers};
 const existing=value[key]?.gourdy;
 if(existing!==undefined){
  if(isDeepStrictEqual(existing,entry))return text;
  throw new Error('gourdyという名前の異なる設定が存在します。内容を確認し、その項目を削除してから追記してください。');
 }
 let next;
 const eol=body.includes('\r\n')?'\r\n':'\n';
 if(target.format==='toml'){
  next=body.trimEnd()+eol+eol+'# Gourdy: file transcription'+eol+toml.stringify({mcp_servers:{gourdy:entry}}).replace(/\r?\n/g,eol);
 }else next=jsonc.applyEdits(body,jsonc.modify(body,[key,'gourdy'],entry,{formattingOptions:{insertSpaces:true,tabSize:2,eol}}));
 const result=parse(next,target);
 if(!isDeepStrictEqual(result,{...value,[key]:{...value[key],gourdy:entry}}))throw new Error('追記後の設定の検証に失敗しました。');
 return bom+next;
}
async function read(file){try{return await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function writeTarget(target,connection){
 const old=await read(target.file),text=old??(target.format==='toml'?'':'{}\n'),next=merge(text,target,connection);
 if(old===next)return {id:target.id,name:target.name,state:'unchanged',file:target.file};
 await fs.mkdir(path.dirname(target.file),{recursive:true});
 const temporary=target.file+'.gourdy-'+randomUUID()+'.tmp';let backup;
 try{
  await fs.writeFile(temporary,next,{flag:'wx',mode:0o600});
  if(await read(target.file)!==old)throw new Error('設定が別のアプリで変更されました。再実行してください。');
  if(old!==null){backup=target.file+'.gourdy-'+randomUUID()+'.bak';await fs.copyFile(target.file,backup,fs.constants.COPYFILE_EXCL);}
  if(old===null){await fs.copyFile(temporary,target.file,fs.constants.COPYFILE_EXCL);}
  else {if(await read(target.file)!==old)throw new Error('設定が別のアプリで変更されました。再実行してください。');await fs.rename(temporary,target.file);}
  return {id:target.id,name:target.name,state:'added',file:target.file,backup};
 }finally{await fs.rm(temporary,{force:true});}
}
async function install(ids,options,connection){
 const available=targets(options);
 if(!Array.isArray(ids)||!ids.length||ids.length>available.length||new Set(ids).size!==ids.length||ids.some(id=>!available.some(t=>t.id===id)))throw new Error('追記するアプリを選んでください。');
 if(!/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(connection?.url)||!/^Bearer [a-f0-9]{64}$/.test(connection?.headers?.Authorization))throw new Error('MCPの接続情報が不正です。');
 const results=[];
 for(const id of ids){const target=available.find(t=>t.id===id);try{results.push(await writeTarget(target,connection));}catch(e){results.push({id,name:target.name,file:target.file,state:'error',error:e.code?`設定を書き込めません（${e.code}）。`:e.message});}}
 return results;
}
module.exports={targets,merge,install};
