const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeReading}=require('../src/dictionary-reading.js');const {parseDictionary}=require('../src/dictionary-import.cjs');
test('読みは全半角カナを正規化し漢字英字を拒否する',()=>{for(const [a,b] of [['クロード','くろーど'],[' ｶﾞｯﾂﾎﾟｰｽﾞ ','がっつぽーず'],['はし','はし'],['','']])assert.equal(normalizeReading(a),b);for(const x of ['橋','Claude','くろーど/くらうど'])assert.throws(()=>normalizeReading(x),/ひらがな/);});
test('取り込みも同じ読み検査を行い行番号を通知する',()=>{assert.equal(parseDictionary(Buffer.from('クロード\tClaude'))[0].reading,'くろーど');assert.throws(()=>parseDictionary(Buffer.from('橋\t橋')),/1行目/);});
