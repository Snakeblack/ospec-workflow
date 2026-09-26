Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

# Tasks: Remediate PP2/CX1 Preflight Gaps

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-lifecycle-kernel-029 / CAS conflict rejection | MUST | `phase-completion-reducer.js`, `phase-completion-reducer.go` | covered-by-design | Sin cambio de contrato; regresión vía suites existentes |
| REQ-lifecycle-kernel-029 / Canonical hash zero-delta replay | MUST | Reducers Node + Go | covered-by-design | Comportamiento actual; mantener tests |
| REQ-lifecycle-kernel-029 / v2.67 insertion-order hash noop Node + Go | MUST | Legacy helper + dual-accept compare; tests con hex fijado | covered-by-design | Escribir solo hash canónico al avanzar |
| REQ-lifecycle-kernel-029 / Unrelated payload Q not noop | MUST | `phase-completion-reducer.test.js`, `phase-completion-reducer_test.go` | covered-by-design | No tratar Q como replay de P |
| REQ-lifecycle-kernel-029 / Interrupted write recovery | MUST | `ospec-state` / journal (sin cambio de API) | covered-by-design | noop-replay no debe reescribir estado |
| REQ-routing-016 / New change persists actual_route | MUST | Contrato de escritura + `route-dispatch-run.js` / validación en lectura | covered-by-design | Continuation ya documentada; reforzar en dispatcher |
| REQ-routing-016 / Missing actual_route fails closed | MUST | `scripts/lib/route-dispatcher.js`, tests | covered-by-design | `route:` presente sin `actual_route` → bloqueo |
| REQ-routing-016 / Pre-policy legacy whole `route` absent | MUST | `route-dispatcher.test.js` fixture dedicado | covered-by-design | Excepción no aplica a omisiones nuevas |
| REQ-install-027 / Claude global root split | MUST | `scripts/validate-phase.js`, `validate-phase.test.js` | covered-by-design | Layout temp plugin ≠ project cwd |
| REQ-install-027 / Second global target (Cursor) | MUST | Misma suite `validate-phase.test.js` | covered-by-design | Misma separación plugin vs workspace |
| REQ-install-027 / Collapsed global openspec rejected | MUST | `validate-phase.js` fail-closed | covered-by-design | openspec solo bajo plugin |
| REQ-install-027 / In-repo roots coincide | MUST | Tests repo-relative existentes | covered-by-design | cwd = repo root sigue válido |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: Flag CLI `--workspace` vs solo `OSPEC_PROJECT_ROOT` — alinear con `scripts/route-dispatch-run.js` en apply

## Consumer Inventory (confirmation only)

| Consumer | Representative path | Relation to this change |
|---|---|---|
| Approvals | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Dual-hash no toma `approvals` del envelope; preserva `current.approvals` |
| Lineage | `scripts/lib/review-lineage.js`, `gates.*` en `state.yaml` | Independiente del hash de replay; sin cambio de API |
| Recovery | Backup `.bak` + journal en proyección interrumpida | Sigue obligatorio; noop-replay no debe mutar ni reescribir |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~300–380 (reducers ~120, validate-phase ~100, routing ~80, inventory ~40) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR on `fix/pp2-cx1-preflight-remediation` |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Dual-hash replay, routing fail-closed, validate-phase roots, inventory | PR 1 | Un solo PR; no tocar `scripts/hooks/ospec-hooks-launch.js` ni su test |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: REQ-lifecycle-kernel-029 — Dual-hash replay (Node + Go)

- [x] 1.1 [RED] En `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js`, añadir fixture de sobre golden con `last_payload_hash` = hex v2.67 (insertion-order `JSON.stringify`) y aserción: replay de P → `noop-replay`, `revision` sin cambio, sin mutación de fases [REQ-lifecycle-kernel-029]
- [x] 1.2 [GREEN] En `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, implementar `legacyV267PayloadHash(envelope)` y dual-accept en compare (`canonical` ∪ `legacy`); en avance CAS persistir **solo** hash canónico [REQ-lifecycle-kernel-029]
- [x] 1.3 [RED] En `internal/hooks/phase-completion-reducer_test.go`, pin del mismo hex Node para el fixture golden; esperar noop-replay y revision estable [REQ-lifecycle-kernel-029]
- [x] 1.4 [GREEN] En `internal/hooks/phase-completion-reducer.go`, serialización legacy con orden de claves congelado (fixtures, no iteración de map) + dual-accept equivalente a Node [REQ-lifecycle-kernel-029]
- [x] 1.5 [RED] Tests Node y Go: payload Q distinto de P cuyo hash no coincide con ninguna forma de P → **no** noop; path reduce/CAS normal [REQ-lifecycle-kernel-029]
- [x] 1.6 [VERIFY] `node --test scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` y `go test ./internal/hooks/ -run PhaseCompletion` [REQ-lifecycle-kernel-029]

## Phase 2: REQ-routing-016 — Persisted `actual_route` y excepción legacy

- [x] 2.1 [RED] En `scripts/lib/route-dispatcher.test.js`, caso policy-bound: `state.yaml` con clave `route:` pero `actual_route` ausente/vacío → fail closed (`missing_actual_route` o equivalente), sin re-select silencioso de tabla [REQ-routing-016]
- [x] 2.2 [RED] Mismo archivo: fixture durable **sin** sección `route:` → excepción legacy permite evaluación de tabla; test separado que la excepción **no** cubre omisión en cambio policy-bound nuevo [REQ-routing-016]
- [x] 2.3 [GREEN] En `scripts/lib/route-dispatcher.js`, implementar distinción `route` ausente entero vs `route` presente sin `actual_route` no vacío según design [REQ-routing-016]
- [x] 2.4 [GREEN] En `scripts/route-dispatch-run.js`, pasar/enforzar política de ruta persistida al leer `state.yaml` si el gap sigue tras 2.3 (sin inventar rutas) [REQ-routing-016]
- [x] 2.5 [VERIFY] `node --test scripts/lib/route-dispatcher.test.js`; si `validate-phase.test.js` incluye policy `actual_route`, ejecutarlo en la misma verificación [REQ-routing-016]

## Phase 3: REQ-install-027 — Raíces plugin vs proyecto en validate-phase

- [x] 3.1 [RED] En `scripts/configure/validate-phase.test.js`, layout global Claude: script bajo temp `pluginRoot`, `cwd` = proyecto con `openspec/` → lee `openspec/config.yaml` y cambios del proyecto, no del plugin [REQ-install-027]
- [x] 3.2 [RED] Layout global Cursor (segundo target): misma separación pluginRoot ≠ projectRoot [REQ-install-027]
- [x] 3.3 [RED] Layout global colapsado (openspec solo bajo plugin): invocación fail closed o rechazo explícito [REQ-install-027]
- [x] 3.4 [GREEN] En `scripts/validate-phase.js`, fijar `pluginRoot = resolve(__dirname, "..")`, `projectRoot = cwd | --workspace | OSPEC_PROJECT_ROOT` (paridad con `route-dispatch-run.js`); rutas `openspec/*` bajo `projectRoot`; `require("./lib/...")` desde plugin [REQ-install-027]
- [x] 3.5 [VERIFY] Caso in-repo cwd = raíz del repo sigue pasando; `node --test scripts/configure/validate-phase.test.js` [REQ-install-027]

## Phase 4: Inventario y cierre

- [x] 4.1 Crear `openspec/changes/remediate-pp2-cx1-preflight-gaps/consumer-inventory.md` con la tabla de confirmación (approvals, lineage, recovery) y nota de no acoplamiento a dual-hash / root split [REQ-lifecycle-kernel-029, REQ-routing-016, REQ-install-027]
- [x] 4.2 [VERIFY] Regresión acotada: suites de Phase 1–3 en verde; confirmar **sin** edits en `scripts/hooks/ospec-hooks-launch.js` ni `ospec-hooks-launch.test.js`
