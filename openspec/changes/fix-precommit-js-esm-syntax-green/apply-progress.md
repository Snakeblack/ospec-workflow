# Apply Progress: fix-precommit-js-esm-syntax-green

## Batch 1 (2026-09-04) — cambio completo

Branch: `fix/precommit-js-esm-syntax-green` (desde `main`)
Commit: `caa3831` — `fix(hooks): valida ESM real en .js y reporta import en .cjs`
Modo: Focused TDD. 10/10 tasks `[x]`.

### Fase 1 (RED)

- 1.1 `[x]` Test nuevo en `scripts/hooks/lib/staged-validator.test.js`:
  `"checkStagedSyntax detects real syntax error in .js ESM via node --check"` —
  `.js` con `import x from 'x'; const broken = ;`, mock de `spawnSync` que
  registra la invocación y retorna `status: 1` + stderr `SyntaxError`.
  RED verificado: `errors.length` era `0` (el `continue` de la línea 189
  salteaba el archivo); `node --check` no se invocaba.
- 1.2 `[x]` Test nuevo: `"checkStagedSyntax reports import statement in .cjs as
  js-syntax error"` — `spawnSync` que falla el test si es llamado.
  RED verificado: `errors.length` era `0` (exención ESM aplicaba a `.cjs`).
- 1.3 `[x]` En RED, los tests existentes de `.js` ESM válido y `.mjs`
  válido/roto siguieron pasando (sólo fallaron los 2 nuevos: 38/40 pass).

### Fase 2 (GREEN)

- 2.1 `[x]` `scripts/hooks/lib/staged-validator.js` bloque `.js`/`.cjs`:
  reemplazado el `continue` incondicional por
  `isEsmModeError && ext === ".js"` → `checkMjsSyntax(repoRoot, file, content, deps)`
  y `errors.push({ ...esmError, type: "js-esm-syntax" })`; luego `continue`.
  Sin cambios de firma.
- 2.2 `[x]` `.cjs` cae al `errors.push({ type: "js-syntax" })` con el mensaje
  "Cannot use import statement outside a module" (descriptivo para CommonJS).
  Sin código adicional.
- 2.3 `[x]` Decisión documentada: `type: "js-esm-syntax"` (remapeo sobre el
  objeto de `checkMjsSyntax`), comunica el camino de validación y evita
  confusión con `.mjs` reales. Reversibilidad alta.
- 2.4 `[x]` GREEN: 40/40 tests en `staged-validator.test.js`.

### Fase 3 (Verificación)

- 3.1 `[x]` `env -u DISABLE_AGENT_SHIELD -u GIT_COLLABORATION_GUARD -u
  TOKEN_ADVISOR npm test` → **tests 3091, pass 3089, fail 0** (2 skipped),
  "All checks passed."
- 3.2 `[x]` Archivos `.js` ESM reales del repo validados vía el camino nuevo
  (`node --check` sobre temporal `.mjs`): ambos OK.
  - `scripts/lib/target-profiles/opencode-plugin.js`
  - `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js`
- 3.3 `[x]` Test de integración incluido (costo bajo):
  `"integration: rejects commit when staged .js ESM has real syntax error"` (exit 1
  con mensaje "Error de sintaxis en archivos staged") y
  `"integration: permits commit when staged .js ESM is valid"` (exit 0).
  `staged-validator.integration.test.js`: 11/11 pass.
  Dogfooding: el commit del fix pasó por el hook pre-commit real del repo
  ("OSPEC-PRECOMMIT: Validación completada. Commit permitido.").

### Archivos tocados

| Archivo | Acción |
|---|---|
| `scripts/hooks/lib/staged-validator.js` | modificado (fallback ESM `.js`, ~10 líneas) |
| `scripts/hooks/lib/staged-validator.test.js` | 2 tests nuevos + mock `spawnSync` en el test preexistente de `.js` ESM válido |
| `scripts/hooks/lib/staged-validator.integration.test.js` | 2 tests de integración nuevos |

### Desviaciones / hallazgos

- Test preexistente `"does not fail on valid ESM import/export syntax in .js"`
  (línea 427) no mockeaba `spawnSync`; tras el fix el archivo pasa por
  `checkMjsSyntax` y el spawn real fallaba en el entorno (ENOENT en sandbox).
  Se actualizó el mock del test (mismo contrato que el test `.mjs` válido);
  es actualización de harness, no de comportamiento.
- Ninguna otra desviación del diseño de exploration.md.
