interface SpinnerProps {
  label?: string
  full?: boolean
}

/** Estado de carga visible: nunca dejamos la pantalla en blanco. */
export default function Spinner({ label = 'Cargando', full = false }: SpinnerProps) {
  return (
    <div className={full ? 'loading loading--full' : 'loading'} role="status">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}
