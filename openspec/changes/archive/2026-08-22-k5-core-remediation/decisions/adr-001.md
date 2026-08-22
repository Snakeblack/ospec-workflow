# ADR-001: Multi-Writer Ticket Isolation and Concurrent Mid-Op Journal Management in AuthorityStore

- Status: proposed
- Change: k5-core-remediation
- Date: 2026-08-22

## Context
El AuthorityStore gestiona commits en dos fases (`commitJournal` pre-efecto y `compareAndSwap` final). Previamente, la referencia de ticket mid-op se almacenaba como una variable escalar única (`entry.midOpTicket`) por sujeto. Si dos writers concurrentes ejecutaban `commitJournal` en paralelo sobre la revisión baseline `R0`, el segundo writer sobreescribía destructivamente el ticket del primero, causando que el primer writer fallara en CAS de forma espuria.

## Decision
Sustituir la propiedad escalar por una colección `Map<string, { token: string, fromRevision: string, stateDigest: string }>` (`entry.midOpTickets`). Cada invocación de `commitJournal(nextJournal, subjectId, fromRevision)` genera un ticket único y lo registra en el mapa. En `compareAndSwap`, se valida y elimina únicamente el ticket provisto, preservando los demás tickets concurrentes mientras el digest del estado base permanezca idéntico.

## Alternatives
- Variable escalar única: Rechazada porque produce condiciones de carrera destructivas e invalidaciones espurias de tickets en ejecuciones multi-writer.
- Bloqueo pesimista exclusivo en todo el ciclo pre-efecto: Rechazado porque degrada el rendimiento concurrente y bloquea lecturas concurrentes legítimas.

## Consequences
- Aislamiento completo de múltiples writers en vuelo compitiendo sobre la misma revisión.
- Integración limpia con CAS optimista: el ganador consume su ticket y el perdedor recibe `cas-conflict` sin corrupción de estado.
- Reversibilidad: Alta (encapsulado en `AuthorityStore`).
