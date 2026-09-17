let microphoneStream=null,microphoneRecorder=null,microphoneGeneration=0,microphonePending=false;
function microphoneFill(settings){stopMicrophoneTest().catch(report);$('noise-suppression').checked=settings.noiseSuppression;$('noise-threshold').value=settings.noiseThresholdDb;thresholdLabel();refreshMicrophones().catch(e=>{$('microphone-status').textContent=Microphone.message(e)});}
async function refreshMicrophones(){
  const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'),selected=data.settings.microphoneId;
  const options=[new Option('Windowsの既定','')];
  for(const device of devices)if(device.deviceId&&device.deviceId!=='default'&&device.deviceId!=='communications')options.push(new Option(device.label||`マイク ${options.length}`,device.deviceId));
  if(selected&&!options.some(o=>o.value===selected))options.push(new Option('選択したマイク（未接続）',selected));
  $('microphone-device').replaceChildren(...options);$('microphone-device').value=selected;
}
function microphoneLevel(pcm){const percent=Math.round(Microphone.level(pcm)*100);$('microphone-meter').firstElementChild.style.width=percent+'%';$('microphone-meter').setAttribute('aria-valuenow',String(percent));}
async function stopMicrophoneTest(){
  microphoneGeneration++;microphonePending=false;const recorder=microphoneRecorder;microphoneRecorder=null;microphoneStream?.getTracks().forEach(t=>t.stop());microphoneStream=null;
  microphoneLevel([]);$('microphone-test').textContent='マイクを確認';$('microphone-status').textContent='';
  if(recorder?.context&&recorder.context.state!=='closed')await recorder.context.close();
}
$('microphone-test').onclick=async()=>{
  if(microphonePending||microphoneStream){await stopMicrophoneTest();return;}
  const generation=++microphoneGeneration;microphonePending=true;$('microphone-test').textContent='確認を終了';$('microphone-status').textContent='マイクを準備中…';
  let stream,recorder;
  try{
    await chain;if(generation!==microphoneGeneration||data.phase!=='idle')return;
    stream=await navigator.mediaDevices.getUserMedia(Microphone.constraints(data.settings));
    if(generation!==microphoneGeneration){stream.getTracks().forEach(t=>t.stop());return;}
    Microphone.verify(stream,data.settings);microphoneStream=stream;
    stream.getAudioTracks()[0].addEventListener('ended',()=>{stopMicrophoneTest().then(()=>{$('microphone-status').textContent='マイクが切断されました。'}).catch(report);});
    recorder=new LiveRecorder();microphoneRecorder=recorder;await recorder.start(stream,pcm=>{if(generation===microphoneGeneration)microphoneLevel(pcm)});
    if(generation!==microphoneGeneration){stream.getTracks().forEach(t=>t.stop());if(recorder.context.state!=='closed')await recorder.context.close();return;}
    microphonePending=false;$('microphone-status').textContent='声を出すと音量を確認できます。';await refreshMicrophones();
  }catch(e){stream?.getTracks().forEach(t=>t.stop());if(generation===microphoneGeneration){await stopMicrophoneTest();$('microphone-status').textContent=Microphone.message(e);}}
};
for(const id of ['microphone-device','noise-suppression'])$(id).onchange=async()=>{
  const patch={microphoneId:$('microphone-device').value,noiseSuppression:$('noise-suppression').checked};
  try{await stopMicrophoneTest();await persist(patch);}catch(e){microphoneFill(data.settings);report(e);}
};
navigator.mediaDevices.addEventListener('devicechange',()=>refreshMicrophones().catch(e=>{$('microphone-status').textContent=Microphone.message(e)}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMicrophoneTest().catch(report)});
window.addEventListener('pagehide',()=>{microphoneGeneration++;microphoneStream?.getTracks().forEach(t=>t.stop());});

function thresholdLabel(){const value=Number($('noise-threshold').value);$('noise-threshold-value').textContent=value===-80?'オフ':value+' dB';}
$('noise-threshold').oninput=thresholdLabel;
$('noise-threshold').onchange=()=>persist({noiseThresholdDb:Number($('noise-threshold').value)}).catch(e=>{microphoneFill(data.settings);report(e)});
