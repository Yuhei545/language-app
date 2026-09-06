import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { LanguageProvider } from './app/LanguageContext'
import { initServiceWorker } from './app/pwaUpdate'
import './index.css'

// 新版が来ても勝手に再読み込みせず、バナーの「更新」で切り替える
initServiceWorker(registerSW)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </HashRouter>
  </React.StrictMode>,
)
