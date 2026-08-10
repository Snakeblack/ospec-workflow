# Tasks: `verify-lineage-k3-final-closure-remediation`

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Phase 1 — Real Candidate Delta Enforcement

* [x] **1.1** Eliminar `options.diffText` y `options.diff` de `deriveCandidateDeltaPaths()` en `scripts/lib/verify-lineage.js`.
* [x] **1.2** Eliminar el fallback que asume que todos los `paths` de B cambiaron si los conjuntos coinciden.
* [x] **1.3** Implementar la resolución estricta del delta Candidate A → B mediante objetos/árboles Git reales sobre `rootDir`.
* [x] **1.4** Fallar cerrado (`delta-unresolvable`) si el delta no puede resolverse deterministamente.
* [x] **1.5** Actualizar y añadir tests unitarios en `scripts/lib/verify-lineage.test.js` probando que el delta A→B se calcula mecánicamente sin depender de `diffText`.

## Phase 2 — Filesystem-Only Contract Authority

* [x] **2.1** Actualizar `startVerifyLineage()`, `evaluateRecheck()` y `getLineageNextAction()` en `scripts/lib/verify-lineage.js` para invocar únicamente `computeContractDigestFromArtifacts(changeRoot, mode)`.
* [x] **2.2** Rechazar el uso de objetos `contract` inline arbitrarios como autoridad en operaciones de linaje.
* [x] **2.3** Actualizar los callers en `skills/sdd-verify/SKILL.md` y `skills/sdd-apply/SKILL.md` para pasar `changeRoot` y `mode`.
* [x] **2.4** Actualizar `verify-lineage.test.js` para validar que el fingerprint de contrato se calcula exclusivamente leyendo bytes del sistema de archivos.

## Phase 3 — Sole TDD Authority Cleanup

* [x] **3.1** Eliminar el soporte de `strict_tdd` y `strictTdd` en `resolveTddMode()` (`scripts/lib/tdd-mode.js`).
* [x] **3.2** Eliminar la búsqueda de `strict_tdd: true` en `scripts/hooks/pre-commit-hook.js`.
* [x] **3.3** Eliminar `OR scale: team` en la selección de modo Focused en `skills/sdd-apply/SKILL.md`.
* [x] **3.4** Actualizar referencias en `skills/sdd-apply/strict-tdd.md` y `skills/sdd-init/SKILL.md`.
* [x] **3.5** Actualizar y añadir tests unitarios probando que `testing.tdd_mode` es la única autoridad runtime TDD.

## Phase 4 — Verification Integrity & Final Re-Verification

* [x] **4.1** Auditar y reconciliar el reporte de verificación para asegurar que todas las afirmaciones coincidan exactamente con el estado de HEAD.
* [x] **4.2** Ejecutar la suite completa de pruebas (`npm test`) asegurando 0 errores y 0 warnings.
* [x] **4.3** Transicionar `state.yaml` a `status: verified` y preparar el plan de archivo.
