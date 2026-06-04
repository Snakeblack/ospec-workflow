# ospec-workflow

Bundle de Agent Plugin para VS Code que aplica SDD con OpenSpec, Strict TDD y revisiones pequeñas. Basado en la herramienta [Gentle-ai de Gentleman-Programming](https://github.com/Gentleman-Programming/gentle-ai). El punto de entrada de usuario es `sdd-orchestrator`; los agentes de fase hacen el trabajo y persisten el estado en el repositorio.

## Que incluye

| Ruta | Proposito |
| --- | --- |
| `.plugin/` | Manifiesto del plugin (`ospec-workflow`, segun `.plugin/plugin.json`). |
| `agents/` | Orquestador y agentes de fase SDD. |
| `commands/` | Prompt files visibles para el usuario. |
| `rules/` | Instrucciones compartidas para SDD, OpenSpec y Strict TDD. |
| `skills/` | Skills reutilizables y contratos de fase. |
| `docs/` | Documentacion de metodologia, fases, workflows y OpenSpec. |
| `.mcp.json` | Configuracion de Context7 MCP. |
| `openspec/` | Memoria versionable del flujo SDD cuando se usa OpenSpec. |

## Comandos visibles

| Comando | Uso |
| --- | --- |
| `/sdd-new` | Iniciar un cambio SDD persistido. |
| `/sdd-lite` | Flujo reducido para cambios triviales o small. |
| `/sdd-continue` | Continuar desde el estado de OpenSpec. |
| `/sdd-apply` | Ejecutar una tanda de implementacion. |
| `/sdd-verify` | Verificar contra specs, diseno y tests. |
| `/sdd-archive` | Archivar el cambio una vez verificado. |

Los prompt files viven en `commands/*.prompt.md`. `/sdd-ff` es un atajo de planificacion gestionado por `sdd-orchestrator`, pero no tiene prompt file propio. `sdd-init` y `sdd-foundation` son fases internas de arranque y base, y `sdd-onboard` es el flujo guiado.

## Flujo SDD

```text
proposal -> specs --> tasks -> apply -> verify -> archive
             ^
             |
           design

lite: proposal-lite -> tasks -> apply -> verify
```

## Modos de ejecucion

El orquestador usa `vscode/askQuestions` para pausar y pedir decision del usuario en gates criticos:

- **Interactive** (default): despues de cada fase muestra un resumen y pregunta si continuar, detener o ajustar.
- **Automatic**: ejecuta todas las fases seguidas sin pausar; muestra el resultado final.

Los gates interactivos tambien se activan para decisiones de estrategia de entrega, carga de revision y bloqueos arquitectonicos.

## Documentacion principal

1. [docs/README.md](docs/README.md)
2. [docs/sdd-metodologia.md](docs/sdd-metodologia.md)
3. [docs/sdd-fases.md](docs/sdd-fases.md)
4. [docs/sdd-workflows.md](docs/sdd-workflows.md)
5. [docs/openspec.md](docs/openspec.md)
6. [docs/tdd-y-revision.md](docs/tdd-y-revision.md)
7. [docs/plugin-installation.md](docs/plugin-installation.md)

## Notas operativas

- El plugin se declara en `.plugin/plugin.json` como `ospec-workflow`.
- OpenSpec usa `openspec/config.yaml`, `openspec/specs/` y `openspec/changes/` como memoria versionable.
- Los detalles finos viven en `docs/`; este README solo orienta y enlaza.
