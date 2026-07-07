# ADR-002: Formato y ubicación del manifiesto `runtime_capabilities:`

- Status: accepted
- Change: unified-contract-lint
- Date: 2026-07-07
- Promoted to docs/adr on 2026-07-07

## Context

El spec fijó el nombre del campo (`runtime_capabilities:`) pero no el mecanismo de parseo ni
la ubicación. Hay que elegir entre frontmatter del SKILL.md o archivo aparte, y entre block
map anidado o flow map inline. `frontmatter.js` no hace deep-parse de block maps: guarda las
líneas hijas en `rawLines`.

## Decision

Bloque YAML anidado (block map) en el frontmatter existente del SKILL.md:

```yaml
runtime_capabilities:
  execute: true
  mcp: false
  write: true
```

El checker I1 parsea las `rawLines` del campo con un lector mínimo
(`^\s+(execute|mcp|write):\s*(true|false)`). Ausencia del bloque = las tres capacidades `false`.

## Alternatives

- Archivo `.capabilities.yaml` junto al SKILL.md: duplica la unidad skill y complica el
  fingerprint del registry.
- Flow map inline `runtime_capabilities: { execute: true, ... }`: menos legible; igual requiere
  parser propio porque `frontmatter.js` solo parsea arrays `[...]`, no mapas `{...}`.

## Consequences

Fuente de verdad única junto al resto del frontmatter; formato de archivo público (los 14
phase skills lo declaran). Deep-parse manual en el checker. Reversible retirando el bloque con
el spec delta.
