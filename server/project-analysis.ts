import { opendir } from "node:fs/promises";
import path from "node:path";
import type { ProjectAnalysis } from "../shared/types.js";

const ignored = new Set(["node_modules", "vendor", "dist", "build", "coverage", "target", "__pycache__", "venv"]);
const entryLimit = 30_000;

const specialties = [
  { id: "frontend", role: "Frontend", pattern: /(?:\.(?:tsx|jsx|vue|svelte|astro|css|scss|html)$|(?:^|\/)(?:vite|next|nuxt)\.config\.)/i,
    task: "Implementa y revisa la interfaz, sus flujos de usuario y accesibilidad. Valida los cambios con las herramientas del proyecto." },
  { id: "backend", role: "Backend", pattern: /(?:^|\/)(?:server|backend|api|controllers|routes|handlers)\/|(?:^|\/)(?:app|server|main)\.(?:py|go|rs)$/i,
    task: "Trabaja en la lógica del servidor, contratos de API y manejo de errores. Conserva la compatibilidad de los consumidores." },
  { id: "data", role: "Datos", pattern: /(?:^|\/)(?:migrations?|prisma|schemas?)\/|\.(?:sql|prisma)$/i,
    task: "Revisa modelos, consultas y migraciones. Valida la integridad de los datos y la compatibilidad con los datos existentes." },
  { id: "qa", role: "QA", pattern: /(?:^|\/)(?:tests?|__tests__|e2e|specs?)\/|\.(?:test|spec)\.[^/]+$|(?:^|\/)(?:test_[^/]+\.py|[^/]+_test\.go|[^/]+-check\.[cm]?[jt]s)$/i,
    task: "Identifica cómo reproducir fallos y valida cambios con las pruebas del repositorio. Reporta resultados verificables y casos sin cubrir." },
  { id: "devops", role: "DevOps", pattern: /(?:^|\/)(?:\.github\/workflows\/|Dockerfile(?:\.[^/]+)?$|(?:docker-)?compose\.[^/]+$|\.gitlab-ci\.ya?ml$)|\.tf$/i,
    task: "Revisa compilación, CI y despliegue. Comprueba que los cambios sean reproducibles y explica cómo validarlos." },
  { id: "docs", role: "Documentación", pattern: /(?:^|\/)(?:docs\/[^/]+|(?:readme|contributing|context)\.md)$/i,
    task: "Mantén la documentación alineada con el código y verifica las instrucciones de instalación, uso y contribución." },
];

export async function analyzeProject(workspace: string, signal?: AbortSignal): Promise<ProjectAnalysis> {
  const evidence = new Map<string, string[]>();
  const pending = [""];
  let entries = 0;
  let files = 0;
  let incomplete = false;

  while (pending.length && entries < entryLimit) {
    signal?.throwIfAborted();
    const relative = pending.pop()!;
    try {
      for await (const entry of await opendir(path.join(workspace, relative))) {
        signal?.throwIfAborted();
        if (entries++ >= entryLimit) break;
        if (entry.name.startsWith(".") && entry.name !== ".github" && entry.name !== ".gitlab-ci.yml") continue;
        const location = path.posix.join(relative, entry.name);
        if (entry.isDirectory() && !ignored.has(entry.name)) pending.push(location);
        if (!entry.isFile()) continue;
        files++;
        for (const specialty of specialties) {
          const matches = evidence.get(specialty.id) ?? [];
          if (matches.length < 3 && specialty.pattern.test(location)) {
            matches.push(location);
            evidence.set(specialty.id, matches);
          }
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (!relative) throw error;
      incomplete = true;
    }
  }

  const suggestions = specialties.filter((item) => evidence.has(item.id)).map(({ id, role, task }) => ({
    id, role, task, evidence: evidence.get(id) ?? [],
  }));
  if (!suggestions.some(({ id }) => id === "frontend" || id === "backend")) {
    suggestions.unshift({
      id: "engineering", role: "Ingeniería",
      task: "Explora la estructura y dependencias del proyecto, implementa los cambios acordados y valida su funcionamiento.",
      evidence: [],
    });
  }
  return { workspace, files, incomplete: incomplete || entries >= entryLimit, suggestions };
}
