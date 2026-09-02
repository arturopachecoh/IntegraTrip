/**
 * Curvas de nivel: motivo de fondo (elemento firma). Puramente decorativo,
 * queda muy tenue por CSS y no captura eventos.
 */
export default function ContourBackdrop() {
  return (
    <div className="contour" aria-hidden="true">
      <svg viewBox="0 0 1200 260" preserveAspectRatio="none" fill="none">
        {[0, 34, 68, 102, 136, 170].map((offset, i) => (
          <path
            key={i}
            d={`M-20 ${60 + offset}
                C 160 ${20 + offset}, 300 ${120 + offset}, 470 ${86 + offset}
                S 760 ${16 + offset}, 940 ${72 + offset}
                S 1160 ${130 + offset}, 1240 ${94 + offset}`}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  )
}
