import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  createConversation,
  endConversation,
  getLanguageProgress,
  getVocabProgress,
  listVocabItems,
} from '../../services/supabase/db'
import type { VocabItemRow, VocabProgressRow } from '../../services/supabase/types'
import { ledgerError, recordEncounters } from '../chunks/record'
import type { Chunk } from '../chunks/registry'
import { loadChunkContext, localDay } from '../chunks/targetsStore'
import { buildChatGptPrompt } from './chatgptPrompt'

type Vocabulary = {
  weekWords: string[]
  knownWords: string[]
  targetWords: string[]
}

const KNOWN_WORD_LIMIT = 150
const TARGET_WORD_LIMIT = 10

function unique(words: string[]): string[] {
  return [...new Set(words.map((word) => word.trim()).filter((word) => word.length > 0))]
}

/** 会話モードと同じ基準で語を集める(今週の語 + 核の語、知っている語、使わせたい語)。 */
export function collectVocabulary(
  lang: 'en' | 'ko',
  vocabItems: VocabItemRow[],
  progress: VocabProgressRow[],
  week: number,
): Vocabulary {
  const progressById = new Map(progress.map((row) => [row.vocab_item_id, row]))
  const core = loadCore(lang)
  const coreWords = [...core.verbs, ...core.nouns, ...core.adjectives, ...core.phrasal].map((word) => word.text)

  const weekWords = unique([
    ...vocabItems.filter((item) => item.week === week).map((item) => item.text),
    ...coreWords,
  ])
  const knownWords = unique(
    vocabItems
      .filter((item) => progressById.get(item.id)?.status === 'known')
      .map((item) => item.text),
  ).slice(0, KNOWN_WORD_LIMIT)
  const targetWords = unique(
    vocabItems
      .filter((item) => {
        const row = progressById.get(item.id)
        return row !== undefined && (row.hint_used_count > 0 || row.status === 'learning')
      })
      .map((item) => item.text),
  ).slice(0, TARGET_WORD_LIMIT)

  return { weekWords, knownWords, targetWords }
}

/** その日に記録した狙い(端末の控え。二重記録を防ぐ)。 */
export function recordedStorageKey(lang: 'en' | 'ko', day: string): string {
  return `lla.chatgpt.recorded.${lang}.${day}`
}

function conversationStorageKey(lang: 'en' | 'ko', day: string): string {
  return `lla.chatgpt.conversation.${lang}.${day}`
}

function readRecorded(lang: 'en' | 'ko', day: string): string[] {
  try {
    const raw = localStorage.getItem(recordedStorageKey(lang, day))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string') ? parsed : []
  } catch (error) {
    console.warn('記録済みの狙いを読めませんでした', error)
    return []
  }
}

function writeRecorded(lang: 'en' | 'ko', day: string, keys: string[]): void {
  try {
    localStorage.setItem(recordedStorageKey(lang, day), JSON.stringify(keys))
  } catch (error) {
    console.warn('記録済みの狙いを書けませんでした', error)
  }
}

export function useChatGptPrompt(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null)
  const [targets, setTargets] = useState<Chunk[]>([])
  const [recordedKeys, setRecordedKeys] = useState<string[]>([])
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [sceneJa, setSceneJa] = useState('')
  const reloadRef = useRef(0)
  const [reloadCount, setReloadCount] = useState(0)
  const userIdRef = useRef<string | null>(null)
  const ledgerWarnedRef = useRef(false)

  useEffect(() => subscribe(setSettingsState), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    userIdRef.current = null

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const userId = authSession.user.id
        const [vocabItems, languageProgress] = await Promise.all([
          listVocabItems(userId, lang),
          getLanguageProgress(userId, lang),
        ])
        const [progress, chunkContext] = await Promise.all([
          getVocabProgress(userId, vocabItems.map((item) => item.id)),
          loadChunkContext({ userId, lang, vocabItems }),
        ])
        if (!active) {
          return
        }
        userIdRef.current = userId
        setVocabulary(collectVocabulary(lang, vocabItems, progress, languageProgress?.current_week ?? 1))
        setTargets(chunkContext.targets)
        setRecordedKeys(readRecorded(lang, localDay()))
        if (chunkContext.error && !ledgerWarnedRef.current) {
          ledgerWarnedRef.current = true
          setError(chunkContext.error)
        }
      } catch (loadError) {
        if (active) {
          console.error('ChatGPT 用プロンプトの語彙を読み込めませんでした', loadError)
          setError(loadError)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [lang, reloadCount])

  const reload = useCallback(() => {
    reloadRef.current += 1
    setReloadCount(reloadRef.current)
  }, [])

  /**
   * ChatGPT で使えた狙いを自己申告で台帳に書く(said)。
   * あわせて、その日の最初の記録で会話 1 回分を残し、ホームの「ChatGPT で会話」を完了にする。
   */
  const recordUsed = useCallback(async (keys: string[]): Promise<boolean> => {
    const userId = userIdRef.current
    if (!userId || recording) {
      return false
    }
    const day = localDay()
    const fresh = keys.filter((key) => !recordedKeys.includes(key))
    setRecording(true)
    setError(null)
    try {
      await recordEncounters(userId, lang, fresh.map((key) => ({
        chunkKey: key,
        mode: 'chatgpt',
        kind: 'said',
        context: day,
      })))
      if (!localStorage.getItem(conversationStorageKey(lang, day))) {
        const conversation = await createConversation(userId, lang, 'chatgpt')
        await endConversation(conversation.id, 0)
        localStorage.setItem(conversationStorageKey(lang, day), '1')
      }
      const next = unique([...recordedKeys, ...fresh])
      writeRecorded(lang, day, next)
      setRecordedKeys(next)
      return true
    } catch (recordError) {
      console.error('使えた表現を記録できませんでした', recordError)
      setError(ledgerError(recordError))
      return false
    } finally {
      setRecording(false)
    }
  }, [lang, recordedKeys, recording])

  const prompt = vocabulary
    ? buildChatGptPrompt({
      lang,
      weekWords: vocabulary.weekWords,
      knownWords: vocabulary.knownWords,
      targetWords: vocabulary.targetWords,
      targetExpressions: targets.map((chunk) => chunk.display),
      personalWords: settings.personalWords,
      interests: settings.interests,
      personaName: settings.parentName[lang],
      sceneJa: sceneJa.trim() === '' ? undefined : sceneJa,
    })
    : ''

  return {
    prompt,
    loading,
    error,
    sceneJa,
    setSceneJa,
    targets,
    recordedKeys,
    recording,
    recordUsed,
    reload,
    clearError: () => setError(null),
  }
}
