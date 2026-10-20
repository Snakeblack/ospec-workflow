# El kernel K1–K12 (histórico)

> **Histórico.** Esta página describe un diseño que ya no existe en el código. La dirección vigente es IDD, descrita en el [roadmap único](https://github.com/snakeblack/ospec-workflow/blob/main/docs/roadmaps/harness-evolution.md).

> **En pocas palabras:** El kernel era la propuesta de un árbitro determinista con almacén CAS, permisos, recibos y presupuestos. Se retiró en E1.5 porque esas piezas no estaban cableadas al flujo que usan los proyectos. Esta página es historia y no estado vigente.

---

## Qué pretendía

- **Authority Store (CAS):** almacén direccionado por contenido (SHA-256), para que cambiar un resultado antiguo alterara su huella.
- **OperationPermit:** permiso previo para que un agente tocara ficheros o ejecutara comandos, con límites de tiempo y recursos.
- **OperationReceipt:** recibo con la salida y el código de retorno de cada acción.
- **Budgets (K5):** descuento de tokens, tiempo y reintentos, con parada limpia al agotarse.

Contexto del programa completo: [Evolución del harness](/openwiki/evolution/harness-evolution.md).

## Por qué se retiró

El [inventario de cableado](https://github.com/snakeblack/ospec-workflow/blob/main/docs/analysis/2026-10-05-inventario-cableado-kernel.md) de E1.5 (2026-10-05) midió que solo una parte de `scripts/lib` era alcanzable desde los hooks y los comandos que corren en un proyecto consumidor. Decidió retirar 64 módulos (unas 19,7 k líneas) y lo ejecutó en tres PR encadenados, según el [roadmap, E1.5](https://github.com/snakeblack/ospec-workflow/blob/main/docs/roadmaps/harness-evolution.md):

- **v2.95.0:** checkers de la arquitectura archivada, challenges K6c, attestation K8 y binding de identidad de operación.
- **v2.96.0:** executor del piloto K12, puente de campaña y `scripts/k12-campaign.js`.
- **v2.97.0:** 45 módulos más, entre ellos lifecycle K2, Authority Store y permits K2.1, conformance host K2a, budgets y recovery K5, repair shadow K4b y executor/sandbox de workers K6a.

## Qué sigue distribuido

Algunas piezas siguen en el runtime, pero ya no como kernel:

- **Execution Graph, Assurance Graph y parte del verifier independiente:** llegan al runtime por el binding K7 del review, [`scripts/lib/review-lineage.js`](https://github.com/snakeblack/ospec-workflow/blob/main/scripts/lib/review-lineage.js) → [`scripts/lib/review-k7-binding.js`](https://github.com/snakeblack/ospec-workflow/blob/main/scripts/lib/review-k7-binding.js), que importa `execution-graph/`, `assurance-graph/` e `independent-verifier/`.
- **Validación de esquemas:** [`scripts/lib/kernel-schema-validator.js`](https://github.com/snakeblack/ospec-workflow/blob/main/scripts/lib/kernel-schema-validator.js) y [`schemas/kernel`](https://github.com/snakeblack/ospec-workflow/tree/main/schemas/kernel), que el binding K7 usa para el Execution Graph y el work-order.

## Qué garantiza hoy

La regla «sin pruebas no hay hecho» la da IDD, no el kernel. El CLI `ospec` solo acepta evidencia de ejecuciones que observa: `ospec run` para reproducciones y pruebas rojo-verde, y `ospec check` sobre el árbol actual. Un agente no puede declarar que las pruebas pasan. Detalle en [IDD paso a paso](/openwiki/idd/flujo-idd.md).
