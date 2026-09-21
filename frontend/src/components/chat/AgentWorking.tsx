import { useEffect, useState } from 'react'

/**
 * Espera del loop del agente. Puede tardar bastante (hasta 12 turnos, cada uno
 * con llamadas a los MCPs), así que a los 6 segundos explicamos por qué.
 */
export default function AgentWorking() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="turn turn--model">
      <div className="working" role="status">
        <span className="working__pulse" aria-hidden="true" />
        <span>
          Buscando la respuesta
          {slow && (
            <span className="working__hint">Está consultando los proveedores conectados.</span>
          )}
        </span>
      </div>
    </div>
  )
}
