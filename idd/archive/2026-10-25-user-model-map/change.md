# user-model-map

## Intent and acceptance

E4.12: ospec deja de mantener nombres de modelo. Los tiers cheap/default/premium siguen siendo la única etiqueta de las reglas; Claude usa solo alias (haiku, sonnet, opus); en Codex, Copilot/VS Code, OpenCode y Cursor el usuario asigna sus modelos a cada tier y la asignación se guarda; un tier sin asignar hace que el agente herede el modelo de la sesión

Acceptance: Una instalación nueva en Codex, OpenCode y Cursor no escribe ningún nombre de modelo que no haya elegido el usuario, en Claude usa solo alias, y un tier sin asignar degrada a heredar sin error (también en Cursor, cuyo model es opcional con inherit por defecto). Un test lo comprueba por host

## Plan

1. **Asignación y resolución.**
   - `scripts/lib/user-models.js` (nuevo) da la ruta de la asignación del usuario, un lector estricto, el escritor, el flag `--model <tier>=<modelo>` y `prepareUserModels`. Los instaladores globales lo llaman desde `withEngramStep`; Claude e `install-target`, desde su propio `main`.
   - `models.yaml` se queda con la política agente → tier, los alias de Claude y el effort de Codex por tier. Desaparecen el catálogo y la política del TUI.
   - `model-resolver.js` aplica la asignación del usuario, y `runConfigure` la recibe como `userModels`.
   - `validate-cursor.js` deja de exigir `model`.
   - `install-output.js` añade la fila «Modelos» y el aviso de los tiers que heredan.
2. **Protocolo v3 y TUI.**
   - `installer-adapter.js` planifica los tiers de cada host, con sus agentes, el modelo del usuario y lo que significa un tier vacío, y convierte la petición en flags `--model`.
   - El TUI de `internal/installer` pide un campo de texto por tier, sin presets, catálogo ni controles.
3. **Contratos y documentación.**
   - REQ-generator-005, el escenario 6, REQ-generator-001 y la parte de Cursor del spec del generador.
   - REQ-install-019 a 025 del spec de install.
   - `docs/model-routing.md`, los dos README y `docs/target-capabilities.md`.
   - Tests por host en `scripts/configure/user-model-map.test.js`.

## Decisions

Prior decision (memory): «Decisión: mapeo de tiers a modelos del usuario (opción A)» -> docs/roadmaps/harness-evolution.md (E4.12): current.

Decisiones del usuario del 2026-10-25 (gate `open-facts`, las cuatro recomendadas):

- La asignación es por tier y host y se hace al instalar, con el TUI o con un flag no interactivo. Desaparece la elección por agente. El reasoning effort de Codex por tier se queda en ospec. Preguntar en el primer uso queda para E4.13.
- El modelo es texto libre, sin validar contra un catálogo, y el catálogo de `models.yaml` desaparece. En Claude, los tiers usan `opus`, `sonnet` y `haiku` por defecto, y el usuario puede cambiar cualquiera a otro alias, `fable` incluido.
- La asignación es global del usuario: `~/.config/ospec/models.yaml`, o `%APPDATA%\ospec\models.yaml` en Windows. Un fichero corrupto, o con un tier o host desconocido, se ignora con un aviso visible y los agentes heredan.
- Las instalaciones que ya tienen modelos fijados por ospec no se migran: pasan a heredar, y el instalador avisa de qué tiers puede asignar.

Decisiones de desarrollo:

- **La configuración del usuario solo la leen los instaladores.** `runConfigure` recibe la asignación como parámetro, igual que recibía los overrides del TUI, y no la lee él. Así un build normal (`dist/`, la CI, el marketplace publicado) nunca depende de la máquina que lo genera. Es conforme con ADR 0001: la generación sigue siendo una transformación pura.
- **El effort de Codex sin modelo no se escribe.** Un tier sin modelo omite `model`, `model_reasoning_effort` y `model_verbosity`, porque un effort no tiene sentido sin saber para qué modelo es.
- **Un fichero corrupto no se sobrescribe nunca.** `--model` falla y pide corregirlo o borrarlo. Si se reescribiera, se perderían las asignaciones de los demás hosts.
- **El fichero tiene su propio lector estricto**, no el parser de `models.yaml`, que lee como lista un valor que empieza por `[`. Los valores se escriben como cadenas JSON. Un nombre de modelo es una línea de 1 a 200 caracteres sin caracteres de control, porque acaba en frontmatter y en TOML.
- **El TUI y el flag comparten un solo camino de escritura.** El adaptador convierte la petición del TUI en flags `--model` para el instalador, así que no hay otro camino que escriba la asignación. Un tier vacío en el TUI envía `--model <tier>=`, que lo deja sin modelo.
- **Un `--dry-run` no guarda nada**: los flags valen solo para esa ejecución.
- **Los tests que simulan el home no leen la asignación real.** Cuando un test pasa `deps.homedir`, `withEngramStep` y `install-claude` usan además un entorno vacío, así que nunca leen la asignación del desarrollador.
- **`install-target`, la instalación local por proyecto, también admite `--model`.** Sin él, no habría forma de asignar modelos en ese camino.
- **La sección 11 del spec de install se reescribe.** REQ-install-024 (catálogo buscable y controles) pasa a exigir lo contrario, y REQ-install-025 (descubrimiento en Codex y OpenCode, que nunca llegó a implementarse) queda retirado.
- **Fuera de alcance:** los perfiles heredados de `profiles/models/`, que el generador no lee.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-25T00:12:57.625Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-25T00:12:57.625Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-25T00:12:57.625Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-25T00:13:12.213Z)
- ev-5: check-run for checks-pass (2026-10-25T00:14:23.647Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-25T00:14:23.647Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-25T00:14:23.647Z)
- ev-8: living-doc-current for living-doc (2026-10-25T00:14:27.848Z)
<!-- ospec:evidence:end -->
