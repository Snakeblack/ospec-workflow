# agy-02-agents-tools

## Intent and acceptance

Actualizar toolMap de Antigravity a AGY 1.5.14, aislar subagentes review-* (mainAgent/subagent/inheritMcp/commandExecutionPolicy) y traducir flags de skills internas solo en target Antigravity

Acceptance: El perfil antigravity emite herramientas canonicas de AGY 1.5.14 (read_file, write_file, edit_file, run_command, invoke_subagent, ask_question) eliminando grep_search y list_dir, aísla los subagentes review-* con tools:[read_file], mainAgent:false, subagent:true, inheritMcp:false y commandExecutionPolicy:off, traduce user-invocable:false en agentes y skills internas de Antigravity conservando disable-model-invocation, y deja los otros 6 targets intactos byte a byte

## Request and answers

<!-- ospec:log:start -->
Answer 1 — open-facts, user, 2026-11-22T01:40:16.106Z:

> todas las recomendadas: (1) omitir commandExecutionPolicy en agentes con execute para heredar la politica de sesion del usuario y emitir commandExecutionPolicy: off en agentes sin execute (revisores y fases sin shell); (2) traducir user-invocable: false a disable-slash-command: true (quitando user-invocable) en todas las skills internas que declaran user-invocable: false (_shared, review-* y ejecutores sdd-*), manteniendo disable-model-invocation: true; (3) subir ya la rama tracker feat/antigravity-15-remediation y abrir PR 1 (PR 2 se implementa en la siguiente sesion)
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/generator/spec.md`, `scripts/fixtures/context-baseline.json`, `scripts/lib/target-profiles/antigravity.js`, `scripts/lib/target-transform.js`, `scripts/lib/target-transform.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Anadir hooks declarativos opcionales en target-transform.js (solo activados cuando el perfil los declara en antigravity.js) para garantizar 0 bytes de diferencia en los otros 6 targets
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-22T01:49:03.714Z)
- ev-2: check-run for checks-pass (2026-11-22T01:51:01.551Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-22T01:51:01.551Z)
- ev-4: living-doc-current for living-doc (2026-11-22T01:51:17.151Z)
<!-- ospec:evidence:end -->
