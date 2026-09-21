import { useCallback, useState } from 'react'
import { getToolCatalog } from '../lib/api'
import { PROVIDERS, providerName, splitToolName } from '../lib/providers'
import { useAsync } from '../hooks/useAsync'
import SchemaView from './SchemaView'
import Spinner from './Spinner'
import ErrorNote from './ErrorNote'
import type { CatalogTool } from '../types'

/**
 * Las tools que el agente tiene a mano, agrupadas por proveedor. Es el mismo
 * catálogo que se le manda al modelo (GET /api/tools), así que lo que se ve acá
 * es exactamente lo que el modelo puede usar en el chat.
 *
 * Carga aparte de las conexiones: consulta los 3 MCPs en vivo y tarda, y si uno
 * falla el backend lo omite en vez de fallar entero.
 */
export default function ToolCatalog() {
  const load = useCallback(() => getToolCatalog(), [])
  const { data, loading, error, reload } = useAsync<CatalogTool[]>(load, 'tool-catalog')

  const tools = data ?? []
  const byProvider = PROVIDERS.map((p) => ({
    provider: p,
    tools: tools.filter((t) => t.provider === p.apiKey),
  })).filter((group) => group.tools.length > 0)

  return (
    <section className="catalog">
      <div className="catalog__head">
        <h2>Herramientas disponibles</h2>
        {!loading && !error && tools.length > 0 && (
          <p className="catalog__count">
            {tools.length} en {byProvider.length}{' '}
            {byProvider.length === 1 ? 'proveedor' : 'proveedores'}
          </p>
        )}
      </div>
      <p className="catalog__lede">
        Esto es lo que el agente puede hacer por ti en el chat. Se lee en vivo de cada
        proveedor conectado.
      </p>

      {loading && <Spinner label="Leyendo herramientas" />}

      {!loading && error && (
        <ErrorNote
          title="No se pudo leer el catálogo"
          message={error.message}
          onRetry={reload}
        />
      )}

      {!loading && !error && tools.length === 0 && (
        <div className="card empty">
          Todavía no hay herramientas. Conecta un proveedor para verlas aquí.
        </div>
      )}

      {!loading &&
        !error &&
        byProvider.map(({ provider, tools: group }) => (
          <div key={provider.apiKey} className="catalog__group">
            <h3 className="catalog__provider">
              {provider.name}
              <span className="catalog__domain">{provider.domain}</span>
            </h3>
            <div className="stack">
              {group.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </div>
        ))}
    </section>
  )
}

function ToolCard({ tool }: { tool: CatalogTool }) {
  const [open, setOpen] = useState(false)
  const { short } = splitToolName(tool.name)

  return (
    <article className="card toolcard">
      <div className="toolcard__head">
        <span className="toolcard__name">{short}</span>
        <span className="toolcard__from">{providerName(tool.provider)}</span>
      </div>

      {tool.description && <p className="toolcard__desc">{tool.description}</p>}

      <button
        type="button"
        className="toolcard__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '−' : '+'}</span>
        {open ? 'Ocultar parámetros' : 'Ver parámetros'}
      </button>

      {open && (
        <div className="toolcard__schema">
          <SchemaView schema={tool.input_schema} />
          <p className="toolcard__id">
            El modelo la llama <code>{tool.name}</code>
          </p>
        </div>
      )}
    </article>
  )
}
