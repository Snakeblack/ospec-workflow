"use strict";

// Hidden checks for todo-spa. They never enter the agent's workspace. Each
// one opens the delivered index.html in its own headless browser (a fresh
// profile, so localStorage starts empty) and drives it as a user would,
// through the selectors the seed's README publishes.

const LONG = (length) => "a".repeat(length);

async function open(kit) {
  const page = await kit.page();
  await page.open();
  return page;
}

async function add(page, title) {
  await page.focus("#nueva-tarea");
  await page.evaluate(() => { document.querySelector("#nueva-tarea").select(); });
  if (title !== "") await page.type(title);
  await page.press("Enter");
  await page.settle();
}

// Titles of the tasks a user can see, in order.
function titles(page) {
  return page.evaluate(() => [...document.querySelectorAll("#lista li")]
    .filter((li) => li.getClientRects().length > 0 && getComputedStyle(li).visibility !== "hidden")
    .map((li) => {
      const title = li.querySelector(".titulo");
      return title ? title.textContent.trim() : "";
    }));
}

// Index of the visible task with `title`, among every `#lista li`.
async function indexOf(page, title) {
  const index = await page.evaluate((wanted) => [...document.querySelectorAll("#lista li")]
    .findIndex((li) => li.getClientRects().length > 0 && li.querySelector(".titulo") && li.querySelector(".titulo").textContent.trim() === wanted), title);
  if (index === -1) throw new Error(`no visible task titled ${JSON.stringify(title)}`);
  return index;
}

async function inTask(page, title, selector) {
  const index = await indexOf(page, title);
  return page.evaluate((i, sel) => {
    const all = [...document.querySelectorAll(`#lista li ${sel}`)];
    const target = document.querySelectorAll("#lista li")[i].querySelector(sel);
    return all.indexOf(target);
  }, index, selector);
}

async function toggle(page, title) {
  await page.click("#lista li .completar", await inTask(page, title, ".completar"));
  await page.settle();
}

async function edit(page, title, replacement, key) {
  await page.doubleClick("#lista li .titulo", await inTask(page, title, ".titulo"));
  await page.settle();
  const value = await page.evaluate(() => {
    const field = document.querySelector("#lista li .edicion");
    if (!field) return null;
    field.focus();
    field.select();
    return field.value;
  });
  if (value === null) throw new Error("double click on the title shows no .edicion field");
  if (replacement !== null && replacement !== "") await page.type(replacement);
  if (replacement === "") await page.evaluate(() => { document.querySelector("#lista li .edicion").value = ""; });
  await page.press(key);
  await page.settle();
  return value;
}

const counter = (page) => page.evaluate(() => {
  const element = document.querySelector("#contador");
  return element ? element.textContent.replace(/\s+/g, " ").trim() : null;
});

module.exports = [
  {
    id: "single-file",
    kind: "acceptance",
    describe: "the delivery is one index.html at the root with its CSS and JavaScript inline",
    run(kit) {
      const html = kit.read("index.html");
      kit.assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, "no external script");
      kit.assert.doesNotMatch(html, /<link\b[^>]*rel\s*=\s*["']?stylesheet/i, "no external stylesheet");
      kit.assert.match(html, /<script\b/i, "inline JavaScript");
    },
  },
  {
    id: "add-task",
    kind: "acceptance",
    describe: "Enter in the new-task field adds the task to the list",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await add(page, "Llamar a Ana");
      kit.assert.deepEqual(await titles(page), ["Comprar pan", "Llamar a Ana"]);
      kit.assert.deepEqual(page.errors, []);
    },
  },
  {
    id: "complete-task",
    kind: "acceptance",
    describe: "the checkbox marks a task as completed and back",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await toggle(page, "Comprar pan");
      kit.assert.equal(await page.evaluate(() => document.querySelector("#lista li .completar").checked), true);
      await toggle(page, "Comprar pan");
      kit.assert.equal(await page.evaluate(() => document.querySelector("#lista li .completar").checked), false);
    },
  },
  {
    id: "delete-task",
    kind: "acceptance",
    describe: "the delete button removes only its task",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await add(page, "Llamar a Ana");
      await page.click("#lista li .borrar", await inTask(page, "Comprar pan", ".borrar"));
      await page.settle();
      kit.assert.deepEqual(await titles(page), ["Llamar a Ana"]);
    },
  },
  {
    id: "title-trimmed",
    kind: "fact",
    fact: "F1",
    describe: "a title is saved without its surrounding spaces",
    async run(kit) {
      const page = await open(kit);
      await add(page, "   Comprar pan   ");
      kit.assert.deepEqual(await titles(page), ["Comprar pan"]);
    },
  },
  {
    id: "empty-title-rejected",
    kind: "fact",
    fact: "F1",
    describe: "an empty or blank title creates no task",
    async run(kit) {
      const page = await open(kit);
      await add(page, "");
      await add(page, "     ");
      kit.assert.deepEqual(await titles(page), []);
      kit.assert.deepEqual(page.errors, []);
    },
  },
  {
    id: "title-max-200",
    kind: "fact",
    fact: "F1",
    describe: "200 characters after trimming are accepted and 201 are rejected, never truncated",
    async run(kit) {
      const page = await open(kit);
      await add(page, `  ${LONG(200)}  `);
      await add(page, LONG(201).replace(/a$/, "b"));
      kit.assert.deepEqual(await titles(page), [LONG(200)]);
    },
  },
  {
    id: "pending-duplicate-rejected",
    kind: "fact",
    fact: "F2",
    describe: "a title matching a pending task, ignoring case and surrounding spaces, creates no task",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await add(page, "  comprar PAN ");
      kit.assert.deepEqual(await titles(page), ["Comprar pan"]);
    },
  },
  {
    id: "completed-duplicate-allowed",
    kind: "fact",
    fact: "F2",
    describe: "a title matching only a completed task creates a new task",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await toggle(page, "Comprar pan");
      await add(page, "COMPRAR PAN");
      kit.assert.deepEqual(await titles(page), ["Comprar pan", "COMPRAR PAN"]);
    },
  },
  {
    id: "persists-reload",
    kind: "fact",
    fact: "F3",
    describe: "tasks and their state survive a reload, stored under localStorage key tareas.v1",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await add(page, "Llamar a Ana");
      await toggle(page, "Llamar a Ana");
      kit.assert.ok(await page.evaluate(() => localStorage.getItem("tareas.v1")), "stored under tareas.v1");
      await page.reload();
      await page.settle();
      kit.assert.deepEqual(await titles(page), ["Comprar pan", "Llamar a Ana"]);
      const checked = await page.evaluate(() => [...document.querySelectorAll("#lista li .completar")].map((box) => box.checked));
      kit.assert.deepEqual(checked, [false, true]);
    },
  },
  {
    id: "corrupt-storage-empty",
    kind: "fact",
    fact: "F3",
    describe: "unreadable stored data starts an empty, working list without errors",
    async run(kit) {
      const page = await open(kit);
      for (const stored of ["{no es json", "42"]) {
        await page.evaluate((value) => { localStorage.setItem("tareas.v1", value); }, stored);
        await page.reload();
        await page.settle();
        kit.assert.deepEqual(await titles(page), [], `stored ${stored}`);
        kit.assert.deepEqual(page.errors, [], `stored ${stored}`);
        await add(page, "Comprar pan");
        kit.assert.deepEqual(await titles(page), ["Comprar pan"], `stored ${stored}`);
      }
    },
  },
  {
    id: "counter-wording",
    kind: "fact",
    fact: "F4",
    describe: "the counter reads Sin tareas pendientes, 1 tarea pendiente, N tareas pendientes",
    async run(kit) {
      const page = await open(kit);
      kit.assert.equal(await counter(page), "Sin tareas pendientes");
      await add(page, "Uno");
      kit.assert.equal(await counter(page), "1 tarea pendiente");
      await add(page, "Dos");
      await add(page, "Tres");
      kit.assert.equal(await counter(page), "3 tareas pendientes");
      await toggle(page, "Dos");
      kit.assert.equal(await counter(page), "2 tareas pendientes");
    },
  },
  {
    id: "filter-from-url",
    kind: "fact",
    fact: "F5",
    describe: "loading with #/pendientes or #/completadas applies that filter",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Uno");
      await add(page, "Dos");
      await add(page, "Tres");
      await toggle(page, "Dos");
      await page.evaluate(() => { location.hash = "#/pendientes"; });
      await page.reload();
      await page.settle();
      kit.assert.deepEqual(await titles(page), ["Uno", "Tres"]);
      await page.evaluate(() => { location.hash = "#/completadas"; });
      await page.reload();
      await page.settle();
      kit.assert.deepEqual(await titles(page), ["Dos"]);
    },
  },
  {
    id: "filter-links-hash",
    kind: "fact",
    fact: "F5",
    describe: "each filter link sets its hash and shows its tasks",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Uno");
      await add(page, "Dos");
      await toggle(page, "Dos");
      await page.click("#filtro-completadas");
      await page.settle();
      kit.assert.equal(await page.evaluate(() => location.hash), "#/completadas");
      kit.assert.deepEqual(await titles(page), ["Dos"]);
      await page.click("#filtro-pendientes");
      await page.settle();
      kit.assert.equal(await page.evaluate(() => location.hash), "#/pendientes");
      kit.assert.deepEqual(await titles(page), ["Uno"]);
      await page.click("#filtro-todas");
      await page.settle();
      kit.assert.ok(["", "#/"].includes(await page.evaluate(() => location.hash)));
      kit.assert.deepEqual(await titles(page), ["Uno", "Dos"]);
    },
  },
  {
    id: "edit-enter-saves-trimmed",
    kind: "fact",
    fact: "F6",
    describe: "Enter saves the edited title, trimmed",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      const shown = await edit(page, "Comprar pan", "  Comprar leche  ", "Enter");
      kit.assert.equal(shown, "Comprar pan", "the field starts with the title");
      kit.assert.deepEqual(await titles(page), ["Comprar leche"]);
      await page.reload();
      await page.settle();
      kit.assert.deepEqual(await titles(page), ["Comprar leche"], "the edit is stored");
    },
  },
  {
    id: "edit-escape-cancels",
    kind: "fact",
    fact: "F6",
    describe: "Escape leaves the title as it was",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await edit(page, "Comprar pan", "Otra cosa", "Escape");
      kit.assert.deepEqual(await titles(page), ["Comprar pan"]);
      const editing = await page.evaluate(() => [...document.querySelectorAll("#lista li .edicion")].some((field) => field.getClientRects().length > 0));
      kit.assert.equal(editing, false, "the edit field is gone");
    },
  },
  {
    id: "edit-empty-deletes",
    kind: "fact",
    fact: "F6",
    describe: "saving an empty title deletes the task",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await add(page, "Llamar a Ana");
      await edit(page, "Comprar pan", "", "Enter");
      kit.assert.deepEqual(await titles(page), ["Llamar a Ana"]);
    },
  },
  {
    id: "stable-order",
    kind: "fact",
    fact: "F7",
    describe: "new tasks go last and completing a task keeps its position",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Uno");
      await add(page, "Dos");
      await add(page, "Tres");
      kit.assert.deepEqual(await titles(page), ["Uno", "Dos", "Tres"]);
      await toggle(page, "Uno");
      kit.assert.deepEqual(await titles(page), ["Uno", "Dos", "Tres"]);
      await toggle(page, "Uno");
      await toggle(page, "Tres");
      kit.assert.deepEqual(await titles(page), ["Uno", "Dos", "Tres"]);
      await add(page, "Cuatro");
      kit.assert.deepEqual(await titles(page), ["Uno", "Dos", "Tres", "Cuatro"]);
    },
  },
  {
    id: "title-as-text",
    kind: "fact",
    fact: "F8",
    describe: "markup in a title is shown as text and never runs",
    async run(kit) {
      const page = await open(kit);
      const title = "<img src=x onerror=\"window.__inyectado=1\"><b>hola</b>";
      await add(page, title);
      await page.settle(300);
      kit.assert.deepEqual(await titles(page), [title]);
      kit.assert.equal(await page.evaluate(() => document.querySelectorAll("#lista img, #lista b").length), 0);
      kit.assert.equal(await page.evaluate(() => window.__inyectado === undefined), true);
      await page.reload();
      await page.settle(300);
      kit.assert.equal(await page.evaluate(() => window.__inyectado === undefined && document.querySelectorAll("#lista img").length === 0), true, "also after a reload");
    },
  },
  {
    id: "accessible-names",
    kind: "fact",
    fact: "F9",
    describe: "the new-task field has an accessible name and each task's checkbox and delete button name its title",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Comprar pan");
      await add(page, "Llamar a Ana");
      const [field] = await page.accessibleNames("#nueva-tarea");
      kit.assert.ok(field, "the new-task field has a name");
      const boxes = await page.accessibleNames("#lista li .completar");
      const buttons = await page.accessibleNames("#lista li .borrar");
      for (const [index, title] of ["Comprar pan", "Llamar a Ana"].entries()) {
        kit.assert.ok(boxes[index] && boxes[index].includes(title), `checkbox ${index}: ${boxes[index]}`);
        kit.assert.ok(buttons[index] && buttons[index].includes(title), `delete ${index}: ${buttons[index]}`);
      }
    },
  },
  {
    id: "suite",
    kind: "regression",
    describe: "the project's own test suite passes",
    run(kit) {
      const result = kit.node(["--test"]);
      kit.assert.equal(result.status, 0, result.stdout + result.stderr);
    },
  },
];
