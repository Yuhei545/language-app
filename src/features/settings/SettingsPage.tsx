import { useEffect, useState, type ChangeEvent } from 'react'
import {
  getSettings,
  setSettings,
  subscribe,
  type Interest,
  type Settings,
  type SttEngine,
} from '../../services/settings'

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

function VoiceSelect({
  label,
  voices,
  value,
  onChange,
}: {
  label: string
  voices: SpeechSynthesisVoice[]
  value: string | null
  onChange: (voiceUri: string | null) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      {voices.length > 0 ? (
        <select
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800"
        >
          <option value="">端末の既定音声</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name}（{voice.lang}）
            </option>
          ))}
        </select>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">音声が見つかりません</p>
      )}
    </label>
  )
}

export function SettingsPage() {
  const [settingsState, setSettingsState] = useState<Settings>(getSettings)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

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
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                モデル
                {settingsState.geminiModel.trim() === '' ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">未設定</span>
                ) : null}
              </span>
              <input
                type="text"
                value={settingsState.geminiModel}
                onChange={(event) => update({ geminiModel: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-3"
                placeholder="例: gemini-2.5-flash"
              />
            </label>
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
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-base font-bold text-slate-800">読み上げ</legend>
          <div className="space-y-5">
            <VoiceSelect
              label="英語の音声"
              voices={englishVoices}
              value={settingsState.ttsVoice.en}
              onChange={(voiceUri) => update({ ttsVoice: { ...settingsState.ttsVoice, en: voiceUri } })}
            />
            <VoiceSelect
              label="韓国語の音声"
              voices={koreanVoices}
              value={settingsState.ttsVoice.ko}
              onChange={(voiceUri) => update({ ttsVoice: { ...settingsState.ttsVoice, ko: voiceUri } })}
            />
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
