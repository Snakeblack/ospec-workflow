"use strict";

// Hidden checks for receta-spa. They never enter the agent's workspace. Each
// one opens the delivered index.html in its own headless browser (a fresh
// profile, so localStorage starts empty) and drives it as a user would,
// through the selectors the seed's README publishes.

let navigation = 0;

async function open(kit) {
  const page = await kit.page();
  await page.open();
  await page.settle();
  return page;
}

async function openAt(page, hash = "") {
  navigation += 1;
  await page.open(`index.html?n=${navigation}${hash}`);
  await page.settle();
}

async function reload(page) {
  await page.reload();
  await page.settle();
}

async function fill(page, selector, text) {
  await page.focus(selector);
  await page.evaluate((sel) => {
    const field = document.querySelector(sel);
    field.focus();
    field.value = "";
  }, selector);
  if (text !== "") await page.type(text);
}

async function add(page, nombre, cantidad, unidad = "g") {
  await fill(page, "#nombre", nombre);
  await fill(page, "#cantidad", cantidad);
  const chosen = await page.evaluate((unit) => {
    const select = document.querySelector("#unidad");
    if (![...select.options].some((option) => option.value === unit)) return false;
    select.value = unit;
    return select.value === unit;
  }, unidad);
  if (!chosen) throw new Error(`unit ${unidad} is not an option`);
  await page.click("#anadir");
  await page.settle();
}

async function setServings(page, text) {
  await fill(page, "#raciones", text);
  await page.press("Enter");
  await page.settle();
}

function rows(page) {
  return page.evaluate(() => [...document.querySelectorAll("#lista li")].map((li) => ({
    nombre: li.querySelector(".nombre") ? li.querySelector(".nombre").textContent : null,
    cantidad: li.querySelector(".cantidad") ? li.querySelector(".cantidad").textContent : null,
    unidad: li.querySelector(".unidad") ? li.querySelector(".unidad").textContent : null,
  })));
}

const resumen = (page) => page.evaluate(() => {
  const element = document.querySelector("#resumen");
  return element ? element.textContent : null;
});

const aviso = (page) => page.evaluate(() => {
  const element = document.querySelector("#aviso");
  return element ? element.textContent : null;
});

const hashOf = (page) => page.evaluate(() => location.hash);

function stored(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cocina.v2");
    return raw == null ? null : JSON.parse(raw);
  });
}

function quiet(page) {
  return page.errors.length === 0 ? "" : page.errors.join("\n");
}

module.exports = [
  {
    id: "page",
    kind: "acceptance",
    describe: "an ingredient can be added and is shown with its unit",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Harina", "100", "g");
      kit.assert.deepEqual(await rows(page), [{ nombre: "Harina", cantidad: "100", unidad: "g" }]);
      kit.assert.equal(quiet(page), "");
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
  {
    id: "limits",
    kind: "fact",
    fact: "F1",
    describe: "names are trimmed to 40 characters and amounts are positive numbers with at most two decimals",
    async run(kit) {
      const page = await open(kit);
      await add(page, "  Sal ", "1");
      kit.assert.deepEqual(await rows(page), [{ nombre: "Sal", cantidad: "1", unidad: "g" }]);

      await add(page, "   ", "1");
      await add(page, "", "1");
      kit.assert.equal((await rows(page)).length, 1);

      const forty = "a".repeat(40);
      await add(page, forty, " 2 ");
      await add(page, "b".repeat(41), "1");
      const names = (await rows(page)).map((row) => row.nombre);
      kit.assert.deepEqual(names, ["Sal", forty]);

      await add(page, "Pimienta", "0");
      await add(page, "Pimienta", "-1");
      await add(page, "Pimienta", "");
      await add(page, "Pimienta", "1,234");
      await add(page, "Pimienta", "abc");
      kit.assert.equal((await rows(page)).length, 2);

      await add(page, "Pimienta", "1.23", "ml");
      await add(page, "Agua", "2", "ml");
      await add(page, "Huevo", "3", "ud");
      kit.assert.deepEqual(await rows(page), [
        { nombre: "Sal", cantidad: "1", unidad: "g" },
        { nombre: forty, cantidad: "2", unidad: "g" },
        { nombre: "Pimienta", cantidad: "1,23", unidad: "ml" },
        { nombre: "Agua", cantidad: "2", unidad: "ml" },
        { nombre: "Huevo", cantidad: "3", unidad: "ud" },
      ]);
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "duplicate",
    kind: "fact",
    fact: "F2",
    describe: "a trimmed case-insensitive name is not added twice",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Harina", "100", "g");
      await add(page, " harina ", "50", "ml");
      await add(page, "HARINA", "1", "ud");
      kit.assert.deepEqual(await rows(page), [{ nombre: "Harina", cantidad: "100", unidad: "g" }]);
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "storage",
    kind: "fact",
    fact: "F3",
    describe: "the recipe is stored under cocina.v2 and corrupt data starts empty",
    async run(kit) {
      const page = await open(kit);
      kit.assert.equal(await resumen(page), "Para 4 raciones");
      kit.assert.deepEqual(await stored(page), { raciones: 4, ingredientes: [] });
      kit.assert.equal(await page.evaluate(() => localStorage.getItem("tareas.v1")), null);

      await add(page, "Sal", "1", "g");
      await reload(page);
      kit.assert.deepEqual(await rows(page), [{ nombre: "Sal", cantidad: "1", unidad: "g" }]);
      kit.assert.equal((await stored(page)).raciones, 4);

      await page.evaluate(() => localStorage.setItem("cocina.v2", "{"));
      await reload(page);
      kit.assert.deepEqual(await rows(page), []);
      kit.assert.equal(await resumen(page), "Para 4 raciones");
      await add(page, "Sal", "1");
      kit.assert.equal((await rows(page)).length, 1);

      await page.evaluate(() => localStorage.setItem("cocina.v2", JSON.stringify({
        raciones: 8,
        ingredientes: [{ nombre: "Sal", cantidad: 1, unidad: "kg" }],
      })));
      await reload(page);
      kit.assert.deepEqual(await rows(page), []);
      kit.assert.equal(await resumen(page), "Para 4 raciones");

      await page.evaluate(() => localStorage.setItem("cocina.v2", JSON.stringify({ raciones: 0, ingredientes: [] })));
      await reload(page);
      kit.assert.equal(await resumen(page), "Para 4 raciones");
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "wording",
    kind: "fact",
    fact: "F4",
    describe: "servings use the Spanish singular and amounts drop trailing zeros",
    async run(kit) {
      const page = await open(kit);
      kit.assert.equal(await resumen(page), "Para 4 raciones");
      await setServings(page, "1");
      kit.assert.equal(await resumen(page), "Para 1 ración");
      await setServings(page, "4");
      await add(page, "Azucar", "1,50");
      await add(page, "Agua", "2");
      await add(page, "Sal", "1,5");
      const shown = (await rows(page)).map((row) => row.cantidad);
      kit.assert.deepEqual(shown, ["1,5", "2", "1,5"]);
      const text = await page.evaluate(() => document.querySelector("#lista").textContent);
      kit.assert.equal(text.includes("1,50") || text.includes("2,00") || text.includes("1.5"), false, text);
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "url",
    kind: "fact",
    fact: "F5",
    describe: "a valid servings hash wins, and an invalid hash or field leaves servings alone",
    async run(kit) {
      const page = await open(kit);
      await openAt(page);
      kit.assert.equal(await hashOf(page), "");
      kit.assert.equal(await resumen(page), "Para 4 raciones");

      await openAt(page, "#/raciones/6");
      kit.assert.equal(await resumen(page), "Para 6 raciones");
      kit.assert.equal(await hashOf(page), "#/raciones/6");
      kit.assert.equal((await stored(page)).raciones, 6);

      await page.evaluate(() => localStorage.setItem("cocina.v2", JSON.stringify({ raciones: 8, ingredientes: [] })));
      await openAt(page, "#/nope");
      kit.assert.equal(await resumen(page), "Para 8 raciones");
      kit.assert.equal(await hashOf(page), "#/nope");
      kit.assert.equal((await stored(page)).raciones, 8);

      await setServings(page, "25");
      kit.assert.equal(await resumen(page), "Para 8 raciones");
      kit.assert.equal(await hashOf(page), "#/nope");

      await setServings(page, "6");
      kit.assert.equal(await resumen(page), "Para 6 raciones");
      kit.assert.equal(await hashOf(page), "#/raciones/6");

      for (const bad of ["0", "1.5", "06", ""]) {
        await setServings(page, bad);
        kit.assert.equal(await resumen(page), "Para 6 raciones", bad);
        kit.assert.equal(await hashOf(page), "#/raciones/6", bad);
      }

      await openAt(page, "#/raciones/01");
      kit.assert.equal(await resumen(page), "Para 6 raciones");
      await openAt(page, "#/raciones/25");
      kit.assert.equal(await resumen(page), "Para 6 raciones");
      await openAt(page, "#/raciones/24");
      kit.assert.equal(await resumen(page), "Para 24 raciones");
      kit.assert.equal(await hashOf(page), "#/raciones/24");
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "names",
    kind: "fact",
    fact: "F6",
    describe: "every control has the accessible name a careful reader would give it",
    async run(kit) {
      const page = await open(kit);
      kit.assert.deepEqual(await page.accessibleNames("#nombre"), ["Nombre del ingrediente"]);
      kit.assert.deepEqual(await page.accessibleNames("#cantidad"), ["Cantidad"]);
      kit.assert.deepEqual(await page.accessibleNames("#unidad"), ["Unidad"]);
      kit.assert.deepEqual(await page.accessibleNames("#anadir"), ["Añadir ingrediente"]);
      kit.assert.deepEqual(await page.accessibleNames("#raciones"), ["Raciones"]);
      await add(page, "Harina", "100");
      kit.assert.deepEqual(await page.accessibleNames("#lista li .borrar"), ["Quitar Harina"]);
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "save-error",
    kind: "fact",
    fact: "F7",
    describe: "a failed write stays usable, shows the exact notice, and clears it after a later save",
    async run(kit) {
      const page = await open(kit);
      await page.evaluate(() => {
        window.__alerted = false;
        window.alert = () => { window.__alerted = true; };
        const original = localStorage.setItem.bind(localStorage);
        localStorage.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
        window.__restoreStorage = () => { localStorage.setItem = original; };
      });
      await add(page, "Harina", "100");
      kit.assert.deepEqual(await rows(page), [{ nombre: "Harina", cantidad: "100", unidad: "g" }]);
      kit.assert.equal(await aviso(page), "No se pudo guardar");
      kit.assert.equal(await page.evaluate(() => window.__alerted), false);
      kit.assert.equal(quiet(page), "");

      await page.evaluate(() => window.__restoreStorage());
      await setServings(page, "2");
      kit.assert.equal(await aviso(page), "");
      kit.assert.equal(await resumen(page), "Para 2 raciones");
      const saved = await stored(page);
      kit.assert.equal(saved.raciones, 2);
      kit.assert.equal(saved.ingredientes.length, 1);
      kit.assert.equal(saved.ingredientes[0].nombre, "Harina");
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "order-scale",
    kind: "fact",
    fact: "F8",
    describe: "new ingredients append, deletion keeps order, and scaling rounds half up from the base of 4",
    async run(kit) {
      const page = await open(kit);
      await add(page, "Harina", "100");
      await add(page, "Sal", "1");
      await add(page, "Azucar", "0,1");
      kit.assert.deepEqual(await rows(page), [
        { nombre: "Harina", cantidad: "100", unidad: "g" },
        { nombre: "Sal", cantidad: "1", unidad: "g" },
        { nombre: "Azucar", cantidad: "0,1", unidad: "g" },
      ]);

      await setServings(page, "1");
      kit.assert.deepEqual((await rows(page)).map((row) => row.cantidad), ["25", "0,25", "0,03"]);

      await page.click("#lista li .borrar", 1);
      await page.settle();
      kit.assert.deepEqual(await rows(page), [
        { nombre: "Harina", cantidad: "25", unidad: "g" },
        { nombre: "Azucar", cantidad: "0,03", unidad: "g" },
      ]);

      await setServings(page, "4");
      kit.assert.deepEqual(await rows(page), [
        { nombre: "Harina", cantidad: "100", unidad: "g" },
        { nombre: "Azucar", cantidad: "0,1", unidad: "g" },
      ]);
      kit.assert.equal(quiet(page), "");
    },
  },
  {
    id: "text",
    kind: "fact",
    fact: "F9",
    describe: "an ingredient name is shown as text and does not run",
    async run(kit) {
      const page = await open(kit);
      const payload = "<img src=x onerror=alert(1)>";
      await page.evaluate(() => {
        window.__alerted = false;
        window.alert = () => { window.__alerted = true; };
      });
      await add(page, payload, "1");
      kit.assert.equal(await page.evaluate(() => document.querySelector("#lista li .nombre").textContent), payload);
      kit.assert.equal(await page.evaluate(() => document.querySelectorAll("#lista img").length), 0);
      kit.assert.equal(await page.evaluate(() => window.__alerted), false);
      kit.assert.equal(quiet(page), "");
    },
  },
];
