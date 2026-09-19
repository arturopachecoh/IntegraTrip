import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_provider_config
from app.llm_client import create_llm_channel, create_llm_stub
from app.routers import auth, chat, mcp, me


@asynccontextmanager
async def lifespan(app: FastAPI):
    channel = create_llm_channel()
    app.state.llm_stub = create_llm_stub(channel)
    yield
    await channel.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(mcp.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/.well-known/oauth-client-metadata.json")
def oauth_client_metadata():
    cfg = get_provider_config("cielo-sur")
    return {
        "client_id": cfg.client_id,
        "client_name": "IntegraTrip",
        "redirect_uris": [cfg.redirect_uri],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    }
