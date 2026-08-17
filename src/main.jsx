import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)

// Service workers are unavailable on file:// — and unnecessary there, since the
// standalone build already carries everything it needs inside the one document.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('./sw.js').catch(() => {})
    } catch {}
  })
}
