import { useRef, useState } from 'react'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { useChatGptPrompt } from './useChatGptPrompt'

export function TalkPage() {
  const { language } = useLanguage()
  const state = useChatGptPrompt(language)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
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

  return (
    <section>
      <Toast error={state.error} onClose={state.clearError} />

      <p className="text-sm font-bold text-teal-700">LANGUAGE PARENT</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">ChatGPT で会話する</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        今週の語・知っている語・自分の語を入れたプロンプトを作ります。ChatGPT に貼れば、訂正しない「言語の親」として会話してくれます。
      </p>

      <ol className="mt-5 space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
        <li>1. 下の「プロンプトをコピー」を押す</li>
        <li>2. ChatGPT を開き、新しいチャットに貼って送る</li>
        <li>3. 返事は、声に出して音読してから打つ。分からなければ「?」だけを送る</li>
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
