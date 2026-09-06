import { useRef, useState } from 'react'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { useChatGptPrompt } from './useChatGptPrompt'

export function TalkPage() {
  const { language } = useLanguage()
  const state = useChatGptPrompt(language)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const [checked, setChecked] = useState<string[]>([])
  const [recordedNow, setRecordedNow] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(state.prompt)
      setCopied('done')
    } catch (error) {
      console.error('プロンプトをコピーできませんでした', error)
      setCopied('failed')
      textareaRef.current?.select()
    }
  }

  const toggle = (key: string) => {
    setRecordedNow(false)
    setChecked((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  const record = async () => {
    const ok = await state.recordUsed(checked)
    if (ok) {
      setChecked([])
      setRecordedNow(true)
    }
  }

  return (
    <section>
      <Toast error={state.error} onClose={state.clearError} />

      <p className="text-sm font-bold text-teal-700">LANGUAGE PARENT</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">ChatGPT で会話する</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        今週の語・知っている語・自分の語・今日の狙いを入れたプロンプトを作ります。ChatGPT に貼れば、訂正しない「言語の親」として会話してくれます。
      </p>

      <ol className="mt-5 space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
        <li>1. 下の「プロンプトをコピー」を押す</li>
        <li>2. ChatGPT を開き、新しいチャットに貼って送る</li>
        <li>3. 返事は、声に出して音読してから打つ。分からなければ「?」だけを送る</li>
        <li>4. 終わったら「まとめ」と送り、使えた表現を下で記録する</li>
      </ol>

      <label className="mt-6 block">
        <span className="mb-2 block text-sm font-bold text-slate-700">今日の場面(任意)</span>
        <input
          type="text"
          value={state.sceneJa}
          onChange={(event) => state.setSceneJa(event.target.value)}
          placeholder="例: カフェで注文する、推しの新曲について話す"
          className="w-full rounded-xl border border-slate-300 px-3 py-3"
        />
      </label>

      {state.loading ? (
        <p className="mt-6 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          語彙を集めています…
        </p>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            aria-label="ChatGPT に貼るプロンプト"
            readOnly
            value={state.prompt}
            rows={14}
            className="mt-6 w-full resize-y rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-xs leading-5 text-slate-800"
          />
          <button
            type="button"
            onClick={() => void copyPrompt()}
            disabled={state.prompt.length === 0}
            className="mt-4 w-full rounded-2xl bg-teal-700 px-5 py-4 font-bold text-white disabled:opacity-45"
          >
            プロンプトをコピー
          </button>
          {copied === 'done' ? (
            <p className="mt-2 text-center text-sm font-bold text-teal-700" role="status">コピーしました</p>
          ) : null}
          {copied === 'failed' ? (
            <p className="mt-2 text-center text-sm font-bold text-amber-800" role="alert">
              コピーできませんでした。上の文を全選択してコピーしてください
            </p>
          ) : null}
          <a
            href="https://chatgpt.com/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 block w-full rounded-2xl border border-teal-200 bg-white px-5 py-3 text-center font-bold text-teal-800"
          >
            ChatGPT を開く
          </a>

          {state.targets.length > 0 ? (
            <section className="mt-6 rounded-2xl border border-teal-200 bg-white p-4 shadow-sm" aria-labelledby="used-heading">
              <h2 id="used-heading" className="text-sm font-bold text-slate-900">使えた表現を記録</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                会話が終わったら、今日の狙いのうち実際に使えたものにチェックして記録します。ChatGPT の「使えた:」のまとめを見ながらどうぞ。
              </p>
              <ul className="mt-3 space-y-2">
                {state.targets.map((chunk) => {
                  const done = state.recordedKeys.includes(chunk.key)
                  return (
                    <li key={chunk.key}>
                      <label className={`flex items-center gap-3 rounded-xl px-3 py-2 ${done ? 'bg-teal-50' : 'bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          checked={done || checked.includes(chunk.key)}
                          disabled={done || state.recording}
                          onChange={() => toggle(chunk.key)}
                          className="size-5 accent-teal-700"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-slate-900">{chunk.display}</span>
                          {chunk.hintJa ? <span className="block text-xs text-slate-500">{chunk.hintJa}</span> : null}
                        </span>
                        {done ? <span className="text-xs font-bold text-teal-700">記録済み</span> : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => void record()}
                disabled={state.recording}
                className="mt-4 w-full rounded-2xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-45"
              >
                {state.recording ? '記録しています…' : '記録する'}
              </button>
              {recordedNow ? (
                <p className="mt-2 text-center text-sm font-bold text-teal-700" role="status">記録しました</p>
              ) : null}
            </section>
          ) : null}

          <button
            type="button"
            onClick={state.reload}
            className="mt-3 w-full text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
          >
            語彙を読み直す
          </button>
        </>
      )}
    </section>
  )
}
