import { useEffect, useState } from 'react'
import { getMe } from '../lib/api'
import type { Me } from '../types'

export type AuthStatus = 'loading' | 'authed' | 'anon'

export interface AuthState {
  status: AuthStatus
  user: Me | null
}

/**
 * Consulta GET /api/me en cada montaje. No cachea en estado global ni en
 * localStorage: al cambiar de usuario (logout + login) el resultado se vuelve a
 * pedir siempre desde cero.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

  useEffect(() => {
    let active = true
    getMe()
      .then((user) => {
        if (active) setState({ status: 'authed', user })
      })
      .catch(() => {
        if (active) setState({ status: 'anon', user: null })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
