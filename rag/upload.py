"""Sube todos los chunks de parsed/chunks/ a un dataset de Nomic Atlas y lo indexa."""

import json
import os
from pathlib import Path

import nomic
from dotenv import load_dotenv
from nomic import AtlasDataset

DATASET = "traveling-rag"
BATCH_SIZE = 500

carpeta = Path(__file__).parent
load_dotenv(carpeta / ".env")
nomic.login(os.environ["NOMIC_API_KEY"])

filas = []
for archivo in sorted((carpeta / "parsed" / "chunks").glob("*.jsonl")):
    with open(archivo, encoding="utf-8") as f:
        filas += [json.loads(linea) for linea in f]
print(f"{len(filas)} chunks leídos")

dataset = AtlasDataset(DATASET, unique_id_field="id", is_public=True)

for inicio in range(0, len(filas), BATCH_SIZE):
    batch = filas[inicio : inicio + BATCH_SIZE]
    dataset.add_data(data=batch)
    print(f"subidos {inicio + len(batch)}/{len(filas)}")

dataset.create_index(
    indexed_field="text",
    embedding_model="gte-multilingual-base",
)
print(f"dataset {dataset.identifier} id={dataset.id} points={dataset.total_datums}")
