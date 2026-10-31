# safe-dest-test-tmpdir

## Intent and acceptance

El test 'assertSafeDest: allows safe unrelated directories' usa como destino un directorio temporal propio en vez de os.tmpdir(), para no fallar cuando el repo vive bajo el directorio temporal; el producto no cambia

Acceptance: El test pasa con el repo en su sitio y con TMPDIR apuntando al directorio padre del repo (como en el worktree de la contraprueba); assertSafeDest no cambia

## Plan

<!-- ospec:plan:start -->
- Files: `scripts/configure/install-target.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El cambio se declara docs porque no toca código de producto, como launcher-test-shell-reasons: como bug, repro-test no puede fallar contra el producto base
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-31T14:37:04.807Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-31T14:37:04.807Z)
- ev-3: living-doc-current for living-doc (2026-10-31T14:37:04.906Z)
<!-- ospec:evidence:end -->
