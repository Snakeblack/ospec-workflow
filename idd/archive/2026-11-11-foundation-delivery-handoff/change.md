# foundation-delivery-handoff

## Intent and acceptance

foundation pregunta la entrega (delivery:) y el remoto en el hand-off a IDD y ofrece el commit de sus artefactos al terminar (#485)

Acceptance: El hand-off de skills/foundation/SKILL.md presenta branching, changelog y release de ospec team con su origen, motivos y alternativas, la estrategia como consecuencia de team.size e integration_branch solo si se integra aparte de producción; escribe delivery: solo tras la aprobación; pregunta por el remoto cuando no lo hay; termina ofreciendo el commit de los artefactos (rama main y commit inicial en un repo sin commits) y no ejecuta git commit, push ni crea el remoto sin un sí explícito; handbook/idd/foundation.md lo documenta; scripts/foundation-federated.test.js lo cubre; node scripts/check.js pasa

## Plan

<!-- ospec:plan:start -->
- Files: `handbook/idd/foundation.md`, `scripts/foundation-federated.test.js`, `skills/foundation/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Solo la skill, sin tocar el CLI (decisión del usuario): delivery_strategy no es declarable en IDD y sale de team.size, así que foundation la presenta como consecuencia del tamaño y declara solo branching, changelog, release e integration_branch
- La propuesta de delivery sale de ospec team, que lee el team: escrito, así que se pregunta después de escribir las claves aprobadas; en modo delegado la rellena el orquestador con ospec team en vez de la tabla del perfil en prosa, para no reimplementar la regla en la skill (ADR 0003)
- El commit de la fundación, git init y la creación del remoto son propuestas que solo se ejecutan con un sí explícito; el agente delegado no tiene shell y las devuelve en open_questions
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-11T11:59:36.845Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-11T11:59:36.845Z)
- ev-3: living-doc-current for living-doc (2026-11-11T11:59:57.554Z)
<!-- ospec:evidence:end -->
