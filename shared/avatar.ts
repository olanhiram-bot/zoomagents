/** Deterministic seeds so a name always gets the same face until you shuffle it. */

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seedFromName(name: string): number {
  return hashSeed(name.trim().toLowerCase());
}

/**
 * Name + role, so two agents called "Claude" still get different faces.
 * Kept separate from the role library so a custom role also changes the face.
 */
export function seedForAgent(name: string, role: string): number {
  return hashSeed(`${name.trim().toLowerCase()}::${role.trim().toLowerCase()}`);
}

/** Small deterministic PRNG (mulberry32). */
export function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
