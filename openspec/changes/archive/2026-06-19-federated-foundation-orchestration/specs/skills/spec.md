# Delta for skills — federated-foundation-orchestration

## ADDED Requirements

### Requirement: Federated Foundation Parameter Passing

Cuando opera en un espacio de trabajo federado (multirepo), la fase `sdd-foundation` acepta y utiliza los siguientes parámetros inyectados por el orquestador:
- `workspace_yaml`: Ruta física del atlas cache (`openspec/workspace.yaml`) en el coordinador.
- `parent_change`: Nombre del cambio activo en el coordinador.

#### Scenario: Parameters parsed in federated mode
- GIVEN `sdd-foundation` is launched in a federated workspace context
- WHEN the agent evaluates its parameters
- THEN it reads the path to `workspace.yaml` and maps member locations

---

### Requirement: MarkItDown Interactive Fallback Gate

Antes de iniciar las preguntas de descubrimiento, el agente ofrece la posibilidad de ingerir documentos. Si el servidor MCP MarkItDown no está disponible en el cliente actual, se detiene el flujo de ingesta y se presenta un gate interactivo al usuario mediante `vscode/askQuestions` con tres opciones de remediación:
1. **Configurar MarkItDown automáticamente**: Intentar la instalación/configuración del servidor MCP localmente.
2. **Configurar manualmente con guía**: Suspender la ingesta y proveer instrucciones paso a paso para configurar el servidor.
3. **Saltar ingesta de documentos**: Omitir la ingesta y continuar al descubrimiento manual.

#### Scenario: Interactive fallback gate triggered on missing MCP
- GIVEN `mcp__microsoft_markitdown__convert_to_markdown` is not available
- WHEN the document ingestion step is executed
- THEN the agent triggers `vscode/askQuestions` with the three setup choices
- AND waits for user input instead of falling back silently

---

### Requirement: Mapa de Contratos e Interacciones Synthesis

En modo federado, la documentación técnica del coordinador (`docs/architecture/technical-baseline.md`) debe incluir obligatoriamente la sección **"Mapa de Contratos e Interacciones"** detallando de forma estructurada qué contratos `provides` y `consumers` están definidos entre los módulos del atlas.

#### Scenario: Synthesis includes Contracts Matrix
- GIVEN the foundation documents are synthesized in federated mode
- WHEN the technical baseline is created or updated
- THEN the section "Mapa de Contratos e Interacciones" is added containing provides/consumers definitions
