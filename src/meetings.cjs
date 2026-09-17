const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto'),{setTimeout:delay}=require('node:timers/promises');
const {Moonshine}=require('./moonshine.cjs'),{refine}=require('./refine.cjs');
const {quietBoundary}=require('./meeting-boundary.cjs');
const SECONDS=60,MAX_SECONDS=12*3600;
function execute(exe,args,{signal,maxBuffer=8*1024*1024,timeout=90000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let pieces=[],size=0,stderr='',failure;
  const abort=()=>{failure=new Error('処理を中止しました。');child.kill()};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(()=>{failure=new Error('音声ファイルの処理が制限時間内に応答しませんでした。');child.kill()},timeout);
  child.stdout.on('data',b=>{size+=b.length;if(size>maxBuffer){failure=new Error('音声区間の出力サイズが上限を超えました。');child.kill()}else pieces.push(b)});
  child.stderr.on('data',b=>stderr=(stderr+b.toString()).slice(-2000));child.on('error',e=>failure=e);
  child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure)reject(failure);else if(code!==0)reject(new Error(`音声ファイルの処理に失敗しました（${code}）。${stderr}`));else resolve(Buffer.concat(pieces))});
 });
}
async function fingerprint(file){const s=await fs.stat(file);if(!s.isFile())throw new Error('通常の音声・動画ファイルを選んでください。');return {size:s.size,mtimeMs:s.mtimeMs};}
function equalSource(a,b){return a.size===b.size&&a.mtimeMs===b.mtimeMs;}
async function probe(file,bin,signal){
 const data=JSON.parse((await execute(path.join(bin,'ffprobe.exe'),['-v','error','-protocol_whitelist','file,pipe','-show_entries','format=duration:stream=index,codec_type,codec_name,duration:stream_tags=language,title','-of','json',file],{signal,maxBuffer:1024*1024,timeout:30000})).toString());
 const audio=data.streams?.find(s=>s.codec_type==='audio');if(!audio)throw new Error('このファイルには音声トラックがありません。');
 const duration=Number(audio.duration??data.format?.duration);if(!Number.isFinite(duration)||duration<=0||duration>MAX_SECONDS)throw new Error('長さを確認できる12時間以内の音声・動画を選んでください。');
 return {duration,audioStream:audio.index,video:data.streams.some(s=>s.codec_type==='video'),audioCodec:audio.codec_name,subtitleTracks:data.streams.filter(s=>s.codec_type==='subtitle').map(s=>({index:s.index,codec:s.codec_name,language:s.tags?.language||'',title:s.tags?.title||'',supported:['subrip','srt','ass','ssa','webvtt','mov_text','text'].includes(s.codec_name)}))};
}
async function extractSubtitles(job,index,bin,signal){
 const track=job.subtitleTracks?.find(t=>t.index===index);
 if(!track)throw new Error('字幕トラックが見つかりません。再度ファイルを読み込んでください。');
 if(!track.supported)throw new Error('画像形式の字幕は抽出に対応していません。音声から文字起こししてください。');
 return (await execute(path.join(bin,'ffmpeg.exe'),['-hide_banner','-loglevel','error','-xerror','-nostdin','-protocol_whitelist','file,pipe','-i',job.source,'-map',`0:${index}`,'-an','-vn','-c:s','srt','-f','srt','pipe:1'],{signal,maxBuffer:16*1024*1024})).toString('utf8');
}
async function decode(job,part,bin,signal,wav=false){
 const pcm=await execute(path.join(bin,'ffmpeg.exe'),['-hide_banner','-loglevel','error','-xerror','-nostdin','-protocol_whitelist','file,pipe','-ss',String(part.start),'-i',job.source,'-t',String(part.end-part.start),'-map',`0:${job.audioStream}`,'-vn','-ac','1','-ar','16000','-c:a',wav?'pcm_s16le':'pcm_f32le','-f',wav?'wav':'f32le','pipe:1'],{signal,maxBuffer:Math.ceil((part.end-part.start)*64000)+1048576});
 if(!wav){if(pcm.length%4||pcm.length<Math.max(1,(part.end-part.start-0.5)*16000)*4)throw new Error('音声区間が途中で途切れています。元ファイルを確認してください。');}
 return pcm;
}
async function recognize(pcm,settings,signal){
 // Exact digital silence needs no model call; quiet speech is still recognized.
 if(pcm.every(byte=>byte===0))return '';
 signal?.throwIfAborted();const worker=new Moonshine(settings);const abort=()=>worker.fail(new Error('処理を中止しました。'));signal?.addEventListener('abort',abort,{once:true});
 try{signal?.throwIfAborted();await worker.ready;for(let at=0;at<pcm.length;at+=64000){signal?.throwIfAborted();await worker.request('audio',pcm.subarray(at,at+64000))}return (await worker.request('stop')).text;}
 finally{signal?.removeEventListener('abort',abort);await worker.close();}
}
async function atomic(file,data){const temporary=file+'.tmp';const h=await fs.open(temporary,'w');try{await h.writeFile(JSON.stringify(data),'utf8');await h.sync()}finally{await h.close()}await fs.rename(temporary,file);}
function transcript(job){return job.parts.map(p=>`[${formatTime(p.start)}–${formatTime(p.end)}]${p.state==='done'?'':p.raw!==undefined?'（未補正）':'（未完了）'}\n${p.corrected??p.raw??''}`).join('\n\n');}
function formatTime(seconds){return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(n=>String(n).padStart(2,'0')).join(':');}
class Meetings {
 constructor(folder,bin,settings,{decodePart=decode,recognizePart=recognize,refinePart=async(text,s,signal)=>(await refine(text,s,signal)).corrected,retryDelay=1000}={}){Object.assign(this,{folder,bin,settings,decodePart,recognizePart,refinePart,retryDelay});this.running=false;}
 file(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('会議IDが不正です。');return path.join(this.folder,id+'.json')}
 async save(job){await fs.mkdir(this.folder,{recursive:true});await atomic(this.file(job.id),job);}
 async read(id){const file=this.file(id);if((await fs.stat(file)).size>32*1024*1024)throw new Error('会議データが大きすぎます。');const job=JSON.parse(await fs.readFile(file,'utf8'));if(job.id!==id||job.version!==1||!Array.isArray(job.parts)||job.parts.length>720||!path.isAbsolute(job.source)||!Number.isFinite(job.duration)||job.duration>MAX_SECONDS)throw new Error('保存された会議データが不正です。');return job;}
 async list(){await fs.mkdir(this.folder,{recursive:true});const names=await fs.readdir(this.folder);const jobs=[];for(const name of names.filter(n=>n.endsWith('.json'))){const j=await this.read(name.slice(0,-5));jobs.push({id:j.id,name:j.name,at:j.at,state:j.state==='running'&&!this.running?'paused':j.state,duration:j.duration,done:j.parts.filter(p=>p.state==='done').length,total:j.parts.length})}return jobs.sort((a,b)=>b.at.localeCompare(a.at));}
 async prepare(source,signal){const stamp=await fingerprint(source),info=await probe(source,this.bin,signal);const parts=Array.from({length:Math.ceil(info.duration/SECONDS)},(_,i)=>({start:i*SECONDS,end:Math.min(info.duration,(i+1)*SECONDS),state:'pending',attempts:0}));
 const job={version:1,boundaryPolicy:'silence-v1',id:randomUUID(),name:path.basename(source),source,stamp,...info,at:new Date().toISOString(),state:'ready',parts};
 await this.decodePart(job,{start:0,end:Math.min(1,job.duration)},this.bin,signal);await this.save(job);return job;}
 async verify(job){if(!equalSource(job.stamp,await fingerprint(job.source)))throw new Error('元ファイルが変更されています。別の会議として読み込み直してください。');}
 async run(id,signal,changed=()=>{}){
 if(this.running)throw new Error('別の会議を処理中です。');this.running=true;let job;
 try{job=await this.read(id);await this.verify(job);job.state='running';await this.save(job);changed(job);
 const settings=this.settings();let consecutiveFailures=0;delete job.error;
 for(const [index,part] of job.parts.entries()){
  signal?.throwIfAborted();if(part.state==='done')continue;await this.verify(job);
  for(let attempt=1;attempt<=3;attempt++){
   signal?.throwIfAborted();part.attempts++;part.error=null;part.state=part.raw===undefined?'recognizing':'correcting';await this.save(job);changed(job,index,attempt);
   let failure;const attemptSignal=AbortSignal.any([signal,AbortSignal.timeout(120000)].filter(Boolean));
   try{
    if(part.raw===undefined){
     if(job.boundaryPolicy==='silence-v1'&&!part.boundary){
      const nominal=Math.min(job.duration,(index+1)*SECONDS);
      const next=job.parts[index+1];
      const scanStart=Math.max(part.start,nominal-5),scanEnd=Math.min(job.duration,nominal+5);
      const boundary=next?quietBoundary(await this.decodePart(job,{start:scanStart,end:scanEnd},this.bin,attemptSignal),scanStart,nominal,job.duration):{at:job.duration,padding:0,reason:'end'};
      // Never change a completed following part when resuming a partial job.
      if(next&&(next.raw!==undefined||next.boundary)){
       part.boundary={at:part.end,padding:0,reason:'saved-next'};
      }else{
       part.boundary=boundary;part.end=boundary.at;
       if(next){next.start=boundary.at;next.audioStart=boundary.at-boundary.padding;}
      }
      part.audioEnd=part.end+part.boundary.padding;
      await this.save(job);
     }
     const range={start:part.audioStart??part.start,end:part.audioEnd??part.end};
     const pcm=await this.decodePart(job,range,this.bin,attemptSignal);signal?.throwIfAborted();const raw=await this.recognizePart(pcm,settings,attemptSignal);if(typeof raw!=='string'||raw.length>12000)throw new Error('認識結果が不正か区間の文字数上限を超えています。');part.raw=raw;
    }
   }catch(e){failure=e;}
   if(!failure){part.state='correcting';await this.save(job);changed(job,index,attempt);
    try{signal?.throwIfAborted();part.corrected=part.raw.trim()?await this.refinePart(part.raw,settings,attemptSignal):'';if(typeof part.corrected!=='string'||part.corrected.length>24000)throw new Error('補正結果が不正です。');part.state='done';}catch(e){failure=e;}
   }
   if(!failure){await this.save(job);changed(job,index,attempt);break;}
   if(signal?.aborted)throw failure;
   part.state='error';part.error=attemptSignal.aborted?'区間の処理が120秒以内に完了しませんでした。':failure.message;delete part.corrected;await this.save(job);changed(job,index,attempt);
   if(attempt<3)await delay(this.retryDelay*attempt,undefined,{signal});
  }
  consecutiveFailures=part.state==='error'?consecutiveFailures+1:0;
  if(consecutiveFailures>=3){job.error='3区間連続で失敗したため中断しました。原因を確認して再開してください。';break;}
 }
 job.state=job.parts.every(p=>p.state==='done')?'done':'partial';await this.save(job);changed(job);return job;
 }catch(error){if(job){job.state=signal?.aborted?'paused':'error';job.error=error.message;await this.save(job);changed(job)}throw error;}
 finally{this.running=false;}
 }
 async remove(id){if(this.running)throw new Error('処理終了後に削除してください。');await fs.unlink(this.file(id));}
}
module.exports={Meetings,extractSubtitles,probe,decode,recognize,transcript,formatTime,atomic,MAX_SECONDS};
