import { isWebSpeechAvailable } from '../../services/speech'
import type { PatternCheck } from '../../services/settings'

/** 実際に使う確かめ方。設定の auto はここで record か self に決める。 */
export type ResolvedCheck = 'record' | 'self'

/**
 * 設定の確かめ方を、この端末で実際に使う方式に落とす。
 * auto は、ブラウザの音声認識があれば録音、無ければ自分で判定(Gemini を使わない)。
 */
export function resolveCheck(setting: PatternCheck): ResolvedCheck {
  if (setting === 'auto') {
    return isWebSpeechAvailable() ? 'record' : 'self'
  }
  return setting
}
