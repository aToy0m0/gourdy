const {normalizeReading}=require('./dictionary-reading.js');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {createHash}=require('node:crypto');
function readImeDictionary(){return new Promise((resolve,reject)=>execFile(path.join(__dirname,'ImeDictionary.exe'),[],{windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:16000000},(error,stdout,stderr)=>{if(error)return reject(new Error(stderr.trim()||'Windows辞書を読み取れませんでした: '+error.message));try{const result=JSON.parse(stdout.replace(/^\uFEFF/,''));if(result.source!=='Microsoft IME'||!Array.isArray(result.terms)||result.terms.length>100000)throw new Error('Windows辞書の応答が不正です。');resolve(result.terms);}catch(e){reject(e)}}));}
function key(entry){const reading=entry.reading.trim().normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));return createHash('sha256').update(JSON.stringify([entry.term.trim().normalize('NFC'),reading])).digest('hex');}
function mergeIme(data,entries,{automatic=false}={}){
 const terms=[...data.settings.terms],seen=new Set(data.imeSeen||[]),existing=new Set(terms.map(key));
 const stats={added:0,duplicates:0,skipped:0,overflow:0,previouslyImported:0,total:entries.length};
 for(const entry of entries){
  if(!entry||typeof entry.term!=='string'||typeof entry.reading!=='string')throw new Error('Windows辞書の単語形式が不正です。');
  const item={term:entry.term.trim(),reading:entry.reading.trim()};
  if(!item.term||!item.reading||item.term.length>80||item.reading.length>120||/[\r\n\t\0]/.test(item.term+item.reading)){stats.skipped++;continue;}
  try{item.reading=normalizeReading(item.reading);}catch{stats.skipped++;continue;}
  const id=key(item);
  if(existing.has(id)){stats.duplicates++;seen.add(id);continue;}
  if(automatic&&seen.has(id)){stats.previouslyImported++;continue;}
  if(terms.length>=100){stats.overflow++;continue;}
  terms.push(item);existing.add(id);seen.add(id);stats.added++;
 }
 if(seen.size>100000)throw new Error('Windows辞書の取り込み記録が上限を超えています。');
 return {data:{...data,settings:{...data.settings,terms},imeSeen:[...seen]},stats};
}
function importMessage(s){return `Windows辞書: ${s.added}件追加、${s.duplicates}件重複`+(s.previouslyImported?`、取り込み済み${s.previouslyImported}件`:'')+(s.skipped?`、形式・文字数の対象外${s.skipped}件`:'')+(s.overflow?`。上限100件のため${s.overflow}件は未取り込みです。`:'。');}
module.exports={readImeDictionary,mergeIme,importMessage};
