// Shared by recording and the settings-only microphone check. No audio leaves the device.
const Microphone={
  constraints(settings){return {audio:{channelCount:1,echoCancellation:true,noiseSuppression:{exact:settings.noiseSuppression??true},autoGainControl:false,...(settings.microphoneId?{deviceId:{exact:settings.microphoneId}}:{})},video:false};},
  verify(stream,settings){const actual=stream.getAudioTracks()[0].getSettings();if(actual.noiseSuppression!==(settings.noiseSuppression??true))throw new Error('ノイズ抑制の設定を適用できません。マイクの設定を確認してください。');if(settings.microphoneId&&actual.deviceId!==settings.microphoneId)throw new Error('選択したマイクを使用できません。設定で選び直してください。');},
  gate(threshold=-80){let hold=0;return pcm=>{if(threshold<=-80||!pcm.length)return pcm;let sum=0;for(const x of pcm)sum+=x*x;const db=10*Math.log10(Math.max(sum/pcm.length,1e-16));if(db>=threshold){hold=3200;return pcm;}if(hold>0){hold-=pcm.length;return pcm;}return new Float32Array(pcm.length);};},
  level(pcm){if(!pcm.length)return 0;let sum=0;for(const value of pcm)sum+=value*value;const rms=Math.sqrt(sum/pcm.length);return Math.max(0,Math.min(1,(20*Math.log10(Math.max(rms,1e-8))+60)/54));},
  message(error){if(error.name==='NotFoundError'||error.name==='OverconstrainedError')return '選択したマイクまたは音声設定を使用できません。接続と設定を確認してください。';if(error.name==='NotAllowedError')return 'マイクを使用できません。Windowsのマイクへのアクセス許可を確認してください。';if(error.name==='NotReadableError')return 'マイクを開始できません。他のアプリで使用中でないか確認してください。';return error.message||String(error);}
};
if(typeof module!=='undefined')module.exports=Microphone;
