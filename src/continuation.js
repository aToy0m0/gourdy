const api=window.continuation,$=id=>document.getElementById(id);let current,copyTimer;
function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
function controls(){
 if(!current)return;
 const reason=current.busy?'入力中です。完了後にコピーできます。':!current.ready?(current.phase==='processing'?'音声認識・AI補正中です。完了後にコピーできます。':current.phase==='starting'?'録音を準備中です。':'録音中です。停止・補正の完了後にコピーできます。'):!current.text?'コピーする文字がありません。':'';
 $('copy').setAttribute('aria-disabled',String(Boolean(reason)));$('copy').title=reason||'コピー';
 $('insert').disabled=!current.ready||!current.text||current.busy;
 $('label').textContent=copyTimer?'コピーしました':current.label;
 $('label').title=copyTimer?'コピーしました':[current.label,current.reason].filter(Boolean).join(' · ');
}
api.on(value=>{current=value;const text=$('text'),bottom=text.scrollTop+text.clientHeight>=text.scrollHeight-8;const next=value.text||(value.ready?'認識した文字はありません。':'文字起こし中…');if(text.textContent!==next){text.textContent=next;message('');clearTimeout(copyTimer);copyTimer=null;}controls();if(bottom)text.scrollTop=text.scrollHeight;});
api.onPhase(phase=>{if(current){current={...current,phase,ready:phase==='idle'};controls();}});
$('copy').onclick=async()=>{if($('copy').getAttribute('aria-disabled')==='true')return;try{await api.copy(selection());message('');clearTimeout(copyTimer);copyTimer=setTimeout(()=>{copyTimer=null;controls();},2500);controls();}catch(e){message(e.message,true)}};
$('insert').onclick=async()=>{try{const result=await api.insert(selection());message(result.verified?'入力しました。':'送信しました。入力先を確認してください。');}catch(e){message(e.message,true)}};
$('close').onclick=()=>api.hide().catch(e=>message(e.message,true));

function selection(){
 const selected=window.getSelection(),text=$('text');
 if(!selected||selected.isCollapsed||!selected.rangeCount)return null;
 const range=selected.getRangeAt(0);
 if(!text.contains(range.startContainer)||!text.contains(range.endContainer))return null;
 const prefix=range.cloneRange();prefix.selectNodeContents(text);prefix.setEnd(range.startContainer,range.startOffset);
 const start=prefix.toString().length;return {start,end:start+range.toString().length,source:current.text};
}
for(const id of ['copy','insert'])$(id).addEventListener('mousedown',event=>event.preventDefault());

api.onPosition(({tailX})=>document.documentElement.style.setProperty('--tail-x',tailX+'px'));
