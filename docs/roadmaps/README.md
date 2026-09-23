# Roadmaps y arquitectura de ospec-workflow

Esta carpeta contiene las proyecciones activas del backlog. La fuente canónica para la dirección Adaptive y su análisis arquitectónico es [`../architecture/ospec-adaptive-critical-design.md`](../architecture/ospec-adaptive-critical-design.md).

La auditoría de alineación sección por sección del roadmap se conserva en la sección **L** de esa fuente canónica; este README solo describe autoridad y mantenimiento.

## Autoridad

| Archivo | Autoridad |
| --- | --- |
| [`../architecture/ospec-adaptive-critical-design.md`](../architecture/ospec-adaptive-critical-design.md) | Fuente única de decisiones Adaptive, guardrails, análisis arquitectónico y dirección del roadmap |
| [`../architecture/harness-evolution.md`](../architecture/harness-evolution.md) | Referencia del kernel estable y sus contratos; no introduce prioridades Adaptive independientes |
| [`../architecture/research/`](../architecture/research/) | Evidencia e hipótesis no normativas; pueden justificar una decisión, pero no establecer estado, prioridad ni arquitectura aceptada |
| [`harness-evolution.md`](harness-evolution.md) | Proyección ejecutable del backlog transversal, estado, orden y done criteria |
| [`targets/`](targets/) | Implementación específica de cada host |
| `../../analisis-fino/archive/` | Historia y evidencia; nunca estado vigente |

## Regla de precedencia

1. OpenSpec baseline y código probado.
2. `ospec-adaptive-critical-design.md` para decisiones Adaptive y guardrails.
3. `harness-evolution.md` para la proyección operativa de estado, orden y done criteria.
4. Roadmap de target.
5. Documentos archivados.

Cuando dos documentos discrepan, no se corrige únicamente el roadmap: se verifica el código y se actualiza primero la autoridad superior correspondiente.

La investigación no forma parte de esta cadena de precedencia. Solo adquiere efecto normativo cuando sus conclusiones se aceptan mediante OpenSpec o se incorporan explícitamente a la arquitectura; solo adquiere estado y prioridad cuando se reflejan en el roadmap general.

## Flujo de mantenimiento

- Cambio arquitectónico Adaptive: actualizar la fuente canónica + la proyección del roadmap dentro del mismo change.
- Cambio de implementación: actualizar roadmap al archivar.
- Cambio exclusivo de target: actualizar subroadmap y estado agregado del general.
- Hallazgo histórico resuelto: moverlo a archive; no mantenerlo como pendiente tachado indefinidamente.
- Investigación sin decisión: registrar fecha, fuentes y condición de revalidación en el subroadmap relevante.

## Dogfooding

La estructura de gobernanza se instaló mediante `unify-harness-evolution-governance` (G0), completada manualmente para establecer las bases del backlog de forma paralela a O4+O5.
