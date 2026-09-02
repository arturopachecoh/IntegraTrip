const dateFmt = new Intl.DateTimeFormat('es-AR', {
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
