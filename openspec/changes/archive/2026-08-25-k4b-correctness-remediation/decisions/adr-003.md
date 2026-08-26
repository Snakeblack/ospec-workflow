# ADR-003: Integración incremental y freeze final único

- Status: accepted
- Change: k4b-correctness-remediation
- Date: 2026-08-25

## Context
Integrar todos los WorkResults al final impide que un dependiente ejecute el resultado material de su predecesor. Congelar por nodo, en cambio, confundiría bases intermedias con Candidates promovibles.

## Decision
Integrar y validar cada WorkResult inmediatamente contra la base efectiva de su nodo, conservando árbol, modos y diff canónico para dependientes. Invocar `freezeCandidate()` una sola vez al completar el grafo, con el árbol final y `base_tree` del SourceSnapshot original.

## Alternatives
- Integración diferida: rechazada porque no propaga material.
- Candidate por nodo: rechazado porque expone identidades intermedias sin autoridad de promoción.
- Aplicación tolerante de hunks: rechazada porque oculta divergencias de contexto.

## Consequences
Los errores de contexto, eliminación, modo, containment o conflicto aparecen antes de ejecutar dependientes. El integrador necesita una API incremental, pero K3 conserva la responsabilidad exclusiva de CandidateId.
