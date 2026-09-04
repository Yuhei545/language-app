import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { OfflineBanner } from '../components/OfflineBanner'
import { Toast } from '../components/Toast'
import { signOut } from '../services/supabase/auth'
import { useLanguage } from './LanguageContext'

const tabs = [
  { to: '/', label: 'ホーム', end: true },
  { to: '/talk', label: '会話' },
  { to: '/cards', label: 'カード' },
  { to: '/curriculum', label: 'カリキュラム' },
  { to: '/settings', label: '設定' },
]

export function AppShell() {
  const { language, setLanguage } = useLanguage()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState<unknown>(null)

  const handleSignOut = async () => {
    if (signingOut) {
      return
    }

    setLogoutError(null)
    setSigningOut(true)

    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#f8fbfa] shadow-xl shadow-slate-900/10">
      <OfflineBanner />
      <Toast error={logoutError} onClose={() => setLogoutError(null)} />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-teal-900/10 bg-[#f8fbfa]/95 px-5 py-4 backdrop-blur">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-teal-700">MY LANGUAGE LAB</p>
          <p className="mt-0.5 text-lg font-bold text-slate-800">言語学習</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-teal-900/8 p-1" aria-label="学習言語">
            <button
              type="button"
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${language === 'en' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
            >
              EN
            </button>
            <button
              type="button"
              aria-pressed={language === 'ko'}
              onClick={() => setLanguage('ko')}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${language === 'ko' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
            >
              한국어
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="rounded-lg px-1.5 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            {signingOut ? '終了中…' : 'ログアウト'}
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 py-6 pb-28">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid w-full max-w-[480px] grid-cols-5 border-t border-teal-900/10 bg-white/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="メインナビゲーション">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `rounded-lg px-1 py-2 text-center text-[11px] font-bold transition-colors ${isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:text-teal-700'}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
