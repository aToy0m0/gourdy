const test=require('node:test'),assert=require('node:assert/strict');
const {parseDictionary,MAX_DICTIONARY_BYTES}=require('../src/dictionary-import.cjs');
const {exportDictionary}=require('../src/dictionary-export.cjs');
const {mergeIme}=require('../src/ime-dictionary.cjs');
test('書き出したIME辞書を読みと表記を入れ替えず再取り込みする',()=>{
 const terms=[{term:'okosy',reading:'おこしー'},{term:'議事録',reading:'ぎじろく'}];
 assert.deepEqual(parseDictionary(exportDictionary(terms).buffer),terms);
});
test('UTF-8とBOM付きUTF-16、2列・品詞・コメントを読む',()=>{
 const source='!Microsoft IME Dictionary Tool\r\n# comment\n\nおこしー\tokosy\t名詞\t備考\rようご\t用語';
 const expected=[{reading:'おこしー',term:'okosy'},{reading:'ようご',term:'用語'}];
 for(const buffer of [Buffer.from(source),Buffer.from('\ufeff'+source),Buffer.from('\ufeff'+source,'utf16le'),Buffer.from('\ufeff'+source,'utf16le').swap16()])assert.deepEqual(parseDictionary(buffer),expected);
});
test('途中の不正行、壊れた文字コード、空ファイル、過大なファイルは拒否する',()=>{
 assert.throws(()=>parseDictionary(Buffer.from('よみ\t表記\n形式不正')),/2行目/);
 for(const bytes of [Buffer.from([0xff,0x41]),Buffer.from([0xff,0xfe,0x01]),Buffer.from('!header\n'),Buffer.alloc(MAX_DICTIONARY_BYTES+1)])assert.throws(()=>parseDictionary(bytes));
 for(const row of ['\t空','空\t','よみ\t表\u0000記','よみ\t'+ '長'.repeat(81)])assert.throws(()=>parseDictionary(Buffer.from(row)),/1行目/);
});
test('ファイル内の重複を除き既存の用語と履歴を維持、上限を報告する',()=>{
 const data={settings:{terms:Array.from({length:99},(_,i)=>({term:`既存${i}`,reading:`よみ${i}`}))},history:[{text:'保持'}]};
 const result=mergeIme(data,parseDictionary(Buffer.from('ヨミ0\t既存0\nしんご\t新語\nシンゴ\t新語\nあふれ\t追加不可')));
 assert.equal(result.stats.added,1);assert.equal(result.stats.duplicates,2);assert.equal(result.stats.overflow,1);
 assert.equal(result.data.settings.terms.length,100);assert.deepEqual(result.data.history,data.history);assert.equal(data.settings.terms.length,99);
});
