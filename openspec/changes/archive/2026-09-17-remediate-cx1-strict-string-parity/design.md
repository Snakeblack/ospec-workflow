# Design: Remediate CX1 Strict String Parity

## Technical Approach

Este diseño resuelve dos divergencias contractuales críticas detectadas tras el PR #191 entre los esquemas JSON de `result-envelope/v1` y sus validadores de tiempo de ejecución en JavaScript y Go:

1. **Permisividad de cadenas compuestas exclusivamente de espacios en blanco (`"   "`) en esquemas declarativos**: Mientras que los validadores de runtime en JS (`trim().length > 0`) y Go (`strings.TrimSpace(s) != ""`) aplican semántica estricta `isNonEmptyString` rechazando cadenas de espacios en blanco, los esquemas JSON (`envelope.schema.json` v1 y `result-envelope.schema.json`) solo especificaban `"minLength": 1`. En JSON Schema, `"   "` tiene una longitud de 3 caracteres, superando indebidamente la validación declarativa.
2. **Ausencia de validación de tipo en runtime para `detailed_report`**: Aunque el esquema declara `"detailed_report": { "type": "string" }`, ni `scripts/lib/result-envelope.js` ni `internal/resultenvelope/resultenvelope.go` verificaban el tipo cuando la propiedad estaba presente, permitiendo que valores no string (como números, booleanos u objetos) pasaran desapercibidos en runtime pese a violar el esquema.

La estrategia arquitectónica implementa paridad estricta y simétrica a través de tres pilares:
- **Endurecimiento de Schemas JSON**: Incorporar la restricción `"pattern": "\\S"` junto a `"minLength": 1"` en todos los campos con semántica `isNonEmptyString` (`executive_summary`, `next_recommended`, rama string de `risks`, items de `key_decisions`, propiedades de `assumptions` y propiedades de texto en `question_gate`).
- **Validación de Runtime en JS y Go**: Incorporar verificación de tipo para `detailed_report` (`typeof === "string"` en JS; aserción de tipo string en Go) reportando `"detailed_report must be a string"` en caso de invalidez.
- **Matriz Compartida de Fixtures Negativos y Pruebas Diferenciales**: Publicar dos fixtures atómicos (`whitespace-only-required-strings.json` y `non-string-detailed-report.json`) en `schemas/kernel/result-envelope/v1/fixtures/invalid/`, integrándolos en las suites de conformidad diferencial en Node.js y Go para garantizar la invariante trifásica `schema.valid === js.valid === go.valid === false`.

### Evaluación de `pattern` en el Validador del Kernel

El intérprete nativo de JSON Schema `scripts/lib/kernel-schema-validator.js` (ADR-003) ya implementa la evaluación de `pattern` en cadenas mediante la expresión nativa:
```javascript
if (typeof schema.pattern === "string") {
  try {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(instance)) {
      errors.push({
        path: instancePath || "/",
        rule: "pattern",
        message: `string does not match pattern ${schema.pattern}`,
      });
    }
  } catch {
    // ignore invalid regex in schema
  }
}
```
Al configurar `"pattern": "\\S"`, el motor compila la expresión regular `/\S/` de ECMA-262 (y compatible con Go `regexp`), la cual comprueba si existe al menos un carácter que no sea espacio en blanco. Cadenas como `"   "` devuelven `false` y generan de forma determinista un error con `rule: "pattern"`. Por lo tanto, el endurecimiento de esquemas **no requiere ninguna dependencia externa adicional ni modificaciones en el intérprete del kernel**.

## Architecture Decisions

| Opción | Trade-off | Decisión |
|---|---|---|
| `"pattern": "\\S"` junto a `"minLength": 1` en Schemas | Exige soporte de evaluación regex en validadores; el kernel y motores estándar ya lo soportan nativamente | **Adoptada**: Añadir `"pattern": "\\S"` a todos los campos con semántica `isNonEmptyString` en v1 y schema raíz |
| Formato custom o keyword propietario (`format: "non-empty"`) | No es estándar en JSON Schema Draft 2020-12; rompería interoperabilidad con herramientas externas | **Rechazada**: Mantener keywords estándar de la especificación JSON Schema |
| Chequeo de tipo string para `detailed_report` en JS y Go | Añade condición adicional en validadores; garantiza sincronía con `"type": "string"` del schema | **Adoptada**: Validar `typeof === "string"` en JS y `s, isString := v.(string)` en Go emitiendo `"detailed_report must be a string"` |
| Coerción automática a string para `detailed_report` | Enmascara defectos en clientes emisores y oculta payloads mal formados | **Rechazada**: Los validadores deben fallar cerrado ante tipos incorrectos |
| Matriz compartida de fixtures negativos atómicos | Añade archivos específicos en disco; aísla inequívocamente cada causa de rechazo | **Adoptada**: Crear `whitespace-only-required-strings.json` y `non-string-detailed-report.json` |
| Pruebas de conformidad diferencial simétricas en Node y Go | Ejecución desacoplada en dos lenguajes; garantiza paridad trifásica `schema === js === go` | **Adoptada**: Extender `result-envelope-conformance.test.js` y `conformance_test.go` |

### Decision: Hardening de Schemas JSON con `pattern: "\\S"` para campos `isNonEmptyString`

**Choice**: Añadir `"pattern": "\\S"` junto a `"minLength": 1"` en `schemas/kernel/result-envelope/v1/envelope.schema.json` y `schemas/kernel/result-envelope.schema.json` para todos los campos donde el runtime aplica `isNonEmptyString`: `executive_summary`, `next_recommended`, rama string de `risks`, items de `key_decisions`, propiedades de `assumptions` (`id`, `phase`, `statement`, `basis`) y campos obligatorios de `question_gate` (`reason`, `header`, `question`, `label`).

**Alternatives considered**:
- *Formato custom `format: "non-empty-string"`*: Requiere registrar formateadores personalizados en cada motor consumidor, violando el estándar portable Draft 2020-12.
- *Expresión anclada `^.*\\S.*$`*: Funcionalmente idéntica a `\\S` en regex no anclado de JS/Go, pero innecesariamente verbosa.
- *Mantener validación de espacios solo en runtime*: Permite que linters y esquemas externos acepten payloads inválidos, perpetuando el drift contractual.

**Rationale**: `\\S` es soportado universalmente por todos los motores JSON Schema compatibles con Draft 2020-12, incluyendo Ajv, Go regex y el validador nativo del kernel (`kernel-schema-validator.js`). Cierra la brecha entre schema y runtime sin introducir dependencias ni modificar el código del validador del kernel.

**Evidence and consequences**: Cumple REQ-kernel-contract-schemas-031 y REQ-skills-018. Payloads con cadenas de solo espacios en blanco son rechazados inmediatamente con `rule: "pattern"`. Reversible limpiamente mediante control de versiones.

### Decision: Validación de Tipo String para `detailed_report` en Runtimes JS y Go

**Choice**: Incorporar en `validateEnvelope` (`scripts/lib/result-envelope.js`) y `ValidateForPhase` (`internal/resultenvelope/resultenvelope.go`) una comprobación explícita cuando la propiedad `detailed_report` esté presente en el objeto:
- JS: `if (Object.prototype.hasOwnProperty.call(obj, "detailed_report") && typeof obj.detailed_report !== "string") { errors.push("detailed_report must be a string"); }`
- Go: `if v, ok := obj["detailed_report"]; ok { if _, isString := v.(string); !isString { errs = append(errs, "detailed_report must be a string"); } }`

**Alternatives considered**:
- *Omitir validación en runtime por ser campo opcional*: Provocaba discrepancia diferencial donde el schema rechazaba el payload y el runtime lo admitía.
- *Permitir valores heterogéneos (números/objetos) en `detailed_report`*: Rompe el contrato formal del envelope y la interoperabilidad con downstream renderers (`renderEnvelopeToMarkdown`).
- *Coerción de tipo implícita*: Oculta errores de emisión en lugar de fallar cerrado.

**Rationale**: Ambos runtimes deben reflejar con fidelidad exacta la declaración `"type": "string"` del schema para mantener la paridad diferencial simétrica requerida por el estándar de arnés. El mensaje de error resultante es determinista e idéntico en ambos lenguajes.

**Evidence and consequences**: Satisface REQ-skills-018. Evita que envelopes con tipos corruptos en `detailed_report` avancen en el pipeline. Coste de cómputo despreciable ($O(1)$) y 100% reversible.

### Decision: Matriz Compartida de Fixtures Negativos y Conformidad Diferencial Trifásica

**Choice**: Añadir a `schemas/kernel/result-envelope/v1/fixtures/invalid/`:
1. `whitespace-only-required-strings.json`: Payload completo con cadenas de solo espacios (`"   "`) en campos requeridos.
2. `non-string-detailed-report.json`: Payload completo con `detailed_report: 123`.
Integrar ambos fixtures en `scripts/lib/result-envelope-conformance.test.js` y `internal/resultenvelope/conformance_test.go`, verificando que `schema.valid === js.valid === go.valid === false`.

**Alternatives considered**:
- *Fixtures sintéticos inline en los tests de cada lenguaje*: Facilita drift o divergencia entre suites de prueba de diferentes lenguajes.
- *Agrupar múltiples errores en un único fixture*: Impide comprobar el fallo específico de cada restricción de manera aislada.

**Rationale**: Los archivos en disco representan la fuente canónica e inmutable compartida entre Node.js y Go. Cualquier cambio futuro en validadores o esquemas es verificado automáticamente contra estos casos de prueba sin esfuerzo de sincronización manual.

**Evidence and consequences**: Garantiza regresión cero y verificación continua en CI. Satisface REQ-kernel-contract-schemas-031 y REQ-skills-018.

## Data Flow

El procesamiento del result envelope sigue una evaluación simétrica e independiente a través de tres capas de validación:

```
                            ┌──────────────────────────────────────────────┐
                            │   Return Payload (json:result-envelope)      │
                            └──────────────────────┬───────────────────────┘
                                                   │
                               ┌───────────────────┴───────────────────┐
                               ▼                                       ▼
                  [ JSON Schema Engine ]                      [ Runtime Validators ]
          (kernel-schema-validator / Draft 2020-12)                    │
                               │                                       ├─────────────────────────────┐
                     1. Type & Const Validation                        ▼                             ▼
                        (schema_version: 1,                   [ JS Validator ]              [ Go Validator ]
                         detailed_report: string)            (result-envelope.js)          (resultenvelope.go)
                               │                                       │                             │
                     2. Required & MinLength Checks           1. Type Validation            1. Type Validation
                        (executive_summary minLen: 1,            (detailed_report               (detailed_report
                         next_recommended minLen: 1,              typeof string)                string assertion)
                         etc.)                                         │                             │
                               │                              2. Non-Empty String Check     2. Non-Empty String Check
                     3. Pattern Validation (\S)                  (trim().length > 0)           (TrimSpace(s) != "")
                        - rejects "   " in required strings            │                             │
                               │                              3. Structure & Enum Checks    3. Structure & Enum Checks
                     4. Conditional Blocked Gate Checks          (status, question_gate,       (status, question_gate,
                        (if status == "blocked" then               assumptions, signals)         assumptions, signals)
                         required: ["question_gate"])                  │                             │
                               │                                       ▼                             ▼
                               ▼                                  [ js.valid ]                  [ go.valid ]
                        [ schema.valid ]                               │                             │
                               │                                       │                             │
                               └───────────────────────┬───────────────┴─────────────────────────────┘
                                                       │
                                                       ▼
                                     [ Differential Conformance Assertion ]
                                       schema.valid === js.valid === go.valid
```

### Secuencia de Validación y Frontera de Rechazo

1. **Lectura y Parsing**: El payload es extraído y analizado sintácticamente como objeto JSON.
2. **Evaluación de Tipos Estrictos**:
   - Schema verifica `type: "string"` en `detailed_report` si está presente.
   - JS y Go comprueban que `detailed_report` sea de tipo `string`.
3. **Evaluación de No Vacío y Caracteres No Espacio**:
   - Schema evalúa `minLength: 1` y `new RegExp("\\S").test(instance)`. Si la cadena contiene solo espacios (`"   "`), falla con `rule: "pattern"`.
   - JS evalúa `value.trim().length > 0`. Si contiene solo espacios, falla con `"must be a non-empty string"`.
   - Go evalúa `strings.TrimSpace(s) != ""`. Si contiene solo espacios, falla con `"must be a non-empty string"`.
4. **Evaluación de Conformidad Trifásica**: La suite de pruebas diferencial comprueba que las tres capas coincidan unánimemente en `valid: false` para ambos fixtures negativos.

## File Changes

| File | Action | Description |
|---|---|---|
| `schemas/kernel/result-envelope/v1/envelope.schema.json` | Modify | Incorpora `"pattern": "\\S"` junto a `"minLength": 1"` en `executive_summary`, `next_recommended`, `risks` (string), `key_decisions.items`, `assumptions.*` (`id`, `phase`, `statement`, `basis`), `question_gate.reason`, `question_gate.questions.items` (`header`, `question`) y `question_gate.questions.items.options.items.label`. |
| `schemas/kernel/result-envelope.schema.json` | Modify | Replica de forma idéntica los cambios de `envelope.schema.json` v1 para preservar retrocompatibilidad 1:1. |
| `scripts/lib/result-envelope.js` | Modify | Añade validación `typeof obj.detailed_report !== "string"` cuando `detailed_report` esté presente en `validateEnvelope`. |
| `internal/resultenvelope/resultenvelope.go` | Modify | Añade comprobación `s, isString := v.(string); if !isString` cuando `detailed_report` esté presente en `ValidateForPhase`. |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/whitespace-only-required-strings.json` | Create | Fixture negativo conteniendo cadenas formadas exclusivamente por espacios en blanco (`"   "`). |
| `schemas/kernel/result-envelope/v1/fixtures/invalid/non-string-detailed-report.json` | Create | Fixture negativo conteniendo `detailed_report: 123`. |
| `scripts/lib/result-envelope-conformance.test.js` | Modify | Incorpora aserciones específicas de conformidad diferencial en Node.js para los dos nuevos fixtures negativos. |
| `scripts/lib/result-envelope-schema-fixtures.test.js` | Modify | Registra ambos fixtures en la tabla de invalid fixtures esperados del validador de schemas. |
| `internal/resultenvelope/conformance_test.go` | Modify | Incorpora tests dedicados en Go para verificar el rechazo de los dos nuevos fixtures y sus mensajes de error. |
| `scripts/lib/result-envelope.test.js` | Modify | Añade tests unitarios en JS para la validación estricta del tipo de `detailed_report`. |
| `internal/resultenvelope/resultenvelope_test.go` | Modify | Añade tests unitarios en Go para la validación estricta del tipo de `detailed_report`. |
| `openspec/changes/remediate-cx1-strict-string-parity/decisions/adr-001.md` | Create | Registro formal de arquitectura: Hardening de schemas con `pattern: "\\S"`. |
| `openspec/changes/remediate-cx1-strict-string-parity/decisions/adr-002.md` | Create | Registro formal de arquitectura: Validación de tipo string en `detailed_report`. |
| `openspec/changes/remediate-cx1-strict-string-parity/decisions/adr-003.md` | Create | Registro formal de arquitectura: Fixtures negativos compartidos y paridad trifásica. |

## Interfaces / Contracts

### Modificaciones en Schemas JSON (`envelope.schema.json` v1 y raíz)

Campos de primer nivel endurecidos:
```json
    "executive_summary": {
      "type": "string",
      "minLength": 1,
      "pattern": "\\S"
    },
    "detailed_report": {
      "type": "string"
    },
    "next_recommended": {
      "type": "string",
      "minLength": 1,
      "pattern": "\\S"
    },
    "risks": {
      "oneOf": [
        {
          "type": "string",
          "minLength": 1,
          "pattern": "\\S"
        },
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      ]
    },
    "key_decisions": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "string",
        "minLength": 1,
        "pattern": "\\S"
      }
    },
```

Campos en `assumptions.items.properties`:
```json
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "phase": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
          },
          "statement": {
            "type": "string",
            "minLength": 1,
            "pattern": "\\S"
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
            "minLength": 1,
            "pattern": "\\S"
          }
        }
```

Campos en `question_gate`:
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
          "minLength": 1,
          "pattern": "\\S"
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
                "minLength": 1,
                "pattern": "\\S"
              },
              "question": {
                "type": "string",
                "minLength": 1,
                "pattern": "\\S"
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
                      "minLength": 1,
                      "pattern": "\\S"
                    },
                    "description": {
                      "type": "string"
                    },
                    "recommended": {
                      "type": "boolean"
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

### Contrato de Runtime en JavaScript (`scripts/lib/result-envelope.js`)

```javascript
  if (
    Object.prototype.hasOwnProperty.call(obj, "detailed_report") &&
    typeof obj.detailed_report !== "string"
  ) {
    errors.push("detailed_report must be a string");
  }
```

### Contrato de Runtime en Go (`internal/resultenvelope/resultenvelope.go`)

```go
	if v, ok := obj["detailed_report"]; ok {
		if _, isString := v.(string); !isString {
			errs = append(errs, "detailed_report must be a string")
		}
	}
```

### Ecuación Invariante de Paridad de Conformidad

Para todo fixture $f \in \mathcal{F}_{\text{fixtures}}$:
$$\text{Validator}_{\text{Schema}}(f) \equiv \text{Validator}_{\text{JS}}(f) \equiv \text{Validator}_{\text{Go}}(f)$$

En particular, para $f \in \{\text{whitespace-only-required-strings}, \text{non-string-detailed-report}\}$:
$$\text{Validator}_{\text{Schema}}(f) = \text{Validator}_{\text{JS}}(f) = \text{Validator}_{\text{Go}}(f) = \text{false}$$

## Testing Strategy

| Requirement / quality concern | Trigger and conditions | Expected response | Verification |
|---|---|---|---|
| REQ-kernel-contract-schemas-031 (Whitespace-only strings) | Fixture `whitespace-only-required-strings.json` con `"   "` evaluado contra `envelope.schema.json` | `valid === false`, identifica error con `rule: "pattern"` | `node --test scripts/lib/result-envelope-schema-fixtures.test.js` |
| REQ-kernel-contract-schemas-031 (Non-string detailed_report) | Fixture `non-string-detailed-report.json` con `detailed_report: 123` evaluado contra schema | `valid === false`, identifica error con `rule: "type"` en `/detailed_report` | `node --test scripts/lib/result-envelope-schema-fixtures.test.js` |
| REQ-kernel-contract-schemas-031 (Root schema parity) | Fixtures de whitespace y `detailed_report` evaluados contra `result-envelope.schema.json` | Veredicto idéntico al schema v1 (`valid === false`) | `node --test scripts/lib/result-envelope-schema-fixtures.test.js` |
| REQ-skills-018 (JS runtime detailed_report type check) | Payload con `detailed_report: 123` evaluado en `validateEnvelope` | `valid === false`, error `"detailed_report must be a string"` | `node --test scripts/lib/result-envelope.test.js` |
| REQ-skills-018 (Go runtime detailed_report type check) | Payload con `detailed_report: 123` evaluado en `resultenvelope.Validate` | `valid == false`, error `"detailed_report must be a string"` | `go test -v -run TestValidate_DetailedReport ./internal/resultenvelope/...` |
| REQ-skills-018 (Differential conformance in Node) | Ejecución de suite diferencial sobre toda la matriz incluyendo nuevos fixtures | `schema.valid === js.valid === go.valid` en 100% de los fixtures | `node --test scripts/lib/result-envelope-conformance.test.js` |
| REQ-skills-018 (Differential conformance in Go) | Ejecución de suite diferencial en Go sobre toda la matriz incluyendo nuevos fixtures | Paridad exacta entre Go, JS y Schema en 100% de los fixtures | `go test -v -run TestConformance ./internal/resultenvelope/...` |
| Regresión cero: Kernel y Hooks | Ejecución de pruebas de hooks y reducer de ciclo de vida | 100% pruebas de hooks y reducers pasando sin regresión | `node --test scripts/hooks/subagent-stop.test.js scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` |

## Migration / Rollout

No migration required. Este cambio no modifica almacenamiento duradero, formatos de base de datos ni modelos de datos de cambios previos. Todas las adiciones son puramente restrictivas en validación y aditivas en fixtures y suites de conformidad. Rollback directo y seguro mediante `git revert`.

## Open Questions

None. La especificación técnica y las restricciones de diseño quedan unívocamente fijadas por las especificaciones de cambio y los contratos ya consolidados en el repositorio.
