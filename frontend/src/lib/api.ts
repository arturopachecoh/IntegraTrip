import type {
  CatalogTool,
  ChatDetail,
  ChatSummary,
  Connection,
  Me,
  SendMessageResult,
  Tool,
  ToolsResponse,
} from '../types'

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
    return `No se pudo contactar al servidor (${API_URL}). Verifica que el backend esté corriendo.`
  }
  if (status === 401) return 'Tu sesión expiró o no iniciaste sesión.'
  if (status === 429) {
    return 'Límite de uso alcanzado. Espera un momento y vuelve a enviar tu mensaje.'
  }
  if (status === 504) {
    return (
      detail ||
      'El agente hizo demasiados intentos sin llegar a una respuesta. Intenta reformular la solicitud.'
    )
  }
  // El 502 del chat viene del proxy del LLM, no de un MCP: el detail lo distingue.
  if (status === 502 && detail.startsWith('Error del LLM')) {
    return `El modelo no respondió. ${detail}`
  }
  if (status === 502) {
    const extra = detail ? `${detail} ` : ''
    return `El proveedor MCP no respondió (502). ${extra}A veces la primera llamada falla y la siguiente funciona: vuelve a intentarlo.`
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

/* ---------- Catálogo de tools ---------- */

/**
 * Catálogo unificado que se le ofrece al modelo. Consulta los 3 MCPs en vivo, así
 * que tarda; si un proveedor falla, el backend lo omite en vez de fallar entero.
 */
export const getToolCatalog = () => apiFetch<CatalogTool[]>('/api/tools')

/* ---------- Chat ---------- */

export const listChats = () => apiFetch<ChatSummary[]>('/api/chats')

export const getChat = (chatId: string) =>
  apiFetch<ChatDetail>(`/api/chats/${encodeURIComponent(chatId)}`)

/**
 * Corre el loop del agente entero (hasta 12 turnos con tools), así que puede
 * tardar bastante. `chatId` null crea un chat nuevo y devuelve su id.
 *
 * La respuesta trae solo el texto final: las tool calls de este turno quedan en
 * la base, no acá. Para mostrar la traza hay que volver a pedir el chat.
 */
export const sendMessage = (chatId: string | null, text: string) =>
  apiFetch<SendMessageResult>('/api/chats/messages', {
    method: 'POST',
    body: JSON.stringify({ chat_id: chatId, text }),
  })
