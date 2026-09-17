const api=window.dictation,$=id=>document.getElementById(id);
let continuationState=null;
let settings,phase='idle',stream,recorder,pump,failure,cancelled=false,timer,started,notice='',command=false,released=false,backendReady=false,outcome='';const pending=[];let cancelMicrophone=null;let operation=null,restarting=false;
for(let i=0;i<11;i++)$('wave').append(document.createElement('i'));
function configure(value){settings=value;const mono=value.accent==='#262626',base=mono?'#e4e4e4':value.accent,dark=mono?'#a0a0a0':'#'+base.slice(1).match(/../g).map(x=>Math.round(parseInt(x,16)*.72).toString(16).padStart(2,'0')).join('');document.documentElement.style.setProperty('--accent',value.accent);document.documentElement.style.setProperty('--icon-background',base);document.documentElement.style.setProperty('--icon-active-background',dark);document.documentElement.style.setProperty('--wave-background',mono?'#777':base);document.documentElement.style.setProperty('--wave-active-background',mono?'#444':dark);document.body.classList.toggle('text-background',value.textBackground!==false);render()}

function render(){syncInfo();$('shortcut').textContent=shortcutLabel((settings?.shortcut||''));const active=phase==='recording';document.body.classList.toggle('recording',active);$('record').classList.toggle('active',active);$('record').disabled=restarting;$('record').setAttribute('aria-label',active?'録音を停止':phase==='processing'||phase==='starting'?'中断して録音を再開':'録音を開始');$('record').removeAttribute('title');$('shortcut-tip').textContent=$('record').getAttribute('aria-label')+' · '+shortcutLabel(settings?.shortcut||'');document.body.classList.toggle('error',Boolean(notice));
  if(notice){$('status').textContent=notice;$('status').title=notice;$('settings').title='設定';return;}
  $('status').title='';$('settings').title='設定';if(outcome&&phase==='idle'){$('status').textContent=outcome;return;}$('status').textContent=active?(command?'コマンド · キーを離して実行':'録音中 00:00'):phase==='starting'?'マイクを準備中':phase==='processing'?'補正中 · クリックで再開':'クリックで録音開始';
}
function error(e){notice=(e.message||String(e)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');render();api.reportError(notice.slice(0,4000)).catch(e=>{notice+='\n原因の共有に失敗: '+e.message;$('status').title=notice;});}
let noiseGate=Microphone.gate();
const levels=Array(11).fill(0);
function resetWave(){levels.fill(0);for(const bar of $('wave').children){bar.style.height='3px';bar.style.background=''}}
function audio(pcm){levels.shift();levels.push(Microphone.level(pcm));[...$('wave').children].forEach((bar,i)=>{bar.style.height=(3+levels[i]*47)+'px';bar.style.background=''});if(failure||cancelled)return;
  if(pending.reduce((n,b)=>n+b.byteLength,0)+pcm.byteLength>1920000){failure=new Error('音声処理が追いつきません。録音を停止します。');error(failure);if(phase==='recording')setTimeout(()=>{if(!cancelled)trackStop();},0);return;}
  pending.push(noiseGate(pcm));pumpAudio();
}
function pumpAudio(){if(pump||!backendReady||!pending.length)return;
  pump=(async()=>{try{while(pending.length&&!cancelled){const data=pending.shift();const update=await api.liveChunk(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));if(update.blocked&&!notice)error(new Error(update.blocked));}}catch(e){if(!cancelled){failure=e;pending.length=0;error(e);if(phase==='recording')setTimeout(()=>{if(!cancelled)trackStop();},0);}}finally{pump=null;}})();
}
async function stop(){if(phase!=='recording')return;phase='processing';clearInterval(timer);render();try{await recorder.stop();stream.getTracks().forEach(t=>t.stop());await pump;if(failure)throw failure;const result=await api.liveFinish();if(result.blocked)error(new Error(result.blocked));if(result.empty)notice='音声を認識できませんでした。';}catch(e){error(e);}finally{stream?.getTracks().forEach(t=>t.stop());try{await api.liveEnd();}catch(e){error(e)}pending.length=0;backendReady=false;phase='idle';resetWave();render();}}
async function openMicrophone(){
  let abandoned=false;
  const request=navigator.mediaDevices.getUserMedia(Microphone.constraints(settings)).then(value=>{
    if(abandoned){value.getTracks().forEach(t=>t.stop());throw new Error('中断したマイクを解放しました。');}
    try{Microphone.verify(value,settings);}catch(e){value.getTracks().forEach(t=>t.stop());throw e;}
    return value;
  });
  try{return await Promise.race([request,new Promise((_,reject)=>{
    cancelMicrophone=reason=>{abandoned=true;reject(reason||new Error('マイクの準備を中断しました。'));};
  })]);}finally{cancelMicrophone=null;}
}
async function performToggle(mode='dictation'){if(phase==='recording')return stop();if(phase==='processing'){cancelled=true;await api.cancel();return;}if(phase!=='idle'||!settings)return;phase='starting';noiseGate=Microphone.gate(settings.noiseThresholdDb);command=mode==='command';released=false;backendReady=false;outcome='';notice='';failure=null;cancelled=false;resetWave();render();let start;try{start=api.liveStart(mode);start.catch(e=>cancelMicrophone?.(e));stream=await openMicrophone();stream.getAudioTracks()[0].addEventListener('ended',()=>{if(phase==='recording'){failure=new Error('マイクが切断されました。接続と設定を確認してください。');error(failure);trackStop().catch(error);}});recorder=new LiveRecorder();await recorder.start(stream,audio);await start;backendReady=true;pumpAudio();phase='recording';started=Date.now();render();timer=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);if(!notice&&!command)$('status').textContent=`録音中 ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;if(seconds>=(command?30:300))trackStop();},500);if(command&&released)await stop();}catch(e){if(start)try{await start;}catch{}stream?.getTracks().forEach(t=>t.stop());if(recorder?.context&&recorder.context.state!=='closed')await recorder.context.close();try{await api.liveEnd();}catch(endError){error(endError)}phase='idle';resetWave();error(new Error(Microphone.message(e)));}}
function trackStop(){const running=stop();operation=running;return running.finally(()=>{if(operation===running)operation=null;});}
async function toggle(mode='dictation'){
  if(restarting)return;
  if(phase!=='idle'&&((notice&&!continuationState)||phase==='starting'||phase==='processing')){
    restarting=true;cancelled=true;backendReady=false;clearInterval(timer);cancelMicrophone?.();
    stream?.getTracks().forEach(t=>t.stop());
    try{
      await api.forceStop();
      if(recorder?.context&&recorder.context.state!=='closed')await recorder.context.close();
      await Promise.allSettled([operation,pump]);
      await api.liveEnd();pending.length=0;pump=null;phase='idle';
    }finally{restarting=false;}
  }
  const running=performToggle(mode);operation=running;
  try{return await running;}finally{if(operation===running)operation=null;}
}
$('record').onclick=()=>toggle().catch(error);
api.on('command-start',()=>toggle('command').catch(error));api.on('command-release',value=>{released=true;if(value.error)error(new Error(value.error));if(command&&phase==='recording')trackStop().catch(error);});api.on('command-progress',value=>{if(phase==='processing')$('status').textContent=value+' · クリックで中止';});api.on('command-result',value=>{outcome=value;render();});$('settings').onclick=()=>api.openSettings('operation').catch(error);$('hide').onclick=()=>api.hide().catch(error);
api.on('toggle',()=>toggle().catch(error));api.on('notice',message=>error(new Error(message)));api.on('settings-changed',configure);api.miniSettings().then(configure).catch(error);

api.on('continuation',value=>{continuationState=value;$('continuation-actions').hidden=true;$('copy-continuation').disabled=!value?.ready||!value?.text||value?.busy;$('insert-continuation').disabled=!value?.ready||!value?.safe||!value?.text||value?.busy;$('copy-continuation').title=value?.safe?(value.replaceCount?value.label+'・コピー後は末尾を手動修正':'未入力の続きをコピー'):'全文をコピー（入力済み範囲を要確認）';$('insert-continuation').title=value?.safe?'入力欄にカーソルを置いてから押してください':value?.label||'';if(value){notice='';outcome=value.ready?(value.safe?'続きの入力先を選べます':'入力済みの範囲を確認してください'):'';render();}else{outcome='';render();}});
$('copy-continuation').onclick=async()=>{try{await api.continuationCopy();notice='';outcome='コピーしました';render();}catch(e){error(e)}};
$('insert-continuation').onclick=async()=>{try{const result=await api.continuationInsert();notice='';outcome=result.verified?'続きを入力しました':'送信しました · 入力先を確認';render();}catch(e){error(e)}};

// Routine recording status stays off the canvas; only actionable messages add the third circle.
let infoMessage='';
function syncInfo(){
  const message=notice||(continuationState?.reason)||((phase==='idle'&&outcome)||'');
  $('info').hidden=!message;const shell=$('shell').querySelector('path');shell.setAttribute('d',message?shell.dataset.info:shell.dataset.idle);
  if(message!==infoMessage){infoMessage=message;api.miniInfo(message).catch(e=>{console.error(e);$('info').title='お知らせを更新できません: '+e.message;});}
}
$('info').onclick=()=>api.miniInfo(infoMessage,true).catch(error);
function showShortcut(show){$('shortcut-tip').hidden=!show;}
$('record').addEventListener('pointerenter',()=>showShortcut(true));
$('record').addEventListener('pointerleave',()=>showShortcut(false));
$('record').addEventListener('pointerdown',()=>showShortcut(false));
$('record').addEventListener('focus',()=>showShortcut(true));
$('record').addEventListener('blur',()=>showShortcut(false));
