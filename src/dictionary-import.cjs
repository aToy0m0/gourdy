const MAX_DICTIONARY_BYTES=4*1024*1024;
function parseDictionary(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>MAX_DICTIONARY_BYTES)throw new Error('辞書ファイルは4MB以内にしてください。');
 let encoding='utf-8';
 if(buffer[0]===0xff&&buffer[1]===0xfe)encoding='utf-16le';
 else if(buffer[0]===0xfe&&buffer[1]===0xff)encoding='utf-16be';
 let text;
 try{text=new TextDecoder(encoding,{fatal:true}).decode(buffer);}catch{throw new Error('文字コードを読み取れません。UTF-8、またはBOM付きUTF-16で保存してください。');}
 const entries=[];
 for(const [index,line] of text.split(/\r\n|\n|\r/).entries()){
  if(!line.trim()||/^[!#]/.test(line))continue;
  const columns=line.split('\t'),reading=columns[0]?.trim(),term=columns[1]?.trim();
  if(columns.length<2||columns.length>4||!reading||!term||reading.length>120||term.length>80||/[\u0000-\u001f\u007f-\u009f]/u.test(reading+term))throw new Error(`${index+1}行目を取り込めません。「読み、表記、品詞（任意）」をタブで区切ってください。読みは120文字、表記は80文字までです。辞書は変更していません。`);
  entries.push({reading,term});
 }
 if(!entries.length)throw new Error('ファイルに取り込める用語がありません。');
 return entries;
}
module.exports={parseDictionary,MAX_DICTIONARY_BYTES};
