# ADR-001: Ventana de escaneo acotada para transcripciones Claude (tail-read 256 KiB)

- Status: proposed
- Change: claude-cx0-telemetry-adapter
- Date: 2026-09-03

## Context

REQ-hooks-018 fija como SHOULD limitar el escaneo a entradas recientes de la transcripción, pero el hook corre bajo `timeout: 5` declarado en `hooks/hooks.json` y las transcripciones Claude pueden alcanzar decenas de MB. La decisión del diseño es obligatoria (convierte SHOULD en regla exacta) y establece el patrón de adquisición de datos que `sdd-verify` auditará.

## Decision

Leer solo los últimos 256 KiB (`TAIL_WINDOW_BYTES = 262_144`) con una única lectura posicionada (stat + read), descartar la primera línea parcial del bloque, y escanear en reversa deteniéndose en la primera entrada de uso válida (última entrada gana, como `parseCodexTokenCountTranscript`). Sin fallback a lectura completa: ventana sin uso válido → `unavailable`.

## Alternatives

- `fs.readFile` completo (como la ruta Codex): I/O no acotado; pierde por presupuesto.
- Streaming reverso por chunks con reensamblado: misma semántica con más complejidad; pierde por mantenibilidad.
- Sumar usos de toda la transcripción: métricas dependientes del tamaño de archivo/ventana; pierde por determinismo.

## Consequences

Presupuesto de I/O predecible y muy por debajo del timeout de 5 s; uso irrelevante de una ventana sin uso válido se degrada fail-safe (aceptado: transcripts truncados >256 KiB sin uso en cola son inexistentes en la práctica append-only). Reversible con bajo coste (constante + estrategia en un solo módulo `claude-usage.js`).
