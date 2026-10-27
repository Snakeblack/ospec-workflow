# bench-browser-keyring

## Intent and acceptance

El Chromium headless del banco no carga ninguna página http cuando el llavero del escritorio (org.freedesktop.secrets por D-Bus) no responde, porque cifra las cookies con una clave que pide al llavero antes de su primera petición de red; además, cuando una página no carga, el check-runner muere por un rechazo no gestionado y deja el navegador y su perfil huérfanos

Acceptance: Con el llavero del escritorio sin responder, los checks de navegador del corpus greenfield (checks-greenfield.test.js) cargan sus páginas y pasan en local, porque el navegador arranca con --password-store=basic

## Plan

1. Llavero: `BROWSER_FLAGS` (`scripts/evals/bench/browser.js`) añade `--password-store=basic` y `--use-mock-keychain`. Un test de `browser.test.js` fija que el arranque las lleva.
2. Huérfanos: `open()` y `reload()` esperan con `Promise.all` la carga y el comando de navegación. Un test con una conexión DevTools que nunca responde a `Page.navigate` ni a `Page.reload` comprueba que las dos fallan con `the page did not finish loading`.
3. El roadmap anota E1.56 en el bloque A, por delante de E1.55.

Reproducción: `node --test scripts/evals/bench/browser.test.js scripts/evals/bench/checks-greenfield.test.js`. En rojo fallaban los dos tests nuevos y los 32 checks reales de Chromium, con el llavero de esta máquina sin responder, y quedaron 330 procesos huérfanos. En verde pasa todo, sin navegadores ni perfiles sobrantes.

## Decisions

- Respuesta del usuario al gate `open-facts`: el cambio incluye la fuga de navegadores huérfanos y añade también `--use-mock-keychain` para macOS.
- `createPage` se exporta y acepta `loadTimeoutMs`. Así el test de la navegación sin respuesta tarda 50 ms en vez de los 15 s de `LOAD_TIMEOUT_MS`, que no cambia.
- En CI el cuelgue del llavero no se puede reproducir: un runner sin escritorio ya usa el almacén básico, y un bus D-Bus mudo cuelga Chromium también con `--password-store=basic`. Por eso el test de las opciones fija los argumentos del arranque, y la reproducción real son los checks de `checks-greenfield.test.js` en una máquina con el llavero sin responder.
- Prior decision (memory): Chromium headless no carga http en local: la causa es el llavero del sistema, no tailscale -> scripts/evals/bench/browser.js: current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-27T09:47:24.265Z)
- ev-2: check-run for checks-pass (2026-10-27T09:51:38.046Z)
- ev-3: living-doc-current for living-doc (2026-10-27T09:51:45.326Z)
<!-- ospec:evidence:end -->
