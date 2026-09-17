const singleKeys={ControlLeft:162,ControlRight:163,AltLeft:164,AltRight:165};
function shortcutKeys(shortcut){
 if(typeof shortcut!=='string'||shortcut.length>80)throw new Error('ショートカットが不正です。');
 if(singleKeys[shortcut])return [singleKeys[shortcut]];
 const parts=shortcut.split('+'),mods=['Control','CommandOrControl','Alt','Shift','Super'];
 const codes={Control:17,CommandOrControl:17,Alt:18,Shift:16,Super:91,Space:32,Home:36,End:35,Insert:45,Delete:46,PageUp:33,PageDown:34,',':188,'.':190,'/':191,';':186,"'":222,'[':219,']':221,'-':189,'=':187,Up:38,Down:40,Left:37,Right:39};
 if(parts.length<2||!parts.slice(0,-1).every(p=>mods.includes(p))||!parts.slice(0,-1).some(p=>p!=='Shift')||mods.includes(parts.at(-1)))throw new Error('Ctrl・Alt・Winを含む組み合わせ、または左右Ctrl・Alt単独を指定してください。');
 const keys=parts.map(p=>codes[p]??(/^[A-Z0-9]$/.test(p)?p.charCodeAt(0):/^F([1-9]|1\d|2[0-4])$/.test(p)?111+Number(p.slice(1)):null));
 if(keys.includes(null)||new Set(keys).size!==keys.length)throw new Error('ショートカットのキーを確認してください。');return keys;
}
function shortcutLabel(value){return value.split('+').map(k=>({ControlRight:'Ctrl（右）',ControlLeft:'Ctrl（左）',AltRight:'Alt（右）',AltLeft:'Alt（左）',CommandOrControl:'Ctrl',Control:'Ctrl',Super:'Win'}[k]||k)).join(' + ');}
if(typeof module!=='undefined')module.exports={shortcutKeys,shortcutLabel,singleKeys};
