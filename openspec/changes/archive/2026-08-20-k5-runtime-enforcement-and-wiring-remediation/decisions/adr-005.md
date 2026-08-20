# ADR-005: Hardening de Invariantes K5 con Composicion Runtime y CAS Real

- Status: proposed
- Change: k5-runtime-enforcement-and-wiring-remediation
- Date: 2026-08-20

## Context

Los 7 checkers de invariantes K5 en `scripts/lib/lifecycle-model.js` evaluaban funciones puras aisladas sobre objetos estáticos en memoria, sin validar la composición completa del runtime (`createKernelRuntime`, `runKernelOperation`, Authority Store CAS y ledger de permisos).

## Decision

Reescribir los 7 checkers de invariantes K5 en `lifecycle-model.js` para ejecutar el runtime real con Store CAS en memoria, emulando carreras CAS reales, deducciones monotónicas multivariante y verificación estricta de avance de `blockingFingerprint`.

## Alternatives

- Mantener comprobaciones unitarias síncronas: rechazada porque no garantizan la consistencia E2E del sistema integrado.
- Confiar únicamente en suites de integración externas fuera del modelo formal: rechazada porque los invariantes del modelo deben ser formalmente ejecutables y verificables en `lifecycle-model.js`.

## Consequences

- Facilita: Verificación matemática y ejecutable de todas las garantías K5 bajo composición viva del kernel.
- Dificulta: La ejecución de los checkers del modelo requiere soporte asíncrono con configuración de runtime y almacén CAS.
- Reversibilidad: Alta — checkers autónomos desacoplados en el arnés de modelo.
