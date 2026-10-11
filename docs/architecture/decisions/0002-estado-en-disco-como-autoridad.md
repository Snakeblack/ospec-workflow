# 0002. El estado en disco es la autoridad

- Status: accepted
- Date: 2026-10-11
- Evidence: scripts/lib/idd-store.js:4, skills/idd/SKILL.md:21

## Context and drivers
Un agente pierde la conversación con cada `/clear`, compactación o cambio de host, y aun así debe retomar un cambio donde quedó. Drivers: `scenario:deterministic-resume` y `constraint:context-budget`.

## Options considered
1. Estado de cada cambio en un fichero del repositorio, escrito solo por el CLI y el runtime: sobrevive a la sesión y se versiona; exige escritura atómica y lock.
2. Estado en la conversación del agente: sin ficheros; se pierde al compactar y no se puede auditar.
3. Estado en un servicio externo: compartido entre máquinas; añade red, credenciales y un punto de fallo.

## Decision
El estado de cada cambio vive en un fichero de estado dentro del repositorio del usuario. Solo el CLI y el runtime lo escriben, de forma atómica, bajo lock y validado contra su esquema. Ninguna fase, gate o cierre se da por hecho sin que ese fichero lo diga.

## Consequences
Reanudar es leer el disco. La conversación y la memoria pueden perderse sin perder el cambio. El agente no puede editar el estado a mano y debe pasar por el CLI. Dos sesiones sobre el mismo cambio se serializan por el lock.

## Fitness function
Los tests de `idd-store` comprueban la escritura atómica y el rechazo de un estado inválido; la skill IDD prohíbe escribir `state.yaml` y el CLI es el único escritor.

## Review trigger
Un uso que necesite compartir el estado de un cambio entre máquinas sin pasar por el control de versiones.
