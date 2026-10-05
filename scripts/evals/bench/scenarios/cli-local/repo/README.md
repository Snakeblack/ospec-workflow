# tasks-cli

Gestor de tareas personal para la terminal. Guarda las tareas en un fichero JSON
(`~/.tasks.json`, o la ruta de `TASKS_FILE`).

```sh
tasks add Comprar pan
tasks list
tasks done 1
```

Códigos de salida: `0` correcto, `1` la tarea no existe, `2` error de uso.

Pruebas: `npm test`.
