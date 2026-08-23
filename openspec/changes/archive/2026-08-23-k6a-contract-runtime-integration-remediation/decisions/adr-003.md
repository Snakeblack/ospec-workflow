# ADR-003: Integración Asíncrona con WorkerTransport y resolveCapabilityState con Fallback Seguro

- Status: proposed
- Change: k6a-contract-runtime-integration-remediation
- Date: 2026-08-23

## Context
La ejecución de workers en K6a utilizaba `spawnSync` sin interactuar con el puerto `WorkerTransport` de `host-contract` (K2a), careciendo de soporte para `AbortSignal` y validación de `CapabilityProof`.

## Decision
Conectar `executeWorkOrder` con `WorkerTransport` mediante `invokeTransportAsync`, evaluar la prueba de aislamiento con `resolveCapabilityState` y ejecutar fallback explícito a `partial`/`unavailable` sin promoción silenciosa a `enforced`.

## Alternatives
- Promover silenciosamente capabilities no probadas a `enforced`: Rechazado porque vulnera los principios de observabilidad y auditoría de seguridad del runtime.
- Mantener ejecución síncrona: Rechazado porque bloquea el event loop e impide la cancelación limpia por timeout/abort.

## Consequences
Habilita cancelación asíncrona real y presupuestos K5 con preservación de telemetría de recuperación; requiere manejo de promesas y cleanup de listeners. Reversibilidad media.
