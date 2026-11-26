import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DesktopAction } from "../shared/types.js";

const exec = promisify(execFile);
const keys = new Set(["Tab", "Return", "Escape", "BackSpace", "Delete", "Up", "Down", "Left", "Right", "Home", "End", "Page_Up", "Page_Down"]);

export function parseScreenResponse(raw: string, control: boolean, monitor: boolean) {
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  const narration = typeof parsed?.narration === "string" ? parsed.narration.trim().slice(0, 700) : "";
  const value = control ? parsed?.action : null;
  let action: DesktopAction | null = null;
  if (value?.type === "click" && monitor && [value.x, value.y].every(
    (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
  )) {
    action = { type: "click", x: value.x, y: value.y };
  } else if (value?.type === "type" && typeof value.text === "string" &&
    value.text.length > 0 && value.text.length <= 500 && !/[\x00-\x1f\x7f]/.test(value.text)) {
    action = { type: "type", text: value.text };
  } else if (value?.type === "key" && keys.has(value.key)) {
    action = { type: "key", key: value.key };
  }
  return { narration, action };
}

export async function performDesktopAction(action: DesktopAction, signal: AbortSignal) {
  const options = { signal, timeout: 3000 };
  if (action.type === "click") {
    const { stdout } = await exec("hyprctl", ["-j", "monitors"], options);
    const monitors = JSON.parse(stdout);
    if (monitors.length !== 1 || monitors[0].transform !== 0) {
      throw new Error("El clic requiere un solo monitor sin rotación.");
    }
    await desktopCommand("wlrctl", ["--version"], options);
    const { x, y, width, height, scale } = monitors[0];
    const targetX = x + Math.round(action.x * (Math.floor(width / scale) - 1));
    const targetY = y + Math.round(action.y * (Math.floor(height / scale) - 1));
    const moved = await exec("hyprctl", ["dispatch", "movecursor", String(targetX), String(targetY)], options);
    if (moved.stdout.trim() !== "ok") throw new Error("Hyprland no pudo mover el puntero.");
    signal.throwIfAborted();
    await desktopCommand("wlrctl", ["pointer", "click"], options);
    return;
  }
  await desktopCommand("wtype", action.type === "type" ? ["--", action.text] : ["-k", action.key], options);
}


async function desktopCommand(command: string, args: string[], options: { signal: AbortSignal; timeout: number }) {
  try {
    await exec(command, args, options);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Falta ${command} en el equipo que ejecuta ZoomAgents.`);
    }
    options.signal.throwIfAborted();
    throw new Error(`Falló la entrada de escritorio mediante ${command}.`);
  }
}
