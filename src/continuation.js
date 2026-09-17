const api=window.continuation,$=id=>document.getElementById(id);let current,copyTimer;
function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
function controls(){
 if(!current)return;
 const reason=current.busy?'入力中です。完了後にコピーできます。':!current.ready?(current.phase==='processing'?'音声認識・AI補正中です。完了後にコピーできます。':current.phase==='starting'?'録音を準備中です。':'録音中です。停止・補正の完了後にコピーできます。'):!current.text?'コピーする文字がありません。':'';
 $('copy').setAttribute('aria-disabled',String(Boolean(reason)));$('copy').title=reason||'コピー';
 $('insert').disabled=!current.ready||!current.safe||!current.text||current.busy;
 $('label').textContent=copyTimer?'コピーしました':current.label;
 $('label').title=copyTimer?'コピーしました':[current.label,current.reason].filter(Boolean).join(' · ');
}
api.on(value=>{current=value;const text=$('text'),bottom=text.scrollTop+text.clientHeight>=text.scrollHeight-8;const next=value.text||(value.ready?'認識した文字はありません。':'文字起こし中…');if(text.textContent!==next){text.textContent=next;message('');clearTimeout(copyTimer);copyTimer=null;}controls();if(bottom)text.scrollTop=text.scrollHeight;});
api.onPhase(phase=>{if(current){current={...current,phase,ready:phase==='idle'};controls();}});
$('copy').onclick=async()=>{if($('copy').getAttribute('aria-disabled')==='true')return;try{await api.copy();message('');clearTimeout(copyTimer);copyTimer=setTimeout(()=>{copyTimer=null;controls();},2500);controls();}catch(e){message(e.message,true)}};
$('insert').onclick=async()=>{try{const result=await api.insert();message(result.verified?'入力しました。':'送信しました。入力先を確認してください。');}catch(e){message(e.message,true)}};
$('close').onclick=()=>api.hide().catch(e=>message(e.message,true));
