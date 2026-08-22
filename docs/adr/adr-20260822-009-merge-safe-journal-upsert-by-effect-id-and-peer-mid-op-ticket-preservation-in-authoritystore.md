# ADR-003: Merge-Safe Journal Upsert by effect_id and Peer Mid-Op Ticket Preservation in AuthorityStore

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
En `commitJournal`, las implementaciones previas reemplazaban el array del journal por completo, arriesgando pérdida de registros ante commits concurrentes. Además, en `AuthorityStore.compareAndSwapLocked`, al confirmarse una transición que modificaba el estado (`!stateUnchanged`), se ejecutaba `entry.midOpTickets.clear()`, invalidando destructivamente los tickets emitidos a otros writers concurrentes en vuelo.

## Decision
Implementar merge-safe upsert por `effect_id` en `commitJournal` y en el commit atómico de CAS a través de `AuthorityStore`, `MemoryStore` y `FileSystemStore`. En `AuthorityStore.compareAndSwapLocked`, eliminar exclusivamente el ticket del writer ganador (`entry.midOpTickets.delete(midOpTicket)`), preservando intactos los tickets de los peers concurrentes para que puedan reconciliarse en reintentos posteriores.

## Alternatives
- Reemplazo ciego del journal: Rechazado porque genera regresiones y pérdida de eventos intermedios en escenarios multi-writer.
- Ejecutar `midOpTickets.clear()` tras cualquier avance de estado: Rechazado porque destruye los tickets de los perdedores CAS y causa fallos espurios en sus siguientes intentos.

## Consequences
- Aislamiento total en protocolos de commit en dos fases concurrentes.
- Reconciliación segura de perdedores CAS sin corrupción de estado ni fallos espurios de tickets.
- Reversibilidad: Alta (encapsulado en la capa de storage).

## Reconciliación K5 (2026-08-22)
El merge compartido es absorbente para `completed`: una actualización stale con `planned`, `started`, `failed` o `unknown` no puede sustituir ni su estado ni su evidencia de resultado. Esta regla se aplica de forma idéntica en AuthorityStore, MemoryStore y FileSystemStore.
