import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChat, listChats, sendMessage } from '../lib/api'
import type { ChatDetail, ChatSummary } from '../types'

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

/** Resultado de cargar un chat, etiquetado con el id que se pidió. */
interface DetailResult {
  id: string
  chat: ChatDetail | null
  error: Error | null
}

export interface ChatState {
  chats: ChatSummary[] | null
  chatsLoading: boolean
  chatsError: Error | null
  reloadChats: () => void

  detail: ChatDetail | null
  detailLoading: boolean
  detailError: Error | null
  reloadDetail: () => void

  /** Texto del usuario que ya se mandó y está esperando al agente. */
  pending: string | null
  /** Error del último envío. Se limpia cuando el usuario manda otro mensaje. */
  sendError: Error | null
  /** `false` ⇒ el envío falló y el texto sigue siendo del usuario (no se reintenta solo). */
  send: (text: string) => Promise<boolean>
}

/**
 * Estado de la vista de chat. La ruta manda: `chatId` null es un chat todavía sin
 * crear, y el backend lo crea recién en el primer POST.
 *
 * POST /api/chats/messages devuelve solo el texto final, sin las tool calls del
 * turno, así que después de cada envío volvemos a pedir el chat completo: es la
 * única forma de ver la traza.
 */
export function useChat(chatId: string | null): ChatState {
  const navigate = useNavigate()

  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [chatsError, setChatsError] = useState<Error | null>(null)
  const [chatsNonce, setChatsNonce] = useState(0)

  const [result, setResult] = useState<DetailResult | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [sendError, setSendError] = useState<Error | null>(null)

  // Chat que el usuario está mirando: sirve para descartar respuestas que
  // llegan tarde de uno que ya cerró. Solo se toca en efectos y handlers.
  const openChat = useRef<string | null>(chatId)
  // Chat cuyo detalle ya pedimos: evita re-pedirlo cuando la ruta cambia
  // porque nosotros mismos acabamos de traerlo tras un envío.
  const fetched = useRef<string | null>(null)

  const refreshChats = useCallback(
    () =>
      listChats().then(
        (rows) => {
          setChats(rows)
          setChatsError(null)
          return rows
        },
        (err: unknown) => {
          setChatsError(asError(err))
          return null
        },
      ),
    [],
  )

  useEffect(() => {
    let active = true
    listChats().then(
      (rows) => {
        if (active) {
          setChats(rows)
          setChatsError(null)
        }
      },
      (err: unknown) => {
        if (active) setChatsError(asError(err))
      },
    )
    return () => {
      active = false
    }
  }, [chatsNonce])

  const loadDetail = useCallback((id: string) => {
    fetched.current = id
    openChat.current = id
    return getChat(id).then(
      (chat) => {
        if (openChat.current === id) setResult({ id, chat, error: null })
      },
      (err: unknown) => {
        if (openChat.current === id) setResult({ id, chat: null, error: asError(err) })
      },
    )
  }, [])

  // Reacciona a la ruta. `fetched` corta el pedido duplicado cuando el chat que
  // pide la URL es justo el que acabamos de cargar después de enviar.
  useEffect(() => {
    openChat.current = chatId
    if (chatId === null) {
      fetched.current = null
      return
    }
    if (fetched.current === chatId) return
    void loadDetail(chatId)
  }, [chatId, loadDetail])

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const from = chatId
      const knownIds = new Set((chats ?? []).map((c) => c.id))

      setSendError(null)
      setPending(text)
      try {
        const sent = await sendMessage(from, text)

        openChat.current = sent.chat_id
        fetched.current = sent.chat_id
        const fresh = await getChat(sent.chat_id)
        setResult({ id: sent.chat_id, chat: fresh, error: null })
        if (from !== sent.chat_id) navigate(`/chat/${sent.chat_id}`, { replace: true })
        void refreshChats()
        return true
      } catch (err) {
        setSendError(asError(err))

        // El backend hace commit antes de fallar: el mensaje del usuario y los
        // turnos que sí salieron ya están guardados. Los traemos para que se vea
        // hasta dónde llegó el agente. Si el chat era nuevo, su id aparece ahora
        // en la lista y es el único que no conocíamos.
        const rows = await refreshChats()
        const landed = from ?? rows?.find((c) => !knownIds.has(c.id))?.id ?? null
        if (landed) {
          if (from !== landed) navigate(`/chat/${landed}`, { replace: true })
          void loadDetail(landed)
        }
        return false
      } finally {
        setPending(null)
      }
    },
    [chatId, chats, loadDetail, navigate, refreshChats],
  )

  const current = result?.id === chatId ? result : null

  return {
    chats,
    chatsLoading: chats === null && chatsError === null,
    chatsError,
    reloadChats: () => {
      setChats(null)
      setChatsError(null)
      setChatsNonce((n) => n + 1)
    },

    detail: current?.chat ?? null,
    // Hay chat abierto pero todavía no tenemos su respuesta cargada.
    detailLoading: chatId !== null && current === null,
    detailError: current?.error ?? null,
    reloadDetail: () => {
      if (chatId === null) return
      setResult(null)
      void loadDetail(chatId)
    },

    pending,
    sendError,
    send,
  }
}
