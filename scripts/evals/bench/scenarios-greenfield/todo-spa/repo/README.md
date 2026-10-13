# Lista de tareas

Una lista de tareas en una sola página: un único `index.html` en la raíz del
repositorio, con su CSS y su JavaScript dentro, sin dependencias ni paso de
build. Se abre directamente en el navegador.

## Contrato de la página para pruebas automatizadas

Las pruebas de aceptación manejan la página con estos selectores:

| Selector | Qué es |
| --- | --- |
| `#nueva-tarea` | Campo de texto para escribir una tarea nueva; Enter la añade |
| `#lista` | La lista de tareas; cada tarea es un `li` dentro de ella |
| `#lista li .completar` | Casilla (`input type="checkbox"`) que marca la tarea como completada |
| `#lista li .titulo` | El título de la tarea; doble clic sobre él la pone en edición |
| `#lista li .edicion` | Campo de texto que aparece dentro del `li` mientras se edita la tarea |
| `#lista li .borrar` | Botón que borra la tarea |
| `#contador` | Texto con las tareas pendientes |
| `#filtro-todas`, `#filtro-pendientes`, `#filtro-completadas` | Enlaces de filtro |

Una tarea que el filtro oculta puede quitarse del DOM o quedar oculta: las
pruebas solo cuentan las que se ven.

## Tests

`npm test` ejecuta `node --test`.
