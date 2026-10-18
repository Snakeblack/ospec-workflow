# windows-test-hotspots

## Intent and acceptance

Recortar los cuatro puntos calientes de la suite en Windows (preflight de rutas del instalador Codex, mkdir redundante, go build en frío del test de agy y arranques de Windows PowerShell 5.1) sin cambiar el comportamiento observable

Acceptance: La suma de duraciones TAP de los shards de Windows baja frente al run base 39165680389 (480 s y 675 s), con codex-smoke, codex-hook-shell, hosts/agy e install-codex-env-isolation más rápidos, y toda la suite en verde en las tres plataformas

## Plan

Medición de partida (run 39165680389 de main, TAP por fichero): los shards de Windows suman 480 s y 675 s, y el wall de un shard (242 s) lo marca el volumen con 3 workers. Los cuatro tests más caros suman 223 s en Windows y menos de 4 s en Linux.

1. Instalador (install-codex.js, install-engine.js): el preflight de Codex hacía 8.340 `realpathSync` en una instalación global (raíz aprobada y padre por entrada, más un ENOENT por nivel de un destino sin crear). Se memoizan por pasada y se quita el `mkdir` repetido del directorio ya creado. Medido en local: `realpathSync` pasa de 8.340 a 1.092 en codex-smoke y de 3.234 a 577 por instalación de antigravity.
2. CI: `actions/setup-go` con caché en validate-harness.yml, porque el test de agy compila ospec-hooks (no versionado) desde el checkout.
3. Windows PowerShell 5.1 (49,7 s en 3 llamadas del hook frente a 1-3 s de cmd, pwsh 7 y Git Bash): medir la causa con un workflow de experimento temporal (`.github/workflows/experiment-windows-hotspots.yml`, que se borra antes del merge) y corregir en el entorno del test solo lo demostrado.
4. Medir el después con el CI del PR frente al run base.

Fuera de alcance: ospec.test.js (130 s en Windows, ~100 tests que lanzan procesos), install-cursor.js (tiene su propio realpathIfExists) y la memo de runConfigure en los tests (ahorraría ~6 % en Linux).

## Decisions

- La memo de Codex cachea también las rutas que faltan: el preflight no escribe nada mientras recorre. La del motor compartido solo cachea rutas existentes, porque la sincronización crea directorios entre comprobaciones.
- El `lstat` por entrada que detecta un enlace simbólico se mantiene; solo se reutiliza la resolución canónica de la raíz y de los padres.
- Se añade un test de caracterización del rechazo de un ancestro redirigido fuera de la raíz, que no tenía cobertura. Pasa con el código anterior y falla si se rompe la canonicalización.
- No se compila ospec-hooks en un paso previo de CI: añadiría el build en frío en serie fuera del pool paralelo.
- Windows PowerShell 5.1 no se toca. El experimento (run 39167811850) da 0,2 s por arranque aislado, sin diferencia con PSModulePath reducido, caché de análisis nueva o el HOME del test, y 1,4 s para su subtest con el fichero solo. Los 49,7 s de la suite completa son contención, y no hay nada demostrado que corregir en el entorno del test. El mismo run confirma el go build en frío: 19 s sin caché frente a 0,4 s con ella.
- La memo del instalador se mantiene (decisión del usuario) aunque su efecto en Windows es pequeño. A/B en el mismo runner con Dev Drive (run 39168602519): la instalación global de Codex tarda 7,4/8,1/9,5 s con el instalador base y 6,3/4,8/9,5 s con la memo; la de repositorio no cambia. Los 76-118 s de ese test dentro de la suite eran contención: un test tarda unas 10 veces más en la suite que solo, y varía mucho entre runs.

### Result

- CI del PR #365 (run 39167983723) frente al run base: agy baja de 53,9 a 14,4 s en Windows y de 9,9 a 2,4 s en Ubuntu, gracias a la caché de Go. El resto de diferencias por fichero entra en el ruido entre runs (Ubuntu sube de 202 a 264 s de suma sin cambios relevantes).
- El único fallo fue el flake conocido de `browser.test.js` ("startBrowser reports the timeout and stderr…"), ajeno al cambio. Pasa a un cambio aparte de E1.30.

### Follow-ups

- E1.30: el flake de startBrowser; hacerlo determinista con un ChildProcess falso dentro del test, sin arrancar un proceso real.
- La contención de Windows (3 workers que lanzan procesos) es la causa de fondo del sobrecoste; medir aparte `--test-concurrency`.
- ospec.test.js (130 s en Windows) e install-cursor.js, que tiene su propio realpathIfExists.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-18T21:21:21.186Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-18T21:21:21.186Z)
- ev-3: check-run for checks-pass (2026-10-18T21:29:40.650Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-18T21:29:40.650Z)
- ev-5: check-run for checks-pass (2026-10-18T21:41:11.749Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-18T21:41:11.749Z)
- ev-7: living-doc-current for living-doc (2026-10-18T21:41:30.238Z)
<!-- ospec:evidence:end -->
