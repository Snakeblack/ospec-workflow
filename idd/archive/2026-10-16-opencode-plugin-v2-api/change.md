# opencode-plugin-v2-api

## Intent and acceptance

El plugin generado para OpenCode (target opencode) solo exporta la forma v1 y no carga en OpenCode v2, que exige un default export con id y setup/effect; el bridge pierde session-start y pre-tool-use (roadmap E1.25).

Acceptance: En OpenCode v2 el plugin generado carga sin failed to load plugin y su id aparece activo; session-start y pre-tool-use se ejecutan con la semantica del bridge v1; el generador emite la forma acordada y el validador la exige.

## Plan

1. Fase roja: tests de reproducción que exigen el default export dual en el generador y el rechazo del validador a la forma v1-only (par `repro-test` registrado con `ospec run`).
2. Generador `scripts/lib/target-profiles/opencode-plugin.js`: emite `export default { id: "ospec", server, setup }`; `setup` registra `ctx.tool.hook("execute.before")` y se suscribe con `ctx.event.subscribe()` a `session.created`; el entrypoint v1 (`server`) conserva la semántica previa.
3. Validador `scripts/configure/validate-opencode.js`: exige la definición por defecto (default, id, server, setup/effect) además del contrato del binario.
4. Golden `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` regenerado desde la plantilla y verificado por `cli.test.js`.
5. Test de carga/migración en `scripts/lib/target-profiles/opencode-plugin.test.js`: importa el artefacto emitido como ESM y ejercita `server` (v1) y `setup` (v2) con un ctx mínimo; registrado como `migration-compat-and-test` con su plan de compatibilidad/rollback.
6. Verificación: `ospec check` (suite completa + generación/validación de los 7 targets).

## Decisions

- Forma dual `export default { id, server, setup }`: conserva el bridge en OpenCode v1 >= 1.18.29 (entrypoint `server`) y lo restaura en v2 (`setup`); es la misma forma que `engram.ts` y `orca-opencode2-status.js` ya usan en v2.0.26. Alternativa descartada: solo-v2, que cortaba v1 por completo.
- `id: "ospec"` en vez de `ospec-workflow`: decisión del usuario ante el renombrado previsto del producto a `ospec`.
- El arreglo vive en el generador y su validador. El defecto detectado del CLI global (instalador de opencode sin `schemas/`) queda fuera de alcance y se abrirá como cambio IDD aparte tras cerrar este.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-16T16:22:37.917Z)
- ev-2: check-run for checks-pass (2026-10-16T16:24:28.245Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-16T16:24:28.245Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-16T16:25:33.889Z)
- ev-5: check-run for checks-pass (2026-10-16T16:26:49.182Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-16T16:26:49.182Z)
- ev-7: living-doc-current for living-doc (2026-10-16T16:26:49.252Z)
<!-- ospec:evidence:end -->
