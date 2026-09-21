import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AppShell from './AppShell'
import Spinner from './Spinner'

interface ProtectedRouteProps {
  /** Se lo pasa al shell: 'full' para el chat, que maneja su propio scroll. */
  variant?: 'page' | 'full'
}

/**
 * Puerta de las rutas protegidas. Al montar consulta GET /api/me:
 *  - 'loading' → spinner a pantalla completa (nunca blanco)
 *  - 'anon'    → redirige a la landing
 *  - 'authed'  → renderiza el marco + la ruta hija
 */
export default function ProtectedRoute({ variant = 'page' }: ProtectedRouteProps) {
  const { status } = useAuth()

  if (status === 'loading') return <Spinner full label="Verificando sesión" />
  if (status === 'anon') return <Navigate to="/" replace />

  return (
    <AppShell variant={variant}>
      <Outlet />
    </AppShell>
  )
}
