import {
  KNOWN_RATIO_THRESHOLD,
  validateDialogue,
  type DialogueIssue,
  type LessonDialogue,
} from '../../features/lesson/lessonDialogueSchema'
import type { Interest } from '../settings'
import { getGeminiClient, getModelId, LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY } from './client'
import { GeminiError, toGeminiError } from './errors'
import type { Lang } from './persona'
import { buildDialoguePrompt, type DialogueLevel } from './prompts'
import { dialogueSchema } from './schemas'

export type GenerateDialogueParams = {
  lang: Lang
  sceneJa: string
  interests: Interest[]
  knownWords: string[]
  level: DialogueLevel
}

export type GeneratedDialogue = {
  dialogue: LessonDialogue
  ratio: number
  attempts: number
}

const MAX_ATTEMPTS = 2
/** 2 回目も比率だけが不足のとき、ここまでの不足なら採用する。 */
const RATIO_TOLERANCE = 0.1

async function requestDialogue(
  params: GenerateDialogueParams,
  retryIssues: DialogueIssue[] | undefined,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const response = await getGeminiClient().models.generateContent({
    model: getModelId(),
    contents: [{
      role: 'user',
      parts: [{ text: buildDialoguePrompt({ ...params, retryIssues }) }],
    }],
    config: {
      temperature: 0.8,
      responseMimeType: 'application/json',
      responseSchema: dialogueSchema,
      abortSignal: signal,
      // 行ごとの核・解説・応用を含む長い JSON なので、全体の 30 秒では 504(サーバー側の期限切れ)になる。
      // 混雑(503)は少し待てば通ることが多いので、生成では待ちを長めにして 4 回まで試す。
      httpOptions: {
        timeout: LONG_GENERATION_TIMEOUT_MS,
        retryOptions: { ...TRANSIENT_RETRY, attempts: 4, initialDelay: 2, maxDelay: 15 },
      },
    },
  })

  const text = response.text?.trim()
  if (!text) {
    throw new GeminiError('会話を生成できませんでした(応答が空でした)', response.text, 'parse')
  }

  try {
    return JSON.parse(text) as unknown
  } catch (parseError) {
    throw new GeminiError('会話の応答を JSON として読めませんでした', parseError, 'parse')
  }
}

/**
 * 場面と既知語に合わせた会話を生成し、機械検査に通ったものだけ返す。
 * 不合格なら理由を添えて 1 回だけ再生成する。2 回目も比率だけがわずかに不足なら採用し、
 * それ以外は理由を列挙して失敗させる(黙って通さない)。
 */
export async function generateDialogue(
  params: GenerateDialogueParams,
  opts?: { signal?: AbortSignal },
): Promise<GeneratedDialogue> {
  let previousIssues: DialogueIssue[] | undefined

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const json = await requestDialogue(params, previousIssues, opts?.signal)
      const result = validateDialogue(json, { lang: params.lang, knownWords: params.knownWords })

      if (result.ok) {
        return { dialogue: result.dialogue, ratio: result.ratio, attempts: attempt }
      }

      const onlyRatio = result.issues.every((issue) => issue.code === 'ratio')
      const shortfall = KNOWN_RATIO_THRESHOLD[params.lang] - result.ratio
      if (attempt === MAX_ATTEMPTS && onlyRatio && shortfall < RATIO_TOLERANCE) {
        console.warn('会話の既知語比率がわずかに不足していますが採用します', { ratio: result.ratio })
        return { dialogue: result.dialogue ?? (json as LessonDialogue), ratio: result.ratio, attempts: attempt }
      }

      console.warn(`会話の検査に不合格(試行 ${attempt}/${MAX_ATTEMPTS})`, result.issues)
      previousIssues = result.issues
    }
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }
    throw toGeminiError(error)
  }

  const reasons = (previousIssues ?? []).map((issue) => `・${issue.message}`).join('\n')
  throw new GeminiError(
    `この場面では条件に合う会話を作れませんでした。別の場面を選んでみてください。\n${reasons}`,
    previousIssues,
    'parse',
  )
}
