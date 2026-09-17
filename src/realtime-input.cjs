const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const path=require('node:path');
class RealtimeInput {
  constructor(target,signal){
    this.pending=null;this.failure=null;
    this.child=spawn(path.join(__dirname,'WindowTarget.exe'),['realtime',target.handle,String(target.pid),String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stderr='';this.child.stderr.on('data',data=>{stderr=(stderr+data).slice(-2000)});
    this.closed=new Promise(resolve=>this.child.once('close',()=>{clearTimeout(this.shutdownTimer);this.failure??=new Error(stderr.trim()||'入力監視を終了しました。');if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(this.failure);this.pending=null;}resolve();}));
    this.child.on('error',error=>this.fail(error));this.child.stdin.on('error',error=>this.fail(error));
    createInterface({input:this.child.stdout}).on('line',line=>{
      try{const response=JSON.parse(line),pending=this.pending;if(response.ready)this.verification=response.verification;if(!pending)throw new Error('入力監視の応答順が不正です。');this.pending=null;clearTimeout(pending.timer);if(Object.hasOwn(response,'error'))pending.reject(Object.assign(new Error(response.error||'入力監視で詳細不明のエラーが発生しました。'),{code:response.code,mayHaveWritten:response.mayHaveWritten,confirmedWritten:response.confirmedWritten}));else if(response.ready===true||typeof response.written==='string')pending.resolve(response);else pending.reject(new Error('入力監視の応答形式が不正です。'));}
      catch(error){this.fail(error);}
    });
    this.abort=()=>this.fail(new Error('入力を中断しました。'));this.signal=signal;
    if(signal?.aborted)this.abort();else signal?.addEventListener('abort',this.abort,{once:true});
  }
  fail(error){if(this.failure)return;this.failure=error;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(this.failure);this.pending=null;}this.child.stdin.end();this.shutdownTimer=setTimeout(()=>this.child.kill(),3000);}
  request(data){if(this.failure)return Promise.reject(this.failure);if(this.pending)return Promise.reject(new Error('入力要求が重複しています。'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.fail(new Error('入力監視が応答しません。録音を再開してください。')),10000);this.pending={resolve,reject,timer};this.child.stdin.write(JSON.stringify(data)+'\n');});}
  async close(){this.signal?.removeEventListener('abort',this.abort);this.fail(new Error('入力を終了しました。'));await this.closed;}
}
module.exports={RealtimeInput};
