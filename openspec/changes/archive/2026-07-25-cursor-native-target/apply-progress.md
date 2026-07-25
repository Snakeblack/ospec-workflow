# Apply Progress: cursor-native-target

**Mode**: Strict TDD  
**Delivery**: `size:exception` / `exception-ok` (single PR, five slice checkpoints)  
**Branch**: `feat/cursor-native-target`  
**Started**: 2026-07-25  
**Completed**: 2026-07-25

## Batch log

### Slice 1 — profile+transform

- Safety net: `node --test scripts/lib/target-transform.test.js` → 79/79 pass before changes.
- RED: cursor cases added (module missing).
- GREEN: `cursor.js` profile + `toMdcFile` / `toMdcSynthesize` / `cursorHooks` / `agentReadonly` + `PROFILES.cursor` + `profile.sourceRoots`.
- Checkpoint 1: `node --test scripts/lib/target-transform.test.js` → 88/88 pass.

### Slice 2 — validator

- RED: `validate-cursor.test.js` (module missing).
- GREEN: `validate-cursor.js` with structure/frontmatter/rules/hooks/agent-residue classes; commands `${input:}` deferred.
- Checkpoint 2: `node --test scripts/configure/validate-cursor.test.js` → 9/9 pass.

### Slice 3 — golden+matrix

- RED: `cli.test.js` golden loop includes `cursor` (ENOENT until fixture).
- GREEN: committed `scripts/configure/__fixtures__/golden/cursor/**`; extended `check.js`, real-repo, model-tier, selective-4r, strict-tdd-evidence parity to six targets.
- Checkpoint 3: golden + parity suites green (full suite deferred to checkpoint 5).

### Slice 4 — installer+npm

- RED/GREEN: `install-cursor.test.js` + `install-cursor.js` (`assertCursorPathSafe`, placeholder expansion, dry-run, idempotent sync).
- `package.json`: `build:cursor`, `setup:cursor`, `reload:cursor` → `install-cursor.js`.
- DELETE: `scripts/sync-cursor.js`.
- Checkpoint 4: `node --test scripts/configure/install-cursor.test.js` → 10/10 pass.

### Slice 5 — specs+docs

- 5.1 deferred to `sdd-archive` (per tasks.md).
- Updated `openspec/config.yaml` architecture blurb to six targets.
- Documented `build:cursor` / `setup:cursor` in `docs/plugin-installation.md`, `docs/en/README.md`, `docs/target-capabilities.md`.
- Fixed `scripts/check.test.js` expected target matrix to include `cursor`.
- Checkpoint 5: `npm test` → All checks passed.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |
| 1.1–1.5 | `scripts/lib/target-transform.test.js` | Unit | ✅ 79/79 | ✅ Written | ✅ Passed (88/88) | ✅ to-mdc + synthesize + hooks fan-out + readonly + toolMap/degrade + model | ✅ Clean | Four existing golden targets unchanged |
| 1.6–1.8 | `scripts/lib/target-transform.test.js` | Unit | ✅ 79/79 | ✅ Written | ✅ Passed | ✅ fallback description + unmapped hooks drop | ✅ Clean | Profile + cli `sourceRoots` |
| 1.9 | `scripts/lib/target-transform.test.js` | Unit | ✅ 88/88 | ✅ Written | ✅ Passed | ➖ Checkpoint | ➖ None needed | Checkpoint 1 |
| 2.1–2.4 | `scripts/configure/validate-cursor.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed (9/9) | ✅ clean + structure + fm + rules + hooks + residue + command `${input:}` allowed + vscode/abstract boundaries | ✅ Clean | Residue scoped to agents only |
| 2.5 | `scripts/configure/validate-cursor.test.js` | Unit | ✅ 9/9 | ✅ Written | ✅ Passed | ➖ Checkpoint | ➖ None needed | Checkpoint 2 |
| 3.1–3.2 | `scripts/configure/cli.test.js` | Golden | ✅ prior goldens | ✅ Written | ✅ Passed | ✅ cursor golden + four prior goldens still match | ➖ None needed | Fixture without AGENTS.md (synthesize unit-covered) |
| 3.3–3.5 | `scripts/check.js` + real-repo + parity suites | Integration | ✅ five-target baseline | ✅ Written | ✅ Passed | ✅ six-target matrices | ✅ Clean | `check.test.js` expected list updated |
| 3.6 | `npm test` (deferred to 5.5) | Integration | — | ✅ Written | ✅ Passed | ➖ Checkpoint | ➖ None needed | Combined with checkpoint 5 |
| 4.1–4.2 | `scripts/configure/install-cursor.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed (10/10) | ✅ root/symlink/escape + quote-when-space + dry-run + idempotent sync | ✅ Clean | Dedicated `assertCursorPathSafe` (ADR-004) |
| 4.3–4.4 | `package.json` / delete sync | Structural | N/A | ✅ Written | ✅ Passed | ➖ Single | ➖ None needed | Scripts point at install-cursor; sync deleted |
| 4.5 | `scripts/configure/install-cursor.test.js` | Unit | ✅ 10/10 | ✅ Written | ✅ Passed | ➖ Checkpoint | ➖ None needed | Checkpoint 4 |
| 5.2–5.4 | docs + `openspec/config.yaml` | Docs | N/A | ✅ Written | ✅ Passed (grep) | ➖ Wording | ➖ None needed | Baseline spec deltas deferred to archive |
| 5.5 | `npm test` | Integration | ✅ full suite | ✅ Written | ✅ Passed | ✅ six-target generation+validate | ➖ None needed | Checkpoint 5 — All checks passed |

### Test Summary

- **Total tests written**: ~30 new behavioral cases across transform/validator/installer/matrix
- **Total tests passing**: full `npm test` green (All checks passed)
- **Layers used**: Unit (transform, validator, installer), Golden (cli), Integration (real-repo, parity, check)
- **Approval tests** (refactoring): None — additive sixth target
- **Pure functions created**: `toMdcFile`, `toMdcSynthesize`, `cursorHooks`, `expandCursorHooksPlaceholder`, `assertCursorPathSafe`

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "cursor-native-target",
  "mode": "strict",
  "evidence_mode": "live",
  "functional_snapshot": {
    "projection": "strict-tdd-functional-v1",
    "base_tree": "feat/cursor-native-target",
    "genesis_paths": [
      "package.json",
      "scripts/check.js",
      "scripts/check.test.js",
      "scripts/configure/cli.js",
      "scripts/configure/cli.test.js",
      "scripts/configure/install-cursor.js",
      "scripts/configure/install-cursor.test.js",
      "scripts/configure/real-repo.test.js",
      "scripts/configure/validate-cursor.js",
      "scripts/configure/validate-cursor.test.js",
      "scripts/lib/target-profiles/cursor.js",
      "scripts/lib/target-transform.js",
      "scripts/lib/target-transform.test.js",
      "scripts/model-tier-contract.test.js",
      "scripts/selective-4r-parity.test.js",
      "scripts/strict-tdd-evidence-parity.test.js"
    ],
    "files": [
      { "path": "package.json", "digest": "sha256:649ff257d03163535337c872c0435a1711cc2dc64adf64891087ccfc2252071d" },
      { "path": "scripts/check.js", "digest": "sha256:498884d729b60e2b1b27a0ab84af578e8aafca3fcc2e89f198af6c80a75d71af" },
      { "path": "scripts/check.test.js", "digest": "sha256:0db17f2eb38724cc5d55d3ece23f7eada1616f7e6a561bbd06ed9829f1d38708" },
      { "path": "scripts/configure/cli.js", "digest": "sha256:028b2f09d0ff6505e9db5bdd97f298d9bd2d7b3c649e09444ddc709507e040b7" },
      { "path": "scripts/configure/cli.test.js", "digest": "sha256:f137b3a4565afb983bb6aaae1bbf64c5761fcdfa11dbbddd6769ead91c167c70" },
      { "path": "scripts/configure/install-cursor.js", "digest": "sha256:30eab285c8e993192ba17c3c56d1ecdfd21e6b544d03b636e1a0fa1faaa126c7" },
      { "path": "scripts/configure/install-cursor.test.js", "digest": "sha256:fa9b0bb3be2f56b05ef384cd99dd2b6679ef25ec98413d34164a7978efb4a648" },
      { "path": "scripts/configure/real-repo.test.js", "digest": "sha256:c595fc846163e3040849cc0007a2f05d22373c4c1ee27e502621cb1d88c04fdb" },
      { "path": "scripts/configure/validate-cursor.js", "digest": "sha256:980f8bd2929803c6ff96f2290a2ab047b4660e8ea2f48c78150316cc54274eb9" },
      { "path": "scripts/configure/validate-cursor.test.js", "digest": "sha256:03c7a6252b0f113b080c7a2aeee45ef3f2095524e4d85302d435dd949c11996e" },
      { "path": "scripts/lib/target-profiles/cursor.js", "digest": "sha256:7ea1b20bed905b5f8c9cb83fec7a500682c30e65e5f12230806352ba0230b7e2" },
      { "path": "scripts/lib/target-transform.js", "digest": "sha256:6f7775b0e9ab0fd81697808450fc399dbc887d4f59d14192ad83962b37429fa8" },
      { "path": "scripts/lib/target-transform.test.js", "digest": "sha256:acc57cdefab1fa9069a108d9792d5bdc0d7b3ff0da8e1a98ee6162ff575659f5" },
      { "path": "scripts/model-tier-contract.test.js", "digest": "sha256:7b37dfcd941510ba6691adeab0a4dbc5c1cb0bac4330963c5c72a7f37a6bff90" },
      { "path": "scripts/selective-4r-parity.test.js", "digest": "sha256:2963ab5a0faab669abf9cad49de906bde36998f3ec1c5a1ab8e4a912fdbba2b0" },
      { "path": "scripts/strict-tdd-evidence-parity.test.js", "digest": "sha256:be95d7db82b1ce83617fa7987754f6672a9b0cec75e58637d008ca50e1ae617c" }
    ]
  },
  "cycles": [
    {
      "task": "1.1-1.9",
      "test_file": "scripts/lib/target-transform.test.js",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "test_file": "scripts/lib/target-transform.test.js",
        "test_digest": "sha256:acc57cdefab1fa9069a108d9792d5bdc0d7b3ff0da8e1a98ee6162ff575659f5",
        "command": "node --test scripts/lib/target-transform.test.js"
      }
    },
    {
      "task": "2.1-2.5",
      "test_file": "scripts/configure/validate-cursor.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "test_file": "scripts/configure/validate-cursor.test.js",
        "test_digest": "sha256:03c7a6252b0f113b080c7a2aeee45ef3f2095524e4d85302d435dd949c11996e",
        "command": "node --test scripts/configure/validate-cursor.test.js"
      }
    },
    {
      "task": "3.1-3.6",
      "test_file": "scripts/configure/cli.test.js",
      "layer": "integration",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "test_file": "scripts/configure/cli.test.js",
        "test_digest": "sha256:f137b3a4565afb983bb6aaae1bbf64c5761fcdfa11dbbddd6769ead91c167c70",
        "command": "node --test scripts/configure/cli.test.js scripts/configure/real-repo.test.js scripts/selective-4r-parity.test.js"
      }
    },
    {
      "task": "4.1-4.5",
      "test_file": "scripts/configure/install-cursor.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "test_file": "scripts/configure/install-cursor.test.js",
        "test_digest": "sha256:fa9b0bb3be2f56b05ef384cd99dd2b6679ef25ec98413d34164a7978efb4a648",
        "command": "node --test scripts/configure/install-cursor.test.js"
      }
    },
    {
      "task": "5.2-5.5",
      "test_file": "scripts/check.test.js",
      "layer": "integration",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "test_file": "scripts/check.test.js",
        "test_digest": "sha256:0db17f2eb38724cc5d55d3ece23f7eada1616f7e6a561bbd06ed9829f1d38708",
        "command": "npm test"
      }
    }
  ]
}
```

## Final Derived Markdown Table

| 1.1-1.9 | scripts/lib/target-transform.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 2.1-2.5 | scripts/configure/validate-cursor.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 3.1-3.6 | scripts/configure/cli.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 4.1-4.5 | scripts/configure/install-cursor.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |
| 5.2-5.5 | scripts/check.test.js | ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |

## Deviations from Design

None — implementation matches design (to-mdc from source description, `sourceRoots` for AGENTS.md, readonly omit-vs-false, dedicated install-cursor, conditional quoting).

## Issues Found

- `scripts/check.test.js` still expected a five-target matrix; updated as part of slice 3/5 matrix work.
- Baseline OpenSpec deltas intentionally deferred to `sdd-archive` per tasks.md 5.1.
