# ZoomAgents — investigación y arquitectura

> Objetivo: una sala tipo Zoom donde el humano habla con un equipo de agentes con rol,
> con voz real, y donde los agentes detectan cuándo se les habla.

---

## 1. Proyectos de referencia (GitHub)

### Núcleo de transporte + voz

| Proyecto | Stars | Licencia | Qué aporta |
|---|---|---|---|
| [livekit/agents](https://github.com/livekit/agents) | 15.3k | Apache-2.0 | Framework de agentes en tiempo real sobre WebRTC. Turn detection semántica, barge-in, dispatch, RPC, MCP. |
| [livekit-examples/agent-starter-react](https://github.com/livekit-examples/agent-starter-react) | 968 | MIT | Frontend Next.js con el patrón exacto que necesitamos: participantes, visualizadores de audio, cámara, screen share. |
| [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) | 17.4k | BSD-2 | Pipelines de voz componibles. Multi-agente real: handoff, fan-out en paralelo, sidecars sobre un bus. |
| [TEN-framework/ten-framework](https://github.com/TEN-framework/ten-framework) | 11.2k | custom (revisar) | VAD y turn-detection propios, self-hostables. Útil si no queremos depender de un servicio. |
| [openai/openai-realtime-agents](https://github.com/openai/openai-realtime-agents) | 7.0k | MIT | Patrón **chat-supervisor** y **sequential handoff**: modelo realtime barato conversa, modelo fuerte de texto piensa. |

### Multi-participante (el problema difícil)

| Proyecto | Qué copiar |
|---|---|
| [codealisha99/roundtable](https://github.com/codealisha99/roundtable) | **La joya.** Un agente de voz entra a una llamada de varias personas. `floor manager` como máquina de estados pura, reglas de "¿me están hablando?", gaps medidos (700 ms tras ser nombrado, 1.5 s tras pregunta al grupo, 1.2 s tras solapamiento), barge-in con truncado honesto del texto ya reproducido, log de decisiones. |
| [attenlabs/saa-sdk](https://github.com/attenlabs/saa-sdk) | Detección de destinatario **antes del STT**: habla lateral, TV de fondo y el propio TTS no despiertan al agente. Sin wake word. Drop-in para LiveKit y Pipecat. |
| [kelabome/kelabo](https://github.com/kelabome/kelabo) | Producto de salas con transcripción, minutas, archivo y "tu agente de código en la reunión vía MCP". Su principio de transparencia (todo lo que se dice se transcribe y se ve) es la referencia ética. |
| [dev-dull/mAIndmeld](https://github.com/dev-dull/mAIndmeld), [Bl0omZ/Agora](https://github.com/Bl0omZ/Agora) | Salas multi-agente con moderador, votación y minutas automáticas. Buenos para el modelo de "reunión con agenda". |

### Ejemplos de API realtime

- [google-gemini/gemini-live-api-examples](https://github.com/google-gemini/gemini-live-api-examples) — Gemini Live, audio nativo.
- [livekit-examples/agent-starter-python](https://github.com/livekit-examples/agent-starter-python) — agente Python mínimo.

---

## 2. Lecciones que cambian el diseño

1. **El problema no es la voz 1:1, es el turn-taking multipartito.** Un chat con 12 agentes que hablan a la vez es ruido. Hace falta un *floor manager* con reglas explícitas, no un prompt.
2. **No lances 12 sesiones realtime.** Cada agente con su propia sesión de audio nativo (OpenAI Realtime / Gemini Live) multiplica costo y latencia por 12. La arquitectura correcta es: **un STT compartido → texto a N agentes → N voces TTS**, y solo 1–3 agentes con audio nativo si hace falta.
3. **Los agentes deben oírse entre ellos.** En LiveKit cada agente es un participante más: puede suscribirse al audio de los demás sin lógica extra.
4. **Detección de turno = VAD + modelo semántico + reglas de dirección.** VAD solo no alcanza; "¿esto era para mí?" es una decisión aparte.
5. **Barge-in honesto.** Si interrumpes al agente, la transcripción debe reflejar solo lo que alcanzó a sonar, no lo que iba a decir.
6. **Transparencia por diseño.** Si se graba/transcribe, todos lo ven y se avisa. Es requisito legal en varias jurisdicciones y es buena UX.

---

## 3. Stack recomendado

```
┌──────────────────────────────────────────────────────────────┐
│ Browser: React + livekit-client                              │
│  grid de tiles · micrófono · captions · mute por agente      │
└───────────────┬──────────────────────────────────────────────┘
                │ WebRTC (audio por participante)
┌───────────────▼──────────────────────────────────────────────┐
│ LiveKit room (Cloud o self-host, Apache-2.0)                 │
│  humano + N agentes, cada uno con su track de audio          │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│ Orchestrator (Python, LiveKit Agents)                        │
│  VAD (Silero) → STT (Deepgram) → Floor Manager → Director    │
│  → LLM por agente (Claude / GPT / Gemini) → TTS por voz      │
│  → minutas + action items → MCP / repo                       │
└──────────────────────────────────────────────────────────────┘
```

### Por qué LiveKit y no otra cosa

- **WebRTC de verdad**: jitter buffer, eco, red loss. Reconstruirlo sobre WebSocket es un proyecto aparte.
- **Cada agente = participante** con track propio → el grid de la maqueta sale casi gratis.
- **Turn detection semántica y barge-in** ya resueltos en el framework.
- **Self-host real** (LiveKit server es Apache-2.0) o Cloud con free tier para empezar.
- SDK oficial para React/TS en el frontend y Python en el orquestador.

Alternativas: Pipecat (mejor composición de pipelines, transporte Daily/SmallWebRTC), o
OpenAI Realtime puro (demo más rápida, un solo proveedor, sin Claude nativo).

---

## 4. APIs de voz — todas legales con key propia

| Capacidad | Opciones oficiales | Nota |
|---|---|---|
| **STT** | Deepgram, AssemblyAI, OpenAI, Google Chirp | Facturación por minuto. Deepgram es el estándar en latencia. |
| **TTS** | ElevenLabs, Cartesia, OpenAI, Google, Azure | Clonar voz requiere consentimiento explícito del dueño. |
| **Speech-to-speech** | OpenAI Realtime, Gemini Live | Una sesión por agente: usarlo para 1–3 agentes, no para 12. |
| **LLM** | Anthropic, OpenAI, Google | Claude **no tiene API de voz**: siempre pasa por STT/TTS. |
| **WebRTC** | LiveKit (Apache-2.0), Daily, SmallWebRTC | Self-host permitido. |
| **Entrar a un Zoom real** | Zoom Meeting SDK (requiere app review), Recall.ai | Bots no oficiales / parches al cliente violan los ToS. |

Reglas de cumplimiento que aplican a este proyecto:

- Usar siempre API keys/OAuth oficiales. Nunca credenciales de suscripciones de consumidor
  (Claude.ai, ChatGPT Plus) para automatizar.
- No revender acceso crudo a los modelos; sí construir producto sobre ellos.
- Si se graba audio o se transcribe: aviso visible + consentimiento. En jurisdicciones de
  consentimiento bilateral (California, Illinois, etc.) es obligatorio que todos acepten.
- Retención de datos: definir cuánto se guardan transcripciones y minutas, y permitir borrarlas.

---

## 5. Arquitectura de agentes (independiente del transporte)

### Roles

- **Director / moderador**: elige quién habla y en qué orden (1–3 por ronda). Modelo barato.
- **Agentes especialistas**: 4–6 es el punto dulce. Más de 8 solo si están muteados por defecto.
- **Floor manager**: decide si el humano está hablando, si se dirigió a alguien, si hay que
  interrumpir o callar. Es código, no prompt.

### Estados de la sala

```
listening ──(humano habla)──▶ transcribing ──▶ thinking (director)
    ▲                                              │
    └──────────── turn_end ◀── speaking ◀──────────┘
```

### Reglas de convivencia

- Nadie empieza a hablar mientras el VAD de otro está abierto.
- El director no puede elegir a un agente muteado.
- Un agente puede "levantar la mano" (evento de datos) si detecta un riesgo; el humano acepta o ignora.
- Máximo 2 interrupciones por ronda para que la reunión no se descarrile.

---

## 5.4 Compresión de contexto: el patrón de T3 Code

Revisado en el AppImage instalado y en la documentación de T3 Code:

- T3 Code no reescribe la conversación: invoca la **compactación nativa** de cada
  proveedor con `/compact` (Claude, Codex, Cursor, Grok, OpenCode). En Claude expone
  `autoCompactThreshold` (100k–1M) y compacta hilos inactivos antes de que expire la
  caché de prompt; en Codex usa los eventos `PreCompact`/`PostCompact` del app-server.
- Mide uso de contexto (tokens usados/máximo) y ofrece **Compact and send** cuando
  vuelves a un hilo grande; si la caché expiró, resume primero. El work-log guarda
  tokens antes → después (prueba real: 83.995 → 7.603).
- La compactación es del proveedor, no del cliente; T3 solo la dispara y la muestra.

En ZoomAgents el CLI se lanza por turno, sin sesión que acumule historial, así que la
compactación se implementa del lado del servidor con el mismo principio: resumen
rodante, últimos turnos en crudo, prefijo estático cacheable y medidor visible.
`/compact` y el botón **Compactar** hacen la compactación manual.

## 5.45 Compresores de herramientas: RTK y Ponytail

Dos herramientas populares atacan partes distintas del gasto:

- **RTK (Rust Token Killer)** — [rtk-ai/rtk](https://github.com/rtk-ai/rtk), Apache-2.0.
  Es un proxy de CLI que filtra la salida de 100+ comandos (tests, `git`, diffs, logs,
  búsquedas) antes de que el agente la lea. Se instala como binario y engancha hooks
  para reescribir comandos. Promete pass-through si un filtro falla.
  Límite: solo reduce la **entrada de herramientas**; si el agente no ejecuta comandos,
  no aporta. Un benchmark pareado de JetBrains (2026) midió **+7.6%** en su escenario,
  frente al 60–90% de salida que anuncia el proyecto.
- **Ponytail** — [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).
  No es un compresor de contexto: es una skill que empuja al agente a escribir el
  código mínimo, sin abstracciones especulativas, manteniendo validación y seguridad.
  Reduce **tokens de salida**; JetBrains midió ~10% de coste y ~15% menos código en 80
  tareas pareadas, no el 54% del anuncio.

En ZoomAgents: RTK es opcional y solo se activa con acceso a terminal (shims en el
`PATH` del agente, detectado por `/api/tools`); Ponytail entra como skill base
`minimal-code` y rol `Lazy Senior`. Ninguno sustituye la compactación de contexto: son
capas ortogonales.

## 5.5 Perfiles, alma y memoria (Hermes + Grok)

Revisado en la instalación local de ambos:

- **Hermes** guarda un `SOUL.md` por perfil y lo carga fresco en cada mensaje; la
  memoria vive en `memories/MEMORY.md` y `memories/USER.md`, y el contexto recordado
  se inyecta entre etiquetas `<memory-context>` con la nota de que no es entrada
  nueva. Sus perfiles son directorios aislados con config, memoria y sesiones.
- **Grok** usa Markdown para la memoria: `topics/` curado (lo que lee al inicio),
  `observations/` para hechos nuevos y un índice acotado en el prompt; un pase de
  consolidación los fusiona. El resumen de sesión se guarda solo.

ZoomAgents copia ese patrón sin atarse a un proveedor:

```
data/profiles/<id>/
  profile.json
  SOUL.md
  memories/USER.md
  memories/MEMORY.md
  memories/OBSERVATIONS.jsonl
```

- El alma se lee en cada turno, así que editarla aplica sin reiniciar.
- Al cerrar la reunión, un extractor (modelo barato, o heurística sin keys) escribe
  hechos durables y una observación con fecha.
- El contexto se inyecta acotado y con instrucción de no citarlo.
- La sala se arma con perfiles, no con plantillas; «Todos hablan» da un turno a cada
  agente con voz y rota el orden.

### Roles y skills

Grok define una skill como un `SKILL.md` con instrucciones reutilizables para un tipo
de tarea; Hermes descubre skills en `~/.agents/skills/<name>/SKILL.md` y las inyecta
solo cuando aplican. ZoomAgents adapta el formato a la reunión:

- `data/library/skills/<id>.md` — frontmatter (`name`, `description`) + instrucciones.
- `data/library/roles/<id>.md` — frontmatter (`name`, `description`, `skills`) + misión
  del rol.
- El perfil elige un rol (que aporta misión + skills) y puede ajustar skills extra.
- El prompt final = alma + rol + skills (máx. 6, 1.200 caracteres cada una) + reglas de
  sala + memoria. `GET /api/profiles/:id/prompt` devuelve exactamente ese texto para
  auditarlo desde la UI.

## 5.6 Terminal, interrupción y sudo

Los CLIs oficiales ya tienen herramientas; no hace falta reimplementar un agente con
tool-loop. ZoomAgents los ejecuta con acceso al workspace y usa tres mecanismos:

- **Interrupción**: cada CLI se lanza en su propio grupo de procesos (`detached`), y
  el abort mata el grupo completo (`process.kill(-pid)`), no solo el padre. Así los
  comandos hijos no siguen vivos tras `Detener`.
- **Aprobación de sudo**: se antepone al `PATH` un wrapper `sudo` en Node que pide
  permiso a `POST /api/approvals` con un token de sala. La sala muestra el comando al
  humano; si aprueba, el servidor devuelve un archivo temporal `0600`, el wrapper lo
  usa con `sudo -S` y lo borra. Nunca se persiste la contraseña.
- **Workspace**: la carpeta se elige por reunión y se pasa como `cwd` a los CLIs y a
  sus herramientas.

Límites: el wrapper solo intercepta `sudo` resuelto por `PATH`; una ruta absoluta lo
evita. El agente corre con los permisos del usuario, así que la decisión de habilitar
terminal es explícita y por reunión.

## 6. Autenticación: el modelo de Paseo

Revisado en la instalación local y en su documentación. **Paseo no implementa OAuth
propio.** Su contrato es: "you install the underlying CLI, Paseo runs it" y "your
subscriptions, config, skills and MCP servers stay intact"
([providers](https://paseo.sh/docs/providers.md)).

- Claude Code se ejecuta con el **Claude Agent SDK** sobre el CLI `claude`, usando la
  sesión del plan ([doc](https://paseo.sh/docs/supported-providers/claude-code.md)).
- Codex se ejecuta con el **CLI oficial** y su app-server; el login es
  `codex login` (ChatGPT) o una API key
  ([doc](https://paseo.sh/docs/supported-providers/codex.md)).
- El resto entra por **ACP** o adaptadores nativos.

En la máquina de desarrollo se verificó: `codex` con `auth_mode: chatgpt` en
`~/.codex/auth.json`, `claude` instalado sin sesión, y `gemini` roto por un conflicto
de versión de Node en mise. Paseo simplemente refleja ese estado.

### Decisión para ZoomAgents

Mismo patrón, implementado en `server/auth.ts` y `server/cli.ts`:

1. Detectar binario, versión y **estado** de sesión (nunca leer el token).
2. Modo `auto` → CLI si hay sesión, si no API key; sin ninguna, el agente no responde.
3. Modo `cli` → solo CLIs; modo `api` → solo keys.
4. Un turno = un proceso del CLI con el prompt del rol, salida JSON parseada a texto.

### OpenCode como gateway

Además de los CLIs de un solo proveedor, se integra **OpenCode** (`opencode models`,
`opencode run -m provider/model --format json`) porque resuelve dos cosas a la vez:
su propio login multi-proveedor y un catálogo de cientos de modelos con un id
uniforme. El modelo se elige **por agente** en la portada; el catálogo se lee del CLI
y se cachea cinco minutos. Es la vía más rápida para mezclar modelos sin configurar
una key por proveedor.

El login de OpenCode es un TUI interactivo: el servidor solo lo lanza en el emulador
de terminal local (foot/alacritty/kitty/ghostty) y luego verifica `opencode auth list`.

Por qué no hacer OAuth directo contra Anthropic/OpenAI: sus flujos OAuth pertenecen a
sus clientes oficiales y no están autorizados para apps de terceros. Reutilizar su
`client_id` o sus tokens es lo que rompe los términos. La vía correcta para
facturación por token sigue siendo la API key.

### OAuth empresarial (fase futura)

Si el producto necesita OAuth propio y legal para inferencia, las rutas son las de
cada nube, no las de los laboratorios:

| Ruta | Identidad | Modelos |
|---|---|---|
| Google **Vertex AI** | OAuth2 / ADC (`gcloud auth application-default login`) | Gemini |
| **Azure OpenAI** | Microsoft Entra ID | GPT |
| **AWS Bedrock** | IAM / SigV4 | Claude, Nova, Llama |

Eso sí es OAuth de primera clase para un backend, pero exige proyecto, facturación y
permisos en la nube. Queda documentado como fase 6.

## 7. Plan por fases

| Fase | Qué se entrega | Estado |
|---|---|---|
| 0 | Sala en texto: grid, roles, moderador, streaming por tile, minuta | Hecho |
| 1 | Micrófono → STT → mismos agentes; captions en vivo | Hecho (motor del navegador) |
| 2 | TTS por agente con voces distintas; habla uno a la vez | Hecho (voces del navegador) |
| 2.5 | Auth OAuth vía CLIs oficiales: Claude Code, Codex, Gemini | Hecho |
| 3 | STT/TTS de proveedor: Deepgram/AssemblyAI + ElevenLabs/Cartesia | Siguiente con keys |
| 4 | LiveKit: cada agente como participante con track de audio; barge-in real | |
| 5 | Herramientas: MCP, screen share de artefactos, minuta → repo/PR | |
| 6 | OAuth de nube para backend propio: Vertex AI, Azure OpenAI, Bedrock | |

Las fases 0–2.5 ya están implementadas en este repo. Al migrar a LiveKit no se tiran: el
director, los roles, las minutas y el grid sobreviven; solo cambia el transporte de
audio y se reemplaza `useDictation`/`useSpeaker` en `src/speech.ts`.
