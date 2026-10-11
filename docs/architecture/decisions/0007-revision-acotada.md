# 0007. Revisión acotada con linaje congelado

- Status: accepted
- Date: 2026-10-11
- Evidence: scripts/lib/review-lineage.js:14, scripts/lib/review-lineage.js:15, skills/_shared/gate-4r-review.md:5

## Context and drivers
Relanzar revisores hasta que no encuentren nada consume contexto sin fin y produce hallazgos nuevos en cada vuelta. Drivers: `constraint:context-budget` y `constraint:untrusted-model-output`.

## Options considered
1. Un linaje congelado: cada revisor corre una vez, los hallazgos se fijan y la corrección tiene presupuesto e intentos limitados: termina siempre; algún hallazgo tardío queda como seguimiento.
2. Revisión iterativa hasta cero hallazgos: exhaustiva en teoría; no converge.
3. Sin revisión automática: barato; pierde defectos de confianza y de runtime.

## Decision
Cada revisión fija antes de empezar su identidad, sus dimensiones y su presupuesto de corrección. Cada revisor de descubrimiento corre como mucho una vez; después solo un validador de solo lectura comprueba los hallazgos congelados, y tres validaciones fallidas agotan el linaje.

## Consequences
Una revisión siempre termina. Una observación tardía no relacionada es un seguimiento no bloqueante. Una revisión nueva exige un sucesor explícito ligado a un predecesor terminal.

## Fitness function
El reducer de `review-lineage.js` y sus tests rechazan una transición que relance un revisor de descubrimiento o restaure intentos.

## Review trigger
Defectos graves que escapan de forma recurrente porque el presupuesto se agotó.
