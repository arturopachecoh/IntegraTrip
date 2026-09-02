# IntegraTrip — Frontend

Cliente MCP para IntegraTrip: inicio de sesión y conexión OAuth con proveedores de
viaje (Andes Air, StayWell, Cielo Sur), listado de sus tools y ejecución con un
formulario generado dinámicamente desde el `inputSchema` de cada tool.

React + TypeScript + Vite · React Router · `@rjsf/core` para los formularios · CSS propio.

## Requisitos

- Node 18+.
- El backend FastAPI corriendo en `http://localhost:8000` (ver `../backend`).
  Su CORS habilita el origen `http://localhost:5173` con cookies, así que **el frontend
  tiene que servirse en el puerto 5173**.

## Configuración

La URL del backend se lee de una variable de entorno de Vite. Copiá el ejemplo:

```bash
cp .env.example .env
```

`.env`:

```
VITE_API_URL=http://localhost:8000
```

Al desplegar, cambiá ese valor (y actualizá `FRONTEND_URL` en el backend para que
coincida con el origen del frontend y su CORS).

## Correr en desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
```

Si el 5173 está ocupado, Vite usa otro puerto y las llamadas al backend fallan por
CORS: liberá el 5173 y reiniciá.

## Scripts

| comando | qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo con HMR |
| `npm run build` | `tsc -b` + build de producción en `dist/` |
| `npm run preview` | sirve el build de `dist/` |
| `npm run lint` | ESLint |

## Estructura

```
src/
  lib/          api.ts (fetch con credenciales), providers.ts, format.ts
  hooks/        useAuth (GET /api/me), useAsync (fetch al montar + reload)
  components/   AppShell, ProtectedRoute, DynamicToolForm, ResultPanel,
                ErrorNote, StatusBanner, Spinner, ContourBackdrop, RidgeDivider
  pages/        Landing, Connections, ToolsList, ToolRunner
  styles/       global.css (sistema de diseño), rjsf-theme.css
```

## Notas

- Todas las llamadas usan `credentials: "include"`; la sesión viaja por cookie
  httpOnly, no hay tokens en el cliente ni `localStorage`.
- El inicio del flujo OAuth (`/api/auth/{slug}/connect`) es una redirección
  full-page del navegador, no un `fetch`.
- `@rjsf/*` está en la v6 (peer `react >= 18`). Si una instalación futura se queja
  de peers, reintentar con `npm install --legacy-peer-deps`.
- El bundle supera los 500 kB (lo aporta `@rjsf` + `ajv`); es esperable para esta
  entrega y no se hizo code-splitting.
