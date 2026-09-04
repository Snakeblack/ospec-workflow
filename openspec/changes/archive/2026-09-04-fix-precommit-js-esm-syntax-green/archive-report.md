# Archive Report: fix-precommit-js-esm-syntax-green

- Date: 2026-09-04
- Route: bugfix (exploration.md como contrato; sin proposal.md ni design.md)
- Branch: `fix/precommit-js-esm-syntax-green` — commit `caa3831` (`fix(hooks): valida ESM real en .js y reporta import en .cjs`)
- Verify verdict: **PASS** (sin findings CRITICAL/WARNING; 1 SUGGESTION preexistente, sin acción requerida)
- Proposed archive destination: `openspec/changes/archive/2026-09-04-fix-precommit-js-esm-syntax-green/`

## Resumen del cambio

Fix quirúrgico en `scripts/hooks/lib/staged-validator.js` (bloque `.js`/`.cjs`, hoy líneas 184-198):

1. `.js` ESM — cuando `vm.Script` falla sólo por modo ESM (mensajes "Cannot use import
   statement outside a module" / "Unexpected token 'export'"), se valida el blob con
   `node --check` sobre un temporal `.mjs` reutilizando `checkMjsSyntax` (sin cambios de
   firma). Un error real de sintaxis cancela el commit con `type: "js-esm-syntax"`.
2. `.cjs` — se eliminó la exención ESM: `import`/`export` en `.cjs` se reporta como error
   `js-syntax`. El `continue` incondicional (falso verde) ya no existe.

El cambio alinea el código con el baseline vigente REQ-git-precommit-hook-001
(`openspec/specs/git-precommit-hook/spec.md` líneas 26-28) y **no lleva delta de spec**:
`spec_writes: []` en el plan.

## Evidencia de cierre

| Fuente | Resultado |
|--------|-----------|
| verify-report.md | PASS — matriz REQ-git-precommit-hook-001 COMPLIANT en los 5 escenarios, runtime-test |
| Suite re-ejecutada por verify | `npm test`: 3091 tests, 3089 pass, 0 fail, 2 skipped ("All checks passed.", exit 0) |
| Tests del hook | `staged-validator.test.js` + `.integration.test.js`: 51/51 pass |
| tasks.md | 10/10 tasks `[x]` (3 RED + 4 GREEN + 3 verificación) |
| apply-progress.md | commit `caa3831`; dogfooding: el commit pasó por el hook pre-commit real |
| Presupuesto 400 líneas | 89 líneas de código/tests (Low risk), PR único |

## Specs preparados

Ninguno. El cambio no tiene `specs/` (sin delta) y no hay `decisions/adr-*.md` que
promover: `spec_writes: []`, `adr_promotions: []` en `archive-plan.json`.

## Archive Inventory (paths que el runtime debe preservar al mover a archive)

- `exploration.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`
- `state.yaml`
- `archive-report.md`

(`archive-plan.json` viaja con el cambio pero queda excluido del fingerprint de origen,
per `scripts/lib/archive-transaction.js:521-527`.)

## Accepted warnings

Ninguno. El verify no registró findings WARNING. El único hallazgo es 1 SUGGESTION
preexistente (matching de mensajes de `vm.Script` en `staged-validator.js:185-187`;
falla fail-closed ante cambio futuro de mensajes de Node, no falso verde) — sin acción.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/fix-precommit-js-esm-syntax-green/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0 (ningún `gates.*.questions_asked` en state.yaml; el
intent-briefing aceptado vía AskUserQuestion precede a la creación del gate en state).

## Decisiones promovidas a memoria

Ninguna. `open_decisions` ausente en `state.yaml` → no se escribe
`openspec/memory/decisions.md` (skip por procedimiento Step 4).

## Nota operativa para el orquestador (source_fingerprint)

El validador del runtime (`scripts/lib/archive-plan.js:326-339`) exige que
`plan.source_fingerprint` coincida con el fingerprint real del origen. Este entorno de
ejecución no dispone de shell para calcular SHA-256, por lo que el plan se emitió con un
placeholder `sha256:000…0`. Antes de invocar
`node scripts/archive-transaction-run.js fix-precommit-js-esm-syntax-green`, el orquestador
debe reemplazar ese valor por el real, con:

```bash
node -e '
const {computeInventory, fingerprintInventory} = require("./scripts/lib/archive-transaction.js");
const p = "openspec/changes/fix-precommit-js-esm-syntax-green";
computeInventory(p).then(async inv => {
  const fp = fingerprintInventory(inv.filter(e => e.path !== "archive-plan.json"));
  const fs = require("fs");
  const planPath = p + "/archive-plan.json";
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  plan.source_fingerprint = fp;
  plan.archive_inventory = inv.filter(e => e.path !== "archive-plan.json").map(e => e.path);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
  console.log(fp);
});'
```

(Recalcular después de cualquier edición posterior de `archive-report.md` o `state.yaml`,
ya que sus bytes entran en el fingerprint.)

## Move Completion Pending (runtime-owned)

El directorio origen `openspec/changes/fix-precommit-js-esm-syntax-green/` sigue existiendo.
La transacción atómica (staging, compare, commit, delete-after-full-match) y el receipt de
cierre corresponden al runtime invocado por el orquestador — no a este executor.
