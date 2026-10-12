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
  const counts = await p.evaluate(() => ({
    m: AZKAR.filter(z => z.when.includes("morning") && !z.full).length, e: AZKAR.filter(z => z.when.includes("evening") && !z.full).length,
    mf: AZKAR.filter(z => z.when.includes("morning")).length, ef: AZKAR.filter(z => z.when.includes("evening")).length,
    dup: AZKAR.length - new Set(AZKAR.map(z => z.id)).size }));
  check(counts.m === 17, `основных утренних не 17, а ${counts.m}`);
  check(counts.e === 16, `основных вечерних не 16, а ${counts.e}`);
  check(counts.mf === 17 + 6 && counts.ef === 16 + 5, `всего утренних (основные + только полные) не 23 или вечерних не 21: ${counts.mf}/${counts.ef}`);
  check(await p.evaluate(() => FULL_ORDER.morning.join(",")) === "m-ikhlas,m-falaq,m-nas,m-sayyid,m-adada,m-hasbi,m-bismillah,m-radiitu,m-bika,m-hayyu,m-fitra,m-asbahna,m-alim,f-14,m-subhan100,m-kursi,f-17,f-18,f-19,f-20,f-21,m-afiya", "полные утренние: не тот порядок, что в видео");
  check(await p.evaluate(() => AZKAR.filter(z => z.when.includes("morning") && !z.full && z.id !== "m-tahlil10").every(z => FULL_ORDER.morning.includes(z.id))), "не все основные утренние входят в полные");
  check(await p.evaluate(() => { const a = AZKAR.find(z => z.id === "m-tahlil10"), b = AZKAR.find(z => z.id === "f-14"); return b.times === 100 && a.times === 10 && ["ar","ru","tr","src"].every(k => a[k] === b[k]); }), "«Ля иляха илля-Ллах» в полных: не 100 раз или текст отличается от основных");
  check(await p.evaluate(() => FULL_ORDER.evening.join(",")) === "e-ikhlas,e-falaq,e-nas,e-sayyid,e-hasbi,e-bismillah,e-radiitu,e-bika,fe-ushhiduka,e-hayyu,fe-maamsa,e-alim,fe-tahlil100,e-subhan100,e-kursi,fe-baqara285,fe-baqara286,f-19,f-20,f-21,e-amsayna,e-kalimat,e-afiya", "полные вечерние: не тот порядок, что в видео");
  check(await p.evaluate(() => AZKAR.filter(z => z.when.includes("evening") && !z.full && z.id !== "e-tahlil10").every(z => FULL_ORDER.evening.includes(z.id))), "не все основные вечерние входят в полные");
  check(await p.evaluate(() => AZKAR.filter(z => z.when.includes("evening") && !z.full).map(z => z.id).join(",")) === "e-ikhlas,e-falaq,e-nas,e-sayyid,e-hasbi,e-bismillah,e-radiitu,e-bika,e-hayyu,e-alim,e-tahlil10,e-subhan100,e-kursi,e-amsayna,e-kalimat,e-afiya", "основные вечерние не в порядке полных");
  check(counts.dup === 0, "повторяются id азкаров");

  section("Основные и полные: переключатель, число азкаров, чтение, отметка «прочитано», сохранение");
  {
    check(await p.locator("#set-switch").isVisible(), "нет переключателя «Основные | Полные»");
    check((await p.locator('.set-opt[aria-checked="true"]').innerText()) === "Основные", "по умолчанию не «Основные»");
    check((await p.locator("#count-morning").innerText()) === "17 азкаров" && (await p.locator("#count-evening").innerText()) === "16 азкаров", "неверное число на кнопках (основные)");
    await p.click('.set-opt[data-set="full"]'); await W(p, 500);
    check((await p.locator("#count-morning").innerText()) === "22 азкара" && (await p.locator("#count-evening").innerText()) === "23 азкара", "неверное число на кнопках (полные): " + await p.locator("#count-morning").innerText() + " / " + await p.locator("#count-evening").innerText());
    // таблетка переехала вправо
    const pill = await p.evaluate(() => getComputedStyle(document.getElementById("set-switch"), "::before").transform);
    check(pill !== "none", "подложка переключателя не переехала");
    await p.click("#go-morning"); await W(p, 800);
    check((await p.locator("#pos").innerText()).endsWith("из 22"), "в полных утренних не 22 карточки: " + await p.locator("#pos").innerText());
    // аят аль-Курси есть, номер аята не оторван
    check(await p.evaluate(() => items[15].id === "m-kursi" && items[15].name === "Аят аль-Курси" && items[0].id === "m-ikhlas" && items[21].id === "m-afiya"), "в полных утренних не тот список (16-й должен быть аят аль-Курси)");
    await p.click("#back"); await W(p, 300);
    // выбор сохраняется после перезапуска
    await p.reload(); await W(p, 400);
    check((await p.locator('.set-opt[aria-checked="true"]').innerText()) === "Полные", "выбор набора не сохранился");
    // основные прочитаны → галочка только в основных
    await p.click('.set-opt[data-set="main"]'); await W(p, 400);
    await p.evaluate(() => { const c = {}; AZKAR.filter(z => z.when.includes("morning") && !z.full).forEach(z => c["morning:" + z.id] = z.times); localStorage.setItem(KEY, JSON.stringify(c)); counts = c; updateHome(); });
    check(await p.evaluate(() => document.getElementById("go-morning").classList.contains("done")), "основные прочитаны, а галочки нет");
    await p.click('.set-opt[data-set="full"]'); await W(p, 400);
    check(!(await p.evaluate(() => document.getElementById("go-morning").classList.contains("done"))), "в полных галочка, хотя прочитаны не все");
    await p.click("#go-morning"); await W(p, 800);
    check((await p.locator("#pos").innerText()).startsWith("14 из 22"), "прогресс общий: после основных полные должны продолжиться с «Ля иляха» ×100: " + await p.locator("#pos").innerText());
    await p.click("#back"); await W(p, 300);
    await p.click('.set-opt[data-set="main"]'); await W(p, 300);
    await p.evaluate(() => { localStorage.removeItem(KEY); counts = {}; updateHome(); });
    // на любом экране верх главной (время намазов) не обрезан, а кнопки видны или до них можно долистать
    for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
      for (const s of ["main", "full"]) {
        await p.setViewportSize({ width: w, height: h }); await p.click(`.set-opt[data-set="${s}"]`); await W(p, 300);
        const r = await p.evaluate(() => { const home = document.getElementById("home");
          return { top: document.getElementById("ptimes").getBoundingClientRect().top - home.getBoundingClientRect().top + home.scrollTop,
                   pageW: document.documentElement.scrollWidth }; });
        check(r.top >= 0, `${w}×${h} ${s}: верх главной обрезан (${Math.round(r.top)})`);
        check(r.pageW <= w, `${w}×${h} ${s}: главная шире экрана`);
      }
    }
    await p.setViewportSize({ width: 390, height: 780 }); await p.click('.set-opt[data-set="main"]'); await W(p, 300);
  }

  section("Аят дня: 30 аятов, меняется по дате, раскрывается по нажатию");
  {
    const info = await p.evaluate(() => ({
      n: AYAT.length, refs: new Set(AYAT.map(a => a.ref)).size,
      empty: AYAT.filter(a => !a.ar || !a.ru || !a.ref).length,
      // номер аята в конце каждого аята — «[١٥٢]»
      nums: AYAT.every(a => /\[[\u0660-\u0669]+\]$/.test(a.ar)),
      // соседние дни — разные аяты, через 30 дней — тот же
      d1: ayahOfDay(new Date(2026, 9, 11)).ref, d2: ayahOfDay(new Date(2026, 9, 12)).ref, d31: ayahOfDay(new Date(2026, 10, 10)).ref,
      // ночь и вечер одного дня — один аят (считаем по местной дате, не по Гринвичу)
      early: ayahOfDay(new Date(2026, 9, 11, 0, 5)).ref, late: ayahOfDay(new Date(2026, 9, 11, 23, 55)).ref,
      // все 30 встречаются за 30 дней подряд
      cycle: new Set([...Array(30)].map((_, i) => ayahOfDay(new Date(2026, 9, 11 + i)).ref)).size,
      shown: document.getElementById("ayah-ref").textContent, today: "Сура " + ayahOfDay().ref,
      blob: document.getElementById("ayah-ar").innerHTML.includes("\u06DF") }));
    check(info.n === 30 && info.refs === 30 && info.empty === 0, "аятов дня не 30 или есть пустые/повторы: " + JSON.stringify(info));
    check(info.nums, "не у всех аятов дня есть номер в конце");
    check(info.d1 !== info.d2 && info.d1 === info.d31, "аят не меняется по дням или цикл не 30 дней");
    check(info.early === info.late, "в течение одного дня аят меняется");
    check(info.cycle === 30, "за 30 дней показываются не все аяты: " + info.cycle);
    check(info.shown === info.today, "на главной не сегодняшний аят: " + info.shown);
    check(!info.blob, "знак немого алифа не заменён — будет клякса");
    check(!(await p.locator("#ayah-ar").isVisible()), "арабский аята виден в свёрнутом виде");
    await p.click("#ayah-day"); await W(p, 250);
    check(await p.locator("#ayah-ar").isVisible() && (await p.getAttribute("#ayah-day", "aria-expanded")) === "true", "аят дня не раскрылся по нажатию");
    await p.click("#ayah-day"); await W(p, 250);
    check(!(await p.locator("#ayah-ar").isVisible()), "аят дня не свернулся обратно");
  }

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

  section("Все утренние и все вечерние до конца, отметки «прочитано» на главной");
  const done = t => p.evaluate(t => document.getElementById("go-" + t).classList.contains("done"), t);
  const badge = t => p.evaluate(t => getComputedStyle(document.querySelector("#go-" + t + " .done-badge")).opacity, t);
  check(!(await done("morning")) && !(await done("evening")), "отметка «прочитано» есть, хотя ничего не прочитано");
  await setMode(p, "cards");
  for (const t of ["morning", "evening"]) {
    await p.click("#go-" + t); await W(p, 400);
    await readAll(p);
    check(await p.locator("#pos").innerText() === "Готово", `${t}: не дошли до конца`);
    const fin = await p.locator("#track .final").innerText();
    check(/прочитаны/.test(fin) && !/Да примет|Начать заново/.test(fin), `${t}: лишний текст на финальном экране`);
    await p.click("#track .final .to-home"); await W(p, 600);
    check(await p.locator("#home").isVisible(), "«На главную» не вернула на главную");
    check(await done(t) && await badge(t) === "1", `${t}: после прочтения нет отметки на главной`);
    if (t === "morning") check(!(await done("evening")), "отметка у вечерних появилась после утренних");
  }
  await p.reload(); await W(p, 600);
  check(await done("morning") && await done("evening"), "отметки пропали после перезапуска");

  section("Сброс");
  await p.click("#go-morning"); await W(p, 400);
  await p.click("#reset-btn"); await W(p, 350); await p.click("#reset-no"); await W(p, 350);
  check(await p.locator("#pos").innerText() === "Готово", "«Отмена» всё равно сбросила");
  await p.click("#reset-btn"); await W(p, 350); await p.click("#reset-yes"); await W(p, 500);
  check((await p.locator("#pos").innerText()).startsWith("1 из"), "сброс не сработал");
  await p.click("#back"); await p.click("#go-evening"); await W(p, 400);
  check(await p.locator("#pos").innerText() === "Готово", "сброс утренних задел вечерние");
  await p.click("#back"); await W(p, 200);
  check(!(await done("morning")) && await done("evening"), "после сброса утренних отметки неверные");

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
  section("Тема: светлая, тёмная, как в системе");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: "dark" });
    const q = await ctx.newPage(); q.on("pageerror", e => errs.push(e.message));
    await q.goto(URL); await q.evaluate(() => localStorage.clear()); await q.reload(); await W(q, 400);
    const th = () => q.evaluate(() => document.documentElement.dataset.theme);
    const bg = sel => q.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
    const dark = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return r + g + b < 150; };
    check(await th() === "dark", "по умолчанию тема не следует за тёмной системой");
    check(dark(await bg("body")) && dark(await bg("#go-morning")) && dark(await bg("#tabbar")), "в тёмной теме остались светлые фоны");
    // все экраны в тёмной теме — без светлых пятен
    for (const go of [["#tab-settings", ".rows"], ["#tab-tasbih", ".tb-face"]]) {
      await q.click(go[0]); await W(q, 300);
      check(dark(await bg(go[1])), `тёмная тема: светлый фон у ${go[1]}`);
    }
    await q.click("#tab-home"); await q.click("#go-morning"); await W(q, 500);
    check(dark(await bg("#counter-0")), "тёмная тема: светлый счётчик");
    await q.click("#back"); await W(q, 200);
    // выбрать светлую при тёмной системе
    await q.click("#tab-settings"); await q.click("#open-theme"); await W(q, 400);
    check(await q.locator("#theme-system").getAttribute("aria-checked") === "true", "галочка не на «Как в системе»");
    await q.click("#theme-light"); await W(q, 500);
    check(await th() === "light" && !dark(await bg("body")), "светлая тема не включилась");
    check(await q.locator("#theme-sheet").isHidden() && await q.locator("#theme-value").innerText() === "Светлая", "окно темы не закрылось или подпись не та");
    // сохраняется после перезапуска
    await q.reload(); await W(q, 300);
    check(await th() === "light", "светлая тема не сохранилась");
    // тёмная при светлой системе
    await q.emulateMedia({ colorScheme: "light" });
    await q.click("#tab-settings"); await q.click("#open-theme"); await W(q, 400); await q.click("#theme-dark"); await W(q, 500);
    check(await th() === "dark", "тёмная тема не включилась при светлой системе");
    // «как в системе» следует за переключением телефона на ходу
    await q.click("#open-theme"); await W(q, 400); await q.click("#theme-system"); await W(q, 500);
    check(await th() === "light", "«как в системе» не взяла светлую систему");
    await q.emulateMedia({ colorScheme: "dark" }); await W(q, 200);
    check(await th() === "dark", "«как в системе» не переключилась вслед за телефоном");
    check(await q.evaluate(() => document.querySelector('meta[name="theme-color"]').content) === "#0e1310", "цвет строки состояния не тёмный");
    await ctx.close();
  }

  // ---------------------------------------------------------------
  section("Размер текста: ползунки, образец, азкары, сохранение, «Как было»");
  {
    const q = await freshPage();
    const fs = sel => q.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize), sel);
    const slide = (id, v) => q.evaluate(([id, v]) => { const r = document.getElementById(id); r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); }, [id, v]);
    await q.click("#tab-settings"); await W(q, 300);
    check(await q.locator("#size-value").innerText() === "Обычный", "по умолчанию размер не «Обычный»");
    await q.click("#open-size"); await W(q, 400);
    check(await q.locator("#size-sheet").isVisible(), "окно размера не открылось");
    check(await q.locator("#size-reset").isDisabled(), "«Как было» активна при обычном размере");
    await slide("size-ar", 1.5); await slide("size-tx", 1.2); await W(q, 100);
    check(Math.abs(await fs(".size-preview .ar") - 42) < 0.5, "образец арабского не увеличился");
    check(Math.abs(await fs(".size-preview .ru") - 15.5 * 1.2) < 0.5, "образец перевода не увеличился");
    check(await q.locator("#size-ar-out").innerText() === "150%", "не показан процент");
    // ползунок тянется настоящей мышью
    const box = await q.locator("#size-tx").boundingBox();
    await q.mouse.move(box.x + box.width - 3, box.y + box.height / 2); await q.mouse.down(); await q.mouse.up(); await W(q, 100);
    check(await q.locator("#size-tx-out").innerText() === "160%", "ползунок не двигается пальцем");
    await slide("size-tx", 1.2);
    await q.mouse.click(5, 5); await W(q, 400);
    check(await q.locator("#size-sheet").isHidden(), "окно размера не закрылось нажатием мимо");
    check(await q.locator("#size-value").innerText() === "150% · 120%", "в настройках не тот размер: " + await q.locator("#size-value").innerText());
    // в азкарах, в обоих видах, и после перезапуска
    for (const m of ["cards", "list"]) {
      await q.evaluate(m => localStorage.setItem("azkar-mode", JSON.stringify(m)), m);
      await q.reload(); await W(q, 300);
      await q.click("#go-morning"); await W(q, 500);
      const box = m === "cards" ? "#track" : "#list-view";
      check(Math.abs(await fs(box + " .ar") - 42) < 0.5 && Math.abs(await fs(box + " .ru") - 18.6) < 0.5 && Math.abs(await fs(box + " .tr") - 17.4) < 0.5,
        `${m}: размер в азкарах не применился или не сохранился`);
      await q.click("#back"); await W(q, 200);
    }
    // «Как было»
    await q.click("#tab-settings"); await q.click("#open-size"); await W(q, 400);
    await q.click("#size-reset"); await W(q, 100);
    check(await q.locator("#size-ar-out").innerText() === "100%" && await q.locator("#size-tx-out").innerText() === "100%", "«Как было» не вернула 100%");
    await q.mouse.click(5, 5); await W(q, 400);
    check(await q.locator("#size-value").innerText() === "Обычный" && Math.abs(await fs(".size-preview .ar") - 28) < 0.5, "после «Как было» размер не обычный");
    // окно влезает на маленький экран
    await q.setViewportSize({ width: 320, height: 568 }); await q.click("#open-size"); await W(q, 400);
    const fit = await q.evaluate(() => { const r = document.querySelector("#size-sheet .sheet").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
    check(fit, "окно размера не влезает на маленький экран");
    await q.context().close();
  }

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
    check((await q.locator("#counter-0 .num").innerText()) === "1 / 3", "азкары сломались после счётчика");
    await q.context().close();
  }

  // ---------------------------------------------------------------
  section("Свайп: смах, перетаскивание, «резинка», настоящие касания, размытие не пропадает");
  {
    const q = await freshPage({ viewport: { width: 390, height: 844 } });
    const pos = () => q.locator("#pos").innerText();
    // сколько видимых карточек с размытием и сколько вообще видимых (далёкие скрыты классом far)
    const blurState = () => q.evaluate(() => {
      const vis = [...document.querySelectorAll("#track .slide")].filter(s => getComputedStyle(s).visibility !== "hidden");
      const withBlur = vis.filter(s => { const d = s.querySelector(".dock"); return d && getComputedStyle(d, "::before").backdropFilter !== "none"; });
      return { visible: vis.length, docks: vis.filter(s => s.querySelector(".dock")).length, blurred: withBlur.length };
    });
    const drag = async (x0, step, n, pause = 0) => {
      await q.mouse.move(x0, 300); await q.mouse.down();
      for (let i = 1; i <= n; i++) { await q.mouse.move(x0 + i * step, 300); if (pause) await W(q, pause); }
      if (pause) await W(q, 150);
      await q.mouse.up(); await W(q, 500);
    };
    await q.click("#go-morning"); await W(q, 600);
    {
      const b = await blurState();
      check(b.visible === 2, "на первой карточке видны только она и соседняя, а не все: " + b.visible);
      check(b.blurred === b.docks, "размытие должно быть у всех видимых карточек сразу после открытия");
    }
    await drag(100, 10, 20);       check(await pos() === "1 из 17", "на первой карточке свайп вправо должен оставлять на месте");
    await drag(300, -5, 10, 40);   check(await pos() === "1 из 17", "медленное короткое движение не должно листать");
    await drag(300, -10, 5);       check(await pos() === "2 из 17", "быстрый смах должен листать вперёд");
    await drag(330, -10, 13, 30);  check(await pos() === "3 из 17", "перетаскивание на треть экрана должно листать");
    await drag(60, 12, 5);         check(await pos() === "2 из 17", "быстрый смах вправо должен листать назад");
    {
      const b = await blurState();
      check(b.visible === 3, "в середине видны текущая и две соседние: " + b.visible);
      check(b.blurred === b.docks, "после свайпа размытие должно остаться у всех видимых карточек");
    }
    await q.click("#counter-1"); await W(q, 300);
    check((await q.locator("#counter-1 .num").innerText()) === "1 / 3", "после свайпа нажатие на счётчик не считается");
    await q.context().close();

    // Настоящие касания (как на iPhone). Мышь этого не проверяет: у неё нет touch-action.
    // Раньше браузер отменял жест после первого движения (pointercancel), и карточка не ехала за пальцем.
    const t = await freshPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const cdp = await t.context().newCDPSession(t);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await t.click("#go-morning");
    // сразу после открытия: у экрана не должно быть проявления, иначе размытие внизу появится с опозданием
    {
      const o = await t.evaluate(() => { const r = document.getElementById("reader"); const cs = getComputedStyle(r); return { anim: cs.animationName, opacity: cs.opacity, blur: getComputedStyle(document.querySelector(".slide.active .dock"), "::before").backdropFilter }; });
      check(o.anim === "none" && o.opacity === "1", "экран чтения должен появляться сразу, без проявления: " + JSON.stringify(o));
      check(o.blur !== "none", "размытие должно быть с первого кадра после открытия");
    }
    await W(t, 600);
    await t.evaluate(() => {
      window.__ev = [];
      for (const n of ["pointerdown", "pointermove", "pointerup", "pointercancel"])
        document.getElementById("viewport").addEventListener(n, () => window.__ev.push(n));
    });
    const touchSwipe = async (x0, y0, dxTotal, steps = 12) => {
      await t.evaluate(() => { window.__ev = []; });
      await touch("touchStart", x0, y0);
      let midClass = "", midBlur = null;
      for (let i = 1; i <= steps; i++) {
        await touch("touchMove", x0 + dxTotal * i / steps, y0); await W(t, 16);
        if (i === Math.floor(steps / 2)) {
          midClass = await t.evaluate(() => document.getElementById("track").className);
          midBlur = await t.evaluate(() => { const d = document.querySelector(".slide.active .dock"); return getComputedStyle(d, "::before").backdropFilter; });
        }
      }
      const cancelled = await t.evaluate(() => window.__ev.includes("pointercancel"));
      await touch("touchEnd"); await W(t, 700);
      return { midClass, midBlur, cancelled };
    };
    const tpos = () => t.locator("#pos").innerText({ timeout: 3000 }).catch(() => "(нет счётчика позиции)");

    let r = await touchSwipe(330, 300, -240);   // палец на тексте
    check(!r.cancelled, "браузер не должен отменять горизонтальный жест (pointercancel)");
    check(r.midClass.includes("dragging"), "пока палец едет, лента должна следовать за ним");
    check(r.midBlur !== "none", "под пальцем размытие не должно пропадать");
    check(await tpos() === "2 из 17", "свайп пальцем влево должен листать вперёд");

    const cbox = await t.locator("#counter-1").boundingBox();   // палец на кнопке-счётчике
    r = await touchSwipe(cbox.x + cbox.width - 20, cbox.y + cbox.height / 2, -240);
    check(!r.cancelled, "жест, начатый на кнопке счётчика, не должен отменяться");
    check(await tpos() === "3 из 17", "свайп, начатый на кнопке счётчика, должен листать");
    check((await t.locator("#counter-1 .num").innerText()) === "0 / 3", "свайп с кнопки не должен считаться нажатием");

    r = await touchSwipe(60, 300, 250);          // назад
    check(await tpos() === "2 из 17", "свайп пальцем вправо должен листать назад");
    {
      const b = await t.evaluate(() => ({
        far: [...document.querySelectorAll("#track .slide.far")].every(s => getComputedStyle(s).visibility === "hidden"),
        classes: document.getElementById("track").className
      }));
      check(b.far, "далёкие карточки должны быть скрыты");
      check(!b.classes.includes("moving"), "после свайпа не должно оставаться отметки «moving»");
    }
    await t.context().close();
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
                 enter: document.getElementById("reader").classList.contains("enter"), pageW: document.documentElement.scrollWidth, broken,
                 edge: (() => { const v = document.getElementById(mode === "cards" ? "viewport" : "list-view").getBoundingClientRect(); return v.left <= 0 && v.right >= innerWidth; })() };
      }, mode);
      check(r.left >= 8 && r.right >= 8, `${w}px ${mode}: текст слишком близко к краю`);
      check(r.barHidden, `${w}px ${mode}: полоса прокрутки не спрятана`);
      check(!r.enter, `${w}px ${mode}: анимация появления не снялась`);
      check(r.pageW <= w, `${w}px ${mode}: страница шире экрана`);
      check(r.broken === 0, `${w}px ${mode}: номер аята оторвался от слова`);
      check(r.edge, `${w}px ${mode}: экран чтения не от края до края — при свайпе будет видна граница`);
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
    check((await q.locator("#counter-0 .num").innerText()) === "0 / 3", "после полуночи счётчики не обнулились");
    // прочитали все вечерние → отметка; на следующий день — пропала
    await q.evaluate(() => { const c = {}; AZKAR.filter(z => z.when.includes("evening")).forEach(z => c["evening:" + z.id] = z.times); localStorage.setItem(KEY, JSON.stringify(c)); counts = c; });
    await q.click("#back"); await W(q, 300);
    check(await q.evaluate(() => document.getElementById("go-evening").classList.contains("done")), "нет отметки у вечерних");
    await q.clock.setSystemTime(new Date("2026-10-08T21:10:00Z"));
    await q.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await W(q, 300);
    check(!(await q.evaluate(() => document.getElementById("go-evening").classList.contains("done"))), "после полуночи отметка не пропала");
    await ctx.close();
  }

  // ---------------------------------------------------------------
  section("Время намазов: место, Чечня по геопозиции, поиск, способы расчёта, поправки, напоминания");
  {
    // Интернет в проверках не нужен: ответы поиска и названия места подменяем заготовками
    const REF_1M = { fajr: "4:51", sunrise: "6:02", dhuhr: "12:30", asr: "15:08", maghrib: "17:25", isha: "18:54" };   // 1Muslim, Ассиновская, 11.10.2026
    const GEO = { results: [
      { name: "Грозный", latitude: 43.31195, longitude: 45.68895, timezone: "Europe/Moscow", admin1: "Чечня", country: "Россия" },
      { name: "Грозный", latitude: 55.1, longitude: 61.4, timezone: "Asia/Yekaterinburg", admin1: "Челябинская область", country: "Россия" },
      { name: "<img src=x onerror=window.hacked=1>", latitude: 1, longitude: 1, timezone: "UTC", admin1: "", country: "" } ] };
    const mock = async (ctx, offline) => {
      await ctx.route("https://geocoding-api.open-meteo.com/**", r => r.fulfill({ json:
        /name=%D0%93%D1%80/.test(r.request().url()) ? GEO :
        /name=%D0%9A%D1%80%D0%B0%D1%81%D0%BD%D0%BE%D1%8F/.test(r.request().url()) ? { results: [{ name: "Красноярск", latitude: 56.01, longitude: 92.85, timezone: "Asia/Krasnoyarsk", admin1: "Красноярский край", country: "Россия" }] } : {} }));
      await ctx.route("https://nominatim.openstreetmap.org/**", r => offline ? r.abort() : r.fulfill({ json: /lat=43\.2/.test(r.request().url())
        ? { address: { village: "Ассиновская", state: "Чеченская Республика" } } : { address: { city: "Грозный", state: "Чеченская Республика" } } }));
    };
    const times = g => g.evaluate(() => Object.fromEntries([...document.querySelectorAll("#pt-row .pt")].map(e => [e.dataset.p, e.querySelector("b").textContent])));
    const mins = x => { const [h, m] = x.split(":"); return h * 60 + +m; };
    const near = (pt, ref, tol, what) => { for (const k in ref) check(pt[k] && Math.abs(mins(pt[k]) - mins(ref[k])) <= tol, `${what}: ${k} = ${pt[k]}, ожидалось ${ref[k]}`); };
    // 1) Ассиновская по геопозиции: она в 45 км от Грозного, поэтому сначала таблицы нет — регион узнаём у OpenStreetMap
    //    и включаем общее расписание Чечни. В v18 здесь была ошибка: оставался расчёт по солнцу (зухр 11:51 вместо 12:30)
    {
      const ctx = await browser.newContext({ timezoneId: "Europe/Moscow", permissions: ["geolocation"], geolocation: { latitude: 43.2167, longitude: 45.15 } });
      await mock(ctx);
      const g = await ctx.newPage(); g.on("pageerror", e => errs.push(e.message));
      await g.clock.install({ time: new Date("2026-10-11T11:00:00Z") });   // 14:00 по Москве
      await g.goto(URL); await g.evaluate(() => localStorage.clear()); await g.reload(); await W(g, 1200);
      const pl = await g.evaluate(() => JSON.parse(localStorage.getItem("azkar-place")));
      check(pl && pl.geo && pl.name === "Ассиновская" && pl.sched === "grozny" && pl.region === "Чеченская Республика", "Ассиновская по геопозиции: не включилось расписание Чечни: " + JSON.stringify(pl));
      const t = await times(g);
      check(JSON.stringify(t) === JSON.stringify(REF_1M), "Ассиновская 11.10: время не как в 1Muslim: " + JSON.stringify(t));
      check((await g.locator("#pt-city").innerText()) === "Ассиновская", "на главной не видно места");
      // 14:00: сейчас зухр (выделен), до аср 15:08 — 1:08
      check(await g.evaluate(() => document.querySelector(".pt.now").dataset.p) === "dhuhr", "14:00: выделен не зухр");
      check((await g.locator("#pt-next").innerText()) === "Аср через 1:08", "14:00: неверный отсчёт: " + await g.locator("#pt-next").innerText());
      // ночь 02:00 — ещё иша, следующий фаджр
      await g.clock.setSystemTime(new Date("2026-10-11T23:00:00Z")); await g.evaluate(() => renderPrayer());
      check(await g.evaluate(() => document.querySelector(".pt.now").dataset.p) === "isha" && (await g.locator("#pt-next").innerText()).startsWith("Фаджр через 2:"), "02:00: неверно: " + await g.locator("#pt-next").innerText());
      // на сайте (не в приложении) раздела «Напоминания» нет
      check(await g.locator("#notify-group").isHidden(), "на сайте видны напоминания");
      await ctx.close();
    }
    // 1б) без интернета: место по геопозиции сохраняется (считаем по солнцу), при следующем запуске с интернетом — уточняется
    {
      const ctx = await browser.newContext({ timezoneId: "Europe/Moscow", permissions: ["geolocation"], geolocation: { latitude: 43.2167, longitude: 45.15 } });
      await mock(ctx, true);
      const g = await ctx.newPage(); g.on("pageerror", e => errs.push(e.message));
      await g.clock.install({ time: new Date("2026-10-11T11:00:00Z") });
      await g.goto(URL); await g.evaluate(() => localStorage.clear()); await g.reload(); await W(g, 1000);
      let pl = await g.evaluate(() => JSON.parse(localStorage.getItem("azkar-place")));
      check(pl && pl.geo && !pl.sched && !pl.checked && await g.locator("#pt-row .pt").count() === 6, "без интернета место по геопозиции не сохранилось: " + JSON.stringify(pl));
      await ctx.unroute("https://nominatim.openstreetmap.org/**"); await mock(ctx);
      await g.reload(); await W(g, 1000);
      pl = await g.evaluate(() => JSON.parse(localStorage.getItem("azkar-place")));
      check(pl.sched === "grozny" && pl.name === "Ассиновская" && JSON.stringify(await times(g)) === JSON.stringify(REF_1M), "с интернетом место не уточнилось: " + JSON.stringify(pl));
      await ctx.close();
    }
    // 1в) названия из OpenStreetMap без приписок
    {
      const ctx = await browser.newContext(); const g = await ctx.newPage();
      await g.goto(URL);
      const r = await g.evaluate(() => [cleanName("Ассиновское сельское поселение"), cleanName("Гудермесское городское поселение"), cleanName("городской округ Грозный"), cleanName("Ассиновская")]);
      check(JSON.stringify(r) === JSON.stringify(["Ассиновское", "Гудермесское", "Грозный", "Ассиновская"]), "названия не очищаются: " + JSON.stringify(r));
      await ctx.close();
    }
    // 2) запретил геопозицию: больше не спрашиваем, на главной — «Укажите город или село»
    {
      const ctx = await browser.newContext({ timezoneId: "Europe/Moscow" });
      const g = await ctx.newPage(); g.on("pageerror", e => errs.push(e.message));
      await g.addInitScript(() => { navigator.geolocation.getCurrentPosition = (ok, err) => { window.asked = (window.asked || 0) + 1; err({ code: 1, PERMISSION_DENIED: 1 }); }; });
      await g.goto(URL); await g.evaluate(() => localStorage.clear()); await g.reload(); await W(g, 400);
      check(await g.evaluate(() => window.asked) === 1, "при первом запуске не спросили геопозицию");
      check(await g.evaluate(() => JSON.parse(localStorage.getItem("azkar-geo-denied"))) === true, "запрет не запомнился");
      await g.reload(); await W(g, 400);
      check(!(await g.evaluate(() => window.asked)), "после запрета спрашивают снова");
      check(await g.locator("#set-city").isVisible() && !(await g.locator("#pt-row").isVisible()), "после запрета нет «Укажите город или село»");
      await ctx.close();
    }
    // 3) поиск места, способы расчёта, аср, поправки
    const ctx = await browser.newContext({ timezoneId: "Europe/Moscow", viewport: { width: 390, height: 844 } });
    await mock(ctx);
    await ctx.addInitScript(() => { navigator.geolocation.getCurrentPosition = (ok, err) => err({ code: 1, PERMISSION_DENIED: 1 }); });
    const q = await ctx.newPage(); q.on("pageerror", e => errs.push(e.message));
    await q.clock.install({ time: new Date("2026-10-11T03:00:00Z") });   // 06:00 по Москве
    await q.goto(URL); await q.evaluate(() => localStorage.clear()); await q.reload(); await W(q, 300);
    await q.click("#set-city"); await W(q, 350);
    await q.fill("#city-search", "Г"); await W(q, 500);
    check(await q.locator("#city-list .choice-row").count() === 0, "поиск по одной букве не должен начинаться");
    await q.fill("#city-search", "Грозный"); await W(q, 700);
    check(await q.locator("#city-list .choice-row").count() === 3, "поиск не показал результаты");
    check(await q.evaluate(() => !window.hacked && !document.querySelector("#city-list img")), "название из интернета вставилось как код");
    check((await q.locator("#city-list .choice-row").nth(1).innerText()).includes("Челябинская область"), "у одинаковых названий не видно область");
    await q.locator("#city-list .choice-row").first().click(); await W(q, 500);
    check(await q.locator("#city-sheet").isHidden(), "окно места не закрылось");
    check(JSON.stringify(await times(q)) === JSON.stringify(REF_1M), "Грозный: по умолчанию не предустановленное время: " + JSON.stringify(await times(q)));
    await q.click("#tab-settings"); await W(q, 200);
    check((await q.locator("#city-value").innerText()) === "Грозный" && (await q.locator("#source-value").innerText()) === "Предустановленное", "в настройках не видно места или расписания");
    check(!(await q.locator("#open-method").isVisible()) && !(await q.locator("#open-asr").isVisible()), "при предустановленном видны способ и аср");
    await q.click("#open-source"); await W(q, 350); await q.click('[data-source="auto"]'); await W(q, 450);
    await q.click("#tab-home"); await W(q, 300);
    // ДУМ России, сверено с moynamaz.org на 11.10.2026
    near(await times(q), { fajr: "4:31", sunrise: "6:01", dhuhr: "11:49", asr: "14:50", maghrib: "17:26", isha: "18:39" }, 1, "Грозный, ДУМ России");
    await q.click("#tab-settings"); await W(q, 200);
    await q.click("#open-method"); await W(q, 350); await q.click('[data-method="MuslimWorldLeague"]'); await W(q, 450);
    check((await q.locator("#method-value").innerText()) === "Всемирная исламская лига", "способ расчёта не сменился");
    await q.click("#tab-home"); await W(q, 300);
    near(await times(q), { fajr: "4:29", sunrise: "6:04", dhuhr: "11:46", asr: "14:52", maghrib: "17:23", isha: "18:52" }, 4, "Грозный, МВЛ");   // 5namaz.com
    const asr1 = (await times(q)).asr;
    await q.click("#tab-settings"); await W(q, 200);
    await q.click("#open-asr"); await W(q, 350); await q.click('[data-asr="Hanafi"]'); await W(q, 450);
    await q.click("#tab-home"); await W(q, 300);
    check(mins((await times(q)).asr) - mins(asr1) > 30, "ханафитский аср не позже");
    // поправки: магриб +2, фаджр −1
    await q.click("#tab-settings"); await W(q, 200);
    const mg = (await (async () => { await q.click("#tab-home"); await W(q, 200); return times(q); })()).maghrib;
    await q.click("#tab-settings"); await W(q, 200);
    await q.click("#open-adjust"); await W(q, 350);
    await q.click('.adj-btn[data-adj="maghrib"][data-d="1"]'); await q.click('.adj-btn[data-adj="maghrib"][data-d="1"]');
    await q.click('.adj-btn[data-adj="fajr"][data-d="-1"]'); await W(q, 200);
    check((await q.locator("#adjust-value").innerText()) === "2 намаза", "поправки не подписаны: " + await q.locator("#adjust-value").innerText());
    await q.click("#adjust-sheet", { position: { x: 10, y: 10 } }); await W(q, 400);
    await q.click("#tab-home"); await W(q, 300);
    check(mins((await times(q)).maghrib) - mins(mg) === 2, "поправка магриба не сработала");
    await q.reload(); await W(q, 400);
    check(mins((await times(q)).maghrib) - mins(mg) === 2, "поправки не сохранились после перезапуска");
    await q.click("#tab-settings"); await W(q, 200); await q.click("#open-adjust"); await W(q, 350); await q.click("#adjust-reset"); await W(q, 200);
    check((await q.locator("#adjust-value").innerText()) === "Нет", "поправки не сбросились");
    await q.click("#adjust-sheet", { position: { x: 10, y: 10 } }); await W(q, 400);
    // Красноярск — готовой таблицы нет, только расчёт
    await q.click("#open-city"); await W(q, 350); await q.fill("#city-search", "Краснояр"); await W(q, 700);
    await q.locator("#city-list .choice-row").first().click(); await W(q, 500);
    check(!(await q.locator("#open-source").isVisible()) && await q.locator("#open-method").isVisible(), "у Красноярска виден выбор «Расписание»");
    await q.click("#tab-home"); await W(q, 300);
    // все готовые таблицы на весь год: восход и магриб не дальше 8 минут от солнца, 29 февраля не ломается
    const audit = await q.evaluate(() => {
      const bad = [];
      for (const s of SCHEDULES) {
        const t = scheduleTable(s);
        if (t.length !== 365 * 6) bad.push(`${s.name}: ${t.length / 6} дней`);
        const c = new adhan.Coordinates(s.lat, s.lng);
        for (let d = 0; d < 365; d++) {
          const date = new Date(Date.UTC(2026, 0, 1 + d));
          const pt = new adhan.PrayerTimes(c, new Date(2026, 0, 1 + d), adhan.CalculationMethod.MuslimWorldLeague());
          for (const [k, i] of [["sunrise", 1], ["maghrib", 4]]) {
            const diff = Math.round((date.getTime() + (t[d * 6 + i] - s.off) * 60000 - pt[k].getTime()) / 60000);
            if (Math.abs(diff) > 8) { bad.push(`${s.name} день ${d + 1} ${k}: ${diff} мин`); break; }
          }
        }
      }
      const keep = place; place = { name: "x", lat: 43.3, lng: 45.7, tz: "Europe/Moscow", sched: "grozny", avail: "grozny" };
      const at = iso => presetTimes(0, new Date(iso).getTime()).fajr.toISOString().slice(11, 16);
      const leap = [at("2028-02-28T09:00:00Z"), at("2028-02-29T09:00:00Z"), at("2028-03-01T09:00:00Z"), at("2027-03-01T09:00:00Z")];
      place = keep;
      if (leap[0] !== leap[1] || leap[2] !== leap[3]) bad.push("29 февраля: " + leap.join(" "));
      return bad.slice(0, 10);
    });
    check(audit.length === 0, "готовые расписания: " + audit.join("; "));
    // далёкий часовой пояс: время по месту, а не по телефону
    await q.evaluate(() => { localStorage.setItem("azkar-place", JSON.stringify({ name: "Уфа", lat: 54.74, lng: 55.97, tz: "Asia/Yekaterinburg", checked: true })); });
    await q.reload(); await W(q, 300);
    const ufa = mins((await times(q)).fajr);
    check(ufa >= 5 * 60 && ufa <= 7 * 60, "Уфа: фаджр не по местному времени");
    // узкий экран: шесть времён влезают и не слипаются, верх не обрезан
    for (const [w, h] of [[320, 568], [390, 844], [430, 932]]) {
      await q.setViewportSize({ width: w, height: h }); await W(q, 500);
      const r = await q.evaluate(() => {
        const bs = [...document.querySelectorAll("#pt-row .pt b")].map(b => { const r = document.createRange(); r.selectNodeContents(b); return r.getBoundingClientRect(); });
        const touch = bs.some((a, i) => i && Math.abs(bs[i - 1].top - a.top) < 2 && a.left - bs[i - 1].right < 4);
        const home = document.getElementById("home");
        return { pageW: document.documentElement.scrollWidth, touch, top: document.getElementById("ptimes").getBoundingClientRect().top - home.getBoundingClientRect().top + home.scrollTop };
      });
      check(r.pageW <= w && !r.touch, `${w}px: время намазов не влезает или слиплось`);
      check(r.top >= 0, `${w}×${h}: верх главной обрезан`);
    }
    await ctx.close();
    // 4) напоминания в приложении: подменяем Capacitor и смотрим, что ставится в очередь
    {
      const ctx = await browser.newContext({ timezoneId: "Europe/Moscow" });
      await mock(ctx);
      const g = await ctx.newPage(); g.on("pageerror", e => errs.push(e.message));
      await g.addInitScript(() => {
        window.__sched = []; window.__asked = 0; window.__perm = "granted";
        const LN = {
          checkPermissions: async () => ({ display: window.__perm }),
          requestPermissions: async () => { window.__asked++; return { display: window.__perm }; },
          getPending: async () => ({ notifications: window.__sched.map(n => ({ id: n.id })) }),
          cancel: async ({ notifications }) => { const ids = notifications.map(n => n.id); window.__sched = window.__sched.filter(n => !ids.includes(n.id)); },
          schedule: async ({ notifications }) => { window.__sched.push(...notifications); },
          addListener: (ev, fn) => { window.__tap = fn; },
        };
        const GEO = {
          getCurrentPosition: async () => ({ coords: { latitude: 43.2167, longitude: 45.15 } }),
          checkPermissions: async () => ({ location: "granted" }),
        };
        window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: LN, Geolocation: GEO } };
      });
      await g.clock.install({ time: new Date("2026-10-11T11:00:00Z") });   // 14:00
      await g.goto(URL); await g.evaluate(() => localStorage.clear()); await g.reload(); await W(g, 1500);
      const st = await g.evaluate(() => ({ n: __sched.length, asked: __asked, first: __sched.map(n => [n.title, new Date(n.schedule.at).toISOString()]).sort((a, b) => a[1] < b[1] ? -1 : 1).slice(0, 3),
        place: JSON.parse(localStorage.getItem("azkar-place")) }));
      check(st.asked === 1, "в приложении при первом запуске не спросили разрешение на уведомления");
      check(st.place && st.place.sched === "grozny", "в приложении геопозиция через плагин не сработала: " + JSON.stringify(st.place));
      check(st.n === 60, "напоминаний не 60 (30 дней × 2): " + st.n);
      // первое — сегодняшний аср 15:08 (12:08 UTC), второе — завтрашний фаджр
      check(st.first[0][0] === "Вечерние азкары" && st.first[0][1] === "2026-10-11T12:08:00.000Z" && st.first[1][0] === "Утренние азкары", "напоминания не по времени: " + JSON.stringify(st.first));
      await g.click("#tab-settings"); await W(g, 200);
      check(await g.locator("#notify-group").isVisible(), "в приложении нет раздела «Напоминания»");
      await g.click("#sw-nm"); await W(g, 400);
      const ev = await g.evaluate(() => ({ n: __sched.length, morning: __sched.filter(n => n.title !== "Вечерние азкары").length, sw: document.getElementById("sw-nm").getAttribute("aria-checked"), notify: localStorage.getItem("azkar-notify") }));
      check(ev.n === 30 && ev.morning === 0 && ev.sw === "false", "после выключения утренних остались утренние напоминания: " + JSON.stringify(ev));
      // поправка аср +3 — напоминание переезжает
      await g.click("#open-adjust"); await W(g, 350); for (let i = 0; i < 3; i++) await g.click('.adj-btn[data-adj="asr"][data-d="1"]'); await W(g, 300);
      const first = await g.evaluate(() => __sched.map(n => new Date(n.schedule.at).toISOString()).sort()[0]);
      check(first === "2026-10-11T12:11:00.000Z", "напоминание не учло поправку: " + first);
      // нажатие на уведомление открывает нужные азкары
      await g.click("#adjust-sheet", { position: { x: 10, y: 10 } }); await W(g, 400);
      await g.evaluate(() => __tap({ notification: { extra: { time: "evening" } } })); await W(g, 600);
      check(await g.locator("#reader").isVisible() && await g.evaluate(() => time === "evening"), "нажатие на уведомление не открыло вечерние азкары");
      await ctx.close();
    }
  }

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
