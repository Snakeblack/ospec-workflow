# sdd-envelope-projection

## Intent and acceptance

PR4b de la review 2026-10-29: la fase SDD no se proyecta en state.yaml sin SubagentStop (Cursor, Antigravity, OpenCode, VS Code), así que el archivado nunca ve phases.verify.verdict y la prosa común se contradice; en Claude Code SubagentStop lee el transcript de la sesión principal y proyecta el envelope del subagente anterior; y state.yaml con escalares de bloque o texto multilínea se rechaza como malformed-state

Acceptance: Un host sin SubagentStop proyecta cada fase por una vía del runtime (el mismo PhaseCompletionReducer) y el archivado ve el veredicto de verify; la prosa común deja de contradecirse; SubagentStop (JS y Go) toma el envelope de last_assistant_message y nunca del transcript principal si existe el del agente; state.yaml con escalares de bloque o multilínea se proyecta sin corromperse en JS y Go

El orquestador ya tenía 498 de las 500 líneas que permite `real-repo.test.js`, así que la orden del runner va dentro del párrafo del contrato de resultado, sin líneas nuevas. La prosa cita el runner con `<pluginInstallRoot>`, como `validate-phase.js`; pasar toda la prosa SDD al marcador del runtime es el hallazgo 4 de 4c.

Fuera de alcance, en las PRs siguientes del lote PR4: 4c el runtime y la prosa SDD (hallazgos 4, 8, 11 y 12) y 4d los linajes (9, 10 y la parte de verify-lineage del 13).

## Plan

<!-- ospec:plan:start -->
- Files: `agents/sdd-orchestrator.agent.md`, `docs/target-capabilities.md`, `internal/hooks/phase-completion-reducer.go`, `internal/hooks/subagentstop.go`, `openspec/specs/hooks/spec.md`, `openspec/specs/lifecycle-kernel-runtime/spec.md`, `scripts/configure/cli.js`, `scripts/hooks/lib/claude-usage.js`, `scripts/hooks/subagent-stop.js`, `scripts/lib/ospec-state.js`, `scripts/lib/result-envelope.js`, `scripts/phase-completion-run.js`, `skills/_shared/sdd-phase-common.md`
- Work units: 3
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- scripts/phase-completion-run.js <change> --phase <fase|sdd-fase> --envelope-file <fichero> [--workspace] proyecta con el mismo projectPhaseCompletion el envelope del mensaje final del subagente (bloque json:result-envelope, prosa heredada o el JSON del envelope), validado para su fase; imprime un JSON con el resultado y sale 0 solo si la proyección es ok (advanced, blocked o noop-replay)
- El orquestador ejecuta el runner tras cada fase en todos los hosts, con --change explícito: donde SubagentStop ya proyectó el mismo envelope el hash de replay lo deja en noop, y cubre también los varios cambios activos que el hook se salta
- Las fases nunca escriben phases.* en state.yaml: sdd-phase-common.md deja de pedir el read-merge-update y describe la forma que proyecta el runtime, con verdict en verify
- Con last_assistant_message, el mensaje final del subagente es la única fuente del envelope y de skill_resolution (sin envelope no se proyecta nada); sin él siguen los campos de resultado y después el transcript, como los recibos de REQ-hooks-027
- Todo lector del transcript del dispatch (envelope, estado del coste, skill_resolution, enlace de host, tokens de Codex y telemetría de Claude) usa agent_transcript_path y solo cae a transcript_path cuando falta, en JS y Go
- state.yaml tolera escalares de bloque (| y > con indicadores) y continuaciones multilínea de escalares planos y entrecomillados que empiezan en la línea de su clave: la validación y el parseo los tratan como opacos, una comilla sin cerrar sigue rechazada y el tabulador sigue prohibido; un valor que empieza en la línea siguiente no se admite
- Al reescribir una clave proyectada (status, last_updated, revision o un campo de fase) el proyector borra sus líneas de continuación y la deja en una línea; el resto del YAML queda byte a byte
- Un rechazo de la proyección se ve en la salida del runner ante el orquestador; SubagentStop sigue registrándolo solo en stderr
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-09T09:53:38.239Z)
- ev-2: check-run for checks-pass (2026-11-09T09:57:51.440Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-09T09:57:51.440Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-09T09:58:45.105Z)
- ev-5: check-run for checks-pass (2026-11-09T10:01:15.916Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-11-09T10:01:15.916Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-09T10:01:15.916Z)
- ev-8: frozen-review for trust-review (2026-11-09T10:04:03.885Z, subagent-stop)
- ev-9: living-doc-current for living-doc (2026-11-09T10:04:12.427Z)
<!-- ospec:evidence:end -->
