const normalizeReading=value=>value.normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
function exportDictionary(terms){
 if(!Array.isArray(terms))throw new Error('辞書の形式が不正です。');
 const rows=[];
 for(const [i,row] of terms.entries()){
  if(!row||typeof row.term!=='string'||typeof row.reading!=='string')throw new Error('辞書の形式が不正です。');
  const term=row.term.trim(),reading=normalizeReading(row.reading.trim());
  if(!term&&!reading)continue;
  if(!term||!reading||/[\t\r\n\0]/.test(term+reading))throw new Error(`${i+1}行目の表記と読みを確認してください。空欄・改行・タブは書き出せません。`);
  rows.push(`${reading}\t${term}\t名詞`);
 }
 if(!rows.length)throw new Error('書き出す用語がありません。');
 const text='!Microsoft IME Dictionary Tool\r\n!Format:WORDLIST\r\n'+rows.join('\r\n')+'\r\n';
 return {count:rows.length,buffer:Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')])};
}
module.exports={exportDictionary};
