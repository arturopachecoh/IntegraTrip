import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authConnectUrl, getConnections, hardRedirect } from '../lib/api'
import { PROVIDERS, providerName } from '../lib/providers'
import { formatDateTime } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import type { Connection } from '../types'
import RidgeDivider from '../components/RidgeDivider'
import Spinner from '../components/Spinner'
import ErrorNote from '../components/ErrorNote'
import StatusBanner from '../components/StatusBanner'

interface Notice {
  kind: 'ok' | 'err'
  text: string
}

/** Traduce los query params del callback OAuth a un mensaje para el usuario. */
function noticeFromParams(params: URLSearchParams): Notice | null {
  const status = params.get('status')
  if (!status) return null

  const intent = params.get('intent')
  const provider = params.get('provider')
  const reason = params.get('reason')
  const name = provider ? providerName(provider) : 'El proveedor'

  if (status === 'success') {
    return {
      kind: 'ok',
      text: intent === 'login' ? 'Sesión iniciada.' : `${name} conectado exitosamente.`,
    }
  }
  const what = intent === 'login' ? 'iniciar sesión' : `conectar ${name}`
  return { kind: 'err', text: `No se pudo ${what}${reason ? `: ${reason}` : '.'}` }
}

export default function Connections() {
  // Refetch siempre al montar: sin caché entre sesiones / usuarios.
  const load = useCallback(() => getConnections(), [])
  const { data, loading, error, reload } = useAsync<Connection[]>(load, 'connections')

  const [params, setParams] = useSearchParams()
  // El mensaje se calcula una sola vez, de los params con los que se montó.
  const [notice, setNotice] = useState<Notice | null>(() => noticeFromParams(params))

  // Ya consumidos: los limpiamos de la URL para que no reaparezcan al recargar.
  useEffect(() => {
    if (params.get('status')) setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byProvider = new Map((data ?? []).map((c) => [c.provider, c]))
  const connectedCount = PROVIDERS.filter((p) => byProvider.has(p.apiKey)).length

  function connect(slug: string) {
    hardRedirect(authConnectUrl(slug, 'connect'))
  }

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          Conexiones <b>//</b> {connectedCount} de {PROVIDERS.length} conectadas
        </p>
        <h1>Conexiones</h1>
        <RidgeDivider />
        <p className="lede">
          Conectá cada proveedor una vez con OAuth. Después vas a poder ver y ejecutar sus
          tools desde acá.
        </p>
      </div>

      {notice && (
        <StatusBanner kind={notice.kind} onDismiss={() => setNotice(null)}>
          {notice.text}
        </StatusBanner>
      )}

      {loading && <Spinner label="Cargando conexiones" />}

      {!loading && error && (
        <ErrorNote
          title="No se pudieron cargar las conexiones"
          message={`EL ERROR ES: ${error.message} \n REINTENTALO, A VECES LA PRIMERA VEZ NO FUNCIONA PERO LUEGO SI`}
          onRetry={reload}
        />
      )}

      {!loading && !error && (
        <div className="stack">
          {PROVIDERS.map((p) => {
            const conn = byProvider.get(p.apiKey)
            return (
              <div key={p.apiKey} className="card provider">
                <div>
                  <span className="provider__name">{p.name}</span>
                  <span className="provider__domain">{p.domain}</span>
                </div>

                <div className="provider__action">
                  {conn ? (
                    <Link className="btn btn--sm" to={`/connections/${conn.id}/tools`}>
                      Ver tools
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--amber btn--sm"
                      onClick={() => connect(p.slug)}
                    >
                      Conectar
                    </button>
                  )}
                </div>

                <p className="provider__blurb">{p.blurb}</p>

                <div className="provider__status">
                  {conn ? (
                    <>
                      <span className="dot dot--on" />
                      <span className="status-on">Conectado</span>
                      <span>· {formatDateTime(conn.connected_at)}</span>
                      <span className="badge" title="Tipo de credenciales OAuth">
                        {conn.auth_type}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="dot dot--off" />
                      <span className="status-off">No conectado</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
