# Documentación de ospec-workflow

El [`README.md`](../README.md) de la raíz presenta el harness y el inicio rápido. Esta carpeta explica cómo funciona por dentro: metodología, fases, runtime, targets e instalación.

## Dirección y evidencia

| Documento | Para qué sirve |
| --- | --- |
| [roadmaps/harness-evolution.md](roadmaps/harness-evolution.md) | **Roadmap único**: dirección, prioridad, estado y criterios de cierre. |
| [analysis/](analysis/) | Evidencia fechada. La auditoría vigente es la del [2026-10-03](analysis/2026-10-03-auditoria-harness-y-gentle-ai.md). |
| [architecture/](architecture/README.md) | Arquitectura vigente de ospec. La generará E2.6; mientras tanto, enlaza a la referencia técnica actual. |
| [adr/](adr/) | Decisiones tomadas en changes archivados. E2.6 las reclasifica. |
| [roadmaps/archive/](roadmaps/archive/) | Roadmap y arquitectura del programa K1–K12. Historia, nunca estado vigente. |

## IDD, el flujo por defecto

IDD (desarrollo guiado por impacto) es el flujo por defecto desde E1.6: el router manda cada cambio de código a la skill `idd`, que lo lleva con el CLI `ospec` (`node scripts/ospec.js`) hasta que `ospec close` lo archiva en `idd/archive/`. Las señales de impacto del cambio deciden sus obligaciones, y solo la evidencia de ejecuciones que observa el CLI las satisface.

Sin comandos en `checks:` de `idd/config.yaml`, no se obtiene la evidencia necesaria para cerrar. `ospec next` propone el paso `configure-checks`: la skill pide aprobar el comando candidato o indicar uno y espera antes de crear o editar el fichero, conservando sus claves. `ospec doctor` avisa si hay un cambio IDD abierto sin checks.

| Documento | Para qué sirve |
| --- | --- |
| [README.es.md](../README.es.md#idd-obligaciones-según-el-impacto-evidencia-de-ejecuciones-reales) | Señales, obligaciones, gates e inicio rápido. |
| [openspec/specs/idd/spec.md](../openspec/specs/idd/spec.md) | Contrato IDD: modos, señales, obligaciones, gates y el CLI `ospec`. |
| [skills/idd/SKILL.md](../skills/idd/SKILL.md) | El protocolo que sigue el agente. |

## Modo SDD opcional: metodología y ciclo

SDD se instala con `--with-sdd` y entra solo con un comando `/sdd-*` o una petición explícita.

| Documento | Para qué sirve |
| --- | --- |
| [sdd-metodologia.es.md](sdd-metodologia.es.md) ([English](sdd-metodologia.md)) | Modelo mental: principios, roles y por qué el contrato va antes que el código. |
| [sdd-fases.md](sdd-fases.md) | Contrato de cada fase: entradas, salidas y reglas. |
| [sdd-workflows.md](sdd-workflows.md) | Líneas de trabajo: estándar, lite, fast-forward, foundation, baseline brownfield, workspace y onboarding. |
| [sdd-routing.md](sdd-routing.md) | Rutas declaradas en `openspec/config.yaml` y gate de review de calidad. |
| [sdd-lifecycle-hooks.md](sdd-lifecycle-hooks.md) | Hooks declarativos en los límites de cada fase. |
| [openspec.md](openspec.md) | Persistencia de artefactos, specs delta, `state.yaml` y registro de supuestos. |
| [tdd-y-revision.md](tdd-y-revision.md) | Strict TDD, presupuesto de revisión y niveles de evidencia. |

## Runtime, targets e instalación

| Documento | Para qué sirve |
| --- | --- |
| [harness-runtime.md](harness-runtime.md) | Hooks del ciclo de vida, guards de seguridad y límites. |
| [harness-go-js-parity.md](harness-go-js-parity.md) | Qué está en Go, qué en JS y el contrato de paridad entre ambos. |
| [target-capabilities.md](target-capabilities.md) | Capacidades y degradación declarada por target. |
| [plugin-installation.es.md](plugin-installation.es.md) ([English](plugin-installation.md)) | Instalación y generación por target. |
| [codex/README.md](codex/README.md) | Punto de entrada para mantener el target Codex. |
| [model-routing.md](model-routing.md) | Tiers de modelo por fase (`models.yaml`). |
| [mcp-policy.md](mcp-policy.md) | Política y configuración de servidores MCP. |

## Onboarding

- [onboarding/developer.md](onboarding/developer.md), [onboarding/reviewer.md](onboarding/reviewer.md) y [onboarding/tech-lead.md](onboarding/tech-lead.md): ospec en 10 minutos según el rol.
- [en/README.md](en/README.md): resumen en inglés.

## Histórico

- [comparacion-arneses.md](comparacion-arneses.md): comparación de la v2.14.2, desactualizada. La vigente frente a gentle-ai está en la auditoría del 2026-10-03.
- [testing/](testing/): evidencia TDD de changes concretos.
