/**
 * Verifies terminal access and interruption with a real CLI (OpenCode).
 * Creates a probe workspace with a secret file, asks the agent to read it,
 * then starts a second turn and interrupts it.
 *
 *   node scripts/tools-check.mjs
 */
import fs from "node:fs";
import WebSocket from "ws";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const workspace = "/tmp/opencode/za-probe";
fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(`${workspace}/hecho.txt`, "El secreto es 42.\n", "utf8");

const profile = await fetch(`${BASE}/api/profiles`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Investigador",
    role: "General",
    roleId: "general",
    skillIds: ["research"],
    provider: "opencode",
    model: "opencode/big-pickle",
  }),
}).then((r) => r.json());

const session = await fetch(`${BASE}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Terminal check",
    agenda: "leer un archivo con la terminal",
    speakingMode: "all",
    profileIds: [profile.id],
    workspace,
    toolsEnabled: true,
  }),
}).then((r) => r.json());

console.log(`sala ${session.id} · tools=${session.toolsEnabled} · cwd=${session.workspace}`);

const ws = new WebSocket(`ws://localhost:8787/ws?sessionId=${session.id}`);
let resolveTurn = null;
let resolveListening = null;
let text = "";
let lastPhase = "";

ws.on("message", (raw) => {
  const event = JSON.parse(raw);
  if (event.type === "delta") {
    text += event.text;
    process.stdout.write(event.text);
  }
  if (event.type === "phase") {
    lastPhase = event.phase;
    if (event.phase === "listening" && resolveListening) {
      const resolve = resolveListening;
      resolveListening = null;
      resolve();
    }
  }
  if (event.type === "approval") {
    console.log(`\n[aprobación] ${event.request.agent}: ${event.request.command}`);
    ws.send(JSON.stringify({ type: "approval", id: event.request.id, allow: false }));
  }
  if (event.type === "turn_end" && event.message.kind === "agent") {
    if (resolveTurn) {
      const resolve = resolveTurn;
      resolveTurn = null;
      resolve(event.message.text);
    }
  }
  if (event.type === "error") console.log(`\n[ERROR] ${event.message}`);
});

await new Promise((resolve) => ws.on("open", resolve));

const firstTurn = new Promise((resolve) => {
  resolveTurn = resolve;
});
ws.send(
  JSON.stringify({
    type: "say",
    text: "Usa la terminal para leer hecho.txt en tu carpeta de trabajo y dime exactamente qué secreto contiene. No adivines.",
  }),
);

const answer = await Promise.race([
  firstTurn,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout de herramienta")), 110_000)),
]);

console.log(`\n\nrespuesta: ${JSON.stringify(answer.slice(0, 200))}`);
console.log(`leyó el archivo: ${/42/.test(answer)}`);

// Second turn: interrupt a live CLI process.
const started = Date.now();
const listening = new Promise((resolve) => {
  resolveListening = resolve;
});
ws.send(
  JSON.stringify({
    type: "say",
    text: "Investiga el workspace a fondo: lista todos los archivos, lee cada uno y resúmelo. Tómate tu tiempo.",
  }),
);

await new Promise((resolve) => setTimeout(resolve, 3500));
const { execSync } = await import("node:child_process");
// The bracket avoids matching the grep process itself.
const liveCli = () =>
  execSync("ps -eo pid,cmd | grep '[o]pencode run' || true").toString().trim();
const beforeStop = liveCli();
ws.send(JSON.stringify({ type: "stop" }));
await Promise.race([listening, new Promise((_, reject) => setTimeout(() => reject(new Error("no volvió a listening")), 15_000))]);
const elapsed = Date.now() - started;
await new Promise((resolve) => setTimeout(resolve, 1500));
const afterStop = liveCli();

console.log(`\nproceso vivo antes de Detener: ${Boolean(beforeStop)}`);
console.log(`proceso vivo después de Detener: ${Boolean(afterStop)}`);
console.log(`fase tras Detener: ${lastPhase} · ${elapsed}ms`);

await fetch(`${BASE}/api/profiles/${profile.id}`, { method: "DELETE" });
ws.close();

const ok = /42/.test(answer) && !afterStop;
console.log(ok ? "\nOK: terminal e interrupción" : "\nFALLO: revisa la salida");
process.exit(ok ? 0 : 1);
