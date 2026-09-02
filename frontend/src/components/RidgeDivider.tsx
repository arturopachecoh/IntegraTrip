/**
 * Perfil de cordillera bajo los títulos de página. Es el único gesto gráfico
 * marcado; todo lo demás alrededor queda tranquilo.
 */
export default function RidgeDivider() {
  return (
    <svg
      className="ridge"
      viewBox="0 0 960 22"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <polyline
        points="0,20 90,9 150,15 235,3 300,13 380,6 470,18 560,8 640,14 730,4 820,16 900,10 960,17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line x1="0" y1="21" x2="960" y2="21" stroke="var(--line)" strokeWidth="1" />
    </svg>
  )
}
