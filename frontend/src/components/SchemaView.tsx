import type { JsonSchema } from '../types'

/**
 * Muestra el inputSchema de una tool como la lista de parámetros que espera, en
 * vez del JSON Schema crudo: nombre, tipo, si es obligatorio y qué significa.
 * Baja un nivel dentro de objetos y arrays; más profundo que eso no aporta.
 */

function isSchema(v: unknown): v is JsonSchema {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const TYPE_ES: Record<string, string> = {
  string: 'texto',
  number: 'número',
  integer: 'número entero',
  boolean: 'sí / no',
  object: 'objeto',
  array: 'lista',
  null: 'nulo',
}

/** "texto", "lista de objetos", "texto o número" — el tipo dicho en castellano. */
function describeType(schema: JsonSchema): string {
  const raw = schema.type
  const names = (Array.isArray(raw) ? raw : [raw])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => TYPE_ES[t] ?? t)

  if (names.length === 0) {
    if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) return 'varios formatos'
    return 'cualquier valor'
  }

  if (names[0] === 'lista' && isSchema(schema.items)) {
    const inner = describeType(schema.items as JsonSchema)
    return `lista de ${inner}`
  }
  return names.join(' o ')
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === null) return 'nulo'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function Field({ name, schema, required }: { name: string; schema: JsonSchema; required: boolean }) {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null
  const nested =
    schema.type === 'object' && isSchema(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : null
  const nestedRequired = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  )

  return (
    <li className="field">
      <div className="field__head">
        <span className="field__name">{name}</span>
        <span className="field__type">{describeType(schema)}</span>
        {required ? (
          <span className="field__req">obligatorio</span>
        ) : (
          <span className="field__opt">opcional</span>
        )}
      </div>

      {typeof schema.description === 'string' && (
        <p className="field__desc">{schema.description}</p>
      )}

      {enumValues && (
        <p className="field__enum">
          Valores: {enumValues.map((v) => formatValue(v)).join(' · ')}
        </p>
      )}

      {schema.default !== undefined && (
        <p className="field__default">Por defecto: {formatValue(schema.default)}</p>
      )}

      {nested && Object.keys(nested).length > 0 && (
        <ul className="field__nested">
          {Object.entries(nested).map(([key, child]) => (
            <li key={key} className="field__nestedrow">
              <span className="field__name">{key}</span>
              <span className="field__type">
                {isSchema(child) ? describeType(child) : 'cualquier valor'}
              </span>
              {nestedRequired.has(key) && <span className="field__req">obligatorio</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function SchemaView({ schema }: { schema: JsonSchema | undefined }) {
  const properties = isSchema(schema?.properties)
    ? (schema.properties as Record<string, unknown>)
    : null

  if (!properties || Object.keys(properties).length === 0) {
    return <p className="field__none">No recibe parámetros.</p>
  }

  const required = new Set(Array.isArray(schema?.required) ? schema.required : [])

  return (
    <ul className="fields">
      {Object.entries(properties).map(([name, child]) => (
        <Field
          key={name}
          name={name}
          schema={isSchema(child) ? child : {}}
          required={required.has(name)}
        />
      ))}
    </ul>
  )
}
