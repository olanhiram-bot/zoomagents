import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { seedForAgent } from "../shared/avatar.js";
import type { Profile, ProfileInput, ProviderId } from "../shared/types.js";
import { whichSync } from "./auth.js";
import { getRole, listRoles, listSkills } from "./library.js";
import { DEFAULT_MODELS } from "./providers.js";
import { TEMPLATES } from "./templates.js";

const PROFILES_DIR = path.join(process.cwd(), "data", "profiles");
const VALID_PROVIDERS: ProviderId[] = ["anthropic", "openai", "google", "opencode", "mock"];

function opencodeInstalled(): boolean {
  return Boolean(whichSync("opencode"));
}

/**
 * Mock was removed from the product. Old profiles that still point at it are
 * migrated to OpenCode (the gateway) instead of silently simulating replies.
 */
function effectiveProvider(provider: ProviderId): ProviderId {
  if (provider !== "mock") return provider;
  return opencodeInstalled() ? "opencode" : "anthropic";
}

function effectiveModel(provider: ProviderId, original: ProviderId, model: string): string {
  if (original !== "mock") return model;
  return provider === "opencode" ? "opencode/big-pickle" : DEFAULT_MODELS[provider];
}

const DEFAULT_SOUL = (name: string, role: string) => `# ${name} — ${role}

Eres ${name}, ${role} en una sala de trabajo con otras personas y agentes.

## Voz
- Directo y concreto. Sin relleno ni frases de cortesía.
- Hablas como en una reunión: 2 a 4 frases, máximo 60 palabras.
- Respondes en el idioma en que te hablan; por defecto, español.
- No repites la pregunta ni lo que ya dijo otro. Aportas un dato nuevo o cierras.

## Criterio
- Defiendes tu punto con evidencia y dices cuando no sabes.
- Si algo te parece mal, lo dices sin rodeos.
- Prefieres una decisión con dueño y fecha antes que una idea brillante sin plan.

## Límites
- No inventas acuerdos, datos ni personas.
- No ejecutas nada destructivo sin avisar y sin necesidad.
`;

function ensureDirs() {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function profileDir(id: string): string {
  return path.join(PROFILES_DIR, id);
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function writeText(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

export function countObservations(id: string): number {
  const raw = readText(path.join(profileDir(id), "memories", "OBSERVATIONS.jsonl"));
  if (!raw.trim()) return 0;
  return raw.split("\n").filter((line) => line.trim()).length;
}

export function readMemoryDocs(id: string): { user: string; memory: string } {
  return {
    user: readText(path.join(profileDir(id), "memories", "USER.md")),
    memory: readText(path.join(profileDir(id), "memories", "MEMORY.md")),
  };
}

export function writeMemoryDocs(id: string, docs: { user: string; memory: string }) {
  const dir = path.join(profileDir(id), "memories");
  writeText(path.join(dir, "USER.md"), docs.user);
  writeText(path.join(dir, "MEMORY.md"), docs.memory);
}

export function readSoul(id: string): string {
  return readText(path.join(profileDir(id), "SOUL.md"));
}

function toProfile(id: string, raw: Partial<Profile>): Profile {
  const original: ProviderId = VALID_PROVIDERS.includes(raw.provider as ProviderId)
    ? (raw.provider as ProviderId)
    : "mock";
  const provider = effectiveProvider(original);

  return {
    id,
    name: String(raw.name ?? "Agente").slice(0, 40),
    role: String(raw.role ?? "General").slice(0, 40),
    roleId: typeof raw.roleId === "string" && getRole(raw.roleId) ? raw.roleId : null,
    skillIds: Array.isArray(raw.skillIds)
      ? raw.skillIds.filter((skillId): skillId is string => typeof skillId === "string")
      : [],
    provider,
    model: effectiveModel(provider, original, String(raw.model ?? "")).slice(0, 80),
    createdAt: Number(raw.createdAt ?? Date.now()),
    updatedAt: Number(raw.updatedAt ?? Date.now()),
    avatarSeed:
      typeof raw.avatarSeed === "number" && Number.isFinite(raw.avatarSeed)
        ? raw.avatarSeed >>> 0
        : seedForAgent(String(raw.name ?? id), String(raw.role ?? "General")),
    soul: readSoul(id),
    memory: {
      user: readMemoryDocs(id).user,
      memory: readMemoryDocs(id).memory,
      observations: countObservations(id),
    },
  };
}

export function listProfiles(): Profile[] {
  ensureDirs();
  return fs
    .readdirSync(PROFILES_DIR)
    .filter((name) => fs.existsSync(path.join(PROFILES_DIR, name, "profile.json")))
    .map((id) => getProfile(id))
    .filter((profile): profile is Profile => Boolean(profile))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getProfile(id: string): Profile | undefined {
  if (!/^[a-z0-9-]{4,40}$/.test(id)) return undefined;
  const file = path.join(profileDir(id), "profile.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Profile>;
    return toProfile(id, raw);
  } catch {
    return undefined;
  }
}

function normalizeInput(input: Partial<ProfileInput>): ProfileInput {
  const original: ProviderId = VALID_PROVIDERS.includes(input.provider as ProviderId)
    ? (input.provider as ProviderId)
    : "mock";
  const provider = effectiveProvider(original);
  const name = String(input.name ?? "").trim().slice(0, 40) || "Agente";
  const role = String(input.role ?? "").trim().slice(0, 40) || "General";
  const roleId = input.roleId && getRole(input.roleId) ? input.roleId : null;
  const libraryRole = roleId ? getRole(roleId) : undefined;
  const validSkills = new Set(listSkills().map((skill) => skill.id));

  const requested = input.skillIds ?? libraryRole?.skillIds ?? [];
  const skillIds = [...new Set(requested)]
    .filter((skillId) => validSkills.has(skillId))
    .slice(0, 8);

  return {
    name,
    role: libraryRole?.name ?? role,
    roleId,
    skillIds,
    provider,
    model:
      effectiveModel(provider, original, String(input.model ?? "")).slice(0, 80) ||
      DEFAULT_MODELS[provider],
    soul: String(input.soul ?? "").slice(0, 20_000) || DEFAULT_SOUL(name, libraryRole?.name ?? role),
    avatarSeed:
      typeof input.avatarSeed === "number" && Number.isFinite(input.avatarSeed)
        ? input.avatarSeed >>> 0
        : seedForAgent(name, libraryRole?.name ?? role),
  };
}

export function createProfile(input: Partial<ProfileInput>): Profile {
  ensureDirs();
  const clean = normalizeInput(input);
  const id = randomUUID().slice(0, 8);
  const dir = profileDir(id);
  fs.mkdirSync(path.join(dir, "memories"), { recursive: true });

  const meta = {
    name: clean.name,
    role: clean.role,
    roleId: clean.roleId ?? null,
    skillIds: clean.skillIds ?? [],
    provider: clean.provider,
    model: clean.model,
    avatarSeed: clean.avatarSeed ?? seedForAgent(clean.name, clean.role),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeText(path.join(dir, "profile.json"), JSON.stringify(meta, null, 2));
  writeText(path.join(dir, "SOUL.md"), clean.soul);
  writeText(path.join(dir, "memories", "USER.md"), "");
  writeText(path.join(dir, "memories", "MEMORY.md"), "");

  return toProfile(id, meta);
}

export function updateProfile(
  id: string,
  patch: Partial<ProfileInput> & { memory?: { user?: string; memory?: string } },
): Profile | undefined {
  const current = getProfile(id);
  if (!current) return undefined;
  const dir = profileDir(id);

  const next = normalizeInput({
    name: patch.name ?? current.name,
    role: patch.role ?? current.role,
    roleId: patch.roleId !== undefined ? patch.roleId : current.roleId,
    skillIds: patch.skillIds ?? current.skillIds,
    provider: patch.provider ?? current.provider,
    model: patch.model ?? current.model,
    soul: patch.soul ?? current.soul,
    avatarSeed: patch.avatarSeed ?? current.avatarSeed,
  });

  const meta = {
    name: next.name,
    role: next.role,
    roleId: next.roleId ?? null,
    skillIds: next.skillIds ?? [],
    provider: next.provider,
    model: next.model,
    avatarSeed: next.avatarSeed ?? current.avatarSeed,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  };
  writeText(path.join(dir, "profile.json"), JSON.stringify(meta, null, 2));
  writeText(path.join(dir, "SOUL.md"), next.soul);

  if (patch.memory) {
    const docs = readMemoryDocs(id);
    writeMemoryDocs(id, {
      user: patch.memory.user ?? docs.user,
      memory: patch.memory.memory ?? docs.memory,
    });
  }

  return getProfile(id);
}

export function deleteProfile(id: string): boolean {
  const dir = profileDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * Creates the sample team as real profiles. It is an explicit action, not a
 * hidden template: once created, every profile is editable data on disk.
 */
export function seedSampleTeam(): Profile[] {
  ensureDirs();
  if (listProfiles().length > 0) return listProfiles();

  const template = TEMPLATES[0];
  const roles = listRoles();
  // Seed with the gateway when it is installed so the sample team works without
  // any manual auth; otherwise respect the template's provider.
  const seedProvider: ProviderId = opencodeInstalled() ? "opencode" : "anthropic";

  for (const participant of template.participants) {
    const role = roles.find(
      (candidate) => candidate.name.toLowerCase() === participant.role.toLowerCase(),
    );
    createProfile({
      name: participant.name,
      role: participant.role,
      roleId: role?.id ?? null,
      skillIds: role?.skillIds ?? [],
      provider: seedProvider,
      model: seedProvider === "opencode" ? "opencode/big-pickle" : participant.model,
      // The mission and skills come from the role library, not from a copied prompt.
      soul: DEFAULT_SOUL(participant.name, role?.name ?? participant.role),
    });
  }
  return listProfiles();
}
