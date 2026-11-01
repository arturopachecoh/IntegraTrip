"""Convierte cada PDF de pdfs/ en un archivo jsonl de chunks en parsed/chunks/."""

import json
from pathlib import Path

from docling.chunking import HybridChunker
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
from transformers import AutoTokenizer

MAX_TOKENS = 768
TOKENIZER = "sentence-transformers/all-MiniLM-L6-v2"

carpeta = Path(__file__).parent
salida = carpeta / "parsed" / "chunks"
salida.mkdir(parents=True, exist_ok=True)

# Los PDF ya traen texto, así que no hace falta OCR
opciones = PdfPipelineOptions(do_ocr=False)
converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opciones)}
)
chunker = HybridChunker(
    tokenizer=HuggingFaceTokenizer(
        tokenizer=AutoTokenizer.from_pretrained(TOKENIZER),
        max_tokens=MAX_TOKENS,
    )
)

for pdf in sorted((carpeta / "pdfs").glob("traveling*.pdf")):
    nombre = pdf.stem  # ej: "traveling76"
    archivo_jsonl = salida / f"{nombre}.jsonl"
    if archivo_jsonl.exists():
        print(f"{nombre} ya está parseado, lo salto")
        continue

    print(f"Parseando {pdf.name}...")
    documento = converter.convert(pdf).document

    lineas = []
    for i, chunk in enumerate(chunker.chunk(documento)):
        paginas = sorted({p.page_no for item in chunk.meta.doc_items for p in item.prov})
        fila = {
            "id": f"{nombre}:{i:05d}",
            "text": chunker.contextualize(chunk),  # el texto con su encabezado adelante
            "source": pdf.name,
            "issue": int(nombre.replace("traveling", "")),
            "headings": " > ".join(chunk.meta.headings or []),
            "pages": ",".join(str(p) for p in paginas),
        }
        lineas.append(json.dumps(fila, ensure_ascii=False))

    archivo_jsonl.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"  {len(lineas)} chunks guardados en {archivo_jsonl.name}")
