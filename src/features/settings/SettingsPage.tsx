import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Toast } from '../../components/Toast'
import { listAvailableModels, type AvailableModel } from '../../services/gemini/models'
import { getGeminiUsage } from '../../services/gemini/usage'
import { translatePersonalWord } from '../../services/gemini/speaking'
import {
  getSettings,
  setSettings,
  subscribe,
  type Interest,
  type PatternCheck,
  type PersonalWord,
  type PersonalWordKind,
  type Settings,
  type SttEngine,
} from '../../services/settings'
import { isWebSpeechAvailable } from '../../services/speech'
import { audioCacheStats, clearAudioCache } from '../../services/speech/audioCache'
import { GeminiVoiceSelect } from './GeminiVoiceSelect'
import { MicTest } from './MicTest'
import { VoiceSelect } from './VoiceSelect'

const sttOptions: Array<{ value: SttEngine; label: string; note: string }> = [
  { value: 'auto', label: '自動', note: 'PC ではブラウザ、iPhone では Gemini。無料枠を使わずに済みます' },
  { value: 'webspeech', label: 'Web Speech', note: 'ブラウザの音声認識。Gemini の回数を消費しません' },
  { value: 'gemini', label: 'Gemini', note: '1 回話すごとに Gemini を 1 回使います。上限に達しやすいです' },
]

const patternCheckOptions: Array<{ value: PatternCheck; label: string; note: string }> = [
  { value: 'self', label: '自分で判定(おすすめ)', note: '答えを見て「言えた / 言えなかった」を自分で押します。Gemini を使いません。Pimsleur と同じやり方です' },
  { value: 'record', label: '録音で確かめる', note: '言った文を聞き取って模範と照らします。Web Speech が無い端末では Gemini を使います' },
  { value: 'auto', label: '自動', note: 'ブラウザの音声認識が使えれば録音、使えなければ自分で判定' },
]

const interestOptions: Array<{ value: Interest; label: string }> = [
  { value: 'travel', label: '旅行' },
  { value: 'friends', label: '友人との会話' },
  { value: 'content', label: '動画・コンテンツ' },
]

const personalWordKinds: Array<{ value: PersonalWordKind; label: string }> = [
  { value: 'place', label: '場所' },
  { value: 'person', label: '人' },
  { value: 'thing', label: 'もの' },
  { value: 'media', label: '作品・メディア' },
]

export function SettingsPage() {
  const [settingsState, setSettingsState] = useState<Settings>(getSettings)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [models, setModels] = useState<AvailableModel[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [personalWordJa, setPersonalWordJa] = useState('')
  const [personalWordKind, setPersonalWordKind] = useState<PersonalWordKind>('place')
  const [translatingPersonalWord, setTranslatingPersonalWord] = useState(false)
  const [personalWordError, setPersonalWordError] = useState<unknown>(null)
  const translationAbortRef = useRef<AbortController | null>(null)

  useEffect(() => subscribe(setSettingsState), [])

  useEffect(() => () => {
    const controller = translationAbortRef.current
    translationAbortRef.current = null
    controller?.abort()
  }, [])

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      return undefined
    }

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)

    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  const update = (partial: Partial<Settings>) => {
    setSettings(partial)
  }

  const updateInterest = (event: ChangeEvent<HTMLInputElement>, interest: Interest) => {
    const nextInterests = event.target.checked
      ? [...settingsState.interests, interest]
      : settingsState.interests.filter((item) => item !== interest)
    update({ interests: nextInterests })
  }

  const updatePersonalWord = (index: number, partial: Partial<PersonalWord>) => {
    update({
      personalWords: settingsState.personalWords.map((word, wordIndex) => (
        wordIndex === index ? { ...word, ...partial } : word
      )),
    })
  }

  const deletePersonalWord = (index: number) => {
    update({ personalWords: settingsState.personalWords.filter((_word, wordIndex) => wordIndex !== index) })
  }

  const translateAndAddPersonalWord = async () => {
    const ja = personalWordJa.trim()
    if (!ja) {
      setPersonalWordError(new Error('追加する日本語を入力してください'))
      return
    }

    const controller = new AbortController()
    translationAbortRef.current?.abort()
    translationAbortRef.current = controller
    setTranslatingPersonalWord(true)
    setPersonalWordError(null)
    try {
      const translated = await translatePersonalWord(
        { ja, kind: personalWordKind },
        { signal: controller.signal },
      )
      if (translationAbortRef.current !== controller) {
        return
      }
      update({
        personalWords: [
          ...settingsState.personalWords,
          { ja, en: translated.en, ko: translated.ko, kind: personalWordKind },
        ],
      })
      setPersonalWordJa('')
    } catch (error) {
      if (translationAbortRef.current === controller) {
        setPersonalWordError(error)
      }
    } finally {
      if (translationAbortRef.current === controller) {
        translationAbortRef.current = null
        setTranslatingPersonalWord(false)
      }
    }
  }

  const usage = getGeminiUsage()
  const [cacheStats, setCacheStats] = useState<{ count: number; bytes: number } | null>(null)
  const [cacheError, setCacheError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    audioCacheStats()
      .then((stats) => { if (active) setCacheStats(stats) })
      .catch((error) => { console.error('音声キャッシュの集計に失敗しました', error) })
    return () => { active = false }
  }, [settingsState.ttsProvider])
  const clearCache = async () => {
    setCacheError(null)
    try {
      await clearAudioCache()
      setCacheStats(await audioCacheStats())
    } catch (error) {
      console.error('音声キャッシュを消せませんでした', error)
      setCacheError(error instanceof Error ? error.message : String(error))
    }
  }
  const webSpeechAvailable = isWebSpeechAvailable()

  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  const koreanVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ko'))
  const japaneseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ja'))

  const loadModels = async () => {
    setModelsLoading(true)
    setModelsError(null)

    try {
      const availableModels = await listAvailableModels()
      if (availableModels.length === 0) {
        setModels(null)
        setModelsError('生成に使えるモデルが見つかりませんでした。モデルIDは手入力できます。')
        return
      }

      setModels(availableModels)
    } catch (error) {
      setModels(null)
      setModelsError(error instanceof Error ? error.message : String(error))
    } finally {
      setModelsLoading(false)
    }
  }

  const selectedModelDescription = models?.find(
    (model) => model.id === settingsState.geminiModel,
  )?.description

  return (
    <section>
      <Toast error={personalWordError} onClose={() => setPersonalWordError(null)} />
      <p className="text-sm font-bold text-teal-700">PREFERENCES</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">設定</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">変更内容はこの端末にすぐ保存されます。</p>

      <div className="mt-7 space-y-5">
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">Gemini</legend>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">APIキー</span>
              <input
                type="password"
                autoComplete="off"
                value={settingsState.geminiApiKey}
                onChange={(event) => update({ geminiApiKey: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-3"
              />
            </label>
            <div>
              <label htmlFor="gemini-model" className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                モデル
                {settingsState.geminiModel.trim() === '' ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">未設定</span>
                ) : null}
              </label>
              <div className="flex items-stretch gap-2">
                {models ? (
                  <select
                    id="gemini-model"
                    value={settingsState.geminiModel}
                    onChange={(event) => update({ geminiModel: event.target.value })}
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800"
                  >
                    <option value="">モデルを選択</option>
                    {settingsState.geminiModel && !models.some((model) => model.id === settingsState.geminiModel) ? (
                      <option value={settingsState.geminiModel}>{settingsState.geminiModel}（現在の設定）</option>
                    ) : null}
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="gemini-model"
                    type="text"
                    value={settingsState.geminiModel}
                    onChange={(event) => update({ geminiModel: event.target.value })}
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3"
                    placeholder="例: gemini-2.5-flash"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void loadModels()}
                  disabled={modelsLoading}
                  className="shrink-0 rounded-xl border border-teal-300 bg-teal-50 px-3 text-xs font-bold text-teal-800 disabled:opacity-50"
                >
                  {modelsLoading ? '取得中…' : 'モデル一覧を取得'}
                </button>
              </div>
              {modelsLoading ? <p className="mt-2 text-xs font-bold text-teal-700" role="status">利用できるモデルを確認しています…</p> : null}
              {modelsError ? <p className="mt-2 text-xs font-bold leading-5 text-red-700" role="alert">{modelsError}</p> : null}
              {selectedModelDescription ? <p className="mt-2 text-xs leading-5 text-slate-500">{selectedModelDescription}</p> : null}
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">自分の語</legend>
          <p className="text-xs leading-5 text-slate-500">
            よく行く場所や好きな人・作品を、瞬間組み立てのお題に使います。
          </p>

          {settingsState.personalWords.length > 0 ? (
            <div className="mt-4 space-y-3">
              {settingsState.personalWords.map((word, index) => (
                <div key={`${word.kind}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <select
                      aria-label={`${index + 1}件目の種類`}
                      value={word.kind}
                      onChange={(event) => updatePersonalWord(index, { kind: event.target.value as PersonalWordKind })}
                      className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                    >
                      {personalWordKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => deletePersonalWord(index)}
                      className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200"
                      aria-label={`${word.ja || index + 1}を削除`}
                    >
                      削除
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <input
                      type="text"
                      aria-label={`${index + 1}件目の日本語`}
                      value={word.ja}
                      onChange={(event) => updatePersonalWord(index, { ja: event.target.value })}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="日本語"
                    />
                    <input
                      type="text"
                      aria-label={`${index + 1}件目の英語`}
                      value={word.en}
                      onChange={(event) => updatePersonalWord(index, { en: event.target.value })}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="English"
                    />
                    <input
                      type="text"
                      aria-label={`${index + 1}件目の韓国語`}
                      value={word.ko}
                      onChange={(event) => updatePersonalWord(index, { ko: event.target.value })}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="한국어"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
              まだ登録されていません。最初の語を追加してみましょう。
            </p>
          )}

          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">追加する日本語</span>
              <input
                type="text"
                value={personalWordJa}
                onChange={(event) => setPersonalWordJa(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
                placeholder="例：浅草、推しの名前、好きな映画"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-bold text-slate-700">種類</span>
              <select
                value={personalWordKind}
                onChange={(event) => setPersonalWordKind(event.target.value as PersonalWordKind)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
              >
                {personalWordKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void translateAndAddPersonalWord()}
              disabled={translatingPersonalWord}
              className="mt-4 w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {translatingPersonalWord ? '翻訳しています…' : '翻訳して追加'}
            </button>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">音声入力</legend>
          <div className="grid gap-2">
            {sttOptions.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-teal-50">
                <input
                  type="radio"
                  name="sttEngine"
                  value={option.value}
                  checked={settingsState.sttEngine === option.value}
                  onChange={() => update({ sttEngine: option.value })}
                  className="size-4 accent-teal-700"
                />
                <span className="min-w-0">
                  <span className="block font-bold">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.note}</span>
                </span>
              </label>
            ))}
          </div>

          {!webSpeechAvailable ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              このブラウザではブラウザの音声認識(Web Speech)が使えないため、どれを選んでも Gemini になります。
              iPhone の Chrome は非対応です(iPhone の Safari なら使えます)。
              Gemini を使わずに練習するには、下の「型を回すの確かめ方」を「自分で判定」にしてください。
            </p>
          ) : null}

          <div className="mt-4">
            <p className="mb-2 text-sm font-bold text-slate-700">型を回すの確かめ方</p>
            <div className="grid gap-2">
              {patternCheckOptions.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-teal-50">
                  <input
                    type="radio"
                    name="patternCheck"
                    value={option.value}
                    checked={settingsState.patternCheck === option.value}
                    onChange={() => update({ patternCheck: option.value })}
                    className="size-4 accent-teal-700"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="gemini-stt-model" className="mb-2 block text-sm font-bold text-slate-700">
              文字起こしに使うモデル
            </label>
            {models ? (
              <select
                id="gemini-stt-model"
                value={settingsState.geminiSttModel}
                onChange={(event) => update({ geminiSttModel: event.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800"
              >
                <option value="">通常のモデルと同じ</option>
                {settingsState.geminiSttModel && !models.some((model) => model.id === settingsState.geminiSttModel) ? (
                  <option value={settingsState.geminiSttModel}>{settingsState.geminiSttModel}（現在の設定）</option>
                ) : null}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.displayName}</option>
                ))}
              </select>
            ) : (
              <input
                id="gemini-stt-model"
                type="text"
                value={settingsState.geminiSttModel}
                onChange={(event) => update({ geminiSttModel: event.target.value })}
                placeholder="空なら通常のモデルと同じ"
                className="w-full rounded-xl border border-slate-300 px-3 py-3"
              />
            )}
            <p className="mt-1 text-xs leading-5 text-slate-500">
              無料枠の上限はモデルごとに別です。文字起こしだけ軽いモデル(flash-lite など)にすると、上限を分散できます。
            </p>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-bold text-slate-500">Gemini の呼び出し回数</p>
            <p className="mt-1 font-bold tabular-nums text-slate-900">
              今日 {usage.today} 回 ・ 直近 1 分 {usage.lastMinute} 回
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              無料枠は 1 分あたりと 1 日あたりで別々に上限があります。音声入力を Web Speech にすると、
              練習中の呼び出しはゼロになります。
            </p>
          </div>

          <MicTest />
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">読み上げ</legend>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">声の種類</p>
              <div className="grid gap-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-teal-50">
                  <input
                    type="radio"
                    name="ttsProvider"
                    checked={settingsState.ttsProvider === 'gemini'}
                    onChange={() => update({ ttsProvider: 'gemini' })}
                    className="size-4 accent-teal-700"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">Gemini の声(自然)</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      英語・韓国語を Gemini で読み上げます。作った音声はこの端末に保存し、同じ文は 2 度と作りません。
                      上限に達したら内蔵の声に自動で戻ります。日本語のナレーターは内蔵のままです。
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-teal-50">
                  <input
                    type="radio"
                    name="ttsProvider"
                    checked={settingsState.ttsProvider === 'browser'}
                    onChange={() => update({ ttsProvider: 'browser' })}
                    className="size-4 accent-teal-700"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">内蔵の声</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">Gemini を使いません。PC の Edge なら自然な声が選べます</span>
                  </span>
                </label>
              </div>
            </div>

            {settingsState.ttsProvider === 'gemini' ? (
              <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                <GeminiVoiceSelect
                  label="英語の声"
                  lang="en"
                  value={settingsState.geminiVoice.en}
                  onChange={(name) => update({ geminiVoice: { ...settingsState.geminiVoice, en: name } })}
                />
                <GeminiVoiceSelect
                  label="英語の相手役(B)の声"
                  lang="en"
                  value={settingsState.geminiVoiceB.en}
                  onChange={(name) => update({ geminiVoiceB: { ...settingsState.geminiVoiceB, en: name } })}
                />
                <GeminiVoiceSelect
                  label="韓国語の声"
                  lang="ko"
                  value={settingsState.geminiVoice.ko}
                  onChange={(name) => update({ geminiVoice: { ...settingsState.geminiVoice, ko: name } })}
                />
                <GeminiVoiceSelect
                  label="韓国語の相手役(B)の声"
                  lang="ko"
                  value={settingsState.geminiVoiceB.ko}
                  onChange={(name) => update({ geminiVoiceB: { ...settingsState.geminiVoiceB, ko: name } })}
                />
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">音声合成のモデル</span>
                  <input
                    type="text"
                    value={settingsState.geminiTtsModel}
                    onChange={(event) => update({ geminiTtsModel: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3"
                  />
                  <span className="mt-1 block text-xs leading-5 text-slate-500">無料枠で使えるのは Flash 系の TTS です(Pro TTS は有料のみ)</span>
                </label>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-xs font-bold text-slate-500">保存済みの音声</p>
                  <p className="mt-1 font-bold tabular-nums text-slate-900">
                    {cacheStats ? `${cacheStats.count} 件 ・ ${(cacheStats.bytes / 1024 / 1024).toFixed(1)} MB` : '集計中…'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void clearCache()}
                    className="mt-2 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
                  >
                    保存した音声を消す
                  </button>
                  {cacheError ? <p role="alert" className="mt-2 text-xs text-red-700">{cacheError}</p> : null}
                </div>
              </div>
            ) : null}

            <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900">
              自然な声が見つからないときは、このアプリを Microsoft Edge で開いてみてください。Edge には「Online (Natural)」と付く
              自然な声が日本語・韓国語・英語それぞれに男女で用意されています。声は「試聴」で聞き比べられます。
            </p>
            <VoiceSelect
              label="日本語(ナレーター)の声"
              lang="ja"
              rate={1}
              voices={japaneseVoices}
              value={settingsState.ttsVoiceJa}
              onChange={(voiceUri) => update({ ttsVoiceJa: voiceUri })}
            />
            <VoiceSelect
              label="英語の音声"
              lang="en"
              rate={settingsState.ttsRate}
              voices={englishVoices}
              value={settingsState.ttsVoice.en}
              onChange={(voiceUri) => update({ ttsVoice: { ...settingsState.ttsVoice, en: voiceUri } })}
            />
            <VoiceSelect
              label="韓国語の音声"
              lang="ko"
              rate={settingsState.ttsRate}
              voices={koreanVoices}
              value={settingsState.ttsVoice.ko}
              onChange={(voiceUri) => update({ ttsVoice: { ...settingsState.ttsVoice, ko: voiceUri } })}
            />
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-800">会話の相手役(B)の声</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">音声レッスンの会話で、相手役と区別するための声です。未選択なら同じ声を少し低くして使います。</p>
              <div className="mt-4 space-y-4">
                <VoiceSelect
                  label="英語の相手役"
                  lang="en"
                  rate={settingsState.ttsRate}
                  previewPitch={settingsState.ttsVoiceB.en ? undefined : 0.9}
                  voices={englishVoices}
                  value={settingsState.ttsVoiceB.en}
                  onChange={(voiceUri) => update({ ttsVoiceB: { ...settingsState.ttsVoiceB, en: voiceUri } })}
                />
                <VoiceSelect
                  label="韓国語の相手役"
                  lang="ko"
                  rate={settingsState.ttsRate}
                  previewPitch={settingsState.ttsVoiceB.ko ? undefined : 0.9}
                  voices={koreanVoices}
                  value={settingsState.ttsVoiceB.ko}
                  onChange={(voiceUri) => update({ ttsVoiceB: { ...settingsState.ttsVoiceB, ko: voiceUri } })}
                />
              </div>
            </div>
            <label className="block">
              <span className="mb-2 flex justify-between text-sm font-bold text-slate-700">
                読み上げ速度
                <output>{settingsState.ttsRate.toFixed(1)}×</output>
              </span>
              <input
                type="range"
                min="0.7"
                max="1"
                step="0.1"
                value={settingsState.ttsRate}
                onChange={(event) => update({ ttsRate: Number(event.target.value) })}
                className="w-full accent-teal-700"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">学習目的</legend>
          <div className="grid gap-2">
            {interestOptions.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-teal-50">
                <input
                  type="checkbox"
                  checked={settingsState.interests.includes(option.value)}
                  onChange={(event) => updateInterest(event, option.value)}
                  className="size-4 rounded accent-teal-700"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">会話相手の名前</legend>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">英語の会話相手の名前</span>
              <input
                type="text"
                value={settingsState.parentName.en}
                onChange={(event) => update({ parentName: { ...settingsState.parentName, en: event.target.value } })}
                className="w-full rounded-xl border border-slate-300 px-3 py-3"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">韓国語の会話相手の名前</span>
              <input
                type="text"
                value={settingsState.parentName.ko}
                onChange={(event) => update({ parentName: { ...settingsState.parentName, ko: event.target.value } })}
                className="w-full rounded-xl border border-slate-300 px-3 py-3"
              />
            </label>
          </div>
        </fieldset>
      </div>
    </section>
  )
}
