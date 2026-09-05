import { useId, useState } from 'react'
import { speak, unlockAudio } from '../../services/speech'

/** 試聴用の短い文。設定画面で声の違いが分かる長さにする。 */
const PREVIEW_SAMPLES: Record<'en' | 'ko' | 'ja', string> = {
  en: 'Hi! Could I get a coffee, please?',
  ko: '안녕하세요. 커피 한 잔 주세요.',
  ja: 'こんにちは。今日のレッスンを始めましょう。',
}

export function VoiceSelect({
  label,
  lang,
  voices,
  value,
  onChange,
  rate = 0.9,
  previewPitch,
}: {
  label: string
  lang: 'en' | 'ko' | 'ja'
  voices: SpeechSynthesisVoice[]
  value: string | null
  onChange: (voiceUri: string | null) => void
  /** 試聴の速度。設定の読み上げ速度を渡す。 */
  rate?: number
  /** 相手役(B)が未選択のとき、実際に使われる低めの声で試聴するために渡す。 */
  previewPitch?: number
}) {
  const selectId = useId()
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const preview = async () => {
    setPreviewError(null)
    setPreviewing(true)
    try {
      unlockAudio()
      await speak(PREVIEW_SAMPLES[lang], {
        lang,
        voiceURI: value,
        rate,
        pitch: previewPitch,
      })
    } catch (error) {
      console.error('声の試聴に失敗しました', error)
      setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="block">
      <label htmlFor={selectId} className="mb-2 block text-sm font-bold text-slate-700">{label}</label>
      {voices.length > 0 ? (
        <div className="flex items-stretch gap-2">
          <select
            id={selectId}
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value || null)}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800"
          >
            <option value="">端末の既定音声</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}（{voice.lang}）
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void preview()}
            disabled={previewing}
            aria-label={`${label}を試聴する`}
            className="shrink-0 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm font-bold text-teal-800 disabled:opacity-50"
          >
            {previewing ? '再生中…' : '🔊 試聴'}
          </button>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">音声が見つかりません</p>
      )}
      {previewError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">{previewError}</p>
      ) : null}
    </div>
  )
}
