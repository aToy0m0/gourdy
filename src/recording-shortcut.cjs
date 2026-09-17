const {spawn}=require('node:child_process'),path=require('node:path'),{createInterface}=require('node:readline');
const {singleKeys}=require('./shortcuts.js');
class RecordingShortcut {
 constructor(globalShortcut,callback,onError){this.global=globalShortcut;this.callback=callback;this.onError=onError;this.helpers=new Map();}
 async register(key){
  if(!singleKeys[key])return this.global.register(key,this.callback);
  const child=spawn(path.join(__dirname,'ModifierShortcut.exe'),[String(singleKeys[key])],{windowsHide:true,stdio:['pipe','pipe','pipe']});let error='',ready=false,closed=false;
  const stop=()=>{closed=true;this.helpers.delete(key);child.stdin.end();child.kill();};
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{stop();reject(new Error('修飾キー監視の起動がタイムアウトしました。'));},5000);
   child.stderr.on('data',chunk=>{error=(error+chunk).slice(-2000)});
   child.stdin.on('error',()=>{});
   child.once('error',e=>{clearTimeout(timer);stop();reject(e)});
   createInterface({input:child.stdout}).on('line',line=>{if(line==='ready'){ready=true;clearTimeout(timer);this.helpers.set(key,stop);resolve(true);}else if(line==='tap'&&ready&&!closed)this.callback();});
   child.once('exit',code=>{clearTimeout(timer);if(closed)return;this.helpers.delete(key);const e=new Error('修飾キーの監視が終了しました: '+(error||code));if(ready)this.onError(e);else reject(e);});
  });
 }
 unregister(key){const stop=this.helpers.get(key);if(stop)stop();else if(!singleKeys[key])this.global.unregister(key);}
 close(){for(const stop of [...this.helpers.values()])stop();}
}
module.exports={RecordingShortcut};
