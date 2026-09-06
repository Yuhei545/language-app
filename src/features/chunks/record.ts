import { insertChunkEncounters } from '../../services/supabase/db'
import type { Language } from '../../services/supabase/types'
import type { EncounterEntry } from './ledger'

export const LEDGER_MIGRATION_HINT =
  '表現の記録を保存できません。Supabase の SQL Editor で supabase/migrations/006_chunks.sql を実行してください。'
  + '練習はこのまま続けられます'

/** 006 未適用のときに出るエラーか。 */
export function isLedgerMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /chunk_encounters|daily_targets|chunk_encounter_summary|chunk_key|schema cache/i.test(message)
}

export function ledgerError(error: unknown): Error {
  if (isLedgerMissing(error)) {
    return new Error(LEDGER_MIGRATION_HINT)
  }
  return error instanceof Error ? error : new Error(String(error))
}

/** 出会いをまとめて記録する。空なら何もしない。失敗は投げる(呼び出し側が 1 回だけ知らせる)。 */
export async function recordEncounters(
  userId: string,
  lang: Language,
  entries: EncounterEntry[],
): Promise<void> {
  if (entries.length === 0) {
    return
  }
  await insertChunkEncounters(entries.map((entry) => ({
    user_id: userId,
    lang,
    chunk_key: entry.chunkKey,
    mode: entry.mode,
    kind: entry.kind,
    context: entry.context ?? '',
  })))
}

/**
 * 記録の失敗を知らせる。練習は止めず、同じセッションでは 1 回だけ表示する。
 * console には毎回出す(握りつぶさない)。
 */
export function reportLedgerFailure(
  error: unknown,
  warned: { current: boolean },
  onError: (error: Error) => void,
): void {
  console.error('表現の記録に失敗しました', error)
  if (warned.current) {
    return
  }
  warned.current = true
  onError(ledgerError(error))
}
