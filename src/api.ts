import type {
  AuthMode,
  CliStatus,
  Library,
  ModelCatalog,
  Profile,
  ProfileInput,
  ProjectSelection,
  ProjectAnalysis,
  T3ThreadSummary,
  ProviderStatus,
  Role,
  Session,
  Skill,
} from "../shared/types";

export type ProviderSnapshot = {
  mode: AuthMode;
  providers: ProviderStatus[];
  masked: Record<string, string | null>;
};

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = body;
    try {
      const data = JSON.parse(body);
      if (typeof data?.error === "string") message = data.error;
    } catch { /* Non-JSON error response. */ }
    throw new Error(message || `Error ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getLibrary(): Promise<Library> {
  return json<Library>(await fetch("/api/library"));
}

export async function createSkill(input: Partial<Skill>): Promise<Skill> {
  return json<Skill>(
    await fetch("/api/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function saveSkill(id: string, patch: Partial<Skill>): Promise<Skill> {
  return json<Skill>(
    await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function removeSkill(id: string): Promise<{ ok: boolean }> {
  return json(await fetch(`/api/skills/${id}`, { method: "DELETE" }));
}

export async function createRole(input: Partial<Role>): Promise<Role> {
  return json<Role>(
    await fetch("/api/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function saveRole(id: string, patch: Partial<Role>): Promise<Role> {
  return json<Role>(
    await fetch(`/api/roles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function removeRole(id: string): Promise<{ ok: boolean }> {
  return json(await fetch(`/api/roles/${id}`, { method: "DELETE" }));
}

export async function getProfiles(): Promise<Profile[]> {
  return json<Profile[]>(await fetch("/api/profiles"));
}

export async function getProfile(id: string): Promise<Profile> {
  return json<Profile>(await fetch(`/api/profiles/${id}`));
}

export async function createProfile(input: Partial<ProfileInput>): Promise<Profile> {
  return json<Profile>(
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function saveProfile(
  id: string,
  patch: Partial<ProfileInput>,
): Promise<Profile> {
  return json<Profile>(
    await fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function removeProfile(id: string): Promise<{ ok: boolean }> {
  return json(await fetch(`/api/profiles/${id}`, { method: "DELETE" }));
}

export async function seedProfiles(): Promise<Profile[]> {
  return json<Profile[]>(
    await fetch("/api/profiles/seed", { method: "POST" }),
  );
}

export type ProfileMemoryResponse = {
  docs: { user: string; memory: string };
  observations: Record<string, unknown>[];
};

export async function getProfilePrompt(id: string): Promise<{ prompt: string }> {
  return json<{ prompt: string }>(await fetch(`/api/profiles/${id}/prompt`));
}

export async function getProfileMemory(id: string): Promise<ProfileMemoryResponse> {
  return json<ProfileMemoryResponse>(await fetch(`/api/profiles/${id}/memory`));
}

export async function saveProfileMemory(
  id: string,
  docs: { user: string; memory: string },
): Promise<Profile> {
  return json<Profile>(
    await fetch(`/api/profiles/${id}/memory`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(docs),
    }),
  );
}

export async function getProviders(): Promise<ProviderSnapshot> {
  return json(await fetch("/api/providers"));
}

export async function saveKeys(keys: Record<string, string>): Promise<ProviderSnapshot> {
  return json(
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys }),
    }),
  );
}

export async function saveAuthMode(mode: AuthMode): Promise<ProviderSnapshot> {
  return json(
    await fetch("/api/auth/mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  );
}

export async function refreshAuth(): Promise<{ mode: AuthMode; clis: CliStatus[] }> {
  return json(await fetch("/api/auth"));
}

export async function getModels(): Promise<ModelCatalog> {
  return json(await fetch("/api/models"));
}

export type ToolsStatus = {
  rtk: { installed: boolean; version: string | null };
};

export async function getTools(): Promise<ToolsStatus> {
  return json(await fetch("/api/tools"));
}

export async function openLoginTerminal(
  command: string,
): Promise<{ terminal: string; command: string }> {
  return json(
    await fetch("/api/auth/terminal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command }),
    }),
  );
}

export type SessionSummary = {
  id: string;
  title: string;
  createdAt: number;
  endedAt?: number;
  phase: string;
  participants: number;
};

export async function getRecentSessions(): Promise<SessionSummary[]> {
  return json<SessionSummary[]>(await fetch("/api/sessions"));
}

export async function getSession(id: string): Promise<Session> {
  return json<Session>(await fetch(`/api/sessions/${id}`));
}

export async function createSession(input: {
  title: string;
  agenda: string;
  speakingMode?: "auto" | "all" | "moderated";
  profileIds?: string[];
  muted?: Record<string, boolean>;
  participants?: unknown[];
  workspace?: string;
  projects?: ProjectSelection;
  toolsEnabled?: boolean;
  compressTools?: boolean;
}): Promise<Session> {
  return json<Session>(
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export type FolderListing = {
  current: string;
  parent: string | null;
  home: string;
  folders: { name: string; path: string }[];
};

export async function getT3Threads(path: string, signal: AbortSignal): Promise<T3ThreadSummary[]> {
  return json(await fetch(`/api/projects/t3-threads?path=${encodeURIComponent(path)}`, { signal }));
}

export async function getProjectAnalysis(path: string, signal: AbortSignal): Promise<ProjectAnalysis> {
  return json(await fetch(`/api/projects/analysis?path=${encodeURIComponent(path)}`, { signal }));
}

export async function getProjectFolders(path: string, signal: AbortSignal): Promise<FolderListing> {
  return json(await fetch(`/api/projects/folders?path=${encodeURIComponent(path)}`, { signal }));
}

export async function saveSessionProjects(id: string, projects: ProjectSelection): Promise<Session> {
  return json(await fetch(`/api/sessions/${encodeURIComponent(id)}/projects`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(projects),
  }));
}

export function wsUrl(sessionId: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}

function t3Url(endpoint: string, workspace: string) {
  return `/api/t3/${endpoint}?path=${encodeURIComponent(workspace)}`;
}

export async function getT3Thread(workspace: string, id: string, signal: AbortSignal) {
  return json<import("../shared/types").T3ThreadDetail>(await fetch(t3Url(`threads/${encodeURIComponent(id)}`, workspace), { signal }));
}

export async function getT3Changes(workspace: string, id: string, signal: AbortSignal) {
  return json<import("../shared/types").T3Changes>(await fetch(t3Url(`changes/${encodeURIComponent(id)}`, workspace), { signal }));
}

export async function submitT3Instruction(workspace: string, input: { text: string; id?: string; base?: string }) {
  return json<{ ok: true; threadId: string | null }>(await fetch(t3Url("instructions", workspace), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function linkT3Thread(workspace: string, sessionId: string, agentId: string, threadId: string | null) {
  return json<{ ok: true }>(await fetch(t3Url(`rooms/${encodeURIComponent(sessionId)}/agents/${encodeURIComponent(agentId)}`, workspace), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId }),
  }));
}
