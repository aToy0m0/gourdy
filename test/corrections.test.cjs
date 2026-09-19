const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEdits, applyEdits, validateGlossary } = require('../src/corrections.cjs');

test('文脈候補にないLLM単語置換と存在しない候補を採用しない', () => {
  const text = '会社に行きます。';
  const analysis = { candidates: [], tokens: [], protected: [] };
  const result = validateEdits(text, analysis, { text, start: 0, end: text.length }, {
    selected: [99], edits: [{ before: '会社', after: '病院', kind: 'dictionary', reason: '推測' }]
  });
  assert.equal(result.edits.length, 0); assert.equal(result.rejected.length, 2);
});
test('数字を含む明示的な言い直しは自動確定しない', () => {
  const text = '金額は15万円、いや50万円です。';
  const start = text.indexOf('15');
  const before = '15万円、いや50万円';
  const analysis = { candidates: [], tokens: [{ start, end: start + before.length }], protected: [{ start, end: start + 2, kinds: ['数字'], text: '15' }] };
  const result = validateEdits(text, analysis, { text, start: 0, end: text.length }, {
    selected: [], edits: [{ before, after: '50万円', kind: 'self_repair', reason: '明示的な訂正' }]
  });
  assert.equal(result.edits.length, 1); assert.equal(result.edits[0].review, true);
  assert.equal(applyEdits(text, result.edits), '金額は50万円です。');
});
test('句読点という理由で否定を削除できない', () => {
  const text = '変更しない。';
  const result = validateEdits(text, { candidates: [], tokens: [{ start: 0, end: text.length }], protected: [] }, { text, start: 0, end: text.length }, {
    selected: [], edits: [{ before: text, after: '変更する。', kind: 'punctuation', reason: '句読点' }]
  });
  assert.equal(result.edits.length, 0);
});
test('重複した修正範囲は適用できない', () => {
  assert.throws(() => applyEdits('あいう', [{ start: 0, end: 2, before: 'あい', after: 'え' }, { start: 1, end: 3, before: 'いう', after: 'お' }]));
});
test('辞書の不正形式を明示的に拒否', () => {
  assert.throws(() => validateGlossary([{ term: 'Claude' }]));
  assert.throws(() => validateGlossary([{ term: 'Claude', reading: 'クロード', aliases: [''], contexts: [], auto: true }]));
});
test('短い同音語もLLM選択に従い、未選択なら変換しない',()=>{
 const text='道路の端を歩きます',c={id:0,kind:'dictionary',start:3,end:4,before:'端',after:'橋',automatic:false,evidence:{expected:'はし',contexts:[]}};
 const analysis={candidates:[c],tokens:[],protected:[]},segment={text,start:0,end:text.length};
 assert.equal(validateEdits(text,analysis,segment,{selected:[],edits:[]}).edits.length,0);
 assert.equal(validateEdits(text,analysis,segment,{selected:[0],edits:[]}).edits.length,1);
});
test('文法補正を装った名詞の変更を拒否', () => {
  const text = '会社に行く。';
  const result = validateEdits(text, { candidates: [], protected: [], tokens: [{ start: 0, end: 2, pos: 'NOUN' }] }, { text, start: 0, end: text.length }, {
    selected: [], edits: [{ before: '会社', after: '病院', reason: '文法を修正' }]
  });
  assert.equal(result.edits.length, 0);
});
test('言い直し後の発話にない数値は提案できない', () => {
  const text = '15万円、いや50万円';
  const result = validateEdits(text, { candidates: [], protected: [], tokens: [{ start: 0, end: text.length }] }, { text, start: 0, end: text.length }, {
    selected: [], edits: [{ before: text, after: '100万円', reason: '言い直し' }]
  });
  assert.equal(result.edits.length, 0);
});

test('相づち整理は解析候補だけを採用しLLMの自由な反復削除を拒否',()=>{
 const text='はいはいはい。15万円15万円。';const c={id:0,kind:'repetition',start:0,end:6,before:'はいはいはい',after:'はい',automatic:true};
 const analysis={candidates:[c],tokens:[],protected:[]},segment={text,start:0,end:text.length};
 const ok=validateEdits(text,analysis,segment,{selected:[0],edits:[]});assert.equal(applyEdits(text,ok.edits),'はい。15万円15万円。');
 const bad=validateEdits(text,analysis,segment,{selected:[],edits:[{kind:'repetition',before:'15万円15万円',after:'15万円',reason:'反復'}]});assert.equal(bad.edits.length,0);
});
