# Roadmaps de ospec-workflow

Desde el 2026-10-03 hay **un solo roadmap**: [`harness-evolution.md`](harness-evolution.md). Fija la dirección, la prioridad, el estado y los criterios de cierre. Su origen y su evidencia están en la [auditoría del 2026-10-03](../analysis/2026-10-03-auditoria-harness-y-gentle-ai.md).

## Autoridad

| Archivo | Papel |
| --- | --- |
| [`harness-evolution.md`](harness-evolution.md) | Fuente única de dirección, prioridad, estado y done criteria |
| [`../architecture/`](../architecture/README.md) | Arquitectura vigente de ospec, que generará E2.6. No fija prioridades |
| [`../analysis/`](../analysis/) | Evidencia fechada |
| [`targets/`](targets/) | Notas por host; su estado agregado se refleja en E6.1 del roadmap |
| [`archive/`](archive/) | Roadmap K1–K12 (hasta v2.81.0) y su [arquitectura objetivo](archive/2026-10-03-arquitectura/README.md). Historia, nunca estado vigente; algunos documentos son insumo de un ítem concreto |

## Precedencia

1. OpenSpec baseline y código probado.
2. Roadmap único.
3. Documentos de arquitectura.
4. Notas por target.
5. Documentos archivados.

Si dos documentos discrepan, se verifica el código y se corrige primero el de mayor precedencia.

## Mantenimiento

- Cada ítem se entrega como un cambio con su rama y su PR: de forma directa hasta E1.6 y con IDD después (ver «Cómo se ejecuta este roadmap»). SDD es un modo opcional, no la vía por defecto.
- Al cerrar un ítem se actualizan su fila en la tabla de estado y la versión de referencia.
- Al cerrar una etapa se registra el checkpoint `continue | revise` con las métricas de la tabla de objetivos.
- Un hallazgo resuelto no se mantiene como pendiente tachado: se mueve al historial.
