import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AppShell from './AppShell'
import Spinner from './Spinner'

/**
 * Puerta de las rutas protegidas. Al montar consulta GET /api/me:
 *  - 'loading' → spinner a pantalla completa (nunca blanco)
 *  - 'anon'    → redirige a la landing
 *  - 'authed'  → renderiza el marco + la ruta hija
 */
export default function ProtectedRoute() {
  const { status } = useAuth()

  if (status === 'loading') return <Spinner full label="Verificando sesión" />
  if (status === 'anon') return <Navigate to="/" replace />

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
