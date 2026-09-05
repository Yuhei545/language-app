import type { LessonAction } from './plan'

/** 読み上げ時間の目安(1 文字あたりのミリ秒)。再出題を「何秒後」に差し込むかの計算に使う。 */
export const MS_PER_CHAR: Record<'en' | 'ko' | 'ja', number> = {
  en: 70,
  ko: 190,
  ja: 150,
}

/** 読み上げ 1 回あたりの立ち上がりの目安。 */
export const SPEAK_OVERHEAD_MS = 350

export function estimateActionMs(action: LessonAction): number {
  if (action.type === 'speak') {
    const rate = action.rate ?? 1
    return SPEAK_OVERHEAD_MS + (action.text.length * MS_PER_CHAR[action.lang]) / rate
  }
  return action.ms
}

export function estimateActionsMs(actions: LessonAction[]): number {
  return actions.reduce((total, action) => total + estimateActionMs(action), 0)
}
