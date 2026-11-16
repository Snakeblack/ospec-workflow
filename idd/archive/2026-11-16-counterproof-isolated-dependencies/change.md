# counterproof-isolated-dependencies

## Intent and acceptance

Issue #518: mountCounterproof (scripts/lib/idd-workspace.js) enlaza en el worktree temporal de la base los DEPENDENCY_DIRS reales del proyecto (node_modules, .venv, vendor…) con un symlink o junction escribible. Si el comando de la contraprueba o de su control reinstala dependencias en la base (pnpm 12 ante un lockfile que no casa), escribe a través del enlace en el directorio real: en retama-landing quedaron 24 symlinks de node_modules apuntando al árbol temporal borrado, con versiones de la base

Acceptance: Una contraprueba o un control cuyo comando escribe en el directorio de dependencias del árbol temporal deja el del proyecto como estaba (mismo contenido y mismos enlaces); un test lo reproduce con un comando que escribe en ese directorio; la contraprueba sigue encontrando las dependencias instaladas, sin reinstalar

## Plan

<!-- ospec:plan:start -->
- Files: `handbook/idd/evidencia.md`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La contraprueba copia en su árbol temporal los directorios de dependencias ignorados del proyecto y de la raíz del repositorio en vez de enlazarlos (#518): lo que corre en él nunca escribe en los del proyecto. Los ficheros se clonan donde el sistema de ficheros lo admite (COPYFILE_FICLONE) y se copian donde no
- Una copia por montaje, en os.tmpdir() como el resto del árbol; si no cabe, el montaje falla con counterproof-unmounted y la contraprueba se omite con aviso
- Las rutas absolutas que un ecosistema guarda dentro de los ficheros de esos directorios (shebangs de .venv/bin, .pth de instalaciones editables) se copian tal cual; el límite queda en handbook/idd/evidencia.md. Guardar la salida de la contraprueba que falla va en una issue aparte
- Un enlace de la copia cuyo destino absoluto cae dentro del repositorio apunta a la misma ruta del árbol temporal, en todas las plataformas; en Windows un enlace a un directorio se recrea como junction, que no pide privilegios. Motivo: pnpm (symlink-dir) crea en Windows junctions, siempre absolutos, al .pnpm real. Los enlaces que salen del repositorio se copian tal cual (decisión del usuario, opción A)
<!-- ospec:decisions:end -->

- Un enlace absoluto se compara con el repositorio tal como está escrito y ya resuelto (`fs.realpathSync`): en macOS el directorio temporal se escribe `/var/...` y `git rev-parse --show-toplevel` da `/private/var/...`. Probado en Linux con un alias simbólico del repositorio.
- `removeLink` y la lista `links` desaparecen: los directorios de dependencias del árbol ya son copias, y `fs.rmSync` borra un enlace o un junction sin seguirlo. El test de #518 lo fija con un enlace que sale del repositorio, en los tres sistemas operativos del CI.
- Coste medido el 2026-11-16 con el `node_modules` de retama-landing (929 MB en btrfs comprimido, 37 605 ficheros, 2 202 enlaces relativos): la copia a tmpfs tarda 0,85 s, ocupa 1,3 GB y deja los enlaces idénticos. Con control son dos copias por llamada.
- La issue dice que `ospec close` borró los logs de la contraprueba: la contraprueba nunca los escribe (`runCommand` en `scripts/ospec.js`); solo `run` y `check` guardan la salida de un run que falla.
- Fuera de este cambio: una instalación editable de Python deja en `.venv` un `.pth` con la ruta absoluta del `src` real, así que la contraprueba importa el código del candidato, enlazado o copiado.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-16T16:08:51.021Z)
- ev-2: check-run for checks-pass (2026-11-16T16:12:32.866Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-16T16:12:32.866Z)
- ev-4: check-run for checks-pass (2026-11-16T16:14:34.447Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-16T16:14:34.447Z)
- ev-6: living-doc-current for living-doc (2026-11-16T16:15:00.406Z)
<!-- ospec:evidence:end -->
