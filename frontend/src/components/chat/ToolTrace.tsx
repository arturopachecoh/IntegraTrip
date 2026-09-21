import { useState } from 'react'
import JsonView from '../JsonView'
import { splitToolName } from '../../lib/providers'
import type { ToolCallTrace } from '../../types'

/**
 * Las tools que el modelo ejecutó en un turno, dibujadas como una ruta: cada
 * llamada es un punto sobre la línea, y se abre para ver argumentos y resultado.
 * Una llamada con error queda marcada en rojo sobre la misma línea.
 */
export default function ToolTrace({ calls }: { calls: ToolCallTrace[] }) {
  const failed = calls.filter((c) => c.is_error).length

  return (
    <section className="trace" aria-label="Herramientas consultadas">
      <p className="trace__head">
        {calls.length === 1 ? 'Consultó 1 herramienta' : `Consultó ${calls.length} herramientas`}
        {failed > 0 && (
          <span className="trace__failed">
            {failed === 1 ? '1 falló' : `${failed} fallaron`}
          </span>
        )}
      </p>

      <ol className="trace__route">
        {calls.map((call, i) => (
          <TraceStop key={`${call.name}-${i}`} call={call} />
        ))}
      </ol>
    </section>
  )
}

function TraceStop({ call }: { call: ToolCallTrace }) {
  const [open, setOpen] = useState(false)
  const { provider, short } = splitToolName(call.name)

  return (
    <li className={call.is_error ? 'stop stop--error' : 'stop'}>
      <span className="stop__pin" aria-hidden="true" />

      <button
        type="button"
        className="stop__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="stop__where">{provider ? provider.name : 'MCP'}</span>
        <span className="stop__tool">{short}</span>
        {call.is_error && <span className="stop__tag">error</span>}
        <span className="stop__chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="stop__detail">
          <div className="stop__block">
            <p className="stop__label">Se le pidió</p>
            <JsonView value={call.arguments} />
          </div>
          <div className="stop__block">
            <p className="stop__label">{call.is_error ? 'Devolvió este error' : 'Respondió'}</p>
            <JsonView value={call.result} />
          </div>
        </div>
      )}
    </li>
  )
}
