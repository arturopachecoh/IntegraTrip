import type { ReactNode } from 'react'

interface StatusBannerProps {
  kind: 'ok' | 'err'
  children: ReactNode
  onDismiss?: () => void
}

export default function StatusBanner({ kind, children, onDismiss }: StatusBannerProps) {
  return (
    <div className={`banner banner--${kind}`} role="status">
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          className="banner__close"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
        >
          ×
        </button>
      )}
    </div>
  )
}
