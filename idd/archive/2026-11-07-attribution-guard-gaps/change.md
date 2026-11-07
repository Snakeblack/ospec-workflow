# attribution-guard-gaps

## Intent and acceptance

El guard PreToolUse de atribución (JS y Go) deja pasar git commit -F/--file (fichero o heredoc por stdin), gh pr --body-file/-F, gh pr comment/review/merge, git merge -m, git -C/-c antes de commit, gh pr -R antes del subcomando y un -m "$(cat <<EOF…)" con comillas dentro; y el hook commit-msg solo se instala a mano, con setup-git-hooks.js fallando en worktrees (ENOTDIR) e instalando donde git no mira con core.hooksPath, mientras el doctor se salta los worktrees (hallazgo 4 de PR3b).

Acceptance: Un commit o una PR con atribución por cualquiera de esas formas recibe deny en el hook Node y en el binario Go con el mismo resultado; los mensajes limpios y los que solo nombran un agente siguen pasando; setup-git-hooks instala pre-commit y commit-msg en la carpeta de hooks que git usa (también desde un worktree) y el doctor la comprueba allí; CONTRIBUTING.md explica cómo quedan instalados.

## Plan

<!-- ospec:plan:start -->
- Files: `CONTRIBUTING.md`, `docs/harness-runtime.md`, `docs/roadmaps/harness-evolution.md`, `handbook/sdd/verificacion-sdd.md`, `internal/hooks/attribution_test.go`, `internal/hooks/pretooluse.go`, `internal/hooks/pretooluse_test.go`, `internal/hooks/shellfileaccess.go`, `internal/hooks/shellfileaccess_test.go`, `internal/testdata/parity/pre-tool-use-attribution-heredoc-deny.json`, `internal/testdata/parity/pre-tool-use-attribution-pr-comment-deny.json`, `internal/testdata/parity/pre-tool-use-attribution-unreadable-deny.json`, `internal/testdata/parity/pre-tool-use-attribution-wrapper-deny.json`, `openspec/specs/git-precommit-hook/spec.md`, `openspec/specs/hooks/spec.md`, `openspec/specs/idd/spec.md`, `package.json`, `scripts/hooks/lib/shell-file-access.js`, `scripts/hooks/lib/shell-file-access.test.js`, `scripts/hooks/pre-tool-use.js`, `scripts/hooks/pre-tool-use.test.js`, `scripts/lib/git-hooks-dir.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/ospec-doctor.js`, `scripts/lib/ospec-doctor.test.js`, `scripts/lib/ospec-gitignore.test.js`, `scripts/setup-git-hooks.js`, `scripts/setup-git-hooks.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Las opciones globales antes del subcomando (git -C <dir>, git -c k=v, --git-dir=…, --no-pager; gh pr -R o/r) no sacan la orden del guard: se reconoce igual que git commit o gh pr <sub>.
- setup-git-hooks y el doctor localizan la carpeta de hooks con git rev-parse --git-path hooks desde la raíz del work tree, resuelta contra ella: en un worktree es la del repositorio principal, compartida.
- El doctor usa la misma carpeta para git-hooks (checkout) y para strict-tdd-hook, así un worktree no se salta la comprobación.
- El guard es un reconocedor literal acotado, no un intérprete de shell (como shell-file-access.js): no sigue sustituciones de órdenes (-m "$(cat f)"), variables ni la salida de otros programas, ni opciones cortas agrupadas (-aF f); eso queda para commit-msg y CI.
- Un mensaje por stdin (-F -, --body-file -, /dev/stdin) se busca en el texto de la orden y en los ficheros que la orden lee según extractShellReadPaths (cat f |, < f); uno ilegible niega.
- Las rutas de -F/--file/--template y --body-file se resuelven contra el directorio de la sesión, con ~/ expandido al home; solo se lee un fichero regular de menos de 1 MiB.
- El tokenizador de shell-file-access.js (y shellfileaccess.go) se exporta como shellTokens y lo comparten el guard de secretos y el de atribución, así una orden citada dentro de otra (un patrón de grep, un mensaje) no cuenta como commit.
- Tras la revisión de confianza, el programa se busca tras asignaciones, palabras reservadas y grupos (then, {, (git), y tras un wrapper (env -i, sudo -u, timeout) hasta la primera palabra git, gh o shell; el script de sh|bash -c se analiza hasta dos niveles; y una orden que solo menciona git … commit|merge o gh … pr … <sub> en cualquier sitio también tiene su texto revisado (decisión 1a).
- Un fichero de mensaje relativo se lee desde el directorio que usa git (cd o pushd previos de la misma orden y git -C); si no se puede saber (cd "$DIR", cd -, popd) se niega como ilegible. git acepta abreviaturas únicas (--fil) y gh pr -T/--template también nombra un fichero.
- El tokenizador compartido sigue el entrecomillado $'…', donde \\' no lo cierra: una orden detrás de echo $'\\'' ya no queda dentro de una comilla, también para el guard de secretos.
- Tras la segunda revisión, cada texto se lee también como lo lee el shell o git: escapes de printf y $'…' decodificados (un surrogate suelto queda como está, igual en Node y Go), sin las barras que quita una palabra sin comillas y con --trailer token=valor como token: valor; una barra ante salto de línea continúa la línea, \git es git, un << sin su línea delimitadora no oculta nada y la mención se busca en tiempo lineal.
- Tras la tercera revisión, un mensaje por stdin se lee solo de lo que lo alimenta, desde el directorio del shell: el < de la propia orden o el lector de ficheros (cat, tac, type, head, tail, Get-Content) que le llega por una tubería; un heredoc o here-string queda en el texto, echo y printf también, y cualquier otro programa por tubería se niega; los demás lectores de la línea no son su mensaje. gh pr close|reopen -c/--comment es una orden de mensaje.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-06T19:24:01.286Z)
- ev-2: check-run for checks-pass (2026-11-06T19:26:10.666Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-06T19:26:10.666Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-06T19:27:13.313Z)
- ev-5: frozen-review for trust-review (2026-11-06T19:32:18.969Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-11-06T19:41:57.283Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-06T19:41:57.283Z)
- ev-8: migration-test for migration-compat-and-test (2026-11-06T19:42:26.012Z)
- ev-9: frozen-review for trust-review (2026-11-06T19:48:44.605Z, subagent-stop)
- ev-10: check-run for checks-pass (2026-11-06T19:53:51.055Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-11-06T19:53:51.055Z)
- ev-12: migration-test for migration-compat-and-test (2026-11-06T19:54:02.958Z)
- ev-13: frozen-review for trust-review (2026-11-06T20:01:49.265Z, subagent-stop)
- ev-14: check-run for checks-pass (2026-11-06T20:07:37.713Z)
- ev-15: adr-impact-declaration for adr-impact-declaration (2026-11-06T20:07:37.713Z)
- ev-16: migration-test for migration-compat-and-test (2026-11-06T20:07:49.472Z)
- ev-17: frozen-review for trust-review (2026-11-07T09:44:04.145Z, subagent-stop)
- ev-18: living-doc-current for living-doc (2026-11-07T09:44:20.645Z)
<!-- ospec:evidence:end -->
