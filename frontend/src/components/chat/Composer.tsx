import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

interface ComposerProps {
  /** Devuelve false si el envío falló: ahí el texto se queda en el campo. */
  onSend: (text: string) => Promise<boolean>
  busy: boolean
}

const MAX_ROWS_PX = 180

export default function Composer({ onSend, busy }: ComposerProps) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`
  }

  async function submit() {
    const value = text.trim()
    if (!value || busy) return

    const ok = await onSend(value)
    if (ok) {
      setText('')
      if (ref.current) {
        ref.current.style.height = 'auto'
        ref.current.focus()
      }
    }
  }

  // Enter manda; Shift+Enter deja escribir varias líneas.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <textarea
        ref={ref}
        className="composer__input"
        rows={1}
        value={text}
        placeholder="Contá adónde querés ir y cuándo"
        aria-label="Mensaje"
        disabled={busy}
        onChange={(e) => {
          setText(e.target.value)
          grow(e.target)
        }}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="btn btn--primary composer__send" disabled={busy || !text.trim()}>
        {busy ? 'Enviando…' : 'Enviar'}
      </button>
      <p className="composer__hint">Enter envía · Shift + Enter agrega una línea</p>
    </form>
  )
}
