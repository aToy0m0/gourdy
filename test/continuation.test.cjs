const {test}=require('node:test');const assert=require('node:assert/strict');const {continuation}=require('../src/continuation.cjs');
test('verified prefix is excluded, including repeated words',()=>{assert.equal(continuation('はいはい続き','はい',true).text,'はい続き');});
test('revision of committed prefix retains raw suffix',()=>{assert.equal(continuation('東京都へ行く','東京都',true,'東京へ行く').text,'へ行く');});
test('uncertain partial send never permits automatic continuation',()=>{assert.equal(continuation('元の続き','元の',false).safe,false);assert.equal(continuation('改訂した続き','元の',true).prior,'元の');});
test('corrected suffix and empty suffix',()=>{assert.equal(continuation('前続き','前',true,'前続き。').text,'続き。');assert.equal(continuation('前','前',true).text,'');});

test('revised boundary requires verified prior text for replacement',()=>{const r=continuation('設定は変更しない','設定で',true);assert.equal(r.replaceCount,1);assert.equal(r.text,'は変更しない');assert.equal(r.prior,'設定で');assert.equal(r.full,'設定は変更しない');});

test('manual selection is exact and rejects stale or invalid ranges',()=>{const {selectedContinuation}=require('../src/continuation.cjs');const value={text:'前半。\n選択部分。後半',safe:false};assert.equal(selectedContinuation(value,null).text,value.text);assert.equal(selectedContinuation(value,{source:value.text,start:4,end:9}).text,'選択部分。');for(const selection of [{source:'古い文章',start:0,end:1},{source:value.text,start:-1,end:2},{source:value.text,start:2,end:99}])assert.throws(()=>selectedContinuation(value,selection));});
