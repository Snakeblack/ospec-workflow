# audit-remediation

## Intent and acceptance

El marketplace espera el Validate Harness de la rama, y el hook cubre las lecturas y comandos que hoy pasan sin decisión.

Acceptance: Publicar no mueve la rama release hasta que el Validate Harness de esa rama y ese SHA haya terminado en success sin failure, timed_out ni startup_failure; los runs del tag no cuentan y el workflow ya no se dispara en tags. grep, sed, awk, base64, xxd y cp sobre .env piden confirmación; una cabecera de clave privada en cat, Write o Edit pide confirmación; un .key por nombre se niega; rm -r -f / y git push origin +main se niegan; curl -o y luego bash pide confirmación. Los cuatro review por defecto no duplican el rótulo de skills. El timeout de PowerShell del test de hooks es 60 s y el lock espera 320 intentos de 15 ms, igual en Go, dentro de los 5 s. El README dice que claude plugin validate --strict es el e2e cuando hay CLI. El CHANGELOG avisa que 2.117.16–18 no tienen tag.

## Plan

1. El workflow de publicación espera el Validate Harness de la rama del SHA y no cuenta el run del tag. El workflow de validación deja de dispararse en tags.
2. El hook, en JS y en Go, reconoce más lectores de shell, niega `*.key` y las formas `rm -r -f /` y `git push origin +main`, pide confirmación ante una cabecera de clave privada y ante descargar y luego ejecutar.
3. El reescritor de agentes no vuelve a escanear el rótulo que acaba de insertar.
4. El lock espera 320 veces 15 ms, sin pasar de los 5 s, y el test de PowerShell espera 60 s. El README y el CHANGELOG dicen lo que el CI hace de verdad.

## Decisions

- El gate de publicación usa el run de la rama por defecto en un release, y la rama elegida en `workflow_dispatch`. Un run del tag no decide. Así `df4840fc` habría seguido, porque `main` acabó en verde, y `6b54f458` se habría parado, porque `main` acabó en rojo.
- Un `*.pem` no se clasifica por el nombre. Solo una cabecera `BEGIN … PRIVATE KEY` pide confirmación; un certificado no.
- Descargar y luego invocar un shell pide confirmación. El tubo directo a un shell sigue siendo una denegación.
- El margen del lock queda en 200 intentos de 15 ms (3 s). 320 llegaba a los 5 s y el lock fresco se reclamaba como huérfano, así que el fallo cerrado dejaba de serlo.
- No se cambia el filtro de atribución de commits, no se añade el brazo gentle-ai y no se activa el ruleset «Main protect»: sus reglas no exigen checks y el job de Windows sigue pudiendo fallar por carga.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-10T23:51:27.325Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-10T23:52:03.183Z)
- ev-3: frozen-review for trust-review (2026-10-11T00:04:39.400Z)
- ev-4: check-run for checks-pass (2026-10-11T00:05:09.815Z)
- ev-5: living-doc-current for living-doc (2026-10-11T00:05:58.175Z)
<!-- ospec:evidence:end -->
