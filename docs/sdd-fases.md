# Fases SDD

Cada fase produce un artefacto concreto y deja el sistema listo para la siguiente. Esa es la gracia: no se mezcla descubrimiento, contrato, diseno, implementacion y verificacion en una sola bola de barro.

## Resumen

| Fase | Lee | Escribe | Resultado |
| --- | --- | --- | --- |
| `sdd-init` | Repo real, manifests, configs, tests. | `openspec/config.yaml`, carpetas base, `.atl/skill-registry.md`. | Proyecto listo para SDD. |
| `sdd-foundation` | `openspec/config.yaml`, `docs/**`, documentos fuente. | `docs/product/**`, `docs/architecture/**`, `docs/roadmap.md`, config actualizada. | Base de producto y arquitectura para proyectos vacios. |
| `sdd-explore` | Codigo y specs relevantes. | `exploration.md` si hay cambio nombrado. | Estado actual, opciones, riesgos y recomendacion. |
| `sdd-propose` | Exploracion, specs existentes, peticion del usuario. | `proposal.md`. | Intencion, alcance, capacidades, riesgos y rollback. |
| `sdd-spec` | `proposal.md`, specs principales existentes. | `specs/{domain}/spec.md` dentro del cambio. | Requisitos y escenarios testables. |
| `sdd-design` | Propuesta, specs y codigo real. | `design.md`. | Enfoque tecnico, decisiones, archivos y pruebas. |
| `sdd-tasks` | Specs y diseno. | `tasks.md`. | Tareas pequenas, ordenadas y forecast de review. |
| `sdd-apply` | Tasks, specs, diseno, progreso previo. | Codigo, `tasks.md`, `apply-progress.md`. | Implementacion trazable. |
| `sdd-verify` | Propuesta, specs, diseno, tareas, progreso y codigo. | `verify-report.md`. | Veredicto con pruebas reales. |
| `sdd-archive` | Todos los artefactos del cambio. | Specs principales y carpeta archivada. | Cambio cerrado y fuente de verdad actualizada. |
| `sdd-onboard` | Repo real. | Artefactos de un cambio pequeno real. | Aprendizaje guiado del ciclo completo. |

## `sdd-init`

Inicializa el terreno. Detecta stack, comandos, arquitectura visible, test runner, capas de test, lint, typecheck, formatter y estado de Strict TDD.

Regla clave: no adivina. Si no hay runner, registra `strict_tdd: false`; si hay runner y no hay override, el flujo puede activar Strict TDD.

Evita que cada fase vuelva a descubrir lo mismo y evita que Copilot trabaje con supuestos invisibles.

## `sdd-foundation`

Es la fase pre-SDD para proyectos vacios o desde cero. `sdd-init` detecta realidad; `sdd-foundation` captura intencion cuando todavia no hay suficiente realidad que detectar.

Pregunta una sola cosa bloqueante cada vez y persiste lo confirmado antes de parar. Produce brief de producto, alcance funcional, glosario, baseline tecnico, decisiones iniciales, roadmap y referencias.

Regla clave: no crea codigo de aplicacion. Define cimientos. Primero planos, luego ladrillos.

## `sdd-explore`

Investiga antes de comprometer. Lee el codigo real, busca patrones, zonas afectadas, tests existentes y dependencias.

Produce:

- Estado actual.
- Areas afectadas.
- Opciones con pros, contras y esfuerzo.
- Recomendacion.
- Riesgos.

Regla clave: explora, no modifica codigo. Su salida alimenta la propuesta.

## `sdd-propose`

Convierte la idea en un contrato de cambio. Define que problema se resuelve, que entra, que queda fuera, que capacidades se crean o modifican, riesgos, rollback y criterios de exito.

La seccion `Capabilities` es critica porque guia a `sdd-spec`: cada capacidad nueva o modificada se convierte en spec nueva o delta.

Regla clave: una propuesta sin rollback y sin criterios de exito no esta lista.

## `sdd-spec`

Define comportamiento observable. Escribe requisitos y escenarios en formato Given/When/Then, usando palabras RFC 2119 como MUST, SHALL, SHOULD y MAY.

Si una capacidad ya existe, escribe delta specs con secciones ADDED, MODIFIED y REMOVED. En MODIFIED copia el bloque completo del requisito y lo edita. Esto evita perder escenarios al archivar.

Regla clave: specs dicen QUE debe pasar, no COMO implementarlo.

## `sdd-design`

Decide como construir el cambio. Lee codigo real antes de disenar y documenta decisiones tecnicas, tradeoffs, data flow, contratos, archivos afectados, estrategia de pruebas y migracion si aplica.

Regla clave: sigue patrones existentes salvo que el cambio sea precisamente corregir esa arquitectura. Aqui se nota la seniority: no se mete "best practice" generica contra el sistema real.

## `sdd-tasks`

Rompe el diseno en tareas accionables y verificables. Las tareas deben tener archivo, accion y criterio claro. "Implementar feature" no es una tarea; es una forma elegante de no pensar.

Tambien calcula el `Review Workload Forecast`:

```text
Decision needed before apply: Yes|No
Chained PRs recommended: Yes|No
Chain strategy: stacked-to-main|feature-branch-chain|size-exception|pending
400-line budget risk: Low|Medium|High
```

Regla clave: si el cambio apunta a mas de 400 lineas, hay que dividirlo o aceptar explicitamente `size:exception`.

## `sdd-apply`

Implementa solo las tareas asignadas. Lee specs, diseno, tareas y progreso previo. Actualiza `tasks.md` con checks completados y escribe `apply-progress.md`.

Si Strict TDD esta activo, debe seguir RED/GREEN/TRIANGULATE/REFACTOR y registrar evidencia. Si no puede ejecutar tests, no finge GREEN: bloquea o reporta la limitacion.

Regla clave: no freelancing. Si el diseno no encaja, se reporta la desviacion; no se reescribe el plan en silencio.

## `sdd-verify`

Es el gate de calidad. No implementa fixes; juzga. Lee todos los artefactos y compara:

- Specs primero.
- Diseno despues.
- Tareas completadas despues.
- Tests y comandos reales como evidencia.

En Strict TDD valida tambien que la evidencia de ciclos exista y sea real.

Regla clave: un escenario sin test ejecutado y pasado no esta verificado.

## `sdd-archive`

Cierra el cambio. Fusiona delta specs en `openspec/specs/{domain}/spec.md`, crea `archive-report.md` y mueve la carpeta a `openspec/changes/archive/YYYY-MM-DD-{change-name}/`.

Regla clave: no archiva con issues CRITICAL. El archivo es auditoria, no papelera.

## `sdd-onboard`

Guia al usuario por un ciclo real pequeno en su propio repo. No es una demo de juguete. Busca una mejora de bajo riesgo, crea artefactos, implementa, verifica y archiva.

Regla clave: si el workspace esta vacio, debe recomendar `sdd-foundation` primero. No se inventa una mejora donde no hay sistema.
