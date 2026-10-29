# base-counterproof

## Intent and acceptance

Contraprueba en la base (E1.48): el verde de repro-test y tdd-red-green, y boundary-tests, solo se cumplen si el mismo comando falla con el producto de la base y los tests del candidato

Acceptance: Un repro-test hecho con test -f marker y una feature cuyo test nuevo ya pasa con el producto de la base no cierran; un test real cierra con un run extra de purpose counterproof que falló sobre la base; en un repositorio sin commits la contraprueba se omite con un aviso

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-exec.js`, `scripts/lib/idd-exec.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El worktree de la contraprueba es la base del cambio con todo lo que cambia el diff salvo los ficheros que classifyPath tiene por producto: tests, fixtures, manifiestos, config y otros quedan como en el candidato, así que test -f marker pasa en la base y no cierra
- Timeout fijo de 10 minutos, sin ajuste en idd/config.yaml hasta que E4.14 mida el coste; un timeout sobre la base cuenta como rojo válido, marcado timed_out y con aviso
- Se enlazan en el worktree node_modules, .venv, venv y vendor cuando existen en el proyecto y git los ignora (junction en Windows); dist, build y target no, porque son el producto compilado del candidato
- Sin base o sin poder montar el worktree, la contraprueba se omite con una marca visible: el run counterproof lleva skipped con el motivo, y run, check y close lo avisan
- La contraprueba corre solo cuando el verde cerraría la pareja o el check cumpliría boundary-tests, y se reutiliza mientras no cambien la base, el comando, la unidad y la huella de lo montado; para boundary-tests corre los checks declarados y vale si falla alguno
- La evidencia registrada antes de E1.48 sigue valiendo; solo la evidencia nueva exige la contraprueba
- El worktree se monta con git worktree add --detach en el directorio temporal del sistema, fuera del lock, y se quita al terminar con git worktree remove y prune; el comando corre en el mismo subdirectorio relativo
- Sustituye a la primera decisión, por respuesta del usuario: el worktree de la contraprueba es la base del cambio más los tests que toca el diff (rutas de test y testdata/, __snapshots__/, fixtures/ y __fixtures__/); todo lo demás vuelve a la base, y la pareja exige que el diff añada código a un test, como boundary-tests. Con solo el código revertido, un arreglo en ficheros que no son código montaba el mismo árbol que el candidato y no cerraba nunca
- Una contraprueba omitida no es un run, porque nada se ejecutó: la evidencia la marca con counterproof_skipped y su motivo, y run, check y close lo avisan
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-28T22:50:46.590Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-28T22:52:03.860Z)
- ev-3: check-run for checks-pass (2026-10-28T22:53:07.018Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-28T22:53:07.018Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-28T22:53:07.018Z)
- ev-6: living-doc-current for living-doc (2026-10-28T22:53:07.169Z)
<!-- ospec:evidence:end -->
