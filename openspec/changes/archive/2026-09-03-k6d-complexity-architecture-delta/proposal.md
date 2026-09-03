# Proposal: K6d Complexity and Architecture Delta

## Intent

Materializar una evaluación estructural reproducible ligada al `CandidateId`: alternativas, `complexity_delta` y `architecture_delta`, sin convertir heurísticas en autoridad o límites rígidos.

## Scope

### In Scope
- Contrato de alternativas `no-op|local|extend-pattern|new-abstraction` y justificación de abstracciones nuevas.
- Deltas reproducibles sobre módulos, interfaces, dependencias, configuración, estados, compatibilidad, duplicación, dead code y API pública.
- Informe content-addressed Candidate-bound, advisory y consumible posteriormente por review/K9.
- Preguntas/findings anti-overengineering, fixtures negativos y bindings fail-closed.

### Out of Scope
- Límites rígidos o sustitución de impacto/riesgo.
- Instrumentación de contexto, percentiles o targets CX0.
- Review authority K7, Evaluation Attestation K8, promoción K9 o DeliveryAuthorization.
- Cambios de autoridad en OpenSpec, Git, Candidate, evidencia o lifecycle.

## Capabilities

### New Capabilities
- `complexity-architecture-delta`: alternativas, deltas deterministas, informe Candidate-bound y señales anti-overengineering.

### Modified Capabilities
- `kernel-contract-schemas`: registrar contratos versionados y fixtures válidos/negativos.
- `harness-authority-canon`: declarar los informes K6d como señales advisory no autoritativas y mantener K7+ como trabajo posterior.

## Approach

Derivar el delta de Candidate/base y metadatos canónicos resolubles; validar el informe antes de identificarlo. Separar hechos de heurísticas. Una `new-abstraction` documentará problema, consumidores, variabilidad, boundary, alternativa simple y retirada. Bindings incompletos o divergentes fallarán cerrados.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/` | Modified | Contratos, manifest, claims y fixtures |
| `scripts/lib/complexity-architecture-delta/` | New | Cálculo, canonicalización y validación |
| `scripts/lib/k6d-*.test.js` | New | Determinismo, bindings y sobreingeniería |
| `openspec/specs/{kernel-contract-schemas,harness-authority-canon}/` | Modified | Deltas normativos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Métricas incompletas o host-dependent | High | Inputs canónicos, fixtures multiplataforma y fallo cerrado |
| Heurística convertida en gate rígido | Med | Separar hechos de señales y exigir consumo advisory |
| Scope creep hacia K7+ o CX0 | Med | Contratos read-only y pruebas de frontera |

## Rollback Plan

Revertir schemas, registro, módulo y tests como una unidad. Los informes derivados se descartan sin migrar estado autoritativo.

## Dependencies

- K6b cerrado; K6c aporta promotion evidence. Candidate v2 y contratos K3/K1.

## Success Criteria

- [ ] Inputs idénticos producen informes byte-equivalentes; cambios canónicos cambian la identidad.
- [ ] El delta cubre todas las dimensiones K6d y una abstracción nueva aporta justificación completa.
- [ ] Fixtures de sobreingeniería producen pregunta/finding, nunca aprobación o rechazo automático.
- [ ] El output queda disponible para K7/K9 sin implementar ni conceder autoridad K7+.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
