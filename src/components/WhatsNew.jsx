import { useEffect } from 'react'
import { IconX } from './icons.jsx'

/* Shown automatically after an update (with the entries since the user's last
   seen version) and from the version stamp in Settings (with the full history). */
export default function WhatsNew({ entries, onClose, title = "What's new" }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!entries?.length) return null

  function dayLabel(iso) {
    const d = new Date(`${iso}T00:00:00`)
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grabber" />
        <button className="sheet-x" onClick={onClose} aria-label="Close"><IconX /></button>
        <h2>{title}</h2>
        <div className="whatsnew">
          {entries.map((e) => (
            <div key={e.version} className="whatsnew-entry">
              <div className="whatsnew-head">
                <span className="whatsnew-ver">v{e.version}</span>
                {e.date && <span className="muted small">{dayLabel(e.date)}</span>}
              </div>
              <ul className="whatsnew-list">
                {e.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="btn-row" style={{ padding: '0 10px', marginTop: 6 }}>
          <button className="btn primary block" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  )
}
