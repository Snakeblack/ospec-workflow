---
title: Session handoff — pre-K3 correctives
status: k2a-1-closed-k3-unblocked
last_updated: 2026-08-05
next_change: k3-runtime
k3_runtime: unblocked
---

# Handoff: continuar antes de K3

Usar este archivo al abrir una sesión nueva. No depender del chat anterior.

## Estado cerrado

| Item | Valor |
|------|--------|
| Change cerrado (K2.1b) | `k2-1b-permit-issuance-atomic-consume` |
| Archive K2.1b | `openspec/changes/archive/2026-08-05-k2-1b-permit-issuance-atomic-consume/` |
| Release K2.1b | **v2.40.1** — https://github.com/Snakeblack/ospec-workflow/releases/tag/v2.40.1 |
| Change cerrado (k2a-1) | `k2a-1-live-capability-probes-async-transports` |
| Archive k2a-1 (plan emitido) | `openspec/changes/archive/2026-08-05-k2a-1-live-capability-probes-async-transports/` (pendiente transacción runtime) |
| Release k2a-1 | pendiente post-archive |
| Rama tip | `feat/k2a-1-live-capability-probes-async-transports` (apply sin merge a main) |

### Qué entregó K2.1b (CRITICAL 1–2)

- `runKernelOperation`: `mintPermit` default `false`; auto-mint rechazado.
- Issuer controlado: `issueOperationPermit` (TransitionOffer + PolicyDecision|HumanDecision|KernelRule + `expected_revision`).
- Authority bag co-commiteado en CAS: consume + `OperationReceipt` con state/journal.
- Exact replay / restart desde bag; `mintOperationPermit` fuera de API pública del kernel.
- Roadmap WARNING5: quick-path ya no dice bare `Ejecutar K2a → K3`.
- 4R: 3 CRITICAL remediados (CAS convergente, atomicidad observable, rollback bag).

## Decisión de programa (actualizada)

```text
K2.1b (done) → k2a-1 (done, plan archive emitido) → K3 (NEXT)
```

- **K3 runtime desbloqueado** — ambos correctivos pre-K3 cerrados (K2.1b en v2.40.1; k2a-1 con verify PASS WITH WARNINGS + 4R approved).
- Ejecutar transacción archive runtime para k2a-1 antes de release; luego arrancar K3 runtime.
- No consumir capabilities K2a como `enforced` en producción hasta merge/release de k2a-1.

## Siguiente change

**Nombre:** `k3-runtime` (cuatro identidades + Candidate freeze + relación básica)  
**Clase:** `high-risk` (previsto)  
**Ruta:** `standard` (clarify + 4R)  
**Prerequisitos cerrados:** K2.1b + k2a-1

### Arranque sugerido (nueva sesión)

1. Completar archive transaccional: `node scripts/archive-transaction-run.js k2a-1-live-capability-probes-async-transports`
2. Release post-archive (patch/minor según usuario).
3. `/sdd-ff k3-runtime` o equivalente natural-language para K3.
4. Preguntar de nuevo: execution mode + delivery strategy (no reutilizar approvals de k2a-1).

## Scope de k2a-1 (CRITICAL 3–5 + WARNINGs relevantes)

### CRITICAL 3 — CapabilityProof ligado al adapter vivo

Hoy `verifyCapabilityProof` recalcula digest con versions del propio proof, no contra identidad viva del adapter.

**Debe:**

```text
verifyCapabilityProof({
  capabilityId,
  expectedAdapterId,
  expectedAdapterVersion,
  expectedHostRuntimeVersion,
  expectedProbeDigest,
  proof,
  evidence
})
```

Rechazar proof de otro adapter/versión, host version distinta, fixture/probe/evidence incompatibles.

### CRITICAL 4 — Claude no marque `enforced` sin probe vivo

Sin primitives reales, fallbacks declarativos → `unavailable | instructional | partial`, **nunca** `enforced`.

`enforced` solo tras probe vivo (worker spawn/cancel/fail, delivery hook observable, question transport real o instructional explícito).

### CRITICAL 5 — Transports async seguros

Ports → `Promise<TransportOutcome>` con `AbortSignal` / deadline / requestId.

```text
try { await port.invoke(...); normalize }
catch { ok:false, classifyTransportFailure }
```

Nunca envolver Promise rechazada con `ok: true`. Headless host y kernel boundary deben await + catch.

### WARNINGs a cerrar en el mismo change (o justificar defer)

| ID | Tema |
|----|------|
| W1 | Fault matrix debe fallar *a través* del adapter (no solo injectFault sintético) |
| W2 | Contrato transports infraespecificado → familia `transport-request/outcome/failure` v1 (no mutar v1 silenciosamente) |
| W3 | Deep freeze / wrappers inmutables de ports tras `createHostAdapter` |
| W4 | Test negativo: Minimal Kernel Harness solo (sin Headless peer) no satisface cobertura de fallos del host — ya en `known-issues.md` |

### Gates de aceptación k2a-1

```text
primitive ausente ≠ enforced
proof de otra versión rechazado
async rejection → structured failure
timeout/cancel mediante AbortSignal
fault matrix atraviesa adapter
Claude solo marca enforced lo demostrado
```

## Fuera de alcance de k2a-1

- K3 Candidate freeze / identidades / relation algebra runtime
- Reabrir CAS/permits de K2.1b (salvo regresión)
- Multi-process durable ledger

## Artefactos de referencia

- Análisis pre-K3 (origen humano): ver transcript / mensaje “REVISE BEFORE K3” en sesión 2026-08-05
- Roadmap: `docs/roadmaps/harness-evolution.md`
- Arquitectura: `docs/architecture/harness-evolution.md`
- Target capabilities: `docs/target-capabilities.md`
- Código K2a: `scripts/lib/` (host adapter, capability proof, headless conformance host)
- Known issues: `openspec/memory/known-issues.md` (W4 harness-alone)

## Prompt mínimo para la siguiente sesión

> Continúa el correctivo pre-K3. Lee `openspec/memory/handoff-pre-k3-correctives.md` y arranca SDD `k2a-1-live-capability-probes-async-transports` (high-risk, standard). K2.1b ya está en v2.40.1. No implementar K3 runtime.
