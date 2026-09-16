function validateReplacements(rows) {
  if(!Array.isArray(rows)||rows.length>100||rows.some(r=>!r||typeof r.from!=='string'||typeof r.to!=='string'||r.from.length>120||r.to.length>120||/[\r\n\t\0]/.test(r.from+r.to)))throw new Error('表記置換は100件まで、置換前後は120文字以内です。');
  if(new Set(rows.filter(r=>r.from).map(r=>r.from)).size!==rows.filter(r=>r.from).length)throw new Error('同じ置換前の表記を重複登録できません。');
  return rows;
}
function replaceExact(text,rows=[]) {
  validateReplacements(rows);
  // Single pass, longest match first. Do not reprocess a replacement's output.
  const ordered=rows.filter(r=>r.from.trim()&&r.to.trim()).sort((a,b)=>b.from.length-a.from.length);let output='';
  for(let i=0;i<text.length;){const row=ordered.find(r=>text.startsWith(r.from,i));if(row){output+=row.to;i+=row.from.length;}else output+=text[i++];}
  return output;
}
module.exports={validateReplacements,replaceExact};
