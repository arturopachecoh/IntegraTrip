import os

import grpc

from app.llm_pb2_grpc import LlmStub


def create_llm_channel() -> grpc.aio.Channel:
    credentials = grpc.ssl_channel_credentials()
    return grpc.aio.secure_channel(os.environ["LLM_GRPC_TARGET"], credentials)


def create_llm_stub(channel: grpc.aio.Channel) -> LlmStub:
    return LlmStub(channel)


def get_llm_metadata() -> list[tuple[str, str]]:
    return [
        ("x-student-email", os.environ["STUDENT_EMAIL"]),
        ("x-student-id", os.environ["STUDENT_ID"]),
    ]
