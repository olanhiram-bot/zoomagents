import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ModelCatalog, ModelOption } from "../shared/types.js";

const run = promisify(execFile);
const CACHE_MS = 5 * 60_000;

const CURATED: ModelCatalog = {
  anthropic: [
    { id: "", label: "Modelo del CLI", hint: "Usa el modelo configurado en Claude Code." },
    { id: "sonnet", label: "Claude Sonnet" },
    { id: "opus", label: "Claude Opus" },
    { id: "haiku", label: "Claude Haiku" },
    { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
    { id: "claude-haiku-4-5", label: "claude-haiku-4-5" },
  ],
  openai: [
    { id: "", label: "Modelo del CLI", hint: "Usa el modelo configurado en Codex." },
    { id: "gpt-4o", label: "gpt-4o" },
    { id: "gpt-4o-mini", label: "gpt-4o-mini" },
  ],
  google: [
    { id: "", label: "Modelo del CLI", hint: "Usa el modelo configurado en Gemini CLI." },
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  ],
  mock: [{ id: "mock-1", label: "Simulado" }],
};

let cache: { at: number; value: ModelCatalog } | null = null;

function sortOpenCode(models: ModelOption[]): ModelOption[] {
  const familyRank = (family: string) => (family === "opencode" ? 0 : family === "openrouter" ? 1 : 2);
  return models.sort((a, b) => {
    const byFamily = familyRank(a.family ?? "") - familyRank(b.family ?? "");
    if (byFamily !== 0) return byFamily;
    return a.id.localeCompare(b.id);
  });
}

async function opencodeModels(): Promise<ModelOption[]> {
  try {
    const { stdout } = await run("opencode", ["models"], {
      timeout: 25_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const seen = new Set<string>();
    const models: ModelOption[] = [];

    for (const raw of stdout.split("\n")) {
      const id = raw.trim();
      if (!/^[a-z0-9._-]+\/\S+$/i.test(id) || seen.has(id)) continue;
      seen.add(id);
      const family = id.split("/")[0];
      models.push({
        id,
        label: id.slice(family.length + 1),
        family,
      });
    }

    return sortOpenCode(models);
  } catch {
    return [];
  }
}

export async function modelCatalog(force = false): Promise<ModelCatalog> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const opencode = await opencodeModels();
  const value: ModelCatalog = { ...CURATED, opencode };
  cache = { at: Date.now(), value };
  return value;
}

/** First free hosted OpenCode model, used as the default when someone picks OpenCode. */
export function defaultOpenCodeModel(catalog: ModelCatalog): string {
  const models = catalog.opencode ?? [];
  return (
    models.find((model) => model.id === "opencode/big-pickle")?.id ??
    models.find((model) => model.id.startsWith("opencode/"))?.id ??
    models[0]?.id ??
    ""
  );
}
