# agy-03-commands-rules-mcp-hygiene

## Intent and acceptance

Emitir meta-comandos SDD como skills planas, prefijar globs con **/ en reglas, eliminar .mcp.json muerto y separar metadata.user_markdown en SessionStart solo en target Antigravity

Acceptance: El build de Antigravity omite commands/*.prompt.md y .mcp.json, emite los meta-comandos SDD sin colision como skills/<name>/SKILL.md con disable-model-invocation:true y $ARGUMENTS, prefija globs relativos de reglas con **/, separa metadata.user_markdown de systemMessage en SessionStart eliminando el JSON diagnostico, y deja los otros 6 targets intactos byte a byte

## Request and answers

<!-- ospec:log:start -->
Answer 1 — open-facts, user, 2026-11-22T01:56:53.000Z:

> todas las recomendadas: (1) A2 emitir solo los 4 meta-comandos SDD sin colision (sdd-continue, sdd-ff, sdd-lite, sdd-new) como skills/<name>/SKILL.md con disable-model-invocation: true y $ARGUMENTS, conservar las 14 skills/sdd-<fase>/SKILL.md intactas y omitir todo commands/*.prompt.md; (2) M1 dejar rules/sdd-openspec.instructions.md intacta en fuente canonica para mantener 0 bytes de diff en los otros 6 targets y prefijar **/ solo en la salida de Antigravity en toInstructionFile; (3) M3 en SessionStart de Antigravity enviar al modelo en systemMessage el contexto IDD accionable (additionalContext), errores [ospec error] y alertas de seguridad (output.security si existen, vacio en sesiones limpias), y mostrar output.systemMessage al usuario en metadata.user_markdown eliminando el JSON diagnostico; (4) PR 3 se implementa en la siguiente sesion

Answer 2 — retract persistent-data, user, 2026-11-23T21:59:13.575Z:

> confirmo
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/generator/spec.md`, `openspec/specs/hooks/spec.md`, `scripts/configure/real-repo.test.js`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`, `scripts/lib/rule-scope.test.js`, `scripts/lib/target-profiles/antigravity.js`, `scripts/lib/target-transform.js`, `scripts/lib/target-transform.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Aislar A2/A3/M1 en opciones declarativas del perfil antigravity y M3 en normalizeAntigravityHookOutput para garantizar 0 bytes de diferencia en los otros 6 targets
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-23T21:23:11.731Z)
- ev-2: frozen-review for trust-review (2026-11-23T21:31:26.771Z, relayed)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-23T21:33:01.689Z)
- ev-4: check-run for checks-pass (2026-11-23T22:00:49.462Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-23T22:00:49.462Z)
- ev-6: living-doc-current for living-doc (2026-11-23T22:00:49.803Z)
<!-- ospec:evidence:end -->
