import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Kiosk from './pages/Kiosk'
import './index.css'

// Simple path-based routing — no router library needed
const path = window.location.pathname

if (path === '/kiosk' || path.startsWith('/kiosk')) {
  // Load site info from URL param or localStorage
  const params = new URLSearchParams(window.location.search)
  const siteId   = params.get('site') || localStorage.getItem('kiosk_site_id') || null
  const siteName = params.get('name') || localStorage.getItem('kiosk_site_name') || ''
  if (params.get('site')) {
    localStorage.setItem('kiosk_site_id', params.get('site'))
    if (params.get('name')) localStorage.setItem('kiosk_site_name', params.get('name'))
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Kiosk siteId={siteId} siteName={siteName} />
    </React.StrictMode>
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
