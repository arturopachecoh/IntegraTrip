import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { hardRedirect, logout } from '../lib/api'
import ContourBackdrop from './ContourBackdrop'

interface AppShellProps {
  children: ReactNode
  /**
   * 'page' — columna centrada con scroll, para Configuración.
   * 'full' — el contenido ocupa el alto restante y maneja su propio scroll,
   *          para el chat (la página no scrollea, sí los paneles de adentro).
   */
  variant?: 'page' | 'full'
}

const SECTIONS = [
  { to: '/connections', label: 'Configuración' },
  { to: '/chat', label: 'Chat' },
] as const

/** Marco de las páginas protegidas: barra superior con las dos secciones + contenido. */
export default function AppShell({ children, variant = 'page' }: AppShellProps) {
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
    <div className={variant === 'full' ? 'app-shell app-shell--full' : 'app-shell'}>
      <header className="topbar">
        <ContourBackdrop />
        <div className="container topbar__inner">
          <Link to="/connections" className="wordmark">
            IntegraTrip<span className="wordmark__alt">// MCP</span>
          </Link>

          <nav className="sections" aria-label="Secciones">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  isActive ? 'sections__link sections__link--on' : 'sections__link'
                }
              >
                {s.label}
              </NavLink>
            ))}
          </nav>

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

      {variant === 'full' ? (
        <main className="page page--full">{children}</main>
      ) : (
        <main className="page">
          <div className="container">{children}</div>
        </main>
      )}
    </div>
  )
}
