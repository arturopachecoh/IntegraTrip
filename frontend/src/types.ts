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
