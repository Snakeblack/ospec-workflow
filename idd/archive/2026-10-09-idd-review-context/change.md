# idd-review-context

## Intent and acceptance

Retirar protocolo SDD innecesario del revisor IDD por defecto (E1.19)

Acceptance: Build por defecto con revisión limpia, hallazgo comprobable y corrección acotada registrables; misma capacidad en build con SDD, contratos de hallazgos intactos y reducción de bytes medida

## Plan

- Cambiar las referencias del resultado de los cuatro especialistas al protocolo de juicio existente; incorporar su referencia SDD solo en builds con `withSdd`.
- Probar los siete targets, comparar bytes y conservar contratos de hallazgos y validación. Ejercitar consumidores temporales limpios y con defecto, con ambas builds, sin modificar su estado a mano.
- Bajar los techos de contexto, documentar resultados y ejecutar los checks del proyecto.

## Decisions

- Se conserva el contrato de despacho IDD (`findings`) y el envelope SDD canónico; no se crea otro esquema ni reducer.
- Mantener toda la carga actual es compatible pero conserva la sobrecarga. Seleccionar secciones del documento SDD añade una vista frágil de su esquema. Referenciar el juicio existente y cargar su dependencia SDD condicional conserva una sola fuente del contrato.
- Cuatro consumidores completaron review/check/close, incluidos dos hallazgos CRITICAL y su validación dirigida. IDD devuelve JSON directo; SDD requiere extraer el fence y el validador su objeto interior, sin alterar payloads. El envío inicial del wrapper fue rechazado sin mutación; revisión 5 reconciliada antes de registrar.
- El host nativo tiene OAuth caducado: la evidencia usa ejecutores read-only con el agente generado y el CLI real. No se afirma validación de carga nativa, Agent/SubagentStop, coste ni fiabilidad. Resultado y límites en docs/testing/idd-review-context.md.
- El check completo rechazó el test nuevo en scripts/lib como ruta ausente del inventario congelado K1. La regresión se integra en agent-embed.test.js, ya asignado al generador, sin ampliar ni relajar ese guard; se registra de nuevo rojo→verde con el comando reproducible definitivo.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-09T07:51:00.201Z)
- ev-2: repro-run-pair for repro-test (2026-10-09T08:06:52.537Z)
- ev-3: check-run for checks-pass (2026-10-09T08:09:41.721Z)
- ev-4: living-doc-current for living-doc (2026-10-09T08:10:26.444Z)
<!-- ospec:evidence:end -->
