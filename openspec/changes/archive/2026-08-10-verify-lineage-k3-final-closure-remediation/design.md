# Design: `verify-lineage-k3-final-closure-remediation`

## 1. Mechanical Remediation Delta (`deriveCandidateDeltaPaths`)

- Eliminar `options.diffText` y `options.diff` de `deriveCandidateDeltaPaths`.
- Requerir que Candidate A y Candidate B contengan `candidate_tree` resolubles vía Git (`git diff-tree -r --name-only A B`) o mediante la inspección determinista de objetos Git del repositorio (`rootDir`).
- Si `candidate_tree` o los objetos Git no pueden resolverse para calcular los cambios por archivo entre A y B, la función MUST fallar cerrada (devolviendo `null` o arrojando error estructurado `delta-unresolvable`).
- Se elimina el fallback que agregaba todos los `paths` de B cuando el tamaño de la diferencia de conjuntos era 0 pero `diff_hash` difería.

## 2. Filesystem-Only Contract Authority

- Actualizar `startVerifyLineage`, `evaluateRecheck` y `getLineageNextAction` en `scripts/lib/verify-lineage.js` para exigir `changeRoot` y `mode`, invocando internamente `computeContractDigestFromArtifacts(changeRoot, mode)`.
- El objeto `contract` inline queda deprecado/sin autoridad para operaciones de lineage; si se pasa un `contract` object arbitrario sin `changeRoot`, la operación falla cerrada.

## 3. Sole TDD Authority Cleanup

- En `scripts/lib/tdd-mode.js`, simplificar `resolveTddMode(config)` para leer exclusivamente `config.testing?.tdd_mode ?? "standard"`. Eliminar de forma absoluta la lectura de `config.strict_tdd` y `config.strictTdd`.
- En `scripts/hooks/pre-commit-hook.js`, eliminar la regex `/strict_tdd\s*:\s*true/i` y la propiedad `strict_tdd` en `dummyConfig`. Pre-commit consulta `resolveTddMode(config)` únicamente.
- En `skills/sdd-apply/SKILL.md`, actualizar el router de modo TDD para eliminar la condición `OR scale: team` que forzaba Focused Mode cuando `testing.tdd_mode` era `standard`.
- En `skills/sdd-apply/strict-tdd.md` y `skills/sdd-init/SKILL.md`, actualizar las referencias textuales para citar `testing.tdd_mode: strict` como única autoridad.

## 4. Verification Evidence Integrity

- Garantizar que los informes de verificación (`verify-report.md`) evalúen `HEAD` real de los archivos fuentes. Si se descubre discrepancia entre afirmaciones textuales de progreso y el código real en `HEAD`, `sdd-verify` rejecta el pasaje.
