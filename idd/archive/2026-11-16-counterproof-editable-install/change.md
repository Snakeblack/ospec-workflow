# counterproof-editable-install

## Intent and acceptance

La contraprueba importa el producto del candidato cuando .venv tiene una instalación editable: el .pth, el finder editable y los shebangs de la copia siguen apuntando al repositorio (#523, E1.76)

Acceptance: Con una instalación editable en .venv y layout src/, la contraprueba importa el producto de la base, y un test lo reproduce

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/evidencia.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-exec.js`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`, `scripts/ospec.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La copia de las dependencias reescribe hacia el árbol temporal las rutas absolutas al repositorio (como git la escribe, resuelta o como la escribe la raíz del proyecto) que aparecen en los .pth, .egg-link y módulos .py sueltos de un site-packages, y en los scripts que empiezan por #! del bin/ o Scripts/ de un virtualenv (con pyvenv.cfg); la sustitución es byte a byte y solo de rutas completas, así que conserva la codificación y los finales de línea
- El comando de la contraprueba y sus controles corren con PATH, VIRTUAL_ENV y PYTHONPATH reescritos: cada entrada que apunta al repositorio pasa a la misma ruta del árbol temporal (mountCounterproof devuelve el env y runCommand lo acepta)
- Los lanzadores .exe de Scripts/ en Windows quedan fuera: llevan la ruta del python dentro del binario con formatos distintos en pip y uv; queda documentado como límite
- Un editable que apunta a un build dentro del repositorio (modo strict de setuptools, meson-python, el .so de maturin) queda apuntando a un directorio que la contraprueba no copia, así que la contraprueba sale inconclusa en vez de dar un falso 'no detecta'
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-16T23:45:40.928Z)
- ev-2: check-run for checks-pass (2026-11-16T23:49:08.561Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-16T23:49:08.561Z)
- ev-4: check-run for checks-pass (2026-11-16T23:54:55.103Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-16T23:54:55.103Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-16T23:54:55.103Z)
- ev-7: living-doc-current for living-doc (2026-11-16T23:54:55.230Z)
<!-- ospec:evidence:end -->
