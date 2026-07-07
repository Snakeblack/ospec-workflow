# Design: Lint de contratos unificado

## Technical Approach

Un registro declarativo de *checkers puros* agrega bajo un mismo techo los tres contratos
estructurales del harness: I1 (tools-vs-skill, nuevo), J1 (commands↔agents, existente) e
I3 (presupuesto-declarado↔constante-runtime, existente). El núcleo es una librería pura
`scripts/lib/contract-lint.js` que expone un registro de checkers con firma uniforme
`check(ctx) → offenders[]` y un agregador `runAllCheckers(ctx)` que ejecuta **todos** los
checkers (sin cortocircuito), acumula offenders y devuelve el conjunto. Un arnés
`node:test` (`scripts/contract-lint.test.js`) invoca el agregador y falla si hay algún
offender — con eso queda cableado a pre-commit y CI sin abrir una vía nueva, porque
`scripts/check.js` ya corre `node --test scripts/**/*.test.js` (REQ-contract-lint-005).

Los checkers J1/I3 no se reimplementan: su lógica probada se **extrae** a funciones checker
reutilizables, y los tests preexistentes (`commands-agents-contract.test.js`,
`ospec-state.test.js`) se adaptan a llamar esas mismas funciones, preservando sus asserts
anclados y guards (REQ-contract-lint-003/004). El checker I1 es el trabajo genuinamente
nuevo: lee `runtime_capabilities:` del frontmatter de cada SKILL.md y lo cruza contra el
`tools:` del agente vinculado (REQ-skills-001, REQ-contract-lint-002). J2 es aditivo: se
inserta el nivel de evidencia `static-lint` en la taxonomía de `sdd-verify` (REQ-skills-002).

## Architecture Decisions

### Decision: Vía de invocación — librería pura + arnés `node:test`, no extender `docs-lint`

**Choice**: Nueva librería `scripts/lib/contract-lint.js` (registro + agregador) consumida por
un arnés `scripts/contract-lint.test.js` que corre bajo `node:test`. Ver ADR-001.
**Alternatives considered**: (a) extender `scripts/docs-lint.test.js`; (b) un CLI nuevo con
su propia entrada en pre-commit/CI.
**Rationale**: `docs-lint.test.js` es un content-lint puntual (tabs en fences YAML + budget
de compact_rules), no un framework de registro; acoplar contratos estructurales ahí mezcla
responsabilidades. El glob `scripts/**/*.test.js` de `check.js` ya recoge cualquier
`*.test.js`, así que el arnés queda en pre-commit + CI sin tocar `hooks.json` ni el workflow
(REQ-contract-lint-005 prohíbe vía nueva). El standalone se cubre con
`node --test scripts/contract-lint.test.js`.

### Decision: Formato/ubicación del manifiesto — block map anidado en el frontmatter de SKILL.md

**Choice**: Bloque YAML anidado en el frontmatter existente. Ver ADR-002.

```yaml
runtime_capabilities:
  execute: true
  mcp: false
  write: true
```

**Alternatives considered**: (a) archivo `.capabilities.yaml` junto al SKILL.md; (b) inline
flow map en una línea `runtime_capabilities: { execute: true, ... }`.
**Rationale**: El spec fijó el nombre `runtime_capabilities:`; queda elegir mecanismo. Un
archivo aparte duplica la unidad skill y complica el fingerprint del registry. El frontmatter
es la fuente de verdad natural (junto a `name`/`license`/`capabilities`). `frontmatter.js`
no hace deep-parse de block maps (guarda las líneas hijas en `rawLines`), así que el checker
I1 parsea esas `rawLines` con un lector mínimo (`^\s+(execute|mcp|write):\s*(true|false)`);
el block map anidado es más legible que el flow map inline y es el idioma que ya emite
`setBlockMap`.

### Decision: Registro unificado de checkers puros; reutilizar J1/I3 por extracción

**Choice**: Un agregador único sobre un registro de checkers puros; J1/I3 se integran
extrayendo su lógica a funciones checker que tanto el agregador como los tests legacy invocan.
Ver ADR-003.
**Alternatives considered**: (a) checks compuestos independientes sin agregador común; (b) el
agregador reimplementa su propia verificación equivalente a J1/I3.
**Rationale**: El intent es reutilizar/envolver, no reimplementar (REQ-contract-lint-003/004
lo exigen: "adapt via a thin interface, not reimplement"). Extraer la lógica a una función
compartida evita duplicación y hace que los guards (rel-1/rel-2 de J1; techo/piso de I3)
vivan en un solo lugar. El agregador sin cortocircuito satisface REQ-contract-lint-001.

## Data Flow

```
scripts/check.js  ──(node --test scripts/**/*.test.js)──► contract-lint.test.js
                                                                │
                                                                ▼
                                              scripts/lib/contract-lint.js
                                                   runAllCheckers(ctx)
                                                        │  (no short-circuit)
                          ┌─────────────────────────────┼─────────────────────────────┐
                          ▼                              ▼                              ▼
                   checkI1Manifest            checkCommandsAgents (J1)        checkBudgetConstant (I3)
                    SKILL.md frontmatter        Command Roster + agents:        hooks.json + ospec-state.js
                    × agents/*.tools:           allowlist (rel-1/rel-2)         LOCK_* constants
                          │                              │                              │
                          └─────────────► offenders[] {checker, path, expected, actual} ◄┘
                                                        │
                          reusan la misma función ◄─────┤
        commands-agents-contract.test.js ──────────────┤
        ospec-state.test.js (I3) ──────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/contract-lint.js` | Create | Registro de checkers + `runAllCheckers`; tipo offender `{checker, path, expected, actual, message}` |
| `scripts/lib/contract-checkers/i1-manifest.js` | Create | Checker I1: parsea `runtime_capabilities:` y cruza contra `tools:` del agente vinculado (dir. a y b) |
| `scripts/lib/contract-checkers/j1-commands-agents.js` | Create | Función checker extraída de la lógica de roster/allowlist (rel-1/rel-2) |
| `scripts/lib/contract-checkers/i3-budget-constant.js` | Create | Función checker generalizada budget-declarado↔constante-runtime (par de referencia: SessionStart↔LOCK_*) |
| `scripts/contract-lint.test.js` | Create | Arnés `node:test` que corre el agregador y falla ante cualquier offender; incluye caso mutation-verified I1 |
| `scripts/commands-agents-contract.test.js` | Modify | Adaptar a llamar `j1-commands-agents.check`, preservando asserts anclados (sdd-document, rel-1/rel-2) |
| `scripts/lib/ospec-state.test.js` | Modify | Adaptar el test I3 (~928-957) a llamar `i3-budget-constant.check`, preservando techo/piso |
| `skills/sdd-{phase}/SKILL.md` (×14) | Modify | Agregar bloque `runtime_capabilities:` calibrado al estado real (ver tabla abajo) |
| `openspec/specs/skills/spec.md` | Modify | Aplicar delta ADDED (manifiesto I1 + nivel `static-lint`) |
| `skills/sdd-verify/SKILL.md` | Modify | Insertar `static-lint` entre `static-proof` e `inspection-proof` + regla de compliance |
| `skills/sdd-verify/references/report-format.md` | Modify | Agregar `static-lint` a la lista de Evidence Levels |
| `scripts/check.js` | No change | Ya corre el glob de tests; no requiere modificación (contradice el proposal, ver nota) |

Nota sobre `check.js`: el proposal lo listó como "Modified", pero el glob `scripts/**/*.test.js`
ya recoge el nuevo arnés sin editar `check.js`. Se mantiene sin cambios salvo que se decida un
step standalone explícito; `sdd-tasks` debe reconciliar esto.

## Interfaces / Contracts

Firma uniforme de checker (pura, sin side-effects, sin I/O de red):

```js
// ctx = { root } — el checker resuelve sus propios paths desde root
// offender = { checker: string, path: string, expected: string, actual: string, message: string }
function check(ctx) { /* ... */ return offenders; } // [] = pass
```

Agregador:

```js
function runAllCheckers(ctx) {
  const registry = [checkI1Manifest, checkCommandsAgents, checkBudgetConstant];
  return registry.flatMap((c) => c(ctx)); // corre TODOS, sin cortocircuito
}
```

Manifiesto I1 — mapeo de capacidad abstracta → tool de agente (dir. a): `execute→execute`,
`write→edit`. `mcp` no tiene contraparte de tool en ningún agente hoy; dir. (a) para `mcp:true`
quedaría inerte (ningún phase skill lo declara). Dir. (b) solo evalúa los tools `execute` y
`edit` presentes en el grant del agente; `read`/`search`/`agent`/`vscode/askQuestions` están
fuera del contrato de capacidades.

Set de phase skills (dir. b aplica) = los 14 canónicos de §1.1 del `skills` spec:
`sdd-apply, sdd-archive, sdd-baseline, sdd-clarify, sdd-design, sdd-explore, sdd-foundation,
sdd-init, sdd-onboard, sdd-propose, sdd-spec, sdd-tasks, sdd-verify, sdd-workspace`.
`sdd-document`, `sdd-reconcile` y `review-*` NO integran los 14 → tratados como opcionales
(solo dir. a si declaran algo). El checker deriva la membresía de este set canónico
(autoridad: §1.1), no de un heurístico de prefijo.

Calibración inicial del manifiesto (derivada del `tools:` real de cada agente; todos tienen
`edit` → `write: true`; `execute` solo los 6 agentes que lo declaran):

| Phase skill | execute | write | (mcp) |
|-------------|:---:|:---:|:---:|
| sdd-apply, sdd-baseline, sdd-init, sdd-onboard, sdd-verify, sdd-workspace | true | true | false |
| sdd-archive, sdd-clarify, sdd-design, sdd-explore, sdd-foundation, sdd-propose, sdd-spec, sdd-tasks | false | true | false |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Cada checker puro con fixtures in-memory/tmp (offender esperado vs vacío) | `node:test` con dirs temporales |
| Unit | I1 mutation-verified: skill con `execute:true` sin `execute` en agente → 1 offender; revertir → pass | `node:test` round-trip (REQ-contract-lint-002) |
| Unit | Agregador sin cortocircuito: un checker falla, los demás igual corren | inyectar checker fallido + verificar que todos se ejecutaron |
| Contract | J1 preserva rel-1/rel-2 y assert anclado (sdd-document) tras la extracción | reejecutar el test legacy adaptado |
| Contract | I3 preserva techo (≤ timeout) y piso (≥ retry floor) tras la extracción | reejecutar el test legacy adaptado |
| Integration | El arnés corre dentro de `check.js` (pre-commit/CI) sin nueva vía | correr `node scripts/check.js` |

`static-lint` (J2) no tiene test de runtime: es un cambio de prosa en la taxonomía; se valida
por inspección de que `sdd-verify` clasifica estos findings como `static-lint`.

## Migration / Rollout

No migration required. Rollback = `git revert` del commit del lint + su cableado; los tests
J1/I3 legacy siguen autónomos (adaptados por interfaz, no eliminados). El manifiesto y
`static-lint` se retiran con sus specs delta. Sin estado persistido ni datos.

## Open Questions

- [ ] `check.js`: ¿mantener solo el arnés `node:test` (recomendado) o agregar además un CLI
      standalone explícito? El proposal listó `check.js` como Modified; el diseño no lo
      requiere. `sdd-tasks` debe fijar el alcance exacto del cableado.
