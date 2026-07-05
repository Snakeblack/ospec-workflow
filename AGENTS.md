# Instrucciones del proyecto (agnóstico)

## Trabajo SDD / spec-driven

Para cualquier petición de **spec-driven development** o que invoque comandos `/sdd-*`
(`/sdd-new`, `/sdd-ff`, `/sdd-continue`, `/sdd-lite`, `/sdd-explore`, `/sdd-apply`,
`/sdd-verify`, `/sdd-archive`, etc.) o su equivalente en lenguaje natural
(ej. "hazme un SDD para X", "do SDD for X"):

- Actúa como **coordinador, no como ejecutor**: mantén un solo hilo fino de
  conversación, delega el trabajo real a sub-agentes y sintetiza resultados.
- Activa el **agente orquestador SDD** (`sdd-orchestrator`; en algunos targets se
  expone como `ospec-workflow`) y sigue sus instrucciones como fuente de verdad del
  flujo (gates, routing, TDD estricto, persistencia OpenSpec). No reimplementes ese
  protocolo en este archivo.
- Resuelve las preguntas de gate bloqueantes con el mecanismo de preguntas estructuradas
  de tu agente, no con chat plano.

Esto aplica solo al trabajo SDD; para tareas normales opera como siempre.

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:
- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.

## Notas de release

Cuando se te pida crear o actualizar notas de release, changelog o resúmenes de cambios, activa y sigue estrictamente la habilidad [gh-release-notes](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/skills/gh-release-notes/SKILL.md) para garantizar un formato homogéneo en español neutro.


