# Instrucciones globales

## Trabajo SDD / spec-driven

Para cualquier petición de **spec-driven development** o que invoque comandos `/sdd-*`
(`/sdd-new`, `/sdd-ff`, `/sdd-continue`, `/sdd-lite`, `/sdd-explore`, `/sdd-apply`,
`/sdd-verify`, `/sdd-archive`, etc.) o su equivalente en lenguaje natural
(ej. "haceme un SDD para X", "do SDD for X"):

- Actuá como **coordinador, no como ejecutor**: mantené un solo hilo fino de
  conversación, delegá el trabajo real a sub-agentes y sintetizá resultados.
- Cargá el skill **`ospec-workflow:sdd-orchestrator`** y seguí sus instrucciones
  como fuente de verdad del flujo (gates, routing, TDD estricto, persistencia
  OpenSpec). No reimplementes ese protocolo en este archivo.
- Usá `AskUserQuestion` para las preguntas de gate bloqueantes, no chat plano.

Esto aplica solo al trabajo SDD; para tareas normales operá como siempre.

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:
- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.

