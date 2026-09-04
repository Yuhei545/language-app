import {
  normalizeText,
  similarity,
  type SpeechLanguage,
} from '../../services/speech/normalize'

export type PronunciationScore = {
  /** 0〜1。1 が完全一致。 */
  similarity: number
  matched: boolean
  /** どちらと比べて出した数字か。 */
  target: 'text' | 'example'
}

/**
 * 発話をカードと比べる。
 *
 * 「聞く」ボタンは例文を読み上げるので、学習者が例文ごと繰り返すのは正しい行動。
 * 単語だけと比べると、聞いた通りに文で言うほど点が下がってしまう。そこで:
 * 1. 発話の中に単語がそのまま含まれていれば一致(文で言っても減点しない)
 * 2. そうでなければ、単語と例文のうち近い方で判定する
 */
export function scorePronunciation(
  spoken: string,
  card: { text: string; example: string },
  lang: SpeechLanguage,
  threshold = 0.8,
): PronunciationScore {
  const spokenNormalized = normalizeText(spoken, lang)
  const textNormalized = normalizeText(card.text, lang)

  if (spokenNormalized.length === 0) {
    return { similarity: 0, matched: false, target: 'text' }
  }

  if (textNormalized.length > 0 && spokenNormalized.includes(textNormalized)) {
    return { similarity: 1, matched: true, target: 'text' }
  }

  const againstText = similarity(spoken, card.text, lang)
  const againstExample = card.example.trim().length > 0
    ? similarity(spoken, card.example, lang)
    : -1

  const target: PronunciationScore['target'] = againstExample > againstText ? 'example' : 'text'
  const best = Math.max(againstText, againstExample)

  return { similarity: best, matched: best >= threshold, target }
}
