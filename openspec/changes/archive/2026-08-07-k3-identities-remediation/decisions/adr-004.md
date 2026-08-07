# ADR-004: Discriminación Cerrada y Regla Positiva para Attestations y Authorizations

- Status: proposed
- Change: k3-identities-remediation
- Date: 2026-08-07

## Context
`validateIdentityKind` utilizaba verificaciones de guardas permisivas de lista negra (blacklist), permitiendo potencialmente que objetos `CandidateEvaluationAttestation` y `DeliveryAuthorization` apunten a fuentes mutables (como nombres de rama Git `main` o rutas locales en lugar de un `CandidateId` congelado).

## Decision
Modificar `validateIdentityKind` para imponer una discriminación cerrada de `kind` y una regla positiva estricta (whitelist): las atestaciones y autorizaciones de entrega DEBEN requerir que el target especificado sea un `CandidateId` sintácticamente válido que cumpla la expresión regular `^sha256:[a-f0-9]{64}$`. Cualquier referencia a ramas Git o rutas del sistema de archivos falla fail-closed.

## Alternatives
- Mantener validación por lista negra excluyendo nombres de rama conocidos (rechazado: insuficiente contra rutas o ramas personalizadas).
- Permitir referencias mutables en entornos de desarrollo (rechazado: compromete la trazabilidad y la seguridad en todo el ciclo).

## Consequences
- Previene la emisión de autorizaciones sobre repositorios o árboles de trabajo no integrados o mutables.
- Exige que todo proceso de entrega esté precedido obligatoriamente por una llamada exitosa a `freezeCandidate()`.
