# Chat Log — Entrega 3

Registro resumido de la conversación con Claude Code durante la Tarea 3 (RAG sobre las revistas Traveling con Docling + Nomic Atlas).

## Cómo trabajamos

Desde el primer mensaje definí la forma de trabajo: avanzar **fase por fase** siguiendo un roadmap y conversando cada paso, sin que el agente hiciera todo de una. En la práctica fue así:

- **Pedí ver las propuestas antes de que se escribiera código** ("no escribas todavía, dime qué escribirías por aquí"). Así revisé `rag.py`, la conexión con el loop y las reglas de anclaje antes de aprobarlas.
- **Fijé el estilo:** código simple, corto y fácil de entender ("sin nada tan pro").
- **Corregí decisiones técnicas:** cuestioné el tamaño de chunk de 512 tokens frente a los 700–800 que recomienda el enunciado, y se cambió a 768.
- **Ejecuté y verifiqué yo:** instalé el entorno, corrí el parseo y la subida a Nomic, creé la cuenta y la API key, e hice todos los commits y el push.
- **Probé el agente en la app** con preguntas difíciles, y a partir de lo que falló hice ajustes propios en el código (ver la sección "Pruebas y ajustes").
- **Escribí yo el análisis del dataset**, mirando el mapa de Atlas. El agente solo me dio comentarios de forma y precisión, y lo corregí cuando sugirió agregar conclusiones que no correspondían.

---

## Sesión 1 — Roadmap y preparación (1 de noviembre)

**2026-11-01 — Usuario**
Le pasé el enunciado de la Tarea 3 y le pedí un roadmap explícito para hacer la tarea juntos, paso a paso y conversando.

**2026-11-01 — Asistente**
Revisó el loop de la Tarea 2 (`chat.py`, `obtener_tools_llm.py`, `llm.proto`) y armó un roadmap de 9 fases (0 a 8), cada una con un criterio de "listo cuando". Señaló cuatro cosas del código existente:
- La tool RAG se conecta en dos puntos: el catálogo y `ejecutar_tool`.
- La traza en el chat ya funcionaba, porque `ToolCall` se guarda en la BD.
- El proto no tiene rol SYSTEM, así que las reglas de anclaje deben ir en la descripción de la tool o en su resultado.
- El backend usa Python 3.14 y Docling probablemente no lo soporta, así que propuso una carpeta `rag/` con entorno propio.

**2026-11-01 — Usuario**
Al hacer `git pull` me daba conflicto. Le pedí arreglarlo.

**2026-11-01 — Asistente**
Diagnosticó que los archivos sin trackear eran copias más viejas de lo que ya estaba en el remoto. Comparó archivo por archivo: 19 eran idénticos y `chat.py` era la versión antigua, sin el system prompt. Los movió a un respaldo en vez de borrarlos para que el `git pull` pudiera traer las versiones del remoto.

**2026-11-01 — Usuario**
Antes de crear los scripts de `rag/` (`download.py`, `parse.py`, `upload.py`) le pedí que me explicara qué tendría cada uno, y revisé la estructura propuesta. Después planteé que **yo tenía pensado descargar los PDF a mano**.

**2026-11-01 — Asistente**
Explicó qué haría cada script. Confirmó que descargar a mano era válido, porque el enunciado dice que el script es opcional, y dio recomendaciones para hacerlo: mantener el nombre `travelingNN.pdf` y revisar que cada PDF abra.

**2026-11-01 — Usuario**
Le pedí crear la estructura con **código súper simple, corto y fácil de entender**. Después le pedí también los scripts, siguiendo la estructura que ya habíamos revisado.

**2026-11-01 — Asistente**
Creó `rag/` con su `pyproject.toml` (Python 3.12, `docling`, `nomic`, `python-dotenv`), un `.gitignore` en la raíz (PDFs, `.venv`, `rag/.env`, `.DS_Store`) y los tres scripts. Antes de fijar la lista de ediciones verificó cuáles estaban disponibles: de la 55 a la 78 sí; la 79 y la 80 devolvían HTML. Corrió `download.py` y quedaron las ediciones 69–78.

## Sesión 2 — Parseo y chunk size

**2026-11-01 — Usuario**
**¿Por qué en el parser usamos 512 tokens si el enunciado dice que 700–800 es bueno para RAG?**

**2026-11-01 — Asistente**
Reconoció que su justificación era débil. Había elegido 512 por el límite de entrada de MiniLM, pero en esta tarea MiniLM **solo cuenta tokens para cortar los chunks**; quien vectoriza es `gte-multilingual-base`, que acepta textos mucho más largos. Además, el tokenizer de MiniLM está entrenado en inglés y parte más las palabras en español. Con mi aprobación se cambió a `MAX_TOKENS = 768`.

**2026-11-01 — Usuario**
Instalé el entorno (`uv sync`) y corrí `parse.py` sobre las 10 revistas.

**2026-11-01 — Asistente**
Revisó el resultado:
- 1997 chunks, con un largo mediano de 775 caracteres.
- Todos con páginas, y sin ids repetidos.
- ~10% de chunks muy cortos, que son del staff de la revista, y 104 textos duplicados.

Recomendó no filtrarlos, porque responden justamente las preguntas de exploración sobre duplicados e irrelevantes.

## Sesión 3 — Nomic Atlas

**2026-11-01 — Usuario**
Al entrar a la página de Nomic solo me aparecía un chat, y no encontraba dónde crear el dataset ni sacar la API key (me ofrecía crear un workflow).

**2026-11-01 — Asistente**
Aclaró que lo que necesitábamos de Nomic no era ese chat sino Atlas, la base de datos vectorial con visualizador: los embeddings dejan cerca los textos con significado parecido, y el mapa es una proyección a 2D de esos vectores. Explicó que el dataset lo crea `upload.py`, así que de la web solo hacía falta la key. Para sacarla sugirió `uv run nomic login` o la sección Settings → API Keys, y creó `rag/.env` con un placeholder para que yo pegara la key.

**2026-11-01 — Usuario**
Creé la cuenta, puse la key y corrí `upload.py`.

**2026-11-01 — Asistente**
Verificó el dataset: `arturoph3/traveling-rag`, 1997 puntos (igual a la cantidad de chunks) y el índice ya construido.

## Sesión 4 — Búsqueda en el backend

**2026-11-01 — Usuario**
Pedí seguir con la búsqueda en el backend.

**2026-11-01 — Asistente**
Investigó el cliente `nomic`. Encontró que `embed.text` acepta `gte-multilingual-base` con `task_type="search_query"`, pero que `vector_search` del cliente está desactualizado: manda los vectores en un formato que el servidor rechaza. Probó la misma API por HTTP y funcionó. Propuso usar `httpx` en el backend, por tres razones: el cliente roto, el backend en Python 3.14, y que el enunciado permite HTTP directo.

**2026-11-01 — Usuario**
**"No escribas todavía, dime qué escribirías por aquí a ver."** Le pedí la estructura completa de `rag.py` antes de que escribiera nada.

**2026-11-01 — Asistente**
Mostró la propuesta completa de `app/rag.py` antes de escribirla, con tres funciones:
- `buscar` (3 llamadas a Nomic)
- `descomponer_pregunta` (un Generate sin tools que devuelve 1–3 queries)
- `rag_search_magazines` (sin chunks duplicados, máximo 4 fragmentos, texto recortado)

**2026-11-01 — Usuario**
Revisé la estructura propuesta y la aprobé.

**2026-11-01 — Asistente**
Escribió `rag.py`, agregó las variables `NOMIC_*` al `.env` del backend y lo probó con el LLM real. La pregunta de los atardeceres se descompuso en dos queries y trajo, entre otros, "Point de Vue" y "Vibra Yamm".

## Sesión 5 — Conexión con el loop y anclaje

**2026-11-01 — Usuario**
Pedí ver primero la propuesta para conectar la tool al loop. Revisé los cambios en `chat.py`, `obtener_tools_llm.py` y `mcp.py` antes de aprobarlos.

**2026-11-01 — Asistente**
Hizo cuatro cambios:
- Definió `RAG_TOOL` en `rag.py`.
- La agregó siempre al catálogo en `obtener_tools_llm`.
- Agregó en `ejecutar_tool` una rama local antes del registry de MCP.
- Arregló un bug que él mismo había introducido: el endpoint `/api/tools` de `mcp.py` se habría caído con la tool nueva.

Al probarlo, el LLM llamó la tool solo, pero respondió **sin citar** revista ni páginas.

**2026-11-01 — Usuario**
Revisé y aprobé el enfoque de anclaje antes de implementarlo: instrucciones dentro del resultado de la tool más una regla en el `SYSTEM_PROMPT`.

**2026-11-01 — Asistente**
Antes de proponer un umbral de distancia, midió las distancias de preguntas que sí y que no están en las revistas. Vio que **se cruzan**: "playas de Tailandia", que no está, sale a 0.84, igual que preguntas válidas. Concluyó que un umbral no sirve y que el rechazo debe decidirlo el LLM.

En las pruebas aparecieron dos problemas:
- Las instrucciones eran demasiado estrictas y Galicia se rechazaba. Se relajaron a "si al menos un fragmento sirve, responde con ese".
- La frase de rechazo salía deformada. La causa era que `json.dumps` escapaba las tildes (`\u00e1`), y se resolvió con `ensure_ascii=False`.

**2026-11-01 — Usuario**
Pedí una serie de **preguntas difíciles** para probar el agente en la app.

**2026-11-01 — Asistente**
Contó menciones de destinos en el corpus (Egipto y Croacia 0 veces, Kioto 1) y armó 9 categorías de pruebas:
- control
- rechazo
- trampas de parecido
- tentación de inventar
- compuestas
- seguimiento de contexto
- mixtas con MCP
- casos que no deberían usar la tool
- presión o inyección

## Pruebas y ajustes hechos por mí (1 y 2 de noviembre)

Probé el agente en la app con esas preguntas, ajusté el código según lo que fallaba e hice el deploy en Render.
