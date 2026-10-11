# 0008. Los guards de seguridad fallan cerrados

- Status: accepted
- Date: 2026-10-11
- Evidence: scripts/hooks/pre-tool-use.js:45, scripts/hooks/pre-tool-use.js:314, scripts/hooks/lib/staged-validator.integration.test.js:213, scripts/hooks/commit-msg-hook.js:84

## Context and drivers
Un agente puede lanzar una orden destructiva o commitear un secreto. Los hooks del host son el único punto que ve esa acción antes de que ocurra. Drivers: `scenario:guard-fail-closed` y `assumption:hosts-honor-hooks`.

## Options considered
1. Guards de seguridad que bloquean cuando no pueden decidir, y avisos de trazabilidad que fallan abiertos: seguro donde importa; algún falso bloqueo.
2. Todo falla abierto: nunca estorba; un error del guard deja pasar el daño.
3. Todo falla cerrado: máximo control; un fallo de trazabilidad rompería cada commit.

## Decision
Una denegación de seguridad es el suelo y nunca se degrada por el modo de permisos. Si un guard de seguridad no puede leer lo que debe validar, bloquea. Lo que solo informa o traza falla abierto.

## Consequences
Una orden destructiva o un secreto se bloquean aunque el índice esté corrupto. Un fallo de trazabilidad no rompe el commit. Añadir una regla de denegación exige su test.

## Fitness function
`staged-validator.integration.test.js` bloquea el commit con un blob ilegible; `pre-tool-use.test.js` fija las órdenes denegadas.

## Review trigger
Un host que deje de ejecutar los hooks o que no permita denegar una acción.
