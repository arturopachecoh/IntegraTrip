import os

import grpc

from app.llm_pb2_grpc import LlmStub


def create_llm_channel() -> grpc.aio.Channel:
    credentials = grpc.ssl_channel_credentials()
    # Sin esto, algunas plataformas (Render incluida) hacen que grpc intente
    # tunelear la conexión HTTP/2 a través de un proxy HTTP detectado por env
    # vars (HTTP_PROXY/HTTPS_PROXY), que no sabe hablar gRPC y responde 404
    # -> "UNIMPLEMENTED: Received http2 header with status: 404".
    options = [("grpc.enable_http_proxy", 0)]
    return grpc.aio.secure_channel(os.environ["LLM_GRPC_TARGET"], credentials, options=options)


def create_llm_stub(channel: grpc.aio.Channel) -> LlmStub:
    return LlmStub(channel)


def get_llm_metadata() -> list[tuple[str, str]]:
    return [
        ("x-student-email", os.environ["STUDENT_EMAIL"]),
        ("x-student-id", os.environ["STUDENT_ID"]),
    ]
