import type { HttpRetryOptions } from '@google/genai'

/**
 * Gemini 呼び出しの共通の期限と再試行。設定や localStorage に依らないので、
 * Node のスクリプト(音声の事前合成)からもそのまま使える。
 */

// 通信が止まったまま画面を待機させないためのSDK全体の上限。
// 注意: SDK はこの値を X-Server-Timeout ヘッダー(秒)としても送るため、サーバー側がこの時間で
// 生成を打ち切り 504 DEADLINE_EXCEEDED を返す。短い応答(文字起こし・会話の返事)向けの値。
export const GEMINI_TIMEOUT_MS = 30_000
// 会話レッスンの生成のように出力が長い呼び出しは、リクエスト単位でこちらを使う。
export const LONG_GENERATION_TIMEOUT_MS = 120_000

/**
 * 一時的なサーバー障害(500/502/503 = 混雑)だけ、短い待ちで再試行する。
 * SDK の既定(5 回、504 も対象)は、期限切れ 504 をそのまま繰り返して数分固まるので使わない。
 * 429(無料枠)は数秒待っても回復しないので再試行せず、すぐに知らせる。
 */
export const TRANSIENT_RETRY: HttpRetryOptions = {
  attempts: 3,
  initialDelay: 1,
  maxDelay: 8,
  httpStatusCodes: [500, 502, 503],
}
