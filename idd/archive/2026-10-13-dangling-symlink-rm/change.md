# dangling-symlink-rm

## Intent and acceptance

El test de la huella sustituye un symlink colgante con unlink, porque rmSync en Node 24 lo deja puesto

Acceptance: El test an untracked symlink is its target pasa y sigue comprobando que un destino nuevo cambia la huella del árbol.

## Plan

- En el test de la huella, borrar el symlink colgante con `fs.unlinkSync` antes de crear el destino nuevo.
- Dejar la aserción: un destino distinto cambia la huella. No tocar el `rmSync` de directorios del motor.

## Decisions

- `fs.rmSync` en Node 24.5.0 sobre un symlink colgante vuelve sin error y no lo borra, así que el `symlinkSync` siguiente falla con `EEXIST`. `fs.unlinkSync` borra el enlace. El `rmSync` de `snapshotTree` sigue sobre un directorio real.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-13T19:07:25.036Z)
- ev-2: check-run for checks-pass (2026-10-13T19:08:52.171Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-13T19:08:52.171Z)
- ev-4: living-doc-current for living-doc (2026-10-13T19:09:09.663Z)
<!-- ospec:evidence:end -->
