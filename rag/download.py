"""Descarga las revistas elegidas a la carpeta pdfs/."""

import urllib.request
from pathlib import Path

EDICIONES = [69, 70, 71, 72, 73, 74, 75, 76, 77, 78]
URL = "https://www.tienda-revistatraveling.es/descargas/traveling{}.pdf"

carpeta = Path(__file__).parent / "pdfs"
carpeta.mkdir(exist_ok=True)

for n in EDICIONES:
    destino = carpeta / f"traveling{n}.pdf"
    if destino.exists():
        print(f"{destino.name} ya existe, lo salto")
        continue

    print(f"Descargando {destino.name}...")
    contenido = urllib.request.urlopen(URL.format(n)).read()

    # Algunos links caídos devuelven una página HTML en vez del PDF
    if not contenido.startswith(b"%PDF"):
        print(f"  {destino.name} no es un PDF válido, lo salto")
        continue

    destino.write_bytes(contenido)
