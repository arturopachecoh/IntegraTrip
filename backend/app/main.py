import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_provider_config
from app.routers import auth, mcp, me

app = FastAPI()

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
