# Design: Remediación Quirúrgica K6c de Integridad de Specs y Runner Seam

## Technical Approach

Este diseño técnico aborda de forma quirúrgica dos fallas críticas de integridad en el subsistema K6c identificadas en el análisis post-archivado:
1. **Corrupción y truncamiento de especificaciones**: Restauración canónica de `openspec/specs/adversarial-challenges/spec.md` (reincorporando `REQ-003` y `REQ-004` íntegros y eliminando el token espurio `undefined`) e implementación de validación fail-closed en el archivador (`archive-plan.js` y `archive-transaction.js`) para impedir que futuros archivados emitan especificaciones corruptas o eliminen IDs de requisitos sin declaración explícita.
2. **Eliminación del seam de evasión en el runner adversarial**: Eliminación de la lectura de `context.runWorkspaceTests` en `executeChallengePlan` y `runIsolatedMutation` (`runner.js`), confinando la ejecución de pruebas contra candidatos mutados estrictamente al sandbox de procesos aislados (`executeSandboxedCommand`), permitiendo inyección de mocks únicamente mediante parámetro posicional directo `_testRunner` en pruebas unitarias internas.

El enfoque se ajusta estrictamente a los delta specs:
- `openspec/changes/k6c-spec-integrity-and-runner-seam-remediation/specs/adversarial-challenges/spec.md` (`REQ-adversarial-challenges-003`, `REQ-adversarial-challenges-004`)
- `openspec/changes/k6c-spec-integrity-and-runner-seam-remediation/specs/archive-plan-contract/spec.md` (`REQ-archive-plan-contract-002`, `REQ-archive-plan-contract-003`)
- `openspec/changes/k6c-spec-integrity-and-runner-seam-remediation/specs/archive-transaction-runtime/spec.md` (`REQ-archive-transaction-runtime-001`)

---

## Architecture Decisions

### Decision: Confinamiento de Ejecución Sandboxed y Eliminación del Seam de Contexto

| Opción | Tradeoff | Decisión |
|---|---|---|
| A. Mantener `context.runWorkspaceTests` con flag de verificación | Permite flexibilidad pero mantiene superficie de ataque abierta ante contextos comprometidos | Rechazada |
| B. Confinar `executeChallengePlan` a sandbox real y pasar `_testRunner` como parámetro opcional directo en `runIsolatedMutation` | Aísla la API pública de ejecución sin romper la testabilidad unitaria interna de errores de bajo nivel | **Aceptada (ADR-001)** |

**Choice**: Eliminar `context.runWorkspaceTests` de `executeChallengePlan` y `runIsolatedMutation`. `executeChallengePlan` invoca siempre el runner aislado real (`runWorkspaceTests` -> `executeSandboxedCommand`). La función `runIsolatedMutation` acepta un parámetro directo `_testRunner = runWorkspaceTests` sólo para pruebas unitarias internas de fallos de proceso (ej. `spawn_error`, `timeout`).
**Alternatives considered**: Permitir que `context` sobreescriba el runner si un flag de pruebas está activo (rechazado por vulnerabilidad de seam injection).
**Rationale**: Garantiza que ningún llamador pueda falsificar resultados de challenges adversariales inyectando mocks en el contexto de ejecución.

### Decision: Validación Fail-Closed de Integridad Sintáctica y Retención de REQ IDs en Archive

| Opción | Tradeoff | Decisión |
|---|---|---|
| A. Parseo AST completo de Markdown en archive | Alta complejidad y dependencias pesadas innecesarias en un validador puro | Rechazada |
| B. Validación pura por regex de tokens de corrupción y extracción de anchors `{#REQ-...}` en snapshot | Cero dependencias externas, determinismo total y rendimiento instantáneo en preflight | **Aceptada (ADR-002)** |

**Choice**: Extender `validatePlanAgainstSnapshot` en `scripts/lib/archive-plan.js` para validar:
1. Ausencia de tokens corruptos (`/^\s*undefined\s*$/m`, `[object Object]`, etc.) en especificaciones preparadas (`corrupted-spec-content`).
2. Retención de todos los IDs `{#REQ-...}` presentes en `target_before` a menos que estén explícitamente listados bajo `## REMOVED Requirements` (`dropped-requirement-id`).
Incorporar ambos códigos a la lista inmutable `PLAN_REJECTION_CODES`.
**Alternatives considered**: Inspección semántica por LLM durante el archivado (rechazada por no-determinismo y costo).
**Rationale**: Impide fallos silenciosos de serialización o truncamiento involuntario durante la fusión de especificaciones canónicas.

### Decision: Auditoría Global de Invariantes de Especificación en CI

| Opción | Tradeoff | Decisión |
|---|---|---|
| A. Script independiente de linting ejecutado sólo en pre-commit | Riesgo de drift si los desarrolladores usan `--no-verify` | Rechazada |
| B. Test de invariantes integrado en `scripts/manifest-sync.test.js` | Se ejecuta automáticamente en cada corrida de `npm test` y CI | **Aceptada** |

**Choice**: Añadir un test en `scripts/manifest-sync.test.js` que recorre todas las especificaciones canónicas en `openspec/specs/**/spec.md`, comprobando la presencia de requisitos válidos `{#REQ-...}` y la ausencia de tokens espurios `undefined`.
**Rationale**: Asegura la integridad continua de la base documental canónica sin requerir herramientas externas.

---

## Data Flow

### 1. Flujo de Transacción de Archivo con Validación de Integridad

```
archive-plan.json + Snapshot (preparedTexts, targetTexts)
              │
              ▼
   ┌────────────────────────────────────────────────────────┐
   │ validatePlanAgainstSnapshot (archive-plan.js)           │
   │  1. Check Hashes (content_sha256, target_before_sha256)│
   │  2. Check Inventory & Fingerprints                     │
   │  3. Check Corrupted Tokens (corrupted-spec-content)    │
   │  4. Check REQ ID Retention (dropped-requirement-id)    │
   └──────────────────────────┬─────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │ OK                                │ Fallo
            ▼                                   ▼
┌───────────────────────────┐       ┌───────────────────────────┐
│ Staging & Atomic Commit   │       │ Abort Fail-Closed         │
│ (.ospec/archive-tx/...)   │       │ Origin Intact             │
│ Compare A & B             │       │ Rejection Codes Emitted   │
│ Delete origin on match    │       └───────────────────────────┘
└───────────────────────────┘
```

### 2. Flujo de Ejecución de Challenges Adversariales Confinados

```
executeChallengePlan(plan, context)
              │
              ├─► validateChallengePlan & capability check
              ├─► materializeChallengeWorkspace (ephemeral sandbox)
              │
              ▼
runIsolatedMutation(type, workspace, context, scope, signal, timeoutMs, tracker, plan, _testRunner = runWorkspaceTests)
              │
              ├─► test-inspection: inspectTestAssertions (AST / checks)
              ├─► focal-mutation / revert:
              │     1. Mutate / revert workspace files
              │     2. _testRunner(workspace, context, signal, timeoutMs)
              │          └─► executeSandboxedCommand (NODE_TEST_CONTEXT: "")
              │     3. Restore original files in finally block
              │     4. Evaluate pass/fail/complacent
              │
              ▼
Challenge Result Record (challenge-result/v1)
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/specs/adversarial-challenges/spec.md` | Modify | Restaurar `REQ-adversarial-challenges-003` y `REQ-adversarial-challenges-004` completos; eliminar token `undefined` |
| `scripts/lib/archive-plan.js` | Modify | Añadir códigos `corrupted-spec-content` y `dropped-requirement-id` a `PLAN_REJECTION_CODES`, e implementar validación de contenido en `validatePlanAgainstSnapshot` |
| `scripts/lib/archive-plan.test.js` | Modify | Tests unitarios para `corrupted-spec-content`, `dropped-requirement-id` y allowlist actualizada |
| `scripts/lib/archive-transaction.js` | Modify | Pasar textos de especificaciones (`preparedTexts`, `targetTexts`) en `buildSnapshot` hacia `validatePlanAgainstSnapshot` |
| `scripts/lib/adversarial-challenges/runner.js` | Modify | Eliminar `context.runWorkspaceTests` en `runIsolatedMutation` y `executeChallengePlan`; exponer `_testRunner` como parámetro opcional en `runIsolatedMutation` |
| `scripts/lib/adversarial-challenges/runner.test.js` | Modify | Actualizar tests unitarios de `runIsolatedMutation` con `_testRunner` y añadir test adversarial verificando que `executeChallengePlan` ignora mocks de contexto |
| `scripts/manifest-sync.test.js` | Modify | Añadir test de invariante que audita integridad sintáctica y retención de REQ IDs en todas las specs canónicas |
| `openspec/changes/k6c-spec-integrity-and-runner-seam-remediation/decisions/adr-001.md` | Create | ADR para confinamiento de runner y eliminación del seam de contexto |
| `openspec/changes/k6c-spec-integrity-and-runner-seam-remediation/decisions/adr-002.md` | Create | ADR para validación fail-closed de integridad de specs en archive |

---

## Interfaces / Contracts

### 1. Rejection Codes y Helpers de Integridad en `archive-plan.js`

```javascript
const PLAN_REJECTION_CODES = Object.freeze([
  "invalid-schema",
  "invalid-rollback-strategy",
  "missing-reference",
  "hash-mismatch",
  "inventory-mismatch",
  "change-name-mismatch",
  "corrupted-spec-content",
  "dropped-requirement-id",
]);

function extractRequirementIds(markdownText) {
  if (typeof markdownText !== "string") return new Set();
  const matches = markdownText.match(/\{#(REQ-[a-zA-Z0-9_-]+)\}/g) || [];
  return new Set(matches.map((m) => m.slice(2, -1)));
}

function extractRemovedRequirementIds(markdownText) {
  if (typeof markdownText !== "string") return new Set();
  const removedMatch = markdownText.match(/## REMOVED Requirements([\s\S]*?)(?=(?:^## [A-Z])|$)/m);
  if (!removedMatch) return new Set();
  const text = removedMatch[1];
  const ids = new Set();
  for (const m of text.matchAll(/\{#(REQ-[a-zA-Z0-9_-]+)\}/g)) ids.add(m[1]);
  for (const m of text.matchAll(/\b(REQ-[a-zA-Z0-9_-]+)\b/g)) ids.add(m[1]);
  return ids;
}

function hasCorruptedSpecContent(text) {
  if (typeof text !== "string") return false;
  if (/^\s*undefined\s*$/m.test(text)) return true;
  if (/\[object Object\]/.test(text)) return true;
  return false;
}
```

### 2. Confinamiento de Firma en `runner.js`

```javascript
// Firma de runIsolatedMutation: _testRunner es el 9º argumento para tests unitarios internos
async function runIsolatedMutation(
  type,
  workspace,
  context,
  scope,
  signal,
  timeoutMs,
  tracker,
  plan,
  _testRunner = runWorkspaceTests
) {
  // ...
  // En ramas "revert" y "focal-mutation", se invoca estrictamente _testRunner:
  const testRunner = typeof _testRunner === "function" ? _testRunner : runWorkspaceTests;
  const run = await testRunner(workspace, context, signal, timeoutMs);
  // ...
}

// En executeChallengePlan:
const isolated = await runIsolatedMutation(
  type,
  workspace,
  context,
  scope,
  controller.signal,
  remaining,
  tracker,
  plan
  // No se pasa _testRunner; toma por defecto runWorkspaceTests con executeSandboxedCommand
);
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Detección de `corrupted-spec-content` y `dropped-requirement-id` en `archive-plan.js` | Tests sintéticos con snapshots que contienen `undefined` o eliminan `{#REQ-demo-001}` sin declaración REMOVED en `archive-plan.test.js` |
| Unit | Errores de ejecución (`spawn_error`, `timeout`) en `runIsolatedMutation` | Invocar `runIsolatedMutation` pasando mock `_testRunner` directo en `runner.test.js` |
| Integration | Inmunidad de `executeChallengePlan` contra mocks en contexto | Pasar candidato complaciente y `context.runWorkspaceTests` simulando fallo en `runner.test.js`; verificar que `executeChallengePlan` corre el sandbox real y detecta `COMPLACENT_TEST_DETECTED` |
| Integration | Preflight fail-closed en transacción de archive con spec corrupta | Ejecutar `runArchiveTransaction` con plan que contiene spec corrupta en `archive-transaction.test.js`; verificar rechazo antes de staging/commit y preservación íntegra de origin |
| Invariant | Auditoría de integridad de todas las specs canónicas | Test en `manifest-sync.test.js` que verifica que cada archivo `openspec/specs/**/spec.md` carece de tokens `undefined` y retiene sus REQ IDs requeridos |

---

## Migration / Rollout

No requiere migración de base de datos ni feature flags. La remediación es inmediata y estrictamente retrocompatible con las herramientas y flujos de trabajo de OpenSpec existentes.

---

## Open Questions

None.
