# Spec: federated-general-baseline

## Overview

Este dominio cubre el análisis cruzado de dependencias y la consolidación de configuraciones comunes (general baseline) entre repositorios miembro de un espacio de trabajo federado. El objetivo es identificar qué tecnologías, herramientas y versiones comparten los distintos módulos, y alertar sobre desviaciones de versiones que introduzcan riesgos de compatibilidad.

---

## 1. Requirements

### Requirement: Extraction of Member Dependencies

La operación de baseline general debe leer los manifiestos de proyecto (ej. `package.json`, `go.mod`) de todos los miembros declarados en el atlas y mapeados localmente. Debe extraer un mapa de nombres de dependencias y sus respectivas versiones.

#### Scenario: package.json dependencies extracted
- GIVEN a member repository containing a `package.json` with dependencies and devDependencies
- WHEN the extractor scans the member
- THEN both dependency types are collected with their name and version string

#### Scenario: go.mod dependencies extracted
- GIVEN a member repository containing a `go.mod` file
- WHEN the extractor scans the member
- THEN go module dependencies are parsed and collected with name and version

---

### Requirement: Cross-Repo Alignment Analysis

El analizador debe agrupar las dependencias comunes por nombre y clasificar el estado de alineación:
- **Aligned**: La dependencia se utiliza con la misma versión en todos los miembros donde está declarada.
- **Misaligned (Deviation)**: Existen discrepancias en las versiones declaradas de la dependencia entre distintos miembros. El analizador debe emitir una advertencia detallando los miembros y las versiones encontradas.

#### Scenario: Aligned dependency
- GIVEN two members using `"react": "^18.2.0"`
- WHEN the alignment analysis runs
- THEN `"react"` is classified as Aligned with version `"^18.2.0"`

#### Scenario: Misaligned dependency detected
- GIVEN member A uses `"lodash": "^4.17.21"` and member B uses `"lodash": "^4.17.15"`
- WHEN the alignment analysis runs
- THEN `"lodash"` is classified as Misaligned (Deviation)
- AND the report lists both members and their respective versions

---

### Requirement: Shared Baseline Synthesizer

El sintetizador debe generar o actualizar el artefacto `docs/architecture/shared-baseline.md` en el coordinador. Este documento debe contener una estructura estandarizada que incluya:
- Una tabla de dependencias alineadas.
- Una sección de desviaciones de versión (Misaligned) detallando las diferencias y los miembros afectados.
- Un resumen de herramientas y configuraciones compartidas.

#### Scenario: Synthesis of shared-baseline.md
- GIVEN the alignment analysis has run successfully
- WHEN the synthesizer runs
- THEN it creates `docs/architecture/shared-baseline.md`
- AND the document lists aligned and misaligned dependencies in markdown tables
