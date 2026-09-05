import { Link } from 'react-router-dom'

const practices = [
  {
    title: '声で覚えるカード',
    description: '絵と音を結びつけて、声に出して覚えます。',
    to: '/cards',
    emoji: '🗣️',
  },
  {
    title: '文をつくる',
    description: '知っている言葉を組み合わせて、意味を声で伝えます。',
    to: '/mixing',
    emoji: '🧩',
  },
  {
    title: '聞いて書く',
    description: '短い文を聞き取り、音と文字をつなげます。',
    to: '/dictation',
    emoji: '✍️',
  },
  {
    title: '音声レッスン',
    description: 'まとまった音声を聞きながら、言葉に浸ります。',
    to: '/lesson',
    emoji: '🎧',
  },
] as const

export function PracticePage() {
  return (
    <section>
      <p className="text-sm font-bold text-teal-700">PRACTICE</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日の練習を選ぶ</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">今の気分に合う入口から、声と意味をつないでいきましょう。</p>

      <div className="mt-7 grid gap-4">
        {practices.map((practice) => {
          const content = (
            <>
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-2xl" aria-hidden="true">
                  {practice.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-slate-900">{practice.title}</h2>
                    <span className="text-xl text-teal-700" aria-hidden="true">→</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{practice.description}</p>
                </div>
              </div>
            </>
          )

          return (
            <Link
              key={practice.title}
              to={practice.to}
              className="rounded-3xl border border-teal-900/10 bg-white p-5 shadow-sm transition-transform active:scale-[0.99]"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
