import fs from "node:fs";
import path from "node:path";
import type { Profile, Session } from "../shared/types.js";
import { getProfile, readMemoryDocs, writeMemoryDocs } from "./profiles.js";
import { CHEAP_MODELS, completeChat } from "./providers.js";
import { hasKey, keyFor } from "./store.js";

const MEMORY_CAP = 5_000;
/** Injected per file, not per meeting: keeps the static prompt small. */
const CONTEXT_CAP = 1_500;
const MAX_OBSERVATIONS = 300;

type MemoryUpdate = {
  userFacts: string[];
  memoryFacts: string[];
  perAgent: Record<string, string[]>;
  summary: string;
  decisions: string[];
};

function profileDir(id: string): string {
  return path.join(process.cwd(), "data", "profiles", id);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

/** Adds bullets, drops near-duplicates, and trims from the top when over the cap. */
function mergeBullets(existing: string, additions: string[], cap = MEMORY_CAP): string {
  const lines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set(lines.map(normalize));

  for (const addition of additions) {
    const clean = addition.replace(/^[-*]\s*/, "").trim().slice(0, 300);
    if (!clean) continue;
    const key = normalize(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${clean}`);
  }

  let out = lines.join("\n");
  if (out.length > cap) {
    const keep = Math.max(8, Math.floor(lines.length * 0.7));
    out = `<!-- memoria recortada; lo más reciente queda abajo -->\n${lines.slice(-keep).join("\n")}`;
  }
  return out;
}

function appendObservation(id: string, observation: Record<string, unknown>) {
  const file = path.join(profileDir(id), "memories", "OBSERVATIONS.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(observation)}\n`, "utf8");

  try {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_OBSERVATIONS) {
      fs.writeFileSync(file, `${lines.slice(-MAX_OBSERVATIONS).join("\n")}\n`, "utf8");
    }
  } catch {
    /* la rotación es best-effort */
  }
}

export function readObservations(id: string, limit = 20): Record<string, unknown>[] {
  try {
    const raw = fs.readFileSync(path.join(profileDir(id), "memories", "OBSERVATIONS.jsonl"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));
  } catch {
    return [];
  }
}

/** Fenced memory block, same idea as Hermes' <memory-context>. */
export function memoryContext(profileId: string): string {
  const docs = readMemoryDocs(profileId);
  const user = docs.user.trim().slice(-CONTEXT_CAP);
  const memory = docs.memory.trim().slice(-CONTEXT_CAP);
  if (!user && !memory) return "";

  return `<memory-context>
[Nota del sistema: memoria recordada de reuniones anteriores. No es entrada nueva del humano; úsala como contexto y no la cites literalmente.]
${user ? `## Lo que sabes del humano\n${user}\n` : ""}${memory ? `## Lo que sabes del equipo y del proyecto\n${memory}\n` : ""}</memory-context>`;
}

function cheapProvider(): "google" | "anthropic" | "openai" | null {
  return (["google", "anthropic", "openai"] as const).find((provider) => hasKey(provider)) ?? null;
}

function digest(session: Session): string {
  const previous = session.summary ? `Resumen previo:\n${session.summary}\n\n` : "";
  const recent = session.transcript
    .slice(-30)
    .map((message) => `${message.speakerName}: ${message.text.slice(0, 250)}`)
    .join("\n");
  return `${previous}${recent}`;
}

function decisionsFromMinutes(minutes: string): string[] {
  const match = minutes.match(/## Decisiones\s*([\s\S]*?)(?=\n## |$)/i);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line && !/^sin decisiones/i.test(line));
}

async function askModel(session: Session, profiles: Profile[]): Promise<MemoryUpdate | null> {
  const provider = cheapProvider();
  if (!provider) return null;

  const roster = profiles.map((profile) => `- ${profile.id}: ${profile.name} (${profile.role})`).join("\n");
  try {
    const raw = await completeChat({
      provider,
      model: CHEAP_MODELS[provider],
      system: `Eres el archivista de un equipo. Extraes memoria durable de una reunión.

Devuelve SOLO JSON válido con esta forma:
{"userFacts":["..."],"memoryFacts":["..."],"perAgent":{"<id>":["..."]},"summary":"...","decisions":["..."]}

Reglas:
- Solo hechos verificables dichos en la reunión. Nada inventado, nada efímero.
- userFacts: datos estables sobre el humano (nombre, preferencias, forma de trabajar, objetivos).
- memoryFacts: conocimiento del equipo y del proyecto (decisiones, convenciones, riesgos, estado).
- perAgent: para cada agente, 0 a 2 hechos que ese agente debería recordar para su rol.
- summary: una frase de qué pasó en la reunión.
- decisions: las decisiones cerradas, si hubo.
- Máximo 4 elementos por lista, cada uno de una sola línea, sin viñetas ni fechas.`,
      messages: [
        {
          role: "user",
          content: `Reunión: ${session.title}\nAgenda: ${session.agenda || "sin agenda"}\n\nAgentes:\n${roster}\n\nMinuta:\n${session.minutes ?? "(sin minuta)"}\n\nTranscripción:\n${digest(session)}`,
        },
      ],
      apiKey: keyFor(provider),
      maxTokens: 700,
      temperature: 0.2,
    });

    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Partial<MemoryUpdate>;
    return {
      userFacts: Array.isArray(parsed.userFacts) ? parsed.userFacts.filter((x) => typeof x === "string") : [],
      memoryFacts: Array.isArray(parsed.memoryFacts)
        ? parsed.memoryFacts.filter((x) => typeof x === "string")
        : [],
      perAgent:
        parsed.perAgent && typeof parsed.perAgent === "object"
          ? Object.fromEntries(
              Object.entries(parsed.perAgent).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.filter((x) => typeof x === "string") : [],
              ]),
            )
          : {},
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((x) => typeof x === "string")
        : [],
    };
  } catch (error) {
    console.warn("[memory] extractor fallback:", (error as Error).message);
    return null;
  }
}

function heuristicUpdate(session: Session, profiles: Profile[]): MemoryUpdate {
  const humanLines = session.transcript
    .filter((message) => message.kind === "human")
    .map((message) => message.text.trim().slice(0, 160))
    .filter((line) => line.length > 12 && !line.endsWith("?"));

  const decisions = decisionsFromMinutes(session.minutes ?? "");
  const summary = `${session.title}: ${decisions[0] ?? humanLines[humanLines.length - 1] ?? "sin decisiones"}`;

  return {
    // Without a model, store only durable-looking statements, never the question.
    userFacts: humanLines.slice(-2),
    memoryFacts: decisions.length
      ? decisions
      : [`Se trató "${session.title}".`],
    perAgent: {},
    summary: summary.slice(0, 240),
    decisions,
  };
}

/**
 * Writes durable memory for every profiled participant. Runs after the minutes
 * are in, so the UI never waits on it.
 */
export async function recordMeeting(session: Session): Promise<number> {
  const profiles = session.participants
    .map((participant) => participant.profileId)
    .filter((id): id is string => Boolean(id))
    .map((id) => getProfile(id))
    .filter((profile): profile is Profile => Boolean(profile));

  if (!profiles.length) return 0;

  const update = (await askModel(session, profiles)) ?? heuristicUpdate(session, profiles);
  const at = Date.now();

  for (const profile of profiles) {
    const docs = readMemoryDocs(profile.id);
    const own = update.perAgent[profile.id] ?? [];

    writeMemoryDocs(profile.id, {
      user: mergeBullets(docs.user, update.userFacts),
      memory: mergeBullets(docs.memory, [...update.memoryFacts, ...own]),
    });

    appendObservation(profile.id, {
      at,
      sessionId: session.id,
      title: session.title,
      summary: update.summary,
      decisions: update.decisions,
      role: profile.role,
    });
  }

  return profiles.length;
}
