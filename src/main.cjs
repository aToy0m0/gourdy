const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, dialog, clipboard, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const { exportDictionary } = require('./dictionary-export.cjs');
const {parseDictionary,MAX_DICTIONARY_BYTES}=require('./dictionary-import.cjs');
const {readImeDictionary,mergeIme,importMessage}=require('./ime-dictionary.cjs');
const { Store, defaults, validate, trimHistory } = require('./store.cjs');
const {Recordings}=require('./recordings.cjs');
const {shortcutKeys}=require('./voice-commands.cjs');
const {planCommand}=require('./command-plan.cjs');
const {CommandModel}=require('./command-model.cjs');
const { Meetings, decode, transcript, recognize } = require('./meetings.cjs');
const { Moonshine } = require('./moonshine.cjs');
const { refine } = require('./refine.cjs');
const { windowTarget } = require('./window-target.cjs');
const {RealtimeInput}=require('./realtime-input.cjs');
app.disableHardwareAcceleration();
// Keep existing profiles when the display/product name changes.
app.setPath('userData', path.join(app.getPath('appData'), 'local-dictation-streaming'));
if (process.env.DICTATION_TEST_DATA) app.setPath('userData', process.env.DICTATION_TEST_DATA);
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
let mini, editor, tray, store, live, phase = 'idle', shuttingDown = false, latest = null, saving = Promise.resolve(), closingEditor = false;
let mediaController=null,mediaDone=null,meetings,recordings,commandSession=null;
let commandModel,commandDownload=null,downloadRequest=null;
let inputController, recovering=false;
let enginePromise, controller, picking=false,lastNotice='',importing=false;
const engine = () => ({
  python: path.join(root,'runtime/python/python.exe'), moonshineModel: path.join(root,'models/moonshine-small-ja'), moonshineRuntime: path.join(root,'runtime/moonshine'),
  llmEngine: path.join(root,'runtime/llama/llama-server.exe'), llmModel: path.join(root,'models/Qwen3.5-0.8B-Q4_0.gguf'),
  replacements: store.data.settings.replacements,
  glossary: store.data.settings.terms.filter(t=>t.term.trim() && t.reading.trim()).map(t=>({term:t.term.trim(),reading:t.reading.trim(),aliases:[t.reading.trim()],contexts:[],auto:true}))
});
function trusted(event, name) {
  const window = name === 'mini' ? mini : editor;
  const file = name === 'mini' ? 'index.html' : 'settings.html';
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame?.url !== pathToFileURL(path.join(__dirname,file)).href) throw new Error('許可されていない画面です。');
}
function send(window, channel, value) { if(window && !window.isDestroyed())window.webContents.send(channel,value); }
function snapshot() { return {...store.data, latest, phase, version:app.getVersion(), dataPath:store.file,notice:lastNotice,commandModel:commandModel?.state}; }
function broadcast() { send(mini,'settings-changed',store.data.settings);send(editor,'data-changed',snapshot()); }
function setPhase(value) {phase=value;tray?.setToolTip('okosy — '+({idle:'待機中',starting:'準備中',recording:'録音中',processing:'補正中'}[value]));send(editor,'phase-changed',value);}
function report(error) { lastNotice=error.message; send(mini,'notice',error.message);send(editor,'notice',error.message);if(tray)tray.setToolTip('okosy — '+error.message.slice(0,90)); }
function serialize(fn) { const result=saving.then(fn);saving=result.then(()=>{},()=>{});return result; }
function secureWindow(window, file) {
  window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  return window.loadFile(path.join(__dirname,file));
}
async function ensureMini() {
  if(mini && !mini.isDestroyed())return;
  mini=new BrowserWindow({width:315,height:112,useContentSize:true,resizable:false,frame:false,show:false,focusable:false,alwaysOnTop:true,backgroundColor:'#ffffff',skipTaskbar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  mini.setSkipTaskbar(!store.data.settings.showTaskbar);
  mini.on('close',event=>{if(!shuttingDown){event.preventDefault();mini.hide();}});
  await secureWindow(mini,'index.html');
}
async function showMini() {await ensureMini();mini.showInactive();}
async function showSettings(tab='operation') {
  if(editor && !editor.isDestroyed()){editor.show();editor.focus();send(editor,'select-tab',tab);return;}
  editor=new BrowserWindow({width:680,height:700,minWidth:420,minHeight:450,frame:false,show:false,minimizable:false,title:'okosy - 設定',backgroundColor:'#ffffff',skipTaskbar:!store.data.settings.showTaskbar,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  closingEditor=false;
  editor.on('close',event=>{if(!shuttingDown&&!closingEditor){event.preventDefault();send(editor,'request-close');}});
  editor.on('closed',()=>{editor=null;});
  await secureWindow(editor,'settings.html');send(editor,'select-tab',tab);editor.show();
}
async function startCommand() {
  if(!store.data.settings.commandEnabled||commandModel.state.state!=='ready')return;
  if(commandSession)return;
  if(phase!=='idle'||picking){report(new Error('通常の録音・補正を停止してからコマンドキーを押してください。'));return;}
  const token={};commandSession=token;
  await ensureMini();send(mini,'command-start');
  try {await windowTarget('wait-release',null,shortcutKeys(store.data.settings.commandShortcut));}
  catch(error){token.error=error.message;report(error);}
  finally{if(commandSession===token)send(mini,'command-release',{error:token.error});}
}
function registerCommand(shortcut){return globalShortcut.register(shortcut,()=>startCommand().catch(error=>{commandSession=null;report(error)}));}
function register(shortcut){return globalShortcut.register(shortcut,()=>toggle().catch(report));}
async function saveSettings(patch, preserveHistory=false) {
  if(phase!=='idle')throw new Error('録音・補正が終わってから設定を変更してください。');
  if(!patch || typeof patch!=='object' || Object.keys(patch).some(k=>!Object.hasOwn(defaults,k)))throw new Error('設定項目が不正です。');
  if(patch.commandEnabled===false&&downloadRequest){downloadRequest.cancelled=true;commandModel.cancel();}
  return serialize(async()=>{
    const previous=store.data.settings,next=validate({...previous,...patch});
    next.replacements=next.replacements.map(r=>({from:r.from.trim(),to:r.to.trim()})).filter(r=>r.from||r.to);
    next.terms=next.terms.map(t=>({term:t.term.trim(),reading:t.reading.trim()})).filter(t=>t.term||t.reading);
    if(next.commandEnabled&&commandModel.state.state!=='ready')throw new Error('コマンド用モデルをダウンロードしてください。');
    const registerNewCommand=next.commandEnabled&&(!previous.commandEnabled||next.commandShortcut!==previous.commandShortcut);
    const unregisterOldCommand=previous.commandEnabled&&(!next.commandEnabled||next.commandShortcut!==previous.commandShortcut);
    const newKey=next.shortcut!==previous.shortcut, newStartup=next.launchAtStartup!==previous.launchAtStartup;
    if(newStartup&&!app.isPackaged)throw new Error('自動起動はビルド済みアプリで設定してください。');
    if(newKey&&!register(next.shortcut))throw new Error('このショートカットは他のアプリで使用中です。');
    if(registerNewCommand&&!registerCommand(next.commandShortcut)){if(newKey)globalShortcut.unregister(next.shortcut);throw new Error('コマンドショートカットは他のアプリで使用中です。');}
    try {
      if(newStartup){app.setLoginItemSettings({openAtLogin:next.launchAtStartup,path:process.execPath,args:['--autostart']});if(app.getLoginItemSettings({path:process.execPath,args:['--autostart']}).openAtLogin!==next.launchAtStartup)throw new Error('Windowsの自動起動設定を確認できません。');}
      await store.write({...store.data,settings:next,history:preserveHistory?store.data.history:trimHistory(store.data.history,next)});
    } catch(error) {
      if(registerNewCommand)globalShortcut.unregister(next.commandShortcut);
      if(newKey)globalShortcut.unregister(next.shortcut);
      if(newStartup)app.setLoginItemSettings({openAtLogin:previous.launchAtStartup,path:process.execPath,args:['--autostart']});
      throw error;
    }
    if(newKey)globalShortcut.unregister(previous.shortcut);
    if(unregisterOldCommand)globalShortcut.unregister(previous.commandShortcut);
    mini?.setSkipTaskbar(!next.showTaskbar);editor?.setSkipTaskbar(!next.showTaskbar);broadcast();return snapshot();
  });
}
async function importIme(automatic=false){
 if(importing)throw new Error('Windows辞書を取り込み中です。');
 if(phase!=='idle')throw new Error('録音・補正が終わってから取り込んでください。');
 importing=true;
 try{const entries=await readImeDictionary();return await serialize(async()=>{
   if(phase!=='idle')throw new Error('録音が始まったため取り込みを中止しました。');
   const result=mergeIme(store.data,entries,{automatic});await store.write(result.data);broadcast();return {...snapshot(),importStats:result.stats};
 });}finally{importing=false;}
}
function writeLive(text) {
  const active=live;if(!active?.state || active.blocked)return;
  active.pendingText=text;if(active.writing)return;
  active.writing=Promise.resolve().then(async()=>{try{while(active.pendingText!==undefined&&!active.blocked){const next=active.pendingText;active.pendingText=undefined;if(next!==active.state.written)active.state=await active.input.request({kind:'write',text:next});}}
  catch(error){active.blocked=error.message;report(error);}}).finally(()=>{active.writing=null;});
}
async function toggle(){await ensureMini();send(mini,'toggle');}
async function remember(text, original, status, id) {
  if(!text.trim())return;
  latest={id:id||randomUUID(),at:new Date().toISOString(),text,original,status};
  await serialize(()=>store.write({...store.data,history:trimHistory([latest,...store.data.history.filter(e=>e.id!==latest.id)],store.data.settings)}));
  broadcast();return latest.id;
}
if(!app.requestSingleInstanceLock())app.quit();else {
  app.on('second-instance',()=>showMini().catch(report));
  app.whenReady().then(async()=>{
    store=new Store(app.getPath('userData'));await store.load();
    commandModel=new CommandModel(path.join(store.folder,'models'),state=>send(editor,'command-model-changed',state));
    await commandModel.inspect();
    if(store.data.settings.commandEnabled&&commandModel.state.state!=='ready'){
      if(commandModel.state.state==='missing')commandModel.update({error:'保存済みモデルが見つかりません。再ダウンロードしてください。'});
      await store.write({...store.data,settings:{...store.data.settings,commandEnabled:false}});
    }
    recordings=new Recordings(path.join(app.getPath('userData'),'recordings'));await recordings.recover();
    const cleanup=setInterval(()=>{if(phase==='idle')recordings.prune().catch(report);},3600000);cleanup.unref();
    meetings=new Meetings(path.join(app.getPath('userData'),'meetings'),path.join(root,'runtime/ffmpeg'),engine);
    session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(Boolean((contents===mini?.webContents || contents===editor?.webContents) && permission==='media' && details.mediaTypes?.every(t=>t==='audio'))));
    session.defaultSession.setPermissionCheckHandler((contents,permission)=>Boolean((contents===mini?.webContents||contents===editor?.webContents)&&permission==='media'));
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_,cb)=>cb({cancel:true}));
    const pixels=Buffer.alloc(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;const m=(x>=12&&x<=19&&y>=5&&y<=20)||(y>=22&&y<=24&&x>=8&&x<=23)||(x>=14&&x<=17&&y>=24&&y<=28);pixels[i]=pixels[i+1]=pixels[i+2]=m?255:38;pixels[i+3]=255;}
    tray=new Tray(nativeImage.createFromBitmap(pixels,{width:32,height:32}));tray.setToolTip('okosy — 待機中');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'okosyを開く',click:()=>showMini().catch(report)},{label:'設定',click:()=>showSettings().catch(report)},{label:'録音を開始 / 停止',click:()=>toggle().catch(report)},{type:'separator'},{label:'終了',click:()=>app.quit()}]));
    tray.on('double-click',()=>showMini().catch(report));
    ipcMain.handle('snapshot',event=>{trusted(event,'settings');return snapshot();});
    ipcMain.handle('mini-settings',event=>{trusted(event,'mini');return store.data.settings;});
    ipcMain.handle('report-mini-error',(event,message)=>{trusted(event,'mini');if(typeof message!=='string'||message.length>4000)throw new Error('エラー情報が不正です。');lastNotice=message;send(editor,'notice',message);});
    ipcMain.handle('cancel-media',event=>{trusted(event,'settings');mediaController?.abort();});
    ipcMain.handle('recording-list',async event=>{trusted(event,'settings');await recordings.prune();return recordings.list();});
    ipcMain.handle('recording-preview',async(event,id)=>{trusted(event,'settings');const row=await recordings.read(id);if(row.state==='recording'||!row.duration)throw new Error('録音終了後に再生してください。');const pcm=await decode({source:recordings.file(id,'wav'),audioStream:0},{start:0,end:row.duration},meetings.bin,undefined,true);return 'data:audio/wav;base64,'+pcm.toString('base64');});
    ipcMain.handle('recording-delete',async(event,id)=>{trusted(event,'settings');if(phase!=='idle')throw new Error('処理終了後に削除してください。');await recordings.remove(id);});
    ipcMain.handle('recording-retry',async(event,id)=>{
      trusted(event,'settings');if(phase!=='idle'||commandSession)throw new Error('現在の処理が終わってから再認識してください。');
      const row=await recordings.read(id);if(!row.duration||row.state==='recording')throw new Error('再認識できる音声がありません。');
      setPhase('processing');controller=new AbortController();
      try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(300000)]),settings=engine();
        const pcm=await decode({source:recordings.file(id,'wav'),audioStream:0},{start:0,end:row.duration},meetings.bin,signal);
        const raw=await recognize(pcm,settings,signal);if(!raw.trim())throw new Error('音声から文字を認識できませんでした。音声は残っています。');
        const historyId=await remember(raw,raw,'再認識・未補正');
        const result=await refine(raw,settings,signal);await remember(result.corrected,raw,'再認識・確認待ち',historyId);
      }finally{controller=null;setPhase('idle');}
      return snapshot();
    });
    ipcMain.handle('meeting-list',event=>{trusted(event,'settings');return meetings.list();});
    ipcMain.handle('meeting-read',(event,id)=>{trusted(event,'settings');return meetings.read(id);});
    ipcMain.handle('meeting-select',async event=>{
      trusted(event,'settings');if(phase!=='idle'||importing)throw new Error('現在の処理が終わってから読み込んでください。');
      const selected=await dialog.showOpenDialog(editor,{title:'音声・動画を選ぶ',properties:['openFile'],filters:[{name:'音声・動画',extensions:['wav','mp3','m4a','mp4','webm','mkv','mov','flac','ogg','aac','wma','wmv']},{name:'すべてのファイル',extensions:['*']}]});
      if(selected.canceled)return null;if(phase!=='idle')throw new Error('録音が始まったため、読み込みを中止しました。');
      setPhase('processing');try{return await meetings.prepare(selected.filePaths[0]);}finally{setPhase('idle');}
    });
    ipcMain.handle('meeting-preview',async(event,id,start)=>{
      trusted(event,'settings');const job=await meetings.read(id);await meetings.verify(job);
      if(!Number.isFinite(start)||start<0||start>=job.duration)throw new Error('再生位置が不正です。');
      const end=Math.min(start+30,job.duration);const audio=await decode(job,{start,end},meetings.bin,undefined,true);
      return {url:'data:audio/wav;base64,'+audio.toString('base64'),start,end};
    });
    ipcMain.handle('meeting-run',async(event,id)=>{
      trusted(event,'settings');if(phase!=='idle'||importing)throw new Error('現在の処理が終わってから開始してください。');
      const configuration=engine();for(const key of ['python','llmEngine','llmModel','moonshineModel','moonshineRuntime']){try{await fs.access(configuration[key]);}catch{throw new Error(`${key}が見つかりません。配布ファイルを確認してください。`);}}
      mediaController=new AbortController();setPhase('processing');
      mediaDone=meetings.run(id,mediaController.signal,(job,index,attempt)=>send(editor,'meeting-changed',{job,index,attempt}));
      try{return await mediaDone;}finally{mediaController=null;mediaDone=null;setPhase('idle');}
    });
    ipcMain.handle('meeting-copy',async(event,id)=>{trusted(event,'settings');clipboard.writeText(transcript(await meetings.read(id)));});
    ipcMain.handle('meeting-export',async(event,id)=>{
      trusted(event,'settings');const job=await meetings.read(id);const result=await dialog.showSaveDialog(editor,{title:'会議の全文を書き出す',defaultPath:job.name+'.txt',filters:[{name:'テキスト',extensions:['txt']}]});
      if(result.canceled)return false;await fs.writeFile(result.filePath,transcript(job),'utf8');return true;
    });
    ipcMain.handle('meeting-delete',async(event,id)=>{trusted(event,'settings');if(phase!=='idle')throw new Error('処理終了後に削除してください。');await meetings.remove(id);});
    ipcMain.handle('download-command-model',async event=>{
      trusted(event,'settings');if(commandDownload)throw new Error('ダウンロード中です。');
      if(phase!=='idle')throw new Error('録音・補正が終わってから操作してください。');
      const request={cancelled:false};downloadRequest=request;
      commandDownload=(async()=>{await commandModel.download();if(request.cancelled)return snapshot();return saveSettings({commandEnabled:true});})();
      try{return await commandDownload;}finally{commandDownload=null;downloadRequest=null;}
    });
    ipcMain.handle('cancel-command-download',event=>{trusted(event,'settings');if(downloadRequest)downloadRequest.cancelled=true;commandModel.cancel();});
    ipcMain.handle('export-ime',async event=>{
      trusted(event,'settings');if(phase!=='idle')throw new Error('録音・補正が終わってから操作してください。');
      const result=exportDictionary(store.data.settings.terms);
      const destination=await dialog.showSaveDialog(editor,{title:'辞書を書き出す',defaultPath:'okosy辞書.txt',filters:[{name:'Microsoft IME ユーザー辞書',extensions:['txt']}]});
      if(destination.canceled)return {canceled:true};
      await fs.writeFile(destination.filePath,result.buffer);return {canceled:false,count:result.count};
    });
    ipcMain.handle('import-ime',event=>{trusted(event,'settings');return importIme();});
    ipcMain.handle('import-dictionary-file',async event=>{
      trusted(event,'settings');
      if(importing)throw new Error('辞書を取り込み中です。');
      if(phase!=='idle')throw new Error('録音・補正が終わってから取り込んでください。');
      importing=true;
      try{
        const selected=await dialog.showOpenDialog(editor,{title:'辞書ファイルを取り込む',properties:['openFile'],filters:[{name:'辞書テキスト',extensions:['txt','tsv']}]});
        if(selected.canceled)return {canceled:true};
        const file=await fs.open(selected.filePaths[0],'r');let entries;
        try{
          const stat=await file.stat();if(!stat.isFile()||stat.size>MAX_DICTIONARY_BYTES)throw new Error('辞書ファイルは4MB以内のテキストを選んでください。');
          const buffer=Buffer.alloc(MAX_DICTIONARY_BYTES+1);let length=0;
          while(length<buffer.length){const {bytesRead}=await file.read(buffer,length,buffer.length-length,null);if(!bytesRead)break;length+=bytesRead;}
          entries=parseDictionary(buffer.subarray(0,length));
        }finally{await file.close();}
        return await serialize(async()=>{
          if(phase!=='idle')throw new Error('録音・補正が終わってから取り込んでください。');
          const result=mergeIme(store.data,entries);await store.write(result.data);broadcast();
          return {...snapshot(),importStats:result.stats,canceled:false};
        });
      }finally{importing=false;}
    });
    ipcMain.handle('save-settings',(event,patch)=>{trusted(event,'settings');return saveSettings(patch);});
    ipcMain.handle('close-settings',event=>{trusted(event,'settings');closingEditor=true;editor.close();});
    ipcMain.handle('open-settings',(event,tab)=>{trusted(event,'mini');return showSettings(['operation','history'].includes(tab)?tab:'operation');});
    ipcMain.handle('hide-mini',event=>{trusted(event,'mini');mini.hide();});
    ipcMain.handle('destroy-data',async(event,action)=>{
      trusted(event,'settings');if(phase!=='idle')throw new Error('録音・補正が終わってから操作してください。');
      if(action==='reset')return saveSettings({...structuredClone(defaults),terms:store.data.settings.terms,replacements:store.data.settings.replacements},true);
      if(!['all','history','terms'].includes(action))throw new Error('削除対象が不正です。');
      if(['all','history'].includes(action))for(const row of await recordings.list())await recordings.remove(row.id);
      await serialize(async()=>{await store.write({...store.data,settings:{...store.data.settings,replacements:['all','terms'].includes(action)?[]:store.data.settings.replacements,terms:['all','terms'].includes(action)?[]:store.data.settings.terms},history:['all','history'].includes(action)?[]:store.data.history});if(['all','history'].includes(action))latest=null;});broadcast();return snapshot();
    });
    ipcMain.handle('delete-history',async(event,id)=>{
      trusted(event,'settings');
      await serialize(async()=>{
        if(phase!=='idle')throw new Error('録音・補正が終わってから操作してください。');
        if(typeof id!=='string'||!store.data.history.some(e=>e.id===id)&&latest?.id!==id)throw new Error('削除対象の履歴が見つかりません。');
        await store.write({...store.data,history:store.data.history.filter(e=>e.id!==id)});
        if(latest?.id===id)latest=null;
      });broadcast();return snapshot();
    });
    ipcMain.handle('copy', (event,text)=>{trusted(event,'settings');if(typeof text!=='string'||text.length>100000)throw new Error('テキストが不正です。');clipboard.writeText(text);});
    ipcMain.handle('paste-at-cursor',async(event,text)=>{
      trusted(event,'settings');if(phase!=='idle'||picking)throw new Error('処理が終わってから貼り付けてください。');
      if(typeof text!=='string'||!text||text.length>100000)throw new Error('文章を確認してください。');
      picking=true;clipboard.writeText(text);editor.hide();
      send(mini,'notice','入力したい位置をクリックしてください。Escでキャンセル。');
      try {await windowTarget('pick-paste');lastNotice='';send(mini,'notice','');}
      catch(error){report(error);editor?.show();throw error;}
      finally{picking=false;}
    });
    ipcMain.handle('live-start',async(event,mode)=>{
      trusted(event,'mini');if(phase!=='idle'||live||picking)throw new Error('録音は既に開始しています。');setPhase('starting');lastNotice='';recovering=false;inputController=new AbortController();
      try {
        const command=mode==='command';if(command&&(!store.data.settings.commandEnabled||commandModel.state.state!=='ready'||!commandSession))throw new Error('コマンドを有効にして専用ショートカットから開始してください。');
        const target=(command||store.data.settings.liveInput)?await windowTarget('capture',null,undefined,inputController.signal):null;
        if((command||store.data.settings.liveInput)&&!target)throw new Error('入力先の文字欄にカーソルを置いてください。');
        let state=null,input=null;
        if(target){
          if(command)state=await windowTarget('command-start',target,undefined,inputController.signal);
          else {input=new RealtimeInput(target,inputController.signal);try{await input.request({kind:'start',shortcut:shortcutKeys(store.data.settings.shortcut)});state={written:''};}catch(error){await input.close();throw error;}}
        }
        live={command,target,state,input,raw:'',blocked:'',worker:new Moonshine(engine()),writing:null};
        if(!command&&store.data.settings.saveAudio)live.audioId=await recordings.start();
        await live.worker.ready;setPhase('recording');return {target};
      }catch(error){if(live){await live.worker.close();await live.input?.close();}await recordings.finish('interrupted');live=null;setPhase('idle');report(error);throw error;}
    });
    ipcMain.handle('live-chunk',async(event,bytes)=>{
      trusted(event,'mini');if(phase!=='recording'||!live||enginePromise||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length%4||bytes.length>64000)throw new Error('音声または処理状態が不正です。');
      if(live.audioId)await recordings.append(Buffer.from(bytes));
      enginePromise=live.worker.request('audio',bytes);try{const update=await enginePromise;if(update.text.length>12000)throw new Error('文字数の上限に達しました。');live.raw=update.text;if(!live.command)writeLive(update.text);return {...update,blocked:live.blocked};}finally{enginePromise=null;}
    });
    ipcMain.handle('live-finish',async event=>{
      trusted(event,'mini');if(!live||enginePromise)throw new Error('音声処理が終了していません。');setPhase('processing');controller=new AbortController();
      try {const final=await live.worker.request('stop');await live.worker.close();live.raw=final.text;
        if(live.command){controller.signal.throwIfAborted();if(commandSession?.error)throw new Error(commandSession.error);send(mini,'command-progress','操作を考えています');const plan=await planCommand(final.text,{...engine(),llmModel:commandModel.file},controller.signal,live.state.selected);controller.signal.throwIfAborted();send(mini,'command-progress','操作を実行しています');await windowTarget('command',live.target,{state:live.state,actions:plan.actions},controller.signal);send(mini,'command-result',plan.actions.length+'件の操作を実行しました');return {command:true};}
        await recordings.finish();writeLive(final.text);await live.writing;
        if(!final.text.trim())return {empty:true};
        live.savedId=await remember(final.text,final.text,'未補正');
        const result=await refine(final.text,engine(),controller.signal);writeLive(result.corrected);await live.writing;
        await remember(result.corrected,final.text,live.blocked?'自動入力停止':live.state?(live.input?.verification==='input-monitor'?'入力送信済み（本文取得非対応）':'入力済み'):'確認待ち',live.savedId);
        return {blocked:live.blocked,text:result.corrected};
      }catch(error){if(!live.command&&live.raw&&!live.savedId)await remember(live.raw,live.raw,'処理中断');throw error;}
      finally{controller=null;}
    });
    ipcMain.handle('live-end',async event=>{
      trusted(event,'mini');const review=Boolean(!recovering&&live&&!live.command&&(!live.state||live.blocked));
      if(live){await live.worker.close();await live.writing;await live.input?.close();if(!live.command&&live.raw&&!live.savedId)live.savedId=await remember(live.raw,live.raw,'未補正');}await recordings.finish('interrupted');live=null;commandSession=null;setPhase('idle');broadcast();if(review&&latest)await showSettings('history');
    });
    ipcMain.handle('force-stop',event=>{trusted(event,'mini');recovering=true;inputController?.abort();controller?.abort();if(live){live.blocked='再開のため中断';live.worker.fail(new Error('再開のため録音を中断しました。'));}});
    ipcMain.handle('cancel',event=>{trusted(event,'mini');controller?.abort();});
    await ensureMini();if(!process.argv.includes('--autostart'))mini.showInactive();
    if(store.data.settings.imeAutoImport){try{const result=await importIme(true);if(result.importStats.overflow||result.importStats.skipped)report(new Error(importMessage(result.importStats)));}catch(error){report(error);}}
    if(store.data.settings.commandEnabled&&!registerCommand(store.data.settings.commandShortcut))report(new Error('コマンドショートカットが他のアプリで使われています。設定で変更してください。'));
    if(!register(store.data.settings.shortcut))report(new Error('ショートカットが他のアプリで使われています。設定で変更してください。'));
  }).catch(error=>{dialog.showErrorBox('起動できません',error.stack||error.message);app.quit();});
}
app.on('window-all-closed',()=>{});
app.on('before-quit',event=>{
  if(shuttingDown)return;event.preventDefault();shuttingDown=true;globalShortcut.unregisterAll();controller?.abort();mediaController?.abort();
  if(downloadRequest)downloadRequest.cancelled=true;commandModel?.cancel();
  inputController?.abort();
  if(live){live.blocked='終了中';live.worker.fail(new Error('終了中'));}
  Promise.allSettled([saving,enginePromise,mediaDone,commandDownload,live?.worker.close(),live?.writing]).then(async()=>{if(live&&!live.command&&live.raw&&!live.savedId)await remember(live.raw,live.raw,'終了時に保存');await recordings?.finish('interrupted');}).catch(error=>dialog.showErrorBox('保存できません',error.message)).finally(()=>app.quit());
});
