function extraFill(){if(!data)return;$('text-background').checked=data.settings.textBackground;$('mcp-enabled').checked=data.settings.mcpEnabled;$('mcp-port').value=data.settings.mcpPort;const state=data.mcp||{state:'disabled'};$('mcp-status').textContent=state.state==='listening'?'接続待ち':state.error||'無効';$('mcp-url').textContent=state.url||'';$('mcp-copy').disabled=state.state!=='listening';updateMcpInstall();}
for(const id of ['mcp-enabled','mcp-port'])$(id).onchange=()=>persist({mcpEnabled:$('mcp-enabled').checked,mcpPort:Number($('mcp-port').value)}).then(extraFill).catch(e=>{extraFill();report(e)});
$('mcp-copy').onclick=()=>api.copyMcpConfiguration().then(()=>{$('status').textContent='接続設定をコピーしました。認証トークンが含まれます。'}).catch(report);
let mcpInstalling=false;
function updateMcpInstall(){if($('mcp-install'))$('mcp-install').disabled=mcpInstalling||data?.phase!=='idle'||data?.mcp?.state!=='listening'||![...document.querySelectorAll('#mcp-clients input')].some(input=>input.checked);}
api.mcpClients().then(clients=>{
 for(const client of clients){
  const row=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input'),file=document.createElement('small');
  label.className='switch-row';label.append(document.createTextNode(client.name));input.type='checkbox';input.role='switch';input.value=client.id;input.onchange=updateMcpInstall;label.append(input);file.textContent=client.file;row.append(label,file);$('mcp-clients').append(row);
 }
 updateMcpInstall();
}).catch(report);
$('mcp-install').onclick=async()=>{
 const ids=[...document.querySelectorAll('#mcp-clients input:checked')].map(input=>input.value);
 mcpInstalling=true;updateMcpInstall();$('mcp-install-results').textContent='設定を追記しています…';
 try{
  const results=await api.installMcpClients(ids);$('mcp-install-results').replaceChildren();
  for(const result of results){const row=document.createElement('p');row.textContent=result.name+'：'+(result.state==='added'?'追記しました':result.state==='unchanged'?'登録済みです':result.error);if(result.state==='error')row.className='error';if(result.backup){const file=document.createElement('small');file.textContent='バックアップ：'+result.backup;row.append(file);}$('mcp-install-results').append(row);}
 }catch(e){$('mcp-install-results').textContent=e.message;report(e);}finally{mcpInstalling=false;updateMcpInstall();}
};
const dictionaryTabs=[...document.querySelectorAll('.dictionary-tabs [role=tab]')];
async function selectDictionary(button){try{await saveTerms(true);for(const tab of dictionaryTabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(tab.getAttribute('aria-controls')).hidden=!active;}}catch(e){report(e)}}
dictionaryTabs.forEach((button,index)=>{button.onclick=()=>selectDictionary(button);button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=dictionaryTabs[e.key==='Home'?0:e.key==='End'?1:1-index];selectDictionary(next).then(()=>next.focus());};});

$('text-background').onchange=()=>persist({textBackground:$('text-background').checked}).catch(e=>{extraFill();report(e)});
