# 0006. La memoria entre sesiones da contexto, no autoridad

- Status: accepted
- Date: 2026-10-11
- Evidence: rules/engram-session-memory.instructions.md:8, rules/ospec-router.instructions.md:30

## Context and drivers
Una memoria entre sesiones ayuda a recordar decisiones previas, pero puede estar desactualizada, caída o contener texto no revisado. Drivers: `scenario:offline-operation` y `constraint:untrusted-model-output`.

## Options considered
1. Memoria opcional como contexto, siempre contrastada con el disco: útil cuando está; su caída no bloquea.
2. Memoria como fuente de verdad del estado: reanudación rica; dos verdades que divergen.
3. Sin memoria: nada que contrastar; se pierde contexto útil.

## Decision
La memoria entre sesiones es opcional y descartable. Lo que devuelve se contrasta con el repositorio antes de usarse, nunca decide una fase, un gate ni un cierre, y su ausencia solo quita contexto.

## Consequences
ospec funciona igual sin memoria. Un recuerdo que contradice el disco pierde. Instalar la memoria es un paso opcional del instalador.

## Fitness function
Ninguna orden del CLI lee la memoria para decidir; la regla del router y la de memoria lo declaran y se revisa en cada cambio que las toque.

## Review trigger
Una necesidad que solo la memoria pueda satisfacer y que el disco no pueda guardar.
