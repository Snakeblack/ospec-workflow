# 0004. La ceremonia depende del impacto del cambio

- Status: accepted
- Date: 2026-10-11
- Evidence: scripts/lib/idd-signals.js:4, idd/config.yaml:15

## Context and drivers
Un flujo con todas las fases para cada cambio agota el contexto y la paciencia; uno sin control deja pasar cambios de riesgo. El riesgo real está en lo que el cambio toca, no en lo que el modelo declara. Drivers: `constraint:context-budget` y `constraint:untrusted-model-output`.

## Options considered
1. Obligaciones derivadas de señales de impacto: intención, rutas declaradas y diff real: proporcional y verificable; exige mantener los patrones de impacto.
2. Ceremonia fija para todo cambio: simple de explicar; caro para cambios pequeños.
3. Ceremonia que elige el modelo: flexible; no verificable.

## Decision
Cada cambio deriva sus obligaciones de señales de impacto: primero de la intención y las rutas declaradas, y después del diff real. Un contrato público, datos persistentes o una frontera de seguridad añaden obligaciones; un cambio que no los toca no las tiene.

## Consequences
Un cambio de documentación cierra con los checks; uno de contrato exige especificación y test. Las señales que el diff confirma no se pueden retirar. El proyecto declara sus rutas de impacto en su configuración.

## Fitness function
`scripts/lib/idd-signals.test.js` fija qué señal produce cada ruta y que el diff recalcula las señales en `ospec check`.

## Review trigger
Un tipo de riesgo recurrente que ninguna señal de ruta ni de diff pueda detectar.
