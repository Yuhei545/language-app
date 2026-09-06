import { useState } from 'react'
import { useLanguage } from '../../app/LanguageContext'
import { PatternPage } from './PatternPage'
import { QuickPage } from './QuickPage'
import { TopicPage } from './TopicPage'

type Tab = 'pattern' | 'topic' | 'quick'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'pattern', label: '型を回す', hint: '日本語を聞いて、すぐ言う' },
  { id: 'topic', label: 'お題で言う', hint: '自分の言葉で伝える' },
  { id: 'quick', label: '即答', hint: '質問に 2 秒で返す' },
]

export function InstantBuildPage() {
  const { language } = useLanguage()
  const [tab, setTab] = useState<Tab>('pattern')

  return (
    <section>
      <p className="text-sm font-bold text-violet-700">INSTANT BUILD</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">瞬間組み立て</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        意味を思いついてから声に出るまでを短くする練習です。3 つの段階を、この順で進みます。
      </p>

      <div className="mt-6 flex gap-2" role="tablist" aria-label="練習の段階">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`min-w-0 flex-1 rounded-2xl px-2 py-3 text-sm font-bold transition-colors ${tab === item.id ? 'bg-violet-700 text-white shadow-sm' : 'bg-white text-slate-600'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        {TABS.find((item) => item.id === tab)?.hint}
      </p>

      <div className="mt-6">
        {tab === 'pattern' ? <PatternPage lang={language} /> : null}
        {tab === 'topic' ? <TopicPage lang={language} /> : null}
        {tab === 'quick' ? <QuickPage lang={language} /> : null}
      </div>
    </section>
  )
}
