import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { RequireAuth } from './app/RequireAuth'
import { LoginPage } from './features/auth/LoginPage'
import { CardsPage } from './features/cards/CardsPage'
import { CurriculumPage } from './features/curriculum/CurriculumPage'
import { HomePage } from './features/home/HomePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TalkPage } from './features/talk/TalkPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/talk" element={<TalkPage />} />
          <Route path="/cards" element={<CardsPage />} />
          <Route path="/curriculum" element={<CurriculumPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
