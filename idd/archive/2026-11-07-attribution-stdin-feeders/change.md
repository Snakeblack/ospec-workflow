# attribution-stdin-feeders

## Intent and acceptance

Con un mensaje por stdin (-F -, --body-file -), el guard de atribución (JS y Go) no lee el fichero ni niega en cinco formas: cat f | seguido de salto de línea, cat f |&, cat < f | git commit -F -, cat a | cat | git commit -F - y git commit -F - 2>&1 < f; la orden pasa sin leer (hallazgo de la cuarta revisión de confianza de attribution-guard-gaps).

Acceptance: Con un msg.txt que lleva un trailer de atribución, esas cinco formas reciben deny en el hook Node y en el binario Go, con el motivo de atribución (fichero leído) o el de stdin ilegible; un lector sin ficheros ni entrada (cat | git commit -F -) también niega; las mismas formas con un fichero limpio, printf/echo por tubería y los heredocs siguen pasando.

## Plan

<!-- ospec:plan:start -->
- Files: `internal/hooks/attribution_test.go`, `internal/hooks/pretooluse.go`, `openspec/specs/hooks/spec.md`, `scripts/hooks/pre-tool-use.js`, `scripts/hooks/pre-tool-use.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La fuente de un stdin se resuelve en cadena: un lector de ficheros lee sus operandos, si no tiene su <, si no su heredoc, y si no lo que le llega por tubería; sin nada de eso (lee el terminal) niega. echo y printf tienen su texto en la orden; cualquier otro programa niega.
- Un & tras una redirección (>&, <&) o delante de > (&>) es parte de la redirección, no un separador; una palabra de solo dígitos justo antes de una redirección es su descriptor y no un operando.
- Tras la revisión de confianza: las opciones de un wrapper acaban también en un lector de ficheros o un printer (xargs solo lleva a git, gh o un shell) y, sin ninguno, el wrapper es el programa; un segmento por tubería sin programa alimenta algo ilegible; >| es redirección y N< con otro descriptor que 0 no es stdin.
- Tras la segunda revisión, el operando - o /dev/stdin de un lector también lee su propio stdin, que se sigue igual (su <, su heredoc o su tubería) y niega si nada lo alimenta.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-07T12:48:21.232Z)
- ev-2: check-run for checks-pass (2026-11-07T12:49:59.892Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-07T12:49:59.892Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-07T12:50:16.394Z)
- ev-5: frozen-review for trust-review (2026-11-07T12:52:56.986Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-11-07T12:56:16.097Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-07T12:56:16.097Z)
- ev-8: migration-test for migration-compat-and-test (2026-11-07T12:56:29.003Z)
- ev-9: frozen-review for trust-review (2026-11-07T12:57:50.782Z, subagent-stop)
- ev-10: check-run for checks-pass (2026-11-07T13:00:29.813Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-11-07T13:00:29.813Z)
- ev-12: migration-test for migration-compat-and-test (2026-11-07T13:00:30.741Z)
- ev-13: frozen-review for trust-review (2026-11-07T13:03:14.082Z, subagent-stop)
- ev-14: living-doc-current for living-doc (2026-11-07T13:03:24.783Z)
<!-- ospec:evidence:end -->
