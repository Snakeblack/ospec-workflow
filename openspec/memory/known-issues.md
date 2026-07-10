---
title: Known Issues
last_updated: 2026-07-10
---

## REQ-hooks-004 escenario "PLUGIN_DATA propagated intact" solo con inspection-proof (sin runtime test)

- severity: WARNING
- area: scripts/lib/target-transform.js codexHooks (solo reescribe command/commandWindows) vs specs/hooks/spec.md REQ-hooks-004 scenario "PLUGIN_DATA propagated intact"
- workaround: satisfecho por ausencia de capa wrapper (herencia de env garantizada por el runtime Node, no por codigo del proyecto); si un batch futuro agrega fidelidad de process-boundary, spawnear ospec-hooks-launch.js con PLUGIN_DATA seteado y afirmar que el hijo observa el valor sin modificar (alineado con el smoke live-CLI diferido)
- change: codex-target-phase-2
- date: 2026-07-10

## capture.js/parseYamlLite del eval suite sin tests automatizados en CI

- severity: WARNING
- area: scripts/evals/lib/capture.js (parser YAML-lite por indentacion + captureWorkspace) vs coleccion npm test (solo assertions.test.js + fixtures.test.js; no existe capture.test.js)
- workaround: design.md scopeo capture.js fuera de unit testing (se ejercita "end-to-end via manual eval runs" que requieren modelo live, fuera de npm test). Agregar capture.test.js cubriendo parseYamlLite contra las formas reales de state.yaml de los fixtures (maps route:/phases: anidados, listas blocking_questions, timestamps citados) y la deteccion de active-change de captureWorkspace. Un bug del parser mis-poblaria captured.state y produciria verdicts PASS/FAIL falsos
- change: prompt-evals-golden-scenarios
- date: 2026-07-07

## apply-progress/state afirman que openspec/config.yaml es gitignored pero en realidad esta trackeado en HEAD

- severity: WARNING
- area: openspec/changes/route-coercion-lock-budget/apply-progress.md (Deviations #2) + state.yaml apply.key_decisions + scripts/configure/real-repo.test.js comments (lineas 334-335, 343, 402)
- workaround: config.yaml es un blob commiteado (git cat-file -t HEAD:openspec/config.yaml -> blob; ls-files -v -> H; check-ignore vacio), el unquote de explicit_*_intent SI aparece en el PR diff. Comportamiento correcto (unquote funcionalmente equivalente, regression test verde); corregir la afirmacion de "gitignored/untracked" en apply-progress, state y los comentarios del test, o revisar si config.yaml deberia estar untracked
- change: route-coercion-lock-budget
- date: 2026-07-07

## Finding 7.6 (try/catch en rmSync de poda de sync-openwiki.mjs) enviado sin test reproductor dedicado

- severity: WARNING
- area: skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs (bloque de poda, lineas ~311-316) vs scripts/sync-openwiki.test.js (solo test de poda preexistente como approval/regression)
- workaround: aceptado como deviation disclosed (assumption sdd-apply-003, high-reversibility); el fix espeja el patron ya testeado de 7.3/7.4 y el test de poda pasa como regresion. Agregar un test de fault-injection portable de fallo en tiempo de borrado (rmSync) cuando exista un harness cross-platform (Windows no permite forzarlo de forma determinista sin symlinks/chmod)
- change: starlight-web-doc
- date: 2026-07-06

## REQ-agents-006 escenarios conductuales de J5 (clean-run silent close, pre-existing-untracked no-false-positive, out-of-sandbox halt) solo con inspection-proof

- severity: WARNING
- area: skills/_shared/route-document.md §6 vs scripts/starlight-web-doc-contract.test.js (solo ancla el string web-doc/ en §6) y scripts/configure/real-repo.test.js (solo el sentinel del wording del halt-gate)
- workaround: agregar una aserción de handler-content en real-repo.test.js/sdd-document.test.js que documente el set de git-status escopado {output dirs, /AGENTS.md, /CLAUDE.md} para scope D y el camino silent-close-on-clean, elevando los escenarios de inspection-proof a static-proof; solapa el known-issue previo de wire-sdd-document
- change: starlight-web-doc
- date: 2026-07-06

## Escenarios MUST de conducta pura del agente (REQ-sdd-document-002/006/011) no son runtime-testables y descansan en inspection-proof/static-lint de prosa

- severity: WARNING
- area: skills/sdd-document/SKILL.md §3/§5/§6.4 + skills/_shared/route-document.md §1/§3 (gate blocking, third-directory halt, self-certify, update-mode reuse)
- workaround: aceptable bajo el patrón establecido de contratos de prosa; techo de evidencia inherente a conductas definidas en prosa del agente — sin remediación de código, se registra para que orchestrator/usuario reconozcan el límite de evidencia
- change: starlight-web-doc
- date: 2026-07-06

## 4R advisory WARNINGs de harden-archive-move-fingerprints (6, sin remediar por decisión de gate advisory)
- severity: WARNING
- area: (a) duplicación de anclas de contrato entre archive-move-fingerprint-contract.test.js, eje-b-contract.test.js B2.4, mentor-adr-contract.test.js A5.3 y real-repo.test.js sin cross-referencias; (b) tres escenarios MUST edge-case (null fingerprint, no-assumption-entry, partial-copy-not-concealed) solo inspection-proof; (c) anclas negativas literales frágiles ante paráfrasis (executor-delete, sdd-spec hash-write); (d) sin rama definida para fallo de lectura/hash distinto de ausencia en el bloque de fingerprints del orquestador ni en el stale-baseline check de sdd-archive
- workaround: el lint de contratos unificado (Bloque 1.4) debe consolidar las anclas duplicadas en un único mecanismo y distinguir static-lint de runtime-test (J2), lo que absorbe (a)-(c); (d) es candidato a una cláusula de política de fallo estilo sibling-handler en un follow-up menor
- change: harden-archive-move-fingerprints
- date: 2026-07-05

## REQ-agents-006 J5 scoping/silent-close scenarios rest on inspection-proof only (no string-presence test)
- severity: WARNING
- area: skills/_shared/route-document.md §6.2-6.3 (git-status scoping + silent close) vs scripts/configure/real-repo.test.js (only the halt-gate wording sentinel is asserted)
- workaround: add a handler-content assertion in real-repo.test.js (or sdd-document.test.js) that route-document.md §6 documents the scoped git-status set {output dir, /AGENTS.md, /CLAUDE.md} and the silent-close-on-clean path, mirroring the existing "Acknowledge and close the route anyway" sentinel, to raise the two scenarios from inspection-proof to static-proof
- change: wire-sdd-document
- date: 2026-07-05

## Missing TDD Cycle Evidence table in apply-progress.md
- severity: BLOCKER
- area: openspec/changes/add-documenter-agent/apply-progress.md
- workaround: Generate or write the TDD Cycle Evidence table manually in apply-progress.md
- change: add-documenter-agent
- date: 2026-07-05

## Embedded question_gate reason example not conformant to the new Gate-Reason-Cost contract

- severity: WARNING
- area: agents/sdd-orchestrator.agent.md Sub-Agent Clarification Contract "Preferred shape" (reason placeholder "Why this decision blocks the phase.")
- workaround: update the example reason to also name the cost of a wrong/guessed decision, matching the authoritative example in sdd-phase-common.md §D; the sibling description was already made conformant, leaving the block internally inconsistent
- change: recommendation-contract-and-early-ambiguity-detection
- date: 2026-07-03

## Escenario "skill discoverable via discoverSkills" es insatisfacible: shouldIncludeSkill excluye todos los dirs sdd-*

- severity: WARNING
- area: scripts/lib/skill-registry.js:188 shouldIncludeSkill (filtro !startsWith("sdd-")) vs specs/spec-reconciliation Command and Skill Registration
- workaround: corregir el escenario para referenciar el pipeline de generacion/validacion (scripts/check.js) en vez de discoverSkills, o eliminar la afirmacion; corregir tambien apply-progress/state que declaran falsamente "skill confirmed indexed". La skill sdd-reconcile se registra/valida identica a sdd-baseline y el routing funciona via el allowlist agents del orchestrator, no depende de discoverSkills.
- change: sdd-context-awareness-reconciliation
- date: 2026-07-02

## Escenarios MUST de prosa (Fase 4/5: gate del orchestrator + executor reconcile) solo tienen inspection-proof, sin cobertura de runtime

- severity: WARNING
- area: agents/sdd-orchestrator.agent.md (Ambient SDD Awareness Gate) + agents/sdd-reconcile.agent.md (algoritmo 0-5)
- workaround: agregar tests de doc-assertion ("agent.md documents X") espejando el precedente ya existente para otros agentes de fase, para elevar los 8 escenarios de agents y los 10 de spec-reconciliation de inspection-proof a runtime-test; el design los alcanzo solo a generacion/validacion, decidir en design/spec si se refuerzan.
- change: sdd-context-awareness-reconciliation
- date: 2026-07-02

## readFileSync sin try/catch en cli.js gatherRuntimeScripts propaga EACCES/EPERM sin exit code claro

- severity: WARNING
- area: scripts/configure/cli.js:132
- workaround: envolver el readFileSync del walker BFS en try/catch para degradar errores no-ENOENT con un exit code/mensaje claro
- change: federation-tooling-fidelity
- date: 2026-06-22

## catch vacio en resolveCoordinatorRoot absorbe EACCES/EPERM silenciosamente

- severity: WARNING
- area: scripts/lib/federation-baseline-orchestrator.js:112
- workaround: registrar o reclasificar los errores no-ENOENT en el catch en vez de absorberlos en silencio (codigo preexistente, no tocado por este change)
- change: federation-tooling-fidelity
- date: 2026-06-22

## github-copilot/opencode dist falla su validador: vscode namespace residue en federation-baseline-orchestrator.js

- severity: BLOCKER
- status: RESOLVED
- resolution: Changed the literal `approver` value to target-agnostic `orchestrator/askQuestions` in unified-baseline-gate spec (RWU-1). 4 builds exit 0 with 0 vscode/ residue in dist/github-copilot and dist/opencode.
- area: scripts/configure (cli.js gatherRuntimeScripts) + validate-github-copilot.js / validate-opencode.js
- change: federation-tooling-fidelity
- date: 2026-06-22

## apply-progress declara falsamente que los fallos de validador son preexistentes

- severity: BLOCKER
- status: RESOLVED
- resolution: Full verification suite RE-VERIFY FINAL ran 681/681 (exit 0); all 4 builds exit 0 with 0 errors; 0 vscode/ residue verified in dist. Validators no longer fail. Prior failures were real (not preexisting); they were fixed by RWU-1 (approver normalization).
- area: openspec/changes/federation-tooling-fidelity/apply-progress.md (Test Summary / Issues Found)
- change: federation-tooling-fidelity
- date: 2026-06-22

## La red de seguridad de tasks no obligó a inspeccionar real-repo.test.js para el contenido recién empaquetado

- severity: WARNING
- area: openspec/changes/federation-tooling-fidelity/tasks.md (Phase 2/4 GREEN gates)
- workaround: añadir verificación explicita de los validadores per-target al empaquetar nuevos scripts runtime
- change: federation-tooling-fidelity
- date: 2026-06-22
