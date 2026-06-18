# Design: Ingesta de Documentos y Síntesis de Foundation Federado (C3)

## Technical Architecture

El módulo `sdd-foundation` opera bajo el control del orquestador. Cuando detecta el modo federado, lee el atlas y delega de manera estructurada los parámetros para mapear especificaciones e interacciones locales.

### 1. Flujo de Datos para Ingesta y Matriz de Contratos

```mermaid
sequenceDiagram
    participant O as sdd-orchestrator
    participant F as sdd-foundation
    participant M as MarkItDown MCP
    participant S as Sibling Repos (Member Specs)
    participant B as docs/architecture/technical-baseline.md

    O->>F: Delegate with workspace_yaml & parent_change
    alt MarkItDown Available
        F->>M: Convert raw files to processed markdown
    else MarkItDown Unavailable
        F->>O: Blocked with question_gate (3 options)
        O->>F: Resume with user preference
    end
    F->>S: Scan member specifications ({member}/openspec/specs/**/spec.md)
    F->>F: Synthesize provides/consumers dependencies
    F->>B: Write "Mapa de Contratos e Interacciones" section
```

### 2. Flujo de Remediación de MarkItDown

Cuando `mcp__microsoft_markitdown__convert_to_markdown` no está registrado, se dispara una pregunta interactiva con las siguientes opciones:
- **Configurar MarkItDown automáticamente**: El agente intenta instalar/configurar localmente el servidor MCP.
- **Configurar manualmente con guía**: El agente provee las instrucciones paso a paso para que el usuario registre `markitdown-mcp` en `.mcp.json`.
- **Saltar ingesta de documentos**: Se omite el paso y se continúa al descubrimiento guiado manual de preguntas.
