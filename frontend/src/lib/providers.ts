import type { AuthType, ProviderKey } from '../types'

export interface ProviderMeta {
  /** Valor de `provider` que devuelve GET /api/connections (guion bajo). */
  apiKey: ProviderKey
  /** Slug para las rutas de OAuth del backend (guion). */
  slug: 'andes-air' | 'staywell' | 'cielo-sur'
  /** Prefijo que el backend le pone a las tools de este proveedor (`pre_`, etc.). */
  authType: AuthType
  name: string
  domain: string
  blurb: string
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    apiKey: 'andes_air',
    slug: 'andes-air',
    authType: 'pre',
    name: 'Andes Air',
    domain: 'Vuelos',
    blurb: 'Búsqueda y reserva de vuelos sobre la cordillera.',
  },
  {
    apiKey: 'staywell',
    slug: 'staywell',
    authType: 'dcr',
    name: 'StayWell',
    domain: 'Hoteles',
    blurb: 'Disponibilidad y reservas de alojamiento.',
  },
  {
    apiKey: 'cielo_sur',
    slug: 'cielo-sur',
    authType: 'cimd',
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

const BY_AUTH_TYPE = new Map<string, ProviderMeta>(PROVIDERS.map((p) => [p.authType, p]))

/**
 * Las tools del catálogo llegan con el auth_type de su proveedor como prefijo
 * (`pre_search_flights`), porque los MCPs repiten nombres entre sí. Devuelve el
 * proveedor dueño de la tool y su nombre sin prefijo.
 */
export function splitToolName(name: string): { provider: ProviderMeta | null; short: string } {
  const sep = name.indexOf('_')
  if (sep === -1) return { provider: null, short: name }

  const provider = BY_AUTH_TYPE.get(name.slice(0, sep)) ?? null
  return { provider, short: provider ? name.slice(sep + 1) : name }
}
