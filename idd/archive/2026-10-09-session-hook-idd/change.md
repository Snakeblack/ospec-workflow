# session-hook-idd

## Intent and acceptance

Los hooks Stop y PreCompact reconocen los cambios IDD abiertos y escriben su siguiente paso (E1.12)

Acceptance: Con un cambio IDD abierto, latest.md lo nombra con su siguiente paso de nextForChange; con varios cambios abiertos los lista sin elegir; PreCompact escribe un resumen por cambio IDD; los cambios solo SDD conservan su salida; paridad JS/Go

## Plan

1. Node: `scripts/hooks/lib/idd-session.js` lee los cambios IDD abiertos de `idd/` sin escribir ni bloquear el state, obtiene su siguiente paso con `nextForChange` y lo escribe como una línea; `stop.js` y `pre-compact.js` lo usan (§4.7 y §6.4 de la spec de hooks).
2. Go: `internal/iddsession` porta lectura, siguiente paso y resumen; `internal/hooks/stop.go` y `precompact.go` lo usan.
3. Paridad: casos golden compartidos en `internal/testdata/idd-session/` (`one-idd`, `many`, `steps`), ejecutados por `scripts/hooks/idd-session.test.js` y `internal/hooks/iddsession_golden_test.go`.

## Decisions

- Con un único cambio abierto en total, es el cambio activo (fase `idd`). Con varios, se listan todos sin elegir, SDD primero y después IDD por id, cada uno con su siguiente paso. Sin cambios IDD la salida no cambia (decisión del usuario en `open-facts`).
- PreCompact escribe un resumen por cambio IDD abierto en `.ospec/session/<id>/session-summary.md`, además del resumen SDD existente (decisión del usuario en `open-facts`).
- Los hooks no usan `idd-store.readChange`, porque recupera copias `.bak` huérfanas y escribiría en `idd/` sin el cerrojo del CLI mientras este escribe. Leen el JSON, lo validan con `validateState` y saltan un state ilegible; `latest.md` sigue siendo una vista derivada.
- Para saber si hay checks declarados, los hooks cuentan las líneas `nombre: comando` de la sección `checks:` en vez de validar la configuración entera: es lo único que necesita `nextForChange` y se porta igual a Go. Un test compara el recuento con `parseIddConfig`.
- El paso `configure-checks` no repite el comando candidato: remite a `ospec next`, que lo calcula, para no portar `candidateCheckCommand` a Go.
- Go comprueba del state la forma y el catálogo que usan los ficheros de sesión (esquema, modo, id, estado `open`, intención, plan, señales, obligaciones y gates del catálogo, y elementos de evidencia y ejecuciones que sean objetos), un subconjunto de `validateState`: nunca escribe ids ni estados fuera del catálogo. El caso golden `malformed` prueba que Node y Go saltan los mismos states malformados.
- Revisión de confianza 1 (aprobada, F-e15f81131fbd4828 WARNING): un `state.yaml` o un `idd/config.yaml` que fuera un directorio o ilegible hacía abortar los dos hooks, también la traza SDD. Corregido en Node y Go: todo lo que no se puede leer se salta y una configuración ilegible no declara checks; las funciones Go ya no devuelven error. El usuario aprobó explícitamente la revisión sucesora (2 de 3).
- Revisión de confianza 2 (aprobada; WARNING y SUGGESTION): en Node, un state con JSON válido y elementos `null` hacía lanzar a `validateState` y tumbaba la traza; Go no validaba ids ni estados contra el catálogo. Corregido: Node trata una excepción de `validateState` como state inválido y Go valida forma y catálogo; caso golden `malformed` con diez states malformados. El usuario aprobó explícitamente la tercera y última revisión sucesora (3 de 3).

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-09T11:06:23.342Z)
- ev-2: check-run for checks-pass (2026-10-09T11:09:06.874Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-09T11:09:06.874Z)
- ev-4: frozen-review for trust-review (2026-10-09T11:11:55.348Z)
- ev-5: check-run for checks-pass (2026-10-09T11:33:20.275Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-09T11:33:20.275Z)
- ev-7: frozen-review for trust-review (2026-10-09T11:37:58.919Z)
- ev-8: check-run for checks-pass (2026-10-09T11:41:35.761Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-10-09T11:41:35.761Z)
- ev-10: frozen-review for trust-review (2026-10-09T11:43:14.946Z)
- ev-11: living-doc-current for living-doc (2026-10-09T11:43:15.111Z)
<!-- ospec:evidence:end -->
