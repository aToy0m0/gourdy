// One correction request at a time. Raw ASR remains the source of truth.
class ProgressiveCorrection {
 constructor(correct,{changed=()=>{},notice=()=>{},delay=900,maxPending=1200,maxRewrite=240}={}){Object.assign(this,{correct,changed,notice,delay,maxPending,maxRewrite});this.raw='';this.parts=[];this.closed=false;this.finishing=false;}
 text(){let at=0,result='';for(const p of this.parts){result+=this.raw.slice(at,p.start)+p.text;at=p.end;}return result+this.raw.slice(at);}
 update(raw){
  if(this.closed||this.raw===raw)return;this.raw=raw;
  const invalid=this.parts.findIndex(p=>raw.slice(0,p.end)!==p.prefix);if(invalid>=0)this.parts.splice(invalid);
  if(this.job&&raw.slice(0,this.job.end)!==this.job.prefix)this.job.controller.abort();
  if(!this.timer&&!this.running&&!this.error)this.timer=setTimeout(()=>this.pump().catch(e=>this.fail(e)),this.delay);
  this.changed(this.text());
 }
 fail(error){this.error=error;this.notice('録音中の補正を停止しました。原文は保持しています: '+error.message);}
 async pump(){
  clearTimeout(this.timer);this.timer=null;
  if(this.closed||this.running||this.error)return;
  const start=this.parts.at(-1)?.end||0,tail=this.raw.slice(start);if(!tail.trim())return;
  if(!this.finishing&&tail.length>this.maxPending){this.fail(new Error('補正待ちが上限に達しました。停止後に履歴の録音から再認識できます。'));return;}
  if(!this.finishing&&tail.length<20)return;
  // Prefer sentence boundaries, then Japanese word boundaries (including emoji).
  let size=Math.min(tail.length,240),sample=tail.slice(0,size),marks=[...sample.matchAll(/[。！？\n]/g)];
  if(marks.length)size=marks.at(-1).index+1;
  else if(!this.finishing&&tail.length<80)return;
  if(size<tail.length&&!marks.length){
   const words=[...new Intl.Segmenter('ja',{granularity:'word'}).segment(tail)];
   size=words.map(w=>w.index+w.segment.length).filter(end=>end<=size).at(-1)||0;
   if(!size){this.fail(new Error('区切れない長い語句があります。原文を確認してください。'));return;}
  }
  const end=start+size,prefix=this.raw.slice(0,end),raw=this.raw.slice(start,end),controller=new AbortController();this.job={end,prefix,controller};
  this.running=(async()=>{
   try{const result=await this.correct(raw,controller.signal,{contextBefore:this.raw.slice(Math.max(0,start-160),start),contextAfter:this.raw.slice(end,end+160)});
    if(!this.closed&&!controller.signal.aborted&&this.raw.slice(0,end)===prefix){
     if(!this.finishing&&this.raw.length-end>this.maxRewrite){this.fail(new Error('補正が入力に追いつかないため、長い末尾の書き戻しを避けました。'));return;}
     if(typeof result.corrected!=='string')throw new Error('補正結果が文字列ではありません。');
     this.parts.push({start,end,prefix,text:result.corrected});this.changed(this.text());
    }
   }catch(error){if(!controller.signal.aborted)this.fail(error);}
   finally{this.job=null;this.running=null;}
  })();
  await this.running;
  clearTimeout(this.timer);
  if(!this.closed&&!this.finishing&&!this.error)this.timer=setTimeout(()=>this.pump().catch(e=>this.fail(e)),this.delay);
 }
 async finish(raw){this.finishing=true;this.update(raw);clearTimeout(this.timer);await this.running;
  while(!this.error&&!this.closed&&(this.parts.at(-1)?.end||0)<this.raw.length){const before=this.parts.at(-1)?.end||0;await this.pump();if((this.parts.at(-1)?.end||0)===before)break;}
  if(this.error)throw this.error;return this.text();
 }
 async close(){this.closed=true;clearTimeout(this.timer);this.job?.controller.abort();await this.running;}
}
module.exports={ProgressiveCorrection};
