import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import type { ClientEvent, Participant, ProviderId, ProviderStatus, Session } from "../shared/types.js";
import type { AuthMode, SpeakingMode } from "../shared/types.js";
import { authMode, cliStatuses, setAuthMode, transportFor } from "./auth.js";
import {
  deleteRole,
  deleteSkill,
  ensureLibrary,
  library,
  saveRole,
  saveSkill,
} from "./library.js";
import { readObservations } from "./memory.js";
import { modelCatalog } from "./models.js";
import { DEFAULT_MODELS } from "./providers.js";
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  readMemoryDocs,
  seedSampleTeam,
  updateProfile,
} from "./profiles.js";
import { analyzeProject } from "./project-analysis.js";
import { browseFolders, validateProjects } from "./projects.js";
import { previewPrompt, Room } from "./room.js";
import { rtkStatus } from "./rtk.js";
import { listT3Threads, readT3Changes, sendToT3Thread, showT3Thread, startT3Thread } from "./t3.js";
import { openLoginTerminal } from "./terminal.js";

// Node's built-in .env loader: no dotenv dependency, and a missing file is fine.
try {
  process.loadEnvFile?.();
} catch {
  /* sin .env: se usan las keys guardadas desde la UI */
}
import {
  clearKey,
  hasKey,
  keyFor,
  listSessions,
  loadSession,
  maskKey,
  saveSession,
  saveSettings,
} from "./store.js";

const PORT = Number(process.env.PORT ?? 8787);
const VALID_PROVIDERS: ProviderId[] = ["anthropic", "openai", "google", "opencode", "mock"];
const LOGIN_COMMANDS = new Set(["opencode auth login", "claude", "codex login", "gemini"]);

const app = express();
app.use(express.json({ limit: "1mb" }));

const rooms = new Map<string, Room>();
const roomsByToken = new Map<string, Room>();

function registerRoom(room: Room) {
  rooms.set(room.session.id, room);
  roomsByToken.set(room.token, room);
  return room;
}

async function providerSnapshot() {
  const clis = await cliStatuses();
  const providers: ProviderStatus[] = [];
  const hints: Record<string, string> = {
    anthropic: "Claude Code CLI con tu plan, o una API key.",
    openai: "Codex CLI con tu cuenta de ChatGPT, o una API key.",
    google: "Gemini CLI con tu cuenta de Google, o una API key.",
    opencode: "Gateway con login propio y cientos de modelos. Se elige modelo por agente.",
    mock: "Respuestas simuladas. Sirve para probar la sala sin gastar tokens.",
  };
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    opencode: "OpenCode",
    mock: "Mock",
  };

  // Mock is an internal test double only: it never appears in the product UI.
  for (const id of VALID_PROVIDERS.filter((provider) => provider !== "mock")) {
    const label = labels[id] ?? id;
    providers.push({
      id,
      label,
      configured: (await transportFor(id)) !== "none",
      apiConfigured: hasKey(id),
      hint: hints[id] ?? "",
      cli: clis.find((cli) => cli.provider === id) ?? null,
    });
  }

  return {
    mode: authMode(),
    providers,
    masked: {
      anthropic: maskKey("anthropic"),
      openai: maskKey("openai"),
      google: maskKey("google"),
    },
  };
}

app.post("/api/approvals", async (req, res) => {
  const token = String(req.body?.token ?? "");
  const room = roomsByToken.get(token);
  if (!room) {
    res.status(403).json({ allow: false });
    return;
  }
  const decision = await room.requestApproval(
    String(req.body?.agent ?? "Agente").slice(0, 40),
    String(req.body?.command ?? "").slice(0, 500),
  );
  res.json(decision);
});

app.get("/api/library", (_req, res) => {
  res.json(library());
});

app.post("/api/skills", (req, res) => {
  res.json(saveSkill(req.body ?? {}));
});

app.patch("/api/skills/:id", (req, res) => {
  res.json(saveSkill({ ...(req.body ?? {}), id: req.params.id }));
});

app.delete("/api/skills/:id", (req, res) => {
  res.json({ ok: deleteSkill(req.params.id) });
});

app.post("/api/roles", (req, res) => {
  res.json(saveRole(req.body ?? {}));
});

app.patch("/api/roles/:id", (req, res) => {
  res.json(saveRole({ ...(req.body ?? {}), id: req.params.id }));
});

app.delete("/api/roles/:id", (req, res) => {
  res.json({ ok: deleteRole(req.params.id) });
});

app.get("/api/profiles", (_req, res) => {
  res.json(listProfiles());
});

app.post("/api/profiles", (req, res) => {
  res.json(createProfile(req.body ?? {}));
});

app.post("/api/profiles/seed", (_req, res) => {
  res.json(seedSampleTeam());
});

app.get("/api/profiles/:id", (req, res) => {
  const profile = getProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ error: "Agente no encontrado." });
    return;
  }
  res.json(profile);
});

app.patch("/api/profiles/:id", (req, res) => {
  const profile = updateProfile(req.params.id, req.body ?? {});
  if (!profile) {
    res.status(404).json({ error: "Agente no encontrado." });
    return;
  }
  res.json(profile);
});

app.delete("/api/profiles/:id", (req, res) => {
  res.json({ ok: deleteProfile(req.params.id) });
});

app.get("/api/profiles/:id/prompt", (req, res) => {
  const prompt = previewPrompt(req.params.id);
  if (!prompt) {
    res.status(404).json({ error: "Agente no encontrado." });
    return;
  }
  res.json({ prompt });
});

app.get("/api/profiles/:id/memory", (req, res) => {
  const profile = getProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ error: "Agente no encontrado." });
    return;
  }
  res.json({
    docs: readMemoryDocs(profile.id),
    observations: readObservations(profile.id, 30),
  });
});

app.put("/api/profiles/:id/memory", (req, res) => {
  const profile = updateProfile(req.params.id, {
    memory: {
      user: typeof req.body?.user === "string" ? req.body.user : undefined,
      memory: typeof req.body?.memory === "string" ? req.body.memory : undefined,
    },
  });
  if (!profile) {
    res.status(404).json({ error: "Agente no encontrado." });
    return;
  }
  res.json(profile);
});

app.get("/api/providers", async (_req, res) => {
  res.json(await providerSnapshot());
});

app.get("/api/auth", async (_req, res) => {
  res.json({ mode: authMode(), clis: await cliStatuses(true) });
});

app.get("/api/models", async (req, res) => {
  res.json(await modelCatalog(req.query.refresh === "1"));
});

app.get("/api/tools", async (_req, res) => {
  res.json({ rtk: await rtkStatus(false) });
});

app.post("/api/auth/terminal", (req, res) => {
  const command = String(req.body?.command ?? "").trim();
  if (!LOGIN_COMMANDS.has(command)) {
    res.status(400).json({ error: "Comando no permitido." });
    return;
  }
  const terminal = openLoginTerminal(command);
  if (!terminal) {
    res.status(501).json({
      error: `No encontré un emulador de terminal. Ejecuta \`${command}\` en tu terminal.`,
    });
    return;
  }
  res.json({ terminal, command });
});

app.post("/api/auth/mode", async (req, res) => {
  const mode = req.body?.mode as AuthMode | undefined;
  if (!mode || !["auto", "cli", "api"].includes(mode)) {
    res.status(400).json({ error: "Modo inválido." });
    return;
  }
  setAuthMode(mode);
  res.json(await providerSnapshot());
});

app.post("/api/settings", async (req, res) => {
  const keys = (req.body?.keys ?? {}) as Record<string, string>;
  const patch: Parameters<typeof saveSettings>[0] = { keys: {} };
  for (const name of ["anthropic", "openai", "google"] as const) {
    const value = keys[name];
    if (typeof value === "string") patch.keys[name] = value;
  }
  saveSettings(patch);
  res.json(await providerSnapshot());
});

app.delete("/api/settings/:provider", (req, res) => {
  const provider = req.params.provider;
  if (provider === "anthropic" || provider === "openai" || provider === "google") {
    clearKey(provider);
  }
  res.json({ ok: true });
});

function isLocalRequest(req: express.Request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") &&
    /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? "") &&
    (!req.headers.origin || /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.origin));
}

app.get("/api/projects/folders", (req, res) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "Abre ZoomAgents en localhost para elegir carpetas." });
    return;
  }
  try {
    res.json(browseFolders(typeof req.query.path === "string" ? req.query.path : ""));
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/projects/t3-threads", async (req, res) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "Abre ZoomAgents en localhost para consultar T3 Code." });
    return;
  }
  const controller = new AbortController();
  res.once("close", () => controller.abort());
  let workspace: string;
  try {
    ({ workspace } = validateProjects({ workspace: req.query.path, references: [] }));
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  try {
    res.json((await listT3Threads(workspace, controller.signal)).slice(0, 50));
  } catch (error) {
    if (controller.signal.aborted) return;
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    res.status(503).json({ error: missing
      ? "El comando t3 no está disponible en el servidor de ZoomAgents."
      : "No se pudo consultar T3 Code. Comprueba que su servidor esté activo y que el proyecto esté registrado." });
  }
});

app.use("/api/t3", (req, res, next) => {
  if (!isLocalRequest(req) || req.headers["sec-fetch-site"] === "cross-site") {
    res.status(403).json({ error: "Abre ZoomAgents en localhost para acceder a T3 Code." });
    return;
  }
  try {
    res.locals.workspace = validateProjects({ workspace: req.query.path, references: [] }).workspace;
    next();
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/t3/threads/:id", async (req, res) => {
  const controller = new AbortController();
  res.once("close", () => controller.abort());
  try {
    const detail = await showT3Thread(res.locals.workspace, req.params.id, controller.signal);
    if (!detail) res.status(404).json({ error: "El hilo no pertenece a este proyecto." });
    else res.json(detail);
  } catch {
    if (!controller.signal.aborted) res.status(502).json({ error: "T3 Code no pudo cargar el hilo." });
  }
});

app.post("/api/t3/instructions", async (req, res) => {
  const { text, id, base } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 12_000 ||
    (id !== undefined && typeof id !== "string") ||
    (base !== undefined && (typeof base !== "string" || !/^[a-z0-9][a-z0-9._/-]{0,149}$/i.test(base)))) {
    res.status(400).json({ error: "Revisa la instrucción y la referencia Git." });
    return;
  }
  try {
    let threadId = id ?? null;
    if (id !== undefined) {
      if (!await sendToT3Thread(res.locals.workspace, id, text.trim())) {
        res.status(404).json({ error: "El hilo no pertenece a este proyecto." });
        return;
      }
    } else {
      threadId = await startT3Thread(res.locals.workspace, text.trim(), base);
    }
    res.json({ ok: true, threadId });
  } catch {
    res.status(502).json({ error: "T3 Code no confirmó el envío. Actualiza los hilos antes de volver a intentarlo." });
  }
});

app.put("/api/t3/rooms/:sessionId/agents/:agentId", async (req, res) => {
  const room = roomFor(req.params.sessionId);
  const workspace = res.locals.workspace;
  const { threadId } = req.body ?? {};
  if (threadId !== null && typeof threadId !== "string") {
    res.status(400).json({ error: "Selecciona un hilo válido." });
    return;
  }
  if (!room || room.session.workspace !== workspace) {
    res.status(404).json({ error: "La sala no pertenece a este proyecto." });
    return;
  }
  try {
    if (threadId !== null && !(await listT3Threads(workspace)).some(({ id }) => id === threadId)) {
      res.status(404).json({ error: "El hilo no pertenece a este proyecto." });
      return;
    }
    if (!room.setT3Thread(workspace, req.params.agentId, threadId)) {
      res.status(409).json({ error: "La sala cambió o el agente ya no está disponible." });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "No se pudo guardar el vínculo con T3 Code." });
  }
});

app.get("/api/t3/changes/:id", async (req, res) => {
  const controller = new AbortController();
  res.once("close", () => controller.abort());
  try {
    const detail = await showT3Thread(res.locals.workspace, req.params.id, controller.signal);
    if (!detail) {
      res.status(404).json({ error: "El hilo no pertenece a este proyecto." });
      return;
    }
    res.json(await readT3Changes(detail.worktree ?? res.locals.workspace, controller.signal));
  } catch {
    if (!controller.signal.aborted) res.status(502).json({ error: "No se pudieron leer los cambios locales de Git." });
  }
});

app.get("/api/projects/analysis", async (req, res) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "Abre ZoomAgents en localhost para analizar el proyecto." });
    return;
  }
  const controller = new AbortController();
  res.once("close", () => controller.abort());
  try {
    const { workspace } = validateProjects({ workspace: req.query.path, references: [] });
    res.json(await analyzeProject(workspace, controller.signal));
  } catch (error) {
    if (!controller.signal.aborted) res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/sessions", (_req, res) => {
  res.json(
    listSessions().map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      phase: session.phase,
      participants: session.participants.length,
    })),
  );
});

app.post("/api/sessions", async (req, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? "").trim() || "Reunión sin título";
  const agenda = String(body.agenda ?? "").slice(0, 500);
  const speakingMode: SpeakingMode =
    body.speakingMode === "all"
      ? "all"
      : body.speakingMode === "moderated"
        ? "moderated"
        : "auto";
  const profileIds: string[] = Array.isArray(body.profileIds)
    ? body.profileIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const muted: Record<string, boolean> =
    body.muted && typeof body.muted === "object" ? (body.muted as Record<string, boolean>) : {};

  const participants: Participant[] = [];

  if (profileIds.length) {
    for (const id of profileIds.slice(0, 32)) {
      const profile = getProfile(id);
      if (!profile) continue;
      // No silent mock fallback: an unconnected provider surfaces an error in
      // the room instead of pretending to be an agent.
      const provider: ProviderId = profile.provider;
      participants.push({
        id: profile.id,
        profileId: profile.id,
        name: profile.name,
        role: profile.role,
        provider,
        model:
          provider === "mock" ? "mock-1" : profile.model || DEFAULT_MODELS[provider],
        muted: Boolean(muted[profile.id]),
        system: profile.soul,
        avatarSeed: profile.avatarSeed,
      });
    }
  } else {
    // Legacy path: sessions created before the profile library existed.
    const input = Array.isArray(body.participants) ? body.participants : [];
    input.slice(0, 16).forEach((raw: any, index: number) => {
      const requested: ProviderId = VALID_PROVIDERS.includes(raw.provider) ? raw.provider : "opencode";
      const provider: ProviderId = requested === "mock" ? "opencode" : requested;
      participants.push({
        id: `a${index + 1}`,
        name: String(raw.name ?? "Agente").slice(0, 40),
        role: String(raw.role ?? "General").slice(0, 40),
        provider,
        model: String(raw.model || DEFAULT_MODELS[provider]).slice(0, 80),
        muted: Boolean(raw.muted),
        system: String(raw.system ?? "").slice(0, 4000),
      });
    });
  }

  if (!participants.length) {
    res.status(400).json({ error: "La sala necesita al menos un agente." });
    return;
  }

  let workspace = process.cwd();
  let projectReferences: string[] | undefined;
  try {
    if (body.projects !== undefined) {
      if (!isLocalRequest(req)) {
        res.status(403).json({ error: "Abre ZoomAgents en localhost para elegir carpetas." });
        return;
      }
      const projects = validateProjects(body.projects);
      workspace = projects.workspace;
      projectReferences = projects.references;
    } else if (typeof body.workspace === "string" && body.workspace &&
      fs.statSync(body.workspace).isDirectory()) {
      workspace = path.resolve(body.workspace);
    }
  } catch (error) {
    if (body.projects !== undefined) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
  }

  const session: Session = {
    id: randomUUID().slice(0, 8),
    title: title.slice(0, 80),
    agenda,
    createdAt: Date.now(),
    phase: "listening",
    activeSpeakerId: null,
    participants,
    transcript: [],
    speakingMode,
    workspace,
    projectReferences,
    toolsEnabled: body.toolsEnabled === true,
    compressTools: body.toolsEnabled === true && body.compressTools !== false,
  };

  saveSession(session);
  registerRoom(new Room(session));
  res.json(session);
});

function roomFor(id: string): Room | undefined {
  const existing = rooms.get(id);
  if (existing) return existing;
  const stored = loadSession(id);
  if (!stored) return undefined;
  return registerRoom(new Room(stored));
}

app.get("/api/sessions/:id", (req, res) => {
  const room = roomFor(req.params.id);
  if (!room) {
    res.status(404).json({ error: "Sesión no encontrada." });
    return;
  }
  res.json(room.session);
});

app.put("/api/sessions/:id/projects", (req, res) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "Abre ZoomAgents en localhost para elegir carpetas." });
    return;
  }
  const room = roomFor(req.params.id);
  if (!room) {
    res.status(404).json({ error: "Sesión no encontrada." });
    return;
  }
  try {
    const projects = validateProjects(req.body);
    if (!room.setProjects(projects)) {
      res.status(409).json({ error: "Espera a que termine el turno para cambiar de proyecto." });
      return;
    }
    res.json(room.session);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/sessions/:id/minutes.md", (req, res) => {
  const session = roomFor(req.params.id)?.session ?? loadSession(req.params.id);
  if (!session) {
    res.status(404).send("Sesión no encontrada.");
    return;
  }
  res.type("text/markdown").send(session.minutes ?? "# Sin minuta\n\nLa reunión no terminó todavía.");
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    keys: { anthropic: hasKey("anthropic"), openai: hasKey("openai"), google: hasKey("google") },
  });
});

const dist = path.resolve(process.cwd(), "dist");
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(dist, "index.html"), (error) => {
    if (error) res.status(404).send("Compila el frontend con `npm run build`.");
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1_500_000 });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/ws", "http://localhost");
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const room = roomFor(sessionId);

  if (!room) {
    ws.send(JSON.stringify({ type: "error", message: "Sesión no encontrada." }));
    ws.close();
    return;
  }

  const localDesktop = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.origin ?? "");
  room.attach(ws);

  ws.on("message", async (raw) => {
    let event: ClientEvent;
    try {
      event = JSON.parse(raw.toString()) as ClientEvent;
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string") return;
    try {
      await room.handle(event, ws, localDesktop);
    } catch (error) {
      console.error("[ws]", error);
      ws.send(JSON.stringify({ type: "error", message: "Error interno de la sala." }));
    }
  });

  ws.on("close", () => room.detach(ws));
  ws.on("error", () => room.detach(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if ((ws as any).isAlive === false) {
      ws.terminate();
      continue;
    }
    (ws as any).isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on("connection", (ws) => {
  (ws as any).isAlive = true;
  ws.on("pong", () => {
    (ws as any).isAlive = true;
  });
});

ensureLibrary();

server.listen(PORT, () => {
  console.log(`ZoomAgents server → http://localhost:${PORT}`);
  const missing = ["anthropic", "openai", "google"].filter((p) => !keyFor(p as ProviderId));
  if (missing.length) {
    console.log(`Sin API key: ${missing.join(", ")}. La sala funciona en modo mock.`);
  }
});

process.on("SIGINT", () => {
  clearInterval(heartbeat);
  server.close(() => process.exit(0));
});
