# Tasks: Guard de interop WSL para el CLI claude y expectativa de modelo opencode

## Lite Change Contract

- Change class: small
- Behavioral contract: el precommit (`node scripts/check.js`) pasa en WSL tratando un binario `claude` resuelto bajo `/mnt/<letra>/` en `linux` como no disponible (degrade fail-soft a generación sin validación claude) y fijando la expectativa del tier light opencode en `zai-coding-plan/glm-5.3-flash` contra el `models.yaml` staged.
- Acceptance checks (de `proposal-lite.md`):
  - [AC-1] En WSL, `node scripts/check.js` termina en "All checks passed" (claude sin validador, nota de CLI no disponible).
  - [AC-2] `node --test` focalizado de los 5 archivos de test afectados pasa; el test del tier light espera `zai-coding-plan/glm-5.3-flash`.
  - [AC-3] En Linux nativo/CI sin montajes `/mnt`, el guard es no-op (comportamiento sin cambios).
  - [AC-4] Commit único Conventional Commits (español imperativo, sin atribución de IA) con `models.yaml` + tests + guard.
- Escalation trigger: si el guard exige conversión `wslpath` de rutas, cambios en `scripts/configure/__fixtures__/**`, o targets distintos de claude → escalar a SDD estándar.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~90-130 (models.yaml 6 staged; cli.js ~15; check.js ~12; tests ~55-80; sdd-document.test.js 1) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | PR único en rama `fix/wsl-claude-interop-guard` con 1 commit (work unit) |
| Delivery strategy | exception-ok |
| Chain strategy | pending |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Guard interop + expectativa modelo + tests + `models.yaml` staged, en un solo commit | PR 1 | La propuesta exige commit único; bajo presupuesto de 400 líneas, sin chain |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Preparación de rama

- [x] 1.1 Crear rama `fix/wsl-claude-interop-guard` desde el HEAD actual (`git checkout -b fix/wsl-claude-interop-guard`), que preserva `models.yaml` staged. Base = HEAD (7703090), NO main: main está 2 commits atrás y el índice staged debe sobrevivir al checkout; rebase a main es posible antes del PR. [AC-4] ← rama ya creada por el orquestador desde HEAD 4398b19 (3 commits cx0 preservados); verificada activa y ≠ main
- [x] 1.2 Confirmar el diff staged de `models.yaml` (`git diff --cached models.yaml`, 3+/3−: tier light opencode → `zai-coding-plan/glm-5.3-flash`) sin editar el archivo. [AC-2] ← verificado: 3+/3−, light y default ahora `zai-coding-plan/glm-5.3-flash`

## Phase 2: Predicado compartido y guard en cli.js (TDD RED→GREEN)

- [x] 2.1 RED: en `scripts/configure/cli.test.js` añadir tests unitarios del predicado exportado desde `scripts/configure/cli.js`: `/mnt/c/Users/x/claude.exe` en linux → `true`; `/usr/bin/claude` → `false`; ruta `/mnt` en win32 → `false`. Ejecutar `node --test scripts/configure/cli.test.js` y registrar evidencia RED (export inexistente). [AC-3] ← RED: `TypeError: isWindowsInteropPath is not a function`
- [x] 2.2 GREEN: en `scripts/configure/cli.js` definir el predicado (p. ej. `isWindowsInteropPath(p)`: `process.platform === "linux"` + `/^\/mnt\/[a-z]\//`) junto a `resolveBinFromPath` (línea ~363) y añadirlo a `module.exports` (línea ~640). Re-ejecutar el test focalizado (GREEN). [AC-3] ← GREEN: 36/36
- [x] 2.3 RED: en `scripts/configure/cli.test.js` añadir test de invariante: `resolveClaudeBin()` en linux nunca devuelve una ruta bajo `/mnt/<letra>/`. RED esperado en este entorno WSL (claude resuelve a `/mnt/c/...`); en CI nativo sin claude pasa trivialmente (null). [AC-1, AC-3] ← RED real: devolvió `/mnt/c/Program Files/nodejs/claude`
- [x] 2.4 GREEN: en `resolveClaudeBin()` (cli.js:385-400): si `resolved` cumple el predicado → `return null`; conservar el fallback WinGet de `win32` intacto. Re-ejecutar 2.1-2.3. [AC-1] ← GREEN
- [x] 2.5 RED: en `scripts/configure/cli.test.js` añadir test de `defaultRunValidator` (perfil claude) con `process.env.PATH` vacío (guardar/restaurar): debe devolver resultado fail-soft (`status: 0`, stdout con nota de skip, precedente `selective-4r-parity.test.js:16-17`) sin spawn del bare `claude`. Hoy devuelve `status: 1` por error de spawn → RED portable en cualquier máquina. [AC-1] ← RED real: `{status: 1, stderr: "spawnSync claude ENOENT"}`
- [x] 2.6 GREEN: en `defaultRunValidator` (cli.js:411-416): cuando `command === "claude"` y `resolveClaudeBin()` devuelve `null`, devolver `{status: 0, stdout: "claude validator skipped: no usable native binary\n", stderr: ""}` sin spawn (fijar texto exacto en el test). [AC-1] ← GREEN

## Phase 3: Consumidores del predicado (TDD RED→GREEN)

- [x] 3.1 RED: en `scripts/check.test.js` añadir casos de `claudeCliAvailable(deps)` con `deps.resolveClaudeBin` inyectado: ruta `/mnt/...` → `false`; `null` → `false`; `/usr/bin/claude` + probe `--version` OK → `true`. [AC-1, AC-3] ← RED: interop devolvía `true !== false`; los otros 2 casos pre-verdes
- [x] 3.2 GREEN: en `claudeCliAvailable()` (check.js:36-45): resolver la ruta real vía `resolveClaudeBin` importado de `./configure/cli.js` (DI por `deps`); `null` o interop → `false`; si no, conservar el probe `--version` existente. [AC-1] ← GREEN: 8/8
- [x] 3.3 En `scripts/configure/e2e.test.js`: resolver la ruta real de claude (mismo `resolveClaudeBin` + predicado importados) y condicionar el `skip` del test e2e (líneas 39-53) a binario utilizable; skip con razón "claude interop de Windows bajo /mnt" cuando corresponda. Verificar con `node --test scripts/configure/e2e.test.js` (debe saltarse en WSL, no fallar). [AC-1] ← verificado: 1 skip con la razón exacta + 1 pass (codex); clasificación desde `resolveBinFromPath` crudo porque `resolveClaudeBin()` post-guard ya anonima el motivo
- [x] 3.4 RED→GREEN: en `scripts/sdd-document.test.js:266` cambiar `"openai/gpt-5.6-luna"` → `"zai-coding-plan/glm-5.3-flash"`; evidencia RED con `node --test scripts/sdd-document.test.js` contra el `models.yaml` staged antes de editar. [AC-2] ← RED real (1 fail) → GREEN 33/33
- [x] 3.5 Confirmar que `scripts/selective-4r-parity.test.js` no requiere edición: su fail-soft (líneas 14-23) ya sintetiza éxito cuando `resolveClaudeBin()` es `null`; ejecutar el test focalizado. [AC-2] ← sin edición; pass en la corrida focalizada conjunta

## Phase 4: Verificación y commit único

- [x] 4.1 Verificación focalizada (evitar suite completa por I/O lento en /mnt/c): `node --test scripts/configure/cli.test.js scripts/check.test.js scripts/selective-4r-parity.test.js scripts/configure/e2e.test.js scripts/sdd-document.test.js` — todo en verde. [AC-2] ← 82 tests: 81 pass, 0 fail, 1 skip (e2e claude interop)
- [x] 4.2 Verificación integradora en WSL (una sola vez, al final; >4-5 min): `node scripts/check.js` termina en "All checks passed" con nota de claude CLI no disponible. [AC-1] ← "All checks passed." con `claudeCliAvailable() => false` (nota de degradación activa)
- [x] 4.3 Confirmar no-op en Linux nativo/CI por lectura del diff: el guard solo altera comportamiento con rutas `/mnt` (tests del predicado cubren win32 y linux nativo). [AC-3] ← guard condicionado a `platform === "linux"` + regex `/mnt/<letra>/`; win32 y rutas nativas sin cambio
- [x] 4.4 Commit único del work unit: `git add models.yaml scripts/sdd-document.test.js scripts/check.js scripts/check.test.js scripts/configure/cli.js scripts/configure/cli.test.js scripts/configure/e2e.test.js scripts/hooks/lib/claude-usage.js` + commit `26d8fda` (`fix(check): degrada validadores externos bajo interop WSL y alinea modelo light`). [AC-4]
