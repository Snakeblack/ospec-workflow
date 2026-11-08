# sdd-archive-chain

## Intent and acceptance

PR4a de la review 2026-10-29: la transacción de archivado SDD queda bloqueada para siempre tras un fallo sin efectos, archiva sin comprobar el linaje del quality-review-gate y el reducer marca archived antes de la transacción

Acceptance: Un fallo de preflight (o un rollback completo) deja repetir el archivado sin borrar el journal a mano; el preflight rechaza con gate-not-satisfied una ruta con quality-review-gate cuyo linaje no está aprobado para archive; el reducer proyecta archive-pending al volver sdd-archive (JS y Go) y solo la transacción deja el cambio archivado; desaparecen el bucle vacío y el ternario muerto del preflight

Fuera de alcance, en las PRs siguientes del lote PR4: 4b la proyección del envelope (hallazgos 1, 6 y 7: el veredicto sin SubagentStop, el transcript del subagente y los escalares de bloque de state.yaml), 4c el runtime y la prosa SDD (4, 8, 11 y 12) y 4d los linajes (9, 10 y la parte de verify-lineage del 13). `agents/sdd-orchestrator.agent.md` estaba en el plan y no cambia: su tabla de punteros ya remite el cierre a `gate-archive-quality.md`.

## Plan

<!-- ospec:plan:start -->
- Files: `agents/sdd-orchestrator.agent.md`, `internal/hooks/phase-completion-reducer.go`, `internal/hooks/phase-completion-reducer_test.go`, `openspec/specs/archive-transaction-runtime/spec.md`, `scripts/lib/archive-transaction.js`, `scripts/lib/archive-transaction.test.js`, `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js`, `skills/_shared/gate-4r-review.md`, `skills/_shared/gate-archive-quality.md`, `skills/_shared/sdd-phase-common.md`
- Work units: 4
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Un fallo sin escrituras en vivo (preflight, staging o comparación A, sin created_by_tx) y un rollback completo dejan el journal reutilizable: el siguiente run descarta staging y abre una transacción nueva desde init; solo un fallo con escrituras en vivo sigue terminal hasta --rollback
- El preflight lee gates.quality-review-gate (JSON en línea) cuando la ruta persistida lista quality-review-gate y exige validateLineageForGate con gate archive contra el current_candidate_id del propio linaje; un verify_lineage presente debe estar closed; sin recalcular el candidato vivo
- Un linaje de review terminal no aprobado bloquea el archivado sin override; la salida es un sucesor aprobado
- El reducer proyecta archive-pending (no terminal) al completar sdd-archive, en JS y Go; la transacción escribe status archived solo en la copia staged de state.yaml y la comparación A acepta exactamente ese cambio
- inventory-mismatch sigue como rejection_code con failure_reason gate-not-satisfied, por ADR-004
- El runtime lee el linaje de review solo como JSON en una línea (gate entero o su campo lineage); un linaje escrito como bloque YAML bloquea el archivado y el protocolo del gate pide esa forma
- Sin linaje, el gate de review solo deja archivar con status done y ningún dominio seleccionado, el único camino de planQualityReviewGate a done
- La ruta se resuelve con parseRoutingTable de openspec/config.yaml: sin ruta, freeform, sin config o con tabla vacía no se exige review; una config ilegible o una ruta no declarada fallan cerrado
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-08T22:03:41.271Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-08T22:04:02.697Z)
- ev-3: check-run for checks-pass (2026-11-08T22:07:09.211Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-08T22:07:45.341Z)
- ev-5: check-run for checks-pass (2026-11-08T22:09:59.258Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-08T22:09:59.258Z)
- ev-7: living-doc-current for living-doc (2026-11-08T22:09:59.380Z)
<!-- ospec:evidence:end -->
