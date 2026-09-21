import Markdown from './Markdown'
import ToolTrace from './ToolTrace'
import type { ChatMessage } from '../../types'

/**
 * Un mensaje del historial. El usuario va en burbuja a la derecha; el modelo, en
 * una hoja a la izquierda, con la traza de tools arriba del texto (fue lo que
 * pasó antes de que pudiera contestar).
 *
 * El loop del agente guarda un mensaje MODEL por turno, y los turnos que solo
 * pidieron tools tienen `text` null: esos se rinden solo con su traza.
 */
export default function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'USER') {
    return (
      <div className="turn turn--user">
        <div className="bubble bubble--user">{message.text}</div>
      </div>
    )
  }

  const hasText = message.text != null && message.text.trim() !== ''
  if (!hasText && message.tool_calls.length === 0) return null

  return (
    <div className="turn turn--model">
      <div className="bubble bubble--model">
        {message.tool_calls.length > 0 && <ToolTrace calls={message.tool_calls} />}
        {hasText && <Markdown>{message.text as string}</Markdown>}
      </div>
    </div>
  )
}
