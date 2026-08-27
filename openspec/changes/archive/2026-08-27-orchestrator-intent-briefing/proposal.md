# Propuesta: Briefing funcional de intención del orquestador

## Intención

Reducir el fallo costoso de construir el cambio equivocado cuando el orquestador interpreta mal incluso una solicitud concreta. Todo cambio SDD nuevo y no cosmético debe comenzar con una síntesis funcional breve, confirmable y corregible, antes de clasificar, enrutar o crear artefactos.

## Alcance

### Incluido

- Evolucionar el `Intent Restatement` existente para cubrir `/sdd-new`, `/sdd-ff`, `/sdd-lite` y equivalentes, sean vagos o específicos.
- Presentar en el hilo principal qué se entendió y qué se hará en términos funcionales legibles, sin exponer nombres internos de fases.
- Permitir hasta **2 rondas de corrección**; después, exigir confirmar la última síntesis o abortar.
- Consultar contexto mínimo inline o mediante exploración de solo lectura; el orquestador sintetiza y pregunta.
- No crear `openspec/changes/{name}/` durante el briefing. Tras aceptar, registrar la intención acordada en `state.yaml` y luego clasificar/enrutar.
- Omitirlo en `/sdd-continue`, fases posteriores de un cambio aceptado y trabajo excluido por el Ambient SDD Awareness Gate.

### Fuera de alcance

- K10 y compilación de `clarify-intent`; K6b, provenance o Assurance Graph.
- Un agente/fase `sdd-brief`, cambios a `sdd-clarify`, gates de ejecución/entrega, Execution Graph o `design-mismatch`.
- Vistas compactas O16+O17/K12.

## Capacidades

### Nuevas capacidades

- Ninguna.

### Capacidades modificadas

- `ambiguity-detection-boundaries`: el briefing deja de depender de vaguedad y adopta corrección acotada, aceptación y excepciones explícitas.
- `agents`: el CORE conserva la decisión en el hilo humano, sin autoaprobación, y persiste la aceptación antes de clasificar.
- `orchestrator-evals`: los contratos y goldens cubren solicitudes específicas, rondas acotadas, ausencia de artefactos y reanudación sin repetir.

## Enfoque

Modificar el gate D2 existente, no añadir otro. Actualizar su contrato normativo, el prompt canónico y sus espejos generados. Tras aceptación, crear el estado y anexar una aprobación de intención con síntesis acordada y alcance; una corrección vuelve a sintetizar hasta el límite. Adaptar pruebas de contrato y escenarios estructurales para eliminar los supuestos «específico = skip» y «un solo intercambio».

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `agents/sdd-orchestrator.agent.md` | Modificado | Gate CORE y persistencia |
| `openspec/specs/{ambiguity-detection-boundaries,agents,orchestrator-evals}/spec.md` | Modificado | Deltas conductuales |
| `scripts/recommendation-ambiguity-contract.test.js` | Modificado | Contratos del briefing |
| `scripts/evals/`, `scripts/configure/` | Modificado | Goldens y espejos |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Fricción en solicitudes claras | Media | Briefing corto y exclusiones existentes |
| Correcciones sin convergencia | Baja | Máximo 2 rondas; confirmar o abortar |
| Divergencia entre targets | Media | Fuente canónica, build y tests de espejos |

## Plan de reversión

Revertir prompt, specs, tests y goldens al gate condicionado por vaguedad. Conservar entradas de aprobación ya persistidas como auditoría inerte; no borrarlas ni reinterpretarlas.

## Dependencias

- Approval Ledger y Ambient SDD Awareness Gate existentes; sin dependencia de K10 ni K6b.

## Criterios de éxito

- [ ] Toda solicitud SDD nueva elegible recibe briefing antes de clasificación y artefactos.
- [ ] Confirmación, corrección acotada, abortar y excepciones quedan verificadas estructuralmente.
- [ ] El orquestador sigue siendo la única voz ante el usuario y no puede autoaprobar.
