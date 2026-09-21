// Tipos que reflejan los contratos reales del backend FastAPI.

export interface Me {
  id: string
  email: string
  student_id: string
}

/** Cómo el proveedor MCP negoció sus credenciales OAuth. */
export type AuthType = 'pre' | 'dcr' | 'cimd'

/** `provider` viene con guion bajo desde GET /api/connections. */
export type ProviderKey = 'andes_air' | 'staywell' | 'cielo_sur'

export interface Connection {
  id: string
  provider: ProviderKey
  auth_type: AuthType
  connected_at: string
}

/** JSON Schema estándar que describe los argumentos de una tool. */
export interface JsonSchema {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

export interface Tool {
  name: string
  description?: string
  inputSchema?: JsonSchema
}

export interface ToolsResponse {
  tools: Tool[]
}

/* ---------- Catálogo de tools (GET /api/tools) ---------- */

/**
 * Una tool tal como se le ofrece al modelo. Ojo con dos diferencias respecto de
 * `Tool` (que viene del MCP crudo, vía GET /api/mcp/{id}/tools):
 *  - `name` llega PREFIJADO por auth_type (`pre_`, `dcr_`, `cimd_`), porque los
 *    MCPs repiten nombres entre sí (ver obtener_tools_llm en el backend).
 *  - el schema viaja como `input_schema`, no `inputSchema`.
 */
export interface CatalogTool {
  name: string
  description: string
  input_schema: JsonSchema
  provider: ProviderKey
}

/* ---------- Chat ---------- */

/** Solo USER y MODEL se persisten: los resultados de tools viven en `tool_calls`. */
export type MessageRole = 'USER' | 'MODEL'

/**
 * Una llamada a tool que hizo el modelo, con su resultado ya resuelto.
 * `arguments` y `result` son JSONB del backend: objetos, no strings.
 */
export interface ToolCallTrace {
  name: string
  arguments: unknown
  result: unknown
  is_error: boolean
}

export interface ChatMessage {
  role: MessageRole
  /** null en los turnos donde el modelo solo pidió tools sin decir nada. */
  text: string | null
  created_at: string
  tool_calls: ToolCallTrace[]
}

/** Item de GET /api/chats. `title` son los primeros 80 chars del primer mensaje. */
export interface ChatSummary {
  id: string
  title: string | null
  created_at: string
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[]
}

/** Respuesta de POST /api/chats/messages: NO trae el historial ni las tool calls. */
export interface SendMessageResult {
  chat_id: string
  text: string
  turns: number
}
