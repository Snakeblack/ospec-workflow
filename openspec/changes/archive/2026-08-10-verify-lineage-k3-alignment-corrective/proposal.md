# Change Proposal: `verify-lineage-k3-alignment-corrective`

## Summary

Alinear el flujo actual `apply → verify → remediation → targeted recheck` con las garantías ya entregadas por K3, eliminando identidades paralelas, drift no detectado y regresiones de recuperación, sin introducir ninguna autoridad, primitive o runtime perteneciente a K4a o posteriores.

El cambio mantiene `verify_lineage` como un mecanismo acotado del workflow actual. No lo convierte en un nuevo kernel ni en el futuro mecanismo de ejecución de OSPEC.

## Problem

La implementación actual de Bounded Verify Lineage ha mejorado sustancialmente la convergencia de `sdd-verify`, pero todavía mantiene varias fronteras débiles:

1. `verify-lineage.js` calcula una identidad `verify-candidate-v1` independiente del `Candidate/v2` canónico entregado por K3.
2. Una lineage activa puede continuar si el working candidate cambia entre Discovery, Remediation y Targeted Recheck.
3. `contract_digest` puede depender de representaciones suministradas al reducer en vez de quedar inequívocamente ligado a los bytes reales de los artefactos OpenSpec.
4. `allowed_paths` funciona principalmente como instrucción al agente y no como invariant comprobable sobre el delta producido.
5. Una finding puede recibir un comando de validación inventado por fallback (`npm test`) en ausencia de una validation recipe explícita.
6. La introducción del remediation fast path eliminó accidentalmente parte del flujo normal de recuperación de `apply-progress`.
7. `testing.tdd_mode` todavía convive con `strict_tdd` y señales como `scale`, dejando más de una autoridad runtime para decidir el modo TDD.

Estas deficiencias no justifican introducir WorkOrders, WorkResults, Execution Graph ni un nuevo runtime de verificación. Esas capacidades siguen perteneciendo a los slices posteriores definidos por el roadmap.

## Goal

Conseguir que el workflow actual sea determinista respecto a las primitivas ya entregadas:

```text
OpenSpec bytes ───────────────┐
                              ├─ current bounded workflow
Git / Candidate v2 ───────────┘
```

y no:

```text
OpenSpec/Git
   │
   ├─ K3 Candidate identity
   │
   └─ second verify identity/runtime
```

## Scope

### In scope

* Reutilizar `Candidate/v2.candidate_id` como única identidad de candidate dentro de `verify_lineage`.
* Detectar candidate drift en todos los estados activos de la lineage.
* Calcular `contract_digest` a partir de fingerprints de los bytes reales de los artefactos OpenSpec participantes.
* Rechazar remediation cuyo delta efectivo exceda `allowed_paths`.
* Exigir validation recipes explícitas para findings congeladas.
* Restaurar la recuperación normal mediante `apply-progress`.
* Convertir `testing.tdd_mode` en única autoridad TDD runtime.
* Añadir invariants y tests de restart/drift/scope suficientes para demostrar estas garantías.

### Explicitly out of scope

* Execution Graph.
* Obligation Manifest.
* WorkOrder.
* WorkResult.
* Worker execution runtime.
* Budgets o failure/recovery kernel de K5.
* Isolation/capsules de K6a.
* Repair shadow execution de K4b.
* Assurance Graph.
* Evaluation Attestation.
* Delivery Authorization.
* Nueva autoridad persistente.
* Nuevo lifecycle kernel.
* Reestructuración general de Authority Store.
* Optimización del adapter Codex/`AGENTS.md`; deberá ser un change de target independiente si se ejecuta.

## Roadmap Compatibility

Este change es un **corrective de coherencia K3**.

No implementa comportamiento K4a.

Su propósito es asegurar que el workflow actual consume correctamente las garantías de identidad ya entregadas por K3 hasta que los slices posteriores lo absorban progresivamente.

La secuencia permanece:

```text
K3
 ↓
[this corrective]
 ↓
K4a
 ↓
K5
 ↓
K6a
 ↓
K4b
 ↓
K6b+
```

El corrective MUST NOT convertirse en un gate abierto de perfeccionamiento indefinido antes de K4a.
