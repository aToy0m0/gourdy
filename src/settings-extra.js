function extraFill(){if(!data)return;$('text-background').checked=data.settings.textBackground;$('mcp-enabled').checked=data.settings.mcpEnabled;$('mcp-port').value=data.settings.mcpPort;const state=data.mcp||{state:'disabled'};$('mcp-status').textContent=state.state==='listening'?'接続待ち':state.error||'無効';$('mcp-url').textContent=state.url||'';$('mcp-copy').disabled=state.state!=='listening';}
for(const id of ['mcp-enabled','mcp-port'])$(id).onchange=()=>persist({mcpEnabled:$('mcp-enabled').checked,mcpPort:Number($('mcp-port').value)}).then(extraFill).catch(e=>{extraFill();report(e)});
$('mcp-copy').onclick=()=>api.copyMcpConfiguration().then(()=>{$('status').textContent='接続設定をコピーしました。認証トークンが含まれます。'}).catch(report);
const dictionaryTabs=[...document.querySelectorAll('.dictionary-tabs [role=tab]')];
async function selectDictionary(button){try{await saveTerms(true);for(const tab of dictionaryTabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(tab.getAttribute('aria-controls')).hidden=!active;}}catch(e){report(e)}}
dictionaryTabs.forEach((button,index)=>{button.onclick=()=>selectDictionary(button);button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=dictionaryTabs[e.key==='Home'?0:e.key==='End'?1:1-index];selectDictionary(next).then(()=>next.focus());};});

$('text-background').onchange=()=>persist({textBackground:$('text-background').checked}).catch(e=>{extraFill();report(e)});
