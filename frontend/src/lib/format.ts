const dateFmt = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** Formatea un ISO string; si no parsea, devuelve el valor original. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}

/** Primeros 8 caracteres de un id, para mostrar en eyebrows sin ocupar toda la línea. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

/**
 * El backend guarda `datetime.utcnow()`, que serializa SIN offset ("2026-09-21T14:02:11").
 * `new Date()` lee eso como hora local y corre las fechas. Le agregamos la Z.
 *
 * Solo para timestamps propios (created_at, connected_at). Las fechas que vienen
 * dentro del resultado de una tool no pasan por acá: ahí un string sin offset suele
 * ser hora local del destino, y forzarla a UTC la movería mal.
 */
function parseBackendDate(iso: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

/** Fecha y hora de un timestamp del backend. Si no parsea, devuelve el original. */
export function formatBackendDateTime(iso: string): string {
  const d = parseBackendDate(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}

/**
 * Etiqueta corta para la lista de chats: hora si es de hoy, "ayer" si es de ayer,
 * día y mes si es más viejo.
 */
export function formatChatDate(iso: string): string {
  const d = parseBackendDate(iso)
  if (Number.isNaN(d.getTime())) return iso

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)

  if (days === 0) return timeFmt.format(d)
  if (days === 1) return 'ayer'
  return dayFmt.format(d)
}
