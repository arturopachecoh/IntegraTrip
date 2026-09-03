import type { Connection, Me, Tool, ToolsResponse } from '../types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Error normalizado de cualquier llamada al backend. `status === 0` = fallo de red. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function messageFor(status: number, detail: string): string {
  if (status === 0) {
    return `No se pudo contactar al servidor (${API_URL}). Verificá que el backend esté corriendo.`
  }
  if (status === 401) return 'Tu sesión expiró o no iniciaste sesión.'
  if (status === 502) {
    return `El proveedor MCP no respondió (502). ${detail || 'Probá de nuevo en unos segundos.'}`
  }
  if (status === 400) return detail || 'La solicitud tiene datos inválidos (400).'
  return detail || `El servidor respondió con un error (${status}).`
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: init?.body != null ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError(0, messageFor(0, ''))
  }

  if (res.status === 204) return undefined as T

  const raw = await res.text()
  let body: unknown = null
  let isJson = true
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      body = raw
      isJson = false
    }
  }

  if (!res.ok) {
    const detail =
      (body != null &&
        typeof body === 'object' &&
        // FastAPI usa `detail`; el callback de OAuth usa `reason`.
        ((body as Record<string, unknown>).detail ?? (body as Record<string, unknown>).reason)) ||
      (typeof body === 'string' ? body : '') ||
      res.statusText
    throw new ApiError(res.status, messageFor(res.status, String(detail)))
  }

  // Un 2xx que no es JSON no viene del backend: cuando el rewrite `/api/* ->
  // backend` no matchea, el static site sirve index.html con status 200. Sin
  // este guardia `getMe()` resolvería OK y dejaría pasar a un usuario sin sesion.
  if (!isJson) {
    throw new ApiError(0, `La respuesta de ${path} no es JSON: el backend no está respondiendo esa ruta.`)
  }

  return body as T
}

export const getMe = () => apiFetch<Me>('/api/me')

export const getConnections = () => apiFetch<Connection[]>('/api/connections')

/**
 * El backend devuelve un array plano de tools (aunque algunos MCP responden
 * `{ tools: [...] }`): normalizamos las dos formas a `Tool[]`.
 */
export const getTools = async (connectionId: string): Promise<Tool[]> => {
  const body = await apiFetch<Tool[] | ToolsResponse>(
    `/api/mcp/${encodeURIComponent(connectionId)}/tools`,
  )
  if (Array.isArray(body)) return body
  return body?.tools ?? []
}

export const callTool = (connectionId: string, toolName: string, args: unknown) =>
  apiFetch<unknown>(
    `/api/mcp/${encodeURIComponent(connectionId)}/tools/${encodeURIComponent(toolName)}/call`,
    { method: 'POST', body: JSON.stringify(args ?? {}) },
  )

export const logout = () => apiFetch<void>('/api/auth/logout', { method: 'POST' })

/**
 * URL de inicio del flujo OAuth. NO se llama con fetch: hay que redirigir el
 * navegador (ver `hardRedirect`) para que el backend pueda hacer el 302 al AS.
 */
export const authConnectUrl = (slug: string, intent: 'login' | 'connect') =>
  `${API_URL}/api/auth/${slug}/connect?intent=${intent}`

/** Navegación full-page: sale de la SPA (hacia el backend OAuth o la landing). */
export function hardRedirect(url: string): void {
  window.location.assign(url)
}
