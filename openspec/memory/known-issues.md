# Known issues

## reference-changes-benchmark pendiente de evidencia live

- Estado: implementación focal 53/53 PASS; 0/3 perfiles core live aceptados.
- Impacto: `scripts/evals/reports/reference-baseline.md` sigue ausente y archive permanece bloqueado.
- Resolución: ejecutar el piloto core con `node scripts/evals/live-driver.js all`; revisar 3/3 resultados y publicar el baseline. La suite `extended` de nueve perfiles es opcional.
- O1: suplementario. Si falta o es inválido se marca `unavailable`; no requiere reparación del binding para medir tokens y duración run-level.
