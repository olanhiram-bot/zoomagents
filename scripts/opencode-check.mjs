/**
 * Checks the OpenCode transport end to end: creates a one-agent room, sends a
 * turn through `opencode run`, and prints the reply. Requires a working
 * `opencode` CLI and the server on :8787.
 *
 *   node scripts/opencode-check.mjs [model]
 */
import WebSocket from "ws";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const model = process.argv[2] ?? "opencode/big-pickle";

const session = await fetch(`${BASE}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "OpenCode check",
    agenda: "comprobar el transporte de OpenCode",
    participants: [
      {
        name: "OpenCode",
        role: "Backend Dev",
        provider: "opencode",
        model,
        system: "Eres el backend dev. Responde breve y concreto, sin herramientas.",
        muted: false,
      },
    ],
  }),
}).then((response) => response.json());

console.log(`sala ${session.id} · ${session.participants[0].provider} / ${session.participants[0].model}`);

const ws = new WebSocket(`ws://localhost:8787/ws?sessionId=${session.id}`);
let text = "";

ws.on("message", (raw) => {
  const event = JSON.parse(raw);
  if (event.type === "phase") console.log("· phase", event.phase);
  if (event.type === "delta") {
    text += event.text;
    process.stdout.write(event.text);
  }
  if (event.type === "turn_end" && event.message.kind === "agent") {
    console.log(`\n\nOK: ${event.message.text.length} caracteres`);
    process.exit(0);
  }
  if (event.type === "error") {
    console.log(`\nERROR: ${event.message}`);
    process.exit(1);
  }
});

await new Promise((resolve) => ws.on("open", resolve));
ws.send(JSON.stringify({ type: "say", text: "En una frase: ¿qué probarías primero antes de lanzar?" }));

setTimeout(() => {
  console.log(`\nTIMEOUT (${text.length} caracteres recibidos)`);
  process.exit(1);
}, 110_000);
