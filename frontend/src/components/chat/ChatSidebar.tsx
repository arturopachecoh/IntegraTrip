import { NavLink } from 'react-router-dom'
import { formatChatDate } from '../../lib/format'
import Spinner from '../Spinner'
import type { ChatSummary } from '../../types'

interface ChatSidebarProps {
  chats: ChatSummary[] | null
  loading: boolean
  error: Error | null
  onReload: () => void
  /** Chat abierto, o null si es uno nuevo todavía sin guardar. */
  activeId: string | null
}

export default function ChatSidebar({
  chats,
  loading,
  error,
  onReload,
  activeId,
}: ChatSidebarProps) {
  return (
    <aside className="rail">
      <div className="rail__top">
        <NavLink
          to="/chat"
          className={activeId === null ? 'btn btn--sm rail__new rail__new--on' : 'btn btn--sm rail__new'}
        >
          Nuevo chat
        </NavLink>
      </div>

      <nav className="rail__list" aria-label="Chats anteriores">
        {loading && <Spinner label="Cargando chats" />}

        {!loading && error && (
          <div className="rail__error">
            <p>No se pudieron cargar tus chats.</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReload}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && chats?.length === 0 && (
          <p className="rail__empty">Tus conversaciones aparecerán aquí.</p>
        )}

        {!loading &&
          !error &&
          chats?.map((chat) => (
            <NavLink
              key={chat.id}
              to={`/chat/${chat.id}`}
              className={({ isActive }) => (isActive ? 'rail__item rail__item--on' : 'rail__item')}
            >
              <span className="rail__title">{chat.title?.trim() || 'Chat sin título'}</span>
              <span className="rail__when">{formatChatDate(chat.created_at)}</span>
            </NavLink>
          ))}
      </nav>
    </aside>
  )
}
