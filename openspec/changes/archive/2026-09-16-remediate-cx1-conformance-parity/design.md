# Design: Remediate CX1 Conformance Parity

## Technical Approach

Este diseño resuelve el drift de validación detectado en el slice de contexto y representaciones derivadas CX1 del harness. Actualmente, los validadores de tiempo de ejecución en JavaScript (`scripts/lib/result-envelope.js`) y Go (`internal/resultenvelope/resultenvelope.go`) aplican restricciones estrictas que no estaban formalmente codificadas en el JSON Schema declarativo `schemas/kernel/result-envelope/v1/envelope.schema.json` ni en su copia raíz de compatibilidad `schemas/kernel/result-envelope.schema.json`. Específicamente:
1. La exigencia obligatoria de `question_gate` cuando `status == "blocked"`.
2. La restricción `minLength: 1` en campos de texto obligatorios de `question_gate` (`reason`, `header`, `question`, `label`) y de `assumptions` (`id`, `phase`, `statement`, `basis`).
3. La carencia de fixtures negativos atómicos para estos casos en `schemas/kernel/result-envelope/v1/fixtures/invalid/`.
4. La ausencia de un arnés de pruebas de conformidad diferencial automatizado que verifique sobre toda la matriz de fixtures la igualdad estricta trifecta `schema.valid === js.valid === go.valid`.
5. La desalineación del roadmap `docs/roadmaps/harness-evolution.md`, donde CX1 aún figuraba como `pending`.

La estrategia consiste en endurecer los dos schemas JSON mediante la palabra clave condicional `if/then` de Draft 2020-12 y `minLength: 1`, añadir los fixtures negativos requeridos, implementar suites de prueba de conformidad diferencial simétricas en Node.js y Go, y sincronizar la tabla del roadmap evolutivo.

## Architecture Decisions

| Opción | Trade-off | Decisión |
|---|---|---|
| Condicional `if/then` en Draft 2020-12 | Requiere soporte de ramas condicionales en el intérprete; `kernel-schema-validator.js` ya lo implementa nativamente | **Adoptada**: Añadir `if: { properties: { status: { const: "blocked" } } }, then: { required: ["question_gate"] }` a nivel raíz |
| `minLength: 1` en propiedades de texto de `question_gate` y `assumptions` | Rechaza strings vacíos (`""`); previene que payloads malformados superen la validación estricta | **Adoptada**: Configurar `minLength: 1` en `reason`, `header`, `question`, `label`, `id`, `phase`, `statement` y `basis` |
| Replicación idéntica en schema raíz `result-envelope.schema.json` | Mantiene duplicación controlada entre el archivo v1 y la raíz de compatibilidad | **Adoptada**: Garantizar compatibilidad y paridad estructural 1:1 entre ambos archivos |
| Fixtures negativos atómicos dedicados | Incrementa el catálogo de fixtures en disco; aísla cada motivo de rechazo | **Adoptada**: Crear `blocked-missing-question-gate.json`, `empty-question-gate-fields.json` y `empty-assumption-fields.json` |
| Arnés diferencial simétrico en Node y Go | Requiere ejecución desacoplada entre runtimes para verificar paridad triple sin dependencias pesadas | **Adoptada**: Crear `result-envelope-conformance.test.js` en Node y `conformance_test.go` en Go evaluando la matriz compartida |
| Actualización del roadmap `harness-evolution.md` | Documenta el estado real tras la remediación de paridad | **Adoptada**: Actualizar CX1 a implementado/archivado y ajustar dependencias en CX0 |

### Decision: Inclusión de regla condicional if/then y minLength: 1 en Schemas JSON

**Choice**: Incorporar la regla condicional `if: { properties: { status: { const: "blocked" } } }, then: { required: ["question_gate"] }` en `envelope.schema.json` v1 y replicarla en `schemas/kernel/result-envelope.schema.json`. Además, incorporar `minLength: 1` en `question_gate.properties.reason`, `question_gate.properties.questions.items.properties.header`, `question_gate.properties.questions.items.properties.question`, `question_gate.properties.questions.items.properties.options.items.properties.label`, y en `assumptions.items.properties` (`id`, `phase`, `statement`, `basis`).

**Alternatives considered**:
- *Validación exclusiva en runtime JS/Go*: Rechazada porque los consumidores y linters basados exclusivamente en JSON Schema aceptarían payloads inválidos, perpetuando el drift contractual.
- *Forzar `question_gate` en el array global `required`*: Rechazada porque `question_gate` solo es obligatorio cuando `status == "blocked"`; exigirlo siempre rompería todos los envelopes con status `success` o `partial`.

**Rationale**: El validador nativo `kernel-schema-validator.js` soporta keywords Draft 2020-12 incluyendo `if/then` y `minLength`. Este cambio traslada la regla de negocio desde el código de runtime al contrato canónico declarativo, manteniendo paridad sin introducir dependencias adicionales.

**Evidence and consequences**: Satisface REQ-kernel-contract-schemas-031 y REQ-skills-018. Los schemas rechazan inmediatamente envelopes bloqueados sin gate o con campos de texto vacíos. Totalmente reversible vía `git revert`.

### Decision: Matriz compartida de fixtures negativos atómicos

**Choice**: Ubicar en `schemas/kernel/result-envelope/v1/fixtures/invalid/` tres fixtures independientes:
1. `blocked-missing-question-gate.json`: Payload completo con `status: "blocked"` pero sin propiedad `question_gate`.
2. `empty-question-gate-fields.json`: Payload con `status: "blocked"` y `question_gate`, pero con strings vacíos (`""`) en `reason`, `header`, `question` y `label`.
3. `empty-assumption-fields.json`: Payload con `assumptions`, pero con strings vacíos (`""`) en `id`, `phase`, `statement` y `basis`.

**Alternatives considered**:
- *Pruebas unitarias sintéticas en memoria*: Rechazada porque no son portables entre lenguajes y facilitan la divergencia entre JS y Go.
- *Un único fixture combinado con múltiples defectos*: Rechazada porque enmascara fallos parciales de validadores que se detienen en el primer error o ignoran sub-propiedades.

**Rationale**: La matriz compartida en disco constituye la verdad ejecutable del contrato. Permite que cualquier host, tooling o lenguaje evalúe los mismos casos límites con determinismo.

**Evidence and consequences**: Satisface REQ-kernel-contract-schemas-031. Facilita la verificación automatizada en CI y simplifica la incorporación de nuevos fixtures si el contrato evoluciona.

### Decision: Arnés de conformidad diferencial automatizado simétrico (Node y Go)

**Choice**: Desarrollar dos suites de prueba dedicadas que operan sobre la matriz de fixtures compartida (`schemas/kernel/result-envelope/v1/fixtures/` tanto en `valid/` como en `invalid/`):
- `scripts/lib/result-envelope-conformance.test.js` en Node.js.
- `internal/resultenvelope/conformance_test.go` en Go.
Ambas suites comprueban para cada fixture que `schema.valid === js.valid === go.valid`. En Node, se evalúa el schema con `kernel-schema-validator.js`, el validador JS con `result-envelope.js`, y el validador Go mediante ejecución del helper de Go. En Go, se evalúa `resultenvelope.Validate` nativamente y se invocan los evaluadores de JS y Schema mediante ejecución de Node.

**Alternatives considered**:
- *Ejecutar pruebas diferenciales únicamente en Node*: Rechazada porque Go es un runtime ciudadano de primera clase en el proyecto y debe contar con un guardián ejecutable dentro de `go test`.
- *Añadir un paquete externo de JSON Schema en Go*: Rechazada para mantener el módulo Go de `resultenvelope` con cero dependencias externas de terceros.

**Rationale**: Asegura simetría ejecutable (E1) según `docs/harness-go-js-parity.md` y previene regresiones silenciosas donde un validador acepte lo que otro rechaza.

**Evidence and consequences**: Satisface REQ-skills-018. Cualquier discrepancia rompe el build en CI inmediatamente.

### Decision: Alineación del estado de CX1 en el roadmap evolutivo

**Choice**: Modificar `docs/roadmaps/harness-evolution.md` para actualizar la fila de CX1 de `pending` a implementado/archivado (`implemented-archived` / `implemented`), citando la conclusión de los cambios de proyección mecánica y paridad de conformidad contractual. Ajustar la mención en la fila de CX0 para reflejar que CX1 ya no se encuentra pendiente.

**Alternatives considered**:
- *Mantener CX1 como pending hasta la implementación de CX2*: Rechazada porque el alcance de CX1 (envelope estructurado y proyección de estado mecánica) está completamente terminado y verificado.
- *Omitir la actualización documental en este cambio*: Rechazada porque preserva información obsoleta en los artefactos de arquitectura.

**Rationale**: Refleja la realidad operativa del harness y evita falsos reportes de brechas en revisiones de gobernanza.

**Evidence and consequences**: Alinea el roadmap sin alterar ningún contrato de ejecución ni introducir efectos secundarios en runtime.

## Data Flow

La validación de cualquier return envelope (`json:result-envelope`) sigue un flujo determinista donde las tres capas (JSON Schema declarativo, validador JS de runtime y validador Go de runtime) aplican idéntica frontera de aceptación:

```
                            ┌──────────────────────────────────────────────┐
                            │   Return Payload (json:result-envelope)      │
                            └──────────────────────┬───────────────────────┘
                                                   │
                              ┌────────────────────┴────────────────────┐
                              ▼                                         ▼
                 [ JSON Schema Engine ]                     [ Runtime Validators ]
         (kernel-schema-validator / Draft 2020-12)                     │
                              │                                         ├─────────────────────────────┐
                    1. Type & Const Validation                          ▼                             ▼
                       (schema_version: 1)                     [ JS Validator ]              [ Go Validator ]
                              │                            (result-envelope.js)       (resultenvelope.go)
                    2. Required Top-Level Props                         │                             │
                       (status, summary, etc.)             1. Top-Level Types &       1. Top-Level Types &
                              │                               Required Fields            Required Fields
                    3. Conditional Branch (if/then)                     │                             │
                       IF status == "blocked"              2. Status Enum &           2. Status Enum &
                       THEN required: ["question_gate"]       Blocker Type               Blocker Type
                              │                                 Validation                 Validation
                    4. Subtree Property Validation                      │                             │
                       - question_gate.reason (minLen: 1)  3. IF status == blocked:   3. IF status == blocked:
                       - question_gate questions/options      require question_gate      require question_gate
                         (header, question, label minLen: 1)  & minLength > 0            & minLength > 0
                       - assumptions fields (minLen: 1)                 │                             │
                              │                            4. Assumptions &           4. Assumptions &
                              ▼                               Signals Validation         Signals Validation
                       [ schema.valid ]                                 │                             │
                              │                                         ▼                             ▼
                              │                                    [ js.valid ]                  [ go.valid ]
                              │                                         │                             │
                              └────────────────────────┬────────────────┴─────────────────────────────┘
                                                       │
                                                       ▼
                                     [ Differential Conformance Assertion ]
                                       schema.valid === js.valid === go.valid
```

### Secuencia de Validación
1. **Extracción y sintaxis**: Se extrae el bloque cercado `json:result-envelope` y se analiza sintácticamente como objeto JSON.
2. **Validación de tipos y constantes**: Se exige `schema_version: 1` estricto y presencia de campos requeridos de primer nivel (`status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `skill_resolution`).
3. **Validación condicional de estado bloqueado**: Si `status === "blocked"`, se exige la presencia obligatoria y no nula de `question_gate`. En schema se ejecuta mediante la rama `if.properties.status.const == "blocked" -> then.required: ["question_gate"]`.
4. **Validación de longitud mínima de strings**: En `question_gate` y `assumptions`, cada campo de texto obligatorio no puede ser una cadena vacía (`minLength: 1` en schema; `isNonEmptyString` en JS y Go).
5. **Decisión de admisión**: Las tres capas emiten su veredicto booleano. El arnés diferencial asegura que ninguna combinación de campos válidos o inválidos genere divergencias.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `schemas/kernel/result-envelope/v1/envelope.schema.json` | Modify | Añade regla condicional `if/then` para exigir `question_gate` ante `status: "blocked"` y `minLength: 1` en strings obligatorios de `question_gate` y `assumptions` |
| `schemas/kernel/result-envelope.schema.json` | Modify | Replica idénticas restricciones estructurales para preservar paridad 1:1 con v1 |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/blocked-missing-question-gate.json` | Create | Fixture negativo: payload bloqueado que omite `question_gate` |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/empty-question-gate-fields.json` | Create | Fixture negativo: payload con cadenas vacías en campos obligatorios de `question_gate` |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/empty-assumption-fields.json` | Create | Fixture negativo: payload con cadenas vacías en campos obligatorios de `assumptions` |
| `scripts/lib/result-envelope-conformance.test.js` | Create | Suite automatizada de conformidad diferencial en Node.js que evalúa la matriz completa contra Schema, JS y Go |
| `internal/resultenvelope/conformance_test.go` | Create | Suite simétrica de conformidad diferencial en Go que evalúa la matriz completa contra Go, JS y Schema |
| `docs/roadmaps/harness-evolution.md` | Modify | Actualiza el estado de CX1 a implementado/archivado y alinea la fila de CX0 |
| `openspec/changes/remediate-cx1-conformance-parity/decisions/adr-001.md` | Create | Registro formal de decisión de arquitectura: Regla condicional if/then y minLength en Schemas JSON |
| `openspec/changes/remediate-cx1-conformance-parity/decisions/adr-002.md` | Create | Registro formal de decisión de arquitectura: Matriz compartida de fixtures negativos |
| `openspec/changes/remediate-cx1-conformance-parity/decisions/adr-003.md` | Create | Registro formal de decisión de arquitectura: Arnés diferencial simétrico multi-runtime |

## Interfaces / Contracts

### Regla Condicional y minLength en JSON Schema (Draft 2020-12)

Fragmento a incorporar en `envelope.schema.json` v1 y `result-envelope.schema.json`:

```json
  "if": {
    "properties": {
      "status": {
        "const": "blocked"
      }
    }
  },
  "then": {
    "required": [
      "question_gate"
    ]
  }
```

Y en las propiedades de `question_gate`:
```json
    "question_gate": {
      "type": "object",
      "required": [
        "reason",
        "questions"
      ],
      "properties": {
        "reason": {
          "type": "string",
          "minLength": 1
        },
        "questions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "header",
              "question",
              "options"
            ],
            "properties": {
              "header": {
                "type": "string",
                "minLength": 1
              },
              "question": {
                "type": "string",
                "minLength": 1
              },
              "options": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "label"
                  ],
                  "properties": {
                    "label": {
                      "type": "string",
                      "minLength": 1
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
```

Y en las propiedades de `assumptions.items.properties`:
```json
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "phase": {
            "type": "string",
            "minLength": 1
          },
          "statement": {
            "type": "string",
            "minLength": 1
          },
          "reversibility": {
            "type": "string",
            "enum": [
              "low",
              "high"
            ]
          },
          "basis": {
            "type": "string",
            "minLength": 1
          }
        }
```

### Contrato de Conformidad Diferencial

Invariante inmutable que debe cumplirse en cada runner de prueba para todo fixture $F \in \text{Fixtures}$:

$$\text{Valid}_{\text{Schema}}(F) \equiv \text{Valid}_{\text{JS}}(F) \equiv \text{Valid}_{\text{Go}}(F)$$

Cualquier discrepancia donde uno de los evaluadores devuelva `true` y otro `false` debe provocar la falla inmediata del arnés con un reporte detallado del fixture divergente.

## Testing Strategy

| Requirement / quality concern | Trigger and conditions | Expected response | Verification |
|---|---|---|---|
| REQ-kernel-contract-schemas-031 (Valid fixtures) | Fixture válido en `valid/` evaluado contra `envelope.schema.json` | `valid === true`, 0 errores | `node --test scripts/lib/result-envelope-schema-fixtures.test.js` |
| REQ-kernel-contract-schemas-031 (Blocked missing question_gate) | Fixture `blocked-missing-question-gate.json` evaluado contra schema | `valid === false`, identifica error `required` en `/question_gate` | `scripts/lib/result-envelope-conformance.test.js` |
| REQ-kernel-contract-schemas-031 (Empty question_gate fields) | Fixture `empty-question-gate-fields.json` evaluado contra schema | `valid === false`, identifica error `minLength` | `scripts/lib/result-envelope-conformance.test.js` |
| REQ-kernel-contract-schemas-031 (Empty assumption fields) | Fixture `empty-assumption-fields.json` evaluado contra schema | `valid === false`, identifica error `minLength` | `scripts/lib/result-envelope-conformance.test.js` |
| REQ-kernel-contract-schemas-031 (Root schema parity) | Toda la matriz de fixtures evaluada contra `result-envelope.schema.json` | Veredicto idéntico a `envelope.schema.json` v1 | `scripts/lib/result-envelope-schema-fixtures.test.js` |
| REQ-skills-018 (Differential conformance in Node) | Ejecución de `result-envelope-conformance.test.js` sobre toda la matriz de fixtures | `schema.valid === js.valid === go.valid` en el 100% de los fixtures | `node --test scripts/lib/result-envelope-conformance.test.js` |
| REQ-skills-018 (Differential conformance in Go) | Ejecución de `conformance_test.go` sobre toda la matriz de fixtures | Paridad exacta entre Go, JS y Schema en el 100% de los fixtures | `go test -v ./internal/resultenvelope/...` |
| Non-regression: Reducer and Hooks | Ejecución de suites existentes de hooks y lifecycle kernel | Todas las pruebas pasan sin modificaciones | `node --test scripts/hooks/subagent-stop.test.js scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` |
| Non-regression: Full repo suite | Ejecución completa de tests del repositorio | Suite completa en verde (3400+ tests) | `npm test` |

## Migration / Rollout

No migration required. Este cambio no altera esquemas de base de datos ni estructuras en disco de cambios anteriores. Todas las modificaciones son aditivas en el endurecimiento de esquemas y suites de prueba de conformidad. Reversible limpiamente mediante `git revert`.

## Open Questions

None. Todas las decisiones técnicas han sido aterrizadas sobre especificaciones existentes y patrones consolidados del repositorio.
