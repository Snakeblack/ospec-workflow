# Proposal: Ingesta de Documentos y Síntesis de Foundation Federado (C3)

## Intent

C3 entrega soporte para la fase de **Foundation general** en un espacio de trabajo federado (multirepo). Permite al orquestador integrar el contexto técnico y funcional global escaneando las especificaciones locales de los repositorios miembro declarados en el atlas `workspace.yaml`, y resolviendo sus contratos de suministro/consumo. Adicionalmente, introduce un bucle interactivo de remediación cuando el servidor MCP **MarkItDown** no está disponible para procesar documentos de especificaciones en bruto.

## Scope

### In Scope
- **Parámetros Federados**: Inyección de `workspace_yaml` y `parent_change` desde `sdd-orchestrator` hacia `sdd-foundation`.
- **Escaneo de Especificaciones de Miembros**: Escaneo de los ficheros `{member}/openspec/specs/**/spec.md` locales definidos a través de rutas relativas de sibling directories.
- **Matriz de Contratos**: Autogeneración de la sección "Mapa de Contratos e Interacciones" en la documentación base del coordinador (`docs/architecture/technical-baseline.md`).
- **Bucle interactivo de MarkItDown**: Remediación interactiva ante fallos o ausencia del MCP (opciones de configuración automática por el agente, guía manual o saltar ingesta).

### Out of Scope
- Autoría directa de especificaciones internas de miembros desde el coordinador.
- Conversión automatizada de formatos que no sean texto/markdown cuando MarkItDown está desactivado.

## Approach
Aprovechando que los repositorios miembro se clonan como directorios hermanos, el orquestador delega a `sdd-foundation` indicando la ubicación del atlas. El agente de foundation lee la configuración agregada y los markers locales para derivar dependencias, sintetizando un gráfico estructurado de contratos de interfaces. El bucle interactivo de MarkItDown se integra usando la API de preguntas `vscode/askQuestions`.

## Affected Areas
- `skills/sdd-foundation/SKILL.md` (Modificado)
- `agents/sdd-foundation.agent.md` (Modificado)
- `agents/sdd-orchestrator.agent.md` (Modificado)
- `scripts/sdd-foundation-federated.test.js` (Nuevo)
