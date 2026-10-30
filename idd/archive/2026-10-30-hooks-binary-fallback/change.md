# hooks-binary-fallback

## Intent and acceptance

El binario ospec-hooks desfasado o que no se puede ejecutar deja de ensombrecer al hook Node: el instalador no copia un binario anterior al código Go si no puede recompilarlo, y el lanzador reintenta con el hook Node cuando el binario no arranca (EACCES, ENOEXEC, 126)

Acceptance: Sin Go y con release/dist/ospec-hooks-<os>-<arch> más viejo que cmd/ e internal/, copyBinaryToTree no lo copia al árbol de un target con fallback Node y avisa; con un binario sin +x o de otra arquitectura, ospec-hooks-launch.js ejecuta <sub>.js y devuelve su salida en vez de ask/[ospec error]

## Plan

<!-- ospec:plan:start -->
- Files: `docs/harness-go-js-parity.md`, `openspec/specs/hooks/spec.md`, `openspec/specs/install/spec.md`, `openwiki/hooks-runtime/go-implementation.md`, `openwiki/hooks-runtime/lifecycle.md`, `scripts/configure/install-target.js`, `scripts/configure/install-target.test.js`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- ensureRuntimeBinary devuelve null ante un binario desfasado sin Go, salvo con allowStale; copyBinaryToTree lo pide solo para opencode, cuyo plugin no tiene fallback Node
- Un binario desfasado descartado no aborta aunque el target lo marque required (Cursor, Copilot global): sus hooks pasan por el lanzador y corren en Node; un binario ausente sigue abortando como antes
- install-target borra el binario genérico de una instalación anterior dentro de syncEntriesTransactional (parámetro removals), que también hace snapshot de su entrada, así que un rollback lo restaura; los instaladores globales ya lo podan con su manifiesto
- El lanzador reintenta con Node solo ante EACCES, ENOEXEC, ENOENT y salida 126/127, dentro del mismo plazo de 4 s, con un aviso [ospec warn] en stderr; timeout, señal u otro código no se reintentan
- No se embebe la versión en el binario: el desfase sigue detectándose por mtime (E1.22), porque la versión solo cambia en los commits de release
<!-- ospec:decisions:end -->

Los cuatro open facts los resolvió el usuario con las opciones recomendadas: OpenCode recibe el binario desfasado con aviso, el reintento cubre EACCES, ENOEXEC, ENOENT y 126/127 con aviso en stderr, la versión no se embebe y la instalación en repo borra el binario anterior. `openwiki/hooks-runtime/lifecycle.md` se declaró en el plan, pero no describe el binario y quedó sin cambios; la página que lo hace es `go-implementation.md`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-30T19:12:27.852Z)
- ev-2: check-run for checks-pass (2026-10-30T19:16:40.678Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-30T19:16:40.678Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-30T19:17:02.013Z)
- ev-5: frozen-review for trust-review (2026-10-30T19:18:48.902Z, subagent-stop)
- ev-6: living-doc-current for living-doc (2026-10-30T19:19:01.531Z)
<!-- ospec:evidence:end -->
