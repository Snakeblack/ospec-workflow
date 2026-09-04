# Apply Progress: wsl-claude-interop-guard

## Batch 1 — 2026-09-04 (fases 1-4 completas)

**Modo**: Focused TDD (`testing.tdd_mode: focused`, runner `node --test`)
**Rama**: `fix/wsl-claude-interop-guard` (HEAD base 4398b19, 3 commits cx0 preservados)
**Delivery**: `exception-ok` — PR único, 1 commit work unit (~90-130 líneas previstas)

### Tareas completadas

| Task | Status | Verificación local | Notas |
|------|--------|--------------------|-------|
| 1.1 | [x] | `git branch --show-current` = `fix/wsl-claude-interop-guard` ≠ main | Rama creada por el orquestador desde HEAD 4398b19 (corrige el HEAD stale 7703090 según sdd-tasks-003) |
| 1.2 | [x] | `git diff --cached models.yaml` = 3+/3− | Tier light y default opencode → `zai-coding-plan/glm-5.3-flash`; archivo no editado |
| 2.1 | [x] | RED: `TypeError: isWindowsInteropPath is not a function` | 2 tests unitarios del predicado con stub de `process.platform` |
| 2.2 | [x] | GREEN: `node --test scripts/configure/cli.test.js` 36/36 | Predicado `isWindowsInteropPath(p)` junto a `resolveBinFromPath`; exportado |
| 2.3 | [x] | RED real: `resolveClaudeBin` devolvió `/mnt/c/Program Files/nodejs/claude` | Invariante linux: nunca `/mnt/<letra>/` |
| 2.4 | [x] | GREEN: cli.test.js 36/36 | Guard en `resolveClaudeBin()`; fallback WinGet win32 intacto |
| 2.5 | [x] | RED portable: `{status: 1, stderr: "spawnSync claude ENOENT"}` con `PATH=""` | Fail-soft esperado `{status: 0, stdout: "claude validator skipped: no usable native binary\n"}` |
| 2.6 | [x] | GREEN | `defaultRunValidator` devuelve el skip sin spawn cuando `resolveClaudeBin()` es `null` |
| 3.1 | [x] | RED: caso interop `true !== false` (los casos `null` y `/usr/bin/claude` pre-verdes) | `deps.resolveClaudeBin` inyectable en `claudeCliAvailable` |
| 3.2 | [x] | GREEN: `node --test scripts/check.test.js` 8/8 | `check.js` importa `resolveClaudeBin` + `isWindowsInteropPath` de `./configure/cli.js` |
| 3.3 | [x] | `node --test scripts/configure/e2e.test.js`: 1 skip (`claude interop de Windows bajo /mnt`) + 1 pass (codex) | Clasificación desde `resolveBinFromPath("claude")` crudo; ver desviación D1 |
| 3.4 | [x] | RED real (1 fail contra models.yaml staged) → GREEN 33/33 | Expectativa `openai/gpt-5.6-luna` → `zai-coding-plan/glm-5.3-flash` en sdd-document.test.js:266 |
| 3.5 | [x] | Pass en corrida focalizada conjunta, sin edición | Su wrapper fail-soft ya sintetiza éxito con `resolveClaudeBin()` null |
| 4.1 | [x] | 82 tests: 81 pass, 0 fail, 1 skip (e2e claude interop) | 5 archivos afectados en una sola corrida |
| 4.2 | [x] | `node scripts/check.js` → "All checks passed." con `claudeCliAvailable() => false` | Verificación integradora WSL una sola vez; claude generado sin validador |
| 4.3 | [x] | Lectura del diff | Guard activo solo con `platform === "linux"` + `/^\/mnt\/[a-z]\//`; win32 y Linux nativo sin cambios |
| 4.4 | [x] | Commit único `26d8fda` | models.yaml + tests + guard + fixes de plataforma; español imperativo, sin atribución; trailers Ospec-Change/Ospec-Task |

### Desviaciones

- **D1 (menor, conforme al diseño)**: la tarea 3.3 pedía clasificar el skip del e2e con `resolveClaudeBin()` + predicado. Tras el guard (2.4), `resolveClaudeBin()` devuelve `null` para interop y ya no distingue "no instalado" de "interop" — el primer intento clasificó mal y el e2e corrió y falló en WSL (demostración en vivo del bug: `C:\tmp\...` en la salida del validador Windows). Se resolvió exportando también `resolveBinFromPath` desde `cli.js` y clasificando desde la resolución cruda de PATH: misma heurística compartida, sin duplicación (sdd-propose-001) y con la razón de skip exacta. Import añadido: `resolveBinFromPath` (export interno puro, sin cambio de comportamiento).

### Evidencia de aceptación

- [AC-1] `node scripts/check.js` en WSL → "All checks passed."; claude degradado a generación sin validador (`claudeCliAvailable() => false`).
- [AC-2] Corrida focalizada de los 5 archivos: 81 pass / 0 fail / 1 skip justificado; expectativa light = `zai-coding-plan/glm-5.3-flash`.
- [AC-3] Guard no-op fuera de `linux` + `/mnt/<letra>/` (tests del predicado cubren win32, `/usr/bin/claude`, `/mnt/claude`).
- [AC-4] Commit único con models.yaml staged + tests + guard.

### Workload

Real ≈ líneas previstas (~90-130 + 1 export extra en cli.js). Sin escalada; sin `size:exception` efectivo más allá del ya aprobado (`exception-ok`).
