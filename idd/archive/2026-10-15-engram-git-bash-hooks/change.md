# engram-git-bash-hooks

## Intent and acceptance

En Windows, los hooks .sh de engram@engram arrancan con la ruta absoluta de Git Bash que encuentra findGitBash (la misma que usa la sonda de modo seguro), migrando también los comandos que ya empiezan con bash pelado; sin Git Bash no se antepone el bash de WSL

Acceptance: Con Git Bash en <git>/bin/bash.exe, cada hook .sh pelado y cada comando que empieza por bash pelado quedan con la ruta absoluta entrecomillada con barras normales, y una segunda ejecución no reescribe; sin Git Bash y con bash del PATH en System32 o WindowsApps no se escribe prefijo bash y se avisa

## Plan

Resuelve el [issue #334](https://github.com/Snakeblack/ospec-workflow/issues/334).

- `scripts/configure/engram-setup.js`: `runEngramStep` busca Git Bash una vez y lo pasa a la sonda de modo seguro y al parche de hooks. `hookLauncher` elige el bash (Git Bash, o el primer `bash.exe` del `PATH` que no esté en `System32`, `Sysnative` o `WindowsApps`) y su `sh.exe` hermano. `launchShellHooks` reescribe a forma exec (`command` absoluto con barras normales, `args` con las palabras sin comillas) cada hook sin `args` cuyo ejecutable es un `.sh` o un `bash`/`sh` sin ruta. Sin bash utilizable avisa y no cambia nada.
- `scripts/configure/engram-setup.test.js`: forma exec con Git Bash e idempotencia, `sh` sin `sh.exe` y sintaxis de shell sin tocar, `CLAUDE_CODE_GIT_BASH_PATH` con barras invertidas, respaldo con el bash del `PATH` y aviso con el lanzador de WSL o sin bash.
- `openspec/specs/install/spec.md`: REQ-install-042 describe la forma exec, el respaldo y el caso WSL.
- README EN/ES y guías de instalación EN/ES: la nota de Claude Code en Windows.

## Decisions

- **Forma exec en vez de `bash` delante o de la ruta entrecomillada.** Claude Code lanza los hooks en Git Bash o, sin Git Bash, en PowerShell. En PowerShell, `bash` resuelve al lanzador de WSL y `"C:/…/bash.exe" "…"` es un error de sintaxis. Con `args` no hay shell intermedio y funciona con los dos.
- **No se portan los hooks a PowerShell.** Upstream solo trae `user-prompt-submit.ps1`. `session-start.sh`, que arranca `engram serve`, y los demás scripts necesitan bash, `jq` y `curl`, y `engram hook` solo tiene en nativo `claude-pre-tool-use` para Claude. Mantener ports de scripts upstream va contra adr-20261003-001: ospec usa la integración oficial y no lleva hooks de memoria propios.
- **Respaldo y WSL.** Sin Git Bash se usa el primer `bash.exe` del `PATH` por ruta absoluta, salvo que sea el lanzador de WSL. En ese caso, o sin bash, se avisa y no se parchea. Un `sh` sin ruta va al `sh.exe` hermano y queda igual si no lo hay.
- **Enmienda de adr-20261003-001.** La viñeta de Claude/Windows («los `.sh` reciben el prefijo `bash` y se dejan los que ya empiezan con bash o sh») queda sustituida por la forma exec descrita aquí. El usuario aprobó la enmienda. Se registra en este cambio y no como fichero en `docs/adr/`, cuyo índice está cerrado, y el registro aceptado no se reescribe.
- **El chequeo de `ospec doctor`** (health de `engram serve` y hooks con `bash` pelado) queda como seguimiento.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-15T22:36:12.780Z)
- ev-2: check-run for checks-pass (2026-10-15T22:39:02.860Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-15T22:39:02.860Z)
- ev-4: check-run for checks-pass (2026-10-15T22:40:14.757Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-15T22:40:14.757Z)
- ev-6: check-run for checks-pass (2026-10-15T22:41:29.756Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-10-15T22:41:29.756Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-10-15T22:41:29.756Z)
- ev-9: living-doc-current for living-doc (2026-10-15T22:41:49.572Z)
<!-- ospec:evidence:end -->
