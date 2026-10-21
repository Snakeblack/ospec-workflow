# ospec-dir-ignored

## Intent and acceptance

Los datos de sesión de .ospec/ quedan ignorados por git en cualquier proyecto, y el banco no los versiona en el commit setup

Acceptance: En un repositorio sin .ospec/ en .gitignore, tras el hook Stop git status queda limpio y git check-ignore .ospec/session/latest.md da 0; en el banco el commit setup no contiene .ospec/ y un cambio IDD cerrado y commiteado cuenta como entrega sin tocar .gitignore

## Plan

1. Producto, Node: `mkdirOspec` e `ignoreOspecDir` en `scripts/lib/ospec-gitignore.js`; los usan el hook Stop, `pre-tool-use` (token events), `subagent-stop` (recibos de review), `ospec-state` (resumen de sesión, eventos, costes por fase, mediciones de contexto), `skill-registry` (caché) y `archive-transaction` (diario y recibo).
2. Producto, Go: paquete `internal/ospecdir` (`MkdirAll`) en `store` (resumen, eventos, costes), `skillreg` (caché), `hooks/stop` y `hooks/pretooluse`.
3. Doctor: `session-dir` avisa primero de ficheros de `.ospec/` ya versionados (`git rm -r --cached .ospec`) y prueba el ignore con `.ospec/session/latest.md`, porque `.ospec/.gitignore` ignora el contenido, no la carpeta.
4. Banco: `prepareWorkspace` añade `.ospec/` a `.git/info/exclude` antes del commit `base`.
5. Specs y docs: REQ-hooks-028, `session-dir` en REQ-idd-019, workspace del banco, `docs/harness-runtime.md` y README del banco.

## Decisions

- Respuestas del usuario (gate `open-facts`): `.ospec/.gitignore` con `*` (no se toca el `.gitignore` del usuario); todo escritor con un helper común; `ospec doctor` detecta lo ya versionado; el banco excluye con `.git/info/exclude` y lo prueba; un `.ospec/.gitignore` existente se deja intacto.
- El helper busca el ancestro `.ospec` más cercano del directorio que crea; fuera de `.ospec/` solo crea el directorio. Así sirve a escritores genéricos (`writeRegistryCache`) sin conocer el workspace.
- `strict-tdd-evidence-remediation.js` no se toca: la guarda K1 (`k1-scope-guard.test.js:504`) congela ese fichero. Su snapshot histórico se escribe dentro de una sesión en la que otro escritor (la caché de SessionStart, el Stop) ya ha creado `.ospec/.gitignore`.
- En `archive-transaction` se mantiene el `fsx.mkdir` inyectable (tests de fallos) y se llama después a `ignoreOspecDir`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-21T13:36:27.025Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-21T13:40:59.184Z)
- ev-3: check-run for checks-pass (2026-10-21T13:42:25.340Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-21T13:42:25.340Z)
- ev-5: frozen-review for trust-review (2026-10-21T13:44:52.651Z, subagent-stop)
- ev-6: living-doc-current for living-doc (2026-10-21T13:44:57.707Z)
<!-- ospec:evidence:end -->
