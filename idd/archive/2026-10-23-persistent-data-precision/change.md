# persistent-data-precision

## Intent and acceptance

persistent-data por contenido solo en código de producto, más un salto de import relativo a un módulo de producto que escribe (#404, E1.36)

Acceptance: Un writeFile añadido solo en un test, un .diff, un record o un .md no deriva persistent-data; un writeFile o localStorage en producto sí; un fichero de producto tocado que importa por ruta relativa un módulo que escribe la deriva, y las 6 entregas cli-local del banco (idd-7, idd-agy-6) quedan en critical

## Plan

1. `idd-signals.js`: `persistent-data` por contenido solo en ficheros `product` fuera de `impact.exclude`, en tres pasos por orden de evidencia: la línea añadida escribe (`adds`), el fichero ya escribe (`uses`, salto 0) o importa por ruta relativa un módulo de producto que escribe (`imports … which uses`, salto 1). Los patrones exigen una llamada o un acceso. `public-contract` por documentación no cambia.
2. `idd-workspace.js`: `readGitDiff` devuelve `sources`, con cada fichero de producto cambiado y los módulos de producto que importa por ruta relativa (JS/TS `require`, `import`, `export … from` e `import()`; Python `from . import`). Nunca sigue un symlink ni sale del repositorio.
3. `idd-impact.js`: `isExcluded`, compartido con `matchImpact`.
4. Spec REQ-idd-012 con dos escenarios; fixtures `content-outside-product`, `import-reaches-writer` y `touched-writer`; un test sobre las 18 entregas de `idd-7` del banco.

## Decisions

- Producto más un salto en lugar de solo producto (decisión del usuario del 2026-10-24): conserva `cli-local` en 6 de 6 entregas (antes, 4 de 6, y por el test) a cambio de más ruido en proyectos con muchas escrituras.
- El salto 0 cuenta: editar el módulo que escribe es el caso más directo de cambio de formato.
- `impact.exclude` silencia la regla, tanto en el fichero tocado como en el módulo importado: es lo que ya pedía REQ-idd-012 y le da a cada proyecto una forma de acallar el ruido.
- Se exige forma de uso (`writeFile(`, `localStorage.`/`[`, `indexedDB.`…): sin ella, este mismo cambio derivaba la señal por la tabla de patrones. En ospec, los ficheros de producto que alcanzan una escritura bajan de 164 a 141.
- Solo JS/TS y Python, que importan por ruta de fichero; Go, Java y C# importan por paquete o namespace y se quedan con la regla por contenido.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-23T23:32:16.123Z)
- ev-2: check-run for checks-pass (2026-10-23T23:33:38.981Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-23T23:33:38.981Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-23T23:41:27.033Z)
- ev-5: check-run for checks-pass (2026-10-23T23:42:39.929Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-23T23:42:39.929Z)
- ev-7: living-doc-current for living-doc (2026-10-23T23:42:45.506Z)
<!-- ospec:evidence:end -->
