import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AuthMode, CliId, CliStatus, ProviderId } from "../shared/types.js";
import { keyFor, loadSettings, saveAuthMode } from "./store.js";

const run = promisify(execFile);

const CLI_META: Record<CliId, { bin: string; label: string; provider: ProviderId; login: string }> = {
  claude: { bin: "claude", label: "Claude Code", provider: "anthropic", login: "claude" },
  codex: { bin: "codex", label: "Codex", provider: "openai", login: "codex login" },
  gemini: { bin: "gemini", label: "Gemini CLI", provider: "google", login: "gemini" },
  opencode: {
    bin: "opencode",
    label: "OpenCode",
    provider: "opencode",
    login: "opencode auth login",
  },
};

const CLI_FOR_PROVIDER: Partial<Record<ProviderId, CliId>> = {
  anthropic: "claude",
  openai: "codex",
  google: "gemini",
  opencode: "opencode",
};

export type Transport = "cli" | "api" | "none";

let cache: { at: number; value: CliStatus[] } | null = null;
const CACHE_MS = 15_000;

export function whichSync(bin: string): string | null {
  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    const candidate = path.join(dir, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* sigue buscando */
    }
  }
  return null;
}

function firstLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

async function versionOf(binPath: string): Promise<{ version: string | null; error: string | null }> {
  try {
    const { stdout } = await run(binPath, ["--version"], { timeout: 8000 });
    return { version: firstLine(stdout) || null, error: null };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return { version: null, error: firstLine(stderr) || (error as Error).message };
  }
}

async function detectClaude(binPath: string): Promise<Pick<CliStatus, "authenticated" | "account" | "detail">> {
  const credentials = path.join(os.homedir(), ".claude", ".credentials.json");
  if (fs.existsSync(credentials) || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { authenticated: true, account: "Plan de Claude", detail: null };
  }

  if (process.platform === "darwin") {
    try {
      await run("security", ["find-generic-password", "-s", "Claude Code-credentials"], { timeout: 5000 });
      return { authenticated: true, account: "Plan de Claude", detail: null };
    } catch {
      /* no hay credencial en el llavero */
    }
  }

  return {
    authenticated: false,
    account: null,
    detail: "Instalado, sin sesión. Ejecuta `claude` y usa /login.",
  };
}

async function detectCodex(binPath: string): Promise<Pick<CliStatus, "authenticated" | "account" | "detail">> {
  try {
    // Some CLIs write their status to stderr, so read both streams.
    const { stdout, stderr } = await run(binPath, ["login", "status"], { timeout: 10000 });
    const text = `${stdout}\n${stderr}`.trim();
    const authenticated = /logged in/i.test(text);
    const account = /chatgpt/i.test(text)
      ? "ChatGPT"
      : /api key/i.test(text)
        ? "API key"
        : null;
    return {
      authenticated,
      account,
      detail: authenticated ? null : "Instalado, sin sesión. Ejecuta `codex login`.",
    };
  } catch (error) {
    return {
      authenticated: false,
      account: null,
      detail: `No se pudo leer la sesión: ${firstLine((error as { stderr?: string }).stderr ?? "")}`,
    };
  }
}

function detectGemini(): Pick<CliStatus, "authenticated" | "account" | "detail"> {
  const accountsFile = path.join(os.homedir(), ".gemini", "google_accounts.json");
  const credsFile = path.join(os.homedir(), ".gemini", "oauth_creds.json");
  try {
    const accounts = JSON.parse(fs.readFileSync(accountsFile, "utf8")) as {
      active?: string | null;
    };
    if (accounts.active) {
      return { authenticated: true, account: accounts.active, detail: null };
    }
  } catch {
    /* sin archivo de cuentas */
  }
  if (fs.existsSync(credsFile)) {
    return { authenticated: true, account: "Cuenta de Google", detail: null };
  }
  return {
    authenticated: false,
    account: null,
    detail: "Instalado, sin sesión. Ejecuta `gemini` y elige Login with Google.",
  };
}

async function detectOpenCode(
  binPath: string,
): Promise<Pick<CliStatus, "authenticated" | "account" | "detail">> {
  try {
    // `auth list` prints one integration per line. Read both streams: some
    // builds log to stderr.
    const { stdout, stderr } = await run(binPath, ["auth", "list"], { timeout: 15000 });
    const lines = `${stdout}\n${stderr}`
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^(opencode|integration|credential|no integrations?)/i.test(line));

    if (!lines.length) {
      return {
        authenticated: false,
        account: null,
        detail: "Sin integraciones. Ejecuta `opencode auth login` y elige un proveedor.",
      };
    }

    const names = [...new Set(lines.map((line) => line.split(/\s{2,}|\t/)[0]).filter(Boolean))];
    return {
      authenticated: true,
      account: names.length ? names.join(", ") : "Sesión de OpenCode",
      detail: null,
    };
  } catch (error) {
    return {
      authenticated: false,
      account: null,
      detail: `No se pudo leer auth list: ${firstLine((error as { stderr?: string }).stderr ?? "")}`,
    };
  }
}

async function detect(id: CliId): Promise<CliStatus> {
  const meta = CLI_META[id];
  const base: CliStatus = {
    id,
    label: meta.label,
    provider: meta.provider,
    installed: false,
    authenticated: false,
    account: null,
    version: null,
    detail: "No está instalado o no está en el PATH del servidor.",
    loginCommand: meta.login,
  };

  const binPath = whichSync(meta.bin);
  if (!binPath) return base;

  const { version, error } = await versionOf(binPath);
  if (error) {
    return { ...base, installed: true, detail: `Instalado pero no arranca: ${error}` };
  }

  const auth =
    id === "claude"
      ? await detectClaude(binPath)
      : id === "codex"
        ? await detectCodex(binPath)
        : id === "opencode"
          ? await detectOpenCode(binPath)
          : detectGemini();

  return { ...base, installed: true, version, ...auth };
}

export async function cliStatuses(force = false): Promise<CliStatus[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await Promise.all((Object.keys(CLI_META) as CliId[]).map(detect));
  cache = { at: Date.now(), value };
  return value;
}

export function authMode(): AuthMode {
  return loadSettings().mode ?? "auto";
}

export function setAuthMode(mode: AuthMode) {
  saveAuthMode(mode);
  cache = null;
}

export async function transportFor(provider: ProviderId): Promise<Transport> {
  if (provider === "mock") return "none";
  const mode = authMode();
  const cliId = CLI_FOR_PROVIDER[provider];
  const status = cliId ? (await cliStatuses()).find((item) => item.id === cliId) : undefined;
  const hasKey = Boolean(keyFor(provider));

  // OpenCode is a gateway: it has no API-key path of its own, and its hosted
  // free models work as soon as the CLI is installed.
  if (provider === "opencode") {
    if (mode === "api") return "none";
    return status?.installed ? "cli" : "none";
  }

  if (mode === "api") return hasKey ? "api" : "none";
  if (mode === "cli") return status?.authenticated ? "cli" : "none";

  // auto: prefer the official CLI session, fall back to a key.
  if (status?.authenticated) return "cli";
  if (hasKey) return "api";
  return "none";
}

export async function canUseProvider(provider: ProviderId): Promise<boolean> {
  return (await transportFor(provider)) !== "none";
}

export function cliForProvider(provider: ProviderId): CliId | undefined {
  return CLI_FOR_PROVIDER[provider];
}
