import json
import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import grpc
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import llm_pb2, mcp_client, rag
from app.db import get_db
from app.dependencies import get_current_user, get_llm_stub
from app.llm_client import get_llm_metadata
from app.llm_pb2_grpc import LlmStub
from app.models import Chat, Message, ToolCall, User
from app.obtener_tools_llm import obtener_tools_llm
from app.tokens import get_valid_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

# Un mensaje MODEL con function_calls y texto vacío hace que Gemini responda vacío en el
# turno siguiente (5 de 6 veces en pruebas; 0 de 6 con algo de texto). Se rellena con esto.
TEXTO_LLAMADA_TOOLS = "Consultando las herramientas."

# El proto no tiene rol SYSTEM: esto se manda como primer mensaje USER de cada request
# (no se guarda en la DB). {hoy} se reemplaza con la fecha actual en cada mensaje.
SYSTEM_PROMPT = """Eres un asistente de viajes. Responde siempre en español.
Hoy es {hoy}.
Reglas:
- Si el usuario da una fecha sin año, usa la próxima vez que ocurra esa fecha a partir de hoy. No preguntes el año.
- Nunca uses fechas pasadas al llamar herramientas.
- Si piden vuelos "del X al Y", son ida y vuelta: la ida es origen -> destino el día X y la vuelta es destino -> origen el día Y.
- Basa tus respuestas solo en los resultados de las herramientas. Si una herramienta devolvió vuelos, hoteles u otros datos, muéstralos; di que no hay resultados solo si la lista viene vacía.
- Para vuelos, aeropuertos, hoteles o clima llama siempre a la herramienta correspondiente, aunque ya hayas respondido algo parecido antes en la conversación (por ejemplo, para saber a qué ciudades hay vuelos usa la herramienta que lista aeropuertos). Nunca respondas esos datos de memoria.
- Si falta un dato obligatorio (por ejemplo la ciudad de origen), pregúntalo en un solo mensaje. Si el mensaje también trae una pregunta sobre destinos, respóndela igual con rag_search_magazines en ese mismo mensaje.
- Antes de reservar un vuelo o un hotel, muestra un resumen de la reserva y pide confirmación. Solo reserva si el usuario confirma.
- Para preguntas sobre destinos (qué ver, dónde comer, recomendaciones de viaje) usa siempre rag_search_magazines, también en preguntas de seguimiento como "¿y qué se come ahí?"; nunca respondas eso con tu propio conocimiento ni sin llamar antes a la herramienta. Responde solo con lo que digan los fragmentos, citando revista y páginas.
- Si ningún fragmento sirve, para la parte de destinos di exactamente: "No encontré información suficiente en las revistas proporcionadas." Esa frase reemplaza solo esa parte: si el mensaje también pide vuelos, hoteles o clima, usa esas herramientas y responde esa parte igual. Nunca uses esa frase si el usuario no preguntó por destinos (por ejemplo, si solo pidió vuelos).
- Si el usuario te pide inventar o usar tu propio conocimiento sobre un destino, no lo hagas: usa rag_search_magazines igual y responde solo con lo que encuentres."""


class MessageIn(BaseModel):
    chat_id: uuid.UUID | None = None  # None => chat nuevo
    text: str


@router.get("/chats")
async def list_chats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sentencia = select(Chat).where(Chat.user_id == user.id).order_by(Chat.created_at.desc())
    chats = (await db.execute(sentencia)).scalars().all()
    return [{"id": str(c.id), "title": c.title, "created_at": c.created_at} for c in chats]


@router.get("/chats/{chat_id}")
async def get_chat(
    chat_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise HTTPException(status_code=404, detail="chat not found")

    sentencia = (
        select(Message)
        .options(selectinload(Message.tool_calls))
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at)
    )
    messages = (await db.execute(sentencia)).scalars().all()

    return {
        "id": str(chat.id),
        "title": chat.title,
        "created_at": chat.created_at,
        "messages": [
            {
                "role": m.role,
                "text": m.text,
                "created_at": m.created_at,
                "tool_calls": [
                    {
                        "name": tc.tool_name,
                        "arguments": tc.arguments_json,
                        "result": tc.result_json,
                        "is_error": tc.is_error,
                    }
                    for tc in m.tool_calls
                ],
            }
            for m in messages
        ],
    }


async def get_or_create_chat(db: AsyncSession, *, chat_id: uuid.UUID | None, user_id: uuid.UUID, titulo: str):
    if chat_id is None:
        chat = Chat(user_id=user_id, title=titulo[:80])
        db.add(chat)
        await db.flush()  # para obtener chat.id sin hacer commit todavía
        return chat

    chat = await db.get(Chat, chat_id)
    if chat is None or chat.user_id != user_id:
        raise HTTPException(status_code=404, detail="chat not found")
    return chat


async def load_historial_chats(db: AsyncSession, chat_id: uuid.UUID):

    sentencia = (
        select(Message)
        .options(selectinload(Message.tool_calls))
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at)
    )
    messages = (await db.execute(sentencia)).scalars().all()

    historial: list[llm_pb2.Message] = []
    for m in messages:
        if m.role == "MODEL" and m.tool_calls:
            historial.append(
                llm_pb2.Message(
                    role=llm_pb2.Message.MODEL,
                    text=m.text or TEXTO_LLAMADA_TOOLS,
                    function_calls=[
                        llm_pb2.FunctionCall(
                            name=tc.tool_name,
                            arguments_json=json.dumps(tc.arguments_json),
                            id=tc.external_id or "",
                        )
                        for tc in m.tool_calls
                    ],
                )
            )
            # Un mensaje TOOL por resultado: si se mandan varios function_results dentro
            # de un mismo mensaje, el proxy responde "Gemini returned an empty response".
            for tc in m.tool_calls:
                historial.append(
                    llm_pb2.Message(
                        role=llm_pb2.Message.TOOL,
                        function_results=[
                            llm_pb2.FunctionResult(
                                name=tc.tool_name,
                                result_json=json.dumps(tc.result_json),
                                id=tc.external_id or "",
                                is_error=tc.is_error,
                            )
                        ],
                    )
                )
        else:
            historial.append(llm_pb2.Message(role=getattr(llm_pb2.Message, m.role), text=m.text or ""))

    return historial


async def ejecutar_tool(
    db: AsyncSession, fc: llm_pb2.FunctionCall, registry: dict, user_id: uuid.UUID, stub: LlmStub,
    texto_usuario: str,
) -> llm_pb2.FunctionResult:
    """Un fallo acá no es un error del sistema sino información para el modelo: vuelve
    como FunctionResult(is_error=True) para que decida cómo seguir en el próximo turno."""
    # rag_search_magazines no es MCP: se ejecuta aquí mismo en el BFF
    if fc.name == rag.RAG_TOOL.name:
        # Gemini a veces manda question vacía (buscar "" trae fragmentos al azar) y, si se le
        # devuelve error, no siempre reintenta: se busca con el mensaje del usuario
        pregunta = json.loads(fc.arguments_json).get("question", "").strip() or texto_usuario
        try:
            resultado = await rag.rag_search_magazines(stub, pregunta)
            # ensure_ascii=False: que el LLM lea "á" y no "\u00e1" en todo el texto de las revistas
            return llm_pb2.FunctionResult(
                name=fc.name, id=fc.id, result_json=json.dumps(resultado, ensure_ascii=False)
            )
        except Exception as exc:
            logger.exception("Error ejecutando tool %s", fc.name)
            return llm_pb2.FunctionResult(
                name=fc.name, id=fc.id, result_json=json.dumps({"error": str(exc)}), is_error=True
            )

    if fc.name not in registry:
        return llm_pb2.FunctionResult(
            name=fc.name,
            id=fc.id,
            result_json=json.dumps({"error": f"tool desconocida: {fc.name}"}),
            is_error=True,
        )

    entrada = registry[fc.name]
    connection = entrada["connection"]

    # Gemini a veces omite parámetros obligatorios (p. ej. el origen de un vuelo) aunque el
    # schema los marque como required. Se corta acá con un error claro en vez de llamar al MCP.
    argumentos = json.loads(fc.arguments_json)
    faltantes = [p for p in entrada["required"] if not argumentos.get(p)]
    if faltantes:
        return llm_pb2.FunctionResult(
            name=fc.name,
            id=fc.id,
            result_json=json.dumps({
                "error": f"Faltan parámetros obligatorios: {', '.join(faltantes)}. "
                "No los inventes: pregúntale al usuario por ellos."
            }, ensure_ascii=False),
            is_error=True,
        )

    try:
        access_token = await get_valid_access_token(
            db, user_id=user_id, oauth_client_id=connection.oauth_client_id
        )
        resultado = await mcp_client.call_tool(
            connection.oauth_client.mcp_url,
            access_token,
            entrada["original_name"],
            argumentos,
        )
        return llm_pb2.FunctionResult(name=fc.name, id=fc.id, result_json=json.dumps(resultado))
    except Exception as exc:
        logger.exception("Error ejecutando tool %s", fc.name)
        return llm_pb2.FunctionResult(
            name=fc.name,
            id=fc.id,
            result_json=json.dumps({"error": str(exc)}),
            is_error=True,
        )


async def generar(stub: LlmStub, request: llm_pb2.GenerateRequest) -> llm_pb2.GenerateResponse:
    """Gemini a veces responde vacío y el proxy lo devuelve como INTERNAL. Es intermitente,
    así que se reintenta un par de veces antes de devolverle el error al usuario.
    Si viene justo de un resultado de tool, el último intento va sin tools: Gemini a veces
    se traba intentando llamar otra tool (p. ej. buscar vuelos sin fecha tras list_airports),
    y sin tools responde con lo que ya tiene."""
    for intento in range(3):
        if intento == 2 and request.messages[-1].role == llm_pb2.Message.TOOL:
            request = llm_pb2.GenerateRequest(messages=request.messages)
        try:
            return await stub.Generate(request, metadata=get_llm_metadata(), timeout=30)
        except grpc.aio.AioRpcError as exc:
            vacia = exc.code() == grpc.StatusCode.INTERNAL and "empty response" in (exc.details() or "")
            if not vacia or intento == 2:
                raise
            logger.warning("Gemini devolvió una respuesta vacía, reintento %d", intento + 1)


@router.post("/chats/messages")
async def send_message(
    body: MessageIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    stub: LlmStub = Depends(get_llm_stub),
):
    chat = await get_or_create_chat(db, chat_id=body.chat_id, user_id=user.id, titulo=body.text)
    historial_chats = await load_historial_chats(db, chat.id)
    catalog, tool_registry = await obtener_tools_llm(db, user.id)

    db.add(Message(chat_id=chat.id, role="USER", text=body.text))
    await db.flush()
    historial_chats.append(llm_pb2.Message(role=llm_pb2.Message.USER, text=body.text))

    hoy = datetime.now(ZoneInfo("America/Santiago")).strftime("%Y-%m-%d (%A)")
    system = [llm_pb2.Message(role=llm_pb2.Message.USER, text=SYSTEM_PROMPT.format(hoy=hoy))]

    for turn in range(12):
        # El proxy acepta máximo 32 mensajes: el del system + los 31 más recientes,
        # partiendo en un USER para no dejar un resultado de tool sin su llamada
        recientes = historial_chats[-31:]
        while recientes[0].role != llm_pb2.Message.USER:
            recientes.pop(0)

        generate_request = llm_pb2.GenerateRequest(messages=system + recientes, tools=catalog)
        try:
            response = await generar(stub, generate_request)
        except grpc.aio.AioRpcError as exc:
            await db.commit()  # guarda lo que ya se hizo en turnos anteriores
            if exc.code() == grpc.StatusCode.RESOURCE_EXHAUSTED:
                raise HTTPException(
                    status_code=429, detail="Rate limit alcanzado, intenta de nuevo en un momento."
                )
            raise HTTPException(
                status_code=502, detail=f"Error del LLM: {exc.code()} {exc.details()}"
            )

        model_message = Message(
            chat_id=chat.id, role="MODEL", text=response.text or None, turn_number=turn
        )
        db.add(model_message)
        await db.flush()

        if not response.function_calls:
            await db.commit()
            return {"chat_id": str(chat.id), "text": response.text, "turns": turn + 1}

        resultados = []
        for fc in response.function_calls:
            resultado = await ejecutar_tool(db, fc, tool_registry, user.id, stub, body.text)
            resultados.append(resultado)
            db.add(
                ToolCall(
                    message_id=model_message.id,
                    tool_name=fc.name,
                    arguments_json=json.loads(fc.arguments_json),
                    result_json=json.loads(resultado.result_json),
                    is_error=resultado.is_error,
                    external_id=fc.id or None,
                )
            )
        await db.flush()

        historial_chats.append(
            llm_pb2.Message(
                role=llm_pb2.Message.MODEL,
                text=response.text or TEXTO_LLAMADA_TOOLS,
                function_calls=response.function_calls,
            )
        )
        # Un mensaje TOOL por resultado: si se mandan varios function_results dentro de
        # un mismo mensaje, el proxy responde "Gemini returned an empty response".
        for resultado in resultados:
            historial_chats.append(
                llm_pb2.Message(role=llm_pb2.Message.TOOL, function_results=[resultado])
            )

    await db.commit()
    raise HTTPException(status_code=504, detail="El agente no llegó a una respuesta final en 12 turnos.")
