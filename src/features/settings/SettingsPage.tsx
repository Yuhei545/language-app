import { useEffect, useState, type ChangeEvent } from 'react'
import { listAvailableModels, type AvailableModel } from '../../services/gemini/models'
import {
  getSettings,
  setSettings,
  subscribe,
  type Interest,
  type Settings,
  type SttEngine,
} from '../../services/settings'
import { MicTest } from './MicTest'
import { VoiceSelect } from './VoiceSelect'

const sttOptions: Array<{ value: SttEngine; label: string }> = [
  { value: 'auto', label: '自動' },
  { value: 'webspeech', label: 'Web Speech' },
  { value: 'gemini', label: 'Gemini' },
]

const interestOptions: Array<{ value: Interest; label: string }> = [
  { value: 'travel', label: '旅行' },
  { value: 'friends', label: '友人との会話' },
  { value: 'content', label: '動画・コンテンツ' },
]

export function SettingsPage() {
  const [settingsState, setSettingsState] = useState<Settings>(getSettings)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [models, setModels] = useState<AvailableModel[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  useEffect(() => subscribe(setSettingsState), [])

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
                {option.label}
              </label>
            ))}
          </div>
          <MicTest />
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">読み上げ</legend>
          <div className="space-y-5">
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
