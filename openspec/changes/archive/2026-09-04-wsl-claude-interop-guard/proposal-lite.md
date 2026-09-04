# Proposal Lite: Guard de interop WSL para el CLI claude y expectativa de modelo opencode

## Change Class

small

## Intent

El precommit falla en WSL por dos causas independientes: (1) `scripts/sdd-document.test.js:266` codifica `openai/gpt-5.6-luna` como modelo del tier light opencode, pero el `models.yaml` (ya staged) emite `zai-coding-plan/glm-5.3-flash`; (2) en WSL, `claude` resuelve vía PATH al shim de Windows bajo `/mnt/c/...`: el probe tiene éxito pero el binario Windows no puede consumir rutas POSIX (`/tmp/...` → `C:\tmp\...`) y la validación claude falla. Objetivo: el precommit pase en WSL con el `models.yaml` del usuario.

## Boundaries

- In scope: actualizar la expectativa del test; tratar un binario `claude` resuelto bajo `/mnt/<letra>/` en `linux` como no disponible (degrade a generación sin validación claude, flujo ya soportado); self-skip del e2e claude; commit único de trabajo (models.yaml staged + test + guard).
- Out of scope: fixtures `scripts/configure/__fixtures__/**` (autocontenidos), lentitud de I/O en `/mnt/c`, conversión de rutas WSL→Windows (`wslpath`), targets distintos de claude.

## Affected Areas

| Area | Impact | Notes |
|------|--------|-------|
| `models.yaml` | Commit | Ya staged por el usuario; sin edición adicional |
| `scripts/sdd-document.test.js` | Modify | Expectativa tier light opencode → `zai-coding-plan/glm-5.3-flash` |
| `scripts/check.js` | Modify | `claudeCliAvailable()` rechaza binarios interop `/mnt/<letra>/` en `linux` |
| `scripts/configure/cli.js` | Modify | `resolveClaudeBin()` devuelve `null` para rutas `/mnt/<letra>/` en `linux` |
| `scripts/configure/e2e.test.js` | Modify | Self-skip del e2e claude cuando el binario resuelto es interop de Windows |

## Approach

Predicado compartido (ruta bajo `/mnt/<letra>/` en `process.platform === "linux"` identifica un ejecutable de Windows incapaz de consumir rutas POSIX), definido y exportado desde `scripts/configure/cli.js` y reutilizado por `check.js` y `e2e.test.js` para no duplicar la heurística. `check.js` degrada a `validate: false` para claude (precedente: `check.test.js:63-92`); `resolveClaudeBin() → null` activa el fail-soft ya existente (`selective-4r-parity.test.js:16-22`); `e2e.test.js` se auto-salta usando la ruta resuelta del binario encontrado.

## Acceptance Checks

- [ ] En WSL, `node scripts/check.js` termina en "All checks passed" (claude generado sin validador, con nota de CLI no disponible).
- [ ] `node --test scripts/sdd-document.test.js scripts/check.test.js scripts/selective-4r-parity.test.js scripts/configure/e2e.test.js` pasa; el test del tier light espera `zai-coding-plan/glm-5.3-flash`.
- [ ] En Linux nativo/CI sin montajes `/mnt`, el guard es no-op (comportamiento sin cambios).
- [ ] Commit único Conventional Commits (español imperativo, sin atribución de IA) con models.yaml + test + guard.

## Risks and Rollback

- Risk: Medium — el guard degrada (no corrige) la validación claude real en WSL, y descartaría un claude Linux montado deliberadamente bajo `/mnt` (la convención WSL lo hace improbable).
- Rollback: `git revert` del commit único; sin migraciones, formatos ni estado persistente.
