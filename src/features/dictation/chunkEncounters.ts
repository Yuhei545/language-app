import type { DictationSentence } from '../../content/dictationSchema'
import type { EncounterEntry } from '../chunks/ledger'
import { chunksIn, matchChunk, type Chunk } from '../chunks/registry'
import type { Cloze } from './cloze'

/** 文ごとに、含まれるチャンク。狙いを含む文を先に出すのと、台帳の記録に使う。 */
export function indexSentenceChunks(
  sentences: DictationSentence[],
  registry: Chunk[],
  lang: 'en' | 'ko',
): Map<string, Chunk[]> {
  const index = new Map<string, Chunk[]>()
  for (const sentence of sentences) {
    const found = chunksIn(sentence.text, registry, lang)
    if (found.length > 0) {
      index.set(sentence.id, found)
    }
  }
  return index
}

/** 狙いのチャンクを含む文の id。 */
export function sentencesWithTargets(
  index: Map<string, Chunk[]>,
  targets: Chunk[],
): Set<string> {
  const targetKeys = new Set(targets.map((chunk) => chunk.key))
  const ids = new Set<string>()
  index.forEach((chunks, sentenceId) => {
    if (chunks.some((chunk) => targetKeys.has(chunk.key))) {
      ids.add(sentenceId)
    }
  })
  return ids
}

/**
 * 書けたかどうか。
 * - 全文: 書いた文にチャンクの固定部分があれば said
 * - 穴埋め: 空欄が固定部分にかかっていなければ試していないので seen。かかっていて、埋めた文にあれば said
 */
export function dictationEncounterKind(params: {
  chunk: Chunk
  lang: 'en' | 'ko'
  cloze: Cloze | null
  /** 全文なら打った文、穴埋めなら空欄を埋めた文。 */
  written: string
}): EncounterEntry['kind'] {
  if (params.cloze) {
    const visible = params.cloze.segments.join(' ')
    if (matchChunk(visible, params.chunk, params.lang)) {
      return 'seen'
    }
  }
  return matchChunk(params.written, params.chunk, params.lang) ? 'said' : 'seen'
}

/** この文の台帳の行。 */
export function dictationEncounters(params: {
  sentence: DictationSentence
  chunks: Chunk[]
  lang: 'en' | 'ko'
  cloze: Cloze | null
  written: string
}): EncounterEntry[] {
  return params.chunks.map((chunk) => ({
    chunkKey: chunk.key,
    mode: 'dictation',
    kind: dictationEncounterKind({ chunk, lang: params.lang, cloze: params.cloze, written: params.written }),
    context: params.sentence.id,
  }))
}
