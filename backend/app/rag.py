"""Tool local rag_search_magazines: busca fragmentos de las revistas en Nomic Atlas."""

import json
import os

import httpx

from app import llm_pb2
from app.llm_client import get_llm_metadata

NOMIC_API = "https://api-atlas.nomic.ai"
MAX_FRAGMENTOS = 4
MAX_CARACTERES = 1200

FRASE_RECHAZO = "No encontré información suficiente en las revistas proporcionadas."

INSTRUCCIONES = (
    "Responde usando SOLO la información de estos fragmentos, sin agregar datos de tu propio conocimiento. "
    "Cita cada dato con su revista y páginas, por ejemplo: (Traveling 70, págs. 40,41). "
    "Ignora los fragmentos que no tengan que ver con la pregunta. Si al menos uno sirve, aunque sea "
    "parcialmente, responde con lo que diga ese fragmento. Solo si ninguno sirve, responde exactamente: "
    f'"{FRASE_RECHAZO}"'
)

RAG_TOOL = llm_pb2.Tool(
    name="rag_search_magazines",
    description=(
        "Busca información en las revistas de viajes Traveling: destinos, qué ver y hacer, "
        "dónde comer, gastronomía, cultura, naturaleza y alojamientos con encanto. "
        "Úsala para cualquier pregunta o recomendación sobre destinos de viaje. "
        "No sirve para buscar vuelos, reservar hoteles ni consultar el clima."
    ),
    input_schema_json=json.dumps({
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "La pregunta del usuario sobre destinos, en español y con todo su contexto.",
            },
        },
        "required": ["question"],
    }),
)


async def buscar(query: str, k: int = 5) -> list[dict]:
    """Devuelve los k chunks más parecidos a la query."""
    headers = {"Authorization": f"Bearer {os.environ['NOMIC_API_KEY']}"}
    async with httpx.AsyncClient(base_url=NOMIC_API, headers=headers, timeout=20) as client:
        # 1. La query a vector, con el mismo modelo con que se indexaron los chunks
        r = await client.post("/v1/embedding/text", json={
            "texts": [query],
            "model": "gte-multilingual-base",
            "task_type": "search_query",
        })
        r.raise_for_status()
        vector = r.json()["embeddings"][0]

        # 2. Los ids de los chunks más cercanos a ese vector
        r = await client.post("/v1/project/data/get/nearest_neighbors/by_embedding", json={
            "atlas_index_id": os.environ["NOMIC_INDEX_ID"],
            "queries": [vector],
            "k": k,
        })
        r.raise_for_status()
        ids = r.json()["neighbors"][0]
        distancias = r.json()["distances"][0]

        # 3. El contenido de esos chunks (texto, revista, páginas...)
        r = await client.post("/v1/project/data/get", json={
            "project_id": os.environ["NOMIC_PROJECT_ID"],
            "datum_ids": ids,
        })
        r.raise_for_status()
        chunks = {c["id"]: c for c in r.json()["datums"]}

    return [chunks[i] | {"distancia": d} for i, d in zip(ids, distancias)]


PROMPT_DESCOMPONER = """Convierte la pregunta del usuario en entre 1 y 3 búsquedas cortas para un buscador de artículos de revistas de viajes.
Si la pregunta tiene varias partes, haz una búsqueda por cada parte.
Responde SOLO con una lista JSON de strings, por ejemplo: ["restaurantes con vista al atardecer", "miradores para ver el atardecer"]

Pregunta: {pregunta}"""


async def descomponer_pregunta(stub, pregunta: str) -> list[str]:
    request = llm_pb2.GenerateRequest(messages=[
        llm_pb2.Message(role=llm_pb2.Message.USER, text=PROMPT_DESCOMPONER.format(pregunta=pregunta)),
    ])
    response = await stub.Generate(request, metadata=get_llm_metadata(), timeout=30)

    # El modelo a veces envuelve el JSON en ```json ... ```: me quedo solo con lo que está entre [ y ]
    texto = response.text
    try:
        queries = json.loads(texto[texto.find("[") : texto.rfind("]") + 1])
        return queries[:3] or [pregunta]
    except json.JSONDecodeError:
        return [pregunta]


async def rag_search_magazines(stub, pregunta: str) -> dict:
    queries = await descomponer_pregunta(stub, pregunta)

    # Busca cada query y junta los resultados, sin repetir chunks
    encontrados = {}
    for query in queries:
        for chunk in await buscar(query):
            encontrados.setdefault(chunk["id"], chunk)

    mejores = sorted(encontrados.values(), key=lambda c: c["distancia"])[:MAX_FRAGMENTOS]

    return {
        "queries": queries,
        "fragmentos": [
            {
                "revista": f"Traveling {c['issue']}",
                "paginas": c["pages"],
                "encabezados": c["headings"],
                "texto": c["text"][:MAX_CARACTERES],
            }
            for c in mejores
        ],
        "instrucciones": INSTRUCCIONES,
    }
