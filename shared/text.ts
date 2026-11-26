/**
 * Text helpers for keeping the room from saying the same thing twice.
 * Everything here is deterministic and language-agnostic enough for Spanish.
 */

const STOPWORDS = new Set([
  "que", "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero",
  "en", "con", "por", "para", "del", "al", "se", "su", "sus", "es", "son", "esta", "estan",
  "esto", "eso", "como", "mas", "ya", "lo", "le", "les", "me", "mi", "nos", "si", "no",
  "hay", "muy", "sin", "sobre", "entre", "cuando", "donde", "porque", "tambien", "puede",
  "puedo", "hacer", "hace", "ser", "tiene", "tengo", "voy", "vas", "va", "hemos", "han",
  "fue", "era", "este", "ese", "esa", "aqui", "alli", "todo", "toda", "todos", "todas",
  "the", "and", "for", "with", "that", "this", "have", "from", "your", "you", "are", "was",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentTokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Jaccard over content words. Returns 0 for texts too short to judge. */
export function similarity(a: string, b: string): number {
  const left = new Set(contentTokens(a));
  const right = new Set(contentTokens(b));
  if (left.size < 4 || right.size < 4) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Drops sentences that repeat earlier sentences inside the same message. */
export function collapseRepeatedSentences(text: string): string {
  const parts = text.split(/(?<=[.!?…])\s+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const key = contentTokens(part).join(" ");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(part.trim());
  }
  return kept.join(" ").trim();
}

export function isDuplicateOf(text: string, others: string[], threshold = 0.55): string | null {
  for (const other of others) {
    if (similarity(text, other) >= threshold) return other;
  }
  return null;
}

const ACK = /^(ok|okay|dale|va|vale|sí|si|claro|gracias|perfecto|genial|de acuerdo|listo|bueno)[.!]?$/i;

export function isAcknowledgement(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  return ACK.test(clean) || clean.split(/\s+/).length <= 3;
}
