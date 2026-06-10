# Harness Runtime

## Objetivo

Reducir carga permanente del prompt y mover automatización repetitiva a hooks.

## Capas

1. Commands: routing visible.
2. Orchestrator: coordinación.
3. Phase agents: ejecución.
4. Skills: capacidades on-demand.
5. Hooks: lifecycle automation.
6. OpenSpec: fuente de verdad.
7. `.ospec/cache`: cache auxiliar.
8. `.ospec/session`: continuidad auxiliar.

## No fuente de verdad

`.ospec/cache` y `.ospec/session` nunca sustituyen a OpenSpec.