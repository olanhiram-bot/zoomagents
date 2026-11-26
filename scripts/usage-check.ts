import assert from "node:assert/strict";
import type { TurnUsage } from "../shared/types.js";
import { addTurn, costUsd, emptyTotals } from "../server/usage.js";

function turn(overrides: Partial<TurnUsage> = {}): TurnUsage {
  return {
    agentId: "a1",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputTokens: 10_000,
    outputTokens: 260,
    cachedTokens: 0,
    estimatedTokens: 9_000,
    source: "provider",
    ttftMs: 600,
    ms: 1_400,
    at: 0,
    ...overrides,
  };
}

// 10k in * $1/M + 260 out * $5/M = 0.01 + 0.0013
assert.equal(costUsd(turn()), 0.0113);

// Cached input is charged at the cache-read price, not the full price.
assert.equal(costUsd(turn({ cachedTokens: 8_000 })), 0.0041);

// Unpriced models (mock, unknown ids) yield null instead of a made-up number.
assert.equal(costUsd(turn({ provider: "mock", model: "mock-1" })), null);

const totals = addTurn(addTurn(emptyTotals(), turn()), turn({ source: "estimate", provider: "mock", model: "mock-1" }));
assert.equal(totals.calls, 2);
assert.equal(totals.inputTokens, 20_000);
assert.equal(totals.estimatedCalls, 1);
assert.equal(totals.knownCostCalls, 1);
assert.equal(totals.totalMs, 2_800);

console.log("usage-check: ok");
