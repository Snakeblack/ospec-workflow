# head-to-head-gentle-ai

## Intent and acceptance

Añadir al banco de E4.1 un brazo gentle-ai (ODD y RDD) con el mismo host y modelo, correr los seis escenarios y publicar la comparación con SDD e IDD

Acceptance: Existe un informe publicado que compara gentle-ai con IDD y SDD en los seis escenarios, con numeradores, denominadores y exclusiones, reproducible desde records versionados

## Plan

Dos unidades, en PRs encadenados:

1. **Brazo gentle-ai en el banco** (`scripts/evals/bench/`): `arms.js` (brazo `gentle-ai` y criterio de terminado), `hosts/gentle-ai.js` (instalación, identidad y engram por workspace), `hosts/claude.js` (turnos del agente en el HOME de gentle-ai; la persona sigue en la configuración del banco), `driver.js` (`isComplete` recibe el commit base; `host.release` al terminar), `bench.js` (`setup-gentle-ai` y `run --arm gentle-ai`), `record.js` (nombre del plugin en el informe), `checkpoint.js` (cabecera genérica), `margins.json` (`bench-margins-6`), tests, README y `openspec/specs/bench/spec.md` (REQ-bench-002, 004, 005 y 006).
2. **Corridas e informe:** `gentle-ai-1` e `idd-3` (Sonnet 5.5, una repetición, Claude Code 2.1.296), checkpoint con `bench-margins-6`, métricas de calidad del diff y mutation testing (`scripts/evals/quality/` mide desde el commit `setup` y cuenta `odd/` y `.atl/` como flujo), informe en `docs/analysis/2026-10-12-bench-gentle-ai.md`, fila «Escenarios comparados» y sección E4.2 del roadmap, y tabla medida en `docs/comparacion-arneses.md`.

## Decisions

Del gate `open-facts` (usuario, 2026-10-12, «todas las recomendadas»):

- gentle-ai v4.1.1 compilado desde el tag con `-X main.version=4.1.1`, persona `neutral`, alcance global dentro de un HOME aislado, RDD en su valor por defecto (activo).
- Engram vacío y aislado solo en el brazo gentle-ai; SDD e IDD siguen sin MCP.
- Se vuelve a correr IDD con el plugin actual junto a gentle-ai; `sdd-baseline-3` queda como referencia histórica.
- Sonnet 5.5, una repetición; márgenes declarados antes de correr con veredicto no bloqueante (IDD no escapa más defectos que gentle-ai y gasta ≤ 1,0× sus tokens); `maxCostUsd` 25 por corrida y tope total de unos 60 USD.
- Publicación: informe en `docs/analysis/`, columna gentle-ai en el roadmap y tabla en `docs/`; se repite en cada checkpoint de etapa. Calidad: métricas del diff y mutation testing, sin revisión a ciegas.

Revisadas por el usuario tras instalar gentle-ai (2026-10-12):

- Componentes `persona,engram,skills` con las skills de `ecosystem-only`: el preset completo instala GGA (binario global, fuera del aislamiento) y Context7 (MCP de red).
- Terminado = al menos un commit tras el setup, nada sin commitear fuera de `odd/` y ninguna tarea sin marcar en `odd/tasks/*.md`. ODD no crea documento para el trabajo pequeño y apunta el hash en el documento después de cada commit.
- Un engram por escenario (datos en `.git/bench-engram`, puerto propio, parado al terminar): los hooks del plugin de engram usan el servidor HTTP del puerto 7437, el del usuario, salvo que se aísle.
- Telemetría desactivada (`telemetry disable` y `DO_NOT_TRACK=1`), con `GENTLE_AI_NO_SELF_UPDATE=1`.

De desarrollo:

- gentle-ai escribe siempre en `$HOME/.claude` y registra el MCP en `$HOME/.claude.json`, que Claude Code no lee con `CLAUDE_CONFIG_DIR`: el agente corre con `HOME` propio y la persona sigue en el `CLAUDE_CONFIG_DIR` del banco, para que sea idéntica en todos los brazos.
- Los binarios se copian en `<home>/bin` (el MCP usa `GENTLE_AI_ENGRAM_BIN`), y la identidad del record (`plugin_version`, `plugin_digest`) cubre ambos binarios y los assets que lee una corrida, no el estado de Claude Code.
- Las corridas reales destaparon tres defectos del brazo, corregidos antes de los records: sin `--strict-mcp-config` entraban los conectores claude.ai de la cuenta (ahora `--mcp-config` con los `mcpServers` de `$HOME/.claude.json`); `.atl/`, el registro de skills que gentle-ai regenera en cada sesión, impedía terminar (se excluye como `odd/`); e interrumpir el banco dejaba huérfanos el `claude -p` en curso y su engram.
- `scripts/evals/quality/` suponía HEAD = commit `setup` (los brazos de ospec no commitean); ahora mide desde el commit `setup`, para contar lo que gentle-ai commitea. Con los brazos de ospec da el mismo diff.
- Versión 2.133.0 (minor), elegida por el usuario.
- `bench-margins-6` no declara `harness_exception`: `gentle-ai-1` e `idd-3` corren con el mismo harness. Cambiar el harness invalida la excepción de `bench-margins-5`, así que se retiran `harness-exception.test.js` y sus fixtures; el checkpoint de E4.1 se reproduce desde v2.132.1.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-12T19:44:47.610Z)
- ev-2: check-run for checks-pass (2026-10-12T21:14:58.091Z)
- ev-3: living-doc-current for living-doc (2026-10-12T21:15:02.432Z)
<!-- ospec:evidence:end -->
