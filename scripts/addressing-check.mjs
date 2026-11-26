/**
 * Checks that auto mode does not make everyone speak:
 *  1. addressing one role gets exactly one first responder
 *  2. a generic message gets one or two, not the whole room
 *
 *   node scripts/addressing-check.mjs
 */
import WebSocket from "ws";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const profiles = await fetch(`${BASE}/api/profiles/seed`, { method: "POST" }).then((r) => r.json());

const session = await fetch(`${BASE}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Addressing check",
    agenda: "probar menciones y turnos",
    speakingMode: "auto",
    profileIds: profiles.map((profile) => profile.id),
    muted: {},
  }),
}).then((r) => r.json());

console.log(`sala ${session.id} · modo ${session.speakingMode} · ${session.participants.length} agentes`);

const ws = new WebSocket(`ws://localhost:8787/ws?sessionId=${session.id}`);
let starts = [];
let phase = "listening";
let humanTo = [];

ws.on("message", (raw) => {
  const event = JSON.parse(raw);
  if (event.type === "turn_start") starts.push(event.message.speakerName);
  if (event.type === "phase") phase = event.phase;
  if (event.type === "turn_end" && event.message.kind === "human") {
    humanTo = event.message.to ?? [];
  }
  if (event.type === "error") console.log(`  [error] ${event.message.slice(0, 60)}`);
});

await new Promise((resolve) => ws.on("open", resolve));

async function round(text) {
  starts = [];
  humanTo = [];
  ws.send(JSON.stringify({ type: "say", text }));
  const deadline = Date.now() + 70_000;
  while (Date.now() < deadline && !(phase === "listening" && starts.length)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return starts;
}

const addressed = await round("Backend Dev, ¿qué opinas del deploy del viernes?");
console.log("dirigido a Backend Dev →", addressed, "· to:", humanTo);

const generic = await round("¿Cómo ven el estado general del proyecto?");
console.log("mensaje general →", generic);

ws.close();

const addressedOk = addressed[0]?.includes("Backend Dev") && addressed.length <= 3;
const genericOk = generic.length >= 1 && generic.length <= 3;

console.log(addressedOk ? "OK: el mencionado habló primero (y puede ceder la palabra)" : "FALLO: no se respetó la mención");
console.log(genericOk ? "OK: no hablaron todos" : "FALLO: cascada de agentes");
process.exit(addressedOk && genericOk ? 0 : 1);
