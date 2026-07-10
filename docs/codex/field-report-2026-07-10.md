# Informe de campo: instalación real del target Codex

Fecha de observación: 2026-07-10  
Host validado: Windows 11, Codex CLI `0.144.1`  
Objetivo: explicar por qué un marketplace aparentemente registrado no cargaba
correctamente agentes, skills, hooks y MCP, y convertir la reparación local en
requisitos reproducibles para cualquier máquina.

## Resumen ejecutivo

El marketplace `ospec-tools` estaba registrado y su snapshot Git existía, pero
`ospec-workflow` no estaba instalado. Tras instalarlo, Codex detectó otros tres
problemas independientes:

1. El manifiesto usaba rutas sin el prefijo obligatorio `./`, por lo que Codex
   ignoraba `skills`, `mcpServers` y `hooks`.
2. Los agentes TOML estaban dentro del payload del plugin, pero no en
   `~/.codex/agents/`; los plugins no instalan agentes personalizados por sí
   solos.
3. `hooks/hooks.json` conservaba el shape plano y contratos de entrada/salida
   heredados de Claude. Codex 0.144 requiere grupos con `matcher` y un array
   interno `hooks`.
4. Los IDs MCP contenían `/`, que viola el patrón admitido por Codex.

La reparación local confirmó que el harness funciona cuando las cuatro capas se
instalan correctamente. Una tarea Codex nueva pudo ver `sdd-propose`, ejecutar
`SessionStart` e invocar el agente personalizado `sdd-orchestrator`.

## Fuentes de verdad del host

- [Construcción de plugins](https://developers.openai.com/codex/plugins/build.md)
- [Agentes múltiples y agentes personalizados](https://developers.openai.com/codex/multi-agent.md)
- [Hooks de Codex](https://developers.openai.com/codex/hooks.md)
- [Configuración avanzada](https://developers.openai.com/codex/config-advanced.md)
- [Referencia de `config.toml`](https://developers.openai.com/codex/config-reference.md)

Cuando la documentación y el comportamiento observado difieran, una prueba con
la versión de Codex soportada debe decidir el contrato. El smoke test descrito al
final es parte del criterio de aceptación, no una comprobación opcional.

## Diagnóstico por capas

### 1. Marketplace registrado no equivale a plugin instalado

El snapshot estaba presente bajo `~/.codex/.tmp/marketplaces/ospec-tools`, pero:

```text
ospec-workflow@ospec-tools
installed: false
enabled: false
```

La verificación correcta debe ejecutarse en el perfil real del usuario, no desde
un sandbox que remapee `CODEX_HOME`:

```powershell
codex plugin marketplace list --json
codex plugin list --available --json
```

La instalación explícita es:

```powershell
codex plugin add ospec-workflow@ospec-tools --json
```

Resultado esperado: `installed: true` y `enabled: true` en
`codex plugin list --json`.

### 2. Las rutas del manifiesto deben empezar por `./`

El payload publicado contenía:

```json
{
  "skills": "skills/",
  "mcpServers": ".mcp.json",
  "hooks": "hooks/hooks.json"
}
```

Codex lo aceptaba en el catálogo, pero al iniciar una tarea escribía:

```text
ignoring skills: path must start with `./` relative to plugin root
ignoring mcpServers: path must start with `./` relative to plugin root
ignoring hooks: path must start with `./` relative to plugin root
```

El shape mínimo correcto es:

```json
{
  "name": "ospec-workflow",
  "version": "<semver>",
  "description": "<descripcion>",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "hooks": "./hooks/hooks.json"
}
```

El generador y el validador deben rechazar cualquier path de componente que no
sea relativo, no empiece por `./` o pueda escapar del plugin root.

### 3. Los agentes son un canal de instalación separado

Codex autodetecta agentes personales en `~/.codex/agents/*.toml` y agentes de
proyecto en `<repo>/.codex/agents/*.toml`. Cada TOML debe definir al menos:

```toml
name = "sdd-orchestrator"
description = "..."
developer_instructions = """..."""
```

Guardar esos archivos dentro de `<plugin>/.codex/agents/` no basta. La
instalación remota del marketplace instala el plugin, pero no copia los agentes
al directorio global. Por eso el instalador debe sincronizarlos de manera
separada e idempotente:

```text
<payload>/.codex/agents/*.toml -> ~/.codex/agents/*.toml
```

La instalación de proyecto usa el equivalente:

```text
<payload>/.codex/agents/*.toml -> <repo>/.codex/agents/*.toml
```

No hace falta registrar cada agente mediante `agents.<name>.config_file` cuando
se usa el directorio de autodiscovery. Sí conviene definir límites globales
válidos (`agents.max_threads`, `agents.max_depth`) cuando el producto decida
gestionar `.codex/config.toml`.

### 4. Shape vigente de hooks

El shape plano no es suficiente:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "..."
      }
    ]
  }
}
```

Codex 0.144 organiza cada evento como grupos de matcher con handlers internos:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/scripts/hooks/codex-hook-adapter.js\" PreToolUse",
            "commandWindows": "node \"$env:PLUGIN_ROOT\\scripts\\hooks\\codex-hook-adapter.js\" PreToolUse",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

El bridge debe emitir este wrapper para `SessionStart`, `PreToolUse`,
`PreCompact`, `SubagentStop` y `Stop`. Los comandos deben ser portables:

- `command` usa `${PLUGIN_ROOT}`.
- `commandWindows` evita depender de expansión POSIX en PowerShell.
- El runtime recibe además `PLUGIN_DATA` para estado escribible propio.

Instalar o habilitar un plugin no confía automáticamente sus hooks. En una
tarea nueva, el usuario debe abrir `/hooks`, revisar el hash vigente y confiar
la definición. Cambiar el hook invalida esa confianza y requiere otra revisión.

### 5. Adaptación del wire contract

El runtime heredado y Codex no nombran todos los campos igual. El adapter
validado localmente realizó estas normalizaciones:

| Evento | Entrada o salida heredada | Contrato Codex |
| --- | --- | --- |
| `SubagentStop` | `transcript_path` | `agent_transcript_path` (crear alias hacia `transcript_path` mientras el runtime migra) |
| Eventos de sesión | `session_id` | aceptar también `thread_id` como fallback |
| `PreToolUse` advisory | `permissionDecision: "ask"` | `ask` aún no está soportado; emitir `additionalContext`/`systemMessage` y conservar el flujo normal de aprobación |
| `PreToolUse` allow | `permissionDecision: "allow"` sin rewrite | devolver éxito vacío para no sustituir el flujo normal de permisos |
| `PreToolUse` deny | `permissionDecision: "deny"` | conservar `hookSpecificOutput` con `hookEventName`, decisión y motivo |
| `SessionStart` | campos top-level propios (`baseline`, `capabilities`, etc.) | encapsular contexto modelo-visible en `hookSpecificOutput.additionalContext` |

No se debe tratar la adaptación local como solución final. El target debe emitir
el contrato Codex directamente o incluir un adapter versionado y testeado dentro
del plugin.

### 6. IDs válidos de MCP

Codex 0.144 exige nombres que cumplan:

```text
^[a-zA-Z0-9_-]+$
```

Estos IDs publicados fallaban al arrancar:

```text
io.github.upstash/context7
microsoft/markitdown
```

La forma portable usada en la reparación fue:

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["@upstash/context7-mcp@1.0.31"] },
    "markitdown": { "command": "uvx", "args": ["markitdown-mcp@0.0.1a4"] }
  }
}
```

El validador del target debe aplicar la regex a todos los IDs, tanto en el
plugin como en `.codex/config.toml` generado o documentado.

## Reparación local aplicada durante el diagnóstico

La reparación de campo hizo lo siguiente sin modificar el código fuente del
repositorio:

1. Instaló y habilitó `ospec-workflow@ospec-tools`.
2. Copió 21 agentes TOML a `~/.codex/agents/`.
3. Corrigió las rutas del manifiesto en la copia instalada y en el snapshot
   local del marketplace.
4. Sustituyó el shape plano de hooks por grupos `matcher` + `hooks`.
5. Añadió un adapter temporal para normalizar el wire contract.
6. Renombró los MCP a `context7` y `markitdown`.

Editar `~/.codex/plugins/cache/...` o `~/.codex/.tmp/marketplaces/...` solo es
válido como diagnóstico. Una actualización del marketplace o una reinstalación
puede sobrescribir esas modificaciones. La solución permanente debe vivir en
el generador, el payload `release`, el instalador y sus pruebas.

## Smoke test reproducible

Después de instalar, hay que abrir una tarea nueva: plugins, skills, agentes y
hooks se resuelven al arrancar la tarea y no se recargan dinámicamente dentro de
una conversación existente.

Para una prueba sin persistencia ni escrituras en el proyecto:

```powershell
codex exec `
  --ephemeral `
  --skip-git-repo-check `
  --dangerously-bypass-hook-trust `
  --sandbox read-only `
  -C <directorio-temporal> `
  --json `
  "Confirma sdd-propose, invoca sdd-orchestrator y confirma SessionStart."
```

`--dangerously-bypass-hook-trust` solo es admisible en este smoke test efímero
después de auditar el payload. El uso interactivo normal debe conservar la
revisión de confianza mediante `/hooks`.

Resultado observado:

```json
{
  "sddProposeVisible": true,
  "orchestratorResponse": "ORCHESTRATOR_LOADED",
  "ospecWorkflowSessionStartContextReceived": true
}
```

Una segunda ejecución mínima terminó con `OK` sin warnings del manifiesto,
hooks o MCP. El único warning restante fue la falta de shell snapshots para
PowerShell, ajeno al harness.

## Criterios de aceptación para `codex-target-phase-2`

- [ ] `plugin.json` contiene metadata mínima válida y paths `./`.
- [ ] El plugin aparece instalado y habilitado, no solo disponible.
- [ ] La instalación global sincroniza agentes en `~/.codex/agents/`.
- [ ] La instalación local sincroniza agentes en `<repo>/.codex/agents/`.
- [ ] `hooks.json` usa grupos anidados y comandos Windows explícitos.
- [ ] Los cinco eventos actuales pasan pruebas de contrato stdin/stdout Codex.
- [ ] `PreToolUse` no emite `ask` hasta que el host lo soporte.
- [ ] `SubagentStop` consume `agent_transcript_path`.
- [ ] Los IDs MCP cumplen `^[a-zA-Z0-9_-]+$`.
- [ ] El validador inspecciona el artefacto final publicado, no solo la fuente.
- [ ] Un smoke test con una tarea nueva ve skill, agente y `SessionStart`.
- [ ] La documentación explica `/hooks`, reinicio/nueva tarea y actualización.
- [ ] Reinstalar o actualizar el marketplace conserva el comportamiento sin
      parches manuales en la caché del usuario.

## Incidencia adicional del repositorio de desarrollo

Durante el diagnóstico se observó un `.codex/config.toml` de proyecto con el ID
`microsoft/markitdown`. Ese archivo no se modificó para respetar el alcance de la
reparación local, pero también incumple la regex de IDs MCP y debe evaluarse
dentro de `codex-target-phase-2` junto con la política definitiva de config de
proyecto.
