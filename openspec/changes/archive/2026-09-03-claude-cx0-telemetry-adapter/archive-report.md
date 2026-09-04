# Archive Report: claude-cx0-telemetry-adapter

**Change**: claude-cx0-telemetry-adapter
**Fecha**: 2026-09-03
**Ruta**: standard (clasificación: normal) · Rama: `feat/claude-cx0-telemetry-adapter`
**Destino propuesto**: `openspec/changes/archive/2026-09-03-claude-cx0-telemetry-adapter/`
**Modo de ejecución**: Plan-and-Report — este executor prepara contenido y emite `archive-plan.json`; la escritura viva de `openspec/specs/**` y `docs/adr/**`, el commit de la carpeta y el borrado del origen son del runtime de transacción (`node scripts/archive-transaction-run.js claude-cx0-telemetry-adapter`).

## Puerta de cierre

| Verificación | Resultado |
|---|---|
| Veredicto `sdd-verify` | **PASS** (verify-report.md, corrida autoritativa: 3022 tests / 0 fail / exit 0, worktree limpio @ `4398b19`) |
| Escenarios MUST | 12/12 con evidencia `runtime-test` (CM-007/008, H-018/019) |
| CRITICAL / WARNING en verify | 0 / 0 — 3 SUGGESTION (S-01, S-02, S-03) registradas como no bloqueantes |
| Quality Review Gate | **Approved** — linaje `sha256:9363fc290a4f11f4a0e01d61dba55f88bccbe0f8a4d3dcd1bc93f600da145446` (`.ospec/cache/claude-cx0-telemetry-adapter-quality-lineage.json`), generación 1, `terminal_reason: no-unresolved-blocking-findings` |
| Quality gates policy | No declarada en `openspec/config.yaml` (no-op estricto) |
| Tareas | 23/23 `[x]` (tasks.md) |

**Hallazgos congelados del gate (follow-ups no bloqueantes, viajan como trabajo pendiente — no son aceptación de riesgo de verify)**:

- `F-73c1e22da8af21c9` (WARNING, efficiency): lectura completa e ilimitada del transcript en la ruta Codex preexistente antes del tail-read acotado (ADR-001) — dominar el coste de I/O por invocación.
- `F-a04df11f53012527` (SUGGESTION, runtime): override asimétrico de `OSPEC_TARGET` sobre `CLAUDE_PLUGIN_ROOT` en la clasificación de host.
- `F-328e9d8acf8daca0` (SUGGESTION, efficiency): `analyzeTranscriptTail` sin break temprano cuando uso y firma ya quedaron resueltos.

## Deltas y merge (no destructivo)

`rules.archive` ("Warn before merging destructive deltas"): **no aplica** — ambos deltas son **ADDED-only** (0 MODIFIED, 0 REMOVED). Advertencia destructiva no emitida porque no existe eliminación de contenido.

| Dominio | Acción | Detalle | Merge |
|---|---|---|---|
| `context-measurement` | Prepared | +2 requisitos (REQ-context-measurement-007/008), +6 escenarios; REQ IDs 6 → 8 | Append al final del baseline (tras REQ-006), separación de 1 línea en blanco |
| `hooks` | Prepared | +2 requisitos (REQ-hooks-018/019), +6 escenarios; REQ IDs 10 → 12 | Inserción en §1.5 tras REQ-hooks-017 (CX0 emission, temática continuada) y antes de REQ-hooks-003 |

**Contenido preparado (change-local, viaja al archive como auditoría)**:

| `source_delta` | `target` | `target_before_sha256` (bytes vivos) | `content_sha256` (bytes preparados) |
|---|---|---|---|
| `prepared/context-measurement.spec.md` | `openspec/specs/context-measurement/spec.md` | `sha256:7997ef6ff3232ec03a682e315c38f6ee86c3ae679cbaaeca892cc59fa282f73f` | `sha256:0c879c87e66c0c9a8eb4347c91c0e8822036f19ab9c1727440f9e1fc8efe62a5` |
| `prepared/hooks.spec.md` | `openspec/specs/hooks/spec.md` | `sha256:01035d84b06fb703981f2ec3280a2cf4886d8be963b608339f6d9fa8a3799d74` | `sha256:ee029417204548b8666b3d73b4e6afc9131fba9463921cc1277805861b0c5eaa` |

Ambos `target_before_sha256` coinciden con `baseline_fingerprints` en `state.yaml` y con los bytes vivos actuales → **sin baseline stale**.

**Nota EOL**: los baselines viven con CRLF en el working tree (`git ls-files --eol`: `i/lf w/crlf` — artefacto de checkout Windows/WSL; el blob canónico es LF). El contenido preparado se normalizó a **LF puro** para evitar finales mixtos con los deltas (LF) y alinearse con el blob canónico del repositorio. El stale-check del runtime compara contra los bytes vivos actuales, que son los declarados arriba.

## Promoción de ADRs (propuesta)

Ninguna decisión invalidada durante verify (Coherence: ADR-001 ✅, ADR-002 ✅). Sin colisión de nombres: el sufijo máximo existente para 20260903 en `docs/adr/` es 008.

| Origen (change-local) | Destino propuesto | `content_sha256` |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260903-009-bounded-tail-read-window-for-claude-transcripts.md` | `sha256:9bdd7aec171c65c8fad68a0cd331342785a94292fdc5d8996a2ee43db1e9a5a3` |
| `decisions/adr-002.md` | `docs/adr/adr-20260903-010-claude-host-detection-precedence.md` | `sha256:77a8c5dfcf94d0065270e116515062e2af341f345525d8fe0d06f1bb3f1d32dd` |

Las copias change-local bajo `decisions/` viajan al archive (audit trail); `docs/adr/` se convierte en memoria viva solo cuando el runtime aplique las promociones durante el commit.

## Disposición del ledger de asunciones

`state.yaml` registra 9 asunciones `status: unresolved`, todas `reversibility: high`. `sdd-verify` las auditó sustantivamente contra evidencia de runtime, todas **CORRECTA**, sin escalación (no pueden escalar a finding por las Decision Gates). El prompt de lanzamiento de verify no traía bloque `assumption_resolutions` y `sdd-archive` no tiene autoridad para mutar su estado: permanecen en `state.yaml` como audit trail; el cierre formal queda en manos del orquestador (puerta de confirmación grupal opcional ya señalada en verify-report.md).

| id | Resumen | Reversibilidad | Resultado de la auditoría (verify) |
|---|---|---|---|
| sdd-spec-001 | unique←uncached, duplicated←cached | high | CORRECTA (test «uso completo»: unique=600, duplicated=400) |
| sdd-spec-002 | caché Anthropic = cache_read + cache_creation | high | CORRECTA (end-to-end 250+150=400) |
| sdd-spec-003 | extracción alimenta solo lane CX0, no phase-cost | high | CORRECTA (`persistPhaseCost` 0 hunks; O1 intacta; provenance 2/2) |
| sdd-design-001 | entrada calificante = input+output válidos; caché opcional | high | CORRECTA (ruta parcial probada) |
| sdd-design-002 | par Anthropic all-or-nothing | high | CORRECTA (test «par incompleto», sin cero evidencial) |
| sdd-design-003 | extracción sin gate de host con transcripción resoluble | high | CORRECTA (tests con `env:{}` y `transcript_path`) |
| sdd-apply-001 | envelopes solo para derivadas; directas crudas | high | CORRECTA (inspección + provenance byte a byte) |
| sdd-apply-002 | cached>input: duplicated available; uncached/unique → incompatible-components | high | CORRECTA (sonda runtime manual; sin test dedicado → S-02) |
| sdd-apply-003 | `env` opcional default process.env; rama codex intacta | high | CORRECTA (test «rama codex intacta») |

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/claude-cx0-telemetry-adapter/phase-costs.jsonl` missing or empty). Las cifras de coste no gatean el archivo (`REQ-hooks-001`: estimates heurísticos ~4 bytes/token; autoridad de cierre de coste en el receipt del runtime).

**Total user questions asked**: 0 (sin bloque `gates:` en `state.yaml` → suma 0, per ADR-20260704-001)

## Reparación de estado (mínima, documentada)

`readArchiveGateFacts` del runtime exige `phases.verify.verdict` en `state.yaml` (si falta → `gate-not-satisfied`). El bloque `phases.verify` no lo traía. Se añadió `verdict: "PASS"` como reflejo literal del veredicto de `verify-report.md` — sin invención de contenido. Demás campos del estado: solo `phases.archive` (done + resumen) y `status: archived`, conforme al protocolo de fase.

## Inventario de archivo (resumen del plan)

13 rutas bajo `openspec/changes/claude-cx0-telemetry-adapter/` (excluye `archive-plan.json`, que se copia al staging fuera del fingerprint):

`apply-progress.md`, `archive-report.md`, `decisions/adr-001.md`, `decisions/adr-002.md`, `design.md`, `prepared/context-measurement.spec.md`, `prepared/hooks.spec.md`, `proposal.md`, `specs/context-measurement/spec.md`, `specs/hooks/spec.md`, `state.yaml`, `tasks.md`, `verify-report.md`

## Contenido del archive (checklist)

- proposal.md ✅
- specs/ (deltas originales, intactos) ✅
- design.md ✅ (2 decisiones + 2 ADRs)
- tasks.md ✅ (23/23)
- apply-progress.md ✅ (3 commits: d03646b, 7703090, 4398b19)
- verify-report.md ✅ (PASS)
- decisions/ ✅ (viajan al archive)
- prepared/ ✅ (bytes merged hashados en el plan)
- archive-plan.json ✅ (emitido; fuera del fingerprint)

## Movimiento y commit pendientes (runtime-owned)

El directorio origen `openspec/changes/claude-cx0-telemetry-adapter/` **sigue existiendo**. La escritura viva de `openspec/specs/**` y `docs/adr/**`, el staging, la comparación, el commit atómico hacia `openspec/changes/archive/2026-09-03-claude-cx0-telemetry-adapter/` y el borrado del origen son responsabilidad del orquestador vía `node scripts/archive-transaction-run.js claude-cx0-telemetry-adapter`; el receipt de éxito del runtime es la única autoridad de cierre. Este reporte no afirma el movimiento completado.
