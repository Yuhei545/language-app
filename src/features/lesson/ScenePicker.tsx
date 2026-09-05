import { useState } from 'react'
import type { Interest } from '../../services/settings'

export type ScenePrepEvent = { id: string; title: string; event_date: string | null }

/** 目的タグごとの定型の場面。会話生成の題材になる。 */
export const presetScenes: Record<Interest, string[]> = {
  travel: [
    'カフェで注文する',
    '道を尋ねる',
    'ホテルにチェックインする',
    '空港で搭乗手続きをする',
    '店で服を選ぶ',
    '忘れ物を届け出る',
  ],
  friends: [
    '週末の予定を立てる',
    '久しぶりに会って近況を話す',
    '最近見た番組の感想を言い合う',
  ],
  content: [
    '推しの新曲について話す',
    '最新話の感想を話す',
    'ライブの思い出を話す',
  ],
}

const interestLabels: Record<Interest, string> = {
  travel: '旅行・現地での生活',
  friends: '友達との会話',
  content: 'コンテンツを楽しむ',
}

export function ScenePicker({
  interests,
  prepEvents,
  busy,
  onCreate,
}: {
  interests: Interest[]
  prepEvents: ScenePrepEvent[]
  busy: boolean
  onCreate: (sceneJa: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [freeText, setFreeText] = useState('')

  const scene = freeText.trim().length > 0 ? freeText.trim() : selected
  const canCreate = scene !== null && scene.length > 0 && !busy

  const choose = (value: string) => {
    setSelected(value)
    setFreeText('')
  }

  const sceneButton = (value: string) => (
    <button
      key={value}
      type="button"
      onClick={() => choose(value)}
      disabled={busy}
      aria-pressed={selected === value && freeText.trim().length === 0}
      className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition-colors disabled:opacity-50 ${
        selected === value && freeText.trim().length === 0
          ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {value}
    </button>
  )

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-3xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-6 text-center shadow-sm">
        <p className="text-5xl" aria-hidden="true">🎭</p>
        <h2 className="mt-4 text-xl font-bold text-slate-900">どの場面で話しますか?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          選んだ場面の会話を作り、聞いて、分解して、最後にあなたが片方の役を演じます。
        </p>
      </div>

      {prepEvents.length > 0 ? (
        <section>
          <h3 className="text-sm font-bold text-slate-700">あなたの予定</h3>
          <div className="mt-2 grid gap-2">
            {prepEvents.map((event) => sceneButton(event.title))}
          </div>
        </section>
      ) : null}

      {interests.map((interest) => (
        <section key={interest}>
          <h3 className="text-sm font-bold text-slate-700">{interestLabels[interest]}</h3>
          <div className="mt-2 grid gap-2">
            {presetScenes[interest].map(sceneButton)}
          </div>
        </section>
      ))}

      {interests.length === 0 && prepEvents.length === 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          設定画面で学習目的を選ぶと、定型の場面が並びます。下に自由に書いても始められます。
        </p>
      ) : null}

      <section>
        <label htmlFor="scene-free-text" className="text-sm font-bold text-slate-700">
          自由に場面を書く
        </label>
        <input
          id="scene-free-text"
          type="text"
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
          disabled={busy}
          placeholder="例: 美容院で髪型を頼む"
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        />
      </section>

      {busy ? (
        <p className="rounded-2xl bg-indigo-50 px-4 py-3 text-center text-sm font-bold text-indigo-900" role="status">
          会話を作っています(10〜20 秒)
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (scene) {
            onCreate(scene)
          }
        }}
        disabled={!canCreate}
        className="w-full rounded-2xl bg-indigo-700 px-5 py-5 text-lg font-bold text-white shadow-[0_16px_36px_rgba(67,56,202,0.24)] disabled:opacity-45"
      >
        {busy ? '会話を作っています…' : 'このレッスンを作る'}
      </button>
    </div>
  )
}
