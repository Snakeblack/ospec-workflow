# agy-05-validator-doctor-engram-docs

## Intent and acceptance

Endurecer validate-antigravity.js, anadir sonda hook-responds y check sandbox-cli en ospec doctor, configurar permisos Engram para Antigravity en engram-setup y sincronizar documentacion de Antigravity

Acceptance: validate-antigravity rechaza frontmatter/tools/model/review-*/globs/archivos muertos/placeholders invalidos; ospec doctor ejecuta sonda PreToolUse en vivo sin escribir archivos y avisa ante sandbox C2; setup:antigravity y doctor gestionan permisos Engram en ~/.gemini/antigravity-cli/settings.json de forma idempotente y fail-open; docs reflejan agy 1.5.15 y los otros 6 targets mantienen 0 bytes de diff

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-24T06:10:27.194Z):

> PR 5 feat/agy-05-validator-doctor-engram-docs: validador estricto de Antigravity, sonda y aviso sandbox en ospec doctor, permisos Engram en settings.json y sincronizacion documental

Answer 1 — open-facts, user, 2026-11-24T06:15:45.539Z:

> confirmo todas las recomendadas: (1A) reglas explicitas mcp(engram/<tool>) para herramientas no destructivas de lectura y escritura de Engram excluyendo mem_delete y mem_merge_projects en ~/.gemini/antigravity-cli/settings.json respetando mcp(engram/*) y ask/deny con check no fatal en ospec doctor; (2A) antigravity/sandbox-cli en ospec doctor emite warn solo cuando enableTerminalSandbox:true, agentMode:auto o JSON ilegible y ok sin ruido si no existe o usa accept-edits/default; (3A) validate-antigravity fail-closed con error para frontmatter/tools/model/review-*, globs sin **/, commands/.mcp.json en FORBIDDEN_PATHS y ${input:...} en validate() mas placeholders sin renderizar en validateInstalled(); (4A) entregar todo de forma concisa en PR 5 dentro del presupuesto de <=400 lineas revisables, partiendo en 5a/5b solo si lo superase

Answer 2 — base-moved, user, 2026-11-24T08:09:24.795Z:

> pertenecen a otros cambios
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/plugin-installation.es.md`, `docs/plugin-installation.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `openspec/specs/idd/spec.md`, `openspec/specs/install/spec.md`, `openspec/specs/session-memory/spec.md`, `scripts/configure/engram-setup.js`, `scripts/configure/engram-setup.test.js`, `scripts/configure/validate-antigravity.js`, `scripts/configure/validate-antigravity.test.js`, `scripts/lib/engram-claude-allow.js`, `scripts/lib/ospec-doctor-hosts.js`, `scripts/lib/ospec-doctor-hosts.test.js`, `scripts/lib/ospec-doctor.js`, `scripts/session-memory-contract.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Mantener los permisos allow de Engram para Antigravity en el modulo puro de datos (sin llamadas ni lecturas) y la comprobacion en ospec-doctor.js para preservar la frontera ADR 0006 verificada por session-memory-contract.test.js
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-24T08:10:58.962Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-24T08:10:58.962Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-24T08:11:22.028Z)
- ev-4: living-doc-current for living-doc (2026-11-24T08:11:22.233Z)
<!-- ospec:evidence:end -->
