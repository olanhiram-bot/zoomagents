/**
 * Token accounting. Providers report real usage in their streams; the CLI
 * transports do not, so callers must tell us when a number is an estimate.
 *
 * Prices are USD per million tokens, checked 2026-11. They are a decision aid,
 * not an invoice: bump them when a provider changes its list price.
 */
import type { ProviderId, TurnUsage, UsageTotals } from "../shared/types.js";

type Price = { input: number; output: number; cachedInput: number };

const PRICES: Record<string, Price> = {
  "anthropic:claude-sonnet-4-5": { input: 3, output: 15, cachedInput: 0.3 },
  "anthropic:sonnet": { input: 3, output: 15, cachedInput: 0.3 },
  "anthropic:claude-haiku-4-5": { input: 1, output: 5, cachedInput: 0.1 },
  "anthropic:haiku": { input: 1, output: 5, cachedInput: 0.1 },
  "anthropic:claude-opus-4-1": { input: 15, output: 75, cachedInput: 1.5 },
  "anthropic:opus": { input: 15, output: 75, cachedInput: 1.5 },
  "openai:gpt-4o": { input: 2.5, output: 10, cachedInput: 1.25 },
  "openai:gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "google:gemini-2.5-flash": { input: 0.3, output: 2.5, cachedInput: 0.075 },
  "google:gemini-2.5-pro": { input: 1.25, output: 10, cachedInput: 0.3125 },
};

/** Rough family match for model ids we do not know by name. */
function priceFor(provider: ProviderId, model: string): Price | null {
  const exact = PRICES[`${provider}:${model}`];
  if (exact) return exact;
  const prefix = Object.keys(PRICES).find(
    (key) => key.startsWith(`${provider}:`) && model.startsWith(key.slice(provider.length + 1)),
  );
  return prefix ? PRICES[prefix] : null;
}

export function costUsd(usage: TurnUsage): number | null {
  const price = priceFor(usage.provider, usage.model);
  if (!price || usage.inputTokens === null || usage.outputTokens === null) return null;
  const cached = Math.min(usage.cachedTokens ?? 0, usage.inputTokens);
  const fresh = Math.max(0, usage.inputTokens - cached);
  return (
    (fresh * price.input + cached * price.cachedInput + usage.outputTokens * price.output) / 1_000_000
  );
}

/** Provider streams report usage in different shapes; this is the common one. */
export type RawUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number;
};

export function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    estimatedCalls: 0,
    costUsd: 0,
    knownCostCalls: 0,
    totalMs: 0,
  };
}

export function addTurn(totals: UsageTotals, turn: TurnUsage): UsageTotals {
  const next: UsageTotals = {
    calls: totals.calls + 1,
    inputTokens: totals.inputTokens + (turn.inputTokens ?? 0),
    outputTokens: totals.outputTokens + (turn.outputTokens ?? 0),
    cachedTokens: totals.cachedTokens + turn.cachedTokens,
    estimatedCalls: totals.estimatedCalls + (turn.source === "estimate" ? 1 : 0),
    costUsd: totals.costUsd,
    knownCostCalls: totals.knownCostCalls,
    totalMs: totals.totalMs + turn.ms,
  };
  const cost = costUsd(turn);
  if (cost !== null) {
    next.costUsd += cost;
    next.knownCostCalls += 1;
  }
  return next;
}
