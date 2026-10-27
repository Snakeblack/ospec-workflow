# atomic-write-concurrent-rename

## Intent and acceptance

En Windows, el fallback de writeFileAtomic aguanta varios escritores sin lock del mismo fichero: cada uno aparta el destino a su propio .bak y, si otro ya lo apartó (ENOENT), reintenta en vez de fallar

Acceptance: Un test inyecta EPERM y ENOENT intercalados entre dos escritores y cada escritura termina entera o falla sin perder el contenido anterior ni dejar ficheros; recoverOrphanBak (JS y Go) restaura el .bak propio de un escritor muerto; el test de 20 escritores pasa 20 veces en windows-latest

## Plan

1. JS (`scripts/lib/atomic-write.js`): `writeFileAtomic` deja de apartar el destino a `.bak`. Si Windows rechaza el rename del temporal sobre el destino (`EPERM`, `EEXIST`), espera y lo reintenta, hasta 8 intentos con una espera que empieza en 10 ms y se dobla (1,27 s como mucho). Agotados, falla, borra su temporal y el destino conserva el contenido anterior. `recoverOrphanBak` y `renameWithFallback` no cambian.
2. Go (`internal/store/store.go`): `WriteFileAtomic` reintenta igual el rename ante `os.ErrPermission` u `os.ErrExist`, a través de `renameFile`, que los tests sustituyen.
3. Tests: dos escritores con el rename rechazado e intercalados por compuertas, sin depender del planificador (en rojo dan `ENOENT` en el `.bak` compartido), y el rename siempre rechazado, en JS y en Go; 20 escritores concurrentes en Go, que `build-hooks.yml` corre en Windows.
4. Validación: una rama temporal con un workflow propio corre 20 veces el test de atomic-write y `go test -count=20` en `windows-latest`. Se borra después, sin merge.
   - Hecho el 2026-10-27, en la run [40495412302](https://github.com/Snakeblack/ospec-workflow/actions/runs/40495412302) (commit dd1f8759, rama `scratch/e1-55-windows-20x`, ya borrada).
   - Con el código de `main`, el TEMP en NTFS dio 4 fallos de 20 en el test de los 20 escritores. Fallaron por el reintento rechazado otra vez (`EPERM`) y por un escritor que borró el `.bak` de otro (`ENOENT` en el `unlink` y en la vuelta atrás). En Dev Drive (ReFS) dio 0 de 20.
   - Con el arreglo dio 0 de 20 en NTFS y en Dev Drive, y `go test -count=20` de los tres tests de `WriteFileAtomic` pasó en los dos.
5. Roadmap: el alcance de E1.55 recoge el cambio de enfoque.
6. Contratos: `openspec/specs/explore-transactional-barrier/spec.md` exigía en Windows apartar el destino a `.bak`; ahora exige el reintento y que el destino nunca falte, y su cláusula de recuperación queda para el `.bak` de versiones anteriores. REQ-idd-027 (`openspec/specs/idd/spec.md`) añade el reintento y dos escenarios. `docs/harness-runtime.md` lo cuenta en su párrafo de durabilidad.
7. Compatibilidad (`persistent-data`): los ficheros en disco no cambian de formato y los lectores del `.bak` siguen igual; los tests de recuperación de un `.bak` antiguo, en JS y en Go, lo demuestran.

## Decisions

- **Reintentar el rename atómico en vez de apartar el destino** (el usuario eligió la opción A el 2026-10-27, después de resolver `open-facts`). Apartar el destino a `.bak` no era atómico: entre apartarlo y renombrar el temporal, el destino no existía para un lector, y un fallo en ese punto dejaba solo el `.bak`. Además, renombrar un destino que otro tiene abierto falla igual que sustituirlo, así que apartarlo no añadía nada. El rechazo de Windows es transitorio mientras otro proceso sustituye el destino, así que la solución es esperar y reintentar el mismo rename. Por eso, las respuestas de `open-facts` sobre el `.bak` propio y su limpieza, y sobre la recuperación de Go, quedan sin objeto: no se crea ningún `.bak` nuevo, y `recoverOrphanBak` (JS y Go) sigue recuperando el que dejen versiones anteriores. Siguen en pie el bucle acotado, el reintento en Go y la validación en una rama temporal.
- `renameWithFallback` se queda como está: renombra directorios del archivo, y en Windows renombrar sobre un directorio existente falla siempre, no de forma transitoria.
- Solo se reintentan `EPERM` y `EEXIST`, los códigos que ya trataba el fallback. Un destino de solo lectura, o uno retenido más de 1,27 s, hace fallar la escritura sin tocar el contenido anterior.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-27T11:19:34.182Z)
- ev-2: check-run for checks-pass (2026-10-27T11:21:55.168Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-27T11:22:52.690Z)
- ev-4: check-run for checks-pass (2026-10-27T11:24:32.971Z)
- ev-5: living-doc-current for living-doc (2026-10-27T11:24:42.958Z)
<!-- ospec:evidence:end -->
