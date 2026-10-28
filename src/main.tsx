import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import AccountProvider from './auth/AccountProvider'
import ConsentProvider from './consent/ConsentProvider'
import { startCalmMotion } from './settings/calmMotion'
import './pwa/installPrompt'
import { startUpdateWatcher } from './pwa/updateWatcher'
import './index.css'

startCalmMotion()
startUpdateWatcher()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AccountProvider>
        <ConsentProvider>
          <App />
        </ConsentProvider>
      </AccountProvider>
    </BrowserRouter>
  </StrictMode>,
)
