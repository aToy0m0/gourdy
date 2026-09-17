const api=window.continuation,$=id=>document.getElementById(id);let current;
function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
api.on(value=>{current=value;$('label').textContent=value.label;$('label').title=[value.label,value.reason].filter(Boolean).join(' · ');$('copy').disabled=!value.ready||!value.text||value.busy;$('insert').disabled=!value.ready||!value.safe||!value.text||value.busy;const text=$('text'),bottom=text.scrollTop+text.clientHeight>=text.scrollHeight-8;const next=value.text||(value.ready?'認識した文字はありません。':'文字起こし中…');if(text.textContent!==next){text.textContent=next;message('');}if(bottom)text.scrollTop=text.scrollHeight;});
$('copy').onclick=async()=>{try{await api.copy();message('コピーしました。');}catch(e){message(e.message,true)}};
$('insert').onclick=async()=>{try{const result=await api.insert();message(result.verified?'入力しました。':'送信しました。入力先を確認してください。');}catch(e){message(e.message,true)}};
$('close').onclick=()=>api.hide().catch(e=>message(e.message,true));
