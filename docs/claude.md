# Roadmaps y arquitectura de ospec-workflow

Esta carpeta contiene las únicas fuentes activas para la evolución del harness.

## Autoridad

| Archivo | Autoridad |
| --- | --- |
| [`../architecture/harness-evolution.md`](../architecture/harness-evolution.md) | Arquitectura, principios, decisiones y problemas abiertos |
| [`harness-evolution.md`](harness-evolution.md) | Backlog transversal, estado, orden y done criteria |
| [`targets/`](targets/) | Implementación específica de cada host |
| `../../analisis-fino/archive/` | Historia y evidencia; nunca estado vigente |

## Regla de precedencia

1. OpenSpec baseline y código probado.
2. Análisis arquitectónico.
3. Roadmap general.
4. Roadmap de target.
5. Documentos archivados.

Cuando dos documentos discrepan, no se corrige únicamente el roadmap: se verifica el código y se actualiza primero la autoridad superior correspondiente.

## Flujo de mantenimiento

- Cambio arquitectónico: actualizar análisis + roadmap dentro del mismo change.
- Cambio de implementación: actualizar roadmap al archivar.
- Cambio exclusivo de target: actualizar subroadmap y estado agregado del general.
- Hallazgo histórico resuelto: moverlo a archive; no mantenerlo como pendiente tachado indefinidamente.
- Investigación sin decisión: registrar fecha, fuentes y condición de revalidación en el subroadmap relevante.

## Dogfooding

El primer change que instala esta estructura es `unify-harness-evolution-governance`, definido en el roadmap general. Debe ejecutarse después de cerrar O4+O5 para no mezclar concerns.
