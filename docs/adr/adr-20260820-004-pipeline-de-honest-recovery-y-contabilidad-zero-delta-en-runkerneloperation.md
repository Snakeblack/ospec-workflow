# ADR-003: Pipeline de Honest Recovery y Contabilidad Zero-Delta en runKernelOperation

- Status: proposed
- Change: k5-runtime-enforcement-and-wiring-remediation
- Date: 2026-08-20

## Context

Los intentos de recuperación no productivos (sin avance semántico ni cambio en `blockingFingerprint`) o mutaciones sin modificaciones efectivas (zero-delta) podían ejecutarse sin penalización presupuestaria o entrar en ciclos infinitos dentro del runtime autoritativo.

## Decision

Cablear `validateRecoveryHonesty()` y `isZeroDeltaMutation()` directamente en el flujo de `runKernelOperation()` en `scripts/lib/lifecycle-kernel/index.js`, deduciendo intentos y turnos monotónicamente antes del commit CAS y forzando transiciones terminales (`escalate` o `stop`) si el recovery no avanza el `blockingFingerprint`.

## Alternatives

- Deducir intentos únicamente ante errores fatales o mutaciones exitosas: rechazada porque los bucles no-op nunca se agotarían.
- Confiar exclusivamente en timeouts externos de reloj: rechazada por ser no determinista y no proteger cuotas discretas de invocación.

## Consequences

- Facilita: Garantías formales de terminación de bucles y deducción monotónica no recuperable en CAS.
- Dificulta: Los ejecutores de efectos deben suministrar métricas precisas de archivos modificados, líneas cambiadas y hashes.
- Reversibilidad: Alta — lógica encapsulada en el ciclo de ejecución y commit del kernel.
