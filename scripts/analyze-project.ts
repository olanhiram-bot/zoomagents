import path from "node:path";
import { analyzeProject } from "../server/project-analysis.js";
import { validateProjects } from "../server/projects.js";

try {
  const { workspace } = validateProjects({ workspace: path.resolve(process.argv[2] ?? "."), references: [] });
  console.log(JSON.stringify(await analyzeProject(workspace), null, 2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
