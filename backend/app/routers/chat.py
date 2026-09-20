import json
import logging
import uuid

import grpc
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import llm_pb2, mcp_client
from app.db import get_db
from app.dependencies import get_current_user, get_llm_stub
from app.llm_client import get_llm_metadata
from app.llm_pb2_grpc import LlmStub
from app.models import Chat, Message, ToolCall, User
from app.obtener_tools_llm import obtener_tools_llm
from app.tokens import get_valid_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


class MessageIn(BaseModel):
    chat_id: uuid.UUID | None = None  # None => chat nuevo
    text: str


async def get_or_create_chat(db: AsyncSession, *, chat_id: uuid.UUID | None, user_id: uuid.UUID):
    if chat_id is None:
        chat = Chat(user_id=user_id)
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
                    text=m.text or "",
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
                        for tc in m.tool_calls
                    ],
                )
            )
        else:
            historial.append(llm_pb2.Message(role=getattr(llm_pb2.Message, m.role), text=m.text or ""))

    return historial


async def ejecutar_tool(
    db: AsyncSession, fc: llm_pb2.FunctionCall, registry: dict, user_id: uuid.UUID
) -> llm_pb2.FunctionResult:
    """Un fallo acá no es un error del sistema sino información para el modelo: vuelve
    como FunctionResult(is_error=True) para que decida cómo seguir en el próximo turno."""
    if fc.name not in registry:
        return llm_pb2.FunctionResult(
            name=fc.name,
            id=fc.id,
            result_json=json.dumps({"error": f"tool desconocida: {fc.name}"}),
            is_error=True,
        )

    entrada = registry[fc.name]
    connection = entrada["connection"]
    try:
        access_token = await get_valid_access_token(
            db, user_id=user_id, oauth_client_id=connection.oauth_client_id
        )
        resultado = await mcp_client.call_tool(
            connection.oauth_client.mcp_url,
            access_token,
            entrada["original_name"],
            json.loads(fc.arguments_json),
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


@router.post("/chats/messages")
async def send_message(
    body: MessageIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    stub: LlmStub = Depends(get_llm_stub),
):
    chat = await get_or_create_chat(db, chat_id=body.chat_id, user_id=user.id)
    historial_chats = await load_historial_chats(db, chat.id)
    catalog, tool_registry = await obtener_tools_llm(db, user.id)

    db.add(Message(chat_id=chat.id, role="USER", text=body.text))
    await db.flush()
    historial_chats.append(llm_pb2.Message(role=llm_pb2.Message.USER, text=body.text))

    for turn in range(12):
        generate_request = llm_pb2.GenerateRequest(messages=historial_chats, tools=catalog)
        try:
            response = await stub.Generate(generate_request, metadata=get_llm_metadata(), timeout=30)
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
            resultado = await ejecutar_tool(db, fc, tool_registry, user.id)
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
                role=llm_pb2.Message.MODEL, text=response.text, function_calls=response.function_calls
            )
        )
        historial_chats.append(
            llm_pb2.Message(role=llm_pb2.Message.TOOL, function_results=resultados)
        )

    await db.commit()
    raise HTTPException(status_code=504, detail="El agente no llegó a una respuesta final en 12 turnos.")
