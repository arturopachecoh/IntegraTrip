# Chat Log — Entrega 2

Registro resumido de las conversaciones con Claude Code durante la Tarea 2 (agente de IA con MCP tools).

---

## Sesión 1 — Backend: BD, gRPC y loop del agente (16 al 21 de septiembre)

### Dudas teóricas

**2026-09-16 — Usuario**
¿En qué momento uno sabe qué parámetros necesita la tool que quiero llamar?

**2026-09-16 — Asistente**
Se sabe al llamar `list_tools()` en `mcp_client.py`. Cada tool trae `name`, `description` e `inputSchema` (JSON Schema), y ese schema es el contrato: qué parámetros acepta, cuáles son obligatorios y de qué tipo. Es lo mismo que después se le pasa al LLM en el catálogo.

**2026-09-18 — Usuario**
¿Cómo agrego nuevas tablas a mi BD? Si aplico la migración ahora, ¿podría afectar mi BD? Tengo en el `.env` el link de producción.

**2026-09-18 — Asistente**
El flujo es definir la clase en `models.py`, correr `alembic revision --autogenerate` y luego `alembic upgrade head`. El primero solo lee la BD para generar el archivo; el segundo sí escribe. Como las tablas eran nuevas, solo se agregarían `create_table`, pero recomendó probar primero contra una BD local (Postgres de brew, `createdb integratrip_dev`) para no tocar producción.

**2026-09-18 — Usuario**
¿Por qué tengo dos venv?

**2026-09-18 — Asistente**
`.venv` es el que creó uv (con todas las dependencias) y `venv` era un intento manual anterior que quedó vacío. Además `venv` no estaba en `.gitignore`. Con mi confirmación lo borró.

**2026-09-18 — Usuario**
Quiero crear el canal gRPC una sola vez al arrancar FastAPI y reutilizarlo entre requests. ¿Cómo se hace?

**2026-09-18 — Asistente**
Con el `lifespan` de FastAPI: lo que está antes del `yield` corre una vez al arrancar (crear el canal y el stub, guardarlos en `app.state`) y lo que está después corre al apagar (cerrar el canal). Explicó que `protobuf` es la librería que serializa los mensajes definidos en el `.proto`.

**2026-09-19 — Usuario**
¿Qué es el LLM stub? ¿Le tengo que pasar la request a la función? ¿Cómo sabe `get_current_user` qué usuario es?

**2026-09-19 — Asistente**
- **Stub:** es el cliente que gRPC genera a partir del `.proto`. Permite llamar a `Generate(...)` como si fuera una función local.
- **La request:** no se pasa a mano; FastAPI la inyecta automáticamente por el sistema de `Depends`, mirando la firma de la función.
- **El usuario:** al hacer login, el backend manda una cookie con un JWT firmado que contiene el `user.id`. `get_current_user` lee esa cookie, verifica la firma y busca el usuario en la BD.

**2026-09-19 — Usuario**
¿Estoy usando `grpc` o `grpc.aio`? ¿El acceso a la BD también es async?

**2026-09-19 — Asistente**
Se usa `grpc.aio`, la variante async, porque toda la app es async (FastAPI, SQLAlchemy, `mcp_client`). Un canal síncrono bloquearía el event loop. La BD también es async: `create_async_engine` con el driver `asyncpg`.

**2026-09-19 — Usuario**
¿Qué es el logger? ¿Y la clase `MessageIn`?

**2026-09-19 — Asistente**
- **`logger`:** el objeto del módulo estándar `logging` para escribir mensajes de diagnóstico. `getLogger(__name__)` crea uno con el nombre del módulo.
- **`MessageIn`:** el schema de Pydantic del body del `POST`. Valida el JSON que llega (`chat_id` opcional y `text`). No es la tabla `Message` de la BD.

**2026-09-19 — Usuario**
Lo de `build_tool_catalog`, ¿no lo tengo ya en `obtener_tools_llm`?

**2026-09-19 — Asistente**
Sí, era la misma idea. Mi `obtener_tools_llm.py` además arma un registry `nombre_prefijado → {connection, original_name}`, necesario para saber a qué MCP llamar cuando el modelo pide una tool. Reemplazó la lógica duplicada para usar esa función.

**2026-09-20 — Usuario**
Explícame `db.flush`, qué hace.

**2026-09-20 — Asistente**
`flush()` manda a la BD los `INSERT`/`UPDATE` pendientes sin cerrar la transacción; `commit()` además los confirma de forma permanente. Se usa `flush` para obtener el `chat.id` generado antes de crear los mensajes que lo referencian, sin confirmar todavía.

**2026-09-20 — Usuario**
Explícame `load_historial_chats`, que creció mucho.

**2026-09-20 — Asistente**
Ahora es un traductor entre dos formas de representar la conversación. En la BD, un turno con tools es un `Message` MODEL con sus `tool_calls` colgando. El modelo espera una lista plana con un mensaje MODEL (con `function_calls`) seguido de los mensajes TOOL (con `function_results`). La función arma esos mensajes a partir de lo guardado.

**2026-09-20 — Usuario**
¿Por qué `ejecutar_tool` no reutiliza lo que ya usaba antes para ejecutar tools?

**2026-09-20 — Asistente**
Sí reutiliza las piezas importantes: `get_valid_access_token` y `mcp_client.call_tool`. Lo que no se reutiliza es el endpoint de `mcp.py`, porque su contrato de error es el opuesto: el endpoint lanza HTTP errors, mientras que en el loop un fallo tiene que volver al modelo como información.

**2026-09-20 — Usuario**
¿El loop solo para si no recibe function calls? ¿Y si el modelo hace una pregunta?

**2026-09-20 — Asistente**
Una pregunta del modelo es justamente una respuesta de texto sin `function_calls`. El loop termina, se guarda y se muestra la pregunta. Cuando el usuario responde con el mismo `chat_id`, el historial se reconstruye y el agente continúa.

**2026-09-20 — Usuario**
¿Cómo sabe FastAPI que mi `body` es el body del endpoint?

**2026-09-20 — Asistente**
No es por el nombre sino por el tipo. Si el parámetro es un modelo de Pydantic, es el body JSON; un tipo simple que aparece en la ruta es path param; si no aparece, es query param; y lo que tiene `Depends(...)` es una dependencia.

### Debugging

**2026-09-18 — Usuario**
`alembic: command not found`, y con `python3 -m alembic` tampoco funciona.

**2026-09-18 — Asistente**
Estaba usando el venv equivocado. Alembic estaba instalado en `.venv`, así que hay que usar `.venv/bin/alembic` o `uv run`.

**2026-09-18 — Usuario**
Corrí `\dt` y no aparecen las tablas nuevas.

**2026-09-18 — Asistente**
Solo se había generado el archivo de migración, faltaba aplicarlo. Corrió `alembic upgrade head` y verificó que quedaran las 6 tablas.

**2026-09-18 — Asistente (hallazgo)**
Al armar el canal gRPC encontró que `grpcio`/`protobuf` no estaban en `pyproject.toml` (solo estaban instalados en el venv borrado) y que el import de `llm_pb2_grpc.py` fallaba al usarlo como paquete. Agregó las dependencias y lo arregló con un import relativo.

**2026-09-19 — Usuario**
¿Tengo que subir el nuevo backend a producción para probar?

**2026-09-19 — Asistente**
Sí: la cookie de sesión es `secure=True`, así que solo funciona por HTTPS, y Render solo redespliega con código nuevo y no lee el `.env` local.

**2026-09-19 — Usuario**
El deploy en Render falló al arrancar.

**2026-09-19 — Asistente**
Faltaban las variables de entorno nuevas (`LLM_GRPC_TARGET`, `STUDENT_EMAIL`, `STUDENT_ID`) en el dashboard de Render.

**2026-09-19 — Usuario**
Probando desde la consola del navegador: 401 `not authenticated`. Por link directo sí funciona.

**2026-09-19 — Asistente**
El navegador no manda la cookie en un `fetch` cross-site desde la consola. Sugirió probar con curl mandando la cookie a mano. Más tarde confirmé que en la app real las cookies sí viajan bien, así que era solo una rareza de esa prueba.

**2026-09-19 — Usuario**
Con curl: `Internal Server Error`. En los logs: `UNIMPLEMENTED: Received http2 header with status: 404`.

**2026-09-19 — Asistente**
Primero sospechó del proxy HTTP de Render y desactivó el proxy en gRPC, pero el error siguió igual (diagnóstico equivocado). Después probó el mismo código localmente, en versión sync y async, y funcionó. Concluyó que la diferencia estaba en Render y pidió revisar el valor de `LLM_GRPC_TARGET`.

**2026-09-19 — Usuario**
¡Funcionó! Era la variable, estaba mal escrita.

**2026-09-20 — Usuario**
El modelo no llama ninguna tool, responde con texto tipo `tool_code print(flights.search_flights(...))`. ¿No es raro?

**2026-09-20 — Asistente**
Ese patrón aparece cuando el modelo no recibe tools declaradas y "alucina" una llamada en texto. Revisamos: tenía las 3 conexiones, pero los logs mostraban 401 en los 3 MCPs y `obtener_tools_llm` se saltaba el proveedor al primer fallo, así que el catálogo llegaba vacío. Agregó un reintento con refresh forzado del token (igual al que ya tenía `mcp.py`) y el modelo empezó a usar `function_calls` de verdad.

**2026-09-20 — Usuario**
El modelo buscó vuelos para `2023-12-20` en vez de 2026. ¿Me mintió?

**2026-09-20 — Asistente**
Revisó en la BD: reportó fielmente lo que devolvió el MCP, pero había pedido el año equivocado. Como los vuelos se generan por fecha, eran datos de otro día. Se resolvió en la Sesión 2.

**2026-09-20 — Usuario**
StayWell me funciona perfecto desde mi página, pero el asistente decía que estaba caído.

**2026-09-20 — Asistente**
Revisó la BD sin forzar refresh: el token estaba vivo. Era un 401 transitorio del MCP, algo que mi propio código ya contemplaba. Reconoció que su diagnóstico fue apurado; al reintentar salieron las 16 tools.

**2026-09-20 — Usuario**
Con una pregunta que usa dos tools: `Gemini returned an empty response`, dos veces seguidas.

**2026-09-20 — Asistente**
Lo reprodujo localmente probando 4 formas del mismo turno. El proxy falla cuando un solo mensaje TOOL trae varios `function_results`, y funciona con un mensaje TOOL por resultado. Con una sola tool nunca se notaba. Lo arregló en el loop y en `load_historial_chats`.

---

## Sesión 2 — System prompt y límite de mensajes (28 y 29 de septiembre)

**2026-09-28 — Usuario**
Mi agente usa bien los MCP pero pone el año incorrecto (2023 en vez de 2026). Se me ocurrió un mini system prompt que diga que estamos en 2026, o que pregunte el año. ¿Cómo se podría hacer?

**2026-09-28 — Asistente**
Revisó `llm.proto`: no hay rol SYSTEM, solo USER/MODEL/TOOL. Propuso inyectar la fecha actual en lo que se manda al LLM, sin guardarla en la BD, para que se calcule en cada request. Descartó preguntar siempre el año porque sería molesto para el usuario.

**2026-09-28 — Usuario**
Se puso más tonto: preguntó el año igual, buscó la vuelta SCL→MIA y dijo "no hay vuelos" teniendo resultados.

**2026-09-28 — Asistente**
Identificó que el texto era demasiado corto y se habían perdido las instrucciones. Creó `SYSTEM_PROMPT` con la fecha y reglas explícitas: fechas sin año = próxima ocurrencia, la vuelta va de destino a origen, basarse en los resultados de las tools y pedir los datos faltantes en un solo mensaje. También notó que el MCP devolvía horas inválidas (`"12:-44"`), lo que puede confundir al modelo.

**2026-09-28 — Usuario**
Error: `INVALID_ARGUMENT Too many messages (max 32)`.

**2026-09-28 — Asistente**
El proxy acepta máximo 32 mensajes por request, y cada llamada a una tool suma 2 (la llamada y el resultado). Propuso mandar solo los mensajes más recientes.

**2026-09-28 — Usuario**
¿Mandar solo los mensajes más recientes no podría perder la información esencial del primer mensaje?

**2026-09-28 — Asistente**
Sí puede pasar: en un chat largo se cae el primer mensaje, que suele traer el origen y las fechas (el system prompt no se pierde porque va aparte). Propuso compactar los intercambios anteriores dejando solo USER y la respuesta final del MODEL. Elegí quedarme con el approach simple de los últimos mensajes y agregar la regla de confirmación antes de reservar.

**2026-09-29 — Usuario**
Error `Gemini returned an empty response` después de que dos tools de clima respondieron bien.

**2026-09-29 — Asistente**
Falló el paso siguiente: Gemini devolvió vacío al recibir los resultados. Los resultados quedaron guardados en la BD, así que se puede seguir el chat. No se sabe la causa con certeza: puede ser intermitencia de Gemini con tools en paralelo, o el par USER+MODEL recién agregado, ya que un ejemplo con 2 tools funcionaba antes. Propuso probar con un solo mensaje de system prompt; lo cambió (ahora se mandan los 31 más recientes) y no agregó reintento.

