import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { T3Changes, T3ThreadDetail, T3ThreadSummary } from "../shared/types.js";

const exec = promisify(execFile);

async function t3(args: string[], signal?: AbortSignal, input?: string): Promise<unknown> {
  const command = exec("t3", args, { signal, timeout: 12_000, maxBuffer: 8 * 1024 * 1024 });
  if (input !== undefined) {
    command.child.stdin?.on("error", () => {});
    command.child.stdin?.end(input);
  }
  return JSON.parse((await command).stdout);
}

const membership = new Map<string, { until: number; projectsByThread: Map<string, string> }>();
const membershipMs = 8_000;
const pendingLists = new Map<string, Promise<T3ThreadSummary[]>>();

function summary(raw: unknown): T3ThreadSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const { threadId, title, link, status, updatedAt } = raw as Record<string, unknown>;
  if (typeof threadId !== "string" || typeof title !== "string" ||
    typeof link !== "string" || !/^https?:\/\//i.test(link) ||
    typeof status !== "string" || typeof updatedAt !== "string") return null;
  return { id: threadId, title, link, status, updatedAt };
}

export async function listT3Threads(workspace: string, signal?: AbortSignal): Promise<T3ThreadSummary[]> {
  signal?.throwIfAborted();
  let pending = pendingLists.get(workspace);
  if (!pending) {
    pending = loadT3Threads(workspace).finally(() => pendingLists.delete(workspace));
    pendingLists.set(workspace, pending);
  }
  const result = await pending;
  signal?.throwIfAborted();
  return result;
}

async function loadT3Threads(workspace: string) {
  const rows = await t3(["thread", "list", "--project", workspace, "--json"]);
  if (!Array.isArray(rows)) throw new Error("Formato inesperado de T3 Code");
  const projectsByThread = new Map<string, string>();
  for (const row of rows) {
    if (typeof row?.threadId === "string" && typeof row.projectId === "string") {
      projectsByThread.set(row.threadId, row.projectId);
    }
  }
  membership.delete(workspace);
  if (membership.size >= 32) membership.delete(membership.keys().next().value!);
  membership.set(workspace, { until: Date.now() + membershipMs, projectsByThread });
  return rows.map(summary).filter((row) => row !== null);
}

export async function showT3Thread(workspace: string, id: string, signal?: AbortSignal): Promise<T3ThreadDetail | null> {
  if (!/^[a-z0-9][a-z0-9:_-]{0,159}$/i.test(id)) return null;
  const cached = membership.get(workspace);
  if (!cached || cached.until <= Date.now() || !cached.projectsByThread.has(id)) {
    await listT3Threads(workspace, signal);
  }
  const projectId = membership.get(workspace)?.projectsByThread.get(id);
  if (!projectId) return null;
  const result = await t3(["thread", "show", "--messages", "20", "--json", id], signal) as {
    thread?: Record<string, unknown>;
    messages?: Record<string, unknown>[];
  };
  const thread = summary(result.thread);
  if (!thread || !result.thread || thread.id !== id || result.thread.projectId !== projectId) return null;
  return {
    thread,
    worktree: typeof result.thread.worktreePath === "string" ? result.thread.worktreePath : null,
    branch: typeof result.thread.branch === "string" ? result.thread.branch : null,
    pending: typeof result.thread.pendingRequestCount === "number" ? result.thread.pendingRequestCount : 0,
    messages: (result.messages ?? []).flatMap(({ role, text }) =>
      typeof role === "string" && typeof text === "string" ? [{ role, text: text.slice(0, 24_000) }] : []),
  };
}

export async function startT3Thread(workspace: string, text: string, base?: string) {
  const result = await t3(["thread", "start", "--json", ...(base ? ["--worktree", base] : []), workspace, "-"], undefined, text) as {
    threadId?: unknown; thread?: { threadId?: unknown };
  };
  membership.delete(workspace);
  const id = result?.threadId ?? result?.thread?.threadId;
  return typeof id === "string" ? id : null;
}

export async function sendToT3Thread(workspace: string, id: string, text: string) {
  if (!/^[a-z0-9][a-z0-9:_-]{0,159}$/i.test(id) ||
    !(await loadT3Threads(workspace)).some((thread) => thread.id === id)) return false;
  await t3(["thread", "send", "--json", id, "-"], undefined, text);
  return true;
}

export async function readT3Changes(directory: string, signal: AbortSignal): Promise<T3Changes> {
  const git = (args: string[]) => exec("git", ["--no-pager", "-c", "core.fsmonitor=false", "-C", directory, ...args], {
    signal, timeout: 6000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).then(({ stdout }) => stdout);
  const status = await git(["status", "--short", "--branch", "--untracked-files=normal"]);
  const [branch, ...files] = status.trimEnd().split("\n");
  let diff: string;
  try {
    diff = await git(["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules", "HEAD", "--"]);
  } catch (error) {
    if (signal.aborted || !/bad revision|ambiguous argument/i.test(String(error))) throw error;
    diff = await git(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--ignore-submodules", "--"]);
  }
  return { branch, status: files.join("\n").slice(0, 32_000), diff: diff.slice(0, 100_000), truncated: diff.length > 100_000 };
}
