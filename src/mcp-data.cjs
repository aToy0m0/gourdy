const {normalizeReading}=require('./dictionary-reading.js');
const {validate}=require('./store.cjs');

// All mutations join the same queue as settings UI writes.
function dataTools({store,serialize,isIdle,onChange,recordings}){
 const edit=(key,entry,remove)=>serialize(async()=>{
  if(!isIdle())throw new Error('録音・補正が終わってから辞書を変更してください。');
  const rows=store.data.settings[key],fields=key==='terms'?['term','reading']:['from','to'];
  const index=rows.findIndex(row=>fields.every(field=>row[field]===entry[field]));
  if(remove&&index<0)throw new Error('指定した項目はありません。一覧を確認してください。');
  if(!remove&&rows.some(row=>key==='terms'?fields.every(field=>row[field]===entry[field]):row.from===entry.from))throw new Error('既に登録されています。変更する場合は既存項目を削除してください。');
  const next=remove?rows.filter((_,i)=>i!==index):[...rows,entry];
  const settings=validate({...store.data.settings,[key]:next});
  await store.write({...store.data,settings});onChange();
  return {item:entry,count:next.length};
 });
 const term=({term,reading},remove=false)=>{
  const entry={term:term.trim(),reading:remove?reading:normalizeReading(reading)};
  if(!entry.term||(!remove&&!entry.reading)||/[\r\n\t\0]/.test(entry.term))throw new Error('表記と読みを入力してください。');
  return edit('terms',entry,remove);
 };
 const replacement=({from,to},remove=false)=>{
  const entry={from:from.trim(),to:to.trim()};
  if(!entry.from||!entry.to)throw new Error('置換前後の表記を入力してください。');
  return edit('replacements',entry,remove);
 };
 return {
  list_dictionary:async()=>structuredClone(store.data.settings.terms),
  add_dictionary:args=>term(args),delete_dictionary:args=>term(args,true),
  list_replacements:async()=>structuredClone(store.data.settings.replacements),
  add_replacement:args=>replacement(args),delete_replacement:args=>replacement(args,true),
  list_history:async({offset=0,limit=50})=>({total:store.data.history.length,offset,items:store.data.history.slice(offset,offset+limit).map(({id,at,status,text})=>({id,at,status,preview:text.slice(0,160)}))}),
  get_history:async({id})=>{const row=store.data.history.find(row=>row.id===id);if(!row)throw new Error('指定した履歴はありません。');return structuredClone(row);},
  list_recordings:()=>recordings.list()
 };
}
module.exports={dataTools};
