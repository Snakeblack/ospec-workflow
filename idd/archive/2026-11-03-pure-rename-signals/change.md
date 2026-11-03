# pure-rename-signals

## Intent and acceptance

Un renombre puro deriva señales de contenido: readGitDiff lee el diff con --no-renames, así que el fichero movido llega como borrado más añadido completo y todo su contenido cuenta como líneas añadidas (public-contract por un `#hex` en un Markdown archivado, persistent-data por un módulo movido que ya escribe)

Acceptance: Un renombre que conserva el contenido (R100), preparado o commiteado, no deriva public-contract, persistent-data ni ninguna otra señal de contenido; un renombre que además cambia líneas solo aporta esas líneas; el fichero sigue contando por sus dos rutas para las señales de ruta; un test lo cubre, también con diff.renames=false

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/idd/spec.md`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Los renombres se detectan con --find-renames explícito en la lista (--raw -z) y en el parche, que anula diff.renames y diff.renames=copies; un R100 no aporta líneas ni fuentes y sus dos rutas siguen en paths
- Un mv sin preparar se empareja por el blob que git guardaría (git hash-object --stdin-paths, con los filtros de la ruta): uno a uno con los borrados, solo ficheros regulares de hasta 1 MiB, y si el hash falla no se empareja nada
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-03T13:27:54.442Z)
- ev-2: check-run for checks-pass (2026-11-03T13:30:15.130Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-03T13:30:15.130Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-03T13:30:15.130Z)
- ev-5: living-doc-current for living-doc (2026-11-03T13:30:39.886Z)
<!-- ospec:evidence:end -->
