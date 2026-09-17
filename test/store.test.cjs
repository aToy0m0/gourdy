const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Store,defaults,trimHistory,validate}=require('../src/store.cjs');
test('履歴上限はUnicode文字を壊さず適用する',()=>{
  const entries=[{id:'1',text:'😀あいう',original:'😀あいう'},{id:'2',text:'次'}];
  assert.deepEqual(trimHistory(entries,{count:1,chars:2}),[{id:'1',text:'😀あ',original:'😀あ'}]);
  assert.equal(trimHistory(entries,{count:0,chars:10}).length,0);
});
test('不正な保存上限・設定を拒否する',()=>{for(const patch of [{count:-1},{chars:0},{liveInput:'yes'},{terms:[{term:1,reading:''}]}])assert.throws(()=>validate({...defaults,...patch}));});
test('閉じ方の旧設定はトレイへ移行し、完全終了の選択を保持する',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gourdy-close-'));const settings={...defaults};delete settings.closeToTray;
 await fs.writeFile(path.join(dir,'app-data.json'),JSON.stringify({settings,history:[]}));
 const store=new Store(dir);await store.load();assert.equal(store.data.settings.closeToTray,true);assert.equal(defaults.shortcut,'ControlRight');
 await store.write({...store.data,settings:{...store.data.settings,closeToTray:false}});assert.equal((await new Store(dir).load()).settings.closeToTray,false);
 assert.throws(()=>validate({...defaults,closeToTray:'quit'}));
});
test('旧設定を引き継ぎ、設定と履歴を一緒に保存・再読込する',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dictation-store-'));
  await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify({shortcut:'Control+F8',liveInput:false,glossary:[{term:'Claude',reading:'クロード'}]}));
  const store=new Store(dir);await store.load();assert.equal(store.data.settings.shortcut,'Control+F8');
  await store.write({...store.data,history:[{id:'a',at:'2026-09-15',text:'テスト'}]});
  const reopened=new Store(dir);await reopened.load();assert.equal(reopened.data.history[0].text,'テスト');
  await fs.writeFile(store.file,'invalid');await assert.rejects(new Store(dir).load());
});


test('既存録音キーと新しいコマンド初期キーが重なる場合も既存設定を読み込める',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dictation-migration-'));
 const settings={...defaults,shortcut:'Super+Shift+J'};delete settings.commandShortcut;delete settings.saveAudio;delete settings.replacements;
 await fs.writeFile(path.join(dir,'app-data.json'),JSON.stringify({settings,history:[]}));
 const store=new Store(dir);await store.load();assert.equal(store.data.settings.shortcut,'Super+Shift+J');assert.equal(store.data.settings.commandShortcut,'Super+Shift+K');assert.equal(store.data.settings.saveAudio,true);
});

test('continuation and preload migrate and retain opt-out',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'okosy-assist-'));const settings={...defaults};delete settings.continuationAssist;delete settings.fastStart;await fs.writeFile(path.join(dir,'app-data.json'),JSON.stringify({settings,history:[]}));const store=new Store(dir);await store.load();assert.equal(store.data.settings.continuationAssist,true);assert.equal(store.data.settings.fastStart,true);await store.write({...store.data,settings:{...store.data.settings,continuationAssist:false,fastStart:false}});const reopened=new Store(dir);await reopened.load();assert.equal(reopened.data.settings.continuationAssist,false);assert.equal(reopened.data.settings.fastStart,false);});
