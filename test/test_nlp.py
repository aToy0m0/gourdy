import sys
from pathlib import Path
import unittest
import spacy
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from nlp import analyze, distance


class NLPTests(unittest.TestCase):
    def test_short_exact_homophones(self):
        glossary = [{'term': '操作', 'reading': 'そうさ', 'aliases': [], 'contexts': ['取り消し'], 'auto': False}]
        yes = analyze('捜査の取り消しを確認します。', glossary, self.nlp)
        self.assertTrue(any(c['after'] == '操作' for c in yes['candidates']))
        self.assertFalse(any(c['kind'] == 'dictionary' for c in analyze('警察の捜査です。', glossary, self.nlp)['candidates']))
        glossary = [{'term': '照合', 'reading': 'しょうごう', 'aliases': [], 'contexts': [], 'auto': False}]
        self.assertTrue(any(c['after'] == '照合' for c in analyze('数字を称号します。', glossary, self.nlp)['candidates']))

    def test_acknowledgement_repetition(self):
        for text in ['はいはいはい確認します。', '残してくださいはいはいはいその進め方で問題ありません。']:
            candidates = [c for c in analyze(text, [], self.nlp)['candidates'] if c['kind'] == 'repetition']
            self.assertEqual(len(candidates), 1, text)
            self.assertEqual(candidates[0]['after'], 'はい')
            self.assertTrue(candidates[0]['automatic'])
        for text in ['はいはい、確認します。', 'はい。はい。はい。', 'はい\nはい\nはい', '「はいはいはい」と言いました。', 'はいはいはいと繰り返します。', '一人一人一人を確認します。', '15万円15万円15万円です。', 'しないしないしない。']:
            self.assertFalse(any(c['kind'] == 'repetition' for c in analyze(text, [], self.nlp)['candidates']), text)

    def test_punctuation_candidates(self):
        result = analyze('今日は雨なので外出しません明日は晴れるので買い物に行きます', [], self.nlp)
        punctuation = [c for c in result['candidates'] if c['kind'] == 'punctuation']
        self.assertTrue(any(c['after'].endswith('、') for c in punctuation))
        self.assertEqual(sum(c['after'].endswith('。') for c in punctuation), 2)
        for text in ['確認しますか？', 'そうですけど', '確認します。', '3.14', 'Claude']:
            self.assertFalse([c for c in analyze(text, [], self.nlp)['candidates'] if c['kind'] == 'punctuation'], text)

    @classmethod
    def setUpClass(cls):
        cls.nlp = spacy.load('ja_ginza')

    def test_filler_and_determiner(self):
        result = analyze('えーと、あの会社に確認します。', [], self.nlp)
        self.assertTrue(any(c['kind'] == 'filler' for c in result['candidates']))
        self.assertFalse(any('あの' in c['before'] for c in result['candidates']))

    def test_dictionary_context_and_reading(self):
        glossary = [{'term': 'Claude', 'reading': 'クロード', 'aliases': ['クロード'], 'contexts': ['入力'], 'auto': True}]
        yes = analyze('クロードに入力します。', glossary, self.nlp)
        no = analyze('クロードさんと会います。', glossary, self.nlp)
        self.assertTrue(any(c['after'] == 'Claude' for c in yes['candidates']))
        self.assertEqual(no['candidates'], [])

    def test_dictionary_size_and_homophones(self):
        text = 'クロードに入力します。15万円は支払いません。'
        glossary = [{'term': 'Claude', 'reading': 'クロード', 'aliases': ['クロード'], 'contexts': [], 'auto': True}]
        unrelated = [{'term': f'Product{i}', 'reading': f'ムカンケイセイヒン{i}', 'aliases': [], 'contexts': [], 'auto': True} for i in range(99)]
        def dictionary(rows):
            return [c for c in analyze(text, rows, self.nlp)['candidates'] if c['kind'] == 'dictionary']
        self.assertEqual(dictionary([]), [])
        self.assertEqual(dictionary(glossary), dictionary(glossary + unrelated))
        ambiguous = dictionary(glossary + [{**glossary[0], 'term': 'Claud'}])
        self.assertEqual(len(ambiguous), 2)
        self.assertTrue(all(not c['automatic'] for c in ambiguous))

    def test_protect_negation_and_numbers(self):
        result = analyze('15万円は支払いません。変更しないでください。', [], self.nlp)
        kinds = {kind for token in result['protected'] for kind in token['kinds']}
        self.assertIn('数字', kinds)
        self.assertIn('否定', kinds)

    def test_offsets_survive_emoji(self):
        text = '😀えーと、確認します。'
        result = analyze(text, [], self.nlp)
        for token in result['tokens']:
            reconstructed = text.encode('utf-16-le')[token['start'] * 2:token['end'] * 2].decode('utf-16-le')
            self.assertEqual(reconstructed, token['text'])

    def test_bunsetsu_and_dependencies(self):
        result = analyze('私は文章の誤りを確認します。', [], self.nlp)
        self.assertGreater(len(result['bunsetsu']), 2)
        self.assertTrue(any(t['dep'] == 'obj' for t in result['tokens']))
        self.assertEqual(distance('クロード', 'クロート'), 1)

    def test_explicit_repair_candidates(self):
        result = analyze('金額は15万円、いや50万円です。', [], self.nlp)
        repairs = [c for c in result['candidates'] if c['kind'] == 'self_repair']
        self.assertEqual(len(repairs), 1)
        self.assertEqual(repairs[0]['after'], '50万円')
        self.assertFalse(repairs[0]['automatic'])


if __name__ == '__main__':
    unittest.main()
