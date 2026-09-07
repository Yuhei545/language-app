/** Gemini TTS の声。公式ドキュメントの 30 種と、その雰囲気の説明。 */
export type GeminiVoice = { name: string; note: string }

export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Zephyr', note: '明るい' },
  { name: 'Puck', note: '元気' },
  { name: 'Charon', note: '落ち着いた説明調' },
  { name: 'Kore', note: 'はっきり' },
  { name: 'Fenrir', note: '勢いがある' },
  { name: 'Leda', note: '若い' },
  { name: 'Orus', note: 'しっかり' },
  { name: 'Aoede', note: '軽やか' },
  { name: 'Callirrhoe', note: 'のんびり' },
  { name: 'Autonoe', note: '明るい' },
  { name: 'Enceladus', note: '息まじり' },
  { name: 'Iapetus', note: 'クリア' },
  { name: 'Umbriel', note: 'のんびり' },
  { name: 'Algieba', note: 'なめらか' },
  { name: 'Despina', note: 'なめらか' },
  { name: 'Erinome', note: 'クリア' },
  { name: 'Algenib', note: 'ざらつき' },
  { name: 'Rasalgethi', note: '説明調' },
  { name: 'Laomedeia', note: '元気' },
  { name: 'Achernar', note: 'やわらかい' },
  { name: 'Alnilam', note: 'しっかり' },
  { name: 'Schedar', note: '平坦' },
  { name: 'Gacrux', note: '大人びた' },
  { name: 'Pulcherrima', note: '前のめり' },
  { name: 'Achird', note: '親しみやすい' },
  { name: 'Zubenelgenubi', note: 'カジュアル' },
  { name: 'Vindemiatrix', note: 'やさしい' },
  { name: 'Sadachbia', note: '生き生き' },
  { name: 'Sadaltager', note: '博識' },
  { name: 'Sulafat', note: 'あたたかい' },
]

export const DEFAULT_GEMINI_VOICE = { en: 'Kore', ko: 'Aoede' } as const
export const DEFAULT_GEMINI_VOICE_B = { en: 'Puck', ko: 'Charon' } as const
/** 日本語のナレーター(合図・解説)の既定の声。同梱レッスンの合成でも使う。 */
export const DEFAULT_GEMINI_VOICE_JA = 'Zephyr'
/** ナレーター候補。合成の前に聴き比べる(scripts/synthesize-lessons.ts --preview-voices)。 */
export const NARRATOR_VOICE_CANDIDATES = ['Zephyr', 'Sulafat', 'Vindemiatrix'] as const
