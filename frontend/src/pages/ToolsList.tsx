import { useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getTools } from '../lib/api'
import { providerName } from '../lib/providers'
import { shortId } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import type { Tool } from '../types'
import RidgeDivider from '../components/RidgeDivider'
import Spinner from '../components/Spinner'
import ErrorNote from '../components/ErrorNote'

export default function ToolsList() {
  const { connectionId = '' } = useParams()
  const location = useLocation()
  const provider = (location.state as { provider?: string } | null)?.provider

  const load = useCallback(() => getTools(connectionId), [connectionId])
  const { data, loading, error, reload } = useAsync<Tool[]>(load, connectionId)

  const tools = data ?? []
  const label = provider ? providerName(provider) : `Conexión ${shortId(connectionId)}`

  return (
    <>
      <Link to="/connections" className="backlink">
        ← Conexiones
      </Link>

      <div className="page-head">
        <p className="eyebrow">
          {label} <b>//</b> {shortId(connectionId)}
          {!loading && !error && (
            <>
              {' '}
              <b>//</b> {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
            </>
          )}
        </p>
        <h1>Herramientas</h1>
        <RidgeDivider />
      </div>

      {loading && <Spinner label="Cargando tools" />}

      {!loading && error && (
        <ErrorNote
          title="No se pudieron cargar las tools"
          message={`EL ERROR ES: ${error.message} \n REINTENTALO, A VECES LA PRIMERA VEZ NO FUNCIONA PERO LUEGO SI`}
          onRetry={reload}
        />
      )}

      {!loading && !error && tools.length === 0 && (
        <div className="card empty">Esta conexión no expone tools.</div>
      )}

      {!loading && !error && tools.length > 0 && (
        <div className="stack">
          {tools.map((tool) => (
            <Link
              key={tool.name}
              className="card tool-row"
              to={`/connections/${connectionId}/tools/${encodeURIComponent(tool.name)}`}
              state={{ provider }}
            >
              <span className="tool-row__name">{tool.name}</span>
              {tool.description && <p className="tool-row__desc">{tool.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
