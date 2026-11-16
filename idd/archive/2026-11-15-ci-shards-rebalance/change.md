# ci-shards-rebalance

## Intent and acceptance

Validate Harness reparte Windows en 4 shards y macOS en 3: con 3 y 2, el reparto por turnos de --test-shard dejaba Windows 2/3 con 897 s de tests frente a 457 y 612 s y el job más lento en 363-400 s

Acceptance: La matriz de Validate Harness tiene Ubuntu 1, macOS 2 shards → 3 y Windows 3 → 4; las 5 ejecuciones de la PR miden el job más lento

## Plan

<!-- ospec:plan:start -->
- Files: `.github/workflows/validate-harness.yml`, `docs/roadmaps/harness-evolution.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Windows en 4 shards y macOS en 3, repartidos por turnos con --test-shard (decisión del usuario frente al reparto equilibrado por pesos medidos): estimado ~221 s de fase paralela en Windows y ~179 s en macOS; con más ficheros el reparto puede volver a desequilibrarse
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-15T22:22:15.955Z)
- ev-2: check-run for checks-pass (2026-11-15T22:23:42.716Z)
- ev-3: living-doc-current for living-doc (2026-11-15T22:23:42.852Z)
<!-- ospec:evidence:end -->
