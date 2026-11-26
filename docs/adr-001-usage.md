# ADR 001 — Contabilidad de uso por turno

**Fecha:** 2026-11-20 · **Estado:** aceptado

## Contexto

La sala estimaba el tamaño del prompt con `chars/4` y descartaba el `usage` que
Anthropic, OpenAI y Google devuelven en el stream. Sin ese dato no se puede
decidir si `maxTokens: 260`, la elección de modelo por agente o el resumen barato
son decisiones correctas: serían corazonadas.

## Decisión

1. Cada proveedor con API reporta `inputTokens`, `outputTokens` y `cachedTokens`
   mediante `StreamOptions.onUsage`. Los transportes CLI y el proveedor simulado
   no reportan nada: se marcan `source: "estimate"` (chars/4).
2. `server/room.ts` mide tiempo total y tiempo al primer token (TTFT) por
   llamada, acumula en `session.usageTotals` y emite el evento `usage` con
   `last` y `totals`.
3. El costo sale de una tabla estática en `server/usage.ts` (USD por millón de
   tokens, revisada 2026-11). Modelos desconocidos devuelven `null`: nunca se
   inventa un precio. El total se muestra como "parcial" si hay llamadas sin precio.

## Consecuencias

- Nueva métrica accionable: costo por intervención y TTFT. Un TTFT alto (>2 s)
  justifica cambiar de modelo o de transporte antes que tocar el prompt.
- La tabla de precios envejece. Es deuda conocida: se actualiza a mano y
  `npm run usage-check` falla si el cálculo cambia.
- El CLI (Claude Code, Codex, Gemini) sigue ciego en tokens reales. Si se
  necesita precisión ahí, el siguiente paso es pedir `--output-format json` y
  leer el bloque de uso, no estimar.
- Los cache-writes de Anthropic se contabilizan al precio de input; el error es
  de ~25% solo sobre ese segmento.
