# ci-windows-optimization

## Intent and acceptance

Optimizar el CI: quitar el doble run por PR, acelerar Windows con medidas que demuestren ganancia y arreglar el flake startBrowser

Acceptance: Validate y Build ospec-hooks corren una vez por PR (pull_request) y en push solo en main; el job de Windows baja de forma medida frente a la base de 9 min 46 s; el test startBrowser hang no depende de que Node arranque en 500 ms

## Plan

1. Disparo: Validate Harness y Build ospec-hooks corren en push solo en `main`; las PR se validan por `pull_request`. Un run de `main` ya no se cancela, porque publish-marketplace necesita el de su SHA.
2. Windows: TEMP en un Dev Drive ReFS y los tests de Node en 2 shards (`node scripts/check.js --shard i/n`, los targets se generan solo en el shard 1).
3. Flakes, por causa: el fake `hang`/`cold` de `startBrowser` con 5 s; `connect()` rechaza las peticiones CDP pendientes al cerrarse la conexión; timeouts de cuelgue de 180 s en el suite anidado de Codex y en los shells reales.
4. Reintento acotado y visible solo en Windows: los fallos de infraestructura de los checks de navegador (sin veredicto, puerto DevTools, conexión) y el fallo de plazo del lanzador en `codex-hook-shell`.

## Decisions

- Medido en windows-latest (runs 39158886165 y 39160017608), wall de `node --test`: base 623/738 s; Defender 557/582 s (el runner ya trae `RealTimeProtectionEnabled=False`, así que no se aplica); Dev Drive 385/401/411/378 s; shards con Dev Drive 202-284 s; concurrencia 8 no acelera y sirve de prueba de estrés.
- `CHILD_TIMEOUT_MS` (4 s) de producción no cambia: el usuario eligió el reintento acotado en el test frente al plazo configurable por entorno.
- La memoización de la generación de targets en los tests queda para un cambio aparte.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-18T19:29:14.829Z)
- ev-2: repro-run-pair for repro-test (2026-10-18T19:33:33.054Z)
- ev-3: repro-run-pair for repro-test (2026-10-18T19:54:34.478Z)
- ev-4: check-run for checks-pass (2026-10-18T19:56:49.952Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-18T19:56:49.952Z)
- ev-6: check-run for checks-pass (2026-10-18T20:13:12.671Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-18T20:13:12.671Z)
- ev-8: living-doc-current for living-doc (2026-10-18T20:13:12.754Z)
<!-- ospec:evidence:end -->
