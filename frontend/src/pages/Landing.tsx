import { Navigate } from 'react-router-dom'
import { authConnectUrl, hardRedirect } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import ContourBackdrop from '../components/ContourBackdrop'
import Spinner from '../components/Spinner'

export default function Landing() {
  const { status } = useAuth()

  if (status === 'loading') return <Spinner full label="Cargando" />
  if (status === 'authed') return <Navigate to="/connections" replace />

  function signIn() {
    // Redirección del navegador (no fetch): el backend responde con un 302 al AS.
    hardRedirect(authConnectUrl('andes-air', 'login'))
  }

  return (
    <section className="landing">
      <ContourBackdrop />
      <div className="container landing__inner">
        <span className="wordmark">
          IntegraTrip<span className="wordmark__alt">// MCP</span>
        </span>
        <h1>Tus proveedores de viaje, en una sola sesión.</h1>
        <p className="landing__lede">
          IntegraTrip es un cliente MCP: conectás Andes Air, StayWell y Cielo Sur con tu
          cuenta y ejecutás sus herramientas —vuelos, hoteles y clima— desde una misma
          consola, sin manejar tokens a mano.
        </p>
        <div className="landing__meta">
          <span className="chip">Andes Air · Vuelos</span>
          <span className="chip">StayWell · Hoteles</span>
          <span className="chip">Cielo Sur · Clima</span>
        </div>
        <div className="landing__cta">
          <button type="button" className="btn btn--primary" onClick={signIn}>
            Iniciar sesión
          </button>
        </div>
      </div>
    </section>
  )
}
