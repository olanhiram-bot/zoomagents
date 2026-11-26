import type { Message, Participant, Session } from "../shared/types.js";
import { isAcknowledgement } from "../shared/text.js";
import { CHEAP_MODELS, completeChat } from "./providers.js";
import { hasKey, keyFor } from "./store.js";

const PROVIDER_ORDER = ["google", "anthropic", "openai"] as const;

function cheapProvider(): "google" | "anthropic" | "openai" | null {
  return PROVIDER_ORDER.find((provider) => hasKey(provider)) ?? null;
}

function transcriptForPrompt(session: Session, limit = 8): string {
  const messages = session.transcript.slice(-limit);
  if (!messages.length) return "(la reunión acaba de empezar)";
  const digest = messages
    .map((message) => `${message.speakerName}: ${message.text.slice(0, 180)}`)
    .join("\n");
  return session.summary ? `Resumen previo:\n${session.summary}\n\n${digest}` : digest;
}

function heuristicSpeakers(session: Session, max: number): Participant[] {
  const available = session.participants.filter((p) => !p.muted);
  if (!available.length) return [];

  const lastSpoke = new Map<string, number>();
  session.transcript.forEach((message, index) => {
    if (message.kind === "agent") lastSpoke.set(message.speakerId, index);
  });

  const ranked = [...available].sort((a, b) => {
    const aIndex = lastSpoke.get(a.id) ?? -1;
    const bIndex = lastSpoke.get(b.id) ?? -1;
    return aIndex - bIndex;
  });

  return ranked.slice(0, Math.min(max, ranked.length));
}

/**
 * The director decides who gets the floor. With a key configured it asks a cheap
 * model; without one it rotates through the unmuted participants.
 */
export async function pickSpeakers(
  session: Session,
  max = 3,
  signal?: AbortSignal,
  options: { allowEmpty?: boolean; heuristicFallback?: number } = {},
): Promise<Participant[]> {
  const available = session.participants.filter((p) => !p.muted);
  if (!available.length) return [];

  const lastHuman = [...session.transcript].reverse().find((message) => message.kind === "human");
  const brief = lastHuman ? isAcknowledgement(lastHuman.text) : false;
  const limit = brief ? 1 : max;
  const fallbackCount = Math.max(
    0,
    Math.min(options.heuristicFallback ?? Math.min(2, limit), limit),
  );
  const provider = cheapProvider();

  if (!provider) {
    if (options.allowEmpty && fallbackCount === 0) return [];
    return heuristicSpeakers(session, fallbackCount || limit);
  }

  const roster = session.participants
    .map((p) => `- ${p.id}: ${p.name} (${p.role})${p.muted ? " — MUTEADO, no puede hablar" : ""}`)
    .join("\n");

  const recent = session.transcript
    .filter((message) => message.kind === "agent")
    .slice(-4)
    .map((message) => `- ${message.speakerName}: "${message.text.slice(0, 140)}"`)
    .join("\n");

  const system = `Eres el moderador de una reunión. Decides quién toma la palabra y en qué orden.

Participantes:
${roster}

Lo último que dijeron los agentes:
${recent || "(nadie habló todavía)"}

Reglas:
- Elige entre ${options.allowEmpty ? 0 : 1} y ${limit} participantes NO muteados.
- No hagas hablar a todos: solo a quien tenga algo nuevo y concreto que aportar.
- Si nadie aporta algo distinto, ${options.allowEmpty ? 'responde {"speakers": []}' : "elige solo al más relevante"}.
- Cada participante habla como máximo una vez por ronda: nunca repitas un id.
- Si el humano se dirigió a un rol, elige solo a esa persona.
- Si el humano solo saludó, agradeció o confirmó, elige exactamente 1.
- Varía: evita que siempre contesten los mismos.
- Responde SOLO con JSON válido: {"speakers": ["id1", "id2"]}`;

  try {
    const raw = await completeChat({
      provider,
      model: CHEAP_MODELS[provider],
      system,
      messages: [
        {
          role: "user",
          content: `Agenda: ${session.agenda || "sin agenda"}\n\nConversación:\n${transcriptForPrompt(session)}\n\n¿Quién habla ahora?`,
        },
      ],
      apiKey: keyFor(provider),
      signal,
      maxTokens: 120,
      temperature: 0.3,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { speakers?: unknown }) : null;
    const ids = Array.isArray(parsed?.speakers)
      ? parsed.speakers.filter((id): id is string => typeof id === "string")
      : [];

    const seen = new Set<string>();
    const chosen = ids
      .map((id) => available.find((p) => p.id === id))
      .filter((p): p is Participant => Boolean(p))
      .filter((participant) => {
        if (seen.has(participant.id)) return false;
        seen.add(participant.id);
        return true;
      })
      .slice(0, limit);

    if (chosen.length) return chosen;
    if (options.allowEmpty) return [];
    return heuristicSpeakers(session, Math.min(2, limit));
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    console.warn("[director] fallback:", (error as Error).message);
    if (options.allowEmpty && fallbackCount === 0) return [];
    return heuristicSpeakers(session, fallbackCount || Math.min(2, limit));
  }
}

function heuristicMinutes(session: Session): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  if (session.agenda) lines.push(`**Agenda:** ${session.agenda}`);
  lines.push("");
  lines.push("## Resumen");
  const agents = new Set(session.transcript.filter((m) => m.kind === "agent").map((m) => m.speakerName));
  const humans = session.transcript.filter((m) => m.kind === "human").length;
  const minutes = Math.max(1, Math.round(((session.endedAt ?? Date.now()) - session.createdAt) / 60000));
  lines.push(
    `Reunión de ${minutes} ${minutes === 1 ? "minuto" : "minutos"} con ${agents.size} ${
      agents.size === 1 ? "agente" : "agentes"
    } y ${humans} ${humans === 1 ? "intervención humana" : "intervenciones humanas"}.`,
  );
  lines.push("");
  lines.push("## Intervenciones");
  for (const message of session.transcript) {
    lines.push(`- **${message.speakerName}:** ${message.text}`);
  }
  return lines.join("\n");
}

export async function writeMinutes(session: Session, signal?: AbortSignal): Promise<string> {
  const provider = cheapProvider();
  if (!provider) return heuristicMinutes(session);

  try {
    const markdown = await completeChat({
      provider,
      model: CHEAP_MODELS[provider],
      system: `Eres el secretario de una reunión. Escribes minutas en markdown, en español, sin relleno.

Formato exacto:
# {título}
**Agenda:** ...
## Decisiones
- ...
## Acciones
- [ ] {tarea} — {responsable}
## Riesgos abiertos
- ...

Usa solo lo que se dijo. Si no hubo decisiones, escribe "Sin decisiones cerradas".`,
      messages: [
        {
          role: "user",
          content: `Título: ${session.title}\nAgenda: ${session.agenda || "sin agenda"}\n\n${
            session.summary ? `Resumen previo:\n${session.summary}\n\n` : ""
          }Transcripción:\n${session.transcript
            .slice(-30)
            .map((m) => `${m.speakerName}: ${m.text.slice(0, 300)}`)
            .join("\n")}`,
        },
      ],
      apiKey: keyFor(provider),
      signal,
      maxTokens: 600,
      temperature: 0.3,
    });
    return markdown;
  } catch (error) {
    console.warn("[minutes] fallback:", (error as Error).message);
    return heuristicMinutes(session);
  }
}

export function searchSnippet(message: Message): string {
  return message.text.length > 90 ? `${message.text.slice(0, 90)}…` : message.text;
}
