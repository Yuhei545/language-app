import { useId, useState } from 'react'
import { GEMINI_VOICES } from '../../services/gemini/voices'
import { previewGeminiVoice } from '../../services/speech'

const PREVIEW_SAMPLES: Record<'en' | 'ko', string> = {
  en: 'Hi! Could I get a coffee, please?',
  ko: '안녕하세요. 커피 한 잔 주세요.',
}

export function GeminiVoiceSelect({
  label,
  lang,
  value,
  onChange,
}: {
  label: string
  lang: 'en' | 'ko'
  value: string
  onChange: (voiceName: string) => void
}) {
  const selectId = useId()
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const preview = async () => {
    setPreviewError(null)
    setPreviewing(true)
    try {
      await previewGeminiVoice(PREVIEW_SAMPLES[lang], lang, value)
    } catch (error) {
      console.error('Gemini の声の試聴に失敗しました', error)
      setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="block">
      <label htmlFor={selectId} className="mb-2 block text-sm font-bold text-slate-700">{label}</label>
      <div className="flex items-stretch gap-2">
        <select
          id={selectId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800"
        >
          {GEMINI_VOICES.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name}（{voice.note}）
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
          {previewing ? '作成中…' : '🔊 試聴'}
        </button>
      </div>
      {previewError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">{previewError}</p>
      ) : null}
    </div>
  )
}
