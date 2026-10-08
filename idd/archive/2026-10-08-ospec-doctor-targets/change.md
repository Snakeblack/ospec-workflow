# ospec-doctor-targets

## Intent and acceptance

ospec doctor diagnostica los otros 6 targets (codex, cursor, antigravity, opencode, vscode, github-copilot): instalación, versión, runtime, marcadores sin renderizar, router, hooks, paquete SDD y Engram; VS Code con varias entradas en chat.pluginLocations

Acceptance: ospec doctor y --target <t> reportan cada fallo conocido de instalación de los 7 targets con causa y acción; REQ-idd-019 sin 'unsupported until (b)'; tests cubren cada check

## Plan

1. Doctor de los seis hosts: `scripts/lib/ospec-doctor-hosts.js` (detección por manifiesto de instalación y, en VS Code, por `chat.pluginLocations`; checks install, runtime, markers, router, budget, hooks, engram, plugin-locations, agent-files; install-drift, sdd-package y codex-repo), conectado en `scripts/lib/ospec-doctor.js`; tests en `scripts/lib/ospec-doctor-hosts.test.js`; REQ-idd-019 sin «unsupported until (b)».
2. Guías e índice: README (en/es) y `docs/plugin-installation(.es).md` sin la «Opción A» ni la instalación desde URL Git; roadmap con E1.7 (b) hecho y el ítem nuevo E1.9 `install-cli-ux`.

## Decisions

- Engram se sondea en cada host detectado; una sola ejecución de `engram version` y `engram doctor` sirve a todos (decisión del usuario).
- Severidades (decisión del usuario): marcadores sin sustituir, entrada de VS Code al checkout fuente o a una ruta inexistente = `error`; varias builds de ospec en `chat.pluginLocations` = `warn`.
- Alcance (decisión del usuario): entran el check de Codex en repositorio, la corrección de las guías y la investigación de la fuga a `~/.copilot`. El bug EPERM de `setup:vscode` y la UX de instalación pasan a E1.9.
- Con `--target <host>` solo se comprueba ese host, también Claude Code (antes Claude se comprobaba siempre que estuviera instalado), como dice REQ-idd-019.
- No se usa el límite de 32 KiB de `project_doc_max_bytes` de Codex: la documentación lo aplica a los `AGENTS.md` del proyecto y no está verificado para el global; el router se mide con el presupuesto de 4 KB de E0.4.
- La fuga a `~/.copilot` (manifiesto `0.0.0`, 2026-08-14 22:05 UTC) coincide con el fixture de `tests/integration/installation-convergence.test.js` antes del commit de #106 (22:14 UTC), que ya usa `--dest`; se verifica corriendo la suite completa sin que cambie ningún manifiesto real.
- `adr-20261002-003` permite referencias a Engram exactamente en `scripts/lib/engram-detect.js` y `scripts/lib/ospec-doctor.js`. Para no enmendarlo, la sonda de Engram de los seis hosts vive en `ospec-doctor.js` y llega a `ospec-doctor-hosts.js` como callback (`context.memoryCheck`), igual que `parseJsonc`.
- Los marcadores que busca `markers` se escriben por partes en `ospec-doctor-hosts.js`: el módulo viaja en el runtime y los instaladores sustituyen los marcadores completos en cada fichero que copian, así que un literal se habría reescrito con la ruta real dentro del propio doctor (lo detectaron `idd-protocol.test.js` y `shared-dir.test.js`).
- `scripts/ospec.test.js` lanza el CLI con un `HOME` temporal; ahora también aísla `APPDATA` y quita `CODEX_HOME` y `XDG_CONFIG_HOME`, porque el doctor lee de ahí la configuración de VS Code, Codex y OpenCode.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-08T07:30:48.427Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-08T07:30:48.427Z)
- ev-3: living-doc-current for living-doc (2026-10-08T07:31:01.750Z)
<!-- ospec:evidence:end -->
