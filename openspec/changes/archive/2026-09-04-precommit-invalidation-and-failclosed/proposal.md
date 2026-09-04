# Proposal: Invalidación Completa de Targets y Modo Fail-Closed en Pre-commit

## Intent

Remediar las dos deficiencias residuales en el hook pre-commit diferencial (v2.60.1):
1. La detección en `findAffectedTargets` es incompleta: omite entradas canónicas del generador (`agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`), librerías auxiliares (`frontmatter.js`, `model-resolver.js`) y hooks de runtime distribuidos (`scripts/hooks/**`), dejando artefactos en `dist/` desactualizados ante cambios en fuentes canónicas.
2. Comportamiento fail-open ante errores de lectura de Git: `getStagedFiles` retorna `[]` y `getStagedContent` retorna `null` de forma silenciosa, y el escaneo de secretos continúa sin error si `git show` falla, permitiendo la confirmación inadvertida de credenciales o código roto cuando el índice o el subproceso Git fallan.

## Scope

### In Scope
- Invalidación exhaustiva en `findAffectedTargets`: retornar `ALL_TARGETS` ante modificaciones en cualquier entrada canónica, implementación de generadores, librerías auxiliares o hooks distribuidos.
- Modo fail-closed estricto: hacer que `getStagedFiles` y `getStagedContent` lancen una excepción (`Error`) explicativa si los comandos de Git fallan.
- Política fail-closed en el escaneo de secretos de `pre-commit-hook.js`: abortar con código 1 y banner de error diagnóstico si `getStagedContent` falla o no puede leer un blob staged.
- Preservar bypasses de emergencia explícitos (`DISABLE_OSPEC_PRECOMMIT`, `DISABLE_AGENT_SHIELD`, `--no-verify`) con instrucciones claras en los mensajes de fallo.
- Actualizar especificaciones en `openspec/specs/git-precommit-hook` y `openspec/specs/agent-shield-security`.
- Pruebas unitarias e integración en `scripts/hooks/lib/` y `scripts/hooks/`.

### Out of Scope
- Modificación de los scripts de build o empaquetado de cada target individual.
- Reescritura del motor de detección de secretos o adición de nuevos patrones de regex.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `git-precommit-hook`: Expande `REQ-git-precommit-hook-001` para que `findAffectedTargets` retorne `ALL_TARGETS` ante cambios en entradas canónicas, módulos auxiliares o hooks de runtime. Exige fail-closed en `getStagedFiles` y `getStagedContent` ante fallos de Git.
- `agent-shield-security`: Modifica `REQ-agent-shield-security-001` para exigir terminación inmediata (código 1) con diagnóstico descriptivo si falla la extracción de blobs en el escaneo de secretos.

## Approach

1. **Matriz canónica en `findAffectedTargets`**: Evaluar si alguna ruta preparada pertenece a `agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`, `scripts/lib/frontmatter.js`, `scripts/lib/model-resolver.js`, `scripts/lib/target-profiles/**`, `scripts/lib/target-transform.js`, `scripts/configure/{cli,install-engine,install-target,validate-phase}.js` o `scripts/hooks/**`. En tal caso, retornar `ALL_TARGETS`.
2. **Fail-closed en utilidades Git**:
   - `getStagedFiles`: lanzar `Error` descriptivo si `git diff --cached` retorna código no cero o error de spawn.
   - `getStagedContent`: lanzar `Error` descriptivo si `git show :<path>` falla o el subproceso reporta error.
3. **Fail-closed en escaneo de secretos**: Capturar fallos de `getStagedContent` en `pre-commit-hook.js`, emitir diagnóstico claro con opciones de bypass y salir con código 1.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/lib/staged-validator.js` | Modified | Ampliación de invalidación canónica a `ALL_TARGETS`; fail-closed en `getStagedFiles` y `getStagedContent`. |
| `scripts/hooks/pre-commit-hook.js` | Modified | Manejo fail-closed (exit 1) ante fallos al leer blobs en escaneo de secretos. |
| `scripts/hooks/lib/staged-validator.test.js` | Modified | Tests unitarios para entradas canónicas y excepciones en `getStagedFiles`/`getStagedContent`. |
| `scripts/hooks/pre-commit-hook.test.js` | Modified | Tests para fallo cerrado de lectura de secretos y reporte diagnóstico. |
| `openspec/specs/git-precommit-hook/spec.md` | Modified | Delta spec con nueva matriz y política fail-closed. |
| `openspec/specs/agent-shield-security/spec.md` | Modified | Delta spec con política fail-closed en lectura de secretos. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mayor frecuencia de builds de todos los targets durante desarrollo de skills/agentes | Low | Es el comportamiento intencionado para garantizar paridad entre fuentes canónicas y `dist/`. |
| Bloqueo de commits si el repositorio Git local tiene problemas de index | Low | Fail-closed previene commits inseguros; bypasses (`--no-verify`, `DISABLE_OSPEC_PRECOMMIT`) disponibles para emergencias. |

## Rollback Plan

Revertir mediante `git revert` al commit previo. Los desarrolladores pueden utilizar `git commit --no-verify` o `DISABLE_OSPEC_PRECOMMIT=true` para desbloqueo inmediato.

## Dependencies

- Git CLI >= 2.30 y Node.js >= 22.

## Success Criteria

- [ ] `findAffectedTargets` retorna `ALL_TARGETS` ante modificaciones en entradas canónicas, helpers de generador o hooks de runtime.
- [ ] `getStagedFiles` y `getStagedContent` lanzan errores explícitos al fallar la invocación de Git.
- [ ] `pre-commit-hook.js` rechaza el commit con código 1 ante errores de lectura de blobs en el escaneo de secretos.
- [ ] Bypasses de emergencia (`DISABLE_OSPEC_PRECOMMIT`, `DISABLE_AGENT_SHIELD`, `--no-verify`) operan correctamente.
- [ ] Suite de pruebas (`npm test`) aprueba al 100%.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
