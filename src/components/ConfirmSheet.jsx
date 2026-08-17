import { useEffect } from 'react'
import { IconTrash } from './icons.jsx'

/* Replaces window.confirm() for destructive actions.
   A native confirm can be suppressed — Chrome's "prevent this page from
   creating additional dialogs" makes it return false forever, and automated
   contexts auto-dismiss it — which silently turns the action into a dead
   button. This always renders, and matches the app's own share sheet. */
export default function ConfirmSheet({
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div
        className="sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grabber" />
        <h2>{title}</h2>
        {body && <p className="muted small" style={{ margin: '0 10px 14px' }}>{body}</p>}
        <div className="btn-row" style={{ padding: '0 10px' }}>
          <button className="btn block" onClick={onCancel}>Cancel</button>
          <button className="btn danger block" onClick={onConfirm} autoFocus>
            <IconTrash /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
