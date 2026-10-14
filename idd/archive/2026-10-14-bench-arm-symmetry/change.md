# bench-arm-symmetry

## Intent and acceptance

E4.9: el brief pide el commit a los dos brazos, el brazo IDD en Claude carga el router como en agy, el informe desglosa los checks por tipo y publica el peso de Engram aparte, y quedan las líneas base idd-4 y gentle-ai-2

Acceptance: Con una repetición en Claude, los records idd-4 y gentle-ai-2 existen, los márgenes están declarados antes de correr, el informe desglosa acceptance, regression y fact, y el peso de Engram queda aparte del total de tokens

## Plan

Dos unidades:

1. **Banco simétrico.** Los seis briefs de `scenarios/` piden el commit; `todo-spa` no. El brazo IDD termina con el archivo nuevo en `HEAD`, al menos un commit tras el setup y el árbol limpio. En Claude el plugin del brazo IDD va sin SDD y el router entra solo en la copia de configuración del agente. En agy, una persona `grok-*` se pregunta por el CLI de Cursor en un directorio vacío. El informe desglosa acceptance, regression y fact, y publica los bytes del MCP de Engram sin restarlos de los tokens. Márgenes `bench-margins-8`.
2. **Corridas.** `idd-4` y `gentle-ai-2` en agy con `gemini-3.8-flash-high`, persona `grok-4.7-high`, una repetición, tope de 30 M tokens y 30 turnos. Informe en `docs/analysis/2026-10-14-bench-arm-symmetry.md`. Checkpoint `revise` por tokens (2,29×); escapados 3 frente a 9.

## Decisions

Del gate `open-facts` (usuario, 2026-10-13):

- La frase de commit entra solo en los seis briefs de `scenarios/`. `todo-spa` se queda hasta E4.6.
- El brazo IDD termina con un directorio nuevo en `idd/archive/`, ese directorio en `HEAD`, al menos un commit tras el setup y el árbol limpio.
- El peso de Engram es el tamaño en bytes del MCP de la instalación. El informe lo publica aparte y no lo resta de los tokens.
- `bench-margins-8`: una repetición, gentle-ai como base, idd como candidato, `max_mean_delta` 0, `max_total_ratio` 1, sin criterio de calidad.
- Las 12 corridas van en agy con `gemini-3.8-flash-high`. La persona es `grok-4.7-high` por el CLI de Cursor (`agent --print --mode ask`) en un directorio vacío. Tope de 30 millones de tokens y 30 turnos, porque agy no informa coste.

De desarrollo:

- El router de Claude se escribe en una copia de la configuración del banco. La persona sigue en la configuración original, sin ese bloque.
- El plugin del brazo IDD en Claude omite `--with-sdd`, como la instalación de agy. El brazo SDD lo conserva.
- Los records se llaman `idd-4` y `gentle-ai-2`, como dice la aceptación, y su `host.name` es `agy`.
- Esta rama está en 2.136.0. El test de la huella usa `unlinkSync` en el symlink colgante, como ya está en `main` (v2.136.1): en Node 24 `rmSync` no lo borra. No cambia el motor.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-13T22:32:53.759Z)
- ev-2: check-run for checks-pass (2026-10-13T22:36:35.051Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-13T22:36:35.051Z)
- ev-4: check-run for checks-pass (2026-10-14T00:17:57.402Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-14T00:17:57.402Z)
- ev-6: living-doc-current for living-doc (2026-10-14T00:18:10.340Z)
<!-- ospec:evidence:end -->
