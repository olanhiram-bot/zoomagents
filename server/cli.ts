import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ProviderId } from "../shared/types.js";
import type { StreamOptions } from "./providers.js";

const TIMEOUT_MS = Number(process.env.ZA_CLI_TIMEOUT_MS ?? 120_000);

type Parsed = {
  text?: string;
  full?: boolean;
  error?: string;
  done?: boolean;
  partId?: string;
};

type Runner = {
  command: string;
  args: string[];
  input: string;
  cwd?: string;
  env?: Record<string, string>;
};

/**
 * Runs one room turn through the official CLI, so authentication stays where the
 * provider expects it: the CLI's own OAuth session. No token ever reaches this app.
 */
export async function* streamCli(provider: ProviderId, options: StreamOptions): AsyncGenerator<string> {
  const prompt = buildPrompt(options, options.tools === true);
  if (options.image && provider === "google") {
    throw new Error("Para analizar pantalla con Gemini, usa el modo API key.");
  }
  const folder = options.image && (provider === "openai" || provider === "opencode")
    ? await mkdtemp(path.join(os.tmpdir(), "zoomagents-screen-"))
    : null;
  try {
    const imagePath = folder ? path.join(folder, "screen.jpg") : undefined;
    if (imagePath && options.image) {
      await writeFile(imagePath, Buffer.from(options.image, "base64"), { mode: 0o600 });
    }
    yield* readRunner(provider, runnerFor(provider, prompt, options, imagePath), options.signal);
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true });
  }
}

async function* readRunner(provider: ProviderId, runner: Runner, signal?: AbortSignal): AsyncGenerator<string> {
  if (provider === "opencode") {
    yield* streamOpenCode(runner, signal);
    return;
  }

  if (provider === "google") {
    const chunks: string[] = [];
    for await (const line of stdoutLines(runner, signal)) chunks.push(line);
    const text = parseGeminiOutput(chunks.join("\n"));
    if (!text) throw new Error("Gemini CLI no devolvió texto. Revisa tu sesión con `gemini`.");
    yield text;
    return;
  }

  let sawText = false;
  let sawPartial = false;

  for await (const line of stdoutLines(runner, signal)) {
    if (!line.trim()) continue;
    const parsed = parseLine(provider, line);
    if (!parsed) continue;
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.text) {
      // Claude emits both deltas and a final assistant block; keep one of them.
      if (parsed.full && sawPartial) continue;
      if (!parsed.full) sawPartial = true;
      sawText = true;
      yield parsed.text;
    }
    if (parsed.done) break;
  }

  if (!sawText) {
    const command = provider === "anthropic" ? "claude" : "codex login";
    throw new Error(`El CLI no devolvió texto. Revisa la sesión con \`${command}\`.`);
  }
}

function buildPrompt(options: StreamOptions, tools: boolean): string {
  const history = options.messages
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Humano" : "Agente"}: ${message.content}`)
    .join("\n");

  if (options.image) return `${options.system}\n\n${history}`;

  if (tools) {
    return `${options.system}

Conversación hasta ahora:
${history}

Tienes acceso a la terminal y a los archivos de la carpeta de trabajo.
- Investiga antes de opinar: lista, busca, lee y corre pruebas cuando aporte.
- No narres cada comando; di en una frase qué encontraste.
- Para sudo, el humano aprueba cada comando. Si lo deniega, busca otra vía.
- No ejecutes nada destructivo sin avisar y sin necesidad.
Responde con tu intervención para la reunión (2 a 4 frases) al terminar de investigar.`;
  }

  return `${options.system}

Conversación hasta ahora:
${history}

Responde únicamente con tu intervención, como si hablaras en voz alta en la reunión.
No uses herramientas, no leas archivos y no expliques tu proceso.`;
}

function modelArgs(envName: string, model?: string): string[] {
  const chosen = (model ?? "").trim() || process.env[envName] || "";
  if (!chosen) return [];
  // Codex only understands its own model family; an API id like gpt-4o-mini
  // would make it fail, so fall back to the CLI default instead.
  if (envName === "ZA_CODEX_MODEL" && !/codex|gpt-5|^o[34]/i.test(chosen)) return [];
  return ["--model", chosen];
}

function runnerFor(provider: ProviderId, prompt: string, options: StreamOptions, imagePath?: string): Runner {
  const model = options.model;
  const tools = options.tools === true;
  const cwd = options.cwd || os.tmpdir();
  const env = options.env;

  switch (provider) {
    case "anthropic":
      return {
        command: "claude",
        args: [
          "-p",
          "--output-format",
          "stream-json",
          "--verbose",
          "--include-partial-messages",
          ...(tools ? ["--dangerously-skip-permissions"] : []),
          ...(options.image ? ["--input-format", "stream-json", "--tools", "", "--strict-mcp-config"] : []),
          ...modelArgs("ZA_CLAUDE_MODEL", model),
        ],
        input: options.image ? JSON.stringify({
          type: "user",
          message: { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: options.image } },
          ] },
        }) + "\n" : prompt,
        cwd,
        env,
      };
    case "openai":
      return {
        command: "codex",
        args: [
          "exec",
          "--json",
          "--skip-git-repo-check",
          ...(tools
            ? ["--dangerously-bypass-approvals-and-sandbox"]
            : ["--sandbox", "read-only"]),
          ...(imagePath ? ["--image", imagePath] : []),
          "-C",
          cwd,
          ...modelArgs("ZA_CODEX_MODEL", model),
          "-",
        ],
        input: prompt,
        cwd,
        env,
      };
    case "google":
      return {
        command: "gemini",
        args: [
          "-p",
          options.hasProjectContext ? prompt : prompt.slice(0, 6000),
          "--output-format",
          "json",
          ...modelArgs("ZA_GEMINI_MODEL", model),
        ],
        input: "",
        cwd,
        env,
      };
    case "opencode": {
      const chosen = (model ?? "").trim() || process.env.ZA_OPENCODE_MODEL || "";
      return {
        command: "opencode",
        args: [
          "run",
          "--format",
          "json",
          ...(tools ? ["--auto"] : []),
          ...(chosen ? ["-m", chosen] : []),
          ...(imagePath ? ["--file", imagePath, "--"] : []),
          options.hasProjectContext ? prompt : prompt.slice(0, 6000),
        ],
        input: "",
        cwd: imagePath ? path.dirname(imagePath) : cwd,
        env: imagePath ? { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: "deny" }) } : env,
      };
    }
    default:
      throw new Error(`El proveedor ${provider} no tiene CLI oficial.`);
  }
}

export function parseCodexEvent(line: string): Parsed | null {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }

  if (event.type === "item.completed" && event.item?.type === "agent_message") {
    const text = event.item.text ?? event.item.message;
    return typeof text === "string" ? { text, full: true } : null;
  }
  if (event.type === "error" && typeof event.message === "string") {
    return { error: event.message };
  }
  if (event.type === "turn.failed") {
    return { error: event.error?.message ?? "Codex terminó el turno con un error." };
  }
  if (event.type === "turn.completed") return { done: true };
  if (event.msg?.type === "agent_message" && typeof event.msg.message === "string") {
    return { text: event.msg.message, full: true };
  }
  return null;
}

export function parseClaudeEvent(line: string): Parsed | null {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }

  if (event.type === "stream_event") {
    const inner = event.event;
    if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") {
      return { text: inner.delta.text };
    }
    return null;
  }
  if (event.type === "assistant") {
    const parts = event.message?.content;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text)
      .join("");
    return text ? { text, full: true } : null;
  }
  if (event.type === "result") {
    if (event.is_error) return { error: event.result ?? "Claude terminó con un error." };
    return typeof event.result === "string" && event.result.trim()
      ? { text: event.result, full: true, done: true }
      : { done: true };
  }
  return null;
}

export function parseOpenCodeEvent(line: string): (Parsed & { partId?: string }) | null {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }

  if (event.type === "text" && event.part?.type === "text" && typeof event.part.text === "string") {
    return { partId: event.part.id, text: event.part.text };
  }
  if (event.type === "error") {
    return { error: event.error?.message ?? event.message ?? "OpenCode terminó con un error." };
  }
  return null;
}

function parseLine(provider: ProviderId, line: string): Parsed | null {
  return provider === "anthropic" ? parseClaudeEvent(line) : parseCodexEvent(line);
}

/** OpenCode streams cumulative snapshots per part; emit only the new suffix. */
async function* streamOpenCode(runner: Runner, signal?: AbortSignal): AsyncGenerator<string> {
  const parts = new Map<string, string>();
  let sawText = false;

  for await (const line of stdoutLines(runner, signal)) {
    if (!line.trim()) continue;
    const parsed = parseOpenCodeEvent(line);
    if (!parsed) continue;
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.partId || typeof parsed.text !== "string") {
      if (parsed.done) break;
      continue;
    }

    const previous = parts.get(parsed.partId) ?? "";
    const next = parsed.text;
    parts.set(parsed.partId, next);

    const delta = next.startsWith(previous) ? next.slice(previous.length) : next;
    if (delta) {
      sawText = true;
      yield delta;
    }
    if (parsed.done) break;
  }

  if (!sawText) {
    throw new Error("OpenCode no devolvió texto. Revisa `opencode auth list` y el modelo elegido.");
  }
}

export function parseGeminiOutput(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      response?: string;
      result?: string;
    };
    return (parsed.response ?? parsed.result ?? "").trim() || null;
  } catch {
    return null;
  }
}

async function* stdoutLines(runner: Runner, signal?: AbortSignal): AsyncGenerator<string> {
  signal?.throwIfAborted();
  const child = spawn(runner.command, runner.args, {
    cwd: runner.cwd,
    env: { ...process.env, ...runner.env, NO_COLOR: "1", CI: "1", TERM: "dumb" },
    stdio: ["pipe", "pipe", "pipe"],
    // Own process group: interrupting must kill the CLI *and* the tools it spawned.
    detached: true,
  });

  const killTree = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        /* ya terminó */
      }
    }
  };

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });

  child.stdin.on("error", () => undefined);
  child.stdin.end(runner.input);

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    killTree("SIGTERM");
    const force = setTimeout(() => killTree("SIGKILL"), 1500);
    force.unref();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const timer = setTimeout(() => killTree("SIGKILL"), TIMEOUT_MS);
  timer.unref();

  const queue: string[] = [];
  let buffer = "";
  let finished = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const bump = () => {
    const resolve = wake;
    wake = null;
    resolve?.();
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      queue.push(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
    bump();
  });

  child.on("error", (error) => {
    failure = error;
    finished = true;
    bump();
  });

  child.on("close", (code) => {
    if (buffer.trim()) queue.push(buffer);
    if (code !== 0 && !aborted && !failure) {
      const detail = stderr.trim().split("\n").slice(-4).join(" ");
      failure = new Error(detail || `El CLI terminó con código ${code}.`);
    }
    finished = true;
    bump();
  });

  try {
    while (true) {
      const next = queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (finished) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        queueMicrotask(() => {
          if (queue.length || finished) bump();
        });
      });
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (!child.killed && child.exitCode === null) killTree("SIGTERM");
  }

  if (aborted) throw new DOMException("Aborted", "AbortError");
  if (failure) throw failure;
}
