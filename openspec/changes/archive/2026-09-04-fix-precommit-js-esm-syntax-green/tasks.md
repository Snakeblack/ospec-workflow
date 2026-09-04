# Tasks: fix-precommit-js-esm-syntax-green

## Change Contract (ruta bugfix — exploration.md como contrato)

- Change class: small (bugfix quirúrgico, 1 punto de fix)
- Behavioral contract: en el fast pre-commit hook, un `.js` cuyo `vm.Script` falla sólo por
  modo ESM se valida con `node --check` vía temporal `.mjs` (reutilizando
  `checkMjsSyntax`, `scripts/hooks/lib/staged-validator.js:123-155`); un error real de
  sintaxis en ese archivo cancela el commit. `import`/`export` en `.cjs` se reporta como
  error (sin exención ESM). Alinea el código con REQ-git-precommit-hook-001
  (`openspec/specs/git-precommit-hook/spec.md:27-28`); sin delta de spec.
- Acceptance checks:
  1. `.js` con `import` válido + error de sintaxis real → hook reporta error y falla.
  2. `.cjs` con `import` → hook reporta error (`type: "js-syntax"`) y falla.
  3. `.js` ESM válido (p.ej. `scripts/lib/target-profiles/opencode-plugin.js`) sigue pasando.
  4. Suite completa `npm test` verde.
- Escalation trigger: si el fallback `.js`→`node --check` requiere cambios en firma de
  `checkMjsSyntax` o toca findAffectedTargets/parsers, escalar a full SDD.

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-git-precommit-hook-001 / commit con error sintáctico real en `.js` ESM MUST cancelarse | MUST | `scripts/hooks/lib/staged-validator.js:181-192`, fallback `checkMjsSyntax` | covered-by-design | patrón propuesto íntegro en exploration.md:37-54 |
| REQ-git-precommit-hook-001 / `.cjs` es JavaScript a validar (sin exención ESM) | MUST | mismo bloque; `.cjs` cae a `errors.push(..., type: "js-syntax")` | covered-by-design | exención `continue` sólo aplicable a `.js` |
| `.js` ESM legítimo sigue pasando | MUST | `checkMjsSyntax` valida como módulo real → `null` | covered-by-design | riesgo 1 de exploration.md verificado con test de regresión |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: remapeo de `type` para `.js` ESM (`js-esm-syntax` vs `mjs-syntax`)
  — decisión menor de diseño, resuelta en task 2.3 (no contractual, no bloquea).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~70-100 (≈20-30 en `staged-validator.js`, ≈50-70 en tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | PR único |
| Delivery strategy | exception-ok (no se alcanza el presupuesto) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fix hook + tests de regresión + suite verde | PR 1 (único) | base `main`; un solo commit `fix(hooks): ...` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Tests de regresión (RED)

- [x] 1.1 En `scripts/hooks/lib/staged-validator.test.js` (patrón mock existente de líneas
      427-472), añadir test: archivo staged `["module.js"]` con contenido
      `"import x from 'x';\nconst broken = ;"`, `deps.getStagedContent` devolviendo ese
      contenido y `deps.spawnSync` mock que retorna `{ status: 1, stderr: "SyntaxError: ... }"`
      y registra la invocación → esperar `errors.length === 1` y que `node --check` FUE
      invocado (`process.execPath`, `args[0] === "--check"`). Verificar que falla contra el
      código actual (hoy el `continue` en línea 189 lo saltea). [REQ-git-precommit-hook-001]
- [x] 1.2 En el mismo archivo, añadir test: `["module.cjs"]` con contenido
      `"import x from 'x';"`, `deps.spawnSync` que falla el test si es llamado → esperar
      `errors.length === 1` con `type: "js-syntax"` y mensaje que mencione el import
      statement. Verificar que falla contra el código actual (hoy hace `continue`).
      [REQ-git-precommit-hook-001]
- [x] 1.3 Confirmar que el test existente de `.js` ESM válido / `.mjs` válido (líneas
      438-472) sigue pasando en RED (no debe romperse por los tests nuevos).

## Phase 2: Fix del hook (GREEN)

- [x] 2.1 En `scripts/hooks/lib/staged-validator.js:181-192`, reemplazar el `continue`
      incondicional: si el error de `vm.Script` es de modo ESM Y `ext === ".js"`, llamar
      `checkMjsSyntax(repoRoot, file, content, deps)` y hacer `errors.push(esmError)` si
      retorna error; luego `continue`. Sin cambiar firmas públicas. [REQ-git-precommit-hook-001]
- [x] 2.2 Verificar que `.cjs` ya no entra en la exención: con la condición
      `isEsmModeError && ext === ".js"`, el `.cjs` con `import` cae al
      `errors.push({ file, error: err.message, type: "js-syntax" })` (línea 191). Sin código
      adicional para `.cjs`. [REQ-git-precommit-hook-001]
- [x] 2.3 Decisión de diseño menor — remapear el `type` del error para el fallback `.js` ESM:
      usar `"js-esm-syntax"` (recomendado: comunica el camino de validación y evita confusión
      con archivos `.mjs` reales) aplicado sobre el objeto retornado por `checkMjsSyntax`
      antes del `errors.push`. Documentar la elección en el mensaje de commit.
      Reversibilidad alta; no contractual.
- [x] 2.4 Correr los tests de Fase 1: los 2 tests nuevos deben pasar (GREEN) y los tests
      existentes de sintaxis staged seguir verdes.

## Phase 3: Verificación de suite y regresión end-to-end

- [x] 3.1 Correr `npm test` completo (recordar `env -u DISABLE_AGENT_SHIELD -u
      GIT_COLLABORATION_GUARD -u TOKEN_ADVISOR` si se ejecutan hooks en el entorno) →
      suite completa verde.
- [x] 3.2 Verificar los archivos `.js` ESM reales del repo
      (`scripts/lib/target-profiles/opencode-plugin.js`,
      `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js`): simulando
      staging de esos blobs, el hook debe pasarlos vía `node --check` (riesgo 1 de
      exploration.md).
- [x] 3.3 (Opcional, si el costo es bajo) Test de integración en
      `scripts/hooks/lib/staged-validator.integration.test.js` con `setupEphemeralRepo`:
      staged `.js` ESM roto → hook exit != 0. Si se omite, dejarlo anotado en
      apply-progress.
