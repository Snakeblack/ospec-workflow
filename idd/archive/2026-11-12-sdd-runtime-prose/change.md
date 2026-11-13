# sdd-runtime-prose

## Intent and acceptance

PR4c de la review general: la prosa SDD nombra el runtime instalado y no rutas relativas al proyecto; apply-resume distingue ids con varios niveles; el runner de recheck se distribuye; la fase handbook es enrutable y la tabla de fases del orquestador está completa

Acceptance: En el árbol generado de cada host ninguna instrucción SDD manda ejecutar node scripts/..., require('./scripts/...') ni <pluginInstallRoot>, sino el directorio del runtime instalado (${CLAUDE_PLUGIN_ROOT} en Claude, el marcador que renderiza el instalador en el resto); resolveRemainingTasks trata 1.2.1 y 1.2.2 como tareas distintas y devuelve aparte las casillas cuyo id no reconoce; verify-lineage-recheck.js llega al runtime distribuido y sdd-apply/sdd-verify lo citan por ruta; una ruta con la fase handbook pasa validateRouteTable y la tabla de fases del orquestador lista todas las fases que delega

## Plan

<!-- ospec:plan:start -->
- Files: `agents/sdd-archive.agent.md`, `agents/sdd-orchestrator.agent.md`, `agents/sdd-reconcile.agent.md`, `docs/sdd-routing.md`, `handbook/sdd/ciclo-y-rutas.md`, `openspec/config.yaml`, `openspec/specs/routing/spec.md`, `scripts/configure/cli.js`, `scripts/configure/sdd-runtime-prose.test.js`, `scripts/configure/shared-dir.js`, `scripts/lib/apply-resume.js`, `scripts/lib/apply-resume.test.js`, `scripts/lib/route-dispatcher.js`, `scripts/lib/target-profiles/claude.js`, `scripts/lib/target-transform.js`, `scripts/route-dispatch-run.js`, `scripts/validate-phase.js`, `skills/_shared/gate-archive-quality.md`, `skills/_shared/route-handbook.md`, `skills/sdd-apply/SKILL.md`, `skills/sdd-archive/SKILL.md`, `skills/sdd-init/SKILL.md`, `skills/sdd-verify/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La prosa SDD nombra el runtime con {{ospec-runtime}}, que el transform resuelve sobre cada fichero emitido (después de que los agentes embeban lo que leen): ${CLAUDE_PLUGIN_ROOT} en Claude y el marcador __OSPEC_RUNTIME_DIR__ que renderiza cada instalador en el resto.
- Claude sustituye ${CLAUDE_PLUGIN_ROOT} solo en los cuerpos que carga (agentes, comandos y el SKILL.md de cada skill): un fichero que solo se lee con Read (handlers _shared, referencias) recibe el token <ospec-runtime>, que la línea {{ospec-runtime-legend}} del orquestador define; en los demás hosts esa línea desaparece.
- Los runners se escriben node "<runtime>/scripts/x.js", siempre entre comillas, para que una ruta con espacios siga siendo un argumento en bash y en PowerShell.
- Los instaladores restauran los marcadores en orden inverso al render (LIFO): el orquestador lleva ahora __OSPEC_SHARED_DIR__ y __OSPEC_RUNTIME_DIR__, y restaurar en el mismo orden dejaba el árbol generado con _shared renderizado.
- handbook es ruta contextual (como foundation) que solo elige la señal --handbook / explicit_handbook_intent; ningún suelo de riesgo la descarta, va detrás de foundation en la tabla del repo y el modo degradado de validate-phase la admite.
- apply-resume exige espacio tras el id (1.2.3a deja de ser el id 1.2.3) y devuelve unparsed solo de tasks.md, con línea y texto; apply-progress lo escribe el propio apply con el mismo formato.
- Se dejan sin runtime las rutas descriptivas que no son del runtime o son ejemplos: cache.js en el ejemplo de assumptions, docs-lint.test.js en token-budget y review-lineage.js en review-judgment (compartido con los revisores de IDD); el test de la fuente las lista.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-12T22:57:24.675Z)
- ev-2: check-run for checks-pass (2026-11-12T23:00:42.676Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-12T23:00:42.676Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-12T23:01:12.169Z)
- ev-5: repro-run-pair for repro-test (2026-11-12T23:02:41.994Z)
- ev-6: check-run for checks-pass (2026-11-12T23:04:19.860Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-12T23:04:19.860Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-12T23:04:19.860Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-12T23:04:30.258Z)
- ev-10: check-run for checks-pass (2026-11-12T23:06:00.312Z)
- ev-11: contract-spec-and-test for contract-spec-and-test (2026-11-12T23:06:00.312Z)
- ev-12: adr-impact-declaration for adr-impact-declaration (2026-11-12T23:06:00.312Z)
- ev-13: living-doc-current for living-doc (2026-11-12T23:06:00.482Z)
<!-- ospec:evidence:end -->
