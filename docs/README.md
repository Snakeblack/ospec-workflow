# Documentacion de ospec-workflow

Esta carpeta explica la metodologia SDD de este plugin para VS Code/Copilot. El README principal debe seguir siendo corto; aqui vive el detalle que necesitas para entender y mantener el sistema.

## Lectura recomendada

**Metodología SDD**

| Documento | Para que sirve |
| --- | --- |
| [sdd-metodologia.md](sdd-metodologia.md) | Modelo mental: problema, roles, principios y cuando usar SDD. |
| [sdd-fases.md](sdd-fases.md) | Explicacion fase por fase: entrada, salida, reglas y errores que evita. |
| [sdd-workflows.md](sdd-workflows.md) | Lineas de trabajo reales: estandar, lite, fast-forward, foundation, baseline brownfield, continuacion, workspace y onboarding. |
| [openspec.md](openspec.md) | Como se persisten artefactos, specs delta, specs principales y archivo. |
| [tdd-y-revision.md](tdd-y-revision.md) | Strict TDD, evidencia, verificacion y presupuesto de revision. |

**Runtime, modelos y empaquetado**

| Documento | Para que sirve |
| --- | --- |
| [harness-runtime.md](harness-runtime.md) | Capas del arnes, hooks y backend de artefactos (adapter). |
| [harness-go-js-parity.md](harness-go-js-parity.md) | Frontera Go/JS, contrato de paridad, brecha de federacion y caminos para cerrarla (parche vs migracion completa). |
| [model-routing.md](model-routing.md) | Tiers `agente→modelo` y formato de modelo por target (`models.yaml`). |
| [mcp-policy.md](mcp-policy.md) | Politica y configuracion de servidores MCP. |
| [plugin-installation.md](plugin-installation.md) | Instalacion, **generacion multi-target** (`vscode` / `claude` / `github-copilot`), confianza y diagnostico. |

El formato canonico es `vscode` y se carga directo desde el repositorio; el generador (`scripts/configure/cli.js`) produce arboles nativos para Claude Code y GitHub Copilot CLI en `dist/<target>/`. Ver `plugin-installation.md`.

## Idea central

SDD no existe para meter burocracia. Existe para no confundir velocidad con avance. Primero se fija el contrato de comportamiento, despues el diseno, despues las tareas, despues el codigo y al final la evidencia.

Cuando se usa bien, Copilot deja de ser "un chat que escribe codigo" y pasa a ser un equipo de agentes con responsabilidades claras.
