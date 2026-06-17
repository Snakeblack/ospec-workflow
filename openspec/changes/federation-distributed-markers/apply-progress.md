# Apply Progress: Federation Distributed Markers (C1)

**Change**: federation-distributed-markers
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node --test scripts/**/*.test.js`)
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU1**
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json` present; rules from `openspec/config.yaml`)

## Scope of this batch

- **Phase 1: Regression Baseline** (tasks 1.1–1.2) — establish the green pre-change baseline; no file modifications.
- **Phase 2: WU1 — `workspace-atlas.js` marker functions + `loadAtlas` regeneration** (tasks 2.1–2.12).

Phases 3–6 (WU2–WU5) are **NOT** implemented in this batch and remain pending.

## Status legend

- `[x]` implemented and verified locally
- `[~]` implemented but not yet verified locally
- `[ ]` pending

## Per-task status

### Phase 1 — Regression Baseline

- [x] 1.1 Full `npm test` baseline captured green before any edit (`All checks passed.`).
- [x] 1.2 `scripts/lib/workspace-atlas.test.js` + 6 federated cases in `scripts/lib/artifact-store.test.js` pass unmodified — baseline `22/22` across both files; no existing test refactored.

### Phase 2 — WU1

- [x] 2.1 RED tests for `loadMarkerFromMember` (valid / missing-remote+warning / not-found / malformed).
- [x] 2.2 RED tests for `scanMemberMarkers` (`.git` dir / `.git` file / `.gitmodules` union no-dup / empty+warning).
- [x] 2.3 RED tests for `mergeMarkersIntoAtlas` (union / latest-wins / equal-ts tiebreak+warning / determinism / malformed-skip / provides→contracts / empty-consumers impact).
- [x] 2.4 RED test for `serializeAtlas` round-trip through `parseAtlas`.
- [x] 2.5 RED tests for `loadAtlas` (absent→regenerate+write / corrupt→warn+regenerate / git-tracked→warn+continue). 6 existing federated tests unmodified.
- [x] 2.6 `loadMarkerFromMember(memberRoot)` implemented (dependency-free marker YAML subset parser; fail-open).
- [x] 2.7 `scanMemberMarkers(containerRoot)` implemented (depth-1 only; `.git` dir/file; `.gitmodules` union; empty-warning).
- [x] 2.8 `mergeMarkersIntoAtlas(markers)` implemented (union + latest-wins + lexicographic-greater source tiebreak + fail-open; `provides`→`contracts` wholesale).
- [x] 2.9 `serializeAtlas(atlas)` implemented (parseAtlas-compatible YAML; `parseAtlas` body byte-identical — 0 deletions).
- [x] 2.10 `createWorkspaceFederatedStore.loadAtlas()` modified (ENOENT/corrupt → regenerate+write; warn-on-detect `git ls-files` before return, fail-open; valid-cache fast path preserved).
- [x] 2.11 Four new functions exported from `scripts/lib/workspace-atlas.js`.
- [x] 2.12 Full `npm test` green; all WU1 tests pass and baseline stays green.

## Test evidence

| Run | Command | Result |
|-----|---------|--------|
| Baseline (1.1/1.2) | `node --test workspace-atlas.test.js artifact-store.test.js` | `22 pass / 0 fail` |
| RED gate | same two files (after writing tests, before impl) | `22 pass / 19 fail` (new functions absent) |
| GREEN | same two files (after impl) | `41 pass / 0 fail / 0 skipped` |
| Full suite (2.12) | `npm test` | `All checks passed.` |
| Full native suite | `node --test scripts/**/*.test.js` | `318 pass / 0 fail / 0 skipped` |

Additive-only check: `git diff --numstat scripts/lib/workspace-atlas.js` → `525 0` (525 additions, 0 deletions) — `parseAtlas` byte-identical.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.6 `loadMarkerFromMember` | `workspace-atlas.test.js` | Unit | ✅ 22/22 | ✅ Written | ✅ Passed | ✅ 4 cases | ➖ Clean as written |
| 2.7 `scanMemberMarkers` | `workspace-atlas.test.js` | Unit (fs fixtures) | ✅ 22/22 | ✅ Written | ✅ Passed | ✅ 4 cases | ➖ Clean as written |
| 2.8 `mergeMarkersIntoAtlas` | `workspace-atlas.test.js` | Unit | ✅ 22/22 | ✅ Written | ✅ Passed | ✅ 7 cases | ✅ Extracted helpers |
| 2.9 `serializeAtlas` | `workspace-atlas.test.js` | Unit | ✅ 22/22 | ✅ Written | ✅ Passed | ➖ Round-trip single | ➖ Clean as written |
| 2.10 `loadAtlas` regeneration | `artifact-store.test.js` | Unit (fs + git fixtures) | ✅ 6/6 federated | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Extracted `regenerateAtlas`/`warnIfGitTracked`/`isCorruptCache` |

### Test Summary

- Total new tests written: 19 (16 in `workspace-atlas.test.js`, 3 in `artifact-store.test.js`)
- Total tests passing (full native suite): 318
- Layers used: Unit (19)
- Approval tests (refactoring): None — WU1 is additive; existing files untouched except `loadAtlas`
- Pure functions created: `mergeMarkersIntoAtlas`, `serializeAtlas`, `parseMarker` (+ helpers); `loadMarkerFromMember`/`scanMemberMarkers` are I/O-bound by necessity

## Files touched

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/workspace-atlas.js` | Modified (additive) | Added `loadMarkerFromMember`, `scanMemberMarkers`, `mergeMarkersIntoAtlas`, `serializeAtlas` + private marker-parser/merge helpers; exported the four. `parseAtlas` body byte-identical (525 additions, 0 deletions). |
| `scripts/lib/artifact-store.js` | Modified | `loadAtlas()` now regenerates from markers on ENOENT/corrupt cache, writes the derived cache, and warns-on-detect when `workspace.yaml` is git-tracked (fail-open). Added `node:child_process` `spawnSync` import. Valid-cache fast path preserved. |
| `scripts/lib/workspace-atlas.test.js` | Modified | Added 16 unit tests + fixtures/helpers for the four new functions. Existing tests unchanged. |
| `scripts/lib/artifact-store.test.js` | Modified | Added 3 unit tests (regenerate / corrupt-warn / git-tracked-warn) + helpers. 6 existing federated tests unchanged. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 1 + Phase 2 checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `apply.status: partial`, top-level `status: applying`, WU ledger. |

## Suggested work-unit commit (WU1)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping WU1 tests + implementation:

```
feat(federation): añade lectura, fusión y serialización de marcadores distribuidos

Incorpora `loadMarkerFromMember`, `scanMemberMarkers`, `mergeMarkersIntoAtlas` y
`serializeAtlas` en workspace-atlas.js (aditivo, parseAtlas intacto) e invierte
loadAtlas en artifact-store.js para regenerar el cache derivado openspec/workspace.yaml
desde los marcadores ante ausencia o corrupción, con aviso warn-on-detect si el cache
está versionado en git. Cobertura TDD: 19 tests nuevos; suite completa en verde.
```

## Deviations from design

None blocking. Implementation notes:
- **Corruption detection**: `parseAtlas` is intentionally lenient and never throws, so a corrupt cache is detected heuristically — a non-empty file that parses to zero members AND zero contracts is treated as corrupt and triggers regeneration. This is safe against all existing federated tests (each ships an atlas with ≥1 member).
- **Merge model**: members are unioned from both each marker's own `member` block (which carries `provides`→`contracts`) and its `roster` entries; the source-`member.id` tiebreak applies to roster-sourced conflicts (matches the `svc-web > svc-api` spec scenario).
- **git-tracked test**: implemented as a real `git init` + `git add` integration test with a `t.skip()` guard when git is unavailable, rather than mocking `spawnSync` (no DI seam exists). Git was present in this run, so the test executed (0 skipped).

## Remaining work (NOT in this batch)

- [ ] WU3 (Phase 4) — `sdd-init` container detection + `target_dir`.
- [ ] WU4 (Phase 5) — `sdd-workspace` `enroll` + `explore`/`classify` subcommand.
- [ ] WU5 (Phase 6) — `.gitignore`, `persistence-contract.md`, orchestrator note + final verification.

**Next recommended**: run WU3 — `sdd-init` container detection + `target_dir` (independent of WU2; depends only on WU1).

---

# WU2 — `federation-marker.js` (Enroll)

**Batch**: WU2 (Phase 3) — built on top of WU1 (committed on `feat/federation-distributed-markers`, commit `4efe753`).
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node --test scripts/**/*.test.js`)
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU2**, child PR on top of WU1's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## Scope of this batch

- **Phase 3: WU2 — `scripts/lib/federation-marker.js`** (tasks 3.1–3.4): new write-only module with `parseMarker`, `serializeMarker`, and idempotent atomic `enroll`.

Phases 4–6 (WU3–WU5) are **NOT** implemented in this batch and remain pending.

## Per-task status (WU2)

### Phase 3 — WU2

- [x] 3.1 RED tests in new `scripts/lib/federation-marker.test.js`: enroll first-write (all fields + fresh UTC `updated_at`); idempotent no-refresh (byte-stable); key-order-insensitive idempotency; change-refresh (role flip → new `updated_at`); `parseMarker`/`serializeMarker` round-trip (incl. `provides[]` `{id, consumers, surface}` + empty consumers); openspec dir auto-create; no leftover `.tmp`.
- [x] 3.2 `parseMarker(content)` + `serializeMarker(data)` implemented (dependency-free YAML subset; `provides`/`roster` as inline-map list items; `updated_at` serialized last). Round-trips with the WU1 marker format.
- [x] 3.3 `enroll(memberDir, data)` implemented: `mkdir -p {memberDir}/openspec`; reads+parses existing marker; strips `updated_at` from both sides and compares via `util.isDeepStrictEqual` (order-insensitive normalized comparison); identical → `{status:'fresh', path, updated_at}` (no write, timestamp preserved); changed → `updated_at = new Date().toISOString()`, serialize, atomic `.tmp`+`fs.rename` → `{status:'written', path, updated_at}`.
- [x] 3.4 Full `npm test` green; WU1 baseline + WU2 tests all pass.

## Test evidence (WU2)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test scripts/lib/federation-marker.test.js` (test file present, module absent) | `0 pass / 1 fail` (module `./federation-marker.js` cannot be required) |
| GREEN | `node --test scripts/lib/federation-marker.test.js` (after impl) | `9 pass / 0 fail / 0 skipped` |
| Determinism | same file ×5 consecutive runs | `9 pass / 0 fail` every run (no flake) |
| Full suite (3.4) | `npm test` | `All checks passed.` |
| Full native suite | `node --test scripts/**/*.test.js` | `327 pass / 0 fail / 0 skipped` (318 WU1 baseline + 9 WU2) |

> Note: one transient `fail 1` was observed in a single full-suite run and did NOT reproduce (subsequent runs `327/327`). It originated in a WU1 integration test (real `git` fixture in `artifact-store.test.js`), outside WU2 scope; the WU2 file is deterministic across 5 isolated runs.

## TDD Cycle Evidence (WU2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.2 `parseMarker`/`serializeMarker` | `federation-marker.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases (full round-trip / provides+empty-consumers / updated_at-last) | ➖ Clean as written |
| 3.3 `enroll` first-write | `federation-marker.test.js` | Unit (fs fixtures) | N/A (new) | ✅ Written | ✅ Passed | ✅ first-write + openspec-autocreate + no-leftover-tmp | ➖ Clean as written |
| 3.3 `enroll` idempotency | `federation-marker.test.js` | Unit (fs fixtures) | N/A (new) | ✅ Written | ✅ Passed | ✅ identical-data + key-order-insensitive | ✅ Normalized via `isDeepStrictEqual` |
| 3.3 `enroll` change-refresh | `federation-marker.test.js` | Unit (fs fixtures) | N/A (new) | ✅ Written | ✅ Passed | ➖ role-flip single | ➖ Clean as written |

### Test Summary (WU2)

- Total new tests written: 9 (all in `scripts/lib/federation-marker.test.js`)
- Total tests passing (full native suite): 327 (318 WU1 baseline + 9 WU2)
- Layers used: Unit (9)
- Approval tests (refactoring): None — WU2 is a brand-new file; no existing code modified
- Pure functions created: `parseMarker`, `serializeMarker` (+ helpers); `enroll` is I/O-bound by necessity (atomic write)

## Files touched (WU2)

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/federation-marker.js` | Created | New write-only module: dependency-free `parseMarker`/`serializeMarker` (YAML subset, `updated_at` last) + idempotent atomic `enroll` (content-minus-timestamp comparison via `isDeepStrictEqual`, `.tmp`+`rename`). |
| `scripts/lib/federation-marker.test.js` | Created | 9 unit tests (RED-first) covering round-trip, first-write timestamping, idempotency (incl. key-order insensitivity), change-refresh, openspec auto-create, no leftover `.tmp`. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 3 (3.1–3.4) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `WU2.status: done` (phases `[Phase 3]`); chain slice WU2 `done`; apply stays `partial`, top-level `applying`. |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU2 section; WU1 history preserved verbatim. |

## Suggested work-unit commit (WU2)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping WU2 tests + implementation:

```
feat(federation): anade marcador federation-marker con enroll idempotente y atomico

Crea scripts/lib/federation-marker.js con parseMarker/serializeMarker (subconjunto
YAML sin dependencias, updated_at como ultimo campo, provides/roster como mapas en
linea) y enroll(memberDir, data): asegura openspec/, compara el contenido sin
timestamp via isDeepStrictEqual y, si es identico, devuelve status fresh sin reescribir
(updated_at byte-estable); ante cambio, refresca updated_at y escribe de forma atomica
(.tmp + rename). Respeta las convenciones de serializeAtlas de WU1. Cobertura TDD: 9
tests nuevos; suite completa 327/327 en verde.
```

## Deviations from design (WU2)

None blocking. Implementation notes:
- **Normalized idempotency comparison**: the design says "deep-equality of the stripped objects". Implemented with `node:util.isDeepStrictEqual` after stripping `updated_at` from both the parsed existing marker and the incoming data. This is order-insensitive (a caller supplying `member` keys in a different order still resolves to `status:'fresh'`), which is stricter/safer than a raw string comparison and is covered by a dedicated triangulation test.
- **Corrupt existing marker**: if an existing `federation.member.yaml` is present but unparseable, `enroll` treats it as absent and rewrites cleanly (fail-safe), rather than aborting. This keeps `enroll` resilient and aligns with the federation fail-open posture; it is not contradicted by any spec scenario.
- **Module self-contained**: `parseMarker`/serializer helpers are reimplemented inside `federation-marker.js` rather than imported from `workspace-atlas.js`, per the design decision to keep the member-repo WRITE path separate from the hook-facing READ/aggregation module (`workspace-atlas.js` does not export `parseMarker`). Both share the same YAML-subset conventions so markers round-trip across modules.

---

# WU3 — `sdd-init` Container Detection + `target_dir`

**Batch**: WU3 (Phase 4) — built on top of WU1 (`4efe753`) and WU2 (`f30ab07`) on `feat/federation-distributed-markers`. Per the WU2 return and `state.yaml` chain, WU3 depends only on WU1 and is independent of WU2.
**Mode**: Strict TDD (strict_tdd: true, runner `npm test` → `node scripts/check.js` → `node --test scripts/**/*.test.js` + 4 target generators).
**Delivery**: Feature Branch Chain (approval `review-workload-001`) — this batch = **WU3**, child PR on top of WU1's branch.
**Skill resolution**: fallback-config (no `.ospec/cache/skill-registry.cache.json`; rules injected via `## Project Standards` from `openspec/config.yaml`).

## Scope of this batch

- **Phase 4: WU3 — `sdd-init` federated bridge** (tasks 4.1–4.2): document the `target_dir`
  resolution (`## Parameters` block, cwd fallback, ENOENT → blocked) and the depth-1 multirepo
  container-detection gate (no own `.git` + ≥2 child `.git` → blocked + `federated|normal`
  question_gate) in the two source-of-truth markdown files.

Phases 5–6 (WU4–WU5) are **NOT** implemented in this batch and remain pending.

## Per-task status (WU3)

### Phase 4 — WU3

- [x] 4.1 `skills/sdd-init/SKILL.md` — added a `## Pre-Execution: Federated Bridge` section with Step 0a (resolve `target_dir` from the `## Parameters` block; absent/missing → cwd; present + ENOENT → `status: blocked` + `question_gate(invalid-path)`, no writes) and Step 0b (depth-1 child scan; no own `.git` AND ≥2 children with `.git` dir/file → `status: blocked` + `question_gate` with exactly `federated`/`normal`, before any artifact write; own `.git` and <2 children fall through to normal init).
- [x] 4.2 `agents/sdd-init.agent.md` — added a `## Parameters` section documenting the `target_dir` contract (absent → cwd; present + valid → init scoped to that path; present + non-existent → `status: blocked` + `question_gate`), and the note that the orchestrator injects the block — NOT env vars, NOT dynamic frontmatter.

## TDD note (documentation-contract deliverable)

WU3 changes no executable code — the deliverable is the documented behavior contract inside
two markdown files. Following the repo's existing markdown content-contract test pattern
(`scripts/docs-lint.test.js`, `scripts/manifest-sync.test.js`), the contract was pinned with a
new `node --test` file `scripts/sdd-init-federation.test.js` that asserts the required
behavioral tokens are present in `skills/sdd-init/SKILL.md` and `agents/sdd-init.agent.md`.
Tests were written RED-first against the not-yet-written contract.

## Test evidence (WU3)

| Run | Command | Result |
|-----|---------|--------|
| RED gate | `node --test scripts/sdd-init-federation.test.js` (file present, contract absent) | `0 pass / 10 fail` |
| GREEN (intermediate) | same, after first SKILL/agent edits | `8 pass / 2 fail` (two regex-order mismatches in the prose) |
| GREEN | same, after wording fixes (contiguous `two or more (≥2) … .git`, `absent → cwd`, `no own .git`) | `10 pass / 0 fail / 0 skipped` |
| Full suite (4.x) | `npm test` (`node scripts/check.js`) | `All checks passed.` (4 targets generate + validate; `0 errors, 0 warnings`) |
| Full native suite | `node --test scripts/**/*.test.js` | `337 pass / 0 fail / 0 skipped` (327 WU1+WU2 baseline + 10 WU3) |

> The known WU1 `git` integration flake in `artifact-store.test.js` did NOT appear this run
> (full native suite `337/337` clean). It is outside WU3 scope.

## TDD Cycle Evidence (WU3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 `SKILL.md` federated bridge | `sdd-init-federation.test.js` | Unit (content contract) | N/A (new test file) | ✅ Written | ✅ Passed | ✅ 7 cases (target_dir / cwd-fallback / ENOENT-blocked+invalid-path / depth-1+no-own-.git+≥2 / federated+normal / before-any-write / single-repo fall-through) | ➖ Prose only |
| 4.2 `agent.md` `## Parameters` | `sdd-init-federation.test.js` | Unit (content contract) | N/A (new test file) | ✅ Written | ✅ Passed | ✅ 3 cases (## Parameters+target_dir / absent→cwd+valid→scoped+missing→blocked / orchestrator-injects + not-env-var/frontmatter) | ➖ Prose only |

### Test Summary (WU3)

- Total new tests written: 10 (all in `scripts/sdd-init-federation.test.js`)
- Total tests passing (full native suite): 337 (327 WU1+WU2 baseline + 10 WU3)
- Layers used: Unit / content-contract (10)
- Approval tests (refactoring): None — WU3 only adds new doc sections; no existing test modified
- Pure functions created: None — WU3 is a documentation-contract deliverable (no executable code)

## Files touched (WU3)

| File | Action | What was done |
|------|--------|---------------|
| `skills/sdd-init/SKILL.md` | Modified (additive) | Added `## Pre-Execution: Federated Bridge` section (Step 0a `target_dir` resolution + Step 0b multirepo container-detection gate). Existing sections untouched. |
| `agents/sdd-init.agent.md` | Modified (additive) | Added a `## Parameters` section documenting the `target_dir` contract + orchestrator-injection note. Existing sections untouched. |
| `scripts/sdd-init-federation.test.js` | Created | 10 RED-first content-contract tests pinning the WU3 behavior in the two markdown files. |
| `openspec/changes/federation-distributed-markers/tasks.md` | Modified | Phase 4 (4.1–4.2) checked off `[x]`. |
| `openspec/changes/federation-distributed-markers/state.yaml` | Modified | `WU3.status: done` (phases `[Phase 4]`); chain slice WU3 `done`; apply stays `partial`, top-level `applying`. |
| `openspec/changes/federation-distributed-markers/apply-progress.md` | Modified | Appended this WU3 section; WU1 + WU2 history preserved verbatim. |

## Suggested work-unit commit (WU3)

Not committed/pushed (left staged-ready for the maintainer). Suggested single work-unit commit grouping the WU3 contract test + the two documentation edits:

```
feat(federation): puente federado de sdd-init con target_dir y deteccion de contenedor multirepo

Documenta en skills/sdd-init/SKILL.md el paso de pre-ejecucion: resuelve target_dir desde el
bloque ## Parameters (ausente o clave faltante -> cwd; presente con ENOENT -> status blocked +
question_gate invalid-path, sin escrituras) y la puerta de deteccion de contenedor a profundidad
1 (sin .git propio Y >=2 hijos con .git de tipo directorio o archivo -> status blocked +
question_gate con las opciones federated/normal, antes de cualquier escritura; repo unico con
.git propio y <2 hijos continuan el flujo normal). Anade en agents/sdd-init.agent.md la seccion
## Parameters con el contrato de target_dir (ausente -> cwd; valido -> init acotado a esa ruta;
inexistente -> blocked + question_gate) y la nota de que el orquestador inyecta el bloque, no
variables de entorno ni frontmatter dinamico. Fija el contrato con scripts/sdd-init-federation.test.js
(10 tests de contenido RED-first). Cobertura TDD: 10 tests nuevos; suite completa 337/337 en verde.
```

## Deviations from design (WU3)

None blocking. Implementation notes:
- **Contract-as-tests for a docs deliverable**: WU3 has no executable code, so strict TDD was
  honored by writing a content-contract test (`scripts/sdd-init-federation.test.js`) RED-first,
  asserting the required behavioral tokens in the two markdown files. This mirrors the repo's
  established markdown content-contract tests (`docs-lint.test.js`, `manifest-sync.test.js`) and
  gives the verify phase an executable gate for the WU3 behavior.
- **Wording tuned to the contract regexes**: two prose phrasings were adjusted during GREEN so
  the contract tokens read contiguously (`two or more (≥2) … .git`, `no own .git`, `absent → cwd`)
  — no behavioral change, only word order, so the documented contract and its test agree.
- **No generator/agent regeneration needed in-repo**: `agents/*.agent.md` + `skills/**` are the
  source of truth; the 4-target generators (claude/vscode/github-copilot/opencode) ran inside
  `npm test` and validated the edits (`0 errors, 0 warnings`). No committed `dist/` exists to update.

## Remaining work (NOT in this batch)

- [ ] WU4 (Phase 5) — `sdd-workspace` `enroll` + `explore`/`classify` subcommand (depends on WU1+WU2).
- [ ] WU5 (Phase 6) — `.gitignore`, `persistence-contract.md`, orchestrator note + final verification (depends on WU1–WU4).

**Next recommended**: run WU4 — `sdd-workspace` `enroll` + `explore` subcommand (depends on WU1+WU2, both already committed).
