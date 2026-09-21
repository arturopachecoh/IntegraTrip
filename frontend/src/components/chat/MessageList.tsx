import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import AgentWorking from './AgentWorking'
import type { ChatMessage } from '../../types'

interface MessageListProps {
  messages: ChatMessage[]
  /** Mensaje recién enviado que todavía no volvió del backend. */
  pending: string | null
}

export default function MessageList({ messages, pending }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  // Bajamos al final cuando entra un mensaje o arranca una espera.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pending])

  return (
    <div className="thread">
      <div className="thread__inner">
        {messages.map((m, i) => (
          <MessageBubble key={`${m.created_at}-${i}`} message={m} />
        ))}

        {pending !== null && (
          <>
            <div className="turn turn--user">
              <div className="bubble bubble--user bubble--pending">{pending}</div>
            </div>
            <AgentWorking />
          </>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}
