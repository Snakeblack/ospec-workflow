# ADR-001: Desacoplamiento de capsule_inputs de Dependencias DAG y Materialización Canónica

- Status: proposed
- Change: k6a-contract-runtime-integration-remediation
- Date: 2026-08-23

## Context
`WorkOrder v2` define `dependencies` como IDs de nodos DAG (`sha256:...`) y `SourceSnapshot v1` no posee un mapa sintético `.files`. La implementación previa de K6a asumía erróneamente rutas de archivos en `dependencies`, bloqueando la composición con K4a.

## Decision
Desacoplar las dependencias de orquestación DAG de los inputs de filesystem declarando `capsule_inputs: string[]` en el descriptor de la cápsula y proyectando los archivos desde el árbol canónico de `SourceSnapshot v1`.

## Alternatives
- Reinterpretar `WorkOrder.dependencies` como rutas de archivos: Rechazado porque contamina el grafo K4a con strings arbitrarios de filesystem en lugar de hashes inmutables de nodos.

## Consequences
Permite la composición pura entre el compilador K4a y el runtime K6a con materialización fail-closed; requiere que los callers especifiquen `capsule_inputs` explícitamente. Reversibilidad media.
