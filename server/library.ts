import fs from "node:fs";
import path from "node:path";
import type { Library, Role, Skill } from "../shared/types.js";

const ROOT = path.join(process.cwd(), "data", "library");
const SKILLS_DIR = path.join(ROOT, "skills");
const ROLES_DIR = path.join(ROOT, "roles");
const MARKER = path.join(ROOT, ".seeded");
/** Bump when new built-in skills/roles are added; existing files are never overwritten. */
const SEED_VERSION = "2";

type Doc = { meta: Record<string, string>; body: string };

function parseDoc(raw: string): Doc {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { meta: {}, body: normalized.trim() };

  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return { meta: {}, body: normalized.trim() };

  const meta: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return { meta, body: normalized.slice(end + 4).replace(/^\n+/, "").trim() };
}

function serializeDoc(meta: Record<string, string | boolean | string[] | undefined>, body: string): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === false || value === "") continue;
    if (Array.isArray(value)) lines.push(`${key}: ${value.join(", ")}`);
    else lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", body, "");
  return lines.join("\n");
}

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `item-${Date.now().toString(36)}`;
}

function uniqueId(dir: string, base: string, currentId?: string): string {
  let id = base;
  let counter = 2;
  while (id !== currentId && fs.existsSync(path.join(dir, `${id}.md`))) {
    id = `${base}-${counter++}`;
  }
  return id;
}

function listIds(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

/* ------------------------------- seeds ------------------------------- */

const SEED_SKILLS: Skill[] = [
  {
    id: "code-review",
    name: "Revisión de código",
    description: "Encuentra defectos reales antes del merge, con evidencia.",
    instructions: `Revisa el cambio como si fuera a producción.
- Prioriza correctitud, casos borde, manejo de errores y regresiones.
- Señala duplicación, complejidad accidental y nombres que no dicen qué hace.
- Busca tests faltantes en el camino feliz y en los fallos.
- Clasifica cada hallazgo como bloqueante o no bloqueante y cita archivo:línea.
- No reescribas todo: propone el cambio mínimo que elimina el riesgo.`,
  },
  {
    id: "testing",
    name: "Diseño de pruebas",
    description: "Casos borde, fallos parciales y criterios de aceptación.",
    instructions: `Diseña pruebas antes o junto con el cambio.
- Enumera el caso feliz, los bordes y los fallos parciales.
- Cada caso debe ser reproducible: pasos, entrada, resultado esperado.
- Cubre reintentos, concurrencia y estados incompletos.
- No apruebes sin evidencia de ejecución o un plan concreto para obtenerla.
- Si falta un criterio de aceptación, pídelo antes de escribir la prueba.`,
  },
  {
    id: "architecture",
    name: "Arquitectura y trade-offs",
    description: "Decisiones estructurales con costo y reversibilidad.",
    instructions: `Decide arquitectura con trade-offs explícitos.
- Nombra las opciones y qué gana y pierde cada una.
- Distingue decisiones reversibles de irreversibles; no gastes ceremonia en las reversibles.
- Mira límites, acoplamiento, modelo de datos y costo operativo.
- Prefiere lo aburrido y probado salvo que el riesgo lo justifique.
- Si propones una decisión, deja un ADR de una página: contexto, decisión, consecuencias.`,
  },
  {
    id: "backend-api",
    name: "APIs y datos",
    description: "Contratos, idempotencia, migraciones y reintentos.",
    instructions: `Trabaja el backend por contratos.
- Define entrada, salida, errores y códigos antes de implementar.
- Toda escritura debe ser idempotente o tener una clave de idempotencia.
- Las migraciones se planifican con rollback y ventana de compatibilidad.
- Piensa en reintentos, colas, duplicados y orden de eventos.
- Valida en el borde y no confíes en el cliente.`,
  },
  {
    id: "frontend-ui",
    name: "Frontend y UX",
    description: "Estados, accesibilidad y latencia percibida.",
    instructions: `Diseña la interfaz por estados, no por pantallas.
- Cubre vacío, cargando, error, sin permiso y éxito.
- La latencia percibida importa: skeleton solo si la espera lo justifica.
- Accesibilidad: teclado, foco, contraste, lectores de pantalla, movimiento reducido.
- El estado debe sobrevivir a recargas y pérdida de conexión.
- Nombra el componente y el estado exacto donde vive cada dato.`,
  },
  {
    id: "security",
    name: "Seguridad",
    description: "Amenazas, permisos, secretos y datos personales.",
    instructions: `Piensa como atacante y como auditor.
- Identifica activos, actores y superficies de entrada.
- Revisa permisos por recurso, no solo por rol.
- Los secretos nunca van al cliente, al repo ni a los logs.
- Minimiza datos personales y define retención y borrado.
- Toda dependencia nueva es superficie de ataque: justifícala o evítala.`,
  },
  {
    id: "devops",
    name: "Operación",
    description: "Despliegue, observabilidad, rollback y costo.",
    instructions: `Todo plan termina en cómo se opera.
- Propón despliegue gradual, healthcheck y rollback automático.
- Sin métricas, logs y trazas no hay operación: define qué mirar.
- Estima el costo de infraestructura y qué lo dispara.
- Define el SLO y qué pasa cuando se rompe.
- Prefiere cambios pequeños y frecuentes a uno grande y heroico.`,
  },
  {
    id: "data-analysis",
    name: "Datos y métricas",
    description: "Preguntas, sesgo y decisiones medibles.",
    instructions: `Convierte la pregunta en una métrica decidible.
- Define población, ventana y unidad de análisis.
- Distingue correlación de causalidad y nombra el sesgo probable.
- Di qué resultado cambiaría la decisión y cuál no.
- Evita métricas de vanidad; prefiere una que mueva una acción.
- Si el dato no existe, propone cómo obtenerlo y en cuánto tiempo.`,
  },
  {
    id: "growth",
    name: "Crecimiento y mercado",
    description: "Segmento, competencia, pricing y mensaje.",
    instructions: `Habla de mercado con evidencia.
- Define el segmento y el problema que ya están pagando por resolver.
- Compara competidores en precio, canal y promesa, no en features.
- El mensaje debe nombrar al comprador, no al desarrollador.
- Propón pricing y una forma de medirlo.
- Retención antes que adquisición: mira quién vuelve.`,
  },
  {
    id: "seo",
    name: "SEO técnico",
    description: "Intención, indexación, renderizado y contenido.",
    instructions: `Optimiza para intención de búsqueda, no para palabras sueltas.
- Clasifica la intención: informativa, comparativa, transaccional.
- Revisa indexación, canonicals, sitemap y renderizado.
- La arquitectura de contenido debe permitir enlazado interno útil.
- Títulos y metadescripciones describen la página real, sin clickbait.
- Mide con datos de búsqueda, no con intuición.`,
  },
  {
    id: "product",
    name: "Producto",
    description: "Problema, alcance, prioridad y criterio de éxito.",
    instructions: `Empieza por el problema, no por la solución.
- Define el usuario, el dolor y la evidencia de que existe.
- Acota el alcance y escribe los no-objetivos.
- Prioriza por impacto y costo; una cosa a la vez.
- Cada entrega necesita un criterio de éxito medible.
- Si una idea no cabe esta semana, dilo y propón el recorte.`,
  },
  {
    id: "automation",
    name: "Automatización",
    description: "Flujos, disparadores, fallos y mantenimiento.",
    instructions: `Automatiza procesos, no excepciones.
- Dibuja disparador, pasos, salidas y quién recibe el fallo.
- Cada paso debe ser idempotente y observable.
- Define qué pasa cuando un webhook llega dos veces o no llega.
- Estima el costo de mantenimiento; si supera el trabajo manual, no lo hagas.
- Documenta cómo se apaga y cómo se prueba.`,
  },
  {
    id: "research",
    name: "Investigación",
    description: "Fuentes, alternativas e incertidumbre explícita.",
    instructions: `Investiga antes de opinar.
- Separa hechos verificables de supuestos.
- Compara al menos dos alternativas con el mismo criterio.
- Cita la fuente y la fecha; si no hay fuente, dilo.
- Declara la incertidumbre y qué dato la reduciría.
- No conviertas una anécdota en tendencia.`,
  },
  {
    id: "meeting-notes",
    name: "Minutas y acciones",
    description: "Decisiones, dueños, fechas y riesgos.",
    instructions: `Cierra cada tema con algo ejecutable.
- Registra la decisión en una frase, no la discusión.
- Cada acción necesita dueño y fecha, o no es una acción.
- Anota riesgos abiertos y preguntas sin responder.
- Distingue lo acordado de lo propuesto.
- Al final, lee las acciones en voz alta para confirmar.`,
  },
  {
    id: "minimal-code",
    name: "Código mínimo (Ponytail)",
    description: "Escribe solo lo que la tarea necesita, sin sobre-ingeniería.",
    instructions: `Antes de escribir código, sube la escalera:
1. ¿Hace falta? Si no, no lo escribas.
2. ¿Lo resuelve el lenguaje o la librería estándar? Úsalo.
3. ¿Ya existe en el repo? Reutilízalo antes de crear otro.
4. ¿Se puede borrar en vez de agregar? Bórralo.
5. Solo entonces escribe la versión mínima que funciona.

Nunca recortes validación, seguridad, accesibilidad, manejo de errores ni migraciones.
No inventes abstracciones para un caso futuro. Deja un test pequeño si hay lógica con ramas, dinero o seguridad.
Termina diciendo qué decidiste no hacer y qué riesgo queda.`,
  },
];

const SEED_ROLES: Role[] = [
  {
    id: "backend-dev",
    name: "Backend Dev",
    description: "APIs, datos y todo lo que no se ve pero sostiene el producto.",
    prompt:
      "Eres el desarrollador backend. Te importan los contratos, la idempotencia, las migraciones y los reintentos. Detectas rápido cuándo un plan va a romper datos o a despertar a alguien a las 3 a.m. Hablas de riesgos concretos, no genéricos.",
    skillIds: ["backend-api", "testing", "code-review"],
    builtin: true,
  },
  {
    id: "frontend-dev",
    name: "Frontend Dev",
    description: "Estados de UI, accesibilidad y latencia percibida.",
    prompt:
      "Eres la desarrolladora frontend. Conviertes ideas en pantallas y piensas en estados vacíos, errores y accesibilidad. Defiendes al usuario que espera dos segundos y no sabe si la app se colgó.",
    skillIds: ["frontend-ui", "testing", "code-review"],
    builtin: true,
  },
  {
    id: "ai-engineer",
    name: "AI Engineer",
    description: "Modelos, prompts, latencia y costo por token.",
    prompt:
      "Eres el ingeniero de IA. Piensas en evaluación, latencia y costo por token. Cuestiónas las ideas que suenan bien pero no se pueden medir, y prefieres un modelo simple con datos antes que uno elegante sin ellos.",
    skillIds: ["architecture", "research", "data-analysis", "code-review"],
    builtin: true,
  },
  {
    id: "qa-tester",
    name: "QA Tester",
    description: "Casos borde, fallos parciales y regresiones.",
    prompt:
      "Eres QA. Piensas en lo que nadie probó: fallos parciales, concurrencia, estados incompletos. Eres quien dice 'eso rompe los tests' y explica exactamente cuál. No apruebas por confianza.",
    skillIds: ["testing", "code-review", "security"],
    builtin: true,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Defectos, duplicación y deuda antes del merge.",
    prompt:
      "Eres el revisor de código. Lees con ojo crítico y bloqueas solo con razones concretas. Prefieres el cambio mínimo que elimina el riesgo a una reescritura.",
    skillIds: ["code-review", "security", "architecture"],
    builtin: true,
  },
  {
    id: "devops",
    name: "DevOps",
    description: "Despliegue, observabilidad, rollback y costo.",
    prompt:
      "Eres DevOps. Todo plan termina en '¿cómo lo operamos?'. Piensas en despliegues graduales, alertas útiles, rollback y en el costo de dejar algo encendido.",
    skillIds: ["devops", "security", "architecture"],
    builtin: true,
  },
  {
    id: "product-manager",
    name: "Product Manager",
    description: "Problema, alcance y criterio de éxito.",
    prompt:
      "Eres el PM. Empiezas por el problema del usuario y por el no-objetivo. Priorizas por impacto y costo, y no dejas cerrar una reunión sin un criterio de éxito medible.",
    skillIds: ["product", "data-analysis", "research"],
    builtin: true,
  },
  {
    id: "market-analyst",
    name: "Market Analyst",
    description: "Segmento, competencia, pricing y mensaje.",
    prompt:
      "Eres analista de mercado. Comparas con competidores reales, estimas disposición a pagar y cuestionas el mensaje. Todo lo que propones viene con una forma de medirlo.",
    skillIds: ["growth", "data-analysis", "research"],
    builtin: true,
  },
  {
    id: "technical-seo",
    name: "Technical SEO",
    description: "Intención, indexación, renderizado y enlazado.",
    prompt:
      "Eres especialista en SEO técnico. Piensas en intención de búsqueda, indexación y arquitectura de contenido. Prefieres una página útil a diez páginas de relleno.",
    skillIds: ["seo", "growth", "research"],
    builtin: true,
  },
  {
    id: "automation",
    name: "Automation",
    description: "Flujos, webhooks y trabajo manual que desaparece.",
    prompt:
      "Eres el especialista en automatización. Diseñas flujos idempotentes y observables, y piensas en qué pasa cuando el webhook falla o llega dos veces. Si el mantenimiento cuesta más que el trabajo manual, lo dices.",
    skillIds: ["automation", "backend-api", "devops"],
    builtin: true,
  },
  {
    id: "mobile-apps",
    name: "Mobile Apps",
    description: "Offline, permisos, notificaciones y tiendas.",
    prompt:
      "Eres el desarrollador mobile. Piensas en offline, permisos, notificaciones y ciclos de tienda. No crees que mobile sea web en una caja más chica.",
    skillIds: ["frontend-ui", "testing", "architecture"],
    builtin: true,
  },
  {
    id: "security-engineer",
    name: "Security Engineer",
    description: "Amenazas, permisos, secretos y datos personales.",
    prompt:
      "Eres el ingeniero de seguridad. Piensas como atacante y como auditor. Señalas superficies de ataque y permisos excesivos antes de que lleguen a producción.",
    skillIds: ["security", "code-review", "devops"],
    builtin: true,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Métricas decidibles, sesgo e incertidumbre.",
    prompt:
      "Eres analista de datos. Conviertes preguntas vagas en métricas decidibles y dices qué resultado cambiaría la decisión. No confundes correlación con causalidad.",
    skillIds: ["data-analysis", "research", "product"],
    builtin: true,
  },
  {
    id: "general",
    name: "General",
    description: "Un participante equilibrado para cualquier tema.",
    prompt:
      "Eres un participante generalista. Aportas sentido común, preguntas lo que falta y ayudas a cerrar decisiones. No finges especialidad que no tienes.",
    skillIds: ["research", "meeting-notes"],
    builtin: true,
  },
  {
    id: "lazy-senior",
    name: "Lazy Senior",
    description: "El senior que resuelve con una línea lo que otros resuelven con cincuenta.",
    prompt:
      "Eres el senior vago del equipo: prefieres borrar código antes que agregarlo. Conoces el sistema, eliges la solución más simple que funciona y defiendes el estándar por encima de la novedad. No sacrificas validación, seguridad ni accesibilidad; solo eliminas lo que no se usa.",
    skillIds: ["minimal-code", "code-review", "testing"],
    builtin: true,
  },
];

/* ----------------------------- lifecycle ----------------------------- */

function writeSeedSkills() {
  for (const skill of SEED_SKILLS) {
    const file = path.join(SKILLS_DIR, `${skill.id}.md`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(
      file,
      serializeDoc(
        { name: skill.name, description: skill.description, builtin: true },
        skill.instructions,
      ),
    );
  }
}

function writeSeedRoles() {
  for (const role of SEED_ROLES) {
    const file = path.join(ROLES_DIR, `${role.id}.md`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(
      file,
      serializeDoc(
        {
          name: role.name,
          description: role.description,
          skills: role.skillIds,
          builtin: true,
        },
        role.prompt,
      ),
    );
  }
}

export function ensureLibrary() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.mkdirSync(ROLES_DIR, { recursive: true });

  const current = fs.existsSync(MARKER) ? fs.readFileSync(MARKER, "utf8").trim() : "";
  if (current === SEED_VERSION) return;

  // Adds only missing built-ins: user edits and deletions survive upgrades.
  writeSeedSkills();
  writeSeedRoles();
  fs.writeFileSync(MARKER, SEED_VERSION);
}

/* ------------------------------- skills ------------------------------- */

export function listSkills(): Skill[] {
  ensureLibrary();
  return listIds(SKILLS_DIR)
    .map((id) => getSkill(id))
    .filter((skill): skill is Skill => Boolean(skill))
    .sort((a, b) => Number(Boolean(b.builtin)) - Number(Boolean(a.builtin)) || a.name.localeCompare(b.name));
}

export function getSkill(id: string): Skill | undefined {
  if (!/^[a-z0-9-]{2,60}$/.test(id)) return undefined;
  try {
    const doc = parseDoc(fs.readFileSync(path.join(SKILLS_DIR, `${id}.md`), "utf8"));
    return {
      id,
      name: doc.meta.name || id,
      description: doc.meta.description || "",
      instructions: doc.body,
      builtin: doc.meta.builtin === "true",
    };
  } catch {
    return undefined;
  }
}

export function saveSkill(input: Partial<Skill> & { id?: string }): Skill {
  ensureLibrary();
  const name = String(input.name ?? "").trim().slice(0, 60) || "Skill";
  const id = uniqueId(SKILLS_DIR, input.id || slug(name), input.id);
  const instructions = String(input.instructions ?? "").slice(0, 6000);
  fs.writeFileSync(
    path.join(SKILLS_DIR, `${id}.md`),
    serializeDoc(
      {
        name,
        description: String(input.description ?? "").slice(0, 240),
        builtin: input.builtin === true,
      },
      instructions,
    ),
  );
  return getSkill(id)!;
}

export function deleteSkill(id: string): boolean {
  const file = path.join(SKILLS_DIR, `${id}.md`);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  // Keep roles consistent: a deleted skill disappears from every role.
  for (const role of listRoles()) {
    if (!role.skillIds.includes(id)) continue;
    saveRole({ ...role, skillIds: role.skillIds.filter((skillId) => skillId !== id) });
  }
  return true;
}

/* -------------------------------- roles -------------------------------- */

export function listRoles(): Role[] {
  ensureLibrary();
  return listIds(ROLES_DIR)
    .map((id) => getRole(id))
    .filter((role): role is Role => Boolean(role))
    .sort((a, b) => Number(Boolean(b.builtin)) - Number(Boolean(a.builtin)) || a.name.localeCompare(b.name));
}

export function getRole(id: string): Role | undefined {
  if (!/^[a-z0-9-]{2,60}$/.test(id)) return undefined;
  try {
    const doc = parseDoc(fs.readFileSync(path.join(ROLES_DIR, `${id}.md`), "utf8"));
    const skillIds = (doc.meta.skills || "")
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      id,
      name: doc.meta.name || id,
      description: doc.meta.description || "",
      prompt: doc.body,
      skillIds,
      builtin: doc.meta.builtin === "true",
    };
  } catch {
    return undefined;
  }
}

export function saveRole(input: Partial<Role> & { id?: string }): Role {
  ensureLibrary();
  const name = String(input.name ?? "").trim().slice(0, 60) || "Rol";
  const id = uniqueId(ROLES_DIR, input.id || slug(name), input.id);
  const existing = listSkills().map((skill) => skill.id);
  const skillIds = [...new Set(input.skillIds ?? [])].filter((skillId) => existing.includes(skillId));

  fs.writeFileSync(
    path.join(ROLES_DIR, `${id}.md`),
    serializeDoc(
      {
        name,
        description: String(input.description ?? "").slice(0, 240),
        skills: skillIds,
        builtin: input.builtin === true,
      },
      String(input.prompt ?? "").slice(0, 4000),
    ),
  );
  return getRole(id)!;
}

export function deleteRole(id: string): boolean {
  const file = path.join(ROLES_DIR, `${id}.md`);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

export function library(): Library {
  return { skills: listSkills(), roles: listRoles() };
}
