# Ficha de receta

Una ficha de receta en una sola página: un único `index.html` en la raíz del
repositorio, con su CSS y su JavaScript dentro, sin dependencias ni paso de
build. Se abre directamente en el navegador.

Se añaden ingredientes con nombre, cantidad y unidad (`g`, `ml` o `ud`), se
cambia el número de raciones y las cantidades se recalculan, y se puede quitar
un ingrediente. La receta sobrevive a recargar la página.

## Contrato de la página para pruebas automatizadas

Las pruebas de aceptación manejan la página con estos selectores:

| Selector | Qué es |
| --- | --- |
| `#nombre` | Campo de texto del nombre del ingrediente |
| `#cantidad` | Campo de texto de la cantidad |
| `#unidad` | Desplegable de la unidad: `g`, `ml` o `ud` |
| `#anadir` | Botón que añade el ingrediente |
| `#raciones` | Campo de texto con el número de raciones |
| `#resumen` | Texto con las raciones |
| `#lista` | La lista de ingredientes; cada uno es un `li` dentro de ella |
| `#lista li .nombre` | El nombre del ingrediente |
| `#lista li .cantidad` | La cantidad que se muestra |
| `#lista li .unidad` | La unidad |
| `#lista li .borrar` | Botón que quita el ingrediente |
| `#aviso` | Mensaje de estado; vacío cuando no hay nada que avisar |

## Tests

`npm test` ejecuta `node --test`.
