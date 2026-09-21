import { useParams } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useChat } from '../hooks/useChat'
import ChatSidebar from '../components/chat/ChatSidebar'
import MessageList from '../components/chat/MessageList'
import Composer from '../components/chat/Composer'
import ErrorNote from '../components/ErrorNote'
import Spinner from '../components/Spinner'
import RidgeDivider from '../components/RidgeDivider'

/** Arranques posibles, para que la pantalla vacía sea una invitación y no un hueco. */
const EXAMPLES = [
  'Quiero volar a Cancún el 20 de diciembre por una semana. ¿Qué opciones hay?',
  'Busca un hotel céntrico en Bariloche para dos personas del 5 al 9 de julio.',
  '¿Cómo va a estar el clima en Ushuaia la próxima semana?',
]

export default function Chat() {
  const { chatId } = useParams()
  const chat = useChat(chatId ?? null)
  const busy = chat.pending !== null

  const rateLimited = chat.sendError instanceof ApiError && chat.sendError.status === 429
  const messages = chat.detail?.messages ?? []

  return (
    <div className="chat">
      <ChatSidebar
        chats={chat.chats}
        loading={chat.chatsLoading}
        error={chat.chatsError}
        onReload={chat.reloadChats}
        activeId={chatId ?? null}
      />

      <section className="convo">
        {chat.detailLoading && <Spinner label="Abriendo chat" />}

        {!chat.detailLoading && chat.detailError && (
          <div className="convo__center">
            <ErrorNote
              title="No se pudo abrir el chat"
              message={chat.detailError.message}
              onRetry={chat.reloadDetail}
            />
          </div>
        )}

        {!chat.detailLoading && !chat.detailError && messages.length === 0 && !busy && (
          <div className="convo__center">
            <div className="welcome">
              <h1>¿Adónde vamos?</h1>
              <RidgeDivider />
              <p className="welcome__lede">
                Cuéntame el viaje que tienes en mente. Voy a buscar vuelos, alojamiento y
                clima en los proveedores que conectaste, y te muestro cada consulta que
                hice para llegar a la respuesta.
              </p>
              <ul className="welcome__examples">
                {EXAMPLES.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      className="welcome__example"
                      disabled={busy}
                      onClick={() => void chat.send(example)}
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {!chat.detailLoading && !chat.detailError && (messages.length > 0 || busy) && (
          <MessageList messages={messages} pending={chat.pending} />
        )}

        <footer className="convo__foot">
          {chat.sendError && (
            <div className="convo__alert">
              {rateLimited ? (
                <div className="limit" role="alert">
                  <p className="limit__head">Límite de uso alcanzado</p>
                  <p className="limit__body">
                    Espera un momento y vuelve a enviar tu mensaje. No se reintenta automáticamente.
                  </p>
                </div>
              ) : (
                <ErrorNote title="No se pudo completar la respuesta" message={chat.sendError.message} />
              )}
            </div>
          )}

          <Composer onSend={chat.send} busy={busy} />
        </footer>
      </section>
    </div>
  )
}
