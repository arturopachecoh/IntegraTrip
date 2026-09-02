import { useState } from 'react'
import type { ReactNode } from 'react'
import { formatDateTime } from '../lib/format'

/**
 * Render legible de datos JSON arbitrarios (lo que devuelven las tools):
 *  - objeto            → filas clave / valor con la clave "humanizada"
 *  - lista de objetos  → tabla
 *  - lista de valores  → viñetas
 *  - primitivos        → texto (URLs como link, fechas ISO formateadas, bool en es)
 * Recursivo y acotado en profundidad; para lo muy anidado cae a JSON indentado.
 */

const URL_RE = /^https?:\/\/[^\s]+$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
const MAX_DEPTH = 6
const PREVIEW = 25

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * ¿El valor se rinde como bloque ancho (tabla, cards, objeto anidado) en vez de
 * como texto corto? Esos van con la clave ARRIBA y el valor a todo el ancho: en
 * dos columnas, una clave corta como "Airports" dejaba un hueco enorme a la
 * izquierda de la tabla.
 */
function isBlockValue(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return false
  return Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0
}

function humanize(key: string): string {
  const s = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function columnsOf(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  const cols: string[] = []
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }
  return cols
}

function Primitive({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="jv-muted">—</span>
  if (typeof value === 'boolean') return <span>{value ? 'Sí' : 'No'}</span>
  if (typeof value === 'number') return <span>{String(value)}</span>

  const s = String(value)
  if (s === '') return <span className="jv-muted">(vacío)</span>
  if (URL_RE.test(s)) {
    return (
      <a href={s} target="_blank" rel="noreferrer">
        {s}
      </a>
    )
  }
  if (ISO_RE.test(s)) return <span>{formatDateTime(s)}</span>
  return <span className="jv-str">{s}</span>
}

function Collapsible({
  count,
  children,
}: {
  count: number
  children: (limit: number) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const limit = open ? count : PREVIEW
  return (
    <>
      {children(limit)}
      {count > PREVIEW && (
        <button type="button" className="jv-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Ver menos' : `Ver los ${count - PREVIEW} restantes`}
        </button>
      )}
    </>
  )
}

function Node({ value, depth }: { value: unknown; depth: number }) {
  if (value === null || typeof value !== 'object') return <Primitive value={value} />

  if (depth >= MAX_DEPTH) return <pre className="jv-pre">{safeJson(value)}</pre>

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="jv-muted">(lista vacía)</span>

    const allPrimitive = value.every((v) => v === null || typeof v !== 'object')
    if (allPrimitive) {
      return (
        <Collapsible count={value.length}>
          {(limit) => (
            <ul className="jv-list">
              {value.slice(0, limit).map((v, i) => (
                <li key={i}>
                  <Primitive value={v} />
                </li>
              ))}
            </ul>
          )}
        </Collapsible>
      )
    }

    const allRecords = value.every(isRecord)
    if (allRecords && value.length >= 2) {
      const rows = value as Record<string, unknown>[]
      const cols = columnsOf(rows)
      if (cols.length > 0 && cols.length <= 12) {
        return (
          <Collapsible count={rows.length}>
            {(limit) => (
              <div className="jv-tablewrap">
                <table className="jv-table">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c}>{humanize(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((row, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c}>
                            {c in row ? (
                              <Node value={row[c]} depth={depth + 2} />
                            ) : (
                              <span className="jv-muted">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Collapsible>
        )
      }
    }

    return (
      <Collapsible count={value.length}>
        {(limit) => (
          <ol className="jv-cards">
            {value.slice(0, limit).map((v, i) => (
              <li key={i} className="jv-card">
                <Node value={v} depth={depth + 1} />
              </li>
            ))}
          </ol>
        )}
      </Collapsible>
    )
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return <span className="jv-muted">(objeto vacío)</span>

  return (
    <div className="jv-object">
      {entries.map(([k, v]) => (
        <div className={isBlockValue(v) ? 'jv-row jv-row--block' : 'jv-row'} key={k}>
          <div className="jv-key">{humanize(k)}</div>
          <div className="jv-val">
            <Node value={v} depth={depth + 1} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function JsonView({ value }: { value: unknown }) {
  return (
    <div className="jv">
      <Node value={value} depth={0} />
    </div>
  )
}
