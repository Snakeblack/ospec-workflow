# 0001. Generación multi-target desde una única fuente

- Status: accepted
- Date: 2026-10-11
- Evidence: scripts/configure/cli.js:3, scripts/configure/cli.test.js:213

## Context and drivers
ospec se instala en cinco hosts de agente y lo mantiene una sola persona. Copiar a mano skills, agentes y hooks por host haría divergir los targets en cuanto cambie uno. Drivers: `scenario:target-parity`, `constraint:host-agnostic` y `constraint:single-maintainer`.

## Options considered
1. Una fuente canónica y una transformación pura por target: un solo sitio que editar; cuesta mantener el transformador y sus fixtures golden.
2. Un árbol por host editado a mano: sin generador; cada cambio se repite cinco veces y la paridad depende de la disciplina.
3. Un formato común que cada host lea tal cual: no existe; los hosts difieren en hooks, frontmatter y herramientas.

## Decision
La fuente canónica del repositorio es la única que se edita. Cada target se genera desde ella con una transformación pura, y lo instalado sale siempre de esa generación.

## Consequences
Un cambio de prosa o de hook llega a todos los targets en la misma publicación. Añadir un host significa añadir una transformación y su fixture golden. Queda prohibido editar a mano un árbol generado. Lo que un host no soporta se degrada de forma declarada, no por omisión.

## Fitness function
`scripts/configure/cli.test.js` compara el árbol generado de cada target con su golden comprometido; cualquier diferencia no regenerada falla el check.
- Check: `node --test scripts/configure/cli.test.js`

## Review trigger
Un host nuevo cuyas capacidades no se puedan expresar como transformación de la fuente común.
