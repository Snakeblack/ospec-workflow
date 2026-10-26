# cli-one-word-invocation

## Intent and acceptance

E1.45 (B5): el CLI se invoca con una sola palabra en los 7 targets (shim bin/ospec y bin/ospec.cmd junto al runtime, que la skill nombra por su ruta absoluta), cada next_step trae su command literal (con el comando real del último rojo en lugar de <test>), un error de uso imprime solo la línea de su subcomando y cada rechazo dice cómo salir (how) o lleva la marca by-design

Acceptance: En los siete builds la skill nombra una ruta de una sola palabra que existe y se ejecuta en bash, zsh, fish, PowerShell y cmd, también con una ruta con espacios; cada next_step tiene command; un error de uso imprime solo la línea del subcomando; y el test que recorre los rechazos pasa sin baseline

## Plan

1. Shim. `bin/ospec` (sh, LF, con bit de ejecución) y `bin/ospec.cmd` (CRLF) ejecutan el `scripts/ospec.js` de al lado con los mismos argumentos; `.gitattributes` fija sus finales de línea. El build (`scripts/configure/cli.js`) añade `bin` a sus raíces y escribe `bin/ospec` con 0755. `{{ospec-cli}}` pasa a ser `${CLAUDE_SKILL_DIR}/../../bin/ospec` en Claude y `__OSPEC_RUNTIME_DIR__/bin/ospec` en el resto (`target-transform.js`, perfil `claude`), y las skills `idd` y `foundation` definen `ospec` con él, sin `node`. `ospecCliValue` y `renderRuntimeDir` (`shared-dir.js`) renderizan el shim de la plataforma, entrecomillado solo con espacios; Copilot, OpenCode y Codex (global y en repositorio) copian `bin/`, VS Code pasa su plataforma y Antigravity trata una raíz WSL como Windows. `ospec doctor` (`ospec-doctor-hosts.js`) da `error` en `runtime` sin shim o sin bit de ejecución, y `codex-repo` reconoce la frase nueva y la anterior.
2. `next_step.command` (`idd-next.js`): cada acción lleva su comando literal; tras un rojo, el comando de ese run en lugar de `"<test>"`, citado con `shellArg`; `none` lleva `null` y `choose-change` una lista `commands`. La salida en texto lo imprime en una línea `run:`.
3. Error de uso (`ospec.js`): `USAGE_ENTRIES` parte el uso en entradas por subcomando, y `usageFor` imprime solo las del subcomando, o la lista de comandos si es desconocido; con `--json` van en `error.how`.
4. Rechazos: `scripts/lib/idd-refusals.js` da el `how` de cada código, o `byDesign` con su motivo; `main` lo usa cuando el sitio no trae `how`, con `<id>` sustituido por `--change`. `idd-refusals.test.js` saca los códigos de los fuentes del CLI y exige que todos estén en la tabla, y que la tabla no tenga ninguno muerto.
5. Contrato y docs: REQ-idd-011 y REQ-idd-019, REQ-generator-024, REQ-install-035 y REQ-install-041; la guía de instalación (EN/ES), los README y el roadmap.

## Decisions

- **Un solo cambio con cuatro unidades** (respuesta del usuario): shim, `command`, error de uso y rechazos.
- **El instalador renderiza `bin/ospec.cmd` en Windows y `bin/ospec` en el resto; Claude nombra siempre `bin/ospec`** (respuesta del usuario). La ruta de Claude se fija al compilar y su Bash en Windows es Git Bash, que ejecuta el shebang; `.cmd` corre en PowerShell, cmd y Git Bash. Una raíz WSL de Antigravity se lee desde Windows, así que lleva `.cmd`.
- **La ruta va sin comillas, salvo que tenga un espacio** (respuesta del usuario): PowerShell solo ejecuta una ruta entrecomillada detrás de `&`. Queda como residuo una instalación de Claude bajo un home de Windows con espacios.
- **`command` empieza por la palabra `ospec` que define la skill** (respuesta del usuario): la salida sigue siendo determinista y coherente con `how` y el uso.
- **El último rojo se cita entre comillas dobles, o simples con `'\''` si lleva comillas, `$`, backticks o barras invertidas** (respuesta del usuario); vale en bash, zsh y fish. Hasta el primer rojo queda `"<test>"`.
- **`none` lleva `command: null`, `configure-checks` `ospec next --change <id> --json`, `open-change` la plantilla de `record intent` y `choose-change` una lista `commands`** (respuesta del usuario).
- **Un error de uso imprime solo las líneas de su subcomando, o la lista de comandos si es desconocido, y `--json` las lleva en `error.how`** (respuesta del usuario).
- **El `how` de cada rechazo vive en una tabla por código, y el `how` del sitio la sobrescribe; `byDesign` va en la tabla** (respuesta del usuario). Seis códigos son `byDesign`: los que solo alcanza un defecto del CLI (evidencia, base, archivo de un cambio abierto).
- **Un shell que falta se salta con su nombre** (respuesta del usuario), sin instalar nada en CI mientras corre el plazo de 0 flakes de E1.30: el CI cubre bash y PowerShell en los tres sistemas, zsh en macOS y cmd en Windows; fish, en local.
- **La skill `foundation` también nombra el shim; SDD no cambia** (respuesta del usuario).
- **`ospec doctor` da `error` en `runtime` sin shim o sin su bit de ejecución** (respuesta del usuario).
- **Una instalación en un repositorio renderiza el shim de la plataforma que la hace.** Es la regla del instalador aplicada tal cual; un repositorio compartido entre Windows y POSIX ve el shim de quien instaló.
- **`persistent-data` se cumple con un test de compatibilidad y un plan.** `check` lo deriva por la línea `writeFileSync` de `renderMarker` (`shared-dir.js`), que ahora escribe `render(content)`: solo renderiza las skills al instalar. `shared-dir.test.js` prueba que el marcador vuelve a `dist`, y `ospec-doctor-hosts.test.js` que una instalación anterior a E1.45 sigue reconocida; volver atrás es reinstalar la versión anterior.
- Prior decision (memory): todo funciona en los 7 targets y cada ítem de la auditoría declara su garantía por target -> docs/roadmaps/harness-evolution.md: current

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-26T15:05:50.631Z)
- ev-2: check-run for checks-pass (2026-10-26T15:07:31.703Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-26T15:07:31.703Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-26T15:07:31.703Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-26T15:07:58.267Z)
- ev-6: living-doc-current for living-doc (2026-10-26T15:08:47.408Z)
<!-- ospec:evidence:end -->
