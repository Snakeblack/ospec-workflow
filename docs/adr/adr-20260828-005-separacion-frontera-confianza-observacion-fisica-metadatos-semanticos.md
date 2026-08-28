# ADR-002: Separación de Frontera de Confianza entre Observación Física y Metadatos Semánticos Derivados

- Status: proposed
- Change: k6b-evidence-binding-and-schema-stability-remediation
- Date: 2026-08-28

## Context
Permitir que agentes invocadores o workers no confiables inyecten directamente metadatos semánticos (`role`, `obligation_ids`, `evidence_requirements_satisfied`) dentro de la observación física de evidencias crea una brecha de seguridad y permite falsificar satisfacción de requisitos sin validación efectiva contra el Execution Graph y los recibos del runner.

## Decision
Desacoplar estrictamente la observación física (`rawEvidence`: bytes del payload, `provenance`, `origin`, `node_id` y `execution_sequence: {run_id, ordinal, previous_evidence_id}`) de los metadatos semánticos de confianza. El verifier/harness derivará autoritativamente `role`, `obligation_ids` y `evidence_requirements_satisfied` a partir de los recibos de ejecución y el Execution Graph compilado, ignorando y rechazando claims semánticos arbitrarios del invocador.

## Alternatives
- Confiar en los campos semánticos inyectados en el payload `rawEvidence`: Rechazado porque vulnera la frontera de confianza del verificador independiente.
- Incrustar los campos semánticos de binding directamente dentro del esquema de observación `evidence/v2`: Rechazado porque mutaría el registro inmutable de observación física con datos de interpretación.

## Consequences
- La integridad semántica queda garantizada por construcción en el verifier.
- Las observaciones físicas permanecen puras y reusables en replay sin acoplamiento a decisiones de evaluación.
- Requiere que el arnés de verificación resuelva los bindings consultando el Execution Graph y los runner receipts.
- Reversibilidad: Media (establece el contrato estructural de derivación del arnés).
