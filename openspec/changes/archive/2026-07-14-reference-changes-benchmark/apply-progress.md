# Apply progress — benchmark simplificado

## Resultado

El harness usa tres perfiles core para obtener señal temprana; los nueve perfiles quedan como suite ampliada. La métrica primaria es run-level: uso terminal sellado y duración medida. O1 es suplementario y nunca se sintetiza ni se redistribuye con pesos.

La cache conserva transcript y observación, recalcula la fila al abrirla y exige coincidencia exacta de identidad de schema, git, CLI, runtime, worktree, instalación y modelo remoto. Identidades desconocidas reducen la compatibilidad a `limited`.

## Evidencia TDD

| Ciclo | Comando | Resultado |
| --- | --- | --- |
| RED final | `node --test scripts/evals/live-driver.test.js` | 17 pass, 2 fail esperados |
| GREEN final | `node --test scripts/evals/safe-export.test.js scripts/evals/live-driver.test.js scripts/evals/run.test.js scripts/evals/lib/benchmark.test.js` | 52/52 pass; 0 fail, skip o todo |

No se ejecutó live/canary, no se consumió cuota externa y no se creó `reference-baseline.md`. Estado actual: 0/3 core aceptados.

## Batch identidad causal/derivada — 2026-07-14

Delivery: `exception-ok`; `size:exception` ya aceptado. Se añadió un contexto productivo inmutable que exige modelo remoto no blanco, pasa el mismo valor a `codex exec --model` y lo conserva en el descriptor. La identidad instalada se deriva de un SHA-256 canónico de los bytes auditados después de parity y preflight; `OSPEC_INSTALLED_RUNTIME_IDENTITY` ya no tiene autoridad. `runLiveProfile` y `runLiveSuite` rechazan inyección de contexto/dependencias.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 | `safe-export.test.js` | Unit | DEFERRED: no consta baseline por tarea | agregado histórico 53 PASS / 5 FAIL | agregado histórico 53/53 PASS | DEFERRED: no consta evidencia separada | DEFERRED: no consta evidencia separada | El orden RED→GREEN agregado consta en la sesión previa; no se atribuyen contadores por tarea. |
| 1.2 | `live-driver.test.js`, `run.test.js` | Integration | DEFERRED: no consta baseline por tarea | agregado histórico 53 PASS / 5 FAIL | agregado histórico 53/53 PASS | DEFERRED: no consta evidencia separada | DEFERRED: no consta evidencia separada | Implementación local verificada; ciclo granular pendiente de auditoría en verify. |
| 1.3 | `lib/benchmark.test.js` | Unit | DEFERRED: no consta baseline por tarea | agregado histórico 53 PASS / 5 FAIL | agregado histórico 53/53 PASS | DEFERRED: no consta evidencia separada | DEFERRED: no consta evidencia separada | No se fabrica una secuencia más precisa que la evidencia disponible. |
| 1.4 | `live-driver.test.js` | Unit/integration | DEFERRED: no consta baseline por tarea | agregado posterior 17 PASS / 2 FAIL | focal agregado 52/52 PASS | DEFERRED: no consta evidencia separada | DEFERRED: no consta evidencia separada | Cache/O1 quedaron verdes, pero el registro histórico no separa todas las subfases TDD. |
| 2.1 | `scripts/evals/live-driver.test.js` | Unit | 19/19 PASS | 18 PASS / 3 FAIL; faltaban `--model`, resolver y rechazo de env falsificado | 21/21 PASS | modelo A/modelo B/blanco | 21/21 PASS | El argumento real y descriptor comparten el valor normalizado. |
| 2.2 | `scripts/evals/live-driver.test.js` | Unit/integration local | 19/19 PASS | mismo RED; identidad instalada seguía aceptando env | 21/21 PASS | bytes iguales/diferentes, stale y preflight fallido | 21/21 PASS | Preflight local sin red; digest posterior sobre tres archivos auditados. |
| 2.3 | `scripts/evals/live-driver.test.js` | Unit | 19/19 PASS | test de invocación exigió `--model` y falló | 21/21 PASS | dos modelos y blanco | 21/21 PASS | Resolver privado usado antes del spawn. |
| 2.4 | `scripts/evals/live-driver.test.js` | Unit/integration local | 19/19 PASS | test de env falsificado y resolver inexistente falló | 21/21 PASS | digest estable/cambiante y errores fail-closed | 21/21 PASS | `assertInstalledO1Runtime` precede al preflight y al hash. |
| 2.5 | `scripts/evals/live-driver.test.js` | Unit | 21/21 PASS | N/A: triangulación/refactor sobre GREEN | 21/21 PASS | identidad distinta, desconocida e inyección rechazada | 21/21 PASS | Sin callbacks productivos; helpers inyectables limitados a `testing`. |

### Test Summary

- Tests nuevos: 2 casos; además se triangularon 2 casos existentes con modelo distinto/blanco e inyección productiva.
- Safety net: 19/19 PASS.
- RED observado: 18 PASS / 3 FAIL esperados.
- GREEN y refactor focal de archivo: 21/21 PASS.
- Suite focal autorizada: 54/54 PASS, 0 fail/skip/todo.
- Capas: unit e integración local sin red; E2E live no ejecutado.
- Pure functions creadas: 1 (`normalizeRemoteModelIdentity`); digest/contexto encapsulados por separado.
- `npm test`: DEFERRED a `sdd-verify` por instrucción explícita; tarea 3.2 queda `[~]`.

No se ejecutó live/canary, no se consumió cuota externa, no se creó baseline y el estado experimental sigue 0/3 core.

## Cierre de apply local — 2026-07-14

- [x] Task 3.2: `npm test` finalizó con exit 0; `scripts/check.js` informó `All checks passed`, 0 errores y 0 warnings.
- [x] Go: `go test ./...` con `GOCACHE` temporal escribible fuera del repositorio; 9/9 paquetes PASS (`cmd/ospec-hooks` y ocho paquetes `internal/*`).
- [x] Higiene: `git diff --check` finalizó con exit 0; solo mostró avisos informativos de futura normalización LF→CRLF, sin errores de whitespace.

Apply local queda completo. Permanecen sin ejecutar y sin marcar: piloto live core 3/3, publicación del baseline, `sdd-verify` y 4R final. `blocking_questions` conserva el estado 0/3.

## Canary live 2026-07-14

- Instalación/sincronización: `node scripts/configure/install-codex.js` y posterior `--dry-run`, ambos exit 0 con 0 errores y 0 warnings.
- Ejecución autorizada: `OSPEC_REMOTE_MODEL_IDENTITY=gpt-5.6-sol`; `OSPEC_INSTALLED_RUNTIME_IDENTITY` eliminado solo para el proceso; `node scripts/evals/live-driver.js initial` terminó exit 1 tras 736.3 s.
- Canary `docs-one-file`: sesión `019f5db8-84a4-78c2-83aa-4723f35b70d1`; input 2,063,031; cached input 1,965,568; output 12,820; reasoning output 5,104.
- Resultado interno: `verify-report.md` live con PASS, 0 critical, 0 warning y 0 suggestion; `state.yaml` sintético quedó `verified`.
- Rechazo host post-run: `Synthetic git untracked allowlist mismatch: .eval-capture/codex-events.jsonl,.ospec/cache/skill-registry.cache.json,.ospec/session/latest.md.`
- Log completo: `scripts/evals/.runs/benchmark-results/initial-live-2026-07-14.log`, SHA-256 `92DF846C1604FF04537DB197CA1AC3EE095AE141F9AD46A6C80990CE62981679`.
- Workspace preservado: `C:\Users\sn4ke\AppData\Local\Temp\ospec-safe-docs-one-file-TTUPX3`.
- Transcript: `.eval-capture/codex-events.jsonl`, SHA-256 `72f16e218bf85b879fe1e001c5f8c0f31026447c93c5cb03d6ca0c882b1a8d81`.
- Estado experimental honesto: 0/3 perfiles aceptados; `docs-one-file` ejecutado pero no cacheado, los otros dos no iniciados, y `reference-baseline.md` ausente. No hubo usage-limit, extended, archive ni rerun de verify del change principal.

## Remediación post-canary — Strict TDD 2026-07-14

Se amplió el allowlist únicamente con los tres artefactos runtime observados (`.eval-capture/codex-events.jsonl`, `.ospec/cache/skill-registry.cache.json`, `.ospec/session/latest.md`) y se mantiene el rechazo de cualquier otro untracked o redirección. Se añadió `--recover-workspace <profile> <absolute-workspace>`: solo acepta el workspace sintético correspondiente bajo temp, reconstruye y verifica el baseline Git contra el manifest canónico, reabre el transcript, comprueba sesión/hash/uso terminal, identidades obligatorias, artefactos y orden, reports, estado, observación y scoring antes de persistir cache. El modelo no se ejecuta; la versión CLI se lee offline del descriptor instalado. Threat model: `cooperative-orchestrator`, sin promesa de autenticidad criptográfica.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 4.4 allowlist | `scripts/evals/live-driver.test.js` | Integration local | 54/54 PASS | 21 PASS / 3 FAIL: APIs aún ausentes | 24/24 PASS | runtime-owned válidos; archivo arbitrario y symlink rechazados | 57/57 focales PASS | Solo tres paths nuevos; cada uno debe ser archivo regular contenido. |
| 4.4 recovery | `scripts/evals/live-driver.test.js` | Integration local sin red | 54/54 PASS | mismo RED: recovery inexistente | 24/24 PASS | éxito simulado; path externo, perfil, modelo/runtime, transcript incompleto y corrupto rechazados | 57/57 focales PASS | No acepta JSON manual ni callback productivo. |
| 4.4 orden post-exit | `scripts/evals/live-driver.test.js` | Integration local | 57/57 PASS previo | caso con `tasks.md` actualizado después del producto reprodujo `artifact group order regressed` | 57/57 PASS | creation-time de artefactos nuevos + mtime del producto; ventana temporal y hashes permanecen obligatorios | 57/57 focales PASS | Corrige el falso positivo observado en el primer recovery real. |

### Recovery real preservado

- Primer intento offline: rechazado antes de escribir outputs/cache por el falso positivo de orden `mtime`; produjo el RED de triangulación y se corrigió sin editar el workspace.
- Segundo intento offline: rechazado por `Structured ospec-benchmark-verify must be the final report block.` El JSON es válido y único, pero el informe contiene `## Verdict` después del bloque.
- Resultado fail-closed: `.eval-capture/benchmark-evidence.json`, `.eval-capture/benchmark.json`, `.eval-capture/done.json`, `scripts/evals/.runs/benchmark-results/docs-one-file/result.json` y `reference-baseline.md` permanecen ausentes.
- Modelo solicitado: `gpt-5.6-sol`; identidad runtime derivada mediante parity+preflight. No apareció ningún proceso `codex` nuevo (PID observado antes/después sin cambios) y la ruta no contiene operaciones de red.
- No se relajó el parser ni se modificó el informe live: hacerlo habría convertido el recovery en una ruta distinta o evidencia fabricada.

## Parser Verdict adversarial y recovery aceptado — 2026-07-14

Decisión aplicada sin relajación genérica: `verify-report.md` conserva la exigencia de exactamente un bloque `json:ospec-benchmark-verify`. Tras él solo se permite whitespace o la gramática completa anclada `## Verdict` + exactamente un párrafo Markdown. El párrafo debe comenzar con `PASS`, `PASS WITH WARNINGS` o `FAIL` (texto normal o bold) y coincidir exactamente con `outcome`; headings, fences, JSON, HTML, controles, segundo párrafo y bloques duplicados se rechazan. La validación independiente de estado `verified`, fase verify completada, reports, Git, artefactos y transcript no cambió.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 4.4 parser Verdict cerrado | `scripts/evals/live-driver.test.js` | Unit/integration | 24/24 PASS | exact trailing Verdict rechazado por `must be the final report block`; adversariales ya fail-closed | targeted 2/2 PASS | PASS/PASS WITH WARNINGS/FAIL iguales; mismatch, heading, fence, JSON, HTML, control, segundo párrafo y duplicado rechazados | suite focal 59/59 PASS | Solo afecta `ospec-benchmark-verify`; 4R sigue exigiendo bloque final. |

### Recovery real aceptado

- Comando offline: `node scripts/evals/live-driver.js --recover-workspace docs-one-file C:\Users\sn4ke\AppData\Local\Temp\ospec-safe-docs-one-file-TTUPX3` con `OSPEC_REMOTE_MODEL_IDENTITY=gpt-5.6-sol` y sin `OSPEC_INSTALLED_RUNTIME_IDENTITY`.
- Resultado: exit 0; sesión `019f5db8-84a4-78c2-83aa-4723f35b70d1`; transcript SHA-256 `72f16e218bf85b879fe1e001c5f8c0f31026447c93c5cb03d6ca0c882b1a8d81`; duración recuperada 733,304 ms.
- Fila run-level: input 2,063,031; output 12,820; total 2,075,851; questions 0; verify defects 0; 4R defects 0; O1 suplementario unavailable/missing y no bloqueante.
- Cache: `scripts/evals/.runs/benchmark-results/docs-one-file/result.json`, SHA-256 `24245A39CCF7B2147BB87D0E08CCFE1D263283734950FBBC60C56692FA0AED17`.
- Outputs host: `benchmark-evidence.json` SHA-256 `F5F17C91A8D75323564A59114AF9979FC722285A6A809EAF6D0723F6886F1536`; `benchmark.json` SHA-256 `025F2F363DA115828C747F36DF5B05AB0531C6DB261AC3C99B0BC47B1BE6740C`; `done.json` SHA-256 `AC1F1126F855482E9387442F12E10ED7485C18AF9D8B819C2B33BA1A3DBB2249`.
- Proceso/red: PID `codex` antes y después sin cambios (`15160`); cero procesos nuevos. La ruta reportó `network_used:false` y `spawned_model_process:false`.
- Estado experimental: 1/3 core aceptado; `small-bugfix` y `security-sensitive-change` no iniciados; baseline aún ausente. No se ejecutó initial, extended, verify principal ni archive.

## Decisión técnica de comparabilidad Luna low — 2026-07-14

Fuente: plain chat del usuario en el turno actual; no fue un ask gate y no se añade ninguna entrada al approval ledger.

- El resultado aceptado de `docs-one-file` con `gpt-5.6-sol` se preserva íntegro como evidencia diagnóstica, pero queda excluido del baseline comparable.
- El piloto comparable se reinicia conceptualmente en 0/3 y deberá usar en todos los perfiles exactamente `gpt-5.6-luna` con reasoning effort `low`.
- `reference-baseline.md` permanece ausente; `small-bugfix` y `security-sensitive-change` no se han iniciado.
- No se ejecutará live hasta completar RED/GREEN local de la identidad modelo+effort y confirmar que el contrato normativo permite esta extensión.

## Identidad causal Luna low — Strict TDD 2026-07-14

El requisito normativo ya obliga a que todas las identidades de ejecución sean conocidas y exactamente compatibles antes de reutilizar cache. `remote_reasoning_effort` se implementa como una identidad remota adicional y más estricta; no contradice ni amplía escenarios, por lo que apply no modificó spec, design ni ADR.

- Entrada productiva obligatoria: `OSPEC_REMOTE_REASONING_EFFORT`, normalizada a `low`, `medium` o `high`; blank y valores no soportados se rechazan antes del preflight/runtime.
- Invocación causal: el mismo contexto inmutable pasa exactamente `-c model_reasoning_effort="low"` junto con `--model gpt-5.6-luna` al proceso cuyos eventos se sellarán.
- Descriptor: campo separado `remote_reasoning_effort`; `compatibility_strength: strong` exige modelo, effort e identidad runtime instalada.
- Cache: effort desconocido produce `unknown-identity`; cualquier mismatch, incluido `high` frente a `low`, produce miss por incompatibilidad exacta.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 4.5 modelo+effort causal | `scripts/evals/live-driver.test.js` | Unit/integration local | 26/26 PASS previo | 22 PASS / 4 FAIL: faltaban config CLI, contexto, validación y recovery effort | 26/26 PASS | Luna low exacto; high distinto; blank/missing/max rechazados | focal 59/59 PASS; `npm test` PASS | No se ejecutó live ni modelo. |

### Readiness

- Suite focal: 59/59 PASS, 0 fail/skip/todo.
- Suite completa: `npm test` exit 0; `scripts/check.js` reportó 0 errores, 0 warnings y `All checks passed`.
- Estado comparable: Luna low 0/3; baseline ausente; resultado Sol preservado exclusivamente como diagnóstico.
- Próximo paso experimental, no ejecutado en este batch: canary Luna low `docs-one-file`; después, solo si se acepta, continuación resumible de los otros dos perfiles.

## Canary Luna low rechazado — 2026-07-14

- Comando autorizado: `node scripts/evals/live-driver.js initial` con `OSPEC_REMOTE_MODEL_IDENTITY=gpt-5.6-luna`, `OSPEC_REMOTE_REASONING_EFFORT=low` y `OSPEC_INSTALLED_RUNTIME_IDENTITY` eliminado del entorno del proceso.
- argv observado del proceso real: `--model gpt-5.6-luna` y `-c model_reasoning_effort="low"` presentes exactamente; selección `initial`, sin `extended`.
- Cache previa: resultado Sol `docs-one-file` con effort ausente, SHA-256 `24245A39CCF7B2147BB87D0E08CCFE1D263283734950FBBC60C56692FA0AED17`; produjo MISS causal Luna low y permaneció intacta tras el rechazo.
- Workspace Luna preservado: `C:\Users\sn4ke\AppData\Local\Temp\ospec-safe-docs-one-file-6vzXNr`.
- Sesión: `019f5ddf-acb5-7352-90c9-926254747f78`; transcript SHA-256 `86cfccdcb8e3e86fed7e3cb545f2d8b29ef799d4a2ff97ce4dfb7af0116e3278`; 16,531 bytes.
- Uso terminal: input 309,312; cached input 280,064; output 2,151; reasoning output 291; total primario 311,463.
- Resultado sintético aparente: state `verified`, verify report `PASS`, 0 critical/warning/suggestion.
- Rechazo host: `Host-observed execution lacks sufficient completed collab dispatch/wait evidence.` El transcript contiene 0 `collab_tool_call wait`, frente a un mínimo de 4 fases; no se acepta estado escrito sin ejecución observable real.
- Outputs/cache Luna: `benchmark-evidence.json`, `benchmark.json`, `done.json` y cache Luna ausentes. `small-bugfix` y `security-sensitive-change` no se iniciaron; baseline ausente.
- Logs: stderr `scripts/evals/.runs/benchmark-results/initial-luna-low-2026-07-14.stderr.log`, SHA-256 `C04E7B5205FD8AB2EEB9B618E6FAC5E87D4ECD939C6075846F827B41F8950032`; stdout vacío, SHA-256 `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

### Comparación de coste diagnóstica, no baseline

| Ejecución | Estado | Tokens primarios | Relación frente a Sol |
|---|---|---:|---:|
| Sol docs-one-file | diagnóstico aceptado, excluido del baseline Luna | 2,075,851 | 100% |
| Luna low docs-one-file | rechazado: 0 dispatch/waits | 311,463 | 15.0% (85.0% menos) |

La diferencia no mide una mejora comparable: Luna low omitió el flujo de delegación obligatorio y por ello consumió mucho menos. No debe usarse para concluir ahorro del harness ni publicarse en la baseline.

## Reconciliación documental para verify — 2026-07-14

La decisión arquitectónica aprobada `architecture-baseline-followup-001` redefine el cierre de este change: la infraestructura local verificada es el entregable y las ejecuciones live del piloto core, junto con la publicación de `reference-baseline.md`, pasan a seguimiento operativo post-archive no bloqueante.

- Las tareas de infraestructura local quedan completas con la evidencia Strict TDD ya registrada en este documento; este batch documental no añade ni atribuye nuevas ejecuciones de tests.
- Las afirmaciones históricas que condicionaban el cierre a 3/3 perfiles live o a la baseline quedan reemplazadas, para readiness actual, por la decisión aprobada y los artefactos normativos reconciliados.
- La ejecución Sol aceptada y el canary Luna-low rechazado se conservan íntegros como diagnósticos fuera de baseline. No cuentan como piloto core comparable ni prueban ahorro del harness.
- `sdd-apply` queda completo y el change pasa a `ready-for-verify`.
- El informe de verify existente queda stale: debe repetirse contra la nueva frontera del entregable local antes de cualquier archive.
- La revisión 4R final sigue pendiente después del nuevo verify; las revisiones selectivas históricas permanecen como evidencia, no como sustituto de esa revisión final.

No quedan preguntas bloqueantes de apply. La ausencia de perfiles live aceptados o de `reference-baseline.md` no bloquea verify ni archive bajo la frontera aprobada.
