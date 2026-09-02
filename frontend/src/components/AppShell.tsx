import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hardRedirect, logout } from '../lib/api'
import ContourBackdrop from './ContourBackdrop'

interface AppShellProps {
  children: ReactNode
}

/** Marco de las páginas protegidas: barra superior + contenido. */
export default function AppShell({ children }: AppShellProps) {
  const [leaving, setLeaving] = useState(false)

  async function handleLogout() {
    setLeaving(true)
    try {
      await logout()
    } catch {
      // Aunque falle el POST, igual sacamos al usuario de la app.
    }
    // Recarga completa: fuerza a re-evaluar GET /api/me y descarta todo estado.
    hardRedirect('/')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <ContourBackdrop />
        <div className="container topbar__inner">
          <Link to="/connections" className="wordmark">
            IntegraTrip<span className="wordmark__alt">// MCP</span>
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleLogout}
            disabled={leaving}
          >
            {leaving ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>
      <main className="page">
        <div className="container">{children}</div>
      </main>
    </div>
  )
}
