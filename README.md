# ZoomAgents

Una sala tipo Zoom donde los participantes son agentes con **alma y memoria**. Tú
creas cada agente, le escribes su personalidad, eliges su modelo y lo sientas en la
sala. Cada uno recuerda las reuniones anteriores; la reunión termina en una minuta
con decisiones y acciones, no en un hilo de chat.

```
Tú ──🎙️──▶ transcripción ──▶ todos los agentes con voz ──▶ Claude / GPT / Gemini / OpenCode
                                        │                              │
                                        └──── SOUL.md + memoria ◀──────┘
◀──────────────── voz + captions + tiles ◀──────────────────────────────
```

## Arrancar

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- Servidor: http://localhost:8787

La sala necesita al menos un proveedor conectado (CLI oficial o API key). Ya no hay
modo simulado: un agente sin conexión se muestra como tal y no responde. El micrófono
usa el motor de voz del navegador.

## Pantalla compartida y control

Dentro de la sala, pulsa **Compartir pantalla** y elige un monitor, una ventana o una pestaña. Selecciona un agente con visión y pulsa **Mostrar al agente**. Puedes escribir una pregunta o dejarla vacía para pedir una descripción. Si quieres incluir una captura al enviar mensajes o hablar, activa **Adjuntar captura a mis mensajes y al hablar**. La vista previa es local. Cada envío manda una captura al proveedor del agente y la narración se reproduce con **Sonido** y se guarda en el chat de la reunión.

En Wayland, abre ZoomAgents en localhost y marca **Permitir propuestas de control**. Pulsa **Pedir paso** para que el agente narre lo que propone. Si autorizas el paso, tienes tres segundos para enfocar la aplicación de destino. Usa **Pedir paso** otra vez para que vea el resultado. **Dejar de compartir** cancela las propuestas y los pasos pendientes.

- Teclado: requiere `wtype`. El texto y las teclas van a la ventana enfocada.
- Clic: requiere Hyprland y `wlrctl`, con un solo monitor sin rotación y el monitor completo seleccionado.
- Visión: requiere un modelo compatible. La captura puede viajar con Claude Code, Codex u OpenCode, o con las API de Anthropic, OpenAI y Google. Para Gemini, usa Google en modo API key.

## Proyectos de la reunión

En **Archivos**, elige el proyecto principal y agrega hasta cuatro carpetas de referencia. Puedes hacerlo antes de entrar o entre turnos dentro de la sala. Si activas la terminal, los agentes CLI trabajan desde el proyecto principal. En cada ronda, los agentes reciben las rutas, nombres de archivos de primer nivel y fragmentos de `README.md` y `CONTEXT.md` de los proyectos seleccionados, incluso con la terminal apagada. El selector se abre desde localhost y puede navegar por las carpetas del equipo que ejecuta ZoomAgents.

Al abrir el proyecto desde el inicio, ZoomAgents analiza localmente su árbol y propone agentes con ejemplos de archivos que justifican cada rol. Elige las propuestas y un proveedor para crear perfiles editables, o entra con agentes que ya tengas. El análisis usa rutas y extensiones, omite dependencias y salidas de compilación comunes y no ejecuta código del proyecto. También se puede ejecutar desde la terminal con `npm run analyze-project -- /ruta/al/proyecto`.

## Agentes: alma y memoria

Cada agente es un perfil en disco, no una plantilla fija. En **Agentes** puedes
crear, editar y borrar los que quieras:

```
data/profiles/<id>/
  profile.json              nombre, rol, proveedor, modelo
  SOUL.md                   personalidad y criterio, cargado en cada turno
  memories/MEMORY.md        lo que sabe del equipo y del proyecto
  memories/USER.md          lo que sabe del humano
  memories/OBSERVATIONS.jsonl  historial crudo de reuniones
```

El patrón viene de Hermes (`SOUL.md` + `memories/`) y de Grok (memoria en Markdown
con índice acotado y observaciones):

- **SOUL.md** se lee fresco en cada mensaje: editas el alma y el cambio aplica en la
  siguiente intervención, sin reiniciar la reunión.
- **Memoria**: al terminar cada reunión, un extractor escribe hechos durables en
  `USER.md` / `MEMORY.md` y guarda una observación con fecha y minuta. Sin API key
  usa un fallback heurístico; con key, un modelo barato destila la memoria.
- El contexto entra al prompt dentro de `<memory-context>` y con la instrucción de no
  citarlo literalmente. El archivo se recorta solo cuando crece demasiado.
- **No hay plantillas en la sala**: eliges perfiles de la biblioteca. El botón
  **Crear equipo de ejemplo** genera cinco perfiles editables si quieres empezar con
  contenido.

### Cara generada

Cada agente tiene una cara propia, dibujada en SVG y derivada de **nombre + rol**:
paleta, forma, orejas, patrón, boca y accesorios cambian de forma determinista, y los
ojos siempre son blancos con pupila oscura. El mismo nombre y rol dan la misma cara.

- La semilla se guarda como `avatarSeed` en `profile.json` y viaja a la sala, así que
  el tile, el lobby y el panel muestran la misma cara.
- En el editor hay **Cambiar cara**: genera otra variante sin tocar el nombre.
- Mientras no cambies la cara a mano, la semilla sigue al nombre y al rol: renombrar
  al agente le da una cara nueva automáticamente.
- Dos agentes llamados “Claude” con roles distintos tienen caras distintas.

## Roles y skills

La biblioteca vive en `data/library/` como Markdown editable:

```
data/library/
  skills/<id>.md    frontmatter (name, description) + instrucciones
  roles/<id>.md     frontmatter (name, description, skills) + misión del rol
```

- **Skills**: instrucciones reutilizables (checklists, criterios, formato de salida).
  Vienen 14 de base: revisión de código, testing, arquitectura, APIs, frontend,
  seguridad, DevOps, datos, growth, SEO, producto, automatización, investigación y
  minutas. Puedes crear las tuyas con el mismo formato `SKILL.md` que usan Hermes y
  Grok.
- **Roles**: un paquete de misión + skills. Vienen 14 predefinidos (Backend Dev,
  Frontend Dev, AI Engineer, QA, Code Reviewer, DevOps, PM, Market Analyst, SEO,
  Automation, Mobile, Security, Data, General). Puedes crear roles nuevos con su
  propia misión y las skills que quieras.
- En el editor de cada agente eliges **rol de la biblioteca** (aplica su misión y sus
  skills) y luego ajustas **skills activas** por agente.
- **Ver prompt** muestra exactamente lo que recibe el agente: alma + rol + skills +
  reglas + memoria, antes del contexto de la sala.

El prompt compuesto se limita a 6 skills por agente y 1.200 caracteres por skill para
no inflar el contexto.

## Conexión con providers: OAuth de verdad

ZoomAgents **no implementa OAuth propio ni guarda tokens de proveedor**. Igual que
[Paseo](https://paseo.sh/docs/providers), ejecuta el **CLI oficial** de cada agente y
hereda la sesión que ese CLI ya tiene:

| Provider | CLI oficial | Login | Sesión que usa |
|---|---|---|---|
| Anthropic | `claude` | `claude` → `/login` | Tu plan de Claude |
| OpenAI | `codex` | `codex login` | Tu cuenta de ChatGPT |
| Google | `gemini` | `gemini` → Login with Google | Tu cuenta de Google |
| **OpenCode** | `opencode` | `opencode auth login` | Tus integraciones de OpenCode |

**OpenCode** es un caso especial y el más flexible: es un *gateway* con su propio
login y cientos de modelos (hosted, OpenRouter, etc.). Se integra como un provider
más y su catálogo se lee con `opencode models`. Los modelos gratuitos
(`opencode/*-free`) funcionan sin saldo.

Cada CLI tiene un botón **Abrir terminal de login** en Configurar keys: lanza el TUI
oficial en tu terminal (foot/alacritty/kitty/ghostty…). El login es interactivo, así
que se completa ahí, no dentro del navegador.

El servidor solo lee el **estado** de la sesión (por ejemplo `codex login status`,
o la existencia de las credenciales del CLI). Nunca abre, copia ni guarda los tokens.

### Modos de conexión

En **Configurar keys** hay tres modos:

| Modo | Qué hace |
|---|---|
| **Automático** (default) | Usa el CLI si hay sesión iniciada; si no, la API key; si no hay ninguna, el agente queda sin conexión. |
| **Suscripción** | Solo CLIs oficiales. Consume los límites de tu plan, sin factura por token. |
| **API key** | Solo claves de proveedor, facturadas por token. |

El botón **Verificar sesiones** vuelve a detectar los CLIs instalados y su estado.
Los chips de la portada muestran `CLI`, `API` o `—` por proveedor.

### Modelo por agente

El proveedor y el modelo se eligen en el editor de cada agente (**Agentes** →
perfil → Proveedor/Modelo). El campo de modelo trae el catálogo como sugerencias:

- **OpenCode**: catálogo completo (hoy 368 modelos), incluye familias
  (`opencode`, `openrouter`, …) y modelos gratuitos `free`.
- **Anthropic / OpenAI / Google**: modelo del CLI o un id concreto.

Un mismo equipo puede mezclar Claude para backend, OpenCode para QA y un modelo local
para el interno. Cada perfil guarda su propia elección.

Para comprobar el transporte de OpenCode sin abrir la UI:

```bash
npm run opencode-check                        # opencode/big-pickle
npm run opencode-check -- opencode/deepseek-v4.1-flash-free
```

### Requisitos

- El CLI tiene que estar instalado en la **misma máquina que el servidor** y en su
  `PATH` (no vale un alias del shell).
- Inicia sesión una vez, desde una terminal normal. Si la sesión caduca, repite el
  login y pulsa **Verificar sesiones**.
- Los límites del plan aplican: si se agotan, la sala avisa y puedes cambiar a API key.

Variables opcionales para forzar un modelo del CLI:

```env
ZA_CLAUDE_MODEL=sonnet
ZA_CODEX_MODEL=gpt-5.1-codex
ZA_GEMINI_MODEL=gemini-2.5-pro
```

### API keys (alternativa)

Si prefieres facturación por token, cada consola emite su clave:

| Proveedor | Dónde | Formato |
|---|---|---|
| Google | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `AIza...` |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | `sk-ant-...` |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `sk-...` |

Se pegan en **Configurar keys** o en `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

Las keys se guardan en `data/settings.json` (permisos `600`, fuera de git). El
navegador nunca las recibe: solo ve los últimos cuatro caracteres.

## Qué hace hoy

- **Interfaz tipo Zoom**: barra superior con cifrado, título y tiempo; grid 16:9 de
  participantes; toolbar inferior con Audio, Video, Participantes, Chat, Sonido, Más
  y Salir; tile del que habla en verde con waveform.
- **Grid de tiles** con cara generada por agente, nombre y rol, mute por agente.
- **Voz real**: dictado por micrófono y respuestas habladas con una voz distinta por
  agente, usando el motor de speech del navegador (cero costo).
- **Tres modos de palabra**: *Automático* (default) responde a quien menciones o a
  quien tenga algo nuevo; *Todos* da un turno a cada agente con voz; *Moderador* deja
  que un modelo barato elija hasta tres por ronda.
- **Conversación entre agentes**: un agente puede ceder la palabra a otro por su rol
  y ese responde después; la cadena se corta a los dos saltos.
- **Agentes con alma y memoria** editables, con historial por agente.
- **Turnos sincronizados con la voz**: un solo agente habla a la vez; el siguiente
  espera a que termine el audio del anterior.
- **Streaming por tile**: cada agente escribe en su propio tile mientras habla, y su
  tile se ilumina con borde pulsante y waveform.
- **Captions en vivo** con nombre en negrita y texto parcial.
- **Minuta automática** en markdown con decisiones, acciones y riesgos; se puede
  copiar o descargar.
- **Chat lateral** con toda la conversación en vivo: avatar, nombre, rol, hora y el
  roster de **responsables** (humano + todos los agentes). Tiene auto-scroll, “ir al
  final”, badge de no leídos y su propio input para escribir sin cerrar la sala. En
  móvil ocupa la pantalla completa.
- **Cámara local** en tu tile (preview, todavía no se publica).
- **Historial** de reuniones y panel por agente con sus intervenciones.

## Menciones y turnos entre agentes

- **Dirígete a alguien por su rol**: “Backend Dev, ¿qué opinas?”, “@QA, revisa esto”.
  Varios agentes comparten el nombre “Claude”, así que el rol es el identificador
  fiable; el nombre solo cuenta cuando es único.
- El agente mencionado recibe el contexto “el humano se dirigió a ti” y responde
  primero. En **Automático**, los demás no hablan por inercia.
- Un agente puede pasar la palabra a otro rol (“Code Reviewer, mira este diff”). Ese
  agente habla después, con un máximo de **dos saltos** y seis turnos por ronda.
- El chat lateral marca los mensajes dirigidos con `→ Backend Dev`, tanto en el
  mensaje del humano como en el del agente que cedió la palabra.

## Cómo funciona una ronda

```
listening ──(hablas)──▶ thinking ──(todos / moderador)──▶ speaking ⇄ speaking ──▶ listening
```

1. Tu audio se transcribe y se envía como intervención.
2. En **Automático**, si mencionas un rol esa persona responde primero; si no
   mencionas a nadie, el moderador elige hasta dos agentes relevantes. Si nadie
   aporta algo nuevo, no habla nadie. En **Todos** recibe la palabra cada agente con
   voz, y en **Moderador** elige hasta tres.
3. Los agentes hablan **de uno en uno**. El servidor no le da la palabra al siguiente
   hasta que el cliente confirma que el audio del anterior terminó (`played`), así
   que el tile iluminado siempre coincide con la voz que suena. Si el sonido está
   apagado o no hay TTS, el acuse es inmediato; si algo se cuelga, hay timeout.
4. El tile del que habla se ilumina con borde pulsante, halo en el avatar, waveform y
   la píldora del nombre resaltada. Solo hay un tile activo a la vez.
5. Al terminar, la sala vuelve a escuchar. `Detener` corta la generación y libera el
   turno en el acto.
5. Al cerrar, se escribe la minuta y se actualiza la memoria de cada perfil.

Los agentes muteados nunca hablan. Los que no tienen CLI ni API key se marcan como
sin conexión y no responden; la sala sigue con el resto.

### Interrupción en tiempo real

Hay dos formas de cortar, y ambas terminan en el mismo lugar:

- **Hablando**: con el micrófono encendido y *Interrupción por voz* activa, se abre un
  segundo stream con cancelación de eco y se mide energía solo mientras un agente
  tiene la palabra. Tras 4–8 frames de voz sostenida (~200–400 ms): se cancela el TTS,
  se manda `stop` al servidor y se activa el dictado para tu intervención.
  El toggle y la sensibilidad (**Sensible / Normal / Estricta**) están en el
  compositor y se recuerdan en `localStorage`.
- **Guarda de eco**: el primer medio segundo de cada turno exige más energía, y el
  umbral se adapta al ruido de fondo con un techo. Si no hay micrófono, el toggle
  avisa y no intenta escuchar.
- **Corte limpio**: si un `turn_end` del CLI llega después de la interrupción, el
  cliente no vuelve a reproducir esa voz; la interrupción no se deshace sola.
- **Con `Detener`**: aborta la generación, **mata el árbol de procesos** del CLI
  (grupo propio, no solo el padre), cancela el TTS y deniega cualquier `sudo`
  pendiente.

El servidor además guarda un mensaje que llegue mientras la ronda se está cerrando y
lo corre como turno siguiente, así que una interrupción no se pierde por una carrera
de milisegundos.

Funciona mejor con auriculares: con altavoces, el eco residual puede disparar una
falsa interrupción; en ese caso desactiva el toggle. `Detener` sigue estando siempre.

## Terminal y sudo

En **La reunión** puedes activar **Acceso a terminal** y elegir la carpeta de trabajo:

- Los agentes reciben shell y herramientas de archivos dentro de esa carpeta (Codex
  con acceso total, Claude sin prompts, OpenCode en modo `--auto`).
- Si un agente necesita `sudo`, un wrapper intercepta el comando y **te pide permiso**
  en la sala: ves el comando exacto, puedes denegarlo y, si hace falta, escribir la
  contraseña.
- La contraseña no se escribe en disco de forma permanente: el servidor crea un
  archivo temporal `0600`, el wrapper lo consume con `sudo -S` y lo borra. Si marcas
  “recordar”, queda solo en memoria durante esa reunión.
- Al interrumpir o terminar, las aprobaciones pendientes se deniegan.

Advertencias honestas:

- Los agentes corren con **tus permisos de usuario**. Solo activa esto en salas de
  confianza y con una carpeta acotada.
- El wrapper cubre `sudo` invocado por `PATH`; un comando con la ruta absoluta
  `/usr/bin/sudo` no pasa por la aprobación.
- Un agente puede ejecutar comandos destructivos sin sudo. El prompt se lo prohíbe,
  pero la decisión de darle terminal es tuya.

## Ahorro de tokens

T3 Code lo resuelve con compactación nativa del proveedor (`/compact`, umbral de
auto-compactación, medidor de contexto y caché de prompt). Aquí cada turno arranca el
CLI sin sesión acumulada, así que la misma idea se aplica en el servidor:

- **Resumen rodante**: cada 18 intervenciones se resumen las antiguas (modelo barato,
  o heurística si no hay key) y solo viajan en crudo las últimas 8. El resumen entra
  como contexto y nunca se repite en la respuesta.
- **Prefijo estático cacheable**: alma + rol + skills + reglas + memoria no cambian
  entre rondas. En Anthropic se marca con `cache_control: ephemeral`; OpenAI y Gemini
  reutilizan su caché implícita. Lo dinámico (agenda, ronda, intervención anterior) va
  al final, fuera del prefijo.
- **Presupuestos**: 4 skills por agente y 800 caracteres por skill, 1.500 por archivo
  de memoria, 4.000 de alma y 520 por mensaje del historial.
- **Medidor y control**: chip `~N tok` en la cabecera (estimado del prompt) con el
  detalle real en el tooltip: tokens de entrada/salida, caché, tiempo total, tiempo al
  primer token y costo acumulado de la sesión. Botón **Compactar** y `/compact`.
- **Medición**: con 40 intervenciones, el contexto pasó de 2.343 a 1.451 tokens
  (~38% menos) usando el resumen heurístico; con modelo barato el resumen es más corto.
- **Uso real**: las APIs de Anthropic, OpenAI y Google reportan sus tokens en el
  stream y el servidor los suma por llamada (`server/usage.ts`). Los transportes CLI y
  el proveedor simulado no los reportan: se marcan como `estimate` y nunca suman costo.
  Precios en USD por millón de tokens, revisados 2026-11; si cambian, se editan en
  `server/usage.ts`. `npm run usage-check` valida el cálculo sin gastar tokens.

### RTK: comprimir la salida de la terminal

**RTK (Rust Token Killer)** no comprime la conversación: comprime lo que el agente
lee de tests, logs, `git status`, diffs y búsquedas. Se integra solo cuando activas
**Acceso a terminal**:

- El servidor detecta `rtk` (`/api/tools`) y muestra el estado en la portada.
- Si está instalado, crea shims en un directorio temporal y los pone primero en el
  `PATH` del agente (`git`, `grep`, `npm`, `cargo`, `pytest`, `docker`…), sin tocar el
  comando original del usuario.
- El shim quita su propio directorio del `PATH` antes de invocar RTK para evitar
  recursión, y RTK hace pass-through si un filtro falla.
- Si no está instalado, el checkbox queda deshabilitado y no se inyecta nada.

```bash
brew install rtk
# o
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
```

Honestidad sobre los números: RTK anuncia 60–90% menos salida de comandos, pero un
benchmark pareado independiente (JetBrains, 2026) midió **+7.6%** en su escenario. La
salida de herramientas es solo una parte del prompt, así que mide con `rtk gain` en tu
flujo antes de dar el ahorro por hecho. No afecta a salas sin terminal.

### Ponytail: código mínimo

Ponytail no es un compresor de contexto: es una disciplina para que el agente escriba
menos código y explique menos. Se añadió como skill base **“Código mínimo (Ponytail)”**
y como rol **Lazy Senior** (skills: código mínimo, revisión, testing). Reduce tokens de
salida y coste; un benchmark independiente midió ~10% de ahorro, no el 54% anunciado.

### Anti-repetición

Cuatro capas, porque un prompt solo no alcanza:

1. **Moderador**: elige perspectivas complementarias, nunca repite un agente en la
   misma ronda y, si el humano solo saluda o confirma, deja hablar a uno.
2. **Contexto de ronda**: cada agente recibe lo que ya se dijo en esa ronda y su
   propia intervención anterior, con la instrucción explícita de no repetir.
3. **Filtro de frases**: se eliminan oraciones idénticas dentro de una misma
   respuesta.
4. **Detector de duplicados**: el servidor compara cada intervención con las últimas
   ocho usando similitud Jaccard sobre palabras de contenido. Si se parece demasiado,
   le da una segunda oportunidad con una instrucción concreta; si vuelve a repetir,
   descarta el turno y no entra en la transcripción.

`npm run smoke` corre dos rondas y falla si dos intervenciones superan 0.55 de
similitud. `npm run profiles-check` verifica perfiles, modo «todos hablan» y que la
memoria se escriba al terminar. `npm run tools-check` comprueba con un agente real
que la terminal lee un archivo del workspace y que `Detener` mata el proceso del CLI.
`npm run context-check` mide la compactación de contexto sin gastar tokens.
`npm run addressing-check` verifica que una mención por rol haga hablar solo a esa
persona y que un mensaje general no arrastre a toda la sala.

## Estructura

```
server/
  index.ts      HTTP + WebSocket + API de perfiles y salas
  profiles.ts   biblioteca de agentes: profile.json, SOUL.md y memorias
  library.ts    roles y skills en data/library (Markdown editable)
  memory.ts     extracción, consolidación e inyección de memoria
  auth.ts       detección de CLIs, modo de conexión y transporte por proveedor
  cli.ts        puente a claude / codex / gemini / opencode
  room.ts       turnos, streaming, interrupción por grupo de procesos y aprobaciones sudo
  director.ts   moderador, minutas, fallback sin conexión
  providers.ts  adaptadores API (Anthropic / OpenAI / Google); mock es solo test
  context.ts    resumen rodante, presupuesto y construcción del contexto
  rtk.ts        detección de RTK y shims de comandos para comprimir su salida
  models.ts     catálogo de modelos (curado + `opencode models`)
  templates.ts  solo datos del equipo de ejemplo (semilla opcional)
  store.ts      sesiones, keys y modo en data/
src/
  components/   Lobby, ProfilesModal, LibraryModal, Room, tiles, captions
  speech.ts     dictado y voces (una por agente)
  useRoom.ts    cliente WebSocket
docs/
  research.md   proyectos de referencia, stack de voz y plan por fases
```

Cada reunión se guarda en `data/sessions/<id>.json` con su transcripción y su minuta.
Cada agente vive en `data/profiles/<id>/` con su alma y sus recuerdos.

## Voz: estado y siguiente paso

Hoy la voz corre en el navegador (`SpeechRecognition` + `speechSynthesis`). Es real,
gratis y suficiente para validar la experiencia. El plan para voz de producción está
en [docs/research.md](docs/research.md):

| Fase | Transporte | STT / TTS |
|---|---|---|
| Actual | WebSocket propio | motor del navegador |
| 2 | WebSocket propio | Deepgram / AssemblyAI + ElevenLabs / Cartesia |
| 3 | **LiveKit** (cada agente con su track) | STT compartido + TTS por agente |
| 4 | LiveKit + MCP | herramientas, screen share, minuta → repo |

LiveKit es la elección porque cada agente se vuelve un participante real con su
track de audio: los agentes se oyen entre ellos y el barge-in viene resuelto. Para
cambiar el STT solo hay que reemplazar `useDictation` en `src/speech.ts`.

## Límites conocidos

- El dictado del navegador solo existe en Chrome/Edge. En Firefox la sala sigue
  funcionando por texto.
- La interrupción por voz usa el micrófono del navegador y cancelación de eco; con
  altavoces puede fallar por eco. LiveKit (fase 3) la hará robusta con VAD de servidor.
- La cámara es solo preview local; publicarla requiere la fase de LiveKit.
- La memoria sin API key es heurística (guarda decisiones y temas, no destila). Con
  una key de Anthropic/OpenAI/Google se usa un modelo barato como archivista.
- El acceso a terminal depende del CLI: Claude, Codex y OpenCode lo soportan bien;
  Gemini CLI queda en modo best-effort.
- «Todos hablan» con 10 agentes son 10 llamadas por turno: útil, pero caro. Silencia
  o usa «Moderador» para equipos grandes.

## Legal

- El modo suscripción usa los CLIs oficiales, que son los clientes autorizados por
  cada proveedor. ZoomAgents no reimplementa sus flujos de OAuth ni reutiliza sus
  `client_id`. Es el mismo patrón que Paseo: herramienta local, sesión propia del CLI.
- Para uso personal no hay problema. Si distribuyes un producto comercial, revisa los
  términos de cada plan: los límites y el uso automatizado son responsabilidad tuya.
- Nada de credenciales extraídas de apps de consumidor ni de clientes parcheados.
- Si grabas o transcribes, avisa y pide consentimiento a todos los participantes.
- Meter agentes a un Zoom real requiere Zoom Meeting SDK (con revisión) o un
  proveedor como Recall.ai. Bots no oficiales violan los ToS.
- No clones voces sin permiso explícito del dueño.
