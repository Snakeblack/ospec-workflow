# own-sdd-init-onboard-archive-clarify

## Intent and acceptance

Versiones propias de sdd-init (con init-details.md), sdd-onboard, sdd-archive y sdd-clarify, cuarto cambio de E1.105

Acceptance: skills/sdd-init, skills/sdd-onboard, skills/sdd-archive y skills/sdd-clarify no conservan líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo literales sin contenido; init-details.md y sdd-onboard se reescriben enteros y sdd-init/SKILL.md, sdd-archive y sdd-clarify solo en los pasajes que coinciden; los tests de contrato de las fases siguen pasando; NOTICE y metadata.author dejan de nombrar a gentle-ai en las cuatro; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-20T15:59:12.302Z):

> continua (cambio 4 de E1.105: sdd-init, sdd-onboard, sdd-archive y sdd-clarify)

Answer 1 — open-facts, user, 2026-11-20T16:14:12.387Z:

> todo lo recomendado
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `docs/roadmaps/harness-evolution.md`, `skills/sdd-archive/SKILL.md`, `skills/sdd-clarify/SKILL.md`, `skills/sdd-init/SKILL.md`, `skills/sdd-init/references/init-details.md`, `skills/sdd-onboard/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- sdd-onboard es un ejecutor del agente sdd-onboard: se detiene con question_gate en las dos pausas (elegir la mejora y revisar la propuesta) y vuelve a lanzarse con la respuesta; nunca pregunta al usuario directamente y su narración va en el resultado para que el orquestador la transmita (respuesta del usuario al gate open-facts)
- El onboarding termina en verify y devuelve next_recommended: sdd-archive, para que el orquestador archive con su guarda y archive-transaction-run.js como en cualquier cambio; el resumen final nombra el archivado como paso siguiente y nunca lo da por hecho (respuesta del usuario al gate open-facts)
- La explicación de verify en el onboarding usa lo que escribe sdd-verify hoy (niveles de evidencia y resultado ✅/❌) en vez de COMPLIANT, FAILING y UNTESTED
- sdd-archive conserva lo que fijan sus tests: Plan-and-Report, archive-plan.json, la prohibición de borrar el origen, el bloque Cost con sus literales, el paso 4 de decisions.md con las guardas B4 y B5, y los encabezados de los pasos 4b y 5; sdd-init conserva los pasos 0a y 0b del puente federado; sdd-clarify conserva el puntero al Recommended Option Description Contract
<!-- ospec:decisions:end -->

- Medida con `node scripts/third-party-overlap.js --source <clon de gentle-ai>`: antes, sdd-onboard 89,8 %, init-details.md 51,8 %, sdd-init/SKILL.md 26,4 %, sdd-archive 13,0 % y sdd-clarify 12,5 %; después, de 504 líneas largas solo coincide `disable-model-invocation: true` de cada skill.
- La evidencia manual de offline-operation dice que el grep no da coincidencias; da `httpx` y `httptest`, nombres de librerías de test que init-details.md ya listaba. Ninguna URL ni llamada de red nueva.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-20T16:15:53.264Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-20T16:15:53.264Z)
- ev-3: check-run for checks-pass (2026-11-20T16:20:40.250Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-20T16:20:40.250Z)
- ev-5: check-run for checks-pass (2026-11-20T16:22:48.065Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-20T16:22:48.065Z)
- ev-7: living-doc-current for living-doc (2026-11-20T16:22:54.301Z)
<!-- ospec:evidence:end -->
