# Investigación: proof-carrying change compiler

> **Estatus:** investigación no normativa, condensada a partir de una auditoría estática independiente del repositorio.
> **Corte de la auditoría:** 2026-07-18.
> **Uso permitido:** aportar evidencia e hipótesis para futuros changes y decisiones arquitectónicas.
> **Sin autoridad sobre el programa:** este documento no sustituye OpenSpec, Git ni `state.yaml`; tampoco establece estado, prioridad, dependencias o decisiones aceptadas.

## Conclusión

La tesis merece una vertical experimental acotada: compilar las obligaciones de `verify` en una representación reducida, intercambiar trabajo mediante contratos tipados y producir evidencia reproducible en shadow contra el flujo actual.

La investigación no justifica reescribir el harness ni adoptar de antemano un runtime, un journal autoritativo, un broker de efectos o attestations. Esas opciones siguen abiertas y solo podrían promoverse mediante evidencia experimental, un change OpenSpec y una decisión arquitectónica explícita.

## Tesis

El harness puede reducir la política que hoy depende de interpretación en prompts si compila cada change en obligaciones verificables y delega al modelo únicamente el juicio semántico. Un kernel determinista podría validar contratos, registrar hechos y reproducir resultados sin eliminar las fases semánticas de proposal, spec, design, tasks, apply y verify.

La primera prueba debe limitarse a `verify`: tiene suficientes contratos, gates, tests y findings para evaluar la idea, pero permite comparar resultados sin retirar ni modificar el flujo vigente.

## Hechos verificados y límites

### Hechos observados por inspección estática

| Hecho | Evidencia en el repositorio | Implicación para la hipótesis |
| --- | --- | --- |
| OpenSpec y Git son la autoridad canónica del change. | [Arquitectura activa](../harness-evolution.md#3-principios-invariantes) y contratos de persistencia del repositorio. | El experimento debe ser complementario y no crear otra autoridad. |
| El orquestador coordina agentes de fase y todavía conserva reglas extensas de routing, gates, recuperación e inyección de contexto. | [`agents/sdd-orchestrator.agent.md`](../../../agents/sdd-orchestrator.agent.md) | Existe una oportunidad de extraer transiciones repetibles, pero no se ha demostrado aún su tamaño ni beneficio neto. |
| Ya existen piezas deterministas para envelopes, routing, quality gates, estado, artefactos y review. | [`scripts/lib/`](../../../scripts/lib/) | O20A debe reutilizar contratos y reducers existentes, no crear un segundo framework paralelo. |
| El runtime de hooks captura y reconstruye resultados de varios hosts. | [`scripts/hooks/subagent-stop.js`](../../../scripts/hooks/subagent-stop.js) y [`scripts/hooks/session-start.js`](../../../scripts/hooks/session-start.js) | `Work Order`/`Work Result` puede probarse como frontera tipada, manteniendo la degradación confinada al adapter. |
| El repositorio genera y prueba cinco targets con capacidades distintas. | [`scripts/lib/target-profiles/`](../../../scripts/lib/target-profiles/) y [`scripts/configure/real-repo.test.js`](../../../scripts/configure/real-repo.test.js) | Cualquier garantía nueva debe declarar degradación por target; no puede asumirse enforcement uniforme. |
| Existe infraestructura de evals y benchmark, pero la baseline fixed-policy completa sigue pendiente. | [`scripts/evals/README.md`](../../../scripts/evals/README.md) y [O2B](../../roadmaps/harness-evolution.md#o2b-baseline-fija-fixed-policy--pending) | La vertical debe apoyarse en una baseline reproducible antes de influir en el flujo por defecto. |
| La arquitectura ya prevé invocation kernel, evidencia estructurada, phase capsules, validadores y verificación headless. | [Arquitectura activa](../harness-evolution.md) y [roadmap general](../../roadmaps/harness-evolution.md) | La propuesta aporta un eje integrador experimental; no debe duplicar esas iniciativas sin un gate. |

### Límites de la auditoría

- La revisión fue estática: no ejecutó `npm test`, evals, benchmarks ni sesiones reales contra los cinco targets.
- No demuestra reducción de contexto, coste, latencia ni reinvocaciones.
- No demuestra equivalencia de verdicts, replay determinista, invalidación correcta ni resistencia a interrupciones.
- No valida que un grafo de obligaciones mínimo pueda extraerse de Markdown sin pérdida semántica.
- No valida paridad de enforcement entre hosts ni viabilidad operativa de attestations.
- Las referencias externas del análisis fuente respaldan patrones generales, no decisiones de adopción para este repositorio.

## Cobertura actual y aporte nuevo

| Tema | Ya cubierto | Aporte experimental de O20A |
| --- | --- | --- |
| Dispatch determinista | O13C propone `invokePhase()` y un orquestador fino. | Probar el contrato desde una obligación de `verify`, no desde una fase completa. |
| Evidencia | O15 y O19B prevén evidencia y validadores estructurados. | Normalizar evidencia de `verify`, emitir SARIF y vincularla a obligaciones estables. |
| Contexto | O18 prevé phase capsules compiladas. | Limitar inputs del work order a dependencias de las obligaciones seleccionadas. |
| Headless | R1 prevé verificación estructural no interactiva. | Aportar journal observacional y replay como fixture de evaluación, sin auto-aprobar gates. |
| Benchmark | O2A entregó infraestructura y O2B debe fijar el control. | Comparar en shadow `sdd-verify` actual frente al kernel sobre el mismo input. |
| Archive y efectos | O6A separa semántica y transacción de archive. | Ninguno en esta vertical; apply y su enforcement quedan fuera de alcance. |

## Hipótesis a contrastar

1. Un `Change IR` reducido puede representar requisitos, escenarios, gates y evidencias necesarios para `verify` sin convertir toda la documentación OpenSpec a JSON.
2. `Work Order`/`Work Result` v1 puede reducir ambigüedad contractual y aislar la extracción específica de cada target.
3. Un journal observacional append-only puede reproducir la ejecución del experimento sin reemplazar `state.yaml` ni convertirse en autoridad operativa.
4. Evidencia normalizada y SARIF pueden mejorar trazabilidad y análisis automatizado sin rebajar el juicio semántico del agente.
5. La comparación shadow puede detectar divergencias de verdict, findings, cobertura y ejecución antes de alterar defaults.
6. Si la vertical funciona, algunas iniciativas existentes podrían compartir un kernel común; el gate debe impedir que permanezcan dos diseños equivalentes en paralelo.

## Decisiones abiertas

| Decisión | Pregunta que debe resolver la evidencia |
| --- | --- |
| Grafo de obligaciones | ¿Cuál es el conjunto mínimo de nodos, relaciones, IDs e invalidaciones que cubre `verify` sin burocracia innecesaria? |
| Journal y replay | ¿Debe seguir siendo observacional o adquirir alguna autoridad futura, y cómo se reconcilia siempre con OpenSpec/Git/`state.yaml`? |
| Enforcement de efectos | ¿Qué garantías pueden ser `enforced`, reconciliadas o solo instructionales por target? O20A no introduce un Effect Broker. |
| Lenguaje del kernel | ¿Qué runtime satisface portabilidad, distribución y una única semántica? Go no está seleccionado como runtime único. |
| Attestation | ¿Qué hechos podría atestiguar, con qué threat model y sin confundir evidencia de proceso con corrección? O20A no requiere firmas. |
| Integración con el roadmap | ¿O13C, O15, O18, O19B y R1 se rebasan sobre el kernel probado o continúan con su diseño actual? |

## Riesgos y controles

| Riesgo | Control experimental |
| --- | --- |
| Convertir el IR en burocracia. | Limitarlo a obligaciones necesarias para `verify`; conservar Markdown como interfaz humana. |
| Crear una segunda fuente de verdad. | Mantener journal y proyecciones como observación; resolver toda divergencia a favor de OpenSpec/Git/`state.yaml`. |
| Invalidar o reutilizar evidencia incorrectamente. | Digests conservadores, fixtures de mutación y replay; ante dependencia desconocida, no reutilizar. |
| Ofrecer falsa seguridad. | Distinguir evidencia runtime, estática y juicio semántico; SARIF y attestations no prueban corrección por sí solos. |
| Ocultar diferencias entre targets. | Declarar capabilities y degradaciones; no prometer paridad que no esté probada. |
| Iniciar una reescritura transversal. | Vertical exclusiva de `verify`, shadow obligatorio y sin retirada del flujo actual. |
| Duplicar O13C/O15/O18/O19B/R1. | Gate de decisión único antes de extender el kernel; prohibir dos implementaciones permanentes de la misma responsabilidad. |

## Criterios de promoción

O20A solo puede recomendar promoción si aporta evidencia reproducible de:

- protocol conformance de schemas, journal, idempotencia y manejo de fallos;
- scenario replay estable, sin perder eventos ni resucitar obligaciones cerradas;
- mutation/semantic eval que detecte defectos sembrados y cobertura insuficiente;
- calidad no inferior frente a `sdd-verify` para los fixtures comparables;
- ninguna obligación requerida perdida y ninguna evidencia inválida aceptada;
- reanudación y degradaciones por target explícitas;
- coste y complejidad operativa justificados por resultados medidos.

Cumplir estos criterios no promueve automáticamente la arquitectura. El resultado debe cerrar el gate documentado en [O20A](../../roadmaps/harness-evolution.md#o20a-proof-carrying-verify-kernel--pending) y convertirse, si procede, en changes OpenSpec y decisiones aceptadas en la [arquitectura activa](../harness-evolution.md).

## Referencias internas

- [Arquitectura y evolución del harness](../harness-evolution.md)
- [Roadmap general](../../roadmaps/harness-evolution.md)
- [Infraestructura de evals](../../../scripts/evals/README.md)
- [Orquestador actual](../../../agents/sdd-orchestrator.agent.md)
