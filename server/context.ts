import type { Message, Session } from "../shared/types.js";
import { CHEAP_MODELS, completeChat, type ChatMessage } from "./providers.js";
import { hasKey, keyFor } from "./store.js";

/** Context budget. Everything here is intentionally small: it is a meeting, not a repo. */
export const RECENT_MESSAGES = 8;
export const MAX_MESSAGE_CHARS = 520;
export const SUMMARY_TRIGGER = 18;
export const SUMMARY_CHARS = 1_200;
export const SYSTEM_CHAR_BUDGET = 11_000;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function truncateMiddle(text: string, limit = MAX_MESSAGE_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const head = Math.floor(limit * 0.7);
  const tail = limit - head - 1;
  return `${clean.slice(0, head)}…${clean.slice(-tail)}`;
}

function cheapProvider(): "google" | "anthropic" | "openai" | null {
  return (["google", "anthropic", "openai"] as const).find((provider) => hasKey(provider)) ?? null;
}

function lineFor(message: Message): string {
  return `${message.speakerName}: ${truncateMiddle(message.text, 220)}`;
}

export function heuristicSummary(previous: string | undefined, slice: Message[]): string {
  const head = previous?.trim() ? `${previous.trim()}\n` : "";
  return `${head}${slice.map(lineFor).join("\n")}`.slice(-SUMMARY_CHARS);
}

async function summarize(
  session: Session,
  through: number,
  signal?: AbortSignal,
): Promise<{ summary: string; through: number } | null> {
  const from = session.summaryThrough ?? 0;
  const cutoff = Math.min(through, Math.max(from, session.transcript.length - 2));
  if (cutoff <= from) return null;

  const slice = session.transcript.slice(from, cutoff);
  if (!slice.length) return null;

  const provider = cheapProvider();
  let summary = "";

  if (provider) {
    try {
      const raw = await completeChat({
        provider,
        model: CHEAP_MODELS[provider],
        apiKey: keyFor(provider),
        signal,
        maxTokens: 240,
        temperature: 0.2,
        system: `Eres el secretario de una reunión. Resume el tramo en español, máximo 120 palabras.
Conserva: decisiones, posturas de cada participante, datos concretos y preguntas abiertas.
Sin relleno, sin saludos, sin listas largas. No inventes nada.`,
        messages: [
          {
            role: "user",
            content: `${session.summary ? `Resumen previo:\n${session.summary}\n\n` : ""}Nuevas intervenciones:\n${slice
              .map(lineFor)
              .join("\n")}`,
          },
        ],
      });
      summary = raw.trim();
    } catch {
      summary = "";
    }
  }

  return {
    summary: (summary || heuristicSummary(session.summary, slice)).slice(-SUMMARY_CHARS),
    through: cutoff,
  };
}

/** Compacts only when enough new turns accumulated. */
export async function ensureSummary(session: Session, signal?: AbortSignal): Promise<boolean> {
  const pending = session.transcript.length - (session.summaryThrough ?? 0);
  if (pending < SUMMARY_TRIGGER) return false;

  const result = await summarize(session, session.transcript.length - 4, signal);
  if (!result) return false;

  session.summary = result.summary;
  session.summaryThrough = result.through;
  return true;
}

/** Manual `/compact`: folds everything except the last exchange. */
export async function compactNow(session: Session): Promise<boolean> {
  if (session.transcript.length <= 4) return false;
  const result = await summarize(session, session.transcript.length - 2);
  if (!result) return false;

  session.summary = result.summary;
  session.summaryThrough = result.through;
  return true;
}

/**
 * Summary + recent turns + the current round context. Older turns never travel
 * raw again once compacted.
 */
export function buildConversation(
  session: Session,
  selfId: string,
  context: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const start = session.summaryThrough ?? 0;
  const recent = session.transcript.slice(start).slice(-RECENT_MESSAGES);

  if (session.summary) {
    messages.push({
      role: "user",
      content: `Resumen de la reunión hasta ahora (contexto; no lo repitas):\n${session.summary}`,
    });
  }

  for (const message of recent) {
    const who = message.speakerId === selfId ? "Tú" : message.speakerName;
    messages.push({
      role: message.kind === "human" ? "user" : "assistant",
      content: `${who}: ${truncateMiddle(message.text)}`,
    });
  }

  messages.push({ role: "user", content: context });
  // Keep the history starting with a user turn for stricter providers.
  if (messages[0]?.role !== "user") {
    messages.unshift({ role: "user", content: "(Comienza la reunión.)" });
  }

  return messages;
}

export function estimateConversation(system: string, messages: ChatMessage[]): number {
  return (
    estimateTokens(system) +
    messages.reduce((total, message) => total + estimateTokens(message.content) + 4, 0)
  );
}
