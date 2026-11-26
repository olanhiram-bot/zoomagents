/**
 * End-to-end check for profiles + soul + memory:
 *  1. seeds the sample team (only if the library is empty)
 *  2. creates a room with every profile and speakingMode=all
 *  3. runs one round, ends the meeting, then verifies memory on disk
 *
 *   node scripts/profiles-check.mjs
 */
import WebSocket from "ws";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";

const profiles = await fetch(`${BASE}/api/profiles/seed`, { method: "POST" }).then((r) => r.json());
console.log(`perfiles: ${profiles.length}`);
for (const profile of profiles) {
  console.log(`  ${profile.name} (${profile.role}) · ${profile.provider} · alma ${profile.soul.length}b · recuerdos ${profile.memory.observations}`);
}

// Skip providers that hit plan limits during the test (Codex is rate-limited
// on this machine); "all" means every agent with voice, not every provider.
const roomProfiles = profiles.slice(0, 2);

const session = await fetch(`${BASE}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Check de perfiles",
    agenda: "Decidir si el equipo puede hablar sin moderador.",
    speakingMode: "all",
    profileIds: roomProfiles.map((profile) => profile.id),
    muted: {},
  }),
}).then((r) => r.json());

console.log(`\nsala ${session.id} · modo ${session.speakingMode} · ${session.participants.length} agentes`);
console.log(session.participants.map((p) => `${p.name}=${p.provider}`).join(" | "));

const ws = new WebSocket(`ws://localhost:8787/ws?sessionId=${session.id}`);
const spoken = [];
let resolveListening = null;
let resolveMinutes = null;
let resolveMemory = null;

ws.on("message", (raw) => {
  const event = JSON.parse(raw);
  if (event.type === "turn_end" && event.message.kind === "agent") {
    spoken.push(event.message.speakerName);
    console.log(`  ${event.message.speakerName}: ${event.message.text.slice(0, 90)}`);
  }
  if (event.type === "turn_drop") console.log(`  (descartado por repetido: ${event.speakerId})`);
  if (event.type === "error") console.log(`  [ERROR] ${event.message}`);
  if (event.type === "phase" && event.phase === "listening" && resolveListening) {
    const resolve = resolveListening;
    resolveListening = null;
    resolve();
  }
  if (event.type === "minutes" && resolveMinutes) {
    const resolve = resolveMinutes;
    resolveMinutes = null;
    resolve(event.markdown);
  }
  if (event.type === "memory" && resolveMemory) {
    const resolve = resolveMemory;
    resolveMemory = null;
    resolve(event.updated);
  }
});

await new Promise((resolve) => ws.on("open", resolve));

const round = new Promise((resolve) => {
  resolveListening = resolve;
  ws.send(JSON.stringify({ type: "say", text: "¿Podemos decidir hoy sin moderador?" }));
});
await round;

console.log(`\nhablaron ${spoken.length} de ${session.participants.length}`);
if (spoken.length < session.participants.length) {
  console.log("FALLO: no hablaron todos los agentes");
  process.exit(1);
}

const minutesPromise = new Promise((resolve) => {
  resolveMinutes = resolve;
});
const memoryPromise = new Promise((resolve) => {
  resolveMemory = resolve;
});
ws.send(JSON.stringify({ type: "end" }));

const minutes = await Promise.race([
  minutesPromise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout minuta")), 30_000)),
]);
const updated = await Promise.race([
  memoryPromise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout memoria")), 40_000)),
]);

console.log(`minuta: ${minutes.length} caracteres · memoria actualizada en ${updated} agentes`);

const after = await fetch(`${BASE}/api/profiles`).then((r) => r.json());
const withMemory = after.filter((profile) => profile.memory.observations > 0);
console.log(`perfiles con observaciones: ${withMemory.length}/${after.length}`);

const first = await fetch(`${BASE}/api/profiles/${after[0].id}/memory`).then((r) => r.json());
console.log(`ejemplo (${after[0].name}) USER.md: ${JSON.stringify(first.docs.user.slice(0, 120))}`);
console.log(`ejemplo (${after[0].name}) MEMORY.md: ${JSON.stringify(first.docs.memory.slice(0, 120))}`);

if (!withMemory.length) {
  console.log("FALLO: no se escribió memoria");
  process.exit(1);
}

console.log("\nOK: perfiles, todos hablan y memoria persistente");
process.exit(0);
