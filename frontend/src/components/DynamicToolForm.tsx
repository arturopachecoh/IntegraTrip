import { useMemo } from 'react'
import Form from '@rjsf/core'
import type { IChangeEvent } from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import type { JsonSchema } from '../types'

interface DynamicToolFormProps {
  schema?: JsonSchema
  running: boolean
  onRun: (args: unknown) => void
}

const FORM_ID = 'tool-form'
const MAX_DEPTH = 8

/** ¿El schema define algún campo para pedir al usuario? */
function hasFields(schema?: JsonSchema): boolean {
  if (!schema) return false
  const props = schema.properties
  return !!props && Object.keys(props).length > 0
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * uiSchema que apaga el botón "agregar propiedad" de RJSF en TODO objeto.
 *
 * Cuando un `inputSchema` no declara `additionalProperties: false` (lo habitual
 * en schemas generados por Pydantic/zod), RJSF agrega al final de cada objeto un
 * botón para sumar propiedades arbitrarias. Acá no tiene sentido —la tool sólo
 * acepta los argumentos declarados— y además metía un bloque de espacio entre el
 * último campo y "Ejecutar". `expandable` se lee por objeto, así que hay que
 * recorrer el schema y ponerlo en cada nivel.
 */
function buildUiSchema(schema: JsonSchema, depth = 0): UiSchema {
  const ui: UiSchema = { 'ui:options': { expandable: false } }
  if (depth >= MAX_DEPTH) return ui

  if (isRecord(schema.properties)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (isRecord(sub)) ui[key] = buildUiSchema(sub as JsonSchema, depth + 1)
    }
  }

  if (isRecord(schema.items)) {
    ui.items = buildUiSchema(schema.items as JsonSchema, depth + 1)
  }

  return ui
}

/**
 * Genera el formulario automáticamente desde el inputSchema de la tool (JSON
 * Schema estándar) con @rjsf/core. No se arma ningún input a mano.
 *
 * El botón "Ejecutar" vive FUERA del <form> de RJSF (asociado con `form={id}`)
 * para que su posición dependa sólo de nuestro layout y no del markup interno
 * que RJSF intercala.
 */
export default function DynamicToolForm({ schema, running, onRun }: DynamicToolFormProps) {
  const label = running ? 'Ejecutando…' : 'Ejecutar'

  const uiSchema = useMemo<UiSchema>(() => {
    if (!schema) return {}
    const ui = buildUiSchema(schema)
    // El título y la descripción de la tool ya se muestran en la cabecera de la
    // página: no los repetimos arriba del formulario.
    ui['ui:options'] = { ...(ui['ui:options'] ?? {}), title: '', description: '' }
    return ui
  }, [schema])

  if (!hasFields(schema)) {
    return (
      <div className="tool-form-wrap">
        <p className="tool-form__note">Esta tool no requiere argumentos.</p>
        <button
          type="button"
          className="btn btn--primary"
          disabled={running}
          onClick={() => onRun({})}
        >
          {label}
        </button>
      </div>
    )
  }

  return (
    <div className="tool-form-wrap">
      <Form
        id={FORM_ID}
        className="tool-form"
        // Sin esto RJSF nombra "root" al fieldset raíz y choca con el id del
        // punto de montaje de la app (id duplicado en el DOM + estilos cruzados).
        idPrefix="arg"
        schema={schema as RJSFSchema}
        uiSchema={uiSchema}
        validator={validator}
        showErrorList={false}
        noHtml5Validate
        onSubmit={(data: IChangeEvent) => onRun(data.formData ?? {})}
      >
        {/* fragment vacío ⇒ RJSF no renderiza su botón de submit por defecto */}
        <></>
      </Form>
      <button type="submit" form={FORM_ID} className="btn btn--primary" disabled={running}>
        {label}
      </button>
    </div>
  )
}
