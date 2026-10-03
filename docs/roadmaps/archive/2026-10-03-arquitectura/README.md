# Arquitectura del programa K1–K12 (archivada)

Archivada el 2026-10-03, cuando el [roadmap único](../../harness-evolution.md) sustituyó al programa K1–K12. Estos documentos estaban en `docs/architecture/`. Salieron de ahí porque las fases SDD leen esa carpeta como la arquitectura vigente del proyecto, y estos describen una arquitectura **objetivo**: buena parte no está implementada o quedó aparcada.

Son historia. Algunos se citan como **insumo** de un ítem del roadmap: ese ítem decide en su exploración qué conserva y lo pasa a su change (spec o design). El documento archivado no vuelve a ser normativo.

| Documento | Qué recoge | Insumo de |
| --- | --- | --- |
| [`harness-evolution.md`](harness-evolution.md) | Arquitectura objetivo del kernel: autoridad e invariantes, Candidate, Execution Graph, Assurance Graph, recetas y registro de madurez (corte v2.81.1) | E1.5 (cablear, congelar o retirar cada módulo) |
| [`ospec-adaptive-critical-design.md`](ospec-adaptive-critical-design.md) | Revisión crítica de OSPEC Adaptive (2026-09-19, base v2.68.0) y sus guardas | E1.4 (obligación de reproducción, antes receta Repair); el resto de Adaptive está aparcado |
| [`harness-proportionality.md`](harness-proportionality.md) | Selección de garantías, compresión de ejecución y escalado | E1.3–E1.4 (señales y obligaciones de IDD) |
| [`harness-foundation-holistic.md`](harness-foundation-holistic.md) | Foundation holística (antes R2): matriz de cobertura, escenarios de calidad y skill `cncf-landscape` | E2.3 y E5.2 |
| [`research/proportional-process-and-change-program.md`](research/proportional-process-and-change-program.md) | Las dos escalas de proporcionalidad y el Change Program (v2.49.0) | E5.5 |
| [`research/harness-kernel-graph-evidence-roadmap-fusion.md`](research/harness-kernel-graph-evidence-roadmap-fusion.md) | Fusión de la propuesta P0–P27 con el kernel (v2.35.0) | — |
| [`research/proof-carrying-change-compiler.md`](research/proof-carrying-change-compiler.md) | Tesis *proof-carrying* (2026-07-18), origen de K4a y K6b | — |

El roadmap K1–K12 correspondiente está en [`../2026-10-03-harness-evolution-kernel.md`](../2026-10-03-harness-evolution-kernel.md).

**Tests que aún leen este archivo:** el checker `k1-maturity` (REQ-contract-lint-011) valida el registro de madurez de `harness-evolution.md`, y `k21-maturity-docs`, `k2a-maturity-docs`, `k3-readiness-reconciliation` y `roadmap-reconciliation` comprueban su contenido. Como el documento ya no cambia, E1.5 decide si se retiran.
