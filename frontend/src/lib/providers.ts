import type { ProviderKey } from '../types'

export interface ProviderMeta {
  /** Valor de `provider` que devuelve GET /api/connections (guion bajo). */
  apiKey: ProviderKey
  /** Slug para las rutas de OAuth del backend (guion). */
  slug: 'andes-air' | 'staywell' | 'cielo-sur'
  name: string
  domain: string
  blurb: string
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    apiKey: 'andes_air',
    slug: 'andes-air',
    name: 'Andes Air',
    domain: 'Vuelos',
    blurb: 'Búsqueda y reserva de vuelos sobre la cordillera.',
  },
  {
    apiKey: 'staywell',
    slug: 'staywell',
    name: 'StayWell',
    domain: 'Hoteles',
    blurb: 'Disponibilidad y reservas de alojamiento.',
  },
  {
    apiKey: 'cielo_sur',
    slug: 'cielo-sur',
    name: 'Cielo Sur',
    domain: 'Clima',
    blurb: 'Pronóstico y condiciones para el destino.',
  },
] as const

const BY_KEY = new Map<string, ProviderMeta>(PROVIDERS.map((p) => [p.apiKey, p]))
const BY_SLUG = new Map<string, ProviderMeta>(PROVIDERS.map((p) => [p.slug, p]))

/** Acepta guion bajo (`andes_air`) o guion (`andes-air`). */
export function providerLabel(key: string): string {
  const meta = BY_KEY.get(key) ?? BY_SLUG.get(key.replace(/_/g, '-'))
  return meta ? `${meta.name} — ${meta.domain}` : key
}

export function providerName(key: string): string {
  const meta = BY_KEY.get(key) ?? BY_SLUG.get(key.replace(/_/g, '-'))
  return meta ? meta.name : key
}
