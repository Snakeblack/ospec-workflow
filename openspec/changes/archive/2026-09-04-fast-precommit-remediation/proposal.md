# Proposal: Remediación del Hook Pre-commit Diferencial

## Intent

Remediar las fallas críticas de corrección e invalidación introducidas en el hook pre-commit diferencial (v2.60.0, PR #168). La implementación actual lee archivos desde el working tree (`fs.readFileSync`) en lugar del Git index (`git show :<path>`), no invalida targets ante cambios en generadores o configuración compartida, carece de fallback a suite completa para módulos compartidos y no cuenta con pruebas de integración reales en repositorios Git para escenarios de staging parcial.

## Scope

### In Scope
- Leer blobs preparados directamente desde el Git index (`git show :<path>`) para validación sintáctica en `staged-validator.js` y escaneo de secretos en `pre-commit-hook.js`.
- Actualizar `findAffectedTargets` con fallback a `ALL_TARGETS` ante modificaciones en generadores compartidos (`scripts/configure/{cli,install-engine,install-target,validate-phase}.js`), perfiles de targets (`scripts/lib/target-profiles/*.js`), `scripts/lib/target-transform.js` o `models.yaml`.
- Actualizar `findAffectedTests` con fallback a la suite completa de Node ante cambios en módulos compartidos o infraestructura central en `scripts/lib/` y `scripts/check.js`.
- Implementar pruebas de integración con repositorios Git temporales verificando escenarios de staging parcial (staged roto con working tree limpio, staged limpio con working tree roto, secreto staged con working tree limpio).
- Alinear especificaciones en `openspec/specs/` (`git-precommit-hook`, `agent-shield-security`).

### Out of Scope
- Migración a linters externos o reescritura del framework de testing nativo.
- Modificaciones en scripts de instalación de hooks (`setup-git-hooks.js`).
- Alteraciones en hooks de runtime de Claude ajenos al pre-commit de Git.

## Capabilities

> This section is the CONTRACT between proposal and specs phases.
> The sdd-spec agent reads this to know exactly which spec files to create or update.
> Research `openspec/specs/` before filling this in.

### New Capabilities
None

### Modified Capabilities
- `git-precommit-hook`: Exige validación de sintaxis y consistencia sobre blobs del índice de Git (`git show :<path>`), fallback a `ALL_TARGETS` ante cambios en generadores/perfiles/configuración, fallback a la suite de tests completa ante cambios en infraestructura central, y verificación de integración con repositorios Git.
- `agent-shield-security`: Extiende el escaneo preventivo de secretos en pre-commit para inspeccionar obligatoriamente los blobs del índice de Git en vez del filesystem de trabajo.

## Approach

- **Lectura desde Git Index**: Diseñar una función utilitaria robusta (`getStagedContent(repoRoot, relativePath)`) que extraiga blobs mediante `git show :<path>` con manejo de encoding UTF-8 y códigos de salida sin shell injection (`shell: false`).
- **Invalidación exhaustiva de targets**: Si `stagedFiles` contiene archivos de infraestructura de targets (`scripts/configure/{cli,install-engine,install-target,validate-phase}.js`, `scripts/lib/target-profiles/**`, `scripts/lib/target-transform.js` o `models.yaml`), retornar la lista completa de targets soportados (`ALL_TARGETS`).
- **Fallback seguro de pruebas**: Si se detectan cambios en archivos compartidos de `scripts/lib/` (fuera de checkers aislados) o `scripts/check.js`, retornar la suite completa de pruebas Node para garantizar la ausencia de regresiones por dependencias indirectas.
- **Suite de integración con Git**: Crear pruebas automatizadas que inicialicen un repo Git efímero (`fs.mkdtempSync` + `git init`) y ejecuten las verificaciones en escenarios de staging parcial y desacoplamiento index/working tree.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/lib/staged-validator.js` | Modified | Lectura de blobs desde Git index, fallback `ALL_TARGETS` y fallback de tests para `scripts/lib/` |
| `scripts/hooks/pre-commit-hook.js` | Modified | Escaneo de secretos sobre blobs del Git index en lugar de `fs.readFileSync` |
| `scripts/hooks/lib/staged-validator.test.js` | Modified | Pruebas unitarias de las nuevas rutas de fallback de targets y tests |
| `scripts/hooks/pre-commit-hook.test.js` | Modified | Pruebas unitarias de detección de secretos sobre blobs del Git index |
| `scripts/hooks/lib/staged-validator.integration.test.js` | New | Pruebas de integración con repositorio Git temporal para staging parcial |
| `openspec/specs/git-precommit-hook/spec.md` | Modified | Especificación delta de validación contra Git index y fallbacks |
| `openspec/specs/agent-shield-security/spec.md` | Modified | Especificación delta de escaneo de secretos sobre blobs staged |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sobrecarga de comandos `git show` en commits grandes | Low | Limitar lectura a extensiones aplicables (`.js`, `.json`) y filtrar por `--diff-filter=ACMR` |
| Falsos negativos por buffers truncados en archivos enormes | Low | Configurar `maxBuffer` suficiente (10MB) y respetar umbral de 1MB para escaneo de secretos |
| Mayor tiempo de ejecución en commits de infraestructura | Low | El fallback a suite completa y `ALL_TARGETS` solo se activa cuando se tocan archivos núcleo |

## Rollback Plan

Revertir los cambios mediante `git revert` al commit previo a esta remediación. En caso de emergencia durante commits, los desarrolladores pueden recurrir a `git commit --no-verify` o `DISABLE_OSPEC_PRECOMMIT=true`.

## Dependencies

- Git CLI (`git` disponible en PATH).
- Node.js 22+ native test runner.

## Success Criteria

- [ ] `checkStagedSyntax` valida la sintaxis evaluando los blobs del Git index vía `git show :<path>`.
- [ ] El escaneo de secretos en `runPreCommit` inspecciona los blobs del Git index y detecta secretos staged con working tree limpio.
- [ ] `findAffectedTargets` retorna `ALL_TARGETS` ante modificaciones en generadores compartidos, perfiles, transformador o `models.yaml`.
- [ ] `findAffectedTests` dispara la suite de tests completa ante cambios en `scripts/lib/` o `scripts/check.js`.
- [ ] Pruebas de integración reales con Git temporal cubren y aprueban escenarios de staging parcial.
- [ ] La suite completa de pruebas (`npm test`) finaliza exitosamente con 0 errores.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
