# 0003. Los algoritmos viven en el CLI, no en la prosa

- Status: accepted
- Date: 2026-10-11
- Evidence: skills/idd/SKILL.md:17, scripts/ospec.js:86, skills/_shared/gate-4r-review.md:5

## Context and drivers
Una regla escrita en prosa la interpreta cada modelo a su manera y no se puede probar. Las decisiones de proceso (siguiente paso, obligaciones, cierre, presupuesto de revisión) deben dar lo mismo en cada sesión. Drivers: `scenario:deterministic-resume` y `constraint:untrusted-model-output`.

## Options considered
1. Algoritmos en código ejecutable que la skill invoca: deterministas y con tests; la skill queda como guía y la superficie del CLI crece.
2. Algoritmos descritos en la skill: sin código nuevo; el resultado depende del modelo y no tiene test.
3. Mezcla sin regla: flexible; nadie sabe qué parte es autoridad.

## Decision
Toda decisión de proceso que tenga una respuesta correcta se calcula en código ejecutable con tests. Las skills describen cuándo llamarlo y qué hacer con su respuesta, y nunca reimplementan la regla en prosa.

## Consequences
El mismo estado da el mismo siguiente paso con cualquier modelo. Cambiar una regla es un cambio de código con su test. Las skills se acortan. Un host sin ejecución de comandos no puede usar ese flujo.

## Fitness function
Cada orden de `ospec` tiene tests en `scripts/lib/idd-*.test.js`. Una skill que describa una regla de cálculo sin citar la orden del CLI que la decide se rechaza en revisión.

## Review trigger
Un host objetivo que no permita ejecutar comandos locales.
