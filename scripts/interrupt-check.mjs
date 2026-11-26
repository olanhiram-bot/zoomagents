/**
 * Checks that a message sent while agents hold the floor interrupts the round
 * and becomes the next turn (server-side pendingSay queue).
 *
 *   node scripts/interrupt-check.mjs
 */
import WebSocket from "ws";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const profiles = await fetch(`${BASE}/api/profiles/seed`, { method: "POST" }).then((r) => r.json());

const session = await fetch(`${BASE}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Interrupt check",
    agenda: "interrumpir a mitad de ronda",
    speakingMode: "all",
    profileIds: profiles.slice(0, 2).map((profile) => profile.id),
    muted: {},
  }),
}).then((r) => r.json());

console.log(`sala ${session.id} · ${session.participants.length} agentes`);

const ws = new WebSocket(`ws://localhost:8787/ws?sessionId=${session.id}`);
let human = 0;
let phase = "listening";
const agentTurns = [];

ws.on("message", (raw) => {
  const event = JSON.parse(raw);
  if (event.type === "turn_end" && event.message.kind === "human") {
    human += 1;
    console.log(`humano ${human}: ${event.message.text.slice(0, 70)}`);
  }
  if (event.type === "turn_end" && event.message.kind === "agent") {
    agentTurns.push(event.message);
    console.log(`  agente: ${event.message.text.slice(0, 70)}`);
  }
  if (event.type === "phase") phase = event.phase;
  if (event.type === "error") console.log(`  [ERROR] ${event.message}`);
});

await new Promise((resolve) => ws.on("open", resolve));

ws.send(
  JSON.stringify({
    type: "say",
    text: "Investiga a fondo la carpeta de trabajo y haz una lista larga de todo lo que encuentres.",
  }),
);

// Interrupt while the first round is still running.
await new Promise((resolve) => setTimeout(resolve, 2500));
console.log("→ interrumpiendo con un segundo mensaje");
ws.send(
  JSON.stringify({
    type: "say",
    text: "Espera. Responde solo con la palabra: alto.",
  }),
);

const deadline = Date.now() + 90_000;
while (Date.now() < deadline && (human < 2 || phase !== "listening")) {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

await new Promise((resolve) => setTimeout(resolve, 800));
console.log(`humanos: ${human} · respuestas de agentes: ${agentTurns.length}`);
const ok = human === 2 && agentTurns.length >= 1;
console.log(ok ? "OK: la interrupción tomó la palabra" : "FALLO: revisa la cola");
ws.close();
process.exit(ok ? 0 : 1);
