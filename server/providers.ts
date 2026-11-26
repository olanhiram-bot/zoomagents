import type { ProviderId } from "../shared/types.js";
import { streamCli } from "./cli.js";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type StreamOptions = {
  provider: ProviderId;
  model: string;
  system: string;
  messages: ChatMessage[];
  hasProjectContext?: boolean;
  image?: string; // Base64 JPEG attached to the final user message.
  apiKey?: string;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  /** Used only by the mock provider to make replies feel role-specific. */
  label?: string;
  /** "cli" runs the official CLI and inherits its OAuth session. */
  transport?: "api" | "cli";
  /** Give the CLI shell/file tools on this machine. */
  tools?: boolean;
  /** Working directory for the CLI and its tools. */
  cwd?: string;
  /** Extra environment (approval URL, token, PATH wrapper). */
  env?: Record<string, string>;
  /** Real token usage reported by the provider, if it reports any. */
  onUsage?: (usage: ProviderUsage) => void;
};

/** Input/output accounting as the provider describes it. */
export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number;
};

const ANTHROPIC_VERSION = "2023-06-01";

/** Merge consecutive same-role turns and force the history to start with "user". */
function normalize(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const message of messages) {
    const text = message.content.trim();
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content += `\n\n${text}`;
    } else {
      merged.push({ role: message.role, content: text });
    }
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  if (!merged.length) merged.push({ role: "user", content: "..." });
  return merged;
}

function withImage<T>(options: StreamOptions, part: T) {
  const messages = normalize(options.messages);
  return messages.map((message, index) =>
    options.image && index === messages.length - 1 && message.role === "user"
      ? { ...message, content: [{ type: "text", text: message.content }, part] }
      : message,
  );
}

async function* readSse(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("El proveedor no devolvió stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data) yield data;
      }
    }
  }
}

async function assertOk(response: Response, provider: string) {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  throw new Error(
    `${provider} respondió ${response.status}: ${body.slice(0, 400) || response.statusText}`,
  );
}

async function* streamAnthropic(o: StreamOptions): AsyncGenerator<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: o.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": o.apiKey ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: o.model,
      max_tokens: o.maxTokens ?? 400,
      temperature: o.temperature ?? 0.7,
      // Static prefix (soul + role + skills + rules + memory) is cached across
      // rounds; only the round context changes.
      system: [
        {
          type: "text",
          text: o.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: withImage(o, {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: o.image },
      }),
      stream: true,
    }),
  });
  await assertOk(response, "Anthropic");

  const usage: ProviderUsage = { inputTokens: null, outputTokens: null, cachedTokens: 0 };
  for await (const data of readSse(response)) {
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.type === "error") throw new Error(event.error?.message ?? "Error de Anthropic");
    if (event.type === "message_start") {
      const raw = event.message?.usage;
      if (raw) {
        const cachedRead = raw.cache_read_input_tokens ?? 0;
        const cachedWrite = raw.cache_creation_input_tokens ?? 0;
        // Anthropic reports cache tokens outside input_tokens; count them so
        // the cost reflects everything we actually sent.
        usage.inputTokens = (raw.input_tokens ?? 0) + cachedRead + cachedWrite;
        usage.cachedTokens = cachedRead;
      }
    }
    if (event.type === "message_delta" && typeof event.usage?.output_tokens === "number") {
      usage.outputTokens = event.usage.output_tokens;
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      yield event.delta.text as string;
    }
  }
  o.onUsage?.(usage);
}

async function* streamOpenai(o: StreamOptions): AsyncGenerator<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: o.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${o.apiKey ?? ""}`,
    },
    body: JSON.stringify({
      model: o.model,
      max_completion_tokens: o.maxTokens ?? 400,
      temperature: o.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "system", content: o.system }, ...withImage(o, {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${o.image}` },
      })],
    }),
  });
  await assertOk(response, "OpenAI");

  const usage: ProviderUsage = { inputTokens: null, outputTokens: null, cachedTokens: 0 };
  for await (const data of readSse(response)) {
    if (data === "[DONE]") break;
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.error) throw new Error(event.error.message ?? "Error de OpenAI");
    if (event.usage) {
      usage.inputTokens = event.usage.prompt_tokens ?? null;
      usage.outputTokens = event.usage.completion_tokens ?? null;
      usage.cachedTokens = event.usage.prompt_tokens_details?.cached_tokens ?? 0;
    }
    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) yield delta;
  }
  o.onUsage?.(usage);
}

async function* streamGoogle(o: StreamOptions): AsyncGenerator<string> {
  const model = o.model.replace(/^models\//, "");
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(o.apiKey ?? "")}`;
  const response = await fetch(url, {
    method: "POST",
    signal: o.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      generationConfig: {
        maxOutputTokens: o.maxTokens ?? 400,
        temperature: o.temperature ?? 0.7,
      },
      contents: normalize(o.messages).map((m, index, messages) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [
          { text: m.content },
          ...(o.image && index === messages.length - 1 && m.role === "user"
            ? [{ inlineData: { mimeType: "image/jpeg", data: o.image } }]
            : []),
        ],
      })),
    }),
  });
  await assertOk(response, "Google");

  const usage: ProviderUsage = { inputTokens: null, outputTokens: null, cachedTokens: 0 };
  for await (const data of readSse(response)) {
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.error) throw new Error(event.error.message ?? "Error de Google");
    const meta = event.usageMetadata;
    if (meta) {
      usage.inputTokens = meta.promptTokenCount ?? usage.inputTokens;
      usage.outputTokens = meta.candidatesTokenCount ?? usage.outputTokens;
      usage.cachedTokens = meta.cachedContentTokenCount ?? 0;
    }
    const parts = event.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (typeof part.text === "string" && part.text) yield part.text;
    }
  }
  o.onUsage?.(usage);
}

/* ------------------------------ mock ------------------------------ */

type MockBank =
  | "backend"
  | "frontend"
  | "qa"
  | "devops"
  | "ai"
  | "reviewer"
  | "market"
  | "seo"
  | "default";

const MOCK_BANKS: Record<MockBank, string[]> = {
  backend: [
    "Lo partiría en un endpoint idempotente y una cola para lo lento. Si falla el reintento, no duplicamos escrituras.",
    "Puedo cerrar el contrato del API hoy. El riesgo real está en la migración de datos, no en el código.",
    "Necesito que QA cubra el reintento; es donde se rompe todo en producción.",
    "Si vamos con esto, que sea detrás de un flag y con métricas desde el minuto uno.",
    "Me preocupa el orden de los eventos. Sin una marca de tiempo común, el estado se desincroniza.",
  ],
  frontend: [
    "Cabe en una vista con estado optimista, pero necesito saber qué pasa cuando la respuesta llega tarde.",
    "Con menos de 200 ms no hace falta skeleton. Con más, la percepción cambia por completo.",
    "Pediría un feature flag para poder apagarlo el día del lanzamiento.",
    "El costo real acá es de accesibilidad: teclado y lectores de pantalla.",
    "Si el usuario pierde la conexión a mitad de la acción, la UI tiene que contarlo, no fingir.",
  ],
  qa: [
    "Antes de seguir: falta el caso de fallo parcial. Sin eso no lo puedo aprobar.",
    "Eso rompe el flujo de reintento actual; lo marco como bloqueante.",
    "Puedo escribir los casos hoy si me confirman el contrato.",
    "¿Qué pasa si el usuario cierra la pestaña a mitad? Nadie lo está cubriendo.",
    "Falta un caso de dos usuarios tocando el mismo registro a la vez.",
  ],
  devops: [
    "Para esto conviene un deploy canario al 10% con rollback automático.",
    "El pipeline tarda cuatro minutos; sumar esto lo lleva a seis. ¿Vale la pena?",
    "Necesito healthcheck y alertas antes de tocar producción.",
    "El costo de infraestructura se duplica si esto queda siempre encendido.",
    "Sin trazabilidad entre servicios, cualquier incidente se vuelve adivinanza.",
  ],
  ai: [
    "Separaría al moderador del generador: son dos problemas distintos.",
    "Con doce agentes por ronda el costo es inviable. Limitaría a tres.",
    "Podemos cachear el contexto del proyecto y bajar la latencia a la mitad.",
    "Falta una forma de medir si la reunión sirvió. Sin métrica, es teatro.",
    "El modelo no necesita ver toda la transcripción; con las últimas rondas alcanza.",
  ],
  reviewer: [
    "Falta manejo de errores explícito en el camino feliz. Es lo primero que rompe.",
    "Esto duplica lógica que ya existe en el servicio de sesiones. Unificaría antes de mergear.",
    "Apruebo con dos cambios menores, ninguno bloqueante.",
    "El nombre no dice qué hace. Eso se vuelve deuda en tres semanas.",
    "Hay un caso sin cubrir: cuando el stream se corta a mitad de respuesta.",
  ],
  market: [
    "Hay tres competidores y ninguno hace voz en español. Ahí está el hueco.",
    "El mensaje debería ser «tu equipo de agentes», no «un chat con IA».",
    "Probaría pricing por reunión, no por token: se entiende y se presupuesta.",
    "Antes de invertir en marca, mediría cuántos vuelven a la segunda reunión.",
    "El comprador no es el desarrollador. El mensaje tiene que hablarle a quien firma.",
  ],
  seo: [
    "La intención de búsqueda es informativa, no transaccional. La landing no la cubre.",
    "Necesitamos una página comparativa; ahí está el tráfico que no tenemos.",
    "Los títulos no incluyen la categoría. Es un cambio de una tarde.",
    "Si el contenido se renderiza en cliente, Google lo ve tarde. Lo movería a servidor.",
    "Falta enlazado interno entre las páginas de producto y las guías.",
  ],
  default: [
    "Lo veo viable, pero acotaría el alcance de esta semana.",
    "De acuerdo con la dirección, con una salvedad: primero medir.",
    "Propongo cerrar esto con una decisión y dos tareas asignadas.",
    "Me falta información para opinar con seguridad. ¿Quién tiene el dato?",
    "Hay una dependencia que no estamos nombrando y puede frenar todo.",
  ],
};

function mockBankFor(label: string): MockBank {
  const haystack = label.toLowerCase();
  if (haystack.match(/back|api|servidor/)) return "backend";
  if (haystack.match(/front|web|ui/)) return "frontend";
  if (haystack.match(/qa|test|calidad/)) return "qa";
  if (haystack.match(/devops|infra|sre/)) return "devops";
  if (haystack.match(/ai|ml|engineer/)) return "ai";
  if (haystack.match(/review|revisor/)) return "reviewer";
  if (haystack.match(/market|growth/)) return "market";
  if (haystack.match(/seo/)) return "seo";
  return "default";
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return h;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function* streamMock(o: StreamOptions): AsyncGenerator<string> {
  const label = o.label ?? "";
  const bank = MOCK_BANKS[mockBankFor(label)];
  // Rotate by turn count so the same role does not repeat its line next round,
  // and salt with the system prompt so a retry (which adds a nudge) says
  // something different instead of looping on the same sentence.
  const turn = o.messages.filter((message) => message.role === "assistant").length;
  // Include the tail of the system prompt so a retry with a nudge lands on a
  // different line instead of repeating the attempt that was just discarded.
  const salt = hash(o.system.slice(0, 160)) + hash(o.system.slice(-240));
  const index = Math.abs(hash(label) + turn * 13 + salt) % bank.length;
  const text = bank[index];

  const words = text.split(/(\s+)/);
  for (const word of words) {
    if (!word) continue;
    if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    yield word;
    await sleep(14 + Math.random() * 26, o.signal);
  }
  // No API behind the simulator: report chars/4 so the UI still has numbers.
  o.onUsage?.({
    inputTokens: Math.ceil((o.system.length + o.messages.reduce((n, m) => n + m.content.length, 0)) / 4),
    outputTokens: Math.ceil(text.length / 4),
    cachedTokens: 0,
  });
}

/* ------------------------------ public ------------------------------ */

export async function* streamChat(o: StreamOptions): AsyncGenerator<string> {
  if (o.transport === "cli" && o.provider !== "mock") {
    yield* streamCli(o.provider, o);
    return;
  }

  if (o.provider === "opencode") {
    throw new Error("OpenCode necesita su CLI. Inicia sesión con `opencode auth login`.");
  }

  switch (o.provider) {
    case "anthropic":
      yield* streamAnthropic(o);
      return;
    case "openai":
      yield* streamOpenai(o);
      return;
    case "google":
      yield* streamGoogle(o);
      return;
    default:
      yield* streamMock(o);
      return;
  }
}

export async function completeChat(o: StreamOptions): Promise<string> {
  let out = "";
  for await (const delta of streamChat(o)) out += delta;
  return out.trim();
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
  opencode: "opencode/big-pickle",
  mock: "mock-1",
};

export const CHEAP_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
  opencode: "opencode/big-pickle",
  mock: "mock-1",
};
