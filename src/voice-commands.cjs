function shortcutKeys(shortcut) {
  if(typeof shortcut!=='string'||shortcut.length>80)throw new Error('コマンドショートカットが不正です。');
  const keys=shortcut.split('+').map(key=>({Control:17,CommandOrControl:17,Alt:18,Shift:16,Super:91,Space:32,Home:36,End:35,Insert:45,Delete:46,PageUp:33,PageDown:34}[key]??(/^[A-Z0-9]$/.test(key)?key.charCodeAt(0):/^F([1-9]|1\d|2[0-4])$/.test(key)?111+Number(key.slice(1)):null)));
  if(keys.some(k=>k===null)||keys.length<2)throw new Error('コマンドショートカットのキーを確認してください。');
  return keys;
}

module.exports={shortcutKeys};
