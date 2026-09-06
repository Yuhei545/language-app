import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import { getLanguageProgress, getVocabProgress, listVocabItems } from '../../services/supabase/db'
import type { VocabItemRow, VocabProgressRow } from '../../services/supabase/types'
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

export function useChatGptPrompt(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [sceneJa, setSceneJa] = useState('')
  const reloadRef = useRef(0)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => subscribe(setSettingsState), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

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
        const progress = await getVocabProgress(userId, vocabItems.map((item) => item.id))
        if (!active) {
          return
        }
        setVocabulary(collectVocabulary(lang, vocabItems, progress, languageProgress?.current_week ?? 1))
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

  const prompt = vocabulary
    ? buildChatGptPrompt({
      lang,
      weekWords: vocabulary.weekWords,
      knownWords: vocabulary.knownWords,
      targetWords: vocabulary.targetWords,
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
    reload,
    clearError: () => setError(null),
  }
}
