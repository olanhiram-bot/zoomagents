import type { Participant } from "../shared/types.js";
import { normalize } from "../shared/text.js";

const DISTINCTIVE_FIRST = new Set([
  "backend",
  "frontend",
  "devops",
  "mobile",
  "security",
  "automation",
  "market",
  "technical",
]);

const ROLE_KEYWORDS: [RegExp, string][] = [
  [/\bqa\b|tester|calidad/, "qa"],
  [/devops|sre|infraestructura/, "devops"],
  [/seo/, "seo"],
  [/mobile|android|ios/, "mobile"],
  [/security|seguridad/, "security"],
  [/automation|automatizacion/, "automation"],
  [/reviewer|revisor/, "reviewer"],
  [/market|growth|mercado/, "market"],
  [/analyst|analista/, "analyst"],
  [/intern|interno/, "intern"],
  [/frontend|front/, "frontend"],
  [/backend|back/, "backend"],
  [/product|pm\b/, "product"],
];

function roleAliases(participant: Participant): string[] {
  const role = normalize(participant.role);
  const aliases = new Set<string>();
  if (role) aliases.add(role);

  const first = role.split(" ")[0];
  if (first && DISTINCTIVE_FIRST.has(first)) aliases.add(first);

  for (const [pattern, alias] of ROLE_KEYWORDS) {
    if (pattern.test(role)) aliases.add(alias);
  }

  return [...aliases];
}

/**
 * Finds who the text is addressing. Roles are the reliable identifier because
 * sample agents share names ("Claude"); a bare name only counts when unique.
 */
export function detectAddressees(text: string, participants: Participant[]): Participant[] {
  if (!text.trim() || !participants.length) return [];

  const haystack = ` ${normalize(text)} `;
  const contains = (alias: string) => Boolean(alias) && haystack.includes(` ${alias} `);

  const nameCounts = new Map<string, number>();
  for (const participant of participants) {
    const name = normalize(participant.name);
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const matches = participants.filter((participant) => {
    if (roleAliases(participant).some(contains)) return true;

    const name = normalize(participant.name);
    const role = normalize(participant.role);
    if (!name) return false;

    if (nameCounts.get(name) === 1 && contains(name)) return true;
    if (contains(`${name} ${role}`)) return true;

    const firstRole = role.split(" ")[0];
    if (firstRole && DISTINCTIVE_FIRST.has(firstRole) && contains(`${name} ${firstRole}`)) {
      return true;
    }
    return false;
  });

  return [...new Map(matches.map((participant) => [participant.id, participant])).values()];
}
