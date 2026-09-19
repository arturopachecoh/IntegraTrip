"""Endpoint de prueba: UN SOLO turno de Generate, sin loop todavía.
Objetivo: validar que BD + catálogo de tools + cliente gRPC están bien
cableados entre sí, antes de meter la complejidad del loop de varios turnos.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import llm_pb2
from app.db import get_db
from app.dependencies import get_current_user, get_llm_stub
from app.llm_client import get_llm_metadata
from app.llm_pb2_grpc import LlmStub
from app.models import Chat, Message, ToolCall, User
from app.obtener_tools_llm import obtener_tools_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])


class MessageIn(BaseModel):
    chat_id: uuid.UUID | None = None  # None => chat nuevo
    text: str


async def get_or_create_chat(db: AsyncSession, *, chat_id: uuid.UUID | None, user_id: uuid.UUID) -> Chat:
    if chat_id is None:
        chat = Chat(user_id=user_id)
        db.add(chat)
        await db.flush()  # para obtener chat.id sin hacer commit todavía
        return chat

    chat = await db.get(Chat, chat_id)
    if chat is None or chat.user_id != user_id:
        raise HTTPException(status_code=404, detail="chat not found")
    return chat


async def load_history(db: AsyncSession, chat_id: uuid.UUID) -> list[llm_pb2.Message]:
    """Reconstruye el historial como mensajes proto. Por ahora solo texto (USER/MODEL) —
    reconstruir function_calls/function_results de TOOL queda para cuando exista el loop."""
    stmt = select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    messages = (await db.execute(stmt)).scalars().all()
    return [llm_pb2.Message(role=getattr(llm_pb2.Message, m.role), text=m.text or "") for m in messages]


@router.post("/chats/messages")
async def send_message(
    body: MessageIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    stub: LlmStub = Depends(get_llm_stub),
):
    chat = await get_or_create_chat(db, chat_id=body.chat_id, user_id=user.id)
    history = await load_history(db, chat.id)
    catalog, _tool_registry = await obtener_tools_llm(db, user.id)

    db.add(Message(chat_id=chat.id, role="USER", text=body.text))
    await db.flush()
    history.append(llm_pb2.Message(role=llm_pb2.Message.USER, text=body.text))

    generate_request = llm_pb2.GenerateRequest(messages=history, tools=catalog)
    response = await stub.Generate(generate_request, metadata=get_llm_metadata(), timeout=30)

    model_message = Message(chat_id=chat.id, role="MODEL", text=response.text or None)
    db.add(model_message)
    await db.flush()

    for fc in response.function_calls:
        db.add(
            ToolCall(
                message_id=model_message.id,
                tool_name=fc.name,
                arguments_json=json.loads(fc.arguments_json),
                external_id=fc.id,
            )
        )

    await db.commit()

    return {
        "chat_id": str(chat.id),
        "text": response.text,
        "stop": response.stop,
        "function_calls": [
            {"id": fc.id, "name": fc.name, "arguments": json.loads(fc.arguments_json)}
            for fc in response.function_calls
        ],
    }
