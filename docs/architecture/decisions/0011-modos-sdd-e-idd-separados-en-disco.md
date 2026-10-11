# 0011. Los modos SDD e IDD están separados en disco

- Status: accepted
- Date: 2026-10-11
- Evidence: idd/config.yaml:2, scripts/lib/idd-store.js:4, scripts/lib/ospec-state.js:233

## Context and drivers
ospec ofrece dos modos de trabajo con ciclos distintos. Mezclar su estado haría que un cambio de un modo leyera o reanudara artefactos del otro. Drivers: `scenario:deterministic-resume` y `scenario:contract-compatibility`.

## Options considered
1. Un árbol por modo: el modo por especificación guarda configuración y cambios en su carpeta, y el modo por impacto en la suya: cada uno se reanuda sin ambigüedad; dos sitios donde mirar.
2. Un único árbol con un campo de modo: un solo sitio; cada lector filtra y un error de filtro mezcla estados.

## Decision
Cada modo tiene su propio árbol en disco para configuración, cambios en curso y archivo. Un modo no lee ni escribe el estado del otro, y un cambio empezado en un modo termina en ese modo.

## Consequences
Un proyecto puede usar un modo sin la carpeta del otro. Las herramientas que miran ambos, como el doctor, leen dos árboles. Pasar un cambio de un modo al otro no está soportado.

## Fitness function
Los tests de `idd-store` y de `ospec-state` validan cada uno solo las rutas de su modo.
- Check: `node --test scripts/lib/idd-store.test.js scripts/lib/ospec-state.test.js`

## Review trigger
Usuarios que necesiten mover un cambio en curso de un modo al otro.
