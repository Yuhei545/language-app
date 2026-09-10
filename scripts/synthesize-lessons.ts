/**
 * 同梱レッスンの音声を Gemini TTS で事前に合成し、mp3 として public/lessons に置く。
 *
 *   npm run lessons:audio -- --lang en            英語の全レッスン(足りないクリップだけ)
 *   npm run lessons:audio -- --lang en --lesson 03-hotel
 *   npm run lessons:audio -- --lang en --dry-run  件数と推定リクエスト数だけ
 *   npm run lessons:audio -- --lang en --model gemini-2.5-flash-preview-tts  使用モデルを 1 つに固定
 *   npm run lessons:audio -- --lang en --batch 20  1 回にまとめる文の数(1〜30、既定: 6)
 *   npm run lessons:audio -- --lang en --batch 1 --interval 1000  リクエストの間隔(ミリ秒、既定 6500)
 *   npm run lessons:check                          進み具合
 *   npm run lessons:audio -- --lang en --prune    文面を直した後に、使われないクリップを消す
 *   npm run lessons:audio -- --preview-voices     ナレーター候補の声を 1 文ずつ作って聴き比べる
 *
 * .env の GEMINI_API_KEY を使う(アプリには渡らない)。全モデルが 1 日あたりの上限に当たったら
 * マニフェストを書いて止まる。翌日そのまま再実行すれば続きから作る。
 */
import { Mp3Encoder } from '@breezystack/lamejs'
import { GoogleGenAI } from '@google/genai'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clipHash,
  collectClips,
  emptyManifest,
  validateAudioManifest,
  type AudioManifest,
  type Clip,
  type ClipVoice,
} from '../src/content/lessonAudio'
import { loadLessons } from '../src/content/lessons'
import type { BundledLesson } from '../src/content/lessonSchema'
import { toGeminiError } from '../src/services/gemini/errors'
import { LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY } from '../src/services/gemini/httpOptions'
import {
  synthesizeBatch,
  synthesizeSpeech,
  TTS_MODEL_FALLBACKS,
  type SynthesizedAudio,
  type TtsLang,
} from '../src/services/gemini/tts'
import {
  DEFAULT_GEMINI_VOICE,
  DEFAULT_GEMINI_VOICE_B,
  DEFAULT_GEMINI_VOICE_JA,
  NARRATOR_VOICE_CANDIDATES,
} from '../src/services/gemini/voices'
import { trimSilence } from '../src/services/speech/wav'

type Lang = 'en' | 'ko'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_LESSONS = join(ROOT, 'public', 'lessons')

/** 1 回の呼び出しでまとめて作る文の数。多いほど回数を節約できるが、切り分けに失敗しやすい。 */
const BATCH_SIZE = 6
/** 呼び出しの間隔。API の 1 分あたりの上限(10 RPM 前後)を超えないように。 */
const MIN_INTERVAL_MS = 6_500
/** 分あたりの上限で返ってきた待ち時間がこれ未満なら待って再試行する。 */
const MAX_WAIT_SEC = 120
const MAX_QUOTA_RETRIES = 3
const MP3_KBPS = 48
const TRIM_PADDING_SEC = 0.12
/** 日本語はまとめ合成の文中の句読点で割れやすいので、境目とみなす無音を長めにする。 */
const SPLIT_OPTIONS_BY_LANG: Record<TtsLang, { minGapSec: number }> = {
  en: { minGapSec: 0.45 },
  ko: { minGapSec: 0.45 },
  ja: { minGapSec: 0.6 },
}
/** 切り分けた 1 文の長さが「単位あたり」この範囲を外れたら、切り分けを信用せず 1 文ずつ作り直す。 */
const PLAUSIBLE_SEC_PER_UNIT: Record<TtsLang, { min: number; max: number }> = {
  en: { min: 0.12, max: 1.3 },   // 1 語あたり
  ko: { min: 0.05, max: 0.7 },   // 1 文字あたり
  ja: { min: 0.05, max: 0.7 },   // 1 文字あたり
}
const PREVIEW_SENTENCES: Record<TtsLang, string> = {
  ja: '「コーヒーをもらえますか」と言ってみましょう。',
  en: 'Could I get a coffee, please?',
  ko: '커피 한 잔 주세요.',
}

type Args = {
  lang: Lang | null
  lesson: string | null
  dryRun: boolean
  status: boolean
  prune: boolean
  previewVoices: boolean
  narrator: string | null
  limit: number | null
  model: string | null
  batchSize: number
  intervalMs: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    lang: null,
    lesson: null,
    dryRun: false,
    status: false,
    prune: false,
    previewVoices: false,
    narrator: null,
    limit: null,
    model: null,
    batchSize: BATCH_SIZE,
    intervalMs: MIN_INTERVAL_MS,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new Error(`${arg} には値が要ります`)
      }
      index += 1
      return value
    }
    switch (arg) {
      case '--lang': {
        const value = next()
        if (value !== 'en' && value !== 'ko') {
          throw new Error(`--lang は en か ko です: ${value}`)
        }
        args.lang = value
        break
      }
      case '--lesson': args.lesson = next(); break
      case '--dry-run': args.dryRun = true; break
      case '--status': args.status = true; break
      case '--prune': args.prune = true; break
      case '--preview-voices': args.previewVoices = true; break
      case '--narrator': args.narrator = next(); break
      case '--limit': args.limit = Number(next()); break
      case '--model': args.model = next(); break
      case '--interval': {
        const value = next()
        const intervalMs = Number(value)
        if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 60_000) {
          throw new Error(`--interval は 0 以上 60000 以下の整数で指定してください: ${value}`)
        }
        args.intervalMs = intervalMs
        break
      }
      case '--batch': {
        const value = next()
        const batchSize = Number(value)
        if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 30) {
          throw new Error(`--batch は 1 以上 30 以下の整数で指定してください: ${value}`)
        }
        args.batchSize = batchSize
        break
      }
      default:
        throw new Error(`知らない引数です: ${arg}`)
    }
  }
  return args
}

function manifestPath(lang: Lang): string {
  return join(ROOT, 'src', 'content', lang, 'lessons', 'audio-manifest.json')
}

function clipPath(lang: Lang, lessonId: string, hash: string): string {
  return join(PUBLIC_LESSONS, lang, lessonId, `${hash}.mp3`)
}

function readManifest(lang: Lang, voices: Record<ClipVoice, string>): AudioManifest {
  const path = manifestPath(lang)
  if (!existsSync(path)) {
    return emptyManifest(lang, voices)
  }
  return validateAudioManifest(JSON.parse(readFileSync(path, 'utf8')), path)
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)))
}

/** キーをそろえて書く(差分が安定する)。 */
function writeManifest(lang: Lang, manifest: AudioManifest): void {
  const normalized: AudioManifest = {
    ...manifest,
    models: [...new Set(manifest.models)],
    lessons: sortedRecord(Object.fromEntries(
      Object.entries(manifest.lessons).map(([lessonId, lesson]) => [lessonId, { ...lesson, clips: sortedRecord(lesson.clips) }]),
    )),
  }
  mkdirSync(dirname(manifestPath(lang)), { recursive: true })
  writeFileSync(manifestPath(lang), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
}

function loadApiKey(): string {
  const envPath = join(ROOT, '.env')
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) {
    throw new Error('.env に GEMINI_API_KEY を入れてください(スクリプトだけが使います)')
  }
  return key
}

function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: LONG_GENERATION_TIMEOUT_MS, retryOptions: TRANSIENT_RETRY },
  })
}

/** キーが混ざっていても出さないように伏せる。 */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/key=[^&\s"']+/gi, 'key=***').replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function unitCount(text: string, lang: TtsLang): number {
  const trimmed = text.trim()
  if (lang === 'en') {
    return Math.max(1, trimmed.split(/\s+/).filter((word) => word.length > 0).length)
  }
  return Math.max(1, Array.from(trimmed.replace(/\s+/g, '')).length)
}

function plausible(audio: SynthesizedAudio, text: string, lang: TtsLang): boolean {
  const seconds = audio.samples.length / audio.sampleRate
  const perUnit = seconds / unitCount(text, lang)
  const range = PLAUSIBLE_SEC_PER_UNIT[lang]
  return perUnit >= range.min && perUnit <= range.max
}

function toMp3(audio: SynthesizedAudio): Uint8Array {
  const samples = trimSilence(audio.samples, audio.sampleRate, { paddingSec: TRIM_PADDING_SEC })
  const source = samples.length > 0 ? samples : audio.samples
  const pcm = new Int16Array(source.length)
  for (let index = 0; index < source.length; index += 1) {
    const value = Math.max(-1, Math.min(1, source[index]))
    pcm[index] = Math.round(value < 0 ? value * 0x8000 : value * 0x7fff)
  }
  const encoder = new Mp3Encoder(1, audio.sampleRate, MP3_KBPS)
  const chunks: Uint8Array[] = []
  for (let index = 0; index < pcm.length; index += 1152) {
    const chunk = encoder.encodeBuffer(pcm.subarray(index, index + 1152))
    if (chunk.length > 0) {
      chunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    }
  }
  const tail = encoder.flush()
  if (tail.length > 0) {
    chunks.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.byteLength))
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function durationMs(audio: SynthesizedAudio): number {
  const samples = trimSilence(audio.samples, audio.sampleRate, { paddingSec: TRIM_PADDING_SEC })
  const source = samples.length > 0 ? samples : audio.samples
  return Math.round((source.length / audio.sampleRate) * 1000)
}

type Pending = { lesson: BundledLesson; clip: Clip; hash: string }
type FailedClip = { lang: TtsLang; voice: ClipVoice; text: string; message: string }

type QuotaStop = { kind: 'quota-day'; message: string }
type ModelSwitch = { kind: 'model' }

class SynthesisStop extends Error {
  constructor(readonly remaining: number, message: string) {
    super(message)
    this.name = 'SynthesisStop'
  }
}

class ExitWithCode extends Error {
  constructor(readonly code: number) {
    super()
    this.name = 'ExitWithCode'
  }
}

function parseRetryDelaySec(error: unknown): number | null {
  const raw = error instanceof Error && error.cause ? String((error.cause as { message?: unknown }).message ?? error.cause) : ''
  const source = `${raw} ${error instanceof Error ? error.message : ''}`
  const match = /retryDelay"?[":\s]+"?(\d+(?:\.\d+)?)s/i.exec(source) ?? /(\d+(?:\.\d+)?) 秒ほど待つ/.exec(source)
  return match ? Number(match[1]) : null
}

function isModelUnavailable(error: unknown): boolean {
  const message = safeMessage(error instanceof Error && error.cause instanceof Error ? error.cause : error)
  return /not found|NOT_FOUND|is not supported|not supported for|does not exist|404/i.test(message)
}

class Synthesizer {
  private lastRequestAt = 0
  private modelIndex = 0
  private readonly models: readonly string[]
  requests = 0

  constructor(
    private readonly client: GoogleGenAI,
    readonly manifest: AudioManifest,
    private readonly limit: number | null,
    models: readonly string[],
    private readonly minIntervalMs: number = MIN_INTERVAL_MS,
  ) {
    const known = manifest.models.find((model) => models.includes(model))
    if (known) {
      // 前回使ったモデルを優先する(レッスン間で声の音色が変わらないように)
      this.models = [known, ...models.filter((model) => model !== known)]
    } else {
      this.models = models
    }
  }

  get model(): string {
    return this.models[this.modelIndex]
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now()
    if (wait > 0) {
      await sleep(wait)
    }
    if (this.limit !== null && this.requests >= this.limit) {
      throw new SynthesisStop(-1, `--limit ${this.limit} 回に達したので止めます`)
    }
    this.lastRequestAt = Date.now()
    this.requests += 1
  }

  /** 1 回の呼び出し。分あたりの上限は待って再試行、日あたりの上限とモデル不在は代替へ。 */
  private async call<T>(run: (model: string) => Promise<T>): Promise<T | ModelSwitch | QuotaStop> {
    for (let attempt = 0; attempt <= MAX_QUOTA_RETRIES; attempt += 1) {
      await this.throttle()
      try {
        const result = await run(this.model)
        if (!this.manifest.models.includes(this.model)) {
          this.manifest.models.push(this.model)
        }
        return result
      } catch (rawError) {
        const error = toGeminiError(rawError)
        if (error.kind === 'quota') {
          const retrySec = parseRetryDelaySec(error)
          if (retrySec !== null && retrySec < MAX_WAIT_SEC && attempt < MAX_QUOTA_RETRIES) {
            console.log(`  1 分あたりの上限。${Math.ceil(retrySec)} 秒待ちます(${attempt + 1}/${MAX_QUOTA_RETRIES})`)
            await sleep(retrySec * 1000 + 1000)
            continue
          }
          if (this.modelIndex + 1 < this.models.length) {
            console.warn(`  ${this.model} は 1 日の上限です。${this.models[this.modelIndex + 1]} に切り替えます`)
            this.modelIndex += 1
            return { kind: 'model' }
          }
          return { kind: 'quota-day', message: safeMessage(error) }
        }
        if (isModelUnavailable(error) && this.modelIndex + 1 < this.models.length) {
          console.warn(`  モデル ${this.model} が使えません(${safeMessage(error)})。${this.models[this.modelIndex + 1]} に切り替えます`)
          this.modelIndex += 1
          return { kind: 'model' }
        }
        if (attempt === 0 && error.kind === 'network') {
          console.warn(`  通信の失敗。もう一度だけ試します: ${safeMessage(error)}`)
          continue
        }
        throw new Error(safeMessage(error))
      }
    }
    return { kind: 'quota-day', message: '再試行の回数を超えました' }
  }

  async batch(texts: string[], lang: TtsLang, voiceName: string): Promise<SynthesizedAudio[] | null | QuotaStop> {
    for (;;) {
      const result = await this.call((model) => synthesizeBatch(
        { texts, lang, voiceName, model },
        { client: this.client, splitOptions: SPLIT_OPTIONS_BY_LANG[lang] },
      ))
      if (result && typeof result === 'object' && 'kind' in result) {
        if (result.kind === 'model') {
          continue
        }
        return result
      }
      return result
    }
  }

  async single(text: string, lang: TtsLang, voiceName: string): Promise<SynthesizedAudio | QuotaStop> {
    for (;;) {
      const result = await this.call((model) => synthesizeSpeech({ text, lang, voiceName, model }, { client: this.client }))
      if ('kind' in result) {
        if (result.kind === 'model') {
          continue
        }
        return result
      }
      return result
    }
  }
}

function voicesFor(lang: Lang, narrator: string | null, existing: AudioManifest | null): Record<ClipVoice, string> {
  const defaults: Record<ClipVoice, string> = {
    A: DEFAULT_GEMINI_VOICE[lang],
    B: DEFAULT_GEMINI_VOICE_B[lang],
    narrator: narrator ?? DEFAULT_GEMINI_VOICE_JA,
  }
  if (!existing) {
    return defaults
  }
  const hasClips = Object.values(existing.lessons).some((lesson) => Object.keys(lesson.clips).length > 0)
  if (hasClips && narrator && narrator !== existing.voices.narrator) {
    throw new Error(`既に ${existing.voices.narrator} の声で作ったクリップがあります。ナレーターを変えるなら --prune の前に手で public/lessons/${lang} と manifest を消してください`)
  }
  return hasClips ? existing.voices : { ...defaults, ...(narrator ? {} : { narrator: existing.voices.narrator }) }
}

function collectPending(
  lang: Lang,
  lessons: BundledLesson[],
  manifest: AudioManifest,
  options: { write: boolean },
): { pending: Pending[]; total: number; copied: number } {
  const pending: Pending[] = []
  let total = 0
  let copied = 0
  for (const lesson of lessons) {
    const entry = manifest.lessons[lesson.id] ?? { complete: false, clips: {} }
    if (options.write) {
      manifest.lessons[lesson.id] = entry
    }
    for (const clip of collectClips(lesson, lang)) {
      total += 1
      const hash = clipHash(clip)
      const path = clipPath(lang, lesson.id, hash)
      if (existsSync(path) && entry.clips[hash]) {
        continue
      }
      // 別のレッスンに同じクリップがあれば、API を呼ばずにコピーする
      const elsewhere = Object.entries(manifest.lessons).find(([otherId, other]) => (
        otherId !== lesson.id && other.clips[hash] && existsSync(clipPath(lang, otherId, hash))
      ))
      if (elsewhere) {
        // dry-run と status は件数確認だけなので、ファイルとマニフェストを変更しない
        if (options.write) {
          mkdirSync(dirname(path), { recursive: true })
          copyFileSync(clipPath(lang, elsewhere[0], hash), path)
          entry.clips[hash] = { ms: elsewhere[1].clips[hash].ms }
        }
        copied += 1
        continue
      }
      pending.push({ lesson, clip, hash })
    }
  }
  return { pending, total, copied }
}

function refreshComplete(lang: Lang, lessons: BundledLesson[], manifest: AudioManifest): void {
  for (const lesson of lessons) {
    const entry = manifest.lessons[lesson.id]
    if (!entry) {
      continue
    }
    entry.complete = collectClips(lesson, lang).every((clip) => {
      const hash = clipHash(clip)
      return Boolean(entry.clips[hash]) && existsSync(clipPath(lang, lesson.id, hash))
    })
  }
}

function saveClip(lang: Lang, item: Pending, audio: SynthesizedAudio, manifest: AudioManifest): void {
  const path = clipPath(lang, item.lesson.id, item.hash)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, toMp3(audio))
  manifest.lessons[item.lesson.id].clips[item.hash] = { ms: durationMs(audio) }
}

function printStatus(lang: Lang): void {
  const lessons = loadLessons(lang)
  const manifest = readManifest(lang, voicesFor(lang, null, null))
  console.log(`[${lang}] 声: A=${manifest.voices.A} B=${manifest.voices.B} ナレーター=${manifest.voices.narrator} / モデル: ${manifest.models.join(', ') || '(未合成)'}`)
  for (const lesson of lessons) {
    const clips = collectClips(lesson, lang)
    const entry = manifest.lessons[lesson.id]
    const done = clips.filter((clip) => entry?.clips[clipHash(clip)] && existsSync(clipPath(lang, lesson.id, clipHash(clip)))).length
    console.log(`  ${lesson.id.padEnd(16)} ${String(done).padStart(3)}/${String(clips.length).padStart(3)} ${entry?.complete ? '完了' : ''}`)
  }
}

function prune(lang: Lang): void {
  const lessons = loadLessons(lang)
  const manifest = readManifest(lang, voicesFor(lang, null, null))
  let removed = 0
  for (const lesson of lessons) {
    const valid = new Set(collectClips(lesson, lang).map(clipHash))
    const entry = manifest.lessons[lesson.id]
    if (entry) {
      for (const hash of Object.keys(entry.clips)) {
        if (!valid.has(hash)) {
          delete entry.clips[hash]
          removed += 1
        }
      }
    }
    const dir = join(PUBLIC_LESSONS, lang, lesson.id)
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        const hash = file.replace(/\.mp3$/, '')
        if (!valid.has(hash)) {
          rmSync(join(dir, file))
          removed += 1
        }
      }
    }
  }
  for (const lessonId of Object.keys(manifest.lessons)) {
    if (!lessons.some((lesson) => lesson.id === lessonId)) {
      delete manifest.lessons[lessonId]
      const dir = join(PUBLIC_LESSONS, lang, lessonId)
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true })
      }
      removed += 1
    }
  }
  refreshComplete(lang, lessons, manifest)
  writeManifest(lang, manifest)
  console.log(`[${lang}] 使われないクリップを ${removed} 件消しました`)
}

async function previewVoices(narrator: string | null, models: readonly string[]): Promise<void> {
  const client = createClient(loadApiKey())
  const synthesizer = new Synthesizer(client, emptyManifest('en', { A: '', B: '', narrator: '' }), null, models)
  const outDir = join(tmpdir(), 'lla-voice-preview')
  mkdirSync(outDir, { recursive: true })
  const samples: Array<{ voice: string; lang: TtsLang }> = [
    ...(narrator ? [narrator] : [...NARRATOR_VOICE_CANDIDATES]).map((voice) => ({ voice, lang: 'ja' as const })),
    { voice: DEFAULT_GEMINI_VOICE.en, lang: 'en' },
    { voice: DEFAULT_GEMINI_VOICE_B.en, lang: 'en' },
    { voice: DEFAULT_GEMINI_VOICE.ko, lang: 'ko' },
    { voice: DEFAULT_GEMINI_VOICE_B.ko, lang: 'ko' },
  ]
  for (const sample of samples) {
    const result = await synthesizer.single(PREVIEW_SENTENCES[sample.lang], sample.lang, sample.voice)
    if ('kind' in result) {
      console.error(`1 日の上限に達しました: ${result.message}`)
      process.exitCode = 2
      return
    }
    const path = join(outDir, `${sample.lang}-${sample.voice}.mp3`)
    writeFileSync(path, toMp3(result))
    console.log(`${sample.lang} ${sample.voice.padEnd(14)} → ${path}`)
  }
  console.log('聴き比べて、ナレーターは --narrator <名前> で指定してください(既定: Zephyr)')
}

async function synthesize(args: Args): Promise<void> {
  const lang = args.lang
  if (!lang) {
    throw new Error('--lang en か --lang ko を指定してください')
  }
  const allLessons = loadLessons(lang)
  const lessons = args.lesson ? allLessons.filter((lesson) => lesson.id === args.lesson) : allLessons
  if (lessons.length === 0) {
    throw new Error(`レッスンが見つかりません: ${args.lesson ?? '(なし)'}`)
  }
  const existing = existsSync(manifestPath(lang)) ? readManifest(lang, voicesFor(lang, args.narrator, null)) : null
  const voices = voicesFor(lang, args.narrator, existing)
  const manifest = existing ?? emptyManifest(lang, voices)
  manifest.voices = voices

  const { pending, total, copied } = collectPending(lang, lessons, manifest, { write: !args.dryRun && !args.status })
  // 1 本ずつ完成させるため、レッスンの順を優先し、その中で声ごとにまとめる
  const groups = new Map<string, Map<string, Pending[]>>()
  for (const item of pending) {
    const lessonGroups = groups.get(item.lesson.id) ?? new Map<string, Pending[]>()
    const key = `${item.clip.lang}|${item.clip.voice}`
    lessonGroups.set(key, [...(lessonGroups.get(key) ?? []), item])
    groups.set(item.lesson.id, lessonGroups)
  }
  const requests = [...groups.values()].reduce((sum, lessonGroups) => (
    sum + [...lessonGroups.values()].reduce((lessonSum, items) => lessonSum + Math.ceil(items.length / args.batchSize), 0)
  ), 0)
  const completed = total - pending.length - copied
  const progress = args.dryRun
    ? `済み ${completed}、コピーできる ${copied} 件(実行時にコピー)`
    : `済み ${completed + copied}(コピー ${copied})`
  console.log(`[${lang}] クリップ ${total} 件。${progress}、残り ${pending.length}。推定リクエスト ${requests} 回(${args.batchSize} 文ずつ)`)
  console.log(`  声: A=${voices.A} B=${voices.B} ナレーター=${voices.narrator}`)
  if (args.dryRun) {
    return
  }
  refreshComplete(lang, lessons, manifest)
  writeManifest(lang, manifest)
  if (pending.length === 0) {
    console.log('  すべてそろっています')
    return
  }

  const models = args.model ? [args.model] : TTS_MODEL_FALLBACKS
  const synthesizer = new Synthesizer(createClient(loadApiKey()), manifest, args.limit, models, args.intervalMs)
  let done = 0
  let consecutiveFailures = 0
  const failedClips: FailedClip[] = []
  const printFailedClips = () => {
    if (failedClips.length === 0) {
      return
    }
    console.error(`作れなかったクリップ: ${failedClips.length} 件`)
    for (const failed of failedClips) {
      console.error(`  ${failed.lang}/${failed.voice} ${JSON.stringify(failed.text)}: ${failed.message}`)
    }
  }
  const stop = (message: string): never => {
    refreshComplete(lang, lessons, manifest)
    writeManifest(lang, manifest)
    console.error(`\n${message}(残り ${pending.length - done} クリップ)`)
    printFailedClips()
    throw new ExitWithCode(2)
  }
  const recordFailure = (item: Pending, error: unknown) => {
    failedClips.push({
      lang: item.clip.lang,
      voice: item.clip.voice,
      text: item.clip.text,
      message: safeMessage(error),
    })
    consecutiveFailures += 1
    if (consecutiveFailures >= 10) {
      stop('クリップの合成が 10 件連続で失敗したため停止します')
    }
  }

  try {
    for (const lessonGroups of groups.values()) {
      for (const [key, items] of lessonGroups) {
        const [clipLang, voice] = key.split('|') as [TtsLang, ClipVoice]
        const voiceName = voices[voice]
        for (let start = 0; start < items.length; start += args.batchSize) {
          const batch = items.slice(start, start + args.batchSize)
          const texts = batch.map((item) => item.clip.text)
          let audios: SynthesizedAudio[] | null = null
          if (batch.length > 1) {
            try {
              const result = await synthesizer.batch(texts, clipLang, voiceName)
              if (result && 'kind' in result) {
                stop(`1 日の上限に達しました。明日そのまま再実行すれば続きから作れます: ${result.message}`)
              }
              audios = result as SynthesizedAudio[] | null
              if (audios && !audios.every((audio, index) => plausible(audio, texts[index], clipLang))) {
                console.warn('  切り分けた長さが不自然なので、1 文ずつ作り直します')
                audios = null
              }
            } catch (error) {
              if (error instanceof SynthesisStop) {
                throw error
              }
              console.warn(`  まとめた音声の合成に失敗したので、1 文ずつ作り直します: ${safeMessage(error)}`)
            }
          }
          if (!audios) {
            for (const item of batch) {
              let result: SynthesizedAudio | QuotaStop
              try {
                result = await synthesizer.single(item.clip.text, clipLang, voiceName)
              } catch (error) {
                if (error instanceof SynthesisStop) {
                  throw error
                }
                recordFailure(item, error)
                continue
              }
              if ('kind' in result) {
                stop(`1 日の上限に達しました。明日そのまま再実行すれば続きから作れます: ${result.message}`)
              }
              saveClip(lang, item, result as SynthesizedAudio, manifest)
              done += 1
              consecutiveFailures = 0
            }
          } else {
            consecutiveFailures = 0
            batch.forEach((item, index) => {
              saveClip(lang, item, audios[index], manifest)
              done += 1
            })
          }
          refreshComplete(lang, lessons, manifest)
          writeManifest(lang, manifest)
          console.log(`  ${done}/${pending.length} ${clipLang}/${voice} ${batch[0].lesson.id} …(${synthesizer.requests} 回目)`)
        }
      }
    }
  } catch (error) {
    if (error instanceof SynthesisStop) {
      stop(error.message)
    }
    refreshComplete(lang, lessons, manifest)
    writeManifest(lang, manifest)
    throw error
  }
  refreshComplete(lang, lessons, manifest)
  writeManifest(lang, manifest)
  printFailedClips()
  console.log(`[${lang}] 完了。リクエスト ${synthesizer.requests} 回`)
  printStatus(lang)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.previewVoices) {
    await previewVoices(args.narrator, args.model ? [args.model] : TTS_MODEL_FALLBACKS)
    return
  }
  if (args.status) {
    for (const lang of args.lang ? [args.lang] : (['en', 'ko'] as const)) {
      printStatus(lang)
    }
    return
  }
  if (args.prune) {
    if (!args.lang) {
      throw new Error('--prune には --lang が要ります')
    }
    prune(args.lang)
    return
  }
  await synthesize(args)
}

main().catch((error: unknown) => {
  if (error instanceof ExitWithCode) {
    process.exitCode = error.code
    return
  }
  console.error(safeMessage(error))
  process.exitCode = 1
})
