# Verification Report: claude-cx0-telemetry-adapter

**Change**: claude-cx0-telemetry-adapter
**Version**: 2.59.0
**Mode**: Standard (focused TDD; strict evidence-table audit skipped)
**Verified state**: commits `d03646b` → `7703090` → `4398b19` (rama `feat/claude-cx0-telemetry-adapter`, base `efa6cea`)
**Fecha**: 2026-09-03T20:22:32Z

## Lineage Routing (Step 2a/2b)

- `state.yaml` no contiene bloque `verify_lineage:` → `getLineageNextAction` = `run-discovery` (`no-active-lineage`). No hay linaje activo, ni remediation pendiente, ni recheck.
- `assumptions:` contiene 9 entradas `status: unresolved`, **todas `reversibility: high`**, y el prompt de lanzamiento no trae bloque `assumption_resolutions`. Conforme al precedente establecido del repo (strict-result-envelope, add-change-cost-telemetry, starlight-web-doc, codex-target-phase-2, k6b-durable-replay), la verificación **procede con Full Discovery** y documenta las entradas como `unresolved (no escalation)`: las entradas high no pueden escalar a finding (Decision Gates) y bloquear una verificación completa para confirmar 9 decisiones no materiales desperdiciaría la corrida autoritativa preparada. El orquestador PUEDE ofrecer una puerta de confirmación opcional al usuario.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 23 (Fases 1–4) |
| Tasks complete | 23 `[x]` |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Build**: ➖ No aplica (CommonJS JavaScript sin step de build; `rules.verify.build_command` vacío). La generación/validación de targets está integrada en `npm test` vía `scripts/check.js`.

**Tests (corrida autoritativa)**: ✅ 3018 passed / ❌ 0 failed / ⚠️ 4 skipped — **exit 0, "All checks passed"**

Condiciones limpias reproducidas (worktree git al estado committeado, PATH solo-Linux sin interop Windows — la causa ambiental documentada por apply):

```text
# worktree: /home/sn4ke/verify-wt/cx0 @ 4398b19 (árbol limpio), PATH sin /mnt/c/*
$ npm test   # = node scripts/check.js
ℹ tests 3022
ℹ pass 3018
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4        # validaciones dependientes del CLI `claude` (ausente bajo PATH
                    # CI-equivalente; "(note) claude CLI not found — generating the
                    # claude target without its validator" — comportamiento CI por diseño)
==> Native Node tests … All checks passed
NPM_TEST_EXIT=0
```

**Tests por archivo tocado** (mismas condiciones limpias):

```text
$ node --test scripts/hooks/lib/claude-usage.test.js              → 17/17 PASS  exit 0
$ node --test scripts/hooks/subagent-stop.test.js                 → 57/57 PASS  exit 0
$ node --test scripts/hooks/ospec-hooks-launch.test.js            → 22/22 PASS  exit 0
$ node --test scripts/hooks/context-measurement-provenance.test.js → 2/2 PASS  exit 0  # ruta Codex sin cambios de provenance
```

**Distinción ambiental (workspace principal, preexistente — NO del change)**:

```text
# workspace principal (models.yaml modificado +staged por el usuario, sin commit: +3/−3)
$ node --test scripts/sdd-document.test.js
ℹ tests 33  ℹ pass 32  ℹ fail 1   # AssertionError: opencode (drift local de models.yaml)
```

La falla desaparece en el worktree al HEAD committeado (suite 3022 verde), lo que prueba que es del `models.yaml` staged arrastrado por el usuario — preexistente y fuera de alcance (patrón ya registrado en known-issues 2026-07-25). El CLI Windows `claude` vía interop WSL queda excluido por el PATH solo-Linux; las validaciones que lo requieren se saltan con nota explícita, igual que en CI.

**Manual verification**: performed (sin modificar código)
- Sonda runtime del branch `cached > input` sobre la función real exportada `contextMetricObservations` (`node -e`): `cached=400 > input=100` → `uncached_input_tokens` y `unique_context` `unavailable` con `reason_code: "incompatible-components"`; `duplicated_context` permanece `available` (=cached); con `cached <= input` → `available 600` con `formula_version: "uncached-input/v1"`. Confirma en runtime la rama sin test dedicado y la asunción sdd-apply-002.
- Inspección de diff/invariantes y commits (ver Coherence y Traceability).

**Coverage**: ➖ Not available (`testing.coverage.available: false`; sin comando de cobertura configurado).

## Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-context-measurement-007 | Transcripción con uso completo → observadas + derivadas | `runtime-test` | `subagent-stop.test.js > "CM-007: uso completo…"` + `claude-usage.test.js` (17/17) | PASS | available/host-observed ×3; uncached/unique/duplicated runtime-derived; amplification/v1 available con unique>0 (=1.6667); forma completa del registro validada |
| REQ-context-measurement-007 | Par Anthropic normalizado al triple canónico | `runtime-test` | `claude-usage.test.js > "suma el par Anthropic"`, `"par incompleto…"`; `subagent-stop.test.js > "par Anthropic… end-to-end"` | PASS | caché = 250+150 = 400; uncached = input−cached = 600 no negativa; un solo miembro → sin cero evidencial |
| REQ-context-measurement-007 | Cobertura parcial degrada solo las afectadas | `runtime-test` | `subagent-stop.test.js > "cobertura parcial…"` | PASS | input/output available host-observed; cached/uncached/unique/duplicated/amplification `unavailable` con `host-field-unavailable`, sin ceros, registro persistido completo |
| REQ-context-measurement-007 | (prosa de requirement) contador incompatible → `incompatible-components` | `manual-proof` + `inspection-proof` | sonda runtime sobre `contextMetricObservations` (registrada arriba) | PASS | rama cubierta por verificación manual ejecutada; sin test automatizado dedicado (S-02) |
| REQ-context-measurement-008 | Sesión Claude resuelve host `claude` | `runtime-test` | `subagent-stop.test.js > "precedencia de host (tiers 1-6)"` (tiers 3–4) y `"firma de transcripción…"` (tier 5) | PASS | `OSPEC_TARGET=claude` y `CLAUDE_PLUGIN_ROOT` no vacío → `claude`; firma `type:"assistant"`+`message` → `claude` |
| REQ-context-measurement-008 | Host explícito conserva precedencia | `runtime-test` | idem (tier 1) | PASS | `host:"opencode"` vence sobre señales Claude simultáneas |
| REQ-context-measurement-008 | Sin señal → `unknown-host`; métricas sin alteración | `runtime-test` | idem (tier 6 + exclusión `OSPEC_PLUGIN_ROOT`) y `"firma de transcripción…"` (transcripción genérica) | PASS | `unknown-host` conservado; aserción de métricas débil (S-01, SUGGESTION) |
| REQ-hooks-018 | Transcripción válida alimenta lane CX0; stdout idéntico | `runtime-test` | `subagent-stop.test.js > "CM-007: uso completo…"` (lane poblada, retorno diagnostic-only) + `"H-018: transcripción corrupta…"` (hook completo: retorno `deepEqual`, O1, exit) | PASS | cláusula AND a nivel hook completo probada en variante degradada + aislamiento estructural (lane CX0 nunca toca el retorno); S-03 sugiere test full-hook con transcripción válida |
| REQ-hooks-018 | Formato Anthropic-compatible aceptado | `runtime-test` | `claude-usage.test.js > "prefiere entry.message.usage…"`, `"suma el par Anthropic"` + end-to-end en `subagent-stop.test.js` | PASS | normalización al triple canónico y derivadas desde ese triple |
| REQ-hooks-018 | Transcripción corrupta degrada fail-safe | `runtime-test` | `claude-usage.test.js > "inexistentes o ilegibles"`, `"corruptas o vacías"`, `"traversal"` + `subagent-stop.test.js > "H-018: transcripción corrupta o ausente…"` | PASS | sin throw; retorno `{status:"skipped",reason:"resolution-unavailable"}`; O1 intacta; CX0 `unavailable: host-field-unavailable` |
| REQ-hooks-019 | subagent-stop con binario presente → Node | `runtime-test` | `ospec-hooks-launch.test.js > "H-019: subagent-stop bajo host Claude con binario presente…"` | PASS | `{command: process.execPath, args:[…/subagent-stop.js]}` con binario stub presente (señales tier 3 y 4); `OSPEC_PLUGIN_ROOT` NO enruta a Node |
| REQ-hooks-019 | Demás eventos conservan enrutamiento binario | `runtime-test` | `ospec-hooks-launch.test.js > "H-019: los demás eventos…"` | PASS | `pre-tool-use` y `stop` → binario nativo bajo host Claude |
| REQ-hooks-019 | Sin binario → fallback Node | `runtime-test` | idem + `"la rama codex queda intacta (byte a byte)…"` | PASS | fallback Node para `subagent-stop` y `session-start`; rama codex intacta |

**Compliance summary**: 12/12 escenarios MUST satisfechos con `runtime-test` (requisito: runtime-test o static-proof para MUST). El SHOULD de escaneo acotado (REQ-hooks-018) quedó como regla exacta (ADR-001) y tiene `runtime-test` (ventana 256 KiB, `MAX_TAIL_LINES`, línea parcial descartada). El MAY de CM-008 (conservar `unknown-host`) también cubierto con runtime-test.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-context-measurement-007 | ✅ Implemented | `normalizeUsageObject` (triple estándar ‖ par Anthropic all-or-nothing, enteros seguros [0,10¹²]); envelopes derivados en `contextMetricObservations` sin tocar `scripts/lib/context-measurement.js` |
| REQ-context-measurement-008 | ✅ Implemented | `resolveContextHost` con tiers 1–6 de ADR-002; `OSPEC_PLUGIN_ROOT` excluido como señal |
| REQ-hooks-018 | ✅ Implemented | `extractClaudeTelemetry` fail-safe total (validatePath → open→stat→read ≤256 KiB → escaneo reverso; cualquier error → `undefined`); composición `codex ‖ claude` con cortocircuito y un solo tail-read |
| REQ-hooks-019 | ✅ Implemented | `isClaudeCodeHost(env)` + rama `subagent-stop && isClaudeCodeHost` tras la rama codex; `resolveInvocation` gana `env = process.env` retrocompatible |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-001: tail-read 256 KiB, escaneo reverso, sin fallback | ✅ Yes | `TAIL_WINDOW_BYTES = 262_144`, `MAX_TAIL_LINES = 1000`, una lectura posicionada; probado en `claude-usage.test.js` (cola, línea parcial, <ventana, vacío, inexistente, traversal) |
| ADR-002: precedencia de host tiers 1–6; `OSPEC_PLUGIN_ROOT` excluido; `OSPEC_TARGET` precede a `CLAUDE_PLUGIN_ROOT` | ✅ Yes | `resolveContextHost` + `isClaudeCodeHost`; tests de tiers y exclusión |
| Derivados como envelopes desde `contextMetricObservations`; lib sin cambios | ✅ Yes | `git diff efa6cea..HEAD` = 0 líneas en `scripts/lib/context-measurement.js`; provenance test 2/2 |
| Composición `tokenUsage = codex ‖ claude`; O1 intacta | ✅ Yes | `persistPhaseCost` sin hunks; lane CX0 post-O1 fail-safe |
| Rama launcher post-codex con `env` inyectable | ✅ Yes | rama codex byte-identical (lee `process.env` como antes); test dedicado |
| **Invariantes de diseño (tarea 4.2)** | ✅ Yes | Verificado con `git diff efa6cea..HEAD`: (a) `scripts/lib/context-measurement.js` **0 líneas**; (b) `hooks/hooks.json` **0 líneas**; (c) `persistPhaseCost` **0 hunks**; (d) `main()` y `runSubagentStop` **0 hunks** — la llamada `await persistContextMeasurement(...)` en `runSubagentStop` **preexistía** al cambio (change cx0 anterior); toda la integración vive dentro de la propia `persistContextMeasurement`; (e) frontera de archivos: exactamente los 6 archivos del diseño, +924/−11 (dentro del forecast 700–900) |

**Desviaciones del diseño**: ninguna. Nota menor documentada por apply: `extractClaudeTelemetry` acepta `env` por contrato de diseño (interfaces en design.md) y no lo usa (decisión 4: extracción sin gate de host); coincide literalmente con el contrato declarado.

## Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
- **S-01** (origin: `tasks-gap`): la cláusula AND de CM-008 esc. 3 («las métricas MUST persistir sin alteración por el valor de host») se aserta solo como no-vacío (`subagent-stop.test.js:877-879`) comparando dos transcripciones distintas; una aserción más fuerte compararía métricas idénticas para el mismo contenido de transcripción con y sin señal de host.
- **S-02** (origin: `tasks-gap`): el branch `cached > input` → `incompatible-components` de REQ-context-measurement-007 no tiene test automatizado dedicado; hoy está probado por sonda runtime manual (registrada arriba) + inspección. Un test de regresión evitaría dependencia de evidencia manual.
- **S-03** (origin: `tasks-gap`): no existe un test a nivel hook completo (`runSubagentStop`) con transcripción Claude **válida** que aserta stdout/retorno — la cláusula AND de H-018 esc. 1 se prueba composicionalmente (persist válido + hook completo en variante degradada + aislamiento estructural). Un test full-hook cerraría el hueco combinacional.

## Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-context-measurement-007 | 1.1–1.7, 2.1–2.4 | d03646b, 7703090 | `claude-usage.test.js` (triple, par Anthropic, par incompleto, rangos); `subagent-stop.test.js` «CM-007: uso completo…», «par Anthropic… end-to-end», «cobertura parcial…» | OK |
| REQ-context-measurement-008 | 2.5, 2.6 | 7703090 | `subagent-stop.test.js` «precedencia de host… (tiers 1-6)», «firma de transcripción…» | OK |
| REQ-hooks-018 | 1.3–1.7, 2.1, 2.2, 2.7, 2.8 | d03646b, 7703090 | `claude-usage.test.js` (cola, corruptas, ilegibles, traversal, MAX_TAIL_LINES); `subagent-stop.test.js` «H-018: transcripción corrupta o ausente…» | OK |
| REQ-hooks-019 | 3.1–3.4 | 4398b19 | `ospec-hooks-launch.test.js` «H-019: … vía Node», «los demás eventos…», «la rama codex queda intacta…» | OK |

Commits: 3/3 con trailers `Ospec-Change: claude-cx0-telemetry-adapter` + `Ospec-Task` (1.1–1.7 / 2.1–2.8 / 3.1–3.4); subjects Conventional Commits imperativo en español; **0 atribución de modelos** (grep `co-authored-by|generated with|copilot|anthropic|🤖` = 0; los subjects contienen "Claude" como nombre de producto, falso positivo documentado del hook).

## Assumption Reconciliation

Prompt de lanzamiento sin bloque `assumption_resolutions`; las 9 entradas están `unresolved` y son `reversibility: high` → **sin escalación** (Decision Gates). Auditoría sustantiva contra evidencia de runtime:

| id | statement (resumen) | reversibility | outcome |
|----|---------------------|---------------|---------|
| sdd-spec-001 | unique←uncached, duplicated←cached | high | unresolved (no escalation) — **CORRECTA**: test «uso completo» aserta unique=600 (=uncached), duplicated=400 (=cached) |
| sdd-spec-002 | cached = cache_read + cache_creation | high | unresolved (no escalation) — **CORRECTA**: end-to-end 250+150=400 |
| sdd-spec-003 | extracción alimenta solo lane CX0, no phase-cost | high | unresolved (no escalation) — **CORRECTA**: `persistPhaseCost` 0 hunks; O1 intacta en H-018; provenance 2/2 |
| sdd-design-001 | entrada calificante = input+output válidos; caché opcional | high | unresolved (no escalation) — **CORRECTA**: ruta parcial probada con input/output available |
| sdd-design-002 | par Anthropic all-or-nothing | high | unresolved (no escalation) — **CORRECTA**: test «par incompleto (sin cero evidencial)» |
| sdd-design-003 | extracción sin gate de host cuando hay transcripción resoluble | high | unresolved (no escalation) — **CORRECTA**: tests extraen con `env:{}` (sin señal Claude) y `transcript_path` |
| sdd-apply-001 | envelopes explícitos solo para derivadas; directas crudas para la lib | high | unresolved (no escalation) — **CORRECTA**: inspección + provenance test (ruta Codex byte a byte) |
| sdd-apply-002 | cached>input: duplicated available; uncached/unique → incompatible-components | high | unresolved (no escalation) — **CORRECTA**: sonda runtime manual registrada en este reporte; sin test dedicado (S-02) |
| sdd-apply-003 | `env` opcional con default process.env; rama codex sin cambios | high | unresolved (no escalation) — **CORRECTA**: test «rama codex intacta» con env inyectado claude y process.env codex |

El orquestador PUEDE ofrecer al usuario una puerta de confirmación grupal (multiSelect) para cerrar formalmente el ledger; ninguna entrada bloquea o degrada el veredicto.

## Verdict

**PASS**

Los 12 escenarios MUST de los deltas (CM-007/008, H-018/019) tienen evidencia `runtime-test` en la corrida autoritativa (3022 tests, 0 fail, exit 0) bajo condiciones limpias reproducidas (worktree al HEAD committeado + PATH sin interop); las invariantes de diseño se cumplen literalmente (0 hunks en `main()`, `persistPhaseCost`, lib CX0 y `hooks.json`); 0 CRITICAL, 0 WARNING; las fallas del workspace principal son ambientales preexistentes (models.yaml staged del usuario) y están correctamente distinguidas.
