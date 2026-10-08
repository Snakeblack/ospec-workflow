# vscode-dry-run

## Intent and acceptance

setup:vscode --dry-run reescribe dist/vscode (la instalación que VS Code carga en vivo) sin renderizar __OSPEC_SHARED_DIR__/__OSPEC_RUNTIME_DIR__, dejando el plugin roto

Acceptance: Tras setup:vscode --dry-run, dist/vscode queda byte a byte como estaba (o ausente si no existía) y el comando sigue informando del resultado de la build

## Plan

1. Repro (rojo→verde) en `scripts/configure/shared-dir.test.js`: `setup:vscode --dry-run` no crea ni toca `dist/vscode`, y una instalación cuyo paso de preparación falla deja la instalación anterior intacta.
2. `scripts/configure/cli.js`: `runConfigure`/`publishTransaction` aceptan `prepareTree(dir)`, que corre sobre el staging validado antes del renombrado y sobre el destino tras la publicación en sitio de E1.9.
3. `scripts/configure/install-vscode.js`: copia del binario de hooks y sustitución de marcadores dentro de `prepareTree`; `--dry-run` construye en un directorio temporal que se borra; desaparece la fase «Preparar el plugin».
4. Contrato: REQ-install-039 en `openspec/specs/install/spec.md` y tests en `scripts/configure/cli.test.js`.
5. Roadmap: E1.10 `vscode-dry-run`; release 2.117.1.

## Decisions

- Dry-run con build en un directorio temporal que se borra, no un dry-run sin build (usuario, gate open-facts): simula y valida igual que los otros 6 instaladores.
- Alcance ampliado a la instalación real que falla tras la build (usuario, gate open-facts).
- Preparar en el staging antes de publicar (paso `prepareTree`) en vez de sustituir marcadores en memoria: cubre también el binario de hooks y no cambia lo que valida `validateStagedTree`. Los marcadores se sustituyen con la ruta real de `dist/vscode`, no con la del staging, porque el staging se renombra a ese destino.
- El dry-run sustituye los marcadores en el temporal (comprueba que los valores son válidos) pero no copia el binario, para no compilarlo.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-08T09:06:22.340Z)
- ev-2: check-run for checks-pass (2026-10-08T09:10:15.055Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-08T09:10:15.055Z)
- ev-4: living-doc-current for living-doc (2026-10-08T09:12:22.409Z)
<!-- ospec:evidence:end -->
