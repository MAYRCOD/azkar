// Полная проверка приложения «Азкары» в настоящем браузере (Chromium через Playwright).
// Запуск: bash tests/run.sh   (скрипт сам поднимет локальный сервер)
// Каждая проверка либо проходит молча, либо добавляет строку в список проблем.

const { chromium } = require("playwright");

const URL = process.argv[2] || "http://localhost:8765/";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const section = name => console.log("•", name);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errs = [];

  async function freshPage(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, ...opts });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(e.message));
    await p.goto(URL);
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.waitForTimeout(400);
    return p;
  }
  const W = (p, ms) => p.waitForTimeout(ms);
  const setMode = async (p, m) => {
    await p.click("#tab-settings"); await p.click("#open-mode"); await W(p, 350);
    await p.click("#mode-" + m); await W(p, 400); await p.click("#tab-home"); await W(p, 200);
  };
  const dupIds = p => p.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map(e => e.id); return ids.length - new Set(ids).size; });
  // прочитать все азкары открытого раздела до конца (карточками)
  async function readAll(p) {
    const n = await p.locator("#track .counter").count();
    for (let i = 0; i < n; i++) {
      const need = +(await p.locator("#counter-" + i + " .num").innerText()).split(" / ")[1];
      for (let k = 0; k < need; k++) await p.click("#counter-" + i);
      await W(p, 1000);
    }
    return n;
  }

  // ---------------------------------------------------------------
  section("Главная и настройки");
  let p = await freshPage();
  check(await p.locator("#go-morning").isVisible() && await p.locator("#go-evening").isVisible(), "нет кнопок утро/вечер");
  await p.click("#tab-settings"); await W(p, 200);
  check(await p.locator("#settings").isVisible(), "настройки не открылись");
  await p.click("#tab-home"); await W(p, 200);
  const counts = await p.evaluate(() => ({ m: AZKAR.filter(z => z.when.includes("morning")).length, e: AZKAR.filter(z => z.when.includes("evening")).length }));
  check(counts.m === 16, `утренних не 16, а ${counts.m}`);
  check(counts.e === 15, `вечерних не 15, а ${counts.e}`);

  section("Оба вида чтения, переключение туда и обратно");
  for (const mode of ["cards", "list", "cards", "list"]) {
    await setMode(p, mode);
    for (const t of ["morning", "evening"]) {
      await p.click("#go-" + t); await W(p, 400);
      const sel = mode === "cards" ? "#track" : "#list-view";
      const c = await p.evaluate(s => [...document.querySelectorAll(s + " .counter .num")].map(e => e.textContent), sel);
      check(c.length > 0 && c.every(x => /^\d+ \/ \d+$/.test(x)), `${mode}/${t}: пустые счётчики`);
      check(await dupIds(p) === 0, `${mode}/${t}: повторяющиеся id`);
      await p.click("#back"); await W(p, 200);
    }
  }

  section("Все утренние и все вечерние до конца");
  await setMode(p, "cards");
  for (const t of ["morning", "evening"]) {
    await p.click("#go-" + t); await W(p, 400);
    await readAll(p);
    check(await p.locator("#pos").innerText() === "Готово", `${t}: не дошли до конца`);
    const fin = await p.locator("#track .final").innerText();
    check(/прочитаны/.test(fin) && !/Да примет|Начать заново/.test(fin), `${t}: лишний текст на финальном экране`);
    await p.click("#track .final .to-home"); await W(p, 300);
    check(await p.locator("#home").isVisible(), "«На главную» не вернула на главную");
  }

  section("Сброс");
  await p.click("#go-morning"); await W(p, 400);
  await p.click("#reset-btn"); await W(p, 350); await p.click("#reset-no"); await W(p, 350);
  check(await p.locator("#pos").innerText() === "Готово", "«Отмена» всё равно сбросила");
  await p.click("#reset-btn"); await W(p, 350); await p.click("#reset-yes"); await W(p, 500);
  check((await p.locator("#pos").innerText()).startsWith("1 из"), "сброс не сработал");
  await p.click("#back"); await p.click("#go-evening"); await W(p, 400);
  check(await p.locator("#pos").innerText() === "Готово", "сброс утренних задел вечерние");
  await p.click("#back"); await W(p, 200);

  section("Список: нажатие считается, транскрипция выключается");
  await setMode(p, "list");
  await p.click("#go-morning"); await W(p, 400);
  await p.click("#counter-1"); await W(p, 200);
  check((await p.locator("#counter-1 .num").innerText()).startsWith("1 /"), "список: нажатие не считается");
  await p.click("#back"); await p.click("#tab-settings"); await p.click("#sw-tr"); await p.click("#tab-home");
  await p.click("#go-morning"); await W(p, 300);
  check(await p.locator(".tr").first().isHidden(), "транскрипция не скрылась");
  await p.context().close();

  // ---------------------------------------------------------------
  section("Счётчик: нажатия, три счётчика, сброс, сохранение, вёрстка");
  {
    const q = await freshPage();
    const num = () => q.locator("#tb-num").innerText();
    await q.click("#tab-tasbih"); await W(q, 400);
    check(await q.locator("#tasbih").isVisible(), "счётчик не открылся");
    check(await q.evaluate(() => document.getElementById("tabbar").dataset.active) === "tasbih", "вкладка счётчика не выделилась");
    check(await num() === "0" && await q.locator("#tb-hint").evaluate(e => !e.classList.contains("gone")), "в начале не 0 или нет подсказки");
    // нажатия в разных местах средней части экрана
    const box = await q.locator("#tb-tap").boundingBox();
    for (let k = 0; k < 40; k++) await q.mouse.click(box.x + 20 + (k * 37) % (box.width - 40), box.y + 20 + (k * 53) % (box.height - 40));
    await W(q, 300);
    check(await num() === "40", "нажатия считаются неверно: " + await num());
    check(await q.locator("#tb-hint").evaluate(e => e.classList.contains("gone")), "подсказка не исчезла после нажатий");
    check(await q.locator("[data-slot='0'] b").innerText() === "40", "в «таблетке» не то число");
    // второй счётчик — свой
    await q.click("[data-slot='1']"); await W(q, 200);
    check(await num() === "0", "второй счётчик не с нуля");
    for (let k = 0; k < 5; k++) await q.click("#tb-tap");
    await q.click("[data-slot='0']"); await W(q, 200);
    check(await num() === "40", "первый счётчик потерял число");
    // сохранение после перезапуска
    await q.reload(); await W(q, 300); await q.click("#tab-tasbih"); await W(q, 300);
    check(await num() === "40" && await q.locator("[data-slot='1'] b").innerText() === "5", "числа не сохранились после перезапуска");
    // сброс только текущего
    await q.click("#tb-reset"); await W(q, 350);
    check(await q.locator("#reset-title").innerText() === "Сбросить счётчик 1?", "неверный заголовок окна сброса");
    await q.click("#reset-no"); await W(q, 350);
    check(await num() === "40", "«Отмена» сбросила счётчик");
    await q.click("#tb-reset"); await W(q, 350); await q.click("#reset-yes"); await W(q, 350);
    check(await num() === "0" && await q.locator("[data-slot='1'] b").innerText() === "5", "сброс сработал неверно");
    // влезает на любой экран, круг не наезжает на соседей
    for (const [w, h] of [[320, 568], [390, 700], [430, 932]]) {
      await q.setViewportSize({ width: w, height: h }); await W(q, 200);
      const r = await q.evaluate(() => {
        const st = document.getElementById("tb-tap").getBoundingClientRect();
        const d = document.querySelector(".tb-dial").getBoundingClientRect();
        const sl = document.getElementById("tb-slots").getBoundingClientRect();
        const bar = document.getElementById("tabbar").getBoundingClientRect();
        return { stageGap: bar.top - st.bottom, top: d.top - sl.bottom, inside: d.bottom <= st.bottom && d.left >= st.left && d.right <= st.right,
                 size: d.width, pageW: document.documentElement.scrollWidth };
      });
      check(r.stageGap >= 0 && r.top >= 0 && r.inside && r.size >= 120 && r.pageW <= w, `${w}×${h}: счётчик не влезает ${JSON.stringify(r)}`);
    }
    // азкары после всего этого работают как прежде
    await q.click("#tab-home"); await q.click("#go-morning"); await W(q, 400);
    await q.click("#counter-0"); await W(q, 200);
    check((await q.locator("#counter-0 .num").innerText()) === "1 / 1", "азкары сломались после счётчика");
    await q.context().close();
  }

  // ---------------------------------------------------------------
  section("Свайп: смах, перетаскивание, «резинка», размытие только на текущей карточке");
  {
    const q = await freshPage({ viewport: { width: 390, height: 844 } });
    const pos = () => q.locator("#pos").innerText();
    const blur = () => q.evaluate(() => [...document.querySelectorAll(".dock")].filter(d => getComputedStyle(d, "::before").backdropFilter !== "none").length);
    const drag = async (x0, step, n, pause = 0) => {
      await q.mouse.move(x0, 300); await q.mouse.down();
      for (let i = 1; i <= n; i++) { await q.mouse.move(x0 + i * step, 300); if (pause) await W(q, pause); }
      if (pause) await W(q, 150);
      await q.mouse.up(); await W(q, 500);
    };
    await q.click("#go-morning"); await W(q, 600);
    check(await blur() === 1, "размытие должно быть ровно у одной карточки сразу после открытия");
    await drag(100, 10, 20);       check(await pos() === "1 из 16", "на первой карточке свайп вправо должен оставлять на месте");
    await drag(300, -5, 10, 40);   check(await pos() === "1 из 16", "медленное короткое движение не должно листать");
    await drag(300, -10, 5);       check(await pos() === "2 из 16", "быстрый смах должен листать вперёд");
    await drag(330, -10, 13, 30);  check(await pos() === "3 из 16", "перетаскивание на треть экрана должно листать");
    await drag(60, 12, 5);         check(await pos() === "2 из 16", "быстрый смах вправо должен листать назад");
    check(await blur() === 1, "после свайпа размытие должно быть ровно у одной карточки");
    await q.click("#counter-1"); await W(q, 300);
    check((await q.locator("#counter-1 .num").innerText()) === "1 / 10", "после свайпа нажатие на счётчик не считается");
    await q.context().close();
  }

  // ---------------------------------------------------------------
  section("Вёрстка на разных экранах: отступы, полоса прокрутки, номера аятов");
  for (const w of [320, 390, 430]) {
    p = await freshPage({ viewport: { width: w, height: 700 } });
    for (const mode of ["cards", "list"]) {
      await p.evaluate(m => localStorage.setItem("azkar-mode", JSON.stringify(m)), mode);
      await p.reload(); await W(p, 300);
      await p.click("#go-morning"); await W(p, 1100);
      const r = await p.evaluate(mode => {
        const vis = document.getElementById("reader").getBoundingClientRect();
        const sc = mode === "cards" ? document.querySelector("#track .slide .scroll") : document.getElementById("list-view");
        let L = 1e9, R = 0;
        (mode === "cards" ? document.querySelector("#track .slide") : sc).querySelectorAll("p, .counter").forEach(e => {
          const rr = e.getBoundingClientRect(); if (rr.width) { L = Math.min(L, rr.left); R = Math.max(R, rr.right); } });
        let broken = 0;
        document.querySelectorAll(".ar .nowrap").forEach(sp => { if (new Set([...sp.getClientRects()].map(x => Math.round(x.top / 10))).size > 1) broken++; });
        return { left: L - vis.left, right: vis.right - R, barHidden: sc.getBoundingClientRect().right > vis.right,
                 enter: document.getElementById("reader").classList.contains("enter"), pageW: document.documentElement.scrollWidth, broken };
      }, mode);
      check(r.left >= 8 && r.right >= 8, `${w}px ${mode}: текст слишком близко к краю`);
      check(r.barHidden, `${w}px ${mode}: полоса прокрутки не спрятана`);
      check(!r.enter, `${w}px ${mode}: анимация появления не снялась`);
      check(r.pageW <= w, `${w}px ${mode}: страница шире экрана`);
      check(r.broken === 0, `${w}px ${mode}: номер аята оторвался от слова`);
      await p.click("#back"); await W(p, 200);
    }
    await p.context().close();
  }

  // ---------------------------------------------------------------
  section("Смена дня в полночь (по времени телефона)");
  {
    const ctx = await browser.newContext({ timezoneId: "Europe/Moscow" });
    const q = await ctx.newPage(); q.on("pageerror", e => errs.push(e.message));
    await q.clock.install({ time: new Date("2026-10-06T22:30:00Z") });   // 01:30 по Москве
    await q.goto(URL); await q.evaluate(() => localStorage.clear()); await q.reload(); await W(q, 300);
    check(await q.evaluate(() => KEY) === "azkar-2026-10-07", "ключ дня взят не по местному времени");
    await q.click("#go-morning"); await W(q, 300); await q.click("#counter-0"); await W(q, 900);
    await q.clock.setSystemTime(new Date("2026-10-07T21:10:00Z"));      // 00:10 следующего дня
    await q.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await W(q, 400);
    check((await q.locator("#counter-0 .num").innerText()) === "0 / 1", "после полуночи счётчики не обнулились");
    await ctx.close();
  }

  // ---------------------------------------------------------------
  section("Установка на телефон и работа без интернета");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const q = await ctx.newPage(); q.on("pageerror", e => errs.push(e.message));
    await q.goto(URL); await W(q, 1500);
    const name = await q.evaluate(async () => { const r = await fetch(document.querySelector("link[rel=manifest]").href); return r.ok ? (await r.json()).name : null; });
    check(name === "Азкары", "manifest не загрузился");
    const icons = await q.evaluate(async () => {
      const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(0); i.src = src; });
      return { apple: await load(document.querySelector("link[rel=apple-touch-icon]").href),
               i192: await load("icon-192.png"), i512: await load("icon-512.png") };
    });
    check(icons.apple === 180 && icons.i192 === 192 && icons.i512 === 512, "иконки не загрузились или неверного размера: " + JSON.stringify(icons));
    check(await q.evaluate(async () => !!(await navigator.serviceWorker.ready).active), "офлайн-скрипт не включился");
    await q.reload(); await W(q, 800);
    await ctx.setOffline(true); await q.reload(); await W(q, 800);
    check(await q.locator("#go-morning").isVisible(), "без интернета не открылось");
    await ctx.close();
  }

  await browser.close();
  check(errs.length === 0, "ошибки JavaScript: " + errs.join("; "));
  console.log(fails.length ? "\nПРОБЛЕМЫ:\n - " + fails.join("\n - ") : "\nВСЁ В ПОРЯДКЕ");
  process.exit(fails.length ? 1 : 0);
})();
