# Proposal: Detección de Base Compartida Cross-Repo (C4)

## Intent

C4 introduce la capacidad para analizar y detectar de manera cruzada los componentes comunes, dependencias y configuraciones que comparten los repositorios miembro de un espacio de trabajo federado. Permite unificar el estándar técnico y reportar desviaciones de versiones o desalineaciones arquitectónicas en el repositorio coordinador.

## Scope

### In Scope
- **Análisis Cruzado de Dependencias**: Mapear y agrupar las dependencias comunes (nombre, versión, tipo de stack) de los manifiestos locales de todos los miembros del atlas.
- **Detección de Desviaciones**: Identificar y reportar discrepancias en las versiones de dependencias críticas o configuraciones de herramientas comunes entre miembros.
- **Síntesis del Baseline Técnico General**: Generar o actualizar `docs/architecture/shared-baseline.md` en el coordinador, detallando las bases compartidas de dependencias y herramientas.
- **Lógica de Comparación Extragente**: Aislar el análisis del grafo en un módulo testeable en `scripts/lib/workspace-general-baseline.js` cubierto por tests de integración.

### Out of Scope
- Actualización automática o alineación automática de las dependencias en los repositorios miembro (solo lectura y reporte).
- Soporte para gestores de paquetes no estándar (se soporta npm/pnpm para JS/TS y go modules para Go).

## Capabilities

### New Capabilities
- `federated-general-baseline`: análisis de dependencias cruzadas de miembros, reporte de desviaciones de versión, y síntesis del estándar de baseline unificado.

## Approach
El orquestador delega a `sdd-workspace` con la operación `general-baseline` para activar el escaneo. Este lee el archivo `openspec/workspace.yaml` y recorre recursivamente los archivos de manifiesto de cada miembro inicializado. Un extractor puro en `scripts/lib/workspace-general-baseline.js` realiza el análisis estático, computa las dependencias comunes y las discrepancias, y produce el informe final que se escribe en `docs/architecture/shared-baseline.md`.

## Affected Areas
- `scripts/lib/workspace-general-baseline.js` (Nuevo)
- `agents/sdd-workspace.agent.md` (Modificado)
- `skills/sdd-workspace/SKILL.md` (Modificado)
- `scripts/federated-general-baseline.test.js` (Nuevo)
