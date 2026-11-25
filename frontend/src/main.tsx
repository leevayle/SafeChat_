import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { hydrateKv } from './lib/kv'
import { hydrateCacheOwner } from './lib/appCache'
import { ErrorBoundary } from './components/ErrorBoundary'
import { warmChatPattern } from './store'
import { LegalOverlay } from './legal/LegalPage'

// Start pattern warm immediately (parallel with KV hydrate) so chats open crisp + instant
void warmChatPattern()

void Promise.all([hydrateKv(), hydrateCacheOwner()]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary label="root">
        <App />
        <LegalOverlay />
      </ErrorBoundary>
    </React.StrictMode>,
  )
})
