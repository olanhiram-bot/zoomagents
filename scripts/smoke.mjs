/**
 * Smoke test for the room: runs two rounds over WebSocket, ends the meeting and
 * checks that no two agent interventions are near-duplicates.
 *
 *   npm run smoke
 */
import WebSocket from "ws";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";

const STOP = new Set([
  "que", "de", "la", "el", "los", "las", "un", "una", "y", "o", "pero", "en", "con", "por",
  "para", "del", "al", "se", "su", "sus", "es", "son", "esta", "estan", "esto", "eso", "como",
  "mas", "ya", "lo", "le", "les", "me", "mi", "nos", "si", "no", "hay", "muy", "sin", "sobre",
  "entre", "cuando", "donde", "porque", "tambien", "puede", "hacer", "hace", "ser", "tiene",
  "voy", "vos", "vas", "va", "hemos", "han", "fue", "era", "The", "and", "for", "with",
]);

function tokens(text) {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
}

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size < 4 || right.size < 4) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / (left.size + right.size - shared);
}

const profiles = await fetch(`${BASE}/api/profiles/seed`, { method: "POST" }).then((r) => r.json());
// Two agents keep the smoke run short; each one is a real model call.
const roomProfiles = profiles.slice(0, 2);

const session = await fetch(`${BASE}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Smoke test",
    agenda: "Revisar el estado del sprint y decidir qué entra en producción.",
    speakingMode: "all",
    profileIds: roomProfiles.map((profile) => profile.id),
    muted: {},
  }),
}).then((r) => r.json());

console.log(`sala ${session.id} · ${session.participants.length} agentes`);
console.log(
  session.participants.map((p) => `${p.role}=${p.provider}`).join(" | "),
);

const agentMessages = [];
const ws = new WebSocket(`ws://localhost:8787/ws?sessionId=${session.id}`);

let resolveListening = null;
let resolveMinutes = null;

ws.on("message", (raw) => {
  const event = JSON.parse(raw);
  if (event.type === "phase") {
    if (event.phase === "listening" && resolveListening) {
      const resolve = resolveListening;
      resolveListening = null;
      resolve();
    }
    if (event.phase === "ended") console.log("\n· reunión terminada");
  }
  if (event.type === "turn_end" && event.message.kind === "agent") {
    agentMessages.push(event.message);
    console.log(`  ${event.message.speakerName}: ${event.message.text}`);
  }
  if (event.type === "turn_drop") {
    console.log(`  (descartado por repetido: ${event.speakerId})`);
  }
  if (event.type === "error") {
    console.log(`  [ERROR] ${event.message}`);
  }
  if (event.type === "minutes" && resolveMinutes) {
    const resolve = resolveMinutes;
    resolveMinutes = null;
    resolve(event.markdown);
  }
});

function round(text) {
  return new Promise((resolve) => {
    resolveListening = resolve;
    ws.send(JSON.stringify({ type: "say", text }));
  });
}

await new Promise((resolve) => ws.on("open", resolve));

console.log("\nRonda 1");
await round("¿Lanzamos el viernes o movemos a la semana siguiente?");
console.log("\nRonda 2");
await round("Ok, entonces cerremos el plan y asignemos responsables.");

const minutesPromise = new Promise((resolve) => {
  resolveMinutes = resolve;
});
ws.send(JSON.stringify({ type: "end" }));
const minutes = await Promise.race([
  minutesPromise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout de minuta")), 30000)),
]);

console.log("\n=== MINUTA ===\n" + minutes.slice(0, 400));

let worst = { score: 0, a: null, b: null };
for (let i = 0; i < agentMessages.length; i++) {
  for (let j = i + 1; j < agentMessages.length; j++) {
    const score = similarity(agentMessages[i].text, agentMessages[j].text);
    if (score > worst.score) {
      worst = { score, a: agentMessages[i], b: agentMessages[j] };
    }
  }
}

console.log("\n=== REPETICIÓN ===");
console.log(`intervenciones: ${agentMessages.length}`);
console.log(`similitud máxima: ${worst.score.toFixed(2)}`);
if (worst.score >= 0.55) {
  console.log(`DUPLICADO: "${worst.a.text}" ↔ "${worst.b.text}"`);
  process.exit(1);
}
console.log("OK: sin intervenciones repetidas");

ws.close();
process.exit(0);
