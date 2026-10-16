# markitdown-pin-a7-uv-warning

## Intent and acceptance

markitdown MCP roto en instalaciones nuevas: el pin markitdown-mcp@0.0.1a4 crashea con dependencias actuales y el setup no avisa cuando uvx falta en PATH

Acceptance: La configuracion MCP generada parte de markitdown-mcp@0.0.1a7 en todos los targets y cada instalador que registra servidores MCP avisa (sin fallar) cuando uvx no esta en PATH; los tests cubren aviso presente y ausente

## Plan

- Causa raíz doble: el pin canónico `markitdown-mcp@0.0.1a4` (`.mcp.json`) ya no arranca con dependencias actuales (`ImportError: eval_type_backport` desde pydantic), y el setup no advertía cuando `uvx` faltaba en PATH (`NotFound: ChildProcess.spawn (uvx ...)`).
- Pin canónico a `markitdown-mcp@0.0.1a7` en `.mcp.json`, la única fuente que editan los generadores.
- Helper compartido `scripts/configure/mcp-prereqs.js` (`commandNames`, `commandsFromSourceMcp`, `warnIfUvxMissing`): el aviso va a stderr en español, nunca cambia el código de salida y solo se emite si el setup declara un servidor con comando `uvx` (dato, no lista hardcodeada). Sonda: `spawnSync("uvx", ["--version"], { stdio: "ignore", shell: false })`.
- Cableado en los 7 instaladores: opencode y copilot globales leen su configuración generada; codex lee las definiciones MCP que registra; cursor, vscode, antigravity y claude leen el `.mcp.json` de la fuente.
- Alcance decidido con el usuario: aviso en todos los setups y sin prewarm (el setup solo avisa; no descarga nada).

## Decisions

- `0.0.1a7` como pin: verificado extremo a extremo (conversión con URIs `file:`/`http:`/`data:` y `mcp>=2.1.1`); `a4` crashea con la resolución actual.
- Un helper compartido en lugar de duplicar la lógica: un solo comportamiento, tests propios (`mcp-prereqs.test.js`) y paridad entre targets.
- El aviso no bloquea: el instalador termina con éxito y explica el arreglo (`uv`/`uvx` y su documentación).
- Sin prewarm ni descarga silenciosa: se descartó para no añadir red ni cadena de suministro a la instalación (ADR 0010).
- Fixtures y literales de test (`__fixtures__/source/.mcp.json`, goldens, `install-codex.test.js`) mantienen `a4` a propósito: son datos sintéticos comparados entre sí, no configuración generada. La configuración real se genera siempre desde el `.mcp.json` raíz, ya en `a7` y verificado por `mcp-prereqs.test.js`.
- Hermeticidad: los tests que alcanzan el aviso con fuentes `uvx` inyectan `deps.spawnSync` (presente/ausente) para no depender del host; la suite completa (3745 tests) pasa sin `uvx` en PATH.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-16T14:36:39.821Z)
- ev-2: check-run for checks-pass (2026-10-16T15:02:07.660Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-16T15:02:07.660Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-16T15:05:57.597Z)
- ev-5: check-run for checks-pass (2026-10-16T15:07:06.607Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-16T15:07:06.607Z)
- ev-7: living-doc-current for living-doc (2026-10-16T15:07:24.385Z)
<!-- ospec:evidence:end -->
