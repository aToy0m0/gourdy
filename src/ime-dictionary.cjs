const {normalizeReading}=require('./dictionary-reading.js');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {createHash}=require('node:crypto');
function readImeDictionary(){return new Promise((resolve,reject)=>execFile(path.join(__dirname,'ImeDictionary.exe'),[],{windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:16000000},(error,stdout,stderr)=>{if(error)return reject(new Error(stderr.trim()||'Windows辞書を読み取れませんでした: '+error.message));try{const result=JSON.parse(stdout.replace(/^\uFEFF/,''));if(result.source!=='Microsoft IME'||!Array.isArray(result.terms)||result.terms.length>100000)throw new Error('Windows辞書の応答が不正です。');resolve(result.terms);}catch(e){reject(e)}}));}
function key(entry){const reading=entry.reading.trim().normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));return createHash('sha256').update(JSON.stringify([entry.term.trim().normalize('NFC'),reading])).digest('hex');}
function mergeIme(data,entries,{automatic=false}={}){
 const known={...data.imeKnown};for(const term of data.settings.terms)known[key(term)]=term;
 const terms=[...data.settings.terms],seen=new Set(data.imeSeen||[]),existing=new Set(terms.map(key));
 const stats={added:0,duplicates:0,skipped:0,overflow:0,previouslyImported:0,total:entries.length};
 for(const entry of entries){
  if(!entry||typeof entry.term!=='string'||typeof entry.reading!=='string')throw new Error('Windows辞書の単語形式が不正です。');
  const item={term:entry.term.trim(),reading:entry.reading.trim()};
  if(!item.term||!item.reading||item.term.length>80||item.reading.length>120||/[\r\n\t\0]/.test(item.term+item.reading)){stats.skipped++;continue;}
  try{item.reading=normalizeReading(item.reading);}catch{stats.skipped++;continue;}
  const id=key(item);known[id]=item;
  if(existing.has(id)){stats.duplicates++;seen.add(id);continue;}
  if(automatic&&seen.has(id)){stats.previouslyImported++;continue;}
  if(terms.length>=100){stats.overflow++;continue;}
  terms.push(item);existing.add(id);seen.add(id);stats.added++;
 }
 if(seen.size>100000)throw new Error('Windows辞書の取り込み記録が上限を超えています。');
 return {data:{...data,settings:{...data.settings,terms},imeSeen:[...seen],imeKnown:Object.fromEntries([...seen].filter(id=>known[id]).map(id=>[id,known[id]]))},stats};
}
function importMessage(s){return `Windows辞書: ${s.added}件追加、${s.duplicates}件重複`+(s.previouslyImported?`、取り込み済み${s.previouslyImported}件`:'')+(s.skipped?`、形式・文字数の対象外${s.skipped}件`:'')+(s.overflow?`。上限100件のため${s.overflow}件は未取り込みです。`:'。');}
function exclusions(data,entries=[]){
 const existing=new Set(data.settings.terms.map(key)),known={...data.imeKnown};
 for(const entry of entries)if(entry&&typeof entry.term==='string'&&typeof entry.reading==='string')known[key(entry)]=entry;
 return (data.imeSeen||[]).filter(id=>!existing.has(id)).map(id=>({id,...(known[id]||{term:'以前の取り込み記録（表記不明）',reading:''})}));
}
function releaseExclusion(data,id){
 if(!exclusions(data).some(row=>row.id===id))throw new Error('除外項目が見つかりません。一覧を更新してください。');
 const known={...data.imeKnown};delete known[id];
 return {...data,imeSeen:data.imeSeen.filter(value=>value!==id),imeKnown:known};
}
module.exports={readImeDictionary,mergeIme,importMessage,exclusions,releaseExclusion};
