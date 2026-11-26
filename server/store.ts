import fs from "node:fs";
import path from "node:path";
import type { ProviderId, Session } from "../shared/types.js";

export type KeyName = Extract<ProviderId, "anthropic" | "openai" | "google">;

type Settings = {
  keys: Partial<Record<KeyName, string>>;
  mode?: "auto" | "cli" | "api";
};

const root = process.cwd();
const dataDir = path.join(root, "data");
const sessionsDir = path.join(dataDir, "sessions");
const settingsFile = path.join(dataDir, "settings.json");

const ENV_BY_PROVIDER: Record<KeyName, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
};

function ensureDirs() {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsFile, "utf8");
    const parsed = JSON.parse(raw) as Settings;
    return { keys: parsed.keys ?? {}, mode: parsed.mode };
  } catch {
    return { keys: {} };
  }
}

export function saveSettings(patch: Settings): Settings {
  ensureDirs();
  const current = loadSettings();
  const keys = { ...current.keys };
  for (const [name, value] of Object.entries(patch.keys ?? {})) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (clean) keys[name as KeyName] = clean;
  }
  const next = { keys, mode: current.mode };
  fs.writeFileSync(settingsFile, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function saveAuthMode(mode: "auto" | "cli" | "api"): Settings {
  ensureDirs();
  const current = loadSettings();
  const next = { ...current, mode };
  fs.writeFileSync(settingsFile, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function clearKey(name: KeyName): Settings {
  const current = loadSettings();
  delete current.keys[name];
  ensureDirs();
  fs.writeFileSync(settingsFile, JSON.stringify(current, null, 2));
  return current;
}

export function keyFor(provider: ProviderId): string | undefined {
  // Mock and OpenCode have no API key of their own.
  if (provider === "mock" || provider === "opencode") return undefined;
  const saved = loadSettings().keys[provider];
  if (saved) return saved;
  for (const envName of ENV_BY_PROVIDER[provider]) {
    const value = process.env[envName];
    if (value) return value;
  }
  return undefined;
}

export function hasKey(provider: ProviderId): boolean {
  return Boolean(keyFor(provider));
}

export function maskKey(provider: ProviderId): string | null {
  const key = keyFor(provider);
  if (!key) return null;
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function saveSession(session: Session) {
  ensureDirs();
  const file = path.join(sessionsDir, `${session.id}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
}

export function loadSession(id: string): Session | undefined {
  try {
    const file = path.join(sessionsDir, `${id}.json`);
    return JSON.parse(fs.readFileSync(file, "utf8")) as Session;
  } catch {
    return undefined;
  }
}

export function listSessions(): Session[] {
  ensureDirs();
  return fs
    .readdirSync(sessionsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => loadSession(name.replace(/\.json$/, "")))
    .filter((s): s is Session => Boolean(s))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
}
