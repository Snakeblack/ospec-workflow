# local-git-gates

## Intent and acceptance

PR3b: el pre-commit valida el índice real con git commit -a o con rutas; el escaneo de secretos no bloquea por fixtures ya versionados y su bypass no rompe los tests; tdd_mode y trailers se leen con un lector YAML-lite que ignora comentarios y respeta secciones; los directorios de fixtures quedan en LF

Acceptance: Un commit -a con un .js roto es rechazado por check.js --staged; un commit que toca pre-tool-use.test.js sin añadir secretos pasa el escaneo; un comentario '# tdd_mode: strict' no activa Strict TDD y 'trailers: required' de otra sección no exige trailers; scripts/evals/bench/scenarios y los demás fixtures llevan eol=lf

## Plan

<!-- ospec:plan:start -->
- Files: `.gitattributes`, `docs/harness-runtime.md`, `docs/tdd-y-revision.md`, `openspec/specs/agent-shield-security/spec.md`, `openspec/specs/git-precommit-hook/spec.md`, `openspec/specs/hooks/spec.md`, `scripts/check.js`, `scripts/check.test.js`, `scripts/gitattributes-fixtures.test.js`, `scripts/hooks/commit-msg-hook.js`, `scripts/hooks/commit-msg-hook.test.js`, `scripts/hooks/lib/staged-validator.integration.test.js`, `scripts/hooks/lib/staged-validator.js`, `scripts/hooks/lib/staged-validator.test.js`, `scripts/hooks/pre-commit-hook.js`, `scripts/hooks/pre-commit-hook.test.js`, `scripts/lib/precommit-strict.js`, `scripts/lib/precommit-strict.test.js`, `scripts/lib/yaml-lite.js`, `scripts/lib/yaml-lite.test.js`
- Work units: 4
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El pre-commit pasa el índice del commit a check.js --staged como --index <ruta absoluta>, que solo lo usa como GIT_INDEX_FILE en sus llamadas a git: una variable de entorno llegaría a los tests que crean repositorios temporales
- El escaneo de secretos del pre-commit evalúa solo las líneas del blob staged que HEAD no tiene, contando repeticiones; no usa git diff --cached porque lee el árbol de trabajo cuando coincide con el índice y no falla con un blob staged ilegible (ADR 0008)
- check.js --staged no hereda DISABLE_AGENT_SHIELD, DISABLE_OSPEC_PRECOMMIT ni DISABLE_OSPEC_ATTRIBUTION_CHECK, para que el bypass de emergencia no rompa los tests del escudo
- scripts/lib/yaml-lite.js lee un escalar por ruta de claves (bloque o mapa flow de una línea, sin comentarios); sustituye solo los lectores por regex de tdd_mode y trailers
- .gitattributes fija text=auto eol=lf en **/fixtures/**, **/__fixtures__/**, **/testdata/** y los dos directorios scenarios; scripts/evals/bench/__fixtures__ queda con !text !eol por la decisión de bench-knowledge-crlf
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-08T20:33:12.484Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-08T20:34:53.328Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-08T20:35:58.845Z)
- ev-4: frozen-review for trust-review (2026-11-08T20:40:03.918Z, subagent-stop)
- ev-5: check-run for checks-pass (2026-11-08T20:41:27.169Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-08T20:41:27.169Z)
- ev-7: living-doc-current for living-doc (2026-11-08T20:41:27.509Z)
<!-- ospec:evidence:end -->
