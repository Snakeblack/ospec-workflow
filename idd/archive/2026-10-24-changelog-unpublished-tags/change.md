# changelog-unpublished-tags

## Intent and acceptance

Cada versión del CHANGELOG tiene tag o marca de no publicada (OSP-023, #347), con una comprobación contra git tag

Acceptance: Las 9 cabeceras sin tag llevan la marca de no publicada con la versión que las incluyó; v2.27.0 tiene su sección; un test de manifest-sync falla si una cabecera anterior a la de package.json no tiene tag ni marca

## Plan

1. `scripts/manifest-sync.test.js`: un test lee `git tag --list "v*"` y comprueba que cada cabecera `## [x.y.z]`, salvo la de `package.json`, tiene tag o la frase «Esta versión no tiene tag ni GitHub Release. El cambio quedó incluido en [X].», no las dos, y que X tiene tag. También comprueba que cada tag tiene cabecera y que cada enlace de referencia nombra tags que existen. Sin tags locales se omite con su motivo.
2. `CHANGELOG.md`: la frase en 2.0.0–2.3.0 (incluidas en 2.4.0) y 2.56.8 y 2.57.0 (en 2.58.0); 2.117.16–18 ya la tenían. La cabecera `## [2.27.0] - 2026-07-14` vuelve delante del bloque del benchmark O2, que estaba dentro de 2.28.0. Se quitan los enlaces `[2.0.0]`–`[2.3.0]`, y `[2.4.0]` pasa a `releases/tag/v2.4.0`.
3. Roadmap: E1.32 hecho.

## Decisions

- Se marcan las versiones sin tag en lugar de crear tags o Releases a posteriori, por decisión del usuario del 2026-10-24: `publish-marketplace.yml` se dispara con `release: released`, así que una Release vieja publicaría un build antiguo en la rama `release`, y cada push de tag lanza la matriz de Validate Harness.
- La versión incluida sale del primer tag que contiene el commit del bump (`git tag --contains --sort=v:refname`): v2.4.0 para 2.0.0–2.3.0 y v2.58.0 para 2.56.8 y 2.57.0.
- Las nueve usan la frase en español que ya llevaban 2.117.16–18, aunque las entradas de 2.0.0–2.3.0 estén en inglés: así el test busca un único texto.
- El test comprueba las dos direcciones (cabecera → tag o marca, tag → cabecera). Así detecta el caso de v2.27.0, cuya cabecera se perdió al fusionarse con 2.28.0.
- Sin ningún tag local (clon superficial o git no disponible), el test se omite. Si hay tags y falta uno, falla y sugiere `git fetch --tags`. La CI usa `fetch-depth: 0`, que trae los tags.
- `[Unreleased]` sigue comparando `v2.4.5...HEAD`: queda fuera del cambio como defecto aparte, porque arreglarlo añade un paso a cada release.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-24T17:34:20.127Z)
- ev-2: check-run for checks-pass (2026-10-24T17:36:07.150Z)
<!-- ospec:evidence:end -->
