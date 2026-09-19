"""GiNZA/Sudachi analysis. Offsets in the IPC protocol are UTF-16 code units."""
import json
import re
import sys
import unicodedata
import ginza
import spacy


def utf16(text):
    return len(text.encode('utf-16-le')) // 2


def reading(text):
    text = unicodedata.normalize('NFKC', text)
    return ''.join(chr(ord(c) - 96) if '\u30a1' <= c <= '\u30f6' else c for c in text).upper()


def distance(a, b):
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        nxt = [i]
        for j, cb in enumerate(b, 1):
            nxt.append(min(nxt[-1] + 1, row[j] + 1, row[j - 1] + (ca != cb)))
        row = nxt
    return row[-1]


def analyze(text, glossary, nlp):
    doc = nlp(text)
    offsets = [0]
    for char in text:
        offsets.append(offsets[-1] + (2 if ord(char) > 0xffff else 1))
    offset = offsets.__getitem__
    encoded = text.encode('utf-16-le')
    terms = [(term, reading(term.get('reading', ''))) for term in glossary]
    tokens = [{'text': t.text, 'start': offset(t.idx), 'end': offset(t.idx + len(t)),
               'pos': t.pos_, 'tag': t.tag_, 'lemma': t.lemma_,
               'reading': reading(t.text if re.fullmatch(r'[ぁ-ゖァ-ヶー]+', t.text) else ''.join(t.morph.get('Reading')) or t.text), 'head': t.head.i, 'dep': t.dep_}
              for t in doc]
    chunks = [{'text': s.text, 'start': offset(s.start_char), 'end': offset(s.end_char),
               'head': s.root.i} for s in ginza.bunsetu_spans(doc)]
    candidates = []

    def add(start, end, after, kind, evidence, automatic=False):
        before = text[start:end]
        if before == after:
            return
        item = {'start': offset(start), 'end': offset(end), 'before': before, 'after': after,
                'kind': kind, 'evidence': evidence, 'automatic': automatic}
        if any(c['start'] == item['start'] and c['end'] == item['end'] and c['after'] == after for c in candidates):
            return
        item['id'] = len(candidates)
        candidates.append(item)

    # Phrase boundaries and INTJ POS prevent deleting determiners such as「あの会社」.
    for span in ginza.bunsetu_spans(doc):
        body = span.text.rstrip('、,。.!！?？ \n')
        if body in {'えーと', 'ええと', 'えっと', 'えー', 'ええっと', 'あー', 'あのー', 'うーん'} and any(t.pos_ == 'INTJ' for t in span):
            add(span.start_char, span.end_char, '', 'filler', '独立した文節・感動詞・フィラー辞書の一致', True)
    # Clear polite endings and subordinate clauses provide cheap punctuation candidates.
    # Only acknowledgement interjections, never content words or quantities.
    for match in re.finditer(r'(はい|うん)(?:[、, \t　]*\1){2,}', text):
        covered = [t for t in doc if t.idx >= match.start() and t.idx < match.end()]
        prefix = text[:match.start()]
        quoted = any(prefix.rfind(a) > prefix.rfind(b) for a, b in [('「', '」'), ('『', '』'), ('“', '”')]) or prefix.count('"') % 2
        described = re.match(r'[、,。\s]*(?:と|って)', text[match.end():])
        if not quoted and not described and covered and covered[0].idx == match.start() and covered[-1].idx + len(covered[-1]) == match.end() and all(t.pos_ in {'INTJ', 'PUNCT', 'SPACE'} for t in covered):
            add(match.start(), match.end(), match.group(1), 'repetition',
                '引用外で相づちの感動詞が3回以上連続。1回を残す整文。', True)
    for i, token in enumerate(doc):
        end = token.idx + len(token)
        following = doc[i + 1] if i + 1 < len(doc) else None
        adjacent = text[end:end + 1]
        if adjacent and (adjacent.isspace() or adjacent in '、。，．,.！？!?」』）)'):
            continue
        prefix = text[:end]
        if re.search(r'(?:ます|ました|ません|でした|です|ください)$', prefix) and token.pos_ in {'AUX', 'VERB'}:
            if following is None or following.pos_ not in {'AUX', 'ADP', 'SCONJ', 'PART', 'PUNCT'}:
                add(token.idx, end, token.text + '。', 'punctuation', '丁寧形の終止と次の語の品詞', True)
        elif prefix.endswith('ので') and (token.pos_ == 'SCONJ' or i > 0 and doc[i - 1].pos_ == 'SCONJ' and token.text == 'で') and following is not None and end - token.sent.start_char >= 6:
            add(token.idx, end, token.text + '、', 'punctuation', '理由を示す従属節の区切り', True)
    # A repair cue between two nominal spans provides explicit evidence of revision.
    nominal = {'NOUN', 'PROPN', 'NUM', 'ADV'}
    for i, token in enumerate(doc):
        if token.text != 'いや' or i < 2 or doc[i - 1].text not in {'、', ','}:
            continue
        left = i - 2
        if doc[left].pos_ not in nominal:
            continue
        while left > token.sent.start and doc[left - 1].pos_ in nominal and i - left < 7:
            left -= 1
        right = i + 1
        if right < len(doc) and doc[right].text in {'、', ','}:
            right += 1
        end = right
        while end < token.sent.end and doc[end].pos_ in nominal and end - right < 6:
            end += 1
        if end > right:
            add(doc[left].idx, doc[end - 1].idx + len(doc[end - 1]), doc[right:end].text,
                'self_repair', '読点＋「いや」の両側に名詞句・数量句がある。発話上の訂正候補。', False)
    # Only noun-bearing token windows become phonetic dictionary candidates.
    def dictionary_token(token):
        # GiNZA can tag a noun followed by する as VERB (称号します, 操作する).
        return token.pos_ in {'NOUN', 'PROPN', 'X', 'SYM'} or token.tag_.startswith('名詞-')
    for i, token in enumerate(doc):
        if token.pos_ in {'PUNCT', 'SPACE'}:
            continue
        for length in range(1, min(5, len(doc) - i) + 1):
            span = doc[i:i + length]
            if any(t.pos_ in {'PUNCT', 'SPACE'} for t in span):
                break
            surface = span.text
            kana = ''.join(tokens[t.i]['reading'] for t in span)
            for term, expected in terms:
                target = term['term']
                contexts = term.get('contexts', [])
                context_ok = not contexts or any(c in token.sent.text for c in contexts)
                if not context_ok or surface == target:
                    continue
                alias = surface in term.get('aliases', []) or bool(re.fullmatch(r'[ぁ-ゖァ-ヶー]+', surface)) and reading(surface) == expected
                limit = min(1, len(expected) // 4)
                close = (len(expected) >= 2 and kana == expected) or (len(expected) >= 4 and all(dictionary_token(t) for t in span) and abs(len(kana) - len(expected)) <= limit and distance(kana, expected) <= limit)
                if alias or close:
                    add(span.start_char, span.end_char, target, 'dictionary',
                        {'reading': kana, 'expected': expected, 'exactAlias': alias,
                         'contexts': contexts, 'pos': [t.pos_ for t in span]},
                        False)
    # Homophones are alternatives, not several forced replacements of one span.
    for candidate in candidates:
        if candidate['kind'] == 'dictionary' and any(
            other['kind'] == 'dictionary' and other['start'] < candidate['end']
            and candidate['start'] < other['end'] and other['after'] != candidate['after']
            for other in candidates
        ):
            candidate['automatic'] = False
    protected = []
    for t in doc:
        kinds = []
        if t.like_num or re.search(r'\d', t.text): kinds.append('数字')
        if t.pos_ == 'PROPN': kinds.append('固有名詞')
        if t.lemma_ in {'ない', 'ぬ', 'ず', '無い', '否定'} or t.text in {'ません', '禁止', '不可'}: kinds.append('否定')
        if kinds: protected.append({'start': offset(t.idx), 'end': offset(t.idx + len(t)), 'text': t.text, 'kinds': kinds})
    # Preserve global positions; cap each request by sentence or bunsetsu boundaries.
    segments = []
    for sent in doc.sents:
        start = sent.start_char
        for chunk in ginza.bunsetu_spans(sent):
            if chunk.end_char - start > 240 and chunk.start_char > start:
                segments.append({'start': offset(start), 'end': offset(chunk.start_char), 'text': text[start:chunk.start_char]})
                start = chunk.start_char
        segments.append({'start': offset(start), 'end': offset(sent.end_char), 'text': text[start:sent.end_char]})
    grouped = []
    for segment in segments:
        if grouped and segment['end'] - grouped[-1]['start'] <= 240:
            previous = grouped[-1]
            # Join original text including whitespace between sentences.
            previous['end'] = segment['end']
            previous['text'] = encoded[previous['start'] * 2:previous['end'] * 2].decode('utf-16-le')
        else:
            grouped.append(dict(segment))
    return {'readingSource': 'text-derived', 'reading': ''.join(t['reading'] for t in tokens), 'tokens': tokens, 'bunsetsu': chunks, 'candidates': candidates, 'protected': protected, 'segments': grouped}


def main():
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    request = json.load(sys.stdin)
    text = request['text']
    if not isinstance(text, str) or not 1 <= len(text) <= 12000:
        raise ValueError('解析対象は1〜12000文字にしてください。')
    nlp = spacy.load(request.get('modelPath') or 'ja_ginza', exclude=['ner'])
    json.dump(analyze(text, request.get('glossary', []), nlp), sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
