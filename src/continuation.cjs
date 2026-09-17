// Only an exact, verified prefix can be excluded without duplicating prior input.
function continuation(raw, written, certain, corrected) {
  if (!certain) return {text:raw, safe:false, label:'入力済みの範囲を確認できません。全文をコピーして確認してください。'};
  const full=corrected?.startsWith(written)?corrected:raw;
  let common=0;while(common<written.length&&common<full.length&&written[common]===full[common])common++;
  const replaceCount=written.length-common;
  return {text:full.slice(common),safe:true,replaceCount,prior:replaceCount?written:'',full,
    label:replaceCount?`続き（入力済み末尾${replaceCount}文字の修正を含む）`:corrected&&!corrected.startsWith(written)?'未入力の続き（補正前）':'未入力の続き'};
}
module.exports={continuation};
