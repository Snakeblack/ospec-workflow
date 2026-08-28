# ADR-002: Candidate Immutability and Non-Authoritative Complementary Evidence

- Status: proposed
- Change: k6c-policy-selected-challenges
- Date: 2026-08-28

## Context
Los challenges adversariales someten a prueba el candidato congelado mediante mutaciones o reversiones. Si los challenges alterasen el Candidate original o pretendiesen autorizar entregas de forma autónoma, destruirían la inmutabilidad y la jerarquía de autoridad canónica del harness.

## Decision
La ejecución de challenges debe realizarse en instancias de trabajo aisladas y efímeras, dejando los bytes del Candidate intactos. Los planes y resultados de challenges actúan únicamente como evidencia complementaria para el verifier y jamás constituyen autoridad de delivery o lifecycle.

## Alternatives
- **Conceder autoridad de promoción directa al challenge runner**: Descartada por violar la autoridad canónica de OpenSpec/Git/Candidate.
- **Mutación in-place del workspace congelado con posterior revert**: Descartada por riesgo de contaminación de estado y fallos de rollback.

## Consequences
- **Positivas**: Garantía estricta de inmutabilidad del Candidate y preservación del principio de única fuente de verdad.
- **Negativas**: Necesidad de clonado o aislamiento temporal de workspaces para la ejecución de mutaciones.
- **Reversibilidad**: Baja (invariante de seguridad del kernel).
