# Arquitectura de ospec-workflow

Arquitectura **vigente** de ospec, generada con la foundation de ospec aplicada a este mismo repositorio ([E2.6](../roadmaps/harness-evolution.md#e26--dogfood-ospec-foundation)):

- [`technical-baseline.md`](technical-baseline.md): contexto y fronteras, componentes y datos, integraciones, escenarios de calidad, restricciones, estrategia de test y registro tecnológico.
- [`decisions/`](decisions/): los ADR de arquitectura, uno por decisión estructural. Solo contiene ADR de arquitectura; `scripts/lib/architecture-decisions.test.js` comprueba que cada uno pasa el lint sin avisos.
- [`knowledge-map.yaml`](knowledge-map.yaml): el mapa de conocimiento (`ospec-knowledge-map/v1`, perfil `public-library`) con los cinco escenarios de calidad.
- [`component-map.yaml`](component-map.yaml): componentes, fronteras, dependencias y divergencias con evidencia `ruta:línea` (`ospec-component-map/v1`).
- El brief de producto, con el contexto de equipo, está en [`../product/brief.md`](../product/brief.md).

El modelo de los registros es `ospec-decision-record/v1` ([E2.4](../roadmaps/harness-evolution.md#e24--decision-records-model), `schemas/foundation/decision-records/`): ADR, TSR y DC. Las decisiones de desarrollo de changes anteriores no son ADR: están en [`../adr/`](../adr/README.md), indexadas como decisiones de change archivadas.

| ADR | Decisión |
| --- | --- |
| [0001](decisions/0001-generacion-multi-target-desde-una-fuente.md) | Generación multi-target desde una única fuente |
| [0002](decisions/0002-estado-en-disco-como-autoridad.md) | El estado en disco es la autoridad |
| [0003](decisions/0003-algoritmos-en-el-cli.md) | Los algoritmos viven en el CLI, no en la prosa |
| [0004](decisions/0004-ceremonia-proporcional-al-impacto.md) | La ceremonia depende del impacto del cambio |
| [0005](decisions/0005-cierre-ligado-a-evidencia.md) | Un cambio cierra solo con evidencia observada |
| [0006](decisions/0006-memoria-sin-autoridad.md) | La memoria entre sesiones da contexto, no autoridad |
| [0007](decisions/0007-revision-acotada.md) | Revisión acotada con linaje congelado |
| [0008](decisions/0008-guards-de-seguridad-fallan-cerrados.md) | Los guards de seguridad fallan cerrados |
| [0009](decisions/0009-contratos-versionados-por-esquema.md) | Los contratos de máquina se versionan por esquema |
| [0010](decisions/0010-runtime-autocontenido.md) | Runtime autocontenido: la instalación no descarga dependencias |
| [0011](decisions/0011-modos-sdd-e-idd-separados-en-disco.md) | Los modos SDD e IDD están separados en disco |

La referencia técnica de detalle sigue en [`../harness-runtime.md`](../harness-runtime.md), [`../target-capabilities.md`](../target-capabilities.md), [`../sdd-routing.md`](../sdd-routing.md), [`../sdd-fases.md`](../sdd-fases.md) y `openspec/specs/`. La arquitectura objetivo del programa K1–K12 está [archivada](../roadmaps/archive/2026-10-03-arquitectura/README.md): es historia, no la arquitectura vigente.
