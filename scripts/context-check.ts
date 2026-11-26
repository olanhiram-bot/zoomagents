/**
 * Verifies context compaction without any provider:
 *   npx tsx scripts/context-check.ts
 */
import {
  buildConversation,
  compactNow,
  ensureSummary,
  estimateConversation,
  estimateTokens,
} from "../server/context.js";
import type { Session } from "../shared/types.js";

const transcript = Array.from({ length: 40 }, (_, index) => ({
  id: String(index),
  speakerId: index % 3 === 0 ? "human" : "agent-1",
  speakerName: index % 3 === 0 ? "Tú" : "Backend Dev",
  kind: index % 3 === 0 ? ("human" as const) : ("agent" as const),
  text: `Intervención ${index}: ${"detalle técnico con decisiones y riesgos. ".repeat(8)}`,
  createdAt: Date.now() + index,
}));

const session = {
  id: "ctx-check",
  title: "Prueba de contexto",
  agenda: "medir tokens",
  createdAt: Date.now(),
  phase: "listening" as const,
  activeSpeakerId: null,
  participants: [],
  transcript,
  speakingMode: "all" as const,
  workspace: "/tmp",
} as Session;

const raw =
  estimateTokens(transcript.slice(-18).map((message) => message.text).join("\n")) + 750;

const compacted = await ensureSummary(session, new AbortController().signal);
if (!compacted) throw new Error("no compactó");

const messages = buildConversation(session, "agent-1", "Contexto de la ronda actual");
const after = estimateConversation("S".repeat(3000), messages);

console.log(`resumen: ${session.summary?.length ?? 0} caracteres`);
console.log(`cubre: ${session.summaryThrough}/${session.transcript.length} mensajes`);
console.log(`tokens antes (18 turnos + sistema): ${raw}`);
console.log(`tokens después (resumen + 8 turnos + sistema): ${after}`);
console.log(`ahorro: ${Math.round((1 - after / raw) * 100)}%`);
console.log(`incluye resumen: ${messages[0]?.content.startsWith("Resumen")}`);

if (after >= raw) throw new Error("la compactación no redujo el contexto");

// Manual compaction keeps only the last exchange.
const beforeManual = session.summaryThrough;
await compactNow(session);
console.log(`compactación manual: ${beforeManual} → ${session.summaryThrough}`);
console.log("OK: compactación de contexto");
