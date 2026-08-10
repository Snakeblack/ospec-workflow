# Change Proposal: `verify-lineage-k3-final-closure-remediation`

## Summary

Micro-corrección final para cerrar completamente las cuatro deficiencias materiales remanentes en Bounded Verify Lineage identificadas tras v2.43.3:

1. **Real Candidate Delta**: Eliminar `diffText` externally supplied y el fallback por `paths` de `deriveCandidateDeltaPaths()`; exigir una fuente verdaderamente resoluble para comparar los dos estados (Candidate A → Candidate B) o fallar cerrado.
2. **Filesystem-Only Contract Authority**: `startVerifyLineage()`, `evaluateRecheck()` y `getLineageNextAction()` deben utilizar obligatoriamente `computeContractDigestFromArtifacts(changeRoot, mode)` leyendo bytes reales de disco. El objeto `contract` inline arbitrario deja de ser autoridad.
3. **Sole TDD Runtime Authority**: Eliminar todo residuo de `strict_tdd` en `resolveTddMode()`, `pre-commit-hook.js`, `strict-tdd.md`, `sdd-apply` y `sdd-verify`. Eliminar `scale: team` del dispatch de `sdd-apply`. `testing.tdd_mode` es la única autoridad runtime.
4. **Verify Evidence Integrity**: Garantizar que el reporte de verificación y las afirmaciones de `apply-progress.md` / `tasks.md` coincidan estrictamente con la implementación en HEAD sin sobreafirmar cumplimiento.

## Non-goals

Este cambio MUST NOT introducir:
* Execution Graph
* WorkOrder / WorkResult execution runtimes
* Worker isolation / capsules
* Assurance Graph / Attestation / Delivery Authorization

Cerrar definitivamente Bounded Verify Lineage como mecanismo transitorio de la arquitectura actual y dar paso al desarrollo de K4a.
