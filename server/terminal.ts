import { spawn } from "node:child_process";
import { whichSync } from "./auth.js";

/**
 * Opens a terminal emulator on the machine running the server, so the user can
 * complete an interactive CLI login (OpenCode, Claude Code, Codex) without
 * leaving the app. Only used locally, and only with whitelisted commands.
 */
const TERMINALS: { bin: string; args: (command: string) => string[] }[] = [
  { bin: "alacritty", args: (command) => ["-e", "bash", "-lc", command] },
  { bin: "kitty", args: (command) => ["bash", "-lc", command] },
  { bin: "foot", args: (command) => ["bash", "-lc", command] },
  { bin: "ghostty", args: (command) => ["-e", "bash", "-lc", command] },
  { bin: "konsole", args: (command) => ["-e", "bash", "-lc", command] },
  { bin: "gnome-terminal", args: (command) => ["--", "bash", "-lc", command] },
  { bin: "xfce4-terminal", args: (command) => ["-x", "bash", "-lc", command] },
  { bin: "x-terminal-emulator", args: (command) => ["-e", "bash", "-lc", command] },
];

export function openLoginTerminal(command: string): string | null {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return null;

  for (const terminal of TERMINALS) {
    if (!whichSync(terminal.bin)) continue;
    try {
      const child = spawn(terminal.bin, terminal.args(command), {
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
      return terminal.bin;
    } catch {
      /* prueba el siguiente */
    }
  }
  return null;
}
