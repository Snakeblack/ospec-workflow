# Proposal: Lint de contratos unificado (cierre del Bloque 1)

## Intent

El harness declara varios contratos estructurales (tools-vs-skill, commands-vs-routers, presupuestos declarados vs constantes runtime) pero su enforcement vive disperso en tests de contrato puntuales creados ad-hoc en 1.1/1.3, y una clase entera (I1 tools-vs-skill) no tiene enforcement alguno: sus 2 instancias reales se resolvieron moviendo propiedad al orquestador, no con un lint. Objetivo: que "contrato declarado sin enforcement" sea imposible de reintroducir, cruzando TODOS los contratos en un solo mecanismo corrido en pre-commit + CI, listo para que B4 lo consuma.

## Hallazgos de exploración (alcance reducido)

- **Item 2 (J1) ya cubierto de facto**: `scripts/commands-agents-contract.test.js` (1.1) ya valida commands↔`agents:` con guards rel-1/rel-2. Aquí solo se integra/registra en el lint unificado, no se reinventa.
- **Item 3 (I3) ya cubierto de facto**: la coherencia hooks.json↔constantes de lock ya se testea en `scripts/lib/ospec-state.test.js` (líneas 928-957, JS) más la contraparte Go. Aquí se generaliza el patrón "todo presupuesto declarado debe coincidir con su contraparte runtime" y se registra.
- **Item 1 (I1) es el trabajo genuinamente nuevo**: NO existe manifiesto de capacidades por skill ni test tools-vs-skill. Es el núcleo del change.
- **Item 4 (J2) parcial**: la taxonomía de evidencia ya tiene `runtime-test`/`static-proof` (`agents/spec.md`, sdd-verify SKILL, `report-format.md`), pero un contract test estático (grep en node:test) se ejecuta en el runner y se clasificaría como `runtime-test`. Falta la categoría explícita `static-lint`.

## Scope

### In Scope
- **contract-lint unificado** (`scripts/contract-lint.js` o módulo registro) que agrega todos los contratos estructurales bajo un techo, invocable standalone + vía `check.js` (ya cableado a pre-commit y CI `validate-harness.yml`).
- **I1 (nuevo)**: manifiesto declarado de capacidades por skill (`execute`, `mcp`, write-boundary) cruzado contra `tools:` del agente correspondiente.
- **J1/I3**: integrar los tests existentes (commands↔agents, hooks.json↔lock) al lint unificado como contratos registrados, sin duplicar.
- **J2**: categoría `static-lint` distinta de `runtime-test` en la taxonomía de evidencia de sdd-verify; un grep no cuenta como evidencia de comportamiento para escenarios MUST.

### Out of Scope
- B4 headless/CI completo y evals de prompts E2 (Bloque 2).
- Reescribir los tests de 1.1/1.3: se integran, no se reemplazan.

## Capabilities

### New Capabilities
- `contract-lint`: lint estructural unificado que cruza todos los contratos declarados del harness, con manifiesto de contratos registrados, invocable standalone/pre-commit/CI.

### Modified Capabilities
- `skills`: nuevo manifiesto declarado de capacidades por skill (`execute`/`mcp`/write-boundary) como fuente de verdad del contrato I1.
- `agents`: taxonomía de evidencia de sdd-verify distingue `static-lint` de `runtime-test` (J2).

## Approach

Registro declarativo de contratos con checkers puros (entrada: paths/artefactos; salida: offenders). El lint recorre el registro y falla con diagnósticos accionables. Los checkers I3/J1 existentes se adaptan a esa interfaz (thin adapters). El checker I1 lee el manifiesto de cada skill y lo confronta con `tools:` del agente. Se decide en design: (a) invocación (nuevo `contract-lint.js` vs extender `docs-lint.test.js`), (b) manifiesto como frontmatter vs archivo aparte, (c) lint unificado único vs checks compuestos — cada una es candidata a ADR.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/contract-lint.js` | New | Aggregador/registro de contratos |
| `scripts/commands-agents-contract.test.js` | Modified | Integrar al registro |
| `scripts/lib/ospec-state.test.js` | Modified | Generalizar checker I3 |
| `skills/*/SKILL.md` | Modified | Manifiesto de capacidades (I1) |
| `openspec/specs/skills/spec.md` | Modified | Contrato del manifiesto |
| `openspec/specs/agents/spec.md`, `skills/sdd-verify/**` | Modified | `static-lint` (J2) |
| `scripts/check.js` | Modified | Cablear el lint |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Manifiesto I1 mal calibrado marca falsos positivos en skills legítimos | Med | Derivar el manifiesto inicial del estado real (`execute` = skills que corren comandos); test mutation-verified |
| Duplicar en vez de integrar los tests existentes | Med | Adaptar por interfaz; asserts anclados existentes se preservan |
| J2 rompe reportes de verify previos | Low | Aditivo: nueva categoría, no renombra las existentes |

## Rollback Plan

Revertir el commit del lint y su cableado en `check.js`; los tests de contrato preexistentes (1.1/1.3) siguen corriendo autónomos. El manifiesto de capacidades y la categoría `static-lint` se retiran con sus specs delta. Sin migración de datos ni estado persistido: rollback = `git revert`.

## Dependencies

- Ninguna externa. Bloque 1.1/1.2/1.3 ya mergeados (v2.20.3).

## Success Criteria

- [ ] Un solo comando corre todos los contratos y falla ante cualquier violación (pre-commit + CI).
- [ ] Un skill que requiere `execute` sin `execute` en `tools:` del agente hace fallar el lint (I1, mutation-verified).
- [ ] Los contratos J1/I3 corren desde el lint unificado sin perder sus guards actuales.
- [ ] La matriz de verify distingue `static-lint` de `runtime-test`; un grep no satisface un escenario MUST de comportamiento.
