const fs=require('node:fs/promises'),{createReadStream,createWriteStream}=require('node:fs');
const path=require('node:path'),{createHash}=require('node:crypto');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const MODEL={file:'Qwen3-4B-Q4_K_M.gguf',bytes:2497280256,sha256:'7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',url:'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf'};
class CommandModel {
 constructor(folder,notify=()=>{},asset=MODEL){this.asset=asset;this.file=path.join(folder,asset.file);this.notify=notify;this.state={state:'missing',received:0,total:asset.bytes};this.controller=null;this.pending=null;}
 update(patch){this.state={...this.state,...patch};this.notify(this.state);}
 async inspect(){
  try{
   const stat=await fs.stat(this.file);if(!stat.isFile()||stat.size!==this.asset.bytes)throw new Error('モデルのサイズが不正です。再ダウンロードしてください。');
   const hash=createHash('sha256');for await(const chunk of createReadStream(this.file))hash.update(chunk);
   if(hash.digest('hex')!==this.asset.sha256)throw new Error('モデルが破損しています。再ダウンロードしてください。');
   this.update({state:'ready',received:stat.size,error:''});
  }catch(error){if(error.code==='ENOENT')this.update({state:'missing',received:0,error:''});else this.update({state:'error',error:error.message});}
  return this.state;
 }
 download(){
  if(this.pending)throw new Error('モデルはダウンロード中です。');
  if(this.state.state==='ready')return Promise.resolve(this.state);
  this.controller=new AbortController();
  this.pending=this.transfer(this.controller.signal).finally(()=>{this.controller=null;this.pending=null;});
  return this.pending;
 }
 cancel(){this.controller?.abort(new Error('ダウンロードを中止しました。'));}
 async transfer(signal){
  const partial=this.file+'.partial';let idleTimer;
  const idle=new AbortController();const combined=AbortSignal.any([signal,idle.signal,AbortSignal.timeout(60*60*1000)]);
  const resetIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>idle.abort(new Error('通信が60秒間進みませんでした。再試行してください。')),60000);};
  this.update({state:'downloading',received:0,error:''});
  try{
   await fs.mkdir(path.dirname(this.file),{recursive:true});resetIdle();
   const response=await fetch(this.asset.url,{signal:combined});
   if(!response.ok||!response.body)throw new Error(`モデルの取得に失敗しました（HTTP ${response.status}）。`);
   const length=response.headers.get('content-length');if(length&&Number(length)!==this.asset.bytes)throw new Error('配信されたモデルのサイズが一致しません。');
   const hash=createHash('sha256');let received=0,last=0;
   const meter=new Transform({transform:(chunk,_encoding,done)=>{
    resetIdle();received+=chunk.length;
    if(received>this.asset.bytes)return done(new Error('モデルが予定サイズを超えました。'));
    hash.update(chunk);if(Date.now()-last>250){last=Date.now();this.update({received});}done(null,chunk);
   }});
   await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(partial),{signal:combined});
   clearTimeout(idleTimer);this.update({state:'verifying',received});combined.throwIfAborted();
   if(received!==this.asset.bytes||hash.digest('hex')!==this.asset.sha256)throw new Error('モデルの整合性を確認できませんでした。再試行してください。');
   const handle=await fs.open(partial,'r+');try{await handle.sync();}finally{await handle.close();}
   combined.throwIfAborted();await fs.rename(partial,this.file);this.update({state:'ready',error:''});return this.state;
  }catch(error){
   const cause=combined.aborted?combined.reason:error;
   idle.abort(cause);
   try{await fs.rm(partial,{force:true});}catch(cleanup){this.update({state:'error',error:`${cause.message} 一時ファイルの削除に失敗しました: ${cleanup.message}`});throw new Error(this.state.error);}
   this.update({state:signal.aborted?'missing':'error',received:0,error:cause.message});throw cause;
  }finally{clearTimeout(idleTimer);}
 }
}
module.exports={CommandModel,MODEL};
