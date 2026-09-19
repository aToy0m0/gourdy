function cloudFill(){
 if(!data)return;
 $('ai-provider').value=data.settings.aiProvider;
 const idle=data.phase==='idle';
 const model=data.localModels||{state:'missing'},working=['downloading','verifying'].includes(model.state);
 $('local-model-download').disabled=!idle||working||model.state==='ready';$('local-model-cancel').hidden=!working;$('local-model-cancel').disabled=false;
 $('local-model-state').textContent=model.state==='ready'?'取得済み':working?`取得中 ${Math.floor(model.received/1e6)} / ${Math.ceil(model.total/1e6)} MB`:model.error||'未取得 · 自動ではダウンロードしません。';
 for(const provider of ['openai','gemini']){
  const registered=Boolean(data.cloudKeys?.[provider]);
  $(provider+'-key-state').textContent=registered?'登録済み（接続・課金枠は未確認）':'未登録';
  $(provider+'-key-delete').disabled=!idle||!registered;
 }
 $('file-ai-notice').textContent=data.settings.aiProvider==='none'?'AI接続で使用する方式を選んでください。':data.settings.aiProvider==='local'?'接続先：ローカル':'接続先：'+(data.settings.aiProvider==='openai'?'OpenAI':'Gemini')+' · 音声と文章をAPIへ送信します。区間の失敗時は最大3回試行し、再送にも料金がかかる場合があります。';
 $('cloud-active').textContent=data.settings.aiProvider==='none'?'使うAIを選択してください。':data.settings.aiProvider==='local'?'音声認識・補正はすべて端末内で処理します。':'マイク・ファイル・再認識・MCPの音声、補正対象の文章・辞書を選択したAPIへ送信します。音声コマンドでは選択中の文字も送信します。API利用料がかかります。';
}
$('ai-provider').onchange=async()=>{try{await persist({aiProvider:$('ai-provider').value});}catch(e){report(e);}finally{cloudFill();renderCommandModel();}};
for(const provider of ['openai','gemini']){
 $(provider+'-key-save').onclick=async()=>{const input=$(provider+'-key'),key=input.value.trim();input.value='';try{data.cloudKeys=await api.saveCloudKey(provider,key);success();}catch(e){report(e);}finally{cloudFill();}};
 $(provider+'-key-delete').onclick=()=>{pendingAction={cloudProvider:provider};$('confirm-title').textContent='登録済みのAPIキーを削除してよろしいですか？';$('confirm-description').textContent='この端末に保存したキーを削除します。使用中の場合は接続を解除します。提供元で発行したキー自体は失効しません。';$('confirm-dialog').showModal();$('confirm-cancel').focus();};
}
api.on('data-changed',cloudFill);
api.on('phase-changed',cloudFill);

$('local-model-download').onclick=async()=>{try{data=await api.downloadLocalModels();success();}catch(e){report(e);}finally{cloudFill();}};
$('local-model-cancel').onclick=()=>api.cancelLocalModels().catch(report);
api.on('local-models-changed',state=>{if(data){data.localModels=state;cloudFill();}});
