# reviewers-premium-tier

## Intent and acceptance

Los cinco revisores que models.yaml deja en default (review-trust, review-correction, review-runtime, review-evolution, review-efficiency) pasan al tier premium, como review-change

Acceptance: Con el models.yaml del producto, cada target genera los seis agentes revisores con el tier premium (model: opus en Claude; en los demás hosts, el modelo que el usuario asignó a premium o el de la sesión), y el handbook y la spec del generador lo dicen

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/agentes/modelos.md`, `models.yaml`, `openspec/specs/generator/spec.md`, `scripts/configure/cli.test.js`, `scripts/fixtures/context-baseline.json`, `scripts/hooks/subagent-stop.test.js`, `scripts/model-tier-contract.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El validador de models.yaml no gana una regla de suelo para los revisores: solo cambian los cinco valores (opción B). El usuario delegó la elección («lo recomendado», «haz lo que creas que es mejor») y la recomendación era B, porque el tier lo calculará el CLI (E1.94 reescrito) y REQ-generator-005 y el ADR-005 siguen intactos.
- E1.94 se reescribe en el roadmap como ítem general: tier y effort por encargo para todos los agentes que lanza ospec (revisores, worker y fases de SDD), con la estrategia híbrida que eligió el usuario («la 4»): suelo en models.yaml, el CLI sube según el riesgo de E1.79 y el modelo puede subir con una razón, nunca bajar. Subir es automático; delegar en un tier más barato sigue siendo una oferta de E4.13 hasta que E4.4 lo mida.
- La línea base de contexto baja dos bytes por revisor en Claude (el alias opus es más corto que sonnet); scripts/measure-context-baseline.js --update fija los techos nuevos.
- El test de costes por fase (scripts/hooks/subagent-stop.test.js) lee el models.yaml del producto, así que su tier esperado para review-correction pasa de default a premium; tocar un fichero bajo scripts/hooks activa la señal security-boundary y su revisión de confianza.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-11-17T09:20:03.077Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-17T09:20:55.743Z)
- ev-3: frozen-review for trust-review (2026-11-17T09:24:54.744Z, subagent-stop)
- ev-4: check-run for checks-pass (2026-11-17T09:26:34.732Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-17T09:26:34.732Z)
- ev-6: living-doc-current for living-doc (2026-11-17T09:26:35.061Z)
<!-- ospec:evidence:end -->
