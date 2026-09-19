"""
Script de prueba mínimo para el LLM proxy (gRPC) de la Tarea 2.
No usa tools todavía: solo prueba conexión + auth + un turno simple.

Requisitos: haber generado llm_pb2.py y llm_pb2_grpc.py en el mismo directorio
(o ajustar el import si los pusiste en otra carpeta).
"""

import grpc

import llm_pb2
import llm_pb2_grpc

# --- Config ---
TARGET = "iic3103-tarea2-llm-z2fqxmm2ja-uc.a.run.app:443"
STUDENT_EMAIL = "aipacheco@uc.cl"   # <-- reemplaza
STUDENT_ID = "23202653"             # <-- reemplaza


def main():
    # Canal seguro (TLS), como indica la landing del servidor (TLS: true)
    credentials = grpc.ssl_channel_credentials()
    channel = grpc.secure_channel(TARGET, credentials)
    stub = llm_pb2_grpc.LlmStub(channel)

    # Tool dummy: no existe de verdad, solo queremos ver cómo pide usarla el modelo
    weather_tool = llm_pb2.Tool(
        name="get_weather",
        description="Devuelve el clima actual de una ciudad dada.",
        input_schema_json=(
            '{"type":"object",'
            '"properties":{"city":{"type":"string","description":"Nombre de la ciudad"}},'
            '"required":["city"]}'
        ),
    )

    # Pregunta que debería forzar al modelo a pedir la tool en vez de responder directo
    user_message = llm_pb2.Message(
        role=llm_pb2.Message.USER,
        text="¿Cuál es el clima actual en Cancún?",
    )

    request = llm_pb2.GenerateRequest(
        messages=[user_message],
        tools=[weather_tool],
    )

    metadata = [
        ("x-student-email", STUDENT_EMAIL),
        ("x-student-id", STUDENT_ID),
    ]

    try:
        response = stub.Generate(request, metadata=metadata, timeout=30)
    except grpc.RpcError as e:
        print(f"Error gRPC: código={e.code()} detalle={e.details()}")
        return

    print("--- Respuesta cruda ---")
    print(response)

    print("\n--- Campos clave ---")
    print(f"text: {response.text!r}")
    print(f"stop: {response.stop}")
    print(f"function_calls (raw): {list(response.function_calls)}")

    if response.function_calls:
        print("\n--- Detalle de cada function_call ---")
        for fc in response.function_calls:
            print(f"id: {fc.id!r}")
            print(f"name: {fc.name!r}")
            print(f"arguments_json (string): {fc.arguments_json!r}")

            import json
            parsed_args = json.loads(fc.arguments_json)
            print(f"arguments_json parseado (dict): {parsed_args}")

    print(f"model: {response.model}")
    print(f"latency_ms: {response.latency_ms}")
    if response.usage:
        print(f"usage: prompt={response.usage.prompt_tokens} "
              f"completion={response.usage.completion_tokens} "
              f"total={response.usage.total_tokens}")


if __name__ == "__main__":
    main()