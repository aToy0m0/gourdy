const KINDS = ['filler', 'dictionary', 'self_repair', 'punctuation', 'grammar'];
// Only insert Japanese punctuation at analyzed token boundaries; preserve every original character.
function punctuationInsertion(text, start, before, after, tokens) {
  const boundaries = new Set(tokens.flatMap(t => [t.start, t.end]));
  let i = 0, added = false, lastInsertion = -1;
  for (const char of after) {
    if (before.startsWith(char, i)) { i += char.length; continue; }
    const at = start + i, left = text[at - 1] || '', right = text[at] || '';
    if (!['、', '。'].includes(char) || !boundaries.has(at) || !left ||
        /[、。，．,.！？!?\s]/.test(left) || /[、。，．,.！？!?]/.test(right) ||
        /[0-9０-９]/.test(left) && /[0-9０-９]/.test(right) ||
        added && i === lastInsertion) return false;
    added = true; lastInsertion = i;
  }
  return added && i === before.length;
}
function validateGlossary(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error('用語辞書は最大100件です。');
  for (const row of value) {
    if (!row || typeof row.term !== 'string' || !row.term.trim() || row.term.length > 80 ||
        typeof row.reading !== 'string' || row.reading.length > 120 ||
        !['aliases', 'contexts'].every(key => Array.isArray(row[key]) && row[key].length <= 20 && row[key].every(s => typeof s === 'string' && s.length > 0 && s.length <= 80)) ||
        typeof row.auto !== 'boolean') throw new Error('用語辞書の形式が不正です。term・reading・aliases・contexts・autoを確認してください。');
  }
  return value;
}
function validateEdits(text, analysis, segment, response) {
  if (!response || !Array.isArray(response.selected) || !Array.isArray(response.edits)) throw new Error('LLMの応答形式が不正です。');
  const edits = [], rejected = [];
  const inSegment = item => item.start >= segment.start && item.end <= segment.end;
  const append = edit => {
    if (text.slice(edit.start, edit.end) !== edit.before || edit.start >= edit.end) throw new Error('補正位置が元の文章と一致しません。');
    if (edits.some(e => edit.start < e.end && e.start < edit.end)) { rejected.push('重複する補正候補を除外しました。'); return; }
    const sensitive = analysis.protected.filter(p => edit.start < p.end && p.start < edit.end);
    edit.review = !edit.automatic || edit.kind !== 'punctuation' && sensitive.some(p => p.kinds.some(k => k !== '固有名詞'));
    edit.warnings = sensitive.map(p => `${p.kinds.join('・')}: ${p.text}`);
    edits.push(edit);
  };
  for (const id of [...new Set(response.selected)]) {
    const candidate = analysis.candidates.find(c => c.id === id && inSegment(c));
    if (!candidate) { rejected.push(`存在しない候補ID ${String(id).slice(0, 20)} を除外しました。`); continue; }
    if(candidate.kind==='dictionary') {
      const alternatives=analysis.candidates.filter(c=>c.kind==='dictionary'&&response.selected.includes(c.id)&&c.id!==candidate.id&&c.start<candidate.end&&candidate.start<c.end);
      if(alternatives.length){rejected.push('同じ箇所に複数の辞書候補が選ばれたため原文を保持しました。');continue;}
    }
    append({ ...candidate, automatic:['dictionary','repetition'].includes(candidate.kind)?true:candidate.automatic, reason: candidate.kind === 'repetition' ? '連続する相づちを1回に整理' : candidate.kind === 'punctuation' ? '文節と品詞に基づく句読点補完' : candidate.kind === 'filler' ? '独立したフィラー' : candidate.kind === 'self_repair' ? '発話に含まれる明示的な言い直し' : '辞書と文脈に合う表記' });
  }
  for (const proposal of response.edits) {
    if (proposal && typeof proposal.before === 'string' && typeof proposal.after === 'string' && !proposal.kind) {
      const strip = s => s.replace(/[、。，．,.！？!?\s]/g, '');
      proposal.kind = strip(proposal.before) === strip(proposal.after) ? 'punctuation' :
        /(いや|じゃなく|ではなく|訂正|違[うい]|というか|じゃない)/.test(proposal.before) ? 'self_repair' : 'grammar';
    }
    if (!proposal || !KINDS.includes(proposal.kind) || typeof proposal.before !== 'string' || !proposal.before ||
        typeof proposal.after !== 'string' || proposal.after.length > 400 || typeof proposal.reason !== 'string') {
      rejected.push('形式が不正な修正を除外しました。'); continue;
    }
    const local = segment.text.indexOf(proposal.before);
    if (local < 0 || segment.text.indexOf(proposal.before, local + 1) >= 0 || proposal.before === proposal.after) {
      rejected.push('原文で位置を一意に特定できない修正を除外しました。'); continue;
    }
    if (['filler', 'dictionary'].includes(proposal.kind)) { rejected.push('辞書・フィラーの修正は解析で生成した候補に限定しています。'); continue; }
    if (proposal.kind === 'self_repair' && !/(いや|じゃなく|ではなく|訂正|違[うい]|というか|じゃない)/.test(proposal.before)) {
      rejected.push('言い直しの根拠がない削除を除外しました。'); continue;
    }
    const start = segment.start + local;
    if (proposal.kind === 'grammar') {
      const parts = analysis.tokens.filter(t => t.start >= start && t.end <= start + proposal.before.length);
      if (!parts.length || parts.some(t => t.pos !== 'ADP') || !['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'から', 'まで', 'より', 'も', 'の', 'や'].includes(proposal.after)) {
        rejected.push('助詞以外を書き換える文法補正を除外しました。'); continue;
      }
    }
    if (proposal.kind === 'self_repair') {
      const marker = proposal.before.search(/いや|じゃなく|ではなく|訂正|違[うい]|というか|じゃない/);
      if (!proposal.after || proposal.before.lastIndexOf(proposal.after) <= marker) {
        rejected.push('言い直し後の発話にない内容を除外しました。'); continue;
      }
    }
    const boundaries = new Set(analysis.tokens.flatMap(t => [t.start, t.end]));
    if (!boundaries.has(start) || !boundaries.has(start + proposal.before.length)) {
      rejected.push('単語の途中を分断する修正を除外しました。'); continue;
    }
    if (proposal.kind === 'punctuation' && !punctuationInsertion(text, start, proposal.before, proposal.after, analysis.tokens)) {
      rejected.push('原文を変更する、または単語境界以外への句読点追加を除外しました。'); continue;
    }
    append({ ...proposal, start, end: start + proposal.before.length, automatic: proposal.kind === 'punctuation' });
  }
  return { edits: edits.sort((a, b) => a.start - b.start), rejected };
}
function applyEdits(text, edits) {
  let end = 0, result = '';
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    if (edit.start < end || text.slice(edit.start, edit.end) !== edit.before) throw new Error('補正範囲が重複しているか、原文と一致しません。');
    result += text.slice(end, edit.start) + edit.after; end = edit.end;
  }
  return result + text.slice(end);
}
module.exports = { validateGlossary, validateEdits, applyEdits };
