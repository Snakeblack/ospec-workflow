# ospec-doctor

## Intent and acceptance

ospec doctor: diagnóstico de solo lectura por target (raíz del plugin, hooks, router, modo, Engram, desfase de versión e instalación, presupuestos E0.0) y recuperación guiada de cambios interrumpidos

Acceptance: Cada fallo conocido de instalación y de la auditoría aparece en la salida de ospec doctor con su causa y la acción que lo arregla, sin que el comando escriba nada

## Plan

Entrega en PRs encadenados. Este cambio es el PR (a); el (b) añade los otros
seis targets sobre el mismo catálogo.

1. Contrato: REQ-idd-019 en `openspec/specs/idd/spec.md` (`ospec doctor`, solo
   lectura, hallazgos con causa y acción, salida 0/1) y su test.
2. Detección de Engram de solo lectura movida de `scripts/configure/engram-setup.js`
   a `scripts/lib/engram-detect.js`, para que el runtime distribuido la use.
3. `scripts/lib/ospec-doctor.js` con el catálogo de comprobaciones del PR (a):
   runtime y checkout (versión, `dist/` e instalación desfasados, git hooks),
   proyecto (`idd/config.yaml`, modo, paquete SDD, cambios IDD y SDD
   interrumpidos con el comando que los reanuda, asimetrías IDD/openspec,
   `.ospec/` sin ignorar, guardas de hooks desactivadas) y Claude Code (plugin
   instalado, varias instalaciones, hooks, router ausente, desfasado o
   duplicado fuera del bloque, presupuesto *always-on*, Engram).
4. `ospec doctor [--target <t>] [--json]` en `scripts/ospec.js`.

## Decisions

- Respuestas del usuario al gate `open-facts` (2026-10-08): PRs encadenados;
  subcomando `ospec doctor` del CLI distribuido con `--json` y `--target`,
  salida 0 sin errores y 1 con algún error (los avisos no cambian el código);
  recuperación guiada de cambios IDD y SDD, de solo lectura; las asimetrías
  IDD/openspec se reportan como aviso y los hooks no cambian.
- Un target sin instalación detectada se omite salvo que `--target` lo pida;
  entonces su ausencia es un error.
- La versión desfasada es un aviso (el host sigue funcionando con la vieja);
  una instalación rota, un `idd/config.yaml` inválido o `mode: sdd` sin el
  paquete SDD son errores.
- El presupuesto *always-on* es el de E0.4 (≤ 4 KB por target); el fixture de
  E0.0 no viaja al runtime.
- La detección de Engram se reutiliza en vez de duplicarla; su ausencia es
  informativa porque Engram es opcional.
- Gate `adr-amend-or-contradict` (respuesta del usuario, 2026-10-08): se
  enmienda `adr-20261002-003` y REQ-session-memory-002 con una excepción
  acotada. `engram-detect.js` y `ospec-doctor.js` pueden detectar si Engram está
  instalado, nunca leen su contenido ni llaman a `mem_*`, y ningún resultado de
  Engram es `error`; el test de contrato lo fija.
- En Windows, `claude` suele ser un shim `.cmd` de npm que no se lanza sin
  shell; el doctor usa la misma búsqueda que `setup:claude`, con el
  `claude.exe` del paquete de WinGet como alternativa.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-08T06:21:08.810Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-08T06:21:08.810Z)
- ev-3: living-doc-current for living-doc (2026-10-08T06:21:48.016Z)
<!-- ospec:evidence:end -->
