import type { ReactNode } from 'react'
import JsonView from './JsonView'

interface ResultPanelProps {
  value: unknown
}

interface CallToolResult {
  content?: Array<Record<string, unknown>>
  isError?: boolean
  structuredContent?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** ¿La respuesta tiene la forma de un CallToolResult de MCP? */
function looksLikeToolResult(v: unknown): v is CallToolResult {
  if (!isRecord(v)) return false
  return Array.isArray(v.content) || 'structuredContent' in v || 'isError' in v
}

/** Si el string es JSON de objeto/array lo parsea; si no, null. */
function parseJson(s: string): unknown | null {
  const t = s.trim()
  if (t[0] !== '{' && t[0] !== '[') return null
  try {
    const parsed: unknown = JSON.parse(t)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/** Render legible de los bloques `content` de un CallToolResult. */
function FriendlyResult({ result }: { result: CallToolResult }) {
  const blocks: ReactNode[] = []
  const items = result.content ?? []

  items.forEach((item, i) => {
    const type = str(item.type) || 'contenido'

    if (type === 'text') {
      const text = str(item.text)
      const json = parseJson(text)
      blocks.push(
        <div className="result-block" key={i}>
          {json !== null ? (
            <JsonView value={json} />
          ) : (
            <p className="result-block__text">{text || '(texto vacío)'}</p>
          )}
        </div>,
      )
      return
    }

    if (type === 'image') {
      const data = str(item.data)
      blocks.push(
        <div className="result-block" key={i}>
          <p className="result-block__label">Imagen</p>
          {data ? (
            <img
              alt="Resultado de la tool"
              src={`data:${str(item.mimeType) || 'image/png'};base64,${data}`}
            />
          ) : (
            <p className="result-block__text">(imagen vacía)</p>
          )}
        </div>,
      )
      return
    }

    if (type === 'audio') {
      const data = str(item.data)
      blocks.push(
        <div className="result-block" key={i}>
          <p className="result-block__label">Audio</p>
          {data && (
            <audio controls src={`data:${str(item.mimeType) || 'audio/mpeg'};base64,${data}`} />
          )}
        </div>,
      )
      return
    }

    if (type === 'resource' || type === 'resource_link') {
      const resource = isRecord(item.resource) ? item.resource : undefined
      const uri = str(item.uri) || str(resource?.uri)
      const text = str(resource?.text)
      const json = text ? parseJson(text) : null
      blocks.push(
        <div className="result-block" key={i}>
          <p className="result-block__label">Recurso</p>
          {uri && (
            <p className="result-block__text">
              <a href={uri} target="_blank" rel="noreferrer">
                {str(item.name) || uri}
              </a>
            </p>
          )}
          {json !== null ? (
            <JsonView value={json} />
          ) : (
            text && <p className="result-block__text">{text}</p>
          )}
        </div>,
      )
      return
    }

    blocks.push(
      <div className="result-block" key={i}>
        <p className="result-block__label">{type}</p>
        <JsonView value={item} />
      </div>,
    )
  })

  const hasStructured = result.structuredContent !== undefined

  if (blocks.length === 0 && !hasStructured) {
    blocks.push(
      <div className="result-block" key="empty">
        <p className="result-block__text">La tool no devolvió contenido.</p>
      </div>,
    )
  }

  return (
    <>
      {blocks}
      {hasStructured && (
        <div className="result-block">
          <p className="result-block__label">Datos estructurados</p>
          <JsonView value={result.structuredContent} />
        </div>
      )}
    </>
  )
}

/**
 * Muestra el resultado de `tools/call` de forma clara y CONTENIDA (requisito de
 * la rúbrica). El JSON de la respuesta se rinde legible: los objetos como filas
 * clave/valor, las listas de objetos como tablas, las URLs como links, etc.
 * (`JsonView`). El panel limita alto y ancho con `overflow` propio: no desborda
 * la página ni rompe el layout.
 */
export default function ResultPanel({ value }: ResultPanelProps) {
  const toolResult = looksLikeToolResult(value) ? value : null
  const isError = toolResult?.isError === true
  const isStructured = toolResult !== null || (typeof value === 'object' && value !== null)

  return (
    <div className={isError ? 'result-panel result-panel--error' : 'result-panel'}>
      {isError && <div className="result-panel__bar">La tool devolvió un error</div>}

      <div className="result-panel__body">
        {toolResult ? (
          <FriendlyResult result={toolResult} />
        ) : isStructured ? (
          <div className="result-block">
            <JsonView value={value} />
          </div>
        ) : (
          <pre>{str(value) || '(sin contenido)'}</pre>
        )}
      </div>
    </div>
  )
}
