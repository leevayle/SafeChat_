import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { hydrateKv } from './lib/kv'
import { hydrateCacheOwner } from './lib/appCache'

void Promise.all([hydrateKv(), hydrateCacheOwner()]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
