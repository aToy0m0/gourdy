const path=require('node:path'),fs=require('node:fs/promises'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {CommandModel}=require('./command-model.cjs');
const assets=require('./assets/local-models.json');
class LocalModels {
 constructor(folder,python,notify=()=>{},files=assets){this.folder=folder;this.python=python;this.notify=notify;this.total=files.reduce((n,f)=>n+f.bytes,0);this.models=files.map(asset=>new CommandModel(folder,()=>this.update(),asset));this.state={state:'missing',received:0,total:this.total};this.nlpModel=path.join(folder,'ja_ginza/ja_ginza-5.2.0');}
 update(state,error=''){this.state={state:state||'downloading',received:this.models.reduce((n,m)=>n+m.state.received,0),total:this.total,error};this.notify(this.state);}
 async inspect(){for(const m of this.models)await m.inspect();let extracted=false;try{await fs.access(path.join(this.nlpModel,'config.cfg'));extracted=true;}catch(e){if(e.code!=='ENOENT')throw e;}this.update(this.models.every(m=>m.state.state==='ready')&&extracted?'ready':'missing');return this.state;}
 assertReady(){if(this.state.state!=='ready')throw new Error('ローカルモデルが未取得です。設定の「AI接続」でダウンロードしてください。');}
 download(){if(this.pending)throw new Error('ローカルモデルをダウンロード中です。');this.cancelled=false;this.pending=this.transfer().finally(()=>{this.pending=null;});return this.pending;}
 cancel(){this.cancelled=true;for(const m of this.models)m.cancel();}
 async transfer(){
  try{this.update();for(const m of this.models){if(this.cancelled)throw new Error('ダウンロードを中止しました。');if(m.state.state!=='ready')await m.download();}
   if(this.cancelled)throw new Error('ダウンロードを中止しました。');this.update('verifying');
   await promisify(execFile)(this.python,['-I',path.join(__dirname,'extract-model.py'),path.join(this.folder,'ja_ginza-5.2.0-py3-none-any.whl'),this.folder],{windowsHide:true,timeout:60000});
   if(this.cancelled)throw new Error('ダウンロードを中止しました。');this.update('ready');return this.state;
  }catch(e){this.update(this.cancelled?'missing':'error',e.message);throw e;}
 }
}
module.exports={LocalModels,assets};
