import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { CardsPage } from './features/cards/CardsPage'
import { CurriculumPage } from './features/curriculum/CurriculumPage'
import { HomePage } from './features/home/HomePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TalkPage } from './features/talk/TalkPage'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/talk" element={<TalkPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/curriculum" element={<CurriculumPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
