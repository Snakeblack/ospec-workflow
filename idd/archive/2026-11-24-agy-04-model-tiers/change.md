# agy-04-model-tiers

## Intent and acceptance

Habilitar enrutamiento de tiers de modelo nativos (pro, inherit, flash, flash_lite) para Antigravity en models.yaml, user-models, instalador y TUI

Acceptance: Los agentes generados de Antigravity emiten el tier de modelo resuelto (pro/flash/flash_lite u omision para inherit) validado por agy plugin validate y agy agents, setup:antigravity y el TUI soportan --model validado al conjunto cerrado de Antigravity, y los agentes/artefactos transformados de los otros 6 targets quedan intactos byte a byte

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-23T22:38:53.098Z):

> PR 4 feat/agy-04-model-tiers: enrutamiento de modelos Antigravity tras sonda en vivo en agy 1.5.15

Answer 1 — open-facts, user, 2026-11-24T04:48:23.875Z:

> todas las recomendadas: (1A) models.yaml con premium=pro, default=inherit, cheap=flash y antigravity en ASSIGNABLE_HOSTS con --model y TUI restringido a {pro, inherit, flash, flash_lite} con fallback a models.yaml como Claude; (2A) normalizar a minusculas y tratar inherit omitiendo model: del frontmatter; (3A) dejar IDs concretos Carbon/Neon/Hydrogen para run_workflow/bench (PR 10) y doctor (PR 5), manteniendo setup:antigravity 100% offline; (4A) fail-closed rechazando valores fuera de {pro, inherit, flash, flash_lite} en user-models, --model y TUI explicando que el loader de Antigravity descarta agentes con IDs concretos
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/model-routing.md`, `models.yaml`, `openspec/specs/generator/spec.md`, `openspec/specs/install/spec.md`, `scripts/configure/install-antigravity.js`, `scripts/configure/install-antigravity.test.js`, `scripts/configure/install-output.js`, `scripts/configure/installer-adapter.js`, `scripts/configure/installer-adapter.test.js`, `scripts/configure/installer-protocol.test.js`, `scripts/configure/user-model-map.test.js`, `scripts/fixtures/context-baseline.json`, `scripts/lib/model-resolver.js`, `scripts/lib/model-resolver.test.js`, `scripts/lib/target-profiles/antigravity.js`, `scripts/lib/target-transform.test.js`, `scripts/lib/user-models.js`, `scripts/lib/user-models.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Usar solo los 4 tiers abstractos validados en vivo por agy 1.5.15 (pro, inherit, flash, flash_lite) en frontmatter de agentes Antigravity para evitar que el loader descarte agentes
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-24T04:59:30.995Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-24T04:59:30.995Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-24T04:59:30.995Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-24T05:01:35.819Z)
- ev-5: check-run for checks-pass (2026-11-24T05:03:09.458Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-11-24T05:03:09.458Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-24T05:03:09.458Z)
- ev-8: living-doc-current for living-doc (2026-11-24T05:03:09.602Z)
<!-- ospec:evidence:end -->
