import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { whichSync } from "./auth.js";

const run = promisify(execFile);

/** Commands RTK knows how to compress; only wrappers that exist are installed. */
const WRAPPED_COMMANDS = [
  "git",
  "gh",
  "ls",
  "find",
  "tree",
  "grep",
  "rg",
  "npm",
  "pnpm",
  "yarn",
  "cargo",
  "go",
  "pytest",
  "ruff",
  "mypy",
  "tsc",
  "eslint",
  "jest",
  "vitest",
  "playwright",
  "docker",
  "kubectl",
  "helm",
  "terraform",
  "aws",
  "make",
  "gradle",
  "mvn",
  "dotnet",
];

const WRAPPER = `#!/bin/sh
# ZoomAgents: route this command through RTK without letting RTK re-enter the wrapper.
cmd="$(basename "$0")"
newpath=""
oldifs="$IFS"
IFS=:
for part in $PATH; do
  [ "$part" = "$ZA_RTK_WRAPPER_DIR" ] && continue
  newpath="\${newpath:+$newpath:}$part"
done
IFS="$oldifs"
PATH="$newpath"
export PATH
exec "$ZA_RTK_BIN" "$cmd" "$@"
`;

let cached: { at: number; value: { installed: boolean; version: string | null } } | null = null;

export async function rtkStatus(force = false) {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.value;
  const bin = whichSync("rtk");
  let version: string | null = null;
  if (bin) {
    try {
      const { stdout } = await run(bin, ["--version"], { timeout: 5_000 });
      version = stdout.trim().split("\n")[0] || null;
    } catch {
      version = null;
    }
  }
  const value = { installed: Boolean(bin), version };
  cached = { at: Date.now(), value };
  return value;
}

/**
 * Creates shims for output-heavy commands. RTK promises pass-through when a
 * filter fails, so a missing/unsupported filter never blocks the agent.
 */
export function installRtkWrappers(binDir: string): boolean {
  const rtk = whichSync("rtk");
  if (!rtk) return false;

  fs.mkdirSync(binDir, { recursive: true });
  let installed = 0;

  for (const command of WRAPPED_COMMANDS) {
    if (!whichSync(command)) continue;
    const file = path.join(binDir, command);
    fs.writeFileSync(file, WRAPPER, { mode: 0o755 });
    installed += 1;
  }

  return installed > 0;
}

export function rtkBin(): string | null {
  return whichSync("rtk");
}
