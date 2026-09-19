function qualityFill(settings){
  $('command-shortcut').dataset.key=settings.commandShortcut;
  $('command-shortcut').value=shortcutLabel(settings.commandShortcut);
  $('save-audio').checked=settings.saveAudio;$('replacement-list').replaceChildren();settings.replacements.forEach(replacementRow);
}
function renderCommandModel(){
 if(!data)return;
 const cloud=['openai','gemini'].includes(data.settings.aiProvider);
 const model=data.commandModel||{state:'missing'},active=['downloading','verifying'].includes(model.state),idle=data.phase==='idle';
 $('fast-start').disabled=cloud||!idle;
 $('progressive-correction').checked=data.settings.progressiveCorrection;
 $('progressive-correction').disabled=!idle;
 $('advanced-correction').checked=!cloud&&data.settings.advancedCorrection;
 $('correction-model-info').textContent=cloud?`API選択中は${data.settings.aiProvider==='openai'?'gpt-5.6-luna':'gemini-3.5-flash'}で補正とコマンド操作を行います。この切替はローカル専用です。`:model.state==='ready'?'Qwen3-4Bを取得済み。オンにすると補正に使用します。待ち時間とメモリ使用量が増える場合があります。':'ローカル専用のQwen3-4B（約2.5GB）です。下のボタンから取得すると上位補正を有効にできます。音声コマンドと共用します。';
 $('advanced-correction').disabled=cloud||!idle||(!data.settings.advancedCorrection&&model.state!=='ready');
 $('correction-download').hidden=cloud||active||model.state==='ready';
 $('correction-download').disabled=!idle;
 $('command-enabled').checked=data.settings.commandEnabled;
 $('command-enabled').disabled=!idle||(!cloud&&!data.settings.commandEnabled&&model.state!=='ready');
 $('command-options').hidden=!data.settings.commandEnabled;
 $('command-download').hidden=cloud||active||model.state==='ready';
 $('command-download').disabled=!idle;
 $('command-download').textContent=model.state==='error'?'再ダウンロードして有効にする':'ダウンロードして有効にする';
 $('command-download-cancel').hidden=!active;$('command-download-cancel').disabled=false;
 $('command-model-status').textContent=cloud?'音声コマンドは選択したAPIを使用します。専用モデルのダウンロードは不要です。':model.state==='downloading'?`ダウンロード中 ${Math.floor(model.received/model.total*100)}% · ${Math.floor(model.received/1e6)} / ${Math.ceil(model.total/1e6)} MB`:model.state==='verifying'?'モデルを検証中':model.state==='ready'?(data.settings.commandEnabled||data.settings.advancedCorrection?'有効 · モデルは処理時だけ読み込みます。':'ダウンロード済み · オフでもモデルは保存されます。'):model.error||'初期状態はオフです。';
}
$('command-enabled').onchange=async()=>{try{await persist({commandEnabled:$('command-enabled').checked});}catch(error){report(error);}finally{renderCommandModel();}};
$('progressive-correction').onchange=async()=>{try{await persist({progressiveCorrection:$('progressive-correction').checked});}catch(error){report(error);}finally{renderCommandModel();}};
$('advanced-correction').onchange=async()=>{try{await persist({advancedCorrection:$('advanced-correction').checked});}catch(error){report(error);}finally{renderCommandModel();}};
$('correction-download').onclick=()=>downloadSharedModel('correction');
$('command-download').onclick=()=>downloadSharedModel('command');
async function downloadSharedModel(purpose){
 if(!await saveCurrent(true))return;
 $('command-download').disabled=true;
 try{data=await api.downloadCommandModel(purpose);$('status').textContent=data.settings[purpose==='correction'?'advancedCorrection':'commandEnabled']?(purpose==='correction'?'上位モデルでの補正を有効にしました。':'キー操作を有効にしました。'):'ダウンロードを中止しました。';$('status').classList.remove('error');}
 catch(error){report(error);}finally{renderCommandModel();}
};
$('command-download-cancel').onclick=()=>api.cancelCommandDownload().catch(report);
api.on('command-model-changed',model=>{if(data){data.commandModel=model;renderCommandModel();}});
function replacementRow(value={from:'',to:''}){
  const row=document.createElement('tr');row.className='replacement';
  for(const [key,label] of [['from','置換前'],['to','置換後']]){const cell=document.createElement('td'),input=document.createElement('input');input.dataset.key=key;input.value=value[key];input.maxLength=120;input.setAttribute('aria-label',label);input.onblur=()=>saveReplacements().catch(report);cell.append(input);row.append(cell);}
  const cell=document.createElement('td'),remove=document.createElement('button');remove.textContent='×';remove.className='delete-term';remove.setAttribute('aria-label','この表記置換を削除');remove.onclick=async()=>{try{await saveReplacements(false,row);row.remove();}catch(e){report(e)}};cell.append(remove);row.append(cell);$('replacement-list').append(row);
}
async function saveReplacements(clean=false,excluded=null){
  const rows=[...$('replacement-list').children];const replacements=rows.filter(r=>r!==excluded).map(r=>Object.fromEntries([...r.querySelectorAll('input')].map(i=>[i.dataset.key,i.value.trim()]))).filter(r=>r.from||r.to);
  if(JSON.stringify(replacements)!==JSON.stringify(data.settings.replacements))await persist({replacements});
  if(clean)for(const row of rows)if(![...row.querySelectorAll('input')].some(i=>i.value.trim()))row.remove();
}
$('add-replacement').onclick=()=>{if($('replacement-list').children.length>=100)return report(new Error('表記置換は100件までです。'));replacementRow();$('replacement-list').lastElementChild.querySelector('input').focus();};
async function renderRecordings(){
  const rows=await api.recordingList();$('recordings-list').replaceChildren();
  for(const row of rows){const entry=document.createElement('article');entry.className='recording-entry';const label=document.createElement('p');label.textContent=new Date(row.at).toLocaleString('ja-JP')+` · ${Math.ceil(row.duration)}秒`+(row.state==='interrupted'?' · 中断した録音':'');const actions=document.createElement('div');actions.className='recording-actions';const player=document.createElement('audio');player.controls=true;player.hidden=true;player.preload='none';player.onerror=()=>report(new Error('保存した音声を再生できません。'));
    const play=document.createElement('button');play.className='paste-button';play.textContent='音声を確認';play.onclick=async()=>{play.disabled=true;try{player.src=await api.recordingPreview(row.id);player.hidden=false;await player.play();}catch(e){report(e)}finally{play.disabled=false;}};
    const retry=document.createElement('button');retry.className='paste-button';retry.textContent='再認識';retry.onclick=async()=>{try{player.pause();retry.disabled=true;data=await api.recordingRetry(row.id);renderHistory();$('status').classList.remove('error');$('status').textContent='再認識した結果を履歴に追加しました。';}catch(e){report(e)}finally{busy(data.phase);}};
    const remove=document.createElement('button');remove.className='delete-recording paste-button';remove.textContent='削除';remove.onclick=()=>{pendingAction={recordingId:row.id};$('confirm-title').textContent='この録音を削除してよろしいですか？';$('confirm-description').textContent='音声を削除します。文字起こしの履歴は残ります。';$('confirm-dialog').showModal();$('confirm-cancel').focus();};
    actions.append(play,retry,remove);entry.append(label,actions,player);$('recordings-list').append(entry);
  }
  if(!rows.length)$('recordings-list').textContent='保存した録音はありません。';
}
api.on('phase-changed',phase=>{if(phase==='idle')renderRecordings().catch(report);});
renderRecordings().catch(report);
