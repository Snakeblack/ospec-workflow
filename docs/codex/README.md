# Target Codex: punto de entrada para mantenimiento

Este directorio es la puerta de entrada estable para instalar, diagnosticar y
evolucionar el target Codex. `analisis-fino/roadmap-codex-target.md` conserva la
planificación y las oportunidades; aquí viven los hechos confirmados y el orden
de trabajo reproducible.

## Próxima sesión: leer en este orden

1. Este documento completo.
2. [Informe de campo del 2026-07-10](field-report-2026-07-10.md), especialmente
   **Diagnóstico por capas**, **Smoke test reproducible** y **Criterios de
   aceptación**.
3. [`openspec/changes/codex-target-phase-2/state.yaml`](../../openspec/changes/codex-target-phase-2/state.yaml)
   para reanudar el cambio sin recrearlo ni perder sus aprobaciones.
4. La sección **Bloque 6 — Codex fase 2** de
   [`analisis-fino/roadmap-codex-target.md`](../../analisis-fino/roadmap-codex-target.md).
5. [`docs/plugin-installation.md`](../plugin-installation.md), solo la sección
   **Codex CLI**, cuando se modifique el flujo de instalación.

No hace falta releer todos los cambios históricos antes de empezar. Consultar
estos antecedentes únicamente cuando el componente afectado lo requiera:

| Componente | Antecedente relevante |
| --- | --- |
| Perfil y generador Codex | [`2026-07-08-codex-target-profile`](../../openspec/changes/archive/2026-07-08-codex-target-profile/) |
| Bridge de hooks | [`2026-07-09-codex-hooks-bridge`](../../openspec/changes/archive/2026-07-09-codex-hooks-bridge/) |
| Instalador | [`2026-07-09-codex-installer`](../../openspec/changes/archive/2026-07-09-codex-installer/) |
| Política de `config.toml` | [`fix-codex-config-toml`](../../openspec/changes/fix-codex-config-toml/) |

## Estado confirmado en una máquina real

Validado el 2026-07-10 con Windows 11 y Codex CLI `0.144.1`:

- El marketplace puede estar registrado aunque el plugin siga sin instalar.
- Los paths de componentes en `.codex-plugin/plugin.json` deben empezar por
  `./`; de lo contrario Codex ignora skills y hooks durante el arranque.
- Los agentes personalizados no se activan desde el bundle del plugin. El
  instalador debe sincronizar los TOML a `~/.codex/agents/` o
  `<repo>/.codex/agents/`.
- Los hooks requieren el wrapper `matcher` + `hooks: [...]`, adaptación del wire
  contract y confianza explícita mediante `/hooks`.
- `PreToolUse.permissionDecision = "ask"` todavía no es una decisión soportada;
  debe degradarse a advisory sin alterar el flujo normal de permisos.
- `SubagentStop` entrega `agent_transcript_path`, no el antiguo
  `transcript_path`.
- Los IDs MCP globales deben cumplir `^[a-zA-Z0-9_-]+$`; `setup:codex`
  normaliza nombres heredados y usa `codex mcp add`. El bundle no publica
  `.mcp.json`, porque Codex no deduplica un servidor global y otro de plugin.
- Plugins, skills, agentes y hooks se resuelven al crear la tarea. La prueba
  definitiva debe hacerse en una tarea nueva.

La reparación local consiguió simultáneamente:

```json
{
  "sddProposeVisible": true,
  "orchestratorResponse": "ORCHESTRATOR_LOADED",
  "ospecWorkflowSessionStartContextReceived": true
}
```

Esto demuestra viabilidad, pero no sustituye la corrección del producto.

## Objetivo de `codex-target-phase-2`

Convertir la reparación de campo en una salida generada, instalable y validada
que funcione en una máquina limpia sin editar manualmente:

- `~/.codex/plugins/cache/...`
- `~/.codex/.tmp/marketplaces/...`
- `~/.codex/config.toml`
- el payload instalado después de la generación

La solución permanente debe cubrir conjuntamente:

1. Generador del manifiesto y metadata del plugin.
2. Transformación y runtime de hooks Codex.
3. Registro MCP global nativo, con IDs válidos y deduplicación por identidad.
4. Instalación separada e idempotente de agentes TOML.
5. Payload publicado en la rama o canal de release.
6. Validación del artefacto final y smoke test en una tarea nueva.
7. Documentación de instalación, actualización, confianza y rollback.

## Fuente de verdad y reglas de decisión

Usar esta precedencia cuando dos documentos parezcan discrepar:

1. Comportamiento observado con la versión de Codex soportada.
2. Documentación oficial vigente enlazada en el informe de campo.
3. Specs y decisiones aceptadas del cambio OpenSpec activo.
4. Este directorio `docs/codex/`.
5. Roadmaps y notas de `analisis-fino/`.
6. Artefactos generados bajo `dist/`, que pueden estar obsoletos.

No promover una hipótesis del roadmap a contrato sin una prueba del CLI real.
No considerar válida una instalación porque los archivos existan: verificar que
Codex los cargue en una tarea nueva.

## Protocolo de verificación mínimo

La implementación final debe demostrar, en este orden:

```powershell
codex plugin marketplace list --json
codex plugin list --available --json
codex plugin list --json
```

Después, ejecutar el smoke test efímero descrito en el informe de campo y
comprobar:

- plugin instalado y habilitado;
- ausencia de warnings `ignoring skills|hooks`;
- ausencia de errores `Invalid MCP server name`;
- `sdd-propose` visible;
- `sdd-orchestrator` invocable;
- `SessionStart` recibido;
- hooks revisables y confiables desde `/hooks`.

El warning de shell snapshots no soportados en PowerShell es ajeno al harness y
no debe confundirse con un fallo de instalación.

## Qué no repetir

- No diagnosticar `codex plugin list` dentro de un sandbox que remapee
  `CODEX_HOME`; puede mostrar falsamente que no existen marketplaces.
- No parchear la caché del usuario como solución entregable: una reinstalación
  la sobrescribe.
- No asumir que el marketplace instala los agentes TOML.
- No validar únicamente los templates fuente; validar el payload publicado.
- No probar en la conversación que existía antes de instalar o actualizar el
  plugin.
- No tocar config global del usuario si el instalador promete preservarla.

## Resultado esperado de la siguiente sesión

Reanudar `codex-target-phase-2` desde su `state.yaml`, convertir los criterios de
aceptación del informe en proposal/spec/design/tasks y aplicar las correcciones
mediante el orquestador SDD. La sesión debe dejar evidencia de una instalación
limpia, no otra reparación manual de la máquina de desarrollo.

## Instalación y actualización

`install-codex.js` publica el payload generado a través de **tres canales
separados e idempotentes** (REQ-install-001): plugin (marketplace local +
`/plugins`), MCP global (`codex mcp`) y agentes TOML
(`.codex/agents/*.toml`). El canal MCP consulta `codex mcp list --json`, compara
`command` + `args`, reutiliza identidades equivalentes aunque tengan otro
nombre y no sobrescribe colisiones de nombre. La instalación por repositorio
no ejecuta este canal y preserva `<repo>/.codex/config.toml` byte a byte.

### Instalación global (marketplace + agentes en `~/.codex`)

```powershell
npm run build:codex        # genera dist/codex/ (payload publicado)
npm run setup:codex        # === npm run install:codex
```

`setup:codex`/`install:codex` sin argumentos:

1. Construye y valida `dist/codex/` (usa `--no-validate` para saltar la
   validación durante una iteración local).
2. Empaqueta `dist/codex/` como marketplace local en
   `dist/codex-marketplace/`.
3. Si el binario `codex` está en el `PATH`, registra el marketplace con
   `codex plugin marketplace add "<ruta>"`. Si no está disponible, imprime el
   comando manual equivalente para ejecutarlo desde la CLI.
4. Consulta los MCP globales y registra solo Context7/MarkItDown ausentes con
   nombres compatibles (`context7`, `markitdown`).
5. Sincroniza los archivos `.codex/agents/*.toml` generados a
   `~/.codex/agents/` (canal de agentes, independiente del canal de plugin).

Después de registrar el marketplace, usar `/plugins` dentro de Codex para
instalar `ospec-workflow`. Re-ejecutar `npm run setup:codex` en cualquier
momento es seguro: los tres canales convergen al mismo estado final (mismos
archivos TOML, mismo catálogo y una sola instancia por identidad MCP). El CLI
de Codex persiste únicamente las entradas MCP que faltan en su configuración
global.

### Instalación local a un repositorio destino (solo canal de agentes)

```powershell
npm run install:codex -- ../mi-proyecto
```

Copia únicamente `.codex/agents/*.toml` a `<repo-destino>/.codex/agents/`; no
copia el bundle del plugin (`.codex-plugin/plugin.json`) dentro del repo
destino y preserva cualquier `.codex/config.toml` existente sin modificarlo.
Re-ejecutar el mismo comando es idempotente.

## Revisar y confiar en los hooks desde `/hooks`

Codex CLI cachea las entradas de hooks del plugin y requiere confirmación
explícita antes de ejecutarlas. Después de instalar o actualizar
`ospec-workflow`:

1. Abrir una tarea nueva de Codex (los hooks, agentes y skills se resuelven
   al crear la tarea, no en una conversación ya abierta).
2. Ejecutar `/hooks` para listar las entradas detectadas del plugin. Deben
   aparecer exactamente los cinco eventos publicados: `SessionStart`,
   `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop` (ADR-003; ningún sexto
   evento se emite).
3. Revisar el `command`/`commandWindows` de cada entrada — ambos apuntan al
   mismo `scripts/hooks/ospec-hooks-launch.js` dentro de `$PLUGIN_ROOT` /
   `%PLUGIN_ROOT%`, solo cambia la sintaxis de ruta según el sistema
   operativo.
4. Marcar las entradas como confiables (`trust`/`allow` en el flujo
   interactivo de `/hooks`). Sin esta confirmación explícita, Codex no
   ejecuta los hooks del plugin aunque el marketplace y el plugin estén
   instalados.
5. Repetir la revisión tras cada actualización del plugin si Codex invalida
   la confianza al detectar un cambio de contenido en los hooks.

## Flujo de tarea nueva: skill → orquestador → `SessionStart`

1. Al crear una tarea nueva, Codex dispara automáticamente el hook
   `SessionStart`, que responde con el contrato estándar
   (`status`, `ospecDetected`, `registry`) — igual que en cualquier otro
   target, sin ramas específicas de Codex (REQ-hooks-007).
2. El usuario invoca el agente TOML `sdd-orchestrator`
   (`.codex/agents/sdd-orchestrator.toml`, autodetectado por Codex sin
   configuración manual adicional una vez instalado — REQ-agents-010). Este
   agente es el punto de entrada equivalente al skill/agente orquestador en
   los demás targets.
3. El orquestador delega cada fase a los sub-agentes correspondientes
   (`sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-apply`, `sdd-verify`, …),
   igual que en el resto de targets; las instrucciones de delegación viajan
   embebidas en `developer_instructions` de cada TOML generado.
4. Durante la ejecución, `PreToolUse` degrada automáticamente cualquier
   decisión `ask` a `allow` + `systemMessage` cuando se detectan **ambas**
   señales del wrapper de Codex: `OSPEC_TARGET=codex` (selector de target) y
   `OSPEC_CODEX_WRAPPER=1` (marcador por invocación, inyectado en la propia
   línea de `command`/`commandWindows` generada por `codexHooks`; ver
   `command`/`commandWindows` en `/hooks`). Exigir ambas evita que un
   `OSPEC_TARGET=codex` residual en el entorno (export de shell olvidado,
   variable de CI, `.env` del repo) degrade decisiones `ask` fuera de una
   invocación real del wrapper de Codex (Codex CLI aún no soporta la decisión
   `ask`); las decisiones `deny` siguen bloqueando sin cambios.
5. `SubagentStop` acepta tanto `agent_transcript_path` (el campo que emite
   Codex) como `transcript_path` (el campo histórico de otros targets) para
   resolver el resultado de cada sub-agente.

Verificación rápida de que el flujo quedó bien instalado, sin abrir una tarea
real: `npm test` ejecuta `scripts/configure/codex-smoke.test.js`, que genera
el payload, lo instala en un directorio temporal y invoca el hook
`SessionStart` directamente sobre el árbol instalado (REQ-install-003). Es
una comprobación más estrecha que un ciclo E2E completo de apply/verify/4R;
la verificación con el binario `codex` real sigue siendo manual (ver
**Protocolo de verificación mínimo** arriba).

## Rollback

El instalador nunca modifica `.codex/config.toml`, así que revertir una
instalación de `ospec-workflow` no requiere restaurar configuración de
usuario:

1. Recuperar (o reconstruir con `git checkout <commit-anterior> -- .` seguido
   de `npm run build:codex`) la versión anterior válida del payload publicado.
2. Volver a ejecutar `npm run setup:codex` (instalación global) o
   `npm run install:codex -- <repo-destino>` (instalación local) apuntando al
   payload anterior. Ambos canales son idempotentes: la reinstalación
   sobrescribe `~/.codex/agents/*.toml` (o `<repo-destino>/.codex/agents/`) y
   `dist/codex-marketplace/` con el contenido anterior, sin dejar residuos de
   la versión más nueva.
3. Si el plugin más nuevo quedó instalado vía `/plugins`, usar `/plugins`
   dentro de Codex para desinstalarlo y volver a instalarlo desde el
   marketplace ya revertido en el paso 2.
4. `.codex/config.toml` no requiere ninguna acción: nunca fue escrito por el
   instalador en ninguna de las dos versiones.
