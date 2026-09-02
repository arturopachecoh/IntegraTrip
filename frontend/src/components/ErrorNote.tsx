interface ErrorNoteProps {
  title?: string
  message: string
  onRetry?: () => void
}

/**
 * Muestra un error de forma clara y CONTENIDA (max-height + overflow, igual que
 * el panel de resultado): nunca desborda ni rompe el layout.
 */
export default function ErrorNote({ title = 'Error', message, onRetry }: ErrorNoteProps) {
  return (
    <div className="error-note" role="alert">
      <div className="error-note__head">{title}</div>
      <p className="error-note__body">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}
