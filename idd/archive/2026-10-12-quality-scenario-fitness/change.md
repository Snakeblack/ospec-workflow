# quality-scenario-fitness

## Intent and acceptance

El mapa de conocimiento de ospec pasa a `ospec-knowledge-map/v2` y cada escenario de calidad declara su `fitness`: `checks` donde hay una comprobación ejecutable y `description` como checklist donde no (E3.6).

Acceptance: un cambio que declara un escenario con comprobación la ve ejecutarse en `ospec check` como run `fitness`, y los escenarios sin ella aparecen como checklist en `next` y `check`.

## Plan

1. `docs/architecture/knowledge-map.yaml` pasa a v2. `deterministic-resume`, `target-parity`, `guard-fail-closed` y `contract-compatibility` declaran `checks` con los tests que ya los prueban; `offline-operation` declara `description`.
2. `scripts/lib/architecture-decisions.test.js` fija que el mapa de ospec es v2, que cada escenario declara `fitness` y que cada check nombra ficheros de test que existen.
3. `docs/architecture/README.md` y E3.6 en `docs/roadmaps/harness-evolution.md` reflejan el estado final.

## Decisions

- **Decisión previa (memoria):** «Traspaso de roadmap: siguiente E3.6 quality-scenario-fitness» (`roadmap/next-change`) -> `docs/roadmaps/harness-evolution.md:158`: current. E3.6 seguía `pending`, en paralelo con la Etapa 4.
- **Respuestas del gate open-facts (usuario, sesión desatendida: «si hay que elegir en algún momento, elige los recomendados»):** `deterministic-resume` ejecuta `idd-next.test.js` e `idd-store.test.js`; `target-parity`, `cli.test.js` (fixtures golden); `guard-fail-closed`, los tests de ADR 0008; `contract-compatibility`, los de ADR 0009. `offline-operation` queda como checklist: ningún test prueba la parte sin red y la frontera de memoria ya la ejecuta ADR 0006. El test del repositorio va en `architecture-decisions.test.js`.
- **Demostración del criterio fuera del cambio:** `ospec check` lee el fitness desde la base del cambio, que aún tiene el mapa v1, así que este cambio no puede ejecutarlo sobre sí mismo. En un clon temporal con el mapa v2 commiteado como base, un cambio que declara `target-parity` y `offline-operation` obtuvo en `ospec check` el run `fitness` `scenario:target-parity` (`node --test scripts/configure/cli.test.js`, exit 0), y `offline-operation` apareció en `fitness.manual` de `next` y `check`. El check `test` del clon falló solo porque `install-target.test.js` rechaza instalar bajo `/tmp`, donde estaba el clon.
- **Defecto fuera del cambio:** `readUntracked` (`scripts/lib/idd-workspace.js:228`) lanza ENOENT con un symlink roto sin trackear y tumba `ospec signals`; se reporta, no se arregla aquí.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-12T01:35:17.663Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-12T01:35:17.663Z)
<!-- ospec:evidence:end -->
