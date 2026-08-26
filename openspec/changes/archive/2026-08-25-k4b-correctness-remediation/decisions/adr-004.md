# ADR-004: Registro de ejecución sobre filesystem-store

- Status: accepted
- Change: k4b-correctness-remediation
- Date: 2026-08-25

## Context
El cierre K4b necesita un registro consultable que vincule CandidateId, ExecutionGraph y PolicySnapshot, con escritura atómica y comportamiento idempotente. El repositorio ya dispone de `filesystem-store`.

## Decision
Crear un adaptador K4b delgado que almacene registros `repair-shadow-execution/v1` bajo `state.repair_shadow_executions[candidate_id]`, usando load/commit CAS del store existente. Recomputar y cruzar todos los bindings antes de persistir.

## Alternatives
- JSON ad hoc: rechazado por duplicar locks, atomicidad y recuperación.
- Nuevo kernel de auditoría: rechazado por estar fuera de alcance.
- Solo devolver el registro en memoria: rechazado porque no permite replay tras reinicio.

## Consequences
La persistencia hereda CAS, lock y recuperación del store existente, sin introducir dependencias Repair en K6a. El adaptador debe preservar el resto del estado y rechazar contenido divergente para un CandidateId ya registrado.
