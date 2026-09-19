const { app, screen, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, dialog, clipboard, session, safeStorage } = require('electron');
const {CloudKeys}=require('./cloud-keys.cjs');
const {CloudSpeech}=require('./cloud-speech.cjs');
const {cloudRequest}=require('./cloud-llm.cjs');
const {cloudCorrect}=require('./cloud-correction.cjs');
const {LocalModels}=require('./local-models.cjs');
let cloudKeys;
let localModels;
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
const {normalizeReading}=require('./dictionary-reading.js');
const {CommandModel}=require('./command-model.cjs');
const { Meetings, decode, transcript, recognize, extractSubtitles } = require('./meetings.cjs');
const { Moonshine } = require('./moonshine.cjs');
const {ProgressiveCorrection}=require('./progressive-correction.cjs');
const { refine } = require('./refine.cjs');
const { windowTarget } = require('./window-target.cjs');
const {RealtimeInput}=require('./realtime-input.cjs');
const {continuation}=require('./continuation.cjs');
let bubble,bubbleReady,bubbleDismissed=false,remaining=null,continuationBusy=false,warmVoice=null;
let infoWindow,infoReady,infoText='',infoOpen=false,infoSize={width:276,height:146};
app.disableHardwareAcceleration();
app.setAppUserModelId('jp.localdictation.streaming');
const appIcon=path.join(__dirname,'assets','gourdy.ico');
// Keep existing profiles when the display/product name changes.
app.setPath('userData', path.join(app.getPath('appData'), 'local-dictation-streaming'));
if (process.env.DICTATION_TEST_DATA) app.setPath('userData', process.env.DICTATION_TEST_DATA);
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
let mini, editor, tray, store, live, phase = 'idle', shuttingDown = false, latest = null, saving = Promise.resolve(), closingEditor = false;
let handlersRegistered;
const handlersReady=new Promise(resolve=>{handlersRegistered=resolve;});
const {LocalMcp,localMediaPath}=require('./local-mcp.cjs');
const mcpClients=require('./mcp-clients.cjs');
const mcpClientPaths=()=>({home:app.getPath('home'),appData:app.getPath('appData'),codexHome:process.env.CODEX_HOME});
let installingMcp=false;
let mcpServer,mediaId=null;
let mediaController=null,mediaDone=null,meetings,recordings,commandSession=null;
let commandModel,commandDownload=null,downloadRequest=null;
let inputController, recovering=false;
let enginePromise, controller, picking=false,lastNotice='',importing=false;
const engine = () => ({
  python: path.join(root,'runtime/python/python.exe'), moonshineModel: path.join(localModels.folder,'moonshine-small-ja'), moonshineRuntime: path.join(root,'runtime/moonshine'), nlpModel:localModels.nlpModel,
  llmEngine: path.join(root,'runtime/llama/llama-server.exe'), llmModel: store.data.settings.advancedCorrection ? commandModel.file : path.join(localModels.folder,'Qwen3.5-0.8B-Q4_0.gguf'),
  replacements: store.data.settings.replacements,
  glossary: store.data.settings.terms.filter(t=>t.term.trim() && t.reading.trim()).map(t=>({term:t.term.trim(),reading:t.reading.trim(),aliases:[t.reading.trim()],contexts:[],auto:true}))
});
function prepareVoice(){
  if(warmVoice||live||phase!=='idle'||shuttingDown||!store.data.settings.fastStart||store.data.settings.aiProvider!=='local'||localModels.state.state!=='ready')return;
  const worker=new Moonshine(engine());warmVoice=worker;
  worker.ready.catch(error=>{if(warmVoice===worker){warmVoice=null;report(error);}});
}
async function releaseWarmVoice(){const worker=warmVoice;warmVoice=null;await worker?.close();}
function trusted(event, name) {
  const window = name === 'mini' ? mini : name==='bubble'?bubble:name==='info'?infoWindow:editor;
  const file = name === 'mini' ? 'index.html' : name==='bubble'?'continuation.html':name==='info'?'info.html':'settings.html';
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame?.url !== pathToFileURL(path.join(__dirname,file)).href) throw new Error('許可されていない画面です。');
}
function send(window, channel, value) { if(window && !window.isDestroyed())window.webContents.send(channel,value); }
function windowVisible(window){return Boolean(window&&!window.isDestroyed()&&window.isVisible());}
function snapshot() { return {...store.data, localModels:localModels?.state, cloudKeys:{...cloudKeys?.present}, mcp:mcpServer?.status, latest, phase, version:app.getVersion(), dataPath:store.file,notice:lastNotice,commandModel:commandModel?.state}; }
async function liveEngine(signal){
  const settings=engine(),provider=store.data.settings.aiProvider;
  if(['openai','gemini'].includes(provider))settings.cloudRequest=cloudRequest(provider,await cloudKeys.read(provider),signal);
  return settings;
}
async function correctLive(text,signal,context={}){const settings=await liveEngine(signal);return settings.cloudRequest?cloudCorrect(text,settings,settings.cloudRequest,context):refine(text,{...settings,...context},signal);}
const setupMessage='文字起こしの準備が必要です。\nAI接続でBYOKを設定するか、ローカルモデルをダウンロードしてください。';
function needsSetup(){const p=store.data.settings.aiProvider;return p==='none'||(p==='local'?localModels.state.state!=='ready':!cloudKeys.present[p]);}
async function showSetupNotice(){send(mini,'setup-needed',setupMessage);await updateInfo(setupMessage,false);infoOpen=true;await updateInfo(setupMessage,false);}
function broadcast() { send(infoWindow,'info',{text:infoText,background:store.data.settings.textBackground!==false,setup:infoText===setupMessage});send(mini,'settings-changed',{...store.data.settings,inputReady:!needsSetup()});send(editor,'data-changed',snapshot()); }
function setPhase(value) {phase=value;tray?.setToolTip('Gourdy — '+({idle:'待機中',starting:'準備中',recording:'録音中',processing:'補正中'}[value]));send(editor,'phase-changed',value);send(bubble,'continuation-phase',value);}
function report(error) { lastNotice=error.message; send(mini,'notice',error.message);send(editor,'notice',error.message);if(tray)tray.setToolTip('Gourdy — '+error.message.slice(0,90)); }
function serialize(fn) { const result=saving.then(fn);saving=result.then(()=>{},()=>{});return result; }
function secureWindow(window, file) {
  window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  return window.loadFile(path.join(__dirname,file));
}
let miniGesture=null;
function visibleMiniBounds(bounds){
  const area=screen.getDisplayMatching(bounds).workArea;
  return {...bounds,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-bounds.width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-bounds.height))};
}
async function ensureMini() {
  await handlersReady;
  if(mini && !mini.isDestroyed())return;
  const saved=store.data.miniBounds;
  if(saved&&(!['x','y','width','height'].every(k=>Number.isInteger(saved[k]))||saved.width<140||saved.width>420||Math.abs(saved.height-Math.round(saved.width*348/280))>1))throw new Error('保存した録音画面のサイズが不正です。');
  mini=new BrowserWindow({icon:appIcon,width:168,height:209,useContentSize:true,resizable:false,frame:false,transparent:true,hasShadow:false,show:false,focusable:false,alwaysOnTop:true,backgroundColor:'#00000000',skipTaskbar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  if(saved)mini.setBounds(visibleMiniBounds(saved));
  else {
    const area=screen.getPrimaryDisplay().workArea,{width,height}=mini.getBounds();
    mini.setPosition(Math.max(area.x,area.x+area.width-width-24),Math.max(area.y,area.y+area.height-height-24));
  }
  mini.setSkipTaskbar(true);
  mini.on('show',()=>{mini.setSkipTaskbar(!store.data.settings.showTaskbar);restoreMiniInput().catch(report);});
  mini.on('move',()=>positionBubble());
  mini.on('resize',()=>positionInfo());
  mini.on('hide',()=>{mini.setSkipTaskbar(true);infoOpen=false;infoWindow?.hide();});
  mini.on('close',event=>{if(!shuttingDown){event.preventDefault();closeMini().catch(report);}});
  await secureWindow(mini,'index.html');
}
function positionBubble(){
  positionInfo();
  if(shuttingDown||!bubble||bubble.isDestroyed()||!mini||mini.isDestroyed())return;
  const m=mini.getBounds(),area=screen.getDisplayMatching(m).workArea;
  bubble.setBounds({x:Math.max(area.x,Math.min(m.x,area.x+area.width-315)),y:Math.max(area.y,Math.min(m.y-174,area.y+area.height-174)),width:315,height:174});
}
function positionInfo(){
  if(shuttingDown||!infoWindow||infoWindow.isDestroyed()||!mini||mini.isDestroyed())return;
  const m=mini.getBounds(),area=screen.getDisplayMatching(m).workArea;
  // Anchor the visible panel's bottom-right to the gear's outer right / inner top.
  const scale=m.width/280,width=Math.min(infoSize.width,area.width),height=Math.min(infoSize.height,area.height);
  const x=Math.round(m.x+256*scale+6-width),y=Math.round(m.y+222*scale+6-height);
  infoWindow.setBounds({x:Math.max(area.x,Math.min(x,area.x+area.width-width)),y:Math.max(area.y,Math.min(y,area.y+area.height-height)),width,height});
}
async function updateInfo(text,open){
  if(shuttingDown)return;
  infoText=text;
  if(text&&miniExiting)await showMini();
  if(!text){infoOpen=false;infoWindow?.hide();return;}
  if(open)infoOpen=!infoOpen;
  if(!infoOpen){infoWindow?.hide();return;}
  if(!infoWindow||infoWindow.isDestroyed()){
    infoWindow=new BrowserWindow({parent:mini,icon:appIcon,width:300,height:194,frame:false,transparent:true,resizable:false,focusable:false,show:false,alwaysOnTop:true,skipTaskbar:true,webPreferences:{preload:path.join(__dirname,'info-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    infoWindow.on('closed',()=>{infoWindow=null;infoOpen=false;});
    infoReady=secureWindow(infoWindow,'info.html');
  }
  await infoReady;
  if(shuttingDown||!infoOpen||!infoText||!windowVisible(mini))return;
  positionInfo();send(infoWindow,'info',{text:infoText,background:store.data.settings.textBackground!==false,setup:infoText===setupMessage});infoWindow.showInactive();infoWindow.moveTop();
}
async function refreshContinuation(){
  if(shuttingDown)return;
  const enabled=store.data.settings.continuationAssist;
  const value=remaining&&enabled?{...remaining,phase,ready:phase==='idle',busy:continuationBusy}:null;
  send(mini,'continuation',value);
  if(!value||bubbleDismissed){bubble?.hide();return;}
  if(miniExiting)await showMini();
  if(!bubble||bubble.isDestroyed()){
    bubble=new BrowserWindow({parent:mini,icon:appIcon,width:315,height:174,frame:false,transparent:true,resizable:false,focusable:false,show:false,alwaysOnTop:true,skipTaskbar:true,webPreferences:{preload:path.join(__dirname,'continuation-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    bubble.on('closed',()=>{bubble=null;});
    bubble.setMenu(null);bubble.webContents.setWindowOpenHandler(()=>({action:'deny'}));bubble.webContents.on('will-navigate',e=>e.preventDefault());
    bubbleReady=bubble.loadFile(path.join(__dirname,'continuation.html'));
  }
  await bubbleReady;
  if(shuttingDown||!bubble||bubble.isDestroyed()||!remaining||!store.data.settings.continuationAssist||bubbleDismissed)return;
  positionBubble();send(bubble,'continuation',value);bubble.showInactive();raiseMiniPanels();
}
function updateContinuation(corrected){
  if(!live?.blocked||live.command)return;
  remaining={...continuation(live.displayText||live.raw,live.state?.written||'',live.continuationCertain,corrected),reason:live.blocked};
  if(live.noInput)remaining.label='文字起こし（入力先なし）';
  if(process.env.DICTATION_TEST_DATA)remaining.diagnostic=live.continuationDiagnostic;
  refreshContinuation().catch(report);
}
function raiseMiniPanels(){
  if(shuttingDown)return;
  if(windowVisible(bubble))bubble.moveTop();
  if(windowVisible(infoWindow))infoWindow.moveTop();
}
let miniMotionId=0,miniExiting=false;
async function restoreMiniInput(){
  if(shuttingDown||!windowVisible(mini))return;
  const result=await windowTarget('restore-input',{handle:mini.getNativeWindowHandle().readBigUInt64LE().toString(),pid:process.pid});
  if(result.restored)console.info('Mini input window restored:',result.restored);
}
async function showMini() {
  if(shuttingDown)return;
  await ensureMini();
  if(shuttingDown||mini.isDestroyed())return;
  miniExiting=false;
  const hidden=!mini.isVisible();
  send(mini,'mini-motion',{id:++miniMotionId,direction:hidden?'enter':'restore'});
  if(!hidden){mini.showInactive();mini.moveTop();raiseMiniPanels();await restoreMiniInput();}
}
function hideMiniAnimated(){
  if(!shuttingDown&&!miniExiting&&windowVisible(mini)){miniExiting=true;send(mini,'mini-motion',{id:++miniMotionId,direction:'exit'});}
}
async function showSettings(tab='operation') {
  await handlersReady;
  if(editor && !editor.isDestroyed()){editor.show();editor.focus();send(editor,'select-tab',tab);return;}
  editor=new BrowserWindow({icon:appIcon,width:680,height:700,minWidth:420,minHeight:450,frame:false,show:false,minimizable:false,title:'Gourdy - 設定',backgroundColor:'#ffffff',skipTaskbar:!store.data.settings.showTaskbar,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  closingEditor=false;
  editor.on('close',event=>{if(!shuttingDown&&!closingEditor){event.preventDefault();send(editor,'request-close');}});
  editor.on('closed',()=>{editor=null;maybeHideMini();});
  await secureWindow(editor,'settings.html');send(editor,'select-tab',tab);editor.show();
}
async function startCommand() {
  if(needsSetup()){await showSetupNotice();return;}
  if(!store.data.settings.commandEnabled||(store.data.settings.aiProvider==='local'&&commandModel.state.state!=='ready'))return;
  if(commandSession)return;
  if(phase!=='idle'||picking){report(new Error('通常の録音・補正を停止してからコマンドキーを押してください。'));return;}
  const token={};commandSession=token;
  await ensureMini();send(mini,'command-start');
  try {await windowTarget('wait-release',null,shortcutKeys(store.data.settings.commandShortcut));}
  catch(error){token.error=error.message;report(error);}
  finally{if(commandSession===token)send(mini,'command-release',{error:token.error});}
}
function registerCommand(shortcut){return globalShortcut.register(shortcut,()=>startCommand().catch(error=>{commandSession=null;report(error)}));}
const {RecordingShortcut}=require('./recording-shortcut.cjs');
const {ShortcutTaps,shouldHideMini}=require('./shortcut-taps.cjs');
const shortcutTaps=new ShortcutTaps(()=>toggle().catch(report),()=>setMiniPinned().catch(report));
const recordingShortcut=new RecordingShortcut(globalShortcut,()=>{if(!editor?.isFocused())shortcutTaps.tap()},report);
function register(shortcut){shortcutTaps.cancel();return recordingShortcut.register(shortcut);}
async function saveSettings(patch, preserveHistory=false) {
  if(phase!=='idle')throw new Error('録音・補正が終わってから設定を変更してください。');
  if(!patch || typeof patch!=='object' || Object.keys(patch).some(k=>!Object.hasOwn(defaults,k)))throw new Error('設定項目が不正です。');
  if(downloadRequest&&patch[downloadRequest.setting]===false){downloadRequest.cancelled=true;commandModel.cancel();}
  return serialize(async()=>{
    const previous=store.data.settings,next=validate({...previous,...patch});
    next.replacements=next.replacements.map(r=>({from:r.from.trim(),to:r.to.trim()})).filter(r=>r.from||r.to);
    next.terms=next.terms.map(t=>({term:t.term.trim(),reading:patch.terms?normalizeReading(t.reading):t.reading.trim()})).filter(t=>t.term||t.reading);
    if(['openai','gemini'].includes(next.aiProvider)&&!cloudKeys.present[next.aiProvider])throw new Error('先にAPIキーを登録してください。');
    if(next.aiProvider==='local'&&next.advancedCorrection&&commandModel.state.state!=='ready')throw new Error('上位補正モデルをダウンロードしてください。');
    if(next.aiProvider==='local'&&next.commandEnabled&&commandModel.state.state!=='ready')throw new Error('コマンド用モデルをダウンロードするか、キー操作をオフにしてください。');
    const registerNewCommand=next.commandEnabled&&(!previous.commandEnabled||next.commandShortcut!==previous.commandShortcut);
    const unregisterOldCommand=previous.commandEnabled&&(!next.commandEnabled||next.commandShortcut!==previous.commandShortcut);
    const newKey=next.shortcut!==previous.shortcut, newStartup=next.launchAtStartup!==previous.launchAtStartup;
    if(newStartup&&!app.isPackaged)throw new Error('自動起動はビルド済みアプリで設定してください。');
    if(newKey&&!await register(next.shortcut))throw new Error('このショートカットは他のアプリで使用中です。');
    if(registerNewCommand&&!registerCommand(next.commandShortcut)){if(newKey)recordingShortcut.unregister(next.shortcut);throw new Error('コマンドショートカットは他のアプリで使用中です。');}
    try {
      if(newStartup){app.setLoginItemSettings({openAtLogin:next.launchAtStartup,path:process.execPath,args:['--autostart']});if(app.getLoginItemSettings({path:process.execPath,args:['--autostart']}).openAtLogin!==next.launchAtStartup)throw new Error('Windowsの自動起動設定を確認できません。');}
      if(previous.mcpEnabled!==next.mcpEnabled||previous.mcpPort!==next.mcpPort)await mcpServer.configure(next);
      await store.write({...store.data,settings:next,history:preserveHistory?store.data.history:trimHistory(store.data.history,next)});
    } catch(error) {
      try{await mcpServer.configure(previous);}catch(restoreError){report(restoreError);}
      if(registerNewCommand)globalShortcut.unregister(next.commandShortcut);
      if(newKey)recordingShortcut.unregister(next.shortcut);
      if(newStartup)app.setLoginItemSettings({openAtLogin:previous.launchAtStartup,path:process.execPath,args:['--autostart']});
      throw error;
    }
    if(newKey)recordingShortcut.unregister(previous.shortcut);
    if(unregisterOldCommand)globalShortcut.unregister(previous.commandShortcut);
    mini?.setSkipTaskbar(!windowVisible(mini)||!next.showTaskbar);editor?.setSkipTaskbar(!next.showTaskbar);broadcast();if(!next.fastStart||next.aiProvider!=='local')await releaseWarmVoice();else prepareVoice();await refreshContinuation();return snapshot();
  });
}
async function prepareMeeting(file){
 if(phase!=='idle'||importing)throw new Error('現在の処理が終わってから読み込んでください。');
 setPhase('processing');try{return await meetings.prepare(file);}finally{setPhase('idle');}
}
function startMeeting(id){
 if(phase!=='idle'||importing)throw new Error('現在の処理が終わってから開始してください。');
 localModels.assertReady();
 mediaController=new AbortController();mediaId=id;setPhase('processing');const signal=mediaController.signal;
 mediaDone=(async()=>{
  try{const configuration=engine();for(const key of ['python','llmEngine','llmModel','moonshineModel','moonshineRuntime']){try{await fs.access(configuration[key]);}catch{throw new Error(`${key}が見つかりません。配布ファイルを確認してください。`);}}
   await releaseWarmVoice();return await meetings.run(id,signal,(job,index,attempt)=>send(editor,'meeting-changed',{job,index,attempt}));
  }catch(e){try{const job=await meetings.read(id);if(!['error','paused'].includes(job.state)){job.state=signal.aborted?'paused':'error';job.error=e.message;await meetings.save(job);send(editor,'meeting-changed',{job});}}catch(saveError){report(saveError);}throw e;}
  finally{mediaController=null;mediaDone=null;mediaId=null;setPhase('idle');prepareVoice();}
 })();mediaDone.catch(report);return mediaDone;
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
  catch(error){active.blocked=error.message;active.continuationDiagnostic={mayHaveWritten:error.mayHaveWritten,confirmedWritten:error.confirmedWritten,previousWritten:active.state.written,previousVerified:active.state.verified};if(typeof error.confirmedWritten==='string')active.state={written:error.confirmedWritten,verified:true};active.continuationCertain=(error.mayHaveWritten===false||typeof error.confirmedWritten==='string')&&(active.state.written===''||active.state.verified===true);report(error);updateContinuation();}}).finally(()=>{active.writing=null;});
}
function miniPinned(){return store.data.miniPinned??!process.argv.includes('--autostart');}
async function setMiniPinned(value){
  await serialize(async()=>{
    const next=value??!miniPinned();
    await store.write({...store.data,miniPinned:next});
    if(next)await showMini();else maybeHideMini();
  });
}
function maybeHideMini(){
  if(shuttingDown||!mini||mini.isDestroyed())return;
  if(shouldHideMini({pinned:miniPinned(),phase,info:!!infoText,bubble:windowVisible(bubble),editor:windowVisible(editor)}))hideMiniAnimated();
}
async function closeMini(){if(store.data.settings.closeToTray){await setMiniPinned(false);hideMiniAnimated();}else app.quit();}
async function toggle(){await showMini();send(mini,'toggle');}
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
    cloudKeys=new CloudKeys(path.join(store.folder,'credentials'),safeStorage);await cloudKeys.load();
    localModels=new LocalModels(path.join(store.folder,'models'),path.join(root,'runtime/python/python.exe'),state=>send(editor,'local-models-changed',state));await localModels.inspect();
    ipcMain.handle('local-models-download',async event=>{trusted(event,'settings');if(phase!=='idle')throw new Error('録音を停止してください。');try{await localModels.download();broadcast();return snapshot();}finally{broadcast();}});
    ipcMain.handle('local-models-cancel',event=>{trusted(event,'settings');localModels.cancel();});
    ipcMain.handle('cloud-key-save',(event,provider,key)=>{trusted(event,'settings');return serialize(async()=>{if(phase!=='idle')throw new Error('録音を停止してください。');await cloudKeys.save(provider,key);broadcast();return {...cloudKeys.present};});});
    ipcMain.handle('cloud-key-delete',(event,provider)=>{trusted(event,'settings');return serialize(async()=>{if(phase!=='idle')throw new Error('録音を停止してください。');cloudKeys.file(provider);if(store.data.settings.aiProvider===provider)await store.write({...store.data,settings:{...store.data.settings,aiProvider:'none'}});await cloudKeys.remove(provider);broadcast();if(needsSetup())await showSetupNotice();return {...cloudKeys.present};});});
    if(store.readingWarnings?.length)lastNotice='辞書の読みを確認してください。'+store.readingWarnings.join(' / ');
    commandModel=new CommandModel(path.join(store.folder,'models'),state=>send(editor,'command-model-changed',state));
    await commandModel.inspect();
    if(store.data.settings.aiProvider==='local'&&store.data.settings.commandEnabled&&commandModel.state.state!=='ready'){
      if(commandModel.state.state==='missing')commandModel.update({error:'保存済みモデルが見つかりません。再ダウンロードしてください。'});
      await store.write({...store.data,settings:{...store.data.settings,commandEnabled:false}});
    }
    if(store.data.settings.advancedCorrection&&commandModel.state.state!=='ready')commandModel.update({error:'上位補正モデルが見つからないか破損しています。再ダウンロードするか上位補正をオフにしてください。'});
    recordings=new Recordings(path.join(app.getPath('userData'),'recordings'));await recordings.recover();
    const cleanup=setInterval(()=>{if(phase==='idle')recordings.prune().catch(report);},3600000);cleanup.unref();
    meetings=new Meetings(path.join(app.getPath('userData'),'meetings'),path.join(root,'runtime/ffmpeg'),engine);
    session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(Boolean((contents===mini?.webContents || contents===editor?.webContents) && permission==='media' && details.mediaTypes?.every(t=>t==='audio'))));
    session.defaultSession.setPermissionCheckHandler((contents,permission)=>Boolean((contents===mini?.webContents||contents===editor?.webContents)&&permission==='media'));
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_,cb)=>cb({cancel:true}));
    const trayIcon=nativeImage.createFromPath(appIcon);
    if(trayIcon.isEmpty())throw new Error('アプリアイコンを読み込めません。');
    tray=new Tray(trayIcon);tray.setToolTip('Gourdy — 待機中');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Gourdyを開く',click:()=>setMiniPinned(true).catch(report)},{label:'設定',click:()=>showSettings().catch(report)},{label:'録音を開始 / 停止',click:()=>toggle().catch(report)},{type:'separator'},{label:'終了',click:()=>app.quit()}]));
    tray.on('double-click',()=>setMiniPinned(true).catch(report));
    mcpServer=new LocalMcp(app.getPath('userData'),{
      prepare_file:async({path:file})=>prepareMeeting(await localMediaPath(file)),
      start_transcription:async({id})=>{await meetings.read(id);startMeeting(id);return {id,state:'running'};},
      get_transcription:async({id})=>{const job=await meetings.read(id);if(job.state==='running'&&mediaId!==id)job.state='paused';return {...job,text:transcript(job)};},
      list_transcriptions:()=>meetings.list(),
      cancel_transcription:async({id})=>{if(mediaId!==id||!mediaController)throw new Error('指定したジョブは処理中ではありません。');mediaController.abort();return {id,state:'cancelling'};}
    },app.getVersion(),report);
    try{await mcpServer.configure(store.data.settings);}catch(e){mcpServer.status={state:'error',error:e.message};report(e);}
    ipcMain.handle('mcp-copy-configuration',event=>{trusted(event,'settings');clipboard.writeText(JSON.stringify(mcpServer.configuration(),null,2));});
    ipcMain.handle('mcp-clients',event=>{trusted(event,'settings');return mcpClients.targets(mcpClientPaths()).map(({id,name,file})=>({id,name,file}));});
    ipcMain.handle('mcp-install-clients',async(event,ids)=>{
      trusted(event,'settings');if(installingMcp)throw new Error('MCP設定を追記中です。');
      installingMcp=true;try{return await mcpClients.install(ids,mcpClientPaths(),mcpServer.configuration().mcpServers.gourdy);}finally{installingMcp=false;}
    });
    ipcMain.handle('snapshot',event=>{trusted(event,'settings');return snapshot();});
    ipcMain.handle('show-setup',event=>{trusted(event,'mini');return showSetupNotice();});
    ipcMain.handle('mini-settings',event=>{trusted(event,'mini');return {...store.data.settings,inputReady:!needsSetup()};});
    ipcMain.handle('mini-motion-ready',(event,id)=>{trusted(event,'mini');if(id===miniMotionId){mini.showInactive();mini.moveTop();raiseMiniPanels();if(infoOpen&&infoText)updateInfo(infoText,false).catch(report);}});
    ipcMain.handle('mini-motion-done',async(event,id,direction)=>{trusted(event,'mini');if(id!==miniMotionId)return;if(direction==='exit'){mini.setSkipTaskbar(true);mini.hide();}else await restoreMiniInput();});
    ipcMain.handle('mini-idle-hide',event=>{trusted(event,'mini');maybeHideMini();});
    ipcMain.handle('mini-info',(event,text,open)=>{trusted(event,'mini');if(typeof text!=='string'||text.length>16000||typeof open!=='boolean')throw new Error('情報の形式が不正です。');return updateInfo(text,open);});
    ipcMain.handle('info-hide',event=>{trusted(event,'info');infoOpen=false;infoWindow.hide();const dismissed=infoText;infoText='';send(mini,'info-dismissed',dismissed);maybeHideMini();});
    ipcMain.handle('info-setup',event=>{trusted(event,'info');return showSettings('ai');});
    ipcMain.handle('info-size',(event,size)=>{trusted(event,'info');if(!size||!Number.isFinite(size.width)||!Number.isFinite(size.height))throw new Error('お知らせのサイズが不正です。');infoSize={width:Math.max(192,Math.min(360,Math.ceil(size.width))),height:Math.max(90,Math.min(400,Math.ceil(size.height)))};positionInfo();});
    ipcMain.handle('report-mini-error',(event,message)=>{trusted(event,'mini');if(typeof message!=='string'||message.length>4000)throw new Error('エラー情報が不正です。');lastNotice=message;send(editor,'notice',message);});
    ipcMain.handle('cancel-media',event=>{trusted(event,'settings');mediaController?.abort();});
    ipcMain.handle('recording-list',async event=>{trusted(event,'settings');await recordings.prune();return recordings.list();});
    ipcMain.handle('recording-preview',async(event,id)=>{trusted(event,'settings');const row=await recordings.read(id);if(row.state==='recording'||!row.duration)throw new Error('録音終了後に再生してください。');const pcm=await decode({source:recordings.file(id,'wav'),audioStream:0},{start:0,end:row.duration},meetings.bin,undefined,true);return 'data:audio/wav;base64,'+pcm.toString('base64');});
    ipcMain.handle('recording-delete',async(event,id)=>{trusted(event,'settings');if(phase!=='idle')throw new Error('処理終了後に削除してください。');await recordings.remove(id);});
    ipcMain.handle('recording-retry',async(event,id)=>{
      trusted(event,'settings');if(phase!=='idle'||commandSession)throw new Error('現在の処理が終わってから再認識してください。');
      localModels.assertReady();
      const row=await recordings.read(id);if(!row.duration||row.state==='recording')throw new Error('再認識できる音声がありません。');
      await releaseWarmVoice();setPhase('processing');controller=new AbortController();
      try{const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(300000)]),settings=engine();
        const pcm=await decode({source:recordings.file(id,'wav'),audioStream:0},{start:0,end:row.duration},meetings.bin,signal);
        const raw=await recognize(pcm,settings,signal);if(!raw.trim())throw new Error('音声から文字を認識できませんでした。音声は残っています。');
        const historyId=await remember(raw,raw,'再認識・未補正');
        const result=await refine(raw,settings,signal);await remember(result.corrected,raw,'再認識・確認待ち',historyId);
      }finally{controller=null;setPhase('idle');prepareVoice();}
      return snapshot();
    });
    ipcMain.handle('meeting-list',event=>{trusted(event,'settings');return meetings.list();});
    ipcMain.handle('meeting-read',(event,id)=>{trusted(event,'settings');return meetings.read(id);});
    ipcMain.handle('meeting-select',async event=>{
      trusted(event,'settings');if(phase!=='idle'||importing)throw new Error('現在の処理が終わってから読み込んでください。');
      const selected=await dialog.showOpenDialog(editor,{title:'音声・動画を選ぶ',properties:['openFile'],filters:[{name:'音声・動画',extensions:['wav','mp3','m4a','mp4','webm','mkv','mov','flac','ogg','aac','wma','wmv']},{name:'すべてのファイル',extensions:['*']}]});
      if(selected.canceled)return null;if(phase!=='idle')throw new Error('録音が始まったため、読み込みを中止しました。');
      return prepareMeeting(selected.filePaths[0]);
    });
    ipcMain.handle('meeting-preview',async(event,id,start)=>{
      trusted(event,'settings');const job=await meetings.read(id);await meetings.verify(job);
      if(!Number.isFinite(start)||start<0||start>=job.duration)throw new Error('再生位置が不正です。');
      const part=job.parts.find(p=>p.start===start),end=part?.end??Math.min(start+60,job.duration);const audio=await decode(job,{start,end},meetings.bin,undefined,true);
      return {url:'data:audio/wav;base64,'+audio.toString('base64'),start,end};
    });
    ipcMain.handle('meeting-run',(event,id)=>{trusted(event,'settings');return startMeeting(id);});
    ipcMain.handle('subtitle-copy',(event,text)=>{trusted(event,'settings');if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>16*1024*1024)throw new Error('字幕が大きすぎます。');clipboard.writeText(text);});
    ipcMain.handle('meeting-subtitles',async(event,id,index)=>{
      trusted(event,'settings');if(phase!=='idle')throw new Error('現在の処理が終わってから読み込んでください。');
      const job=await meetings.read(id);await meetings.verify(job);setPhase('processing');
      try{return await extractSubtitles(job,index,meetings.bin);}finally{setPhase('idle');}
    });
    ipcMain.handle('meeting-copy',async(event,id)=>{trusted(event,'settings');clipboard.writeText(transcript(await meetings.read(id)));});
    ipcMain.handle('meeting-export',async(event,id)=>{
      trusted(event,'settings');const job=await meetings.read(id);const result=await dialog.showSaveDialog(editor,{title:'会議の全文を書き出す',defaultPath:job.name+'.txt',filters:[{name:'テキスト',extensions:['txt']}]});
      if(result.canceled)return false;await fs.writeFile(result.filePath,transcript(job),'utf8');return true;
    });
    ipcMain.handle('meeting-delete',async(event,id)=>{trusted(event,'settings');if(phase!=='idle')throw new Error('処理終了後に削除してください。');await meetings.remove(id);});
    ipcMain.handle('download-command-model',async (event,purpose='command')=>{
      trusted(event,'settings');if(commandDownload)throw new Error('ダウンロード中です。');
      if(phase!=='idle')throw new Error('録音・補正が終わってから操作してください。');
      if(!['command','correction'].includes(purpose))throw new Error('モデルの用途が不正です。');
      const request={cancelled:false,setting:purpose==='correction'?'advancedCorrection':'commandEnabled'};downloadRequest=request;
      commandDownload=(async()=>{await commandModel.download();if(request.cancelled)return snapshot();return saveSettings({[request.setting]:true});})();
      try{return await commandDownload;}finally{commandDownload=null;downloadRequest=null;}
    });
    ipcMain.handle('cancel-command-download',event=>{trusted(event,'settings');if(downloadRequest)downloadRequest.cancelled=true;commandModel.cancel();});
    ipcMain.handle('export-ime',async event=>{
      trusted(event,'settings');if(phase!=='idle')throw new Error('録音・補正が終わってから操作してください。');
      const result=exportDictionary(store.data.settings.terms);
      const destination=await dialog.showSaveDialog(editor,{title:'辞書を書き出す',defaultPath:'Gourdy辞書.txt',filters:[{name:'Microsoft IME ユーザー辞書',extensions:['txt']}]});
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
    ipcMain.handle('hide-mini',event=>{trusted(event,'mini');return closeMini();});
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
    ipcMain.handle('mini-layout',(event,height)=>{
      trusted(event,'mini');
      if(!Number.isInteger(height)||height<100||height>1000)throw new Error('表示領域の高さが不正です。');
      const bounds=mini.getBounds();if(bounds.height===height)return;
      mini.setBounds(visibleMiniBounds({...bounds,height}));positionBubble();
    });
    ipcMain.handle('mini-gesture',async(event,action,kind)=>{
      trusted(event,'mini');
      if(action==='start'){
        if(!['move','resize'].includes(kind))throw new Error('画面操作が不正です。');
        miniGesture={kind,cursor:screen.getCursorScreenPoint(),bounds:mini.getBounds()};return;
      }
      if(!['update','end'].includes(action))throw new Error('画面操作が不正です。');
      if(!miniGesture)return;
      if(action==='update'){
        const g=miniGesture,p=screen.getCursorScreenPoint(),dx=p.x-g.cursor.x,dy=p.y-g.cursor.y;
        if(g.kind==='move')mini.setPosition(g.bounds.x+dx,g.bounds.y+dy);
        else{const width=Math.max(140,Math.min(420,Math.round(g.bounds.width+(dx+dy*280/348)/2)));mini.setBounds({...g.bounds,width,height:Math.round(width*348/280)});}
        positionBubble();return;
      }
      miniGesture=null;mini.setBounds(visibleMiniBounds(mini.getBounds()));
      await serialize(()=>store.write({...store.data,miniBounds:{...mini.getBounds(),height:Math.round(mini.getBounds().width*348/280)}}));
    });
    ipcMain.handle('mini-shape',(event,rects,viewport)=>{
      trusted(event,'mini');const size=mini.getContentBounds();
      if(viewport?.width!==size.width||viewport?.height!==size.height)return; // A newer resize superseded this outline.
      if(!Array.isArray(rects)||!rects.length||rects.length>3000||rects.some(r=>!r||!['x','y','width','height'].every(k=>Number.isInteger(r[k]))||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>size.width||r.y+r.height>size.height))throw new Error('録音ウィンドウの形状が不正です。');
      mini.setShape(rects);
    });
    ipcMain.handle('continuation-hide',event=>{trusted(event,'bubble');bubbleDismissed=true;bubble.hide();maybeHideMini();});
    ipcMain.handle('continuation-copy',event=>{
      trusted(event,event.sender===bubble?.webContents?'bubble':'mini');if(!store.data.settings.continuationAssist||phase!=='idle'||!remaining?.text||continuationBusy)throw new Error('録音・補正が終わってからコピーしてください。');clipboard.writeText(remaining.text);
    });
    ipcMain.handle('continuation-insert',async event=>{
      trusted(event,event.sender===bubble?.webContents?'bubble':'mini');if(!store.data.settings.continuationAssist||phase!=='idle'||!remaining?.safe||!remaining.text||continuationBusy)throw new Error('入力できる続きがありません。');
      continuationBusy=true;await refreshContinuation();let writer,writing=false;
      try{
        const target=await windowTarget('capture');if(!target)throw new Error('入力したい欄にカーソルを置いてください。');
        writer=new RealtimeInput(target);await writer.request({kind:'start',shortcut:shortcutKeys(store.data.settings.shortcut),prior:remaining.prior});
        writing=true;const result=await writer.request({kind:'write',text:remaining.prior?remaining.full:remaining.text});
        remaining={...remaining,safe:false,inserted:true,label:'入力済み'};lastNotice='';send(mini,'notice','');return {verified:result.verified};
      }catch(error){if(writing&&error.mayHaveWritten!==false){remaining.safe=false;remaining.label='一部入力された可能性があります。入力先を確認してください。';}throw error;}
      finally{await writer?.close();continuationBusy=false;await refreshContinuation();}
    });
    ipcMain.handle('live-start',async(event,mode)=>{
      trusted(event,'mini');if(phase!=='idle'||live||picking||continuationBusy)throw new Error('録音は既に開始しています。');if(needsSetup()){await showSetupNotice();return {needsSetup:true};}setPhase('starting');if(miniExiting)await showMini();lastNotice='';recovering=false;inputController=new AbortController();
      let startingWorker;const startAt=performance.now();
      try {
        const command=mode==='command',provider=store.data.settings.aiProvider;if(command&&(!store.data.settings.commandEnabled||(provider==='local'&&commandModel.state.state!=='ready')||!commandSession))throw new Error('コマンドを有効にして専用ショートカットから開始してください。');
        const target=(command||store.data.settings.liveInput)?await windowTarget('capture',null,undefined,inputController.signal):null;
        if(command&&!target)throw new Error('入力先の文字欄にカーソルを置いてください。');
        startingWorker=provider==='local'?(warmVoice||new Moonshine(engine())):new CloudSpeech(provider,await cloudKeys.read(provider),{changed:update=>{if(live?.worker===startingWorker){live.raw=update.text;if(!live.command){if(live.correction)live.correction.update(update.text);else{writeLive(update.text);updateContinuation();}}}}});warmVoice=null;startingWorker.ready.catch(()=>{});const modelRequestedAt=performance.now();
        let state=null,input=null,noInputReason=!command&&!target?'入力先なし · 吹き出しに文字起こしします':'';
        if(target){
          if(command)state=await windowTarget('command-start',target,undefined,inputController.signal);
          else {input=new RealtimeInput(target,inputController.signal);try{await input.request({kind:'start',shortcut:shortcutKeys(store.data.settings.shortcut)});state={written:''};}catch(error){await input.close();input=null;if(error.code!=='NO_INPUT_TARGET')throw error;noInputReason=error.message+' 吹き出しに文字起こしします。';}}
        }
        remaining=null;bubbleDismissed=false;await refreshContinuation();
        live={command,target,state,input,raw:'',noInput:!!noInputReason,blocked:noInputReason,continuationCertain:!!noInputReason,worker:startingWorker,writing:null};
        if(!command&&store.data.settings.progressiveCorrection){
          const active=live;
          active.correction=new ProgressiveCorrection((text,signal,context)=>correctLive(text,signal,{...context,candidateOnly:provider==='local'}),{
            changed:text=>{if(live!==active)return;active.displayText=text;writeLive(text);updateContinuation(text);},
            notice:message=>report(new Error(message))
          });
        }
        if(!command&&store.data.settings.saveAudio)live.audioId=await recordings.start();
        const inputReadyAt=performance.now();await live.worker.ready;setPhase('recording');updateContinuation();return {target,timing:{modelRequestedMs:modelRequestedAt-startAt,inputReadyMs:inputReadyAt-startAt,readyMs:performance.now()-startAt,model:live.worker.timing}};
      }catch(error){if(!live&&startingWorker)await startingWorker.close();if(live){await live.correction?.close();await live.worker.close();await live.input?.close();}await recordings.finish('interrupted');live=null;setPhase('idle');report(error);throw error;}
    });
    ipcMain.handle('live-chunk',async(event,bytes)=>{
      trusted(event,'mini');if(phase!=='recording'||!live||enginePromise||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length%4||bytes.length>64000)throw new Error('音声または処理状態が不正です。');
      if(live.audioId)await recordings.append(Buffer.from(bytes));
      enginePromise=live.worker.request('audio',bytes);try{const update=await enginePromise;if(update.text.length>12000)throw new Error('文字数の上限に達しました。');live.raw=update.text;if(!live.command){if(live.correction)live.correction.update(update.text);else{writeLive(update.text);updateContinuation();}}return {...update,blocked:remaining?'':live.blocked};}finally{enginePromise=null;}
    });
    ipcMain.handle('live-finish',async event=>{
      trusted(event,'mini');if(!live||enginePromise)throw new Error('音声処理が終了していません。');setPhase('processing');controller=new AbortController();
      try {const final=await live.worker.request('stop');await live.worker.close();live.raw=final.text;
        if(live.command){controller.signal.throwIfAborted();if(commandSession?.error)throw new Error(commandSession.error);send(mini,'command-progress','操作を考えています');const plan=await planCommand(final.text,{...await liveEngine(controller.signal),llmModel:commandModel.file},controller.signal,live.state.selected);controller.signal.throwIfAborted();send(mini,'command-progress','操作を実行しています');await windowTarget('command',live.target,{state:live.state,actions:plan.actions},controller.signal);send(mini,'command-result',plan.actions.length+'件の操作を実行しました');return {command:true};}
        await recordings.finish();if(live.correction)live.correction.update(final.text);else writeLive(final.text);await live.writing;
        if(!final.text.trim())return {empty:true};
        live.savedId=await remember(final.text,final.text,'未補正');
        const result=live.correction?{corrected:await live.correction.finish(final.text)}:await correctLive(final.text,controller.signal);controller.signal.throwIfAborted();writeLive(result.corrected);await live.writing;
        await remember(result.corrected,final.text,live.blocked?'自動入力停止':live.state?(live.input?.verification==='input-monitor'?'入力送信済み（本文取得非対応）':'入力済み'):'確認待ち',live.savedId);
        updateContinuation(result.corrected);return {blocked:remaining?'':live.blocked,text:result.corrected};
      }catch(error){updateContinuation();if(!live.command&&live.raw&&!live.savedId)await remember(live.raw,live.raw,'処理中断');throw error;}
      finally{controller=null;}
    });
    ipcMain.handle('live-end',async event=>{
      trusted(event,'mini');const review=Boolean(!recovering&&live&&!live.command&&(!live.state||live.blocked));
      if(live){await live.correction?.close();await live.worker.close();await live.writing;await live.input?.close();if(!live.command&&live.raw&&!live.savedId)live.savedId=await remember(live.raw,live.raw,'未補正');}await recordings.finish('interrupted');live=null;commandSession=null;setPhase('idle');broadcast();await refreshContinuation();if(review&&latest&&(!remaining||!store.data.settings.continuationAssist))await showSettings('history');prepareVoice();
    });
    ipcMain.handle('force-stop',event=>{trusted(event,'mini');recovering=true;inputController?.abort();controller?.abort();if(live){live.correction?.close().catch(report);live.blocked='再開のため中断';live.worker.fail(new Error('再開のため録音を中断しました。'));}});
    ipcMain.handle('cancel',event=>{trusted(event,'mini');controller?.abort();live?.correction?.close().catch(report);});
    handlersRegistered();
    await ensureMini();if(miniPinned()){mini.showInactive();mini.moveTop();raiseMiniPanels();}if(needsSetup()){mini.showInactive();await showSetupNotice();}prepareVoice();
    if(store.data.settings.imeAutoImport){try{const result=await importIme(true);if(result.importStats.overflow||result.importStats.skipped)report(new Error(importMessage(result.importStats)));}catch(error){report(error);}}
    if(store.data.settings.commandEnabled&&!registerCommand(store.data.settings.commandShortcut))report(new Error('コマンドショートカットが他のアプリで使われています。設定で変更してください。'));
    if(!await register(store.data.settings.shortcut))report(new Error('ショートカットが他のアプリで使われています。設定で変更してください。'));
  }).catch(error=>{dialog.showErrorBox('起動できません',error.stack||error.message);app.quit();});
}
app.on('window-all-closed',()=>{});
app.on('before-quit',event=>{
  shortcutTaps.cancel();
  if(shuttingDown)return;event.preventDefault();shuttingDown=true;recordingShortcut.close();globalShortcut.unregisterAll();controller?.abort();mediaController?.abort();
  if(downloadRequest)downloadRequest.cancelled=true;commandModel?.cancel();localModels?.cancel();
  inputController?.abort();
  if(live){live.blocked='終了中';live.worker.fail(new Error('終了中'));}
  Promise.allSettled([localModels?.pending,mcpServer?.close(),live?.correction?.close(),releaseWarmVoice(),saving,enginePromise,mediaDone,commandDownload,live?.worker.close(),live?.writing]).then(async()=>{if(live&&!live.command&&live.raw&&!live.savedId)await remember(live.raw,live.raw,'終了時に保存');await recordings?.finish('interrupted');}).catch(error=>dialog.showErrorBox('保存できません',error.message)).finally(()=>app.quit());
});
