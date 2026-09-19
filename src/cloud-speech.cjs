const WebSocket=require('ws');
const MODELS={openai:'gpt-live-transcribe',gemini:'gemini-3.5-transcribe-live'};
// 16 kHz Float32 microphone audio -> signed PCM16. OpenAI requires 24 kHz.
// Carry the final input sample across chunks so resampling has no boundary gaps.
class PcmEncoder {
 constructor(rate){this.rate=rate;this.offset=0;this.tail=[];}
 encode(bytes,final=false){const buffer=Buffer.from(bytes);if(buffer.length%4)throw new Error('PCMの形式が不正です。');const values=this.tail.slice();for(let i=0;i<buffer.length;i+=4){const n=buffer.readFloatLE(i);if(!Number.isFinite(n))throw new Error('PCMの値が不正です。');values.push(n);}const out=[];
  // Integer phase (units: input sample * output rate) avoids cumulative
  // rounding drift when the same stream is divided into different chunk sizes.
  while(this.offset<(final?values.length:values.length-1)*this.rate){const i=Math.floor(this.offset/this.rate),f=(this.offset%this.rate)/this.rate,n=Math.max(-1,Math.min(1,values[i]*(1-f)+(values[Math.min(i+1,values.length-1)]??0)*f));out.push(Math.round(n*(n<0?32768:32767)));this.offset+=16000;}
  const consumed=Math.min(values.length,Math.floor(this.offset/this.rate));this.tail=values.slice(consumed);this.offset-=consumed*this.rate;const result=Buffer.alloc(out.length*2);out.forEach((n,i)=>result.writeInt16LE(n,i*2));return result.toString('base64');
 }
}
class CloudSpeech {
 constructor(provider,key,{changed=()=>{},WebSocketClass=WebSocket,timeout=20000}={}){
  if(!MODELS[provider])throw new Error('APIの選択が不正です。');
  Object.assign(this,{provider,changed,timeout,items:new Map(),order:[],finals:new Set(),commits:new Set(),text:'',committedText:'',interim:'',samples:0,turnSamples:0});
  this.encoder=new PcmEncoder(provider==='openai'?24000:16000);
  this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});this.ready.catch(()=>{});
  this.readyTimer=setTimeout(()=>this.fail(new Error('音声APIの準備が20秒以内に完了しませんでした。')),timeout);
  const openai=provider==='openai';
  this.socket=new WebSocketClass(openai?'wss://api.openai.com/v1/realtime?intent=transcription':`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`,openai?{headers:{Authorization:`Bearer ${key}`},maxPayload:1024*1024}:{maxPayload:1024*1024});
  this.socket.on('open',()=>this.send(openai?{type:'session.update',session:{type:'transcription',audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:MODELS.openai,languages:['ja'],delay:'low'},turn_detection:null}}}}:{setup:{model:'models/'+MODELS.gemini,generationConfig:{responseModalities:['TEXT']},realtimeInputConfig:{automaticActivityDetection:{disabled:true}},inputAudioTranscription:{languageCodes:['ja-JP'],mode:'VERBATIM'}}}));
  this.socket.on('message',data=>{try{this.receive(JSON.parse(data.toString()));}catch{this.fail(new Error('音声APIの応答形式が不正です。'));}});
  this.socket.on('error',()=>this.fail(new Error(`${provider}の音声APIに接続できません。APIキー・通信・利用上限を確認してください。`)));
  this.socket.on('close',code=>{if(!this.closed)this.fail(new Error(`${provider}の音声接続が切れました（${code}）。認識済みの文章は保持しています。`));});
 }
 send(value){if(this.failure)throw this.failure;if(this.socket.bufferedAmount>1024*1024){this.fail(new Error('音声の送信が追いつかないため停止しました。'));throw this.failure;}this.socket.send(JSON.stringify(value));}
 receive(e){
  if(this.closed||this.failure)return;
  if(e.error?.code==='invalid_api_key')return this.fail(new Error('OpenAIのAPIキーが無効です。設定の「AI接続」で登録し直してください。'));
  if(e.error||e.type==='conversation.item.input_audio_transcription.failed')return this.fail(new Error(`${this.provider}の音声認識APIがエラーを返しました。設定・利用上限を確認してください。`));
  if(e.type==='session.updated'||e.setupComplete){clearTimeout(this.readyTimer);if(e.setupComplete)this.send({realtimeInput:{activityStart:{}}});this.resolveReady();return;}
  if(this.provider==='openai'){
   if(e.type==='input_audio_buffer.committed'){
    this.commits.add(e.item_id);this.awaitingCommit=Math.max(0,(this.awaitingCommit||0)-1);
    this.order=this.order.filter(id=>id!==e.item_id);const at=this.order.indexOf(e.previous_item_id);this.order.splice(at<0?0:at+1,0,e.item_id);
   }
   if(e.type==='conversation.item.input_audio_transcription.delta'||e.type==='conversation.item.input_audio_transcription.completed'){
    if(typeof e.item_id!=='string')throw new Error('Missing item');
    if(!this.order.includes(e.item_id))this.order.push(e.item_id);
    if(e.type.endsWith('.completed')){this.items.set(e.item_id,e.transcript);this.finals.add(e.item_id);}else if(!this.finals.has(e.item_id))this.items.set(e.item_id,(this.items.get(e.item_id)||'')+e.delta);
   }
   this.publish(this.order.map(id=>this.items.get(id)||'').join(''));
   if(this.stopping&&!this.awaitingCommit&&[...this.commits].every(id=>this.finals.has(id)))this.finishResolve?.({text:this.text});
  }else{
   const c=e.serverContent;if(!c)return;
   if(c.interimInputTranscription)this.interim=c.interimInputTranscription.text||'';
   if(c.inputTranscription){this.committedText+=c.inputTranscription.text||'';this.interim='';}
   this.publish(this.committedText+this.interim);
   if((c.inputTranscription||c.turnComplete)&&this.stopping&&!this.interim)this.finishResolve?.({text:this.text});
  }
 }
 publish(text){if(typeof text!=='string'||text.length>12000)return this.fail(new Error('文字数の上限に達しました。'));if(text!==this.text){this.text=text;this.changed({text});}}
 commit(){this.send({type:'input_audio_buffer.commit'});this.awaitingCommit=(this.awaitingCommit||0)+1;this.turnSamples=0;}
 async request(kind,bytes){await this.ready;if(this.failure)throw this.failure;
  if(kind==='audio'){
   const pcm=this.encoder.encode(bytes);this.samples+=bytes.length/4;this.turnSamples+=bytes.length/4;
   this.send(this.provider==='openai'?{type:'input_audio_buffer.append',audio:pcm}:{realtimeInput:{audio:{data:pcm,mimeType:'audio/pcm;rate=16000'}}});
   if(this.provider==='openai'&&this.turnSamples>=240000)this.commit();
   return {text:this.text};
  }
  if(kind!=='stop')throw new Error('音声処理が不正です。');
  if(!this.samples)return {text:''};
  this.stopping=true;
  return new Promise((resolve,reject)=>{
   this.finishResolve=result=>{clearTimeout(this.finishTimer);resolve(result);};this.finishReject=reject;
   this.finishTimer=setTimeout(()=>this.fail(new Error('音声APIの最終結果が20秒以内に届きませんでした。途中結果は保持しています。')),this.timeout);
   const tail=this.encoder.encode(Buffer.alloc(0),true);
   if(this.provider==='openai'){
    if(this.turnSamples){this.send({type:'input_audio_buffer.append',audio:tail});if(this.turnSamples<1600)this.send({type:'input_audio_buffer.append',audio:Buffer.alloc(4800).toString('base64')});this.commit();}
    else if(!this.awaitingCommit&&[...this.commits].every(id=>this.finals.has(id)))this.finishResolve({text:this.text});
   }else{if(tail)this.send({realtimeInput:{audio:{data:tail,mimeType:'audio/pcm;rate=16000'}}});this.send({realtimeInput:{activityEnd:{}}});}
  });
 }
 fail(error){if(this.failure||this.closed)return;this.failure=error;clearTimeout(this.readyTimer);clearTimeout(this.finishTimer);this.rejectReady(error);this.finishReject?.(error);this.socket?.terminate();}
 async close(){if(!this.closed){this.fail(new Error('音声API接続を終了しました。'));this.closed=true;this.socket?.terminate();}}
}
module.exports={CloudSpeech,PcmEncoder,MODELS};
