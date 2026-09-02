import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { callTool, getTools } from '../lib/api'
import { providerName } from '../lib/providers'
import { shortId } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import type { Tool } from '../types'
import RidgeDivider from '../components/RidgeDivider'
import Spinner from '../components/Spinner'
import ErrorNote from '../components/ErrorNote'
import ResultPanel from '../components/ResultPanel'
import DynamicToolForm from '../components/DynamicToolForm'

export default function ToolRunner() {
  const { connectionId = '', toolName = '' } = useParams()
  const location = useLocation()
  const provider = (location.state as { provider?: string } | null)?.provider

  const load = useCallback(() => getTools(connectionId), [connectionId])
  const { data, loading, error, reload } = useAsync<Tool[]>(load, connectionId)
  const tool = data?.find((t) => t.name === toolName)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: true; value: unknown } | null>(null)
  const [callError, setCallError] = useState<string | null>(null)

  const run = useCallback(
    async (args: unknown) => {
      setRunning(true)
      setResult(null)
      setCallError(null)
      try {
        const value = await callTool(connectionId, toolName, args)
        setResult({ ok: true, value })
      } catch (err) {
        setCallError(err instanceof Error ? err.message : String(err))
      } finally {
        setRunning(false)
      }
    },
    [connectionId, toolName],
  )

  const label = provider ? providerName(provider) : `Conexión ${shortId(connectionId)}`

  return (
    <>
      <Link
        to={`/connections/${connectionId}/tools`}
        state={{ provider }}
        className="backlink"
      >
        ← {label}
      </Link>

      {loading && <Spinner label="Cargando tool" />}

      {!loading && error && (
        <ErrorNote
          title="No se pudo cargar la tool"
          message={error.message}
          onRetry={reload}
        />
      )}

      {!loading && !error && !tool && (
        <ErrorNote
          title="Tool no encontrada"
          message={`No existe una tool llamada «${toolName}» en esta conexión.`}
        />
      )}

      {!loading && !error && tool && (
        <>
          <div className="page-head">
            <p className="eyebrow">
              Tool <b>//</b> {toolName}
            </p>
            <h2 className="tool-row__name" style={{ fontSize: '1.4rem' }}>
              {tool.name}
            </h2>
            <RidgeDivider />
            {tool.description && <p className="lede">{tool.description}</p>}
          </div>

          <DynamicToolForm schema={tool.inputSchema} running={running} onRun={run} />

          {callError && (
            <ErrorNote title="La llamada falló" message={callError} />
          )}

          {result && (
            <div className="result">
              <div className="result__head">
                <p className="eyebrow">Resultado</p>
              </div>
              <ResultPanel value={result.value} />
            </div>
          )}
        </>
      )}
    </>
  )
}
