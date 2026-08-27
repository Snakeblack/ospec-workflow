# Design: Briefing funcional de intención del orquestador

> Mode: `design-after-spec`. La propuesta y las tres specs change-local son normativas.

## Technical Approach

Evolucionar `Intent Restatement` (D2) dentro del CORE de
`agents/sdd-orchestrator.agent.md`: después de los guards de init/ambient y antes de
`classifyChange`, el orquestador determina elegibilidad, obtiene contexto mínimo
inline o mediante `sdd-explore` de solo lectura, sintetiza 2–4 líneas funcionales y
pregunta en el hilo principal. No se crea `sdd-brief`, otro gate ni autoridad kernel.

Mientras espera, no existe `openspec/changes/{name}/`. Solo una aceptación habilita
una primera escritura mínima de `state.yaml` con la aprobación `intent-briefing`;
después `classifyChange` y Route Selection completan clasificación, owner, route,
fases y aprobaciones de sesión mediante read-merge-write.

## Architecture Decisions

| # | Decisión | Alternativa descartada | Racional |
|---|---|---|---|
| D1 | Extender D2 en CORE con una máquina de interacción acotada | Gate/agent `sdd-brief` o handler circunstancial | La decisión precede clasificación y pertenece al hilo humano; mantenerla en CORE evita delegación o autoaprobación. ADR-001 |
| D2 | Bootstrap de `state.yaml` solo después de aceptar | Crear el change al preguntar o retener la aceptación solo en conversación | Preserva «abort = cero artefactos» y hace durable la evidencia antes de clasificar. ADR-002 |
| D3 | Añadir `intent-briefing` al Approval Ledger con `synthesis` y `scope` obligatorios solo para ese gate | Reusar `architecture` o la confirmación de route | Son decisiones distintas; reusar otra aprobación perdería semántica y podría saltar el gate advisory de route. ADR-003 |
| D4 | Probar landmarks del CORE y resultados estructurales, nunca la redacción de la síntesis | Golden textual o test solo manual | Permite variar el lenguaje funcional sin relajar orden, límites ni ausencia de artefactos. |

## Data Flow

```mermaid
sequenceDiagram
    participant U as Usuario
    participant O as Orquestador CORE
    participant E as Explore read-only
    participant F as Filesystem OpenSpec
    O->>O: init/ambient guards + matriz de elegibilidad
    opt falta contexto mínimo
        O->>E: lectura/exploración sin escritura
        E-->>O: contexto; no pregunta ni aprueba
    end
    O->>U: briefing funcional 2–4 líneas (confirmar/corregir/abortar)
    loop máximo 2 correcciones
        U-->>O: corrección
        O->>U: nueva síntesis
    end
    alt aceptación inicial o confirm-last
        U-->>O: accepted
        O->>F: crear change/state.yaml con approval intent-briefing
        O->>O: classifyChange + selección/confirmación de route
        O->>F: completar state.yaml por merge
    else abort
        U-->>O: abort
        Note over F: no se crea el directorio del change
    end
```

La matriz es: eligible para `/sdd-new`, `/sdd-ff`, `/sdd-lite` y equivalentes NL;
skip para `/sdd-continue`, fase posterior cuyo ledger ya tenga aceptación y trabajo
cosmético excluido por Ambient SDD Awareness. La especificidad no participa del
predicado.

## Interfaces / Contracts

Primera escritura permitida tras aceptar (los campos operativos se añaden después):

```yaml
schema: sdd-state
change: <change-name>
status: planning
approvals:
  - id: intent-briefing-001
    gate: intent-briefing
    decision: accepted
    source: vscode/askQuestions
    accepted_at: <ISO-8601>
    synthesis: "<síntesis funcional acordada>"
    scope: "<incluido y excluido acordado>"
    applies_to: [change-classification]
```

`skills/_shared/approval-ledger.md` amplía el enum de `gate`. `synthesis` y `scope`
son extras inválidos en otros gates y obligatorios para `intent-briefing`. Esta
entrada no satisface ni sustituye la confirmación de route con
`confidence: advisory`.

Forma de pregunta:
- Rondas 0–1: una pregunta, opciones `Confirmar esta síntesis`, `Corregirla` y
  `Abortar`; `allowFreeformInput: true` permite entregar la corrección. Elegir
  corrección incrementa el contador y obliga a re-sintetizar.
- Tras consumir la segunda corrección: exactamente `Confirmar la última síntesis`
  y `Abortar`; `allowFreeformInput: false`, sin opción de corregir.
- Confirmar persiste; abortar termina sin `classifyChange` ni directorio.

## File Changes

| File | Action | Description |
|---|---|---|
| `agents/sdd-orchestrator.agent.md` | Modify | Reemplazar D2: elegibilidad/skip, briefing 2–4 líneas sin ids `sdd-*`, ownership del hilo, explore read-only, formas de pregunta, cap 2 y persist-before-classify. |
| `skills/_shared/approval-ledger.md` | Modify | Enum `intent-briefing`, shape condicional de `synthesis`/`scope` y separación de route confirmation. |
| `scripts/recommendation-ambiguity-contract.test.js` | Modify | Extraer la subsección D2 y fallar si conserva skip-if-specific; pin de matriz, cap, shapes, no-artifact, ledger-before-classify y enum del ledger. |
| `scripts/configure/__fixtures__/source/agents/sdd-orchestrator.agent.md` | Modify | Añadir un D2 representativo a la fuente reducida del test de transformación. No es la fuente productiva; esa es `agents/`. |
| `scripts/configure/__fixtures__/golden/{claude,cursor,github-copilot}/**/*orchestrator*` | Regenerate | Regenerar snapshots comprometidos desde la fixture source; no editar a mano. |
| `scripts/configure/real-repo.test.js` | Modify | Generar los targets desde el repo real y comprobar landmarks D2 en cada salida. |
| `scripts/evals/__fixtures__/vague-request-no-artifact/` | Modify/rename | Reconvertir en solicitud nueva elegible: gate presente y change ausente mientras espera. |
| `scripts/evals/__fixtures__/specific-request-no-artifact/` | Create | Solicitud concreta también emite gate sin artefactos. |
| `scripts/evals/__fixtures__/continue-no-rebrief/` | Create | Seed con ledger aceptado; continue/fase posterior no repite briefing. |
| `scripts/evals/run.js`, `scripts/evals/run.test.js`, `scripts/evals/README.md` | Modify | Corpus golden exactamente 9; mensajes, prueba de discovery y documentación 7→9. |
| `openspec/specs/ambiguity-detection-boundaries/spec.md` | Modify on archive | Actualizar Purpose: briefing para toda solicitud nueva elegible, no solo vaga; preservar boundary `design-mismatch`. |
| `openspec/specs/{agents,orchestrator-evals}/spec.md` | Merge on archive | Promover los deltas change-local. |

`dist/**` se genera desde el repo real con los comandos configure y no se edita. Los
9 perfiles de benchmark de `safe-export.js` ya son un catálogo distinto: permanecen
en 9 y sus tests deben seguir verdes; este cambio amplía solo goldens de 7 a 9.

## Spec-to-Design Allocation

| MUST / escenario | Asignación |
|---|---|
| Briefing vago y específico antes de clasificación | D2 en `agents/` + contract/real-repo tests + dos goldens |
| Corrección y cap de 2; confirm-last/abort | Máquina y shapes D2 + contract test |
| Espera/abort sin artefactos | Orden del flujo + goldens `artifacts_absent` |
| Accept persiste antes de clasificar | Bootstrap `state.yaml` + ledger contract test |
| Continue, fase aceptada y cosmetic skip | Matriz D2; golden continue cubre los dos primeros, contract test cubre cosmetic |
| Hilo principal, explore solo lectura, no self-approval | Ownership D2 + contract test |
| No phase ids en briefing | Landmark prohibitivo en D2; no comparación de wording |
| Corpus 9 y structural-only | Fixtures/runner/docs; assertions existentes |
| Ledger especializado, no route confirmation | `approval-ledger.md` + D3 |
| Purpose baseline actualizado | Paso explícito de archive merge |
| High-risk, spec-gap, design-mismatch, docs y contratos benchmark ya existentes | Sin cambio funcional; permanecen en las 6 fixtures conservadas y en la suite de regresión |

## Testing Strategy

TDD `focused`: primero ampliar tests estáticos y manifests para obtener RED; luego
editar prosa/fixtures y ejecutar GREEN con Node nativo.

| Layer | What to Test | Approach |
|---|---|---|
| Contract | D2 completo y fail-closed ante «specific = skip»; ledger condicional | `node --test scripts/recommendation-ambiguity-contract.test.js` |
| Configure | Fixture source→goldens y repo real→todos los targets conservan landmarks | tests `scripts/configure/*.test.js` relevantes |
| Golden eval | Gate fired, no artifact, no re-brief; sin comparar síntesis | manifests + `scripts/evals/run.test.js` y assertions estructurales |
| Regression | Catálogo benchmark sigue exactamente en 9; K10/K6b/clarify/design-mismatch sin cambios | tests existentes de eval/configure + `npm test` |

## Migration / Rollout

No hay migración de estados previos: ausencia de `intent-briefing` conserva
compatibilidad y solo los nuevos entry points elegibles lo solicitan. Aplicar fuente
canónica y fixture, regenerar snapshots/targets, ejecutar pruebas focales y suite.
Durante archive, fusionar requirements y corregir la frase Purpose del baseline.

Rollback: revertir CORE, ledger, tests y fixtures; regenerar outputs. Conservar
aprobaciones `intent-briefing` ya persistidas como auditoría inerte, sin borrarlas ni
reinterpretarlas como confirmación de route.

## Open Questions

Ninguna.
