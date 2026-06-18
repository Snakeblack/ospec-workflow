# Delta for agents — federated-foundation-orchestration

## ADDED Requirements

### Requirement: sdd-orchestrator Federated Foundation Delegation

Cuando el backend de almacenamiento es `workspace-federated` y se inicia la fase de foundation, el orquestador delegará en `sdd-foundation` pasando `workspace_yaml` apuntando a `workspace.yaml` y `parent_change` conteniendo el nombre del cambio activo.

#### Scenario: Delegating with workspace_yaml
- GIVEN the workspace-federated backend is active and the foundation phase is triggered
- WHEN the orchestrator delegates to `sdd-foundation`
- THEN it passes `workspace_yaml` pointing to the physical atlas cache and `parent_change` containing the active change name

---

### Requirement: sdd-foundation Federated Scans

El agente `sdd-foundation` en modo federado aceptará y procesará `workspace_yaml` y `parent_change` para escanear las especificaciones miembro locales (`{member}/openspec/specs/**/spec.md`) e integrarlas en la síntesis del baseline técnico del coordinador.

#### Scenario: Scanning member specs
- GIVEN the foundation agent runs in federated mode with `workspace_yaml`
- WHEN the execution steps run
- THEN the agent scans `{member}/openspec/specs/**/spec.md` locales
- AND synthesizes provides/consumers dependencies into `Mapa de Contratos e Interacciones`

---

### Requirement: sdd-foundation Interactive Fallback Loop

El agente `sdd-foundation` iniciará un bucle interactivo de remediación si el servidor MCP de MarkItDown no está configurado, deteniendo la ingesta y preguntando al usuario vía `vscode/askQuestions` antes de continuar con el descubrimiento manual.

#### Scenario: Interactive fallback loop executed
- GIVEN the MarkItDown MCP server is not available during document ingestion
- WHEN the agent executes the fallback check
- THEN it presents the interactive gate via `vscode/askQuestions`
- AND acts according to the selected option (automatic setup, manual guided configuration, or skip)
