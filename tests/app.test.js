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
  check(counts.mf === 17 + 10 && counts.ef === 16 + 8, `всего утренних (основные + только полные) не 27 или вечерних не 24: ${counts.mf}/${counts.ef}`);
  check(await p.evaluate(() => FULL_ORDER.morning.join(",")) === "m-ikhlas,m-falaq,m-nas,m-sayyid,m-adada,m-hasbi,m-bismillah,m-radiitu,m-bika,m-hayyu,fm-fath,m-fitra,m-asbahna,m-alim,f-14,m-subhan100,m-kursi,f-17,f-18,f-19,f-20,f-21,m-afiya,fm-ilm,fm-istighfar,fm-salawat", "полные утренние: не тот порядок, что в видео");
  check(await p.evaluate(() => AZKAR.filter(z => z.when.includes("morning") && !z.full && z.id !== "m-tahlil10").every(z => FULL_ORDER.morning.includes(z.id))), "не все основные утренние входят в полные");
  check(await p.evaluate(() => { const a = AZKAR.find(z => z.id === "m-tahlil10"), b = AZKAR.find(z => z.id === "f-14"); return b.times === 100 && a.times === 10 && ["ar","ru","tr","src"].every(k => a[k] === b[k]); }), "«Ля иляха илля-Ллах» в полных: не 100 раз или текст отличается от основных");
  check(await p.evaluate(() => FULL_ORDER.evening.join(",")) === "e-ikhlas,e-falaq,e-nas,e-sayyid,e-hasbi,e-bismillah,e-radiitu,e-bika,fe-ushhiduka,e-hayyu,fe-fath,fe-fitra,fe-maamsa,e-alim,fe-tahlil100,e-subhan100,e-kursi,fe-baqara285,fe-baqara286,f-19,f-20,f-21,e-amsayna,e-kalimat,e-afiya,fe-salawat", "полные вечерние: не тот порядок, что в видео");
  check(await p.evaluate(() => AZKAR.filter(z => z.when.includes("evening") && !z.full && z.id !== "e-tahlil10").every(z => FULL_ORDER.evening.includes(z.id))), "не все основные вечерние входят в полные");
  check(await p.evaluate(() => AZKAR.filter(z => z.when.includes("evening") && !z.full).map(z => z.id).join(",")) === "e-ikhlas,e-falaq,e-nas,e-sayyid,e-hasbi,e-bismillah,e-radiitu,e-bika,e-hayyu,e-alim,e-tahlil10,e-subhan100,e-kursi,e-amsayna,e-kalimat,e-afiya", "основные вечерние не в порядке полных");
  check(counts.dup === 0, "повторяются id азкаров");

  section("Главная (вариант C): «Сейчас время» по часам, панель на 3 вкладки, Дуа и Коран со строк, нажатие при прокрутке");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
    const h = await ctx.newPage(); h.on("pageerror", e => errs.push(e.message));
    await h.clock.install({ time: new Date(2026, 9, 28, 1, 30) });
    // с 2:00 до 14:00 — утренние, остальное время — вечерние
    for (const [hh, mm, want] of [[1, 59, "evening"], [2, 0, "morning"], [13, 59, "morning"], [14, 0, "evening"], [23, 30, "evening"]]) {
      await h.clock.setFixedTime(new Date(2026, 9, 28, hh, mm));
      await h.goto(URL); await h.evaluate(() => localStorage.clear()); await h.reload(); await W(h, 300);
      const st = await h.evaluate(() => ({ hero: document.querySelector(".hero").dataset.time, id: document.querySelector(".hero").id,
        row: document.querySelector(".home-rows .row[data-time]").dataset.time, kicker: document.querySelector(".hero-kicker").textContent,
        title: document.querySelector(".hero-title").textContent }));
      check(st.hero === want && st.id === "go-" + want && st.row !== want && st.kicker === "Сейчас время"
        && st.title === (want === "morning" ? "Утренние азкары" : "Вечерние азкары"), `${hh}:${mm}: на карточке не то время: ` + JSON.stringify(st));
    }
    // время меняется, пока главная открыта: 13:59 → 14:00 (проверка раз в минуту)
    await h.clock.setFixedTime(new Date(2026, 9, 28, 13, 59)); await h.reload(); await W(h, 300);
    await h.clock.setFixedTime(new Date(2026, 9, 28, 14, 0)); await h.clock.runFor(61000); await W(h, 100);
    check(await h.evaluate(() => document.querySelector(".hero").dataset.time) === "evening", "в 14:00 карточка не сменилась на вечерние");
    // картинка на карточке видна и заполняет её
    const img = await h.evaluate(() => { const i = [...document.querySelectorAll(".hero-img")].find(x => getComputedStyle(x).display !== "none"), c = document.querySelector(".hero").getBoundingClientRect(), r = i.getBoundingClientRect();
      return { ok: i.complete && i.naturalWidth === 1800 && i.naturalHeight === 1200, fill: Math.abs(r.width - c.width) < 1 && Math.abs(r.height - c.height) < 1, data: i.dataset.for }; });
    check(img.ok && img.fill && img.data === "evening", "картинка на карточке не та или не на всю карточку: " + JSON.stringify(img));
    // нет ни даты, ни приветствия, ни минут
    const homeText = await h.locator("#home").innerText();
    check(!/саляму|мин\b|·/.test(homeText), "на главной осталось лишнее (приветствие/дата/минуты)");
    // нижняя панель: 3 вкладки, подписи влезают
    check((await h.locator(".tab-item").count()) === 3 && (await h.locator("#tab-home, #tab-tasbih, #tab-settings").count()) === 3, "в панели не 3 вкладки");
    // прокрутка, начатая пальцем на строке «Дуа», не подсвечивает её и не открывает Дуа
    const r = await h.$eval("#go-duas", e => { const b = e.getBoundingClientRect(); return { x: b.x + 100, y: b.y + 25 }; });
    const cdp = await ctx.newCDPSession(h);
    const T = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: r.x, y }] });
    await h.clock.resume();
    await T("touchStart", r.y); let lit = false;
    for (let i = 1; i <= 15; i++) { await T("touchMove", r.y - i * 12); await W(h, 16); lit ||= await h.$eval("#go-duas", e => e.classList.contains("pressed")); }
    await T("touchEnd"); await W(h, 300);
    check(!lit, "строка подсветилась при прокрутке");
    check(await h.locator("#home").isVisible() && await h.$eval("#home", e => e.scrollTop) > 20, "прокрутка по строке не сработала или открыла раздел");
    // обычное нажатие: подсветка мигает и раздел открывается; «‹ Главная» возвращает
    await h.$eval("#home", e => e.scrollTop = 0);
    await h.tap("#go-duas"); await W(h, 500);
    check(await h.locator("#duas").isVisible() && (await h.getAttribute("#tabbar", "data-active")) === "home", "нажатие на «Дуа» не открыло Дуа");
    await h.click("#duas-back"); await W(h, 300);
    check(await h.locator("#home").isVisible(), "«‹ Главная» из Дуа не вернула на главную");
    await h.tap("#go-quran"); await W(h, 700);
    check(await h.locator("#quran").isVisible(), "нажатие на «Коран» не открыло Коран");
    await h.click("#quran-back"); await W(h, 300);
    check(await h.locator("#home").isVisible(), "«‹ Главная» из Корана не вернула на главную");
    check(!(await h.locator(".pressed").count()), "подсветка нажатия осталась висеть");
    // строка «Утренние» открывает утренние, карточка — вечерние
    await h.click(".home-rows .row[data-time]"); await W(h, 500);
    check(await h.locator("#reader").isVisible() && await h.evaluate(() => time) === "morning", "строка не открыла утренние");
    await h.click("#back"); await W(h, 300);
    await h.click(".hero"); await W(h, 500);
    check(await h.evaluate(() => time) === "evening", "карточка не открыла вечерние");
    await ctx.close();
  }

  section("Основные и полные: переключатель, число азкаров, чтение, отметка «прочитано», сохранение");
  {
    check(await p.locator("#set-switch").isVisible(), "нет переключателя «Основные | Полные»");
    check((await p.locator('.set-opt[aria-checked="true"]').innerText()) === "Основные", "по умолчанию не «Основные»");
    // число азкаров на главной: у карточки «Сейчас время» — «0 из 17», у строки — «16 азкаров»
    const homeNums = () => p.evaluate(() => {
      const h = document.querySelector(".hero"), r = document.querySelector(".home-rows .row[data-time]");
      return { [h.dataset.time]: +(h.querySelector(".hero-sub").textContent.match(/из (\d+)/) || [])[1], [r.dataset.time]: parseInt(r.querySelector(".row-count").textContent) };
    });
    let hn = await homeNums();
    check(hn.morning === 17 && hn.evening === 16, "неверное число на главной (основные): " + JSON.stringify(hn));
    await p.click('.set-opt[data-set="full"]'); await W(p, 500);
    hn = await homeNums();
    check(hn.morning === 26 && hn.evening === 26, "неверное число на главной (полные): " + JSON.stringify(hn));
    // таблетка переехала вправо
    const pill = await p.evaluate(() => getComputedStyle(document.getElementById("set-switch"), "::before").transform);
    check(pill !== "none", "подложка переключателя не переехала");
    await p.click("#go-morning"); await W(p, 800);
    check((await p.locator("#pos").innerText()).endsWith("из 26"), "в полных утренних не 26 карточек: " + await p.locator("#pos").innerText());
    // аят аль-Курси есть, номер аята не оторван
    check(await p.evaluate(() => items[16].id === "m-kursi" && items[16].name === "Аят аль-Курси" && items[0].id === "m-ikhlas" && items[22].id === "m-afiya"), "в полных утренних не тот список (17-й должен быть аят аль-Курси)");
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
    check((await p.locator("#pos").innerText()).startsWith("11 из 26"), "прогресс общий: после основных полные должны продолжиться с первого непрочитанного (Асбахна… фатхаху): " + await p.locator("#pos").innerText());
    await p.click("#back"); await W(p, 300);
    await p.click('.set-opt[data-set="main"]'); await W(p, 300);
    await p.evaluate(() => { localStorage.removeItem(KEY); counts = {}; updateHome(); });
    // на любом экране карточка «Сейчас время» не обрезана сверху, а остальное видно или до него можно долистать
    for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
      for (const s of ["main", "full"]) {
        await p.setViewportSize({ width: w, height: h }); await p.click(`.set-opt[data-set="${s}"]`); await W(p, 300);
        const r = await p.evaluate(() => { const home = document.getElementById("home");
          return { top: document.querySelector(".hero").getBoundingClientRect().top - home.getBoundingClientRect().top + home.scrollTop,
                   pageW: document.documentElement.scrollWidth }; });
        check(r.top >= 0, `${w}×${h} ${s}: карточка обрезана сверху (${Math.round(r.top)})`);
        check(r.pageW <= w, `${w}×${h} ${s}: главная шире экрана`);
      }
    }
    await p.setViewportSize({ width: 390, height: 780 }); await p.click('.set-opt[data-set="main"]'); await W(p, 300);
  }

  section("Аят дня: 52 аята, меняется по дате, раскрывается по нажатию");
  {
    const info = await p.evaluate(() => ({
      n: AYAT.length, refs: new Set(AYAT.map(a => a.ref)).size,
      empty: AYAT.filter(a => !a.ar || !a.ru || !a.ref).length,
      // номер аята в конце каждого аята — «[١٥٢]»
      nums: AYAT.every(a => /\[[\u0660-\u0669]+\]$/.test(a.ar)),
      // соседние дни — разные аяты, через 30 дней — тот же
      d1: ayahOfDay(new Date(2026, 9, 11)).ref, d2: ayahOfDay(new Date(2026, 9, 12)).ref, dN: ayahOfDay(new Date(2026, 9, 11 + AYAT.length)).ref,
      // ночь и вечер одного дня — один аят (считаем по местной дате, не по Гринвичу)
      early: ayahOfDay(new Date(2026, 9, 11, 0, 5)).ref, late: ayahOfDay(new Date(2026, 9, 11, 23, 55)).ref,
      // все аяты встречаются за AYAT.length дней подряд
      cycle: new Set([...Array(AYAT.length)].map((_, i) => ayahOfDay(new Date(2026, 9, 11 + i)).ref)).size,
      shown: document.getElementById("ayah-ref").textContent, today: "Сура " + ayahOfDay().ref,
      blob: document.getElementById("ayah-ar").innerHTML.includes("\u06DF") }));
    check(info.n === 52 && info.refs === 52 && info.empty === 0, "аятов дня не 52 или есть пустые/повторы: " + JSON.stringify(info));
    check(info.nums, "не у всех аятов дня есть номер в конце");
    check(info.d1 !== info.d2 && info.d1 === info.dN, "аят не меняется по дням или цикл не 52 дня");
    check(info.early === info.late, "в течение одного дня аят меняется");
    check(info.cycle === 52, "за 52 дня показываются не все аяты: " + info.cycle);
    check(info.shown === info.today, "на главной не сегодняшний аят: " + info.shown);
    check(!info.blob, "знак немого алифа не заменён — будет клякса");
    // сукун — мусхафный (головка «х», U+06E1), а немой алиф — пустой кружок (U+0652)
    const suk = await p.evaluate(() => { const t = arabic("\u062E\u0652\u0641\u0650\u0636\u0652 \u0648\u0627\u06DF");
      return { head: (t.match(/\u06E1/g) || []).length, ring: (t.match(/\u0652/g) || []).length }; });
    check(suk.head === 2 && suk.ring === 1, "сукун/немой алиф показаны не по мусхафу: " + JSON.stringify(suk));
    check(await p.evaluate(() => !document.getElementById("ayah-ar").innerHTML.includes("\u0652") ||
      AYAT.some(a => a.ar.includes("\u06DF"))), "на главной остался сукун-кружок");
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
  section("Окна: смахнуть пальцем вниз; ползунки размера по 1%");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const g = await ctx.newPage(); g.on("pageerror", e => errs.push(e.message));
    await g.goto(URL); await g.evaluate(() => localStorage.clear()); await g.reload(); await W(g, 400);
    const swipe = async (id, from, dist, ms) => g.evaluate(async ([id, from, dist, ms]) => {
      const el = document.querySelector(`#${id} .sheet`), r = el.getBoundingClientRect();
      const T = y => new Touch({ identifier: 1, target: el, clientX: r.left + 150, clientY: y });
      const y0 = r.top + from;
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [T(y0)], bubbles: true, cancelable: true }));
      const steps = 8;
      for (let i = 1; i <= steps; i++) { el.dispatchEvent(new TouchEvent("touchmove", { touches: [T(y0 + dist * i / steps)], bubbles: true, cancelable: true })); await new Promise(f => setTimeout(f, ms / steps)); }
      el.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true, cancelable: true }));
    }, [id, from, dist, ms]);
    await g.click("#tab-settings"); await W(g, 200);
    // короткий медленный — окно возвращается
    await g.click("#open-theme"); await W(g, 400);
    await swipe("theme-sheet", 20, 40, 400); await W(g, 400);
    check(await g.locator("#theme-sheet").isVisible(), "окно закрылось от короткого движения");
    check(await g.evaluate(() => document.querySelector("#theme-sheet .sheet").style.transform === ""), "окно не вернулось на место");
    // длинный — закрывается
    await swipe("theme-sheet", 20, 220, 300); await W(g, 400);
    check(await g.locator("#theme-sheet").isHidden(), "окно «Тема» не закрылось смахиванием вниз");
    // быстрый короткий смах — тоже закрывается
    await g.click("#open-mode"); await W(g, 400);
    await swipe("mode-sheet", 20, 60, 60); await W(g, 400);
    check(await g.locator("#mode-sheet").isHidden(), "окно не закрылось быстрым смахиванием");
    // после закрытия окно открывается снова нормально
    await g.click("#open-mode"); await W(g, 400);
    check(await g.locator("#mode-sheet").isVisible() && await g.evaluate(() => document.querySelector("#mode-sheet .sheet").style.transform === ""), "окно после смахивания открывается сдвинутым");
    await g.click("#mode-sheet", { position: { x: 10, y: 10 } }); await W(g, 400);
    // ползунок размера: шаг 1%
    await g.click("#open-size"); await W(g, 400);
    await g.focus("#size-ar"); await g.keyboard.press("ArrowRight"); await W(g, 100);
    check((await g.locator("#size-ar-out").innerText()) === "101%", "ползунок шагает не по 1%: " + await g.locator("#size-ar-out").innerText());
    // движение по ползунку не закрывает окно
    await swipe("size-sheet", 140, 200, 300); await W(g, 400);
    await ctx.close();
  }

  section("Вибрация в приложении: лёгкая на каждое нажатие, чуть заметнее на последнем; в тасбихе — на 33, 66, 99…");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const g = await ctx.newPage(); g.on("pageerror", e => errs.push(e.message));
    await g.addInitScript(() => { window.__hap = [];
      window.Capacitor = { isNativePlatform: () => true, Plugins: { Haptics: { impact: async o => { window.__hap.push(o.style); } } } }; });
    await g.goto(URL); await g.evaluate(() => localStorage.clear()); await g.reload(); await W(g, 400);
    await g.click("#go-morning"); await W(g, 600);
    const need = +(await g.locator("#counter-0 .num").innerText()).split(" / ")[1];   // первый азкар (Ихлас ×3)
    for (let k = 0; k < need; k++) { await g.click("#counter-0"); await W(g, 60); }
    const hap = await g.evaluate(() => window.__hap.slice());
    check(hap.length === need && hap.slice(0, -1).every(x => x === "LIGHT") && hap[need - 1] === "MEDIUM", "вибрация счётчика не та: " + JSON.stringify(hap));
    await g.click("#back"); await W(g, 300); await g.click("#tab-tasbih"); await W(g, 300);
    await g.evaluate(() => { window.__hap = []; });
    for (let k = 0; k < 67; k++) await g.click("#tb-tap");
    await W(g, 100);
    const th = await g.evaluate(() => window.__hap.slice());
    const strong = th.map((x, i) => x === "MEDIUM" ? i + 1 : 0).filter(Boolean);
    check(th.length === 67 && JSON.stringify(strong) === "[33,66]", "в тасбихе сильный «тук» не на 33 и 66: " + JSON.stringify(strong) + " из " + th.length);
    await ctx.close();
  }

  section("Дуа: вкладка, темы, страница с карточками (без счётчика), кнопки, избранное, поиск");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
    const d = await ctx.newPage(); d.on("pageerror", e => errs.push(e.message));
    await d.goto(URL); await d.evaluate(() => localStorage.clear()); await d.reload(); await W(d, 400);
    await d.click("#go-duas"); await W(d, 500);
    check(await d.locator("#duas").isVisible() && (await d.getAttribute("#tabbar", "data-active")) === "home", "«Дуа» не открылась с главной");
    const soon = await d.locator(".dua-row.soon").count(), ready = await d.locator(".dua-row:not(.soon)").count();
    check(ready === 101 && soon === 0, `тем с текстами ${ready}, «скоро» ${soon}`);
    // дополненные части: пометок «{{…}}» столько же, сколько источников, и на экране скобок не видно
    const badAdds = await d.evaluate(() => DUA_ALL.filter(z => z.adds).filter(z =>
      ["ar", "ru", "tr"].some(f => (z[f].match(/\{\{/g) || []).length !== z.adds.length || (z[f].match(/\}\}/g) || []).length !== z.adds.length)).map(z => z.id));
    check(!badAdds.length, "пометки дополнений не совпадают с источниками: " + badAdds.join(", "));
    const strayBraces = await d.evaluate(() => DUA_ALL.filter(z => !z.adds && /\{\{|\}\}/.test([z.ar, z.ru, z.tr].join(""))).map(z => z.id));
    check(!strayBraces.length, "скобки-пометки без источников: " + strayBraces.join(", "));
    await d.evaluate(() => openDua("pr-open")); await W(d, 600);
    check(await d.evaluate(() => document.getElementById("tabbar").classList.contains("away")), "на странице темы дуа нижняя панель не уехала");
    await d.click("#dua-back"); await W(d, 400);
    check(await d.evaluate(() => !document.getElementById("tabbar").classList.contains("away")), "после «‹ Дуа» нижняя панель не вернулась");
    await d.evaluate(() => openDua("pr-open")); await W(d, 600);
    check(!(await d.locator("#dua-cards").innerText()).includes("{{"), "на экране видны скобки «{{»");
    await d.locator('#dua-cards .dua-card[data-id="d-pr-nur"] .ru .add-ref').nth(2).click(); await W(d, 300);
    check((await d.locator("#add-pop").innerText()).includes("ан-Насаи 1619"), "номер дополнения не показывает, кто передал");
    await d.evaluate(() => hapticLabel.click()); await W(d, 100);
    check(await d.locator("#add-pop").count() === 1, "подсказка закрывается от щелчка «вибрации» (на iPhone не открылась бы)");
    await d.mouse.click(5, 5); await W(d, 200);
    check(!(await d.locator("#add-pop").count()), "подсказка о дополнении не закрывается");
    const nur = d.locator('#dua-cards .dua-card[data-id="d-pr-nur"]');
    check(!(await nur.locator(".ar .add-ref, .tr .add-ref, .src .add-ref").count()) && (await nur.locator(".ar .add").count()) === 4,
      "номера вставок должны быть только в переводе, а зелёный цвет — и в арабском");
    check((await nur.locator(".ru .add-ref").allInnerTexts()).join() === "1,2,3,4", "в переводе вставки должны нумероваться 1, 2, 3, 4");
    check(!/\d —/.test(await nur.locator(".src").innerText()), "в источниках не должно быть нумерации вставок");
    await d.evaluate(() => openDua("adhan")); await W(d, 600);
    await d.locator('#dua-cards .dua-card[data-id="d-a-wasila"] .ru .add-ref').click(); await W(d, 300);
    check((await d.locator("#add-pop").innerText()).includes("Ибн Баз"), "у дуа после азана нет пояснения про аль-Байхаки и Ибн База");
    await d.mouse.click(5, 5); await W(d, 200);
    await d.click("#dua-back").catch(() => {}); await W(d, 300);
    // «3 дуа» справа всегда в одну строку — даже на узком экране и с длинным названием темы
    for (const w of [320, 390]) {
      await d.setViewportSize({ width: w, height: 800 }); await W(d, 200);
      const wrapped = await d.evaluate(() => [...document.querySelectorAll(".dua-row .value")]
        .filter(v => v.getBoundingClientRect().height > parseFloat(getComputedStyle(v).lineHeight) * 1.5 + 2).map(v => v.textContent));
      check(wrapped.length === 0, `${w}px: число дуа переносится на 2 строки: ` + JSON.stringify(wrapped));
    }
    await d.setViewportSize({ width: 390, height: 844 }); await W(d, 200);
    await d.click('[data-cat="eat-before"]'); await W(d, 600);
    check(await d.locator("#dua-read").isVisible() && (await d.getAttribute("#tabbar", "data-active")) === "home", "тема не открылась страницей");
    check((await d.locator(".dua-card").count()) === 2 && (await d.locator("#dua-read .counter").count()) === 0, "на странице темы не 2 карточки или есть счётчик");
    check((await d.locator(".dua-card").nth(1).locator(".dua-head b").innerText()) === "Если забыл сказать в начале", "нет заголовка у второго дуа");
    check(!(await d.locator(".dua-card").first().locator(".tr").isVisible()), "транскрипция не свёрнута");
    await d.locator(".dua-card").first().locator("summary").click(); await W(d, 200);
    check(await d.locator(".dua-card").first().locator(".tr").isVisible(), "транскрипция не раскрылась");
    await d.locator(".dua-card").first().locator('[data-act="copy"]').click(); await W(d, 300);
    const clip = await d.evaluate(() => navigator.clipboard.readText());
    check(clip.includes("Би-сми-Лляхи") && clip.includes("ат-Тирмизи 1858"), "копирование не сработало: " + clip.slice(0, 40));
    check(await d.locator("#toast.show").isVisible(), "нет подсказки «Скопировано»");
    await d.locator(".dua-card").nth(1).locator('[data-act="fav"]').click(); await W(d, 200);
    check(await d.evaluate(() => JSON.parse(localStorage.getItem("azkar-dua-fav"))[0] === "d-eat2"), "избранное не сохранилось");
    await d.click("#dua-back"); await W(d, 500);
    check(await d.locator('[data-cat="fav"]').isVisible(), "нет «Избранного» в списке тем");
    await d.click('[data-cat="fav"]'); await W(d, 500);
    check((await d.locator(".dua-card").count()) === 1, "в «Избранном» не одно дуа");
    await d.locator('.dua-card [data-act="fav"]').click(); await W(d, 300);
    check((await d.locator(".dua-card").count()) === 0, "убранное из избранного дуа не исчезло");
    await d.click("#dua-back"); await W(d, 400);
    check(!(await d.locator('[data-cat="fav"]').count()), "пустое «Избранное» осталось в списке");
    await d.fill("#dua-search", "сон"); await W(d, 200);
    const found = await d.locator(".dua-row").allInnerTexts();
    check(found.length === 6 && found.every(t => /сном|пробуждении|ночью|во сне|сон|После молитвы/i.test(t)), "поиск «сон» нашёл не то: " + JSON.stringify(found));
    await d.fill("#dua-search", "абракадабра"); await W(d, 200);
    check(await d.locator(".dua-empty").isVisible(), "при пустом поиске нет «Ничего не найдено»");
    await d.fill("#dua-search", ""); await d.click("#tab-home"); await W(d, 400);
    await d.click("#go-morning"); await W(d, 500); await d.click("#back"); await W(d, 400);
    check(await d.locator("#home").isVisible(), "после дуа «Назад» из азкаров ведёт не на главную");
    await ctx.close();
  }

  section("Коран: вкладка, список сур, страница суры, перевод, закладки, «Продолжить чтение»");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 480 } });
    const k = await ctx.newPage(); k.on("pageerror", e => errs.push(e.message));
    // экран пониже, чтобы короткие суры прокручивались (проверяем «Продолжить» и переход к аяту)
    await k.goto(URL); await k.evaluate(() => localStorage.clear()); await k.reload(); await W(k, 400);
    await k.click("#go-quran"); await W(k, 800);
    check(await k.locator("#quran").isVisible() && (await k.getAttribute("#tabbar", "data-active")) === "home", "«Коран» не открылся с главной");
    check((await k.locator(".q-row").count()) === 114, "в списке не 114 сур");
    check(!(await k.locator("#q-list .group-title").count()), "в списке сур не должно быть заголовков джузов");
    // у каждой суры число аятов совпадает с файлом суры, перевод — у каждого аята
    const bad = await k.evaluate(async () => {
      const idx = await (await fetch("quran/index.json")).json(), out = [];
      for (const x of idx.surahs) {
        const d = await (await fetch(`quran/${x.n}.json`)).json();
        if (d.ayahs.length !== x.ayahs || d.ayahs.some(a => !a.ru || !a.ar)) out.push(x.n);
      }
      return out;
    });
    check(!bad.length, "суры с неполными данными: " + bad.join(", "));
    const total = await k.evaluate(async () => (await (await fetch("quran/index.json")).json()).surahs.reduce((n, x) => n + x.ayahs, 0));
    check(total === 6236, "всего аятов не 6236: " + total);
    // басмалы нет перед «аль-Фатихой» (там она — первый аят) и перед «ат-Тауба»
    for (const [n, want] of [[1, 0], [9, 0], [2, 1]]) {
      await k.evaluate(n => openSurah(n), n); await W(k, 700);
      check((await k.locator(".q-basmala").count()) === want, `сура ${n}: басмала ${want ? "должна быть" : "не нужна"}`);
    }
    check((await k.locator(".q-ayah").count()) === 286, "в аль-Бакара не 286 аятов");
    check((await k.locator(".q-head").innerText()).includes("Джузы 1–3 · страницы 2–49"), "у аль-Бакара в заголовке не «Джузы 1–3 · страницы 2–49»");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 500);
    check(await k.evaluate(() => document.fonts.check('30px "QuranHafs"')), "шрифт мусхафа не загрузился");
    await k.click('.q-row[data-s="113"]'); await W(k, 800);
    check(await k.locator("#quran-read").isVisible() && await k.evaluate(() => document.getElementById("tabbar").classList.contains("away")),
      "сура не открылась или нижняя панель не уехала");
    check((await k.locator(".q-ayah").count()) === 5 && (await k.locator(".q-head h1").innerText()) === "аль-Фаляк", "у аль-Фаляк не 5 аятов");
    // текст мусхафа показан как есть — совпадает с данными символ в символ
    const same = await k.evaluate(async () => {
      const d = await (await fetch("quran/113.json")).json();
      return [...document.querySelectorAll(".q-ayah .q-ar")].every((el, i) => el.textContent === d.ayahs[i].ar);
    });
    check(same, "арабский текст на экране отличается от данных мусхафа");
    check(await k.locator(".q-basmala").isVisible(), "нет басмалы перед сурой");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-ru-toggle"); await W(k, 200);
    check(!(await k.locator(".q-ru").first().isVisible()), "перевод не прячется");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-ru-toggle"); await W(k, 200);
    check(await k.locator(".q-ru").first().isVisible(), "перевод не возвращается");
    await k.click('#qa-3 [data-act="mark"]'); await W(k, 200);
    check(await k.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("azkar-quran-marks"))) === '[{"s":113,"a":3}]'), "закладка не сохранилась");
    await k.evaluate(() => { const el = document.getElementById("qa-4"); el.scrollIntoView({ block: "start" }); }); await W(k, 600);
    check(await k.evaluate(() => JSON.parse(localStorage.getItem("azkar-quran-last")).a >= 3), "место чтения не запоминается при прокрутке");
    await k.click(".q-nav .next"); await W(k, 800);
    check((await k.locator(".q-head h1").innerText()) === "ан-Нас", "кнопка «Следующая» не открыла ан-Нас");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 800);
    check(!(await k.evaluate(() => document.getElementById("tabbar").classList.contains("away"))), "после «‹ Коран» нижняя панель не вернулась");
    const rows = await k.locator("#q-list .row:not(.q-row)").allInnerTexts();
    check(rows.length === 2 && rows[0].includes("Продолжить") && rows[1].includes("аль-Фаляк, аят 3"), "нет «Продолжить чтение» или закладки: " + JSON.stringify(rows));
    await k.locator("#q-list .row:not(.q-row)").nth(1).click(); await W(k, 900);
    check((await k.locator(".q-head h1").innerText()) === "аль-Фаляк" && await k.evaluate(() => {
      const r = document.getElementById("qa-3").getBoundingClientRect(); return r.top >= -2 && r.top < 120;
    }), "закладка не привела к аяту 3");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 600);
    await k.fill("#q-search", "наср"); await W(k, 300);
    check((await k.locator(".q-row").count()) === 1, "поиск «наср» нашёл не одну суру");
    await k.fill("#q-search", "фил"); await W(k, 300);
    check((await k.locator(".q-row").count()) === 1, "поиск без «аль-» («фил») не работает");
    await k.fill("#q-search", "112"); await W(k, 300);
    check((await k.locator(".q-row").count()) === 1, "поиск по номеру не работает");
    await k.fill("#q-search", "");
    // Переход по номеру: «2:255» в поиске, список джузов, кнопка «К аяту»
    const atTop = n => k.evaluate(n => { const r = document.getElementById("qa-" + n).getBoundingClientRect(); return r.top >= -2 && r.top < 140; }, n);
    await k.fill("#q-search", "2:255"); await W(k, 300);
    check((await k.locator(".q-jump").innerText()).includes("Перейти к аяту 255"), "поиск «2:255» не предлагает перейти");
    await k.click(".q-jump"); await W(k, 900);
    check((await k.locator(".q-head h1").innerText()) === "аль-Бакара" && await atTop(255), "переход к 2:255 не сработал");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 500);
    await k.fill("#q-search", "2 300"); await W(k, 300);
    check((await k.locator(".q-jump.soon").innerText()).includes("286"), "для 2:300 нет подсказки, что в суре 286 аятов");
    await k.fill("#q-search", "36:1"); await k.press("#q-search", "Enter"); await W(k, 900);
    check((await k.locator(".q-head h1").innerText()) === "Йа Син", "Enter в поиске «36:1» не открыл суру");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 500);
    await k.fill("#q-search", "");
    await k.click('#q-switch [data-view="juzs"]'); await W(k, 500);
    check((await k.locator(".q-row").count()) === 30 && !(await k.locator("#q-search").isVisible()), "в режиме «Джузы» не 30 строк или виден поиск");
    check(!(await k.locator("#q-list .q-ar-name").count()), "в списке джузов справа не должно быть названий сур");
    // начала джузов — как в мединском мусхафе (quran.com); 4-й и 11-й раньше были с ошибкой
    const juzRows = (await k.locator(".q-row small").allInnerTexts()).map(t => t.trim());
    check(juzRows[3] === "3:93 · Стр. 62" && juzRows[10] === "9:93 · Стр. 201" && juzRows[29] === "78:1 · Стр. 582",
      "начала 4-го, 11-го или 30-го джуза не как в мединском мусхафе: " + [juzRows[3], juzRows[10], juzRows[29]].join(" | "));
    check((await k.locator(".q-row").nth(8).innerText()).replace(/\s+/g, " ").includes("Джуз 9 7:88 · Стр. 162"), "строка джуза 9 должна быть «Джуз 9 · 7:88 · Стр. 162»");
    await k.locator(".q-row").nth(1).click(); await W(k, 900);
    check((await k.locator(".q-head h1").innerText()) === "аль-Бакара" && await atTop(142), "джуз 2 не открыл аль-Бакара, 142");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 500);
    check(await k.evaluate(() => localStorage.getItem("azkar-quran-view")) === '"juzs"', "выбор «Джузы» не запомнился");
    await k.click('#q-switch [data-view="surahs"]'); await W(k, 500);
    await k.click('.q-row[data-s="2"]'); await W(k, 900);
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-go"); await W(k, 400);
    check(await k.locator("#q-go-sheet").isVisible() && (await k.locator("#q-go-hint").innerText()).includes("1–286"), "окно «К аяту» не открылось");
    await k.fill("#q-go-input", "999"); await k.click("#q-go-yes"); await W(k, 300);
    check(await k.locator("#q-go-sheet").isVisible() && await k.locator("#q-go-hint.bad").isVisible(), "неверный номер должен оставить окно и показать подсказку");
    await k.fill("#q-go-input", "100"); await k.press("#q-go-input", "Enter"); await W(k, 700);
    check(!(await k.locator("#q-go-sheet").isVisible()) && await atTop(100), "«К аяту» 100 не прокрутил к аяту");
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 500);
    // аят с земным поклоном помечен
    await k.evaluate(() => openSurah(96)); await W(k, 800);
    check((await k.locator("#qa-19 .q-sajda").count()) === 1 && (await k.locator(".q-sajda").count()) === 1, "нет пометки земного поклона у 96:19");
    const sajdas = await k.evaluate(async () => (await (await fetch("quran/index.json")).json()).surahs.reduce((n, x) => n + x.sajda.length, 0));
    check(sajdas === 15, "аятов с земным поклоном не 15: " + sajdas);
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 500);
    // 5 подписей внизу помещаются на узком экране
    for (const w of [320, 390]) {
      await k.setViewportSize({ width: w, height: 700 }); await W(k, 200);
      const over = await k.evaluate(() => [...document.querySelectorAll(".tab-item")].filter(t => t.scrollWidth > t.clientWidth + 1).length);
      check(over === 0, `${w}px: подписи вкладок не помещаются`);
    }
    await ctx.close();
  }
  {
    // Смахивание вправо на странице суры — назад к списку. Настоящие касания (как на iPhone)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
    const k = await ctx.newPage(); k.on("pageerror", e => errs.push(e.message));
    await k.goto(URL); await W(k, 400);
    const cdp = await ctx.newCDPSession(k);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const gesture = async (x0, y0, dx, dy, steps = 10, pause = 16) => {
      await touch("touchStart", x0, y0);
      for (let i = 1; i <= steps; i++) { await touch("touchMove", x0 + dx * i / steps, y0 + dy * i / steps); await W(k, pause); }
      await touch("touchEnd"); await W(k, 500);
    };
    const onSurah = () => k.locator("#quran-read").isVisible();
    await k.click("#tab-home"); await k.click("#go-quran"); await W(k, 700);
    await k.click('.q-row[data-s="78"]'); await W(k, 800);
    await gesture(60, 400, 0, -250);
    check(await onSurah() && await k.evaluate(() => document.getElementById("quran-read").scrollTop > 100), "вертикальная прокрутка не работает или закрыла суру");
    await gesture(60, 400, 140, 140);
    check(await onSurah(), "косое движение (почти прокрутка) не должно закрывать суру");
    await gesture(60, 400, 80, 0, 10, 60);
    check(await onSurah() && await k.evaluate(() => !document.getElementById("quran-read").style.transform), "короткое медленное движение вбок не должно закрывать суру");
    await gesture(40, 400, 260, 10);
    check(await k.locator("#quran").isVisible() && !(await onSurah()), "чёткий свайп вправо не вернул к списку сур");
    check(await k.evaluate(() => !document.getElementById("quran-read").style.transform), "после свайпа страница суры осталась сдвинутой");
    await k.click('.q-row[data-s="79"]'); await W(k, 800);
    await gesture(40, 400, -260, 0);
    check(await onSurah(), "свайп влево не должен закрывать суру");
    // список сур → главная; Дуа → главная; тема дуа → список тем
    const vis = id => k.locator("#" + id).isVisible();
    await k.click("#q-back"); await W(k, 500);
    await gesture(60, 400, 0, -250);
    check(await vis("quran"), "прокрутка списка сур закрыла Коран");
    await gesture(40, 400, 260, 10);
    check(await vis("home") && await k.evaluate(() => !document.getElementById("quran").style.transform), "свайп вправо в списке сур не вернул на главную");
    // в виде «Джузы» — тоже на главную; сура, открытая из джуза, возвращает к джузам
    await k.click("#go-quran"); await W(k, 700);
    await k.click('#q-switch [data-view="juzs"]'); await W(k, 500);
    await gesture(40, 400, 260, 10);
    check(await vis("home"), "свайп вправо в списке джузов не вернул на главную");
    await k.click("#go-quran"); await W(k, 700);
    await k.locator("#q-list button").first().click(); await W(k, 800);
    await gesture(40, 400, 260, 10);
    check(await vis("quran") && await k.evaluate(() => qView) === "juzs", "из суры, открытой через джуз, свайп не вернул к джузам");
    await k.click('#q-switch [data-view="surahs"]'); await W(k, 400);
    await gesture(40, 400, 260, 10);
    await k.click("#go-duas"); await W(k, 600);
    await gesture(40, 400, -260, 0);
    check(await vis("duas"), "свайп влево не должен закрывать Дуа");
    await gesture(60, 400, 80, 0, 10, 60);
    check(await vis("duas"), "короткое медленное движение вбок закрыло Дуа");
    await gesture(40, 400, 260, 10);
    check(await vis("home"), "свайп вправо в Дуа не вернул на главную");
    await k.click("#go-duas"); await W(k, 600);
    await k.click('[data-cat="eat-before"]'); await W(k, 600);
    await gesture(40, 400, 260, 10);
    check(await vis("duas") && !(await vis("dua-read")), "свайп вправо на теме дуа не вернул к списку тем");
    check(!(await k.locator(".pressed").count()), "после свайпа осталась подсветка нажатия");
    await ctx.close();
  }

  {
    // Режим «Мусхаф»: страницы как в печатном мусхафе, листание касаниями, «К аяту», выбор режима запоминается
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
    const k = await ctx.newPage(); k.on("pageerror", e => errs.push(e.message));
    await k.goto(URL); await k.evaluate(() => localStorage.clear()); await k.reload(); await W(k, 400);
    const cdp = await ctx.newCDPSession(k);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const swipe = async dx => { await touch("touchStart", 195 - dx / 2, 420); for (let i = 1; i <= 10; i++) { await touch("touchMove", 195 - dx / 2 + dx * i / 10, 421); await W(k, 16); } await touch("touchEnd"); await W(k, 900); };
    const page = () => k.evaluate(() => mCurrent() && mCurrent().dataset.page);
    await k.click("#tab-home"); await k.click("#go-quran"); await W(k, 700);
    await k.click('.q-row[data-s="104"]'); await W(k, 800);
    await k.click('#q-mode [data-mode="mushaf"]'); await W(k, 1500);
    check(await k.locator("#q-mushaf").isVisible() && !(await k.locator("#q-ayahs").isVisible()), "режим «Мусхаф» не включился");
    check(await page() === "601", "аль-Хумаза должна открыться на странице 601, а не " + await page());
    const p601 = await k.evaluate(() => { const el = document.querySelector('.mp[data-page="601"]');
      return { lines: el.querySelectorAll(".mp-lines > *").length, heads: [...el.querySelectorAll(".mh")].map(h => h.textContent.trim()), bas: el.querySelectorAll(".mb").length,
        over: [...el.querySelectorAll(".ml")].filter(l => l.scrollWidth > l.clientWidth + 2).length,
        font: getComputedStyle(el.querySelector(".mp-lines")).fontFamily, fontOk: document.fonts.check("20px qcf-p601") }; });
    check(p601.lines === 15 && p601.heads.length === 3 && p601.bas === 3, "на стр. 601 не 15 строк / 3 заголовка / 3 басмалы: " + JSON.stringify(p601));
    check(p601.over === 0, "строки страницы 601 вылезают за край: " + p601.over);
    check(p601.fontOk && p601.font.includes("qcf-p601"), "шрифт страницы 601 не загрузился");
    const numFit = await k.evaluate(() => { const r = document.querySelector('.mp[data-page="601"] .mp-num').getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; });
    check(numFit, "номер страницы внизу мусхафа не помещается на экран");
    await swipe(240);
    check(await page() === "602", "свайп вправо должен открыть следующую страницу (602), а открыл " + await page());
    check(await k.locator("#quran-read").isVisible(), "свайп в мусхафе не должен закрывать суру");
    await swipe(-240);
    check(await page() === "601", "свайп влево должен вернуть на страницу 601");
    // Быстрое листание: в памяти только ближние страницы и их шрифты (иначе на телефоне вкладка падает — серый экран)
    for (let i = 0; i < 12; i++) { await k.evaluate(() => { const b = document.getElementById("q-mushaf"); b.scrollBy({ left: b.clientWidth, behavior: "instant" }); }); await W(k, 100); }
    await W(k, 1500);
    const mem = await k.evaluate(() => ({ done: document.querySelectorAll(".mp[data-done]").length, fonts: [...document.fonts].filter(f => f.family.startsWith("qcf-p")).length }));
    check(mem.done <= 7 && mem.fonts <= 9, "после быстрого листания в памяти лишние страницы: " + JSON.stringify(mem));   // текущая ±3 и шрифты ±4
    await k.evaluate(() => mOpen(104, 1)); await W(k, 1200);
    check(await page() === "601", "после листания «аль-Хумаза» не открылась на 601");
    // Кнопки сверху прячутся сами и появляются по нажатию на страницу
    await W(k, 4300);
    check(await k.evaluate(() => getComputedStyle(document.querySelector("#quran-read .topbar")).opacity) === "0", "кнопки над мусхафом не спрятались через 4 с");
    await k.tap(".q-mushaf", { position: { x: 195, y: 420 } }); await W(k, 300);
    check(await k.evaluate(() => getComputedStyle(document.querySelector("#quran-read .topbar")).opacity) === "1", "нажатие на страницу не показало кнопки");
    // Короткая строка (конец суры) — по центру без растяжки, полная — по ширине
    const ln = await k.evaluate(() => [...document.querySelectorAll('.mp[data-page="602"] .ml')].map(l => {
      const sp = [...l.querySelectorAll("span")].map(x => x.getBoundingClientRect()), r = l.getBoundingClientRect();
      return { full: !l.classList.contains("c"), left: Math.min(...sp.map(x => x.left)) - r.left, right: r.right - Math.max(...sp.map(x => x.right)) }; }));
    check(ln.some(l => !l.full) && ln.filter(l => !l.full).every(l => Math.abs(l.left - l.right) < 3),
      "короткие строки стр. 602 не по центру: " + JSON.stringify(ln.filter(l => !l.full)));
    check(ln.filter(l => l.full).every(l => l.left < 4 && l.right < 4), "полные строки стр. 602 не от края до края: " + JSON.stringify(ln.filter(l => l.full)));
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-go"); await W(k, 400);
    await k.fill("#q-go-input", "5"); await k.press("#q-go-input", "Enter"); await W(k, 900);
    check(await page() === "601", "«К аяту» 104:5 должен остаться на странице 601");
    await k.evaluate(() => mOpen(1, 1)); await W(k, 900);
    const p1 = await k.evaluate(() => { const el = document.querySelector('.mp[data-page="1"]'); const h = el.querySelector(".mh");
      return { lines: el.querySelectorAll(".mp-lines > *").length, special: el.classList.contains("special"), headH: h.getBoundingClientRect().height }; });
    check(p1.lines === 8 && p1.special && p1.headH > 24, "страница 1: не 8 строк или сплющен заголовок: " + JSON.stringify(p1));
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-back"); await W(k, 600);
    check(await k.evaluate(() => localStorage.getItem("azkar-quran-mode")) === '"mushaf"', "режим «Мусхаф» не запомнился");
    await k.click('.q-row[data-s="114"]'); await W(k, 1200);
    check(await k.locator("#q-mushaf").isVisible() && await page() === "604", "сура должна открываться сразу в мусхафе на своей странице (604)");
    await k.click('#q-mode [data-mode="text"]'); await W(k, 800);
    check(await k.locator("#q-ayahs").isVisible() && (await k.locator(".q-head h1").innerText()) === "ан-Нас", "из мусхафа в текст не вернулось на ан-Нас");
    // «Страница» в тексте: открывает суру и аят, с которых начинается страница (по раскладке мусхафа), и подсвечивает его
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-page"); await W(k, 400);
    check((await k.locator("#q-go-title").innerText()) === "Перейти к странице", "кнопка «Страница» не открыла окно страницы");
    await k.fill("#q-go-input", "605"); await k.press("#q-go-input", "Enter"); await W(k, 300);
    check(await k.locator("#q-go-hint.bad").isVisible(), "страница 605 должна дать подсказку об ошибке");
    await k.fill("#q-go-input", "300"); await k.press("#q-go-input", "Enter"); await W(k, 1500);
    const p300 = await k.evaluate(() => ({ h: document.querySelector(".q-head h1").innerText, f: document.querySelector(".q-ayah.flash")?.id }));
    check(p300.h === "аль-Кахф" && p300.f === "qa-54", "«Страница 300» в тексте должна открыть аль-Кахф, аят 54: " + JSON.stringify(p300));
    // Текст прокручен: кнопки сверху спрятаны, нажатие на экран показывает их
    const ctlOp = () => k.evaluate(() => getComputedStyle(document.getElementById("q-ctl")).opacity);
    await k.evaluate(() => { mControls(false); document.getElementById("quran-read").scrollBy(0, 400); }); await W(k, 500);
    check(await ctlOp() === "0", "в прокрученном тексте кнопки сверху не спрятались");
    await k.tap("#q-ayahs", { position: { x: 120, y: 200 } }); await W(k, 400);
    check(await ctlOp() === "1", "нажатие на текст не показало кнопки сверху");
    // «Страница» в мусхафе
    await k.click('#q-mode [data-mode="mushaf"]'); await W(k, 1500);
    await k.evaluate(() => mControls(true)); await W(k, 300);
    await k.evaluate(() => mControls(true)); await W(k, 250); await k.click("#q-page"); await W(k, 400);
    await k.fill("#q-go-input", "450"); await k.press("#q-go-input", "Enter"); await W(k, 2000);
    check(await page() === "450", "«Страница 450» в мусхафе открыла " + await page());
    await ctx.close();
  }

  section("Чтецы: кнопки на всех сурах, аят / сура / аяты с…по, долгое нажатие в мусхафе, скачать и слушать без интернета");
  {
    // Сервер чтецов подменяем записью ан-Нас (Хусари) из tests/fixtures — она же настоящая для husary/114
    const MP3 = require("fs").readFileSync(require("path").join(__dirname, "fixtures", "husary-114.mp3"));
    const browser2 = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
    const ctx = await browser2.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
    let offline = false;
    await ctx.route("https://download.quranicaudio.com/**", r => offline ? r.abort()
      : r.fulfill({ status: 200, headers: { "content-type": "audio/mpeg", "access-control-allow-origin": "*" }, body: MP3 }));
    const k = await ctx.newPage();
    k.on("pageerror", e => errs.push(e.message));
    await k.goto(URL); await k.evaluate(() => localStorage.clear()); await k.reload(); await W(k, 500);
    await k.click("#tab-home"); await k.click("#go-quran"); await W(k, 600);
    await k.click('.q-row[data-s="2"]'); await W(k, 1200);
    check(await k.locator('[data-act="listen"]').count() === 286 && await k.locator("#q-listen-surah").isVisible(), "у аль-Бакары нет кнопок «Слушать»");
    // Окно «Слушать» прокручено вниз: палец вниз прокручивает его вверх, а не закрывает. Сверху — закрывает
    {
      await k.setViewportSize({ width: 390, height: 520 });   // на низком экране окно «Слушать» прокручивается
      await k.click("#q-listen-surah"); await W(k, 600);
      const sh = k.locator("#q-listen-sheet .sheet"), cdp = await ctx.newCDPSession(k);
      const drag = async step => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 300 }] });
        for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 300 + i * step }] }); await W(k, 16); }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await W(k, 600);
      };
      await sh.evaluate(e => { e.scrollTop = e.scrollHeight; }); await W(k, 200);
      const st0 = await sh.evaluate(e => e.scrollTop);
      await drag(25);
      check(st0 > 0 && await k.locator("#q-listen-sheet").isVisible() && await sh.evaluate(e => e.scrollTop) < st0,
        "прокрученное окно «Слушать» закрылось вместо прокрутки вверх");
      await sh.evaluate(e => { e.scrollTop = 0; }); await W(k, 100);
      await drag(30);
      check(!(await k.locator("#q-listen-sheet").isVisible()), "окно «Слушать» не закрылось смахиванием сверху");
      await k.setViewportSize({ width: 390, height: 780 }); await W(k, 300);
    }
    await k.evaluate(() => mControls(true)); await k.click("#q-back"); await W(k, 500);
    await k.click('.q-row[data-s="114"]'); await W(k, 900);
    // аят 3 — Хусари: играет с сервера, подсвечен, после аята — стоп
    await k.click('#qa-3 [data-act="listen"]'); await W(k, 500);
    // «Чтец ›» открывает окно со всеми чтецами поверх; выбрал — оно закрылось, в строке новый чтец
    await k.click("#ql-rec-open"); await W(k, 400);
    check(await k.locator("#q-rec-sheet").isVisible() && await k.locator("#q-rec-sheet [data-rec]").count() === 12, "окно «Чтецы» не открылось или там не 12 чтецов");
    // у всех чтецов разметка всех сур читается, аятов столько, сколько в суре, записи — с сервера чтецов
    const recAll = await k.evaluate(async () => {
      const bad = [];
      for (const r of qRec.reciters) for (const s of [1, 2, 36, 114]) {
        const d = await qGet(`audio/${r.id}/${s}`), n = qSurah(s).ayahs;
        if (d.ayahs.length !== n || !d.url.startsWith("https://download.quranicaudio.com/") || !(d.size > 0)
          || d.ayahs.some(([f, t], i) => !(t > f) || (i && f < d.ayahs[i - 1][0]))) bad.push(`${r.id}/${s}`);
      }
      return { n: qRec.reciters.length, ids: new Set(qRec.reciters.map(r => r.id)).size, bad };
    });
    check(recAll.n === 12 && recAll.ids === 12 && recAll.bad.length === 0, "разметка чтецов с ошибками: " + JSON.stringify(recAll));
    await k.click('#q-rec-sheet [data-rec="husary"]'); await W(k, 500);
    check(!(await k.locator("#q-rec-sheet").isVisible()) && await k.locator("#q-listen-sheet").isVisible(), "после выбора чтеца не вернулись в окно «Слушать»");
    check((await k.locator("#ql-rec-name").innerText()) === "Махмуд Халиль аль-Хусари", "в окне «Слушать» не показан выбранный чтец");
    await k.click("#ql-rec-open"); await W(k, 400); await k.click("#qr-back"); await W(k, 400);
    check(!(await k.locator("#q-rec-sheet").isVisible()) && await k.locator("#q-listen-sheet").isVisible() && await k.evaluate(() => qListen.rec) === "husary",
      "«‹ Назад» на странице «Чтецы» не вернул в окно «Слушать» (или сменил чтеца)");
    await k.click("#ql-go"); await W(k, 1500);
    const a3 = await k.evaluate(() => ({ a: qPlay.a, src: qPlay.src, hl: document.querySelector(".q-ayah.playing")?.id }));
    check(await k.evaluate(() => !document.querySelector(".q-ar span, .pw")), "слова в тексте всё ещё подсвечиваются (решили подсвечивать только аят)");
    check(a3.a === 3 && a3.hl === "qa-3" && a3.src.startsWith("https://download.quranicaudio.com/"), "аят 3 не играет с сервера чтецов: " + JSON.stringify(a3));
    // значки на панели чтеца — ровно по центру кружков (на iPhone 11 со старой iOS уезжали вправо)
    const iconOff = await k.evaluate(() => ["qp-toggle", "qp-repeat", "qp-stop"].map(id => {
      const b = document.getElementById(id).getBoundingClientRect(), i = [...document.getElementById(id).querySelectorAll("svg")].find(x => getComputedStyle(x).display !== "none").getBoundingClientRect();
      return Math.max(Math.abs(b.x + b.width / 2 - i.x - i.width / 2), Math.abs(b.y + b.height / 2 - i.y - i.height / 2));
    }));
    check(iconOff.every(d => d < 1), "значки на панели чтеца не по центру кружков: " + JSON.stringify(iconOff));
    check(await k.evaluate(() => getComputedStyle(document.getElementById("q-player").querySelector("button")).paddingLeft) === "0px", "у кнопок панели чтеца остались поля");
    // подсветка звучащего аята видна, и у неё есть запасной цвет для iOS старше 16.2 (там нет color-mix)
    check(await k.evaluate(() => { const c = getComputedStyle(document.getElementById("qa-3")).backgroundColor; return c !== "rgba(0, 0, 0, 0)" && c !== "transparent"; }), "звучащий аят не подсвечен");
    const fb = await k.evaluate(() => { const out = { flash: false, pa: false };
      for (const sh of document.styleSheets) for (const r of sh.cssRules) {
        if (r.selectorText === ":root" && /rgba\(52, 199, 89, 0?\.24\)/.test(r.style.getPropertyValue("--flash"))) out.flash = true;
        if (r.selectorText === ".ml span.pa" && /rgba\(52, 199, 89, 0?\.12\)/.test(r.style.background)) out.pa = true;
      } return out; });
    check(fb.flash && fb.pa, "нет запасного цвета подсветки для старых iPhone: " + JSON.stringify(fb));
    await W(k, 5000);
    check(await k.evaluate(() => qPlay.s === 0 && document.getElementById("q-player").hidden), "после конца аята 3 чтение не остановилось");
    check(await k.evaluate(() => localStorage.getItem("azkar-reciter")) === '"husary"', "выбранный чтец не запомнился");
    // повтор: аят 2 (≈4,8 с) идёт по кругу; кнопка запоминается
    await k.click('#qa-2 [data-act="listen"]'); await W(k, 500); await k.click("#ql-go"); await W(k, 800);
    await k.click("#qp-repeat"); await W(k, 300);
    check(await k.evaluate(() => localStorage.getItem("azkar-repeat")) === "true", "повтор не запомнился");
    await W(k, 6500);
    const rp = await k.evaluate(() => ({ s: qPlay.s, a: qPlay.a, paused: qPlay.el.paused, t: qPlay.el.currentTime }));
    check(rp.s === 114 && rp.a === 2 && !rp.paused && rp.t > 7.5 && rp.t < 12.8, "повтор аята 2 не пошёл по кругу: " + JSON.stringify(rp));
    check(await k.evaluate(() => document.getElementById("q-player").classList.contains("away")), "панель чтеца не спряталась вместе с кнопками (текст)");
    await k.evaluate(() => mControls(true)); await W(k, 300);   // нажатие на экран — панель снова видна
    await k.click("#qp-repeat"); await W(k, 200);
    // ушли со страницы суры — чтение остановилось
    await k.evaluate(() => mControls(true)); await k.click("#q-back"); await W(k, 500);
    check(await k.evaluate(() => qPlay.s === 0 && qPlay.el.paused && document.getElementById("q-player").hidden), "после выхода из суры чтец не замолчал");
    await k.click('.q-row[data-s="114"]'); await W(k, 900);
    // скачать суру → без интернета играет из памяти телефона
    await k.click('#qa-1 [data-act="listen"]'); await W(k, 500);
    await k.click('[data-dl="one"]'); await W(k, 1500);
    check((await k.locator("#ql-dl").innerText()).includes("Эта сура скачана"), "сура не скачалась");
    offline = true;
    await k.click("#ql-go"); await W(k, 1500);
    const off = await k.evaluate(() => ({ a: qPlay.a, src: qPlay.src.slice(0, 5), paused: qPlay.el.paused }));
    check(off.a === 1 && off.src === "blob:" && !off.paused, "скачанная сура не играет без интернета: " + JSON.stringify(off));
    await k.click("#qp-stop"); offline = false;
    // удалить — со второго нажатия
    await k.click('#qa-1 [data-act="listen"]'); await W(k, 500);
    await k.click('[data-dl="del1"]'); await W(k, 200);
    check(await k.evaluate(() => qDb.keys.size) === 1, "сура удалилась с первого нажатия");
    await k.click('[data-dl="del1"]'); await W(k, 600);
    check(await k.evaluate(() => qDb.keys.size) === 0 && (await k.locator("#ql-dl").innerText()).includes("Скачать эту суру"), "сура не удалилась");
    await k.mouse.click(200, 30); await W(k, 400);
    // мусхаф: долгое нажатие на аль-Фаляк 2 (на одной странице с ан-Нас), диапазон 2–4
    await k.evaluate(() => mControls(true)); await k.click('#q-mode [data-mode="mushaf"]'); await W(k, 2500);
    const box = await k.locator('.mp[data-page="604"] [data-k="113:2"]').first().boundingBox();
    const cdp = await ctx.newCDPSession(k);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] }); await W(k, 700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await W(k, 400);
    check(await k.locator("#q-listen-sheet").isVisible() && (await k.locator("#ql-ayah-t").innerText()) === "Аят 2", "долгое нажатие в мусхафе не открыло окно с аятом 2");
    check(await k.evaluate(() => qListen.rec) === "husary" && !(await k.locator("#q-rec-sheet").isVisible()), "палец, отпущенный после долгого нажатия, сменил чтеца или открыл окно «Чтецы»");
    await k.selectOption("#ql-to", "4"); await W(k, 200);
    const pageBox = () => k.evaluate(() => { const r = document.querySelector('.mp[data-page="604"] .mp-lines').getBoundingClientRect(); return Math.round(r.top) + "/" + Math.round(r.height); });
    const box0 = await pageBox();
    await k.click("#ql-go"); await W(k, 1500);
    check(await pageBox() === box0, "панель чтеца сдвинула страницу мусхафа");
    const away = () => k.evaluate(() => document.getElementById("q-player").classList.contains("away"));
    check(!(await away()), "при начале чтения панель не видна");
    const m = await k.evaluate(() => ({ s: qPlay.s, from: qPlay.from, to: qPlay.to, pa: document.querySelector(".ml span.pa")?.dataset.k }));
    check(m.s === 113 && m.from === 2 && m.to === 4 && m.pa === "113:2", "аяты 2–4 аль-Фаляк в мусхафе: " + JSON.stringify(m));
    await W(k, 4000);
    check(await away(), "панель чтеца не спряталась вместе с кнопками сверху");
    await k.tap("#q-mushaf", { position: { x: 200, y: 400 } }); await W(k, 400);
    check(!(await away()), "нажатие на мусхаф не показало панель чтеца");
    // аят на другой странице: мусхаф перелистывается, и аят подсвечен, когда страница дорисуется
    await k.evaluate(async () => { await qPrep("afasy", 1); qPlayStart(1, 2, 3, "afasy"); }); await W(k, 1500);
    const jump = await k.evaluate(() => ({ a: qPlay.a, page: mCurrent()?.dataset.page, pa: [...new Set([...document.querySelectorAll(".ml span.pa")].map(e => e.dataset.k))] }));
    check(jump.a === 2 && jump.page === "1" && jump.pa.join() === "1:2", "после перелистывания аят в мусхафе не подсвечен: " + JSON.stringify(jump));
    await browser2.close();
  }

  section("Напоминания: только в приложении, разрешение, расписание на 30 дней, без напоминания после прочтения");
  {
    // На сайте раздела нет
    const ctx0 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const w = await ctx0.newPage(); w.on("pageerror", e => errs.push(e.message));
    await w.goto(URL); await W(w, 300);
    check(await w.locator("#remind-group").isHidden(), "на сайте видны напоминания, хотя там они не работают");
    await ctx0.close();
    // «Приложение»: подменяем Capacitor и плагин уведомлений, запоминаем, что приложение им передаёт
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      window.__n = { pending: [], asked: 0, grant: "granted", listeners: {} };
      const N = {
        requestPermissions: async () => { window.__n.asked++; return { display: window.__n.grant }; },
        cancel: async ({ notifications }) => { const ids = notifications.map(x => x.id); window.__n.pending = window.__n.pending.filter(x => !ids.includes(x.id)); },
        schedule: async ({ notifications }) => { window.__n.pending.push(...notifications); },
        addListener: (name, fn) => { window.__n.listeners[name] = fn; },
      };
      window.Capacitor = { isNativePlatform: () => true, Plugins: { Haptics: { impact: async () => {} }, LocalNotifications: N } };
    });
    const a = await ctx.newPage(); a.on("pageerror", e => errs.push(e.message));
    await a.goto(URL); await a.evaluate(() => localStorage.clear()); await a.reload(); await W(a, 400);
    await a.click("#tab-settings"); await W(a, 400);
    check(await a.locator("#remind-group").isVisible(), "в приложении нет раздела «Напоминания»");
    check(await a.evaluate(() => document.querySelector("#settings .group").id === "remind-group"), "«Напоминания» должны быть в самом верху настроек");
    check(await a.locator("#rt-morning").isHidden(), "время видно, хотя напоминание выключено");
    // отказали в разрешении — переключатель остаётся выключенным
    await a.evaluate(() => window.__n.grant = "denied");
    await a.click("#rs-morning"); await W(a, 300);
    check((await a.getAttribute("#rs-morning", "aria-checked")) === "false", "без разрешения напоминание включилось");
    // разрешили — 30 утренних уведомлений, первое — не раньше, чем сейчас
    await a.evaluate(() => window.__n.grant = "granted");
    await a.click("#rs-morning"); await W(a, 300);
    let st = await a.evaluate(() => ({ n: __n.pending.length, ids: __n.pending.map(x => x.id), open: __n.pending.every(x => x.extra.open === "morning"),
      future: __n.pending.every(x => new Date(x.schedule.at) > new Date()), times: [...new Set(__n.pending.map(x => new Date(x.schedule.at).getHours() + ":" + new Date(x.schedule.at).getMinutes()))] }));
    check(st.n >= 29 && st.n <= 30 && st.open && st.future && st.times.join() === "7:0", "утренние напоминания расписаны неверно: " + JSON.stringify(st).slice(0, 200));
    check(await a.locator("#rt-morning").isVisible(), "после включения не видно время");
    // поменяли время — всё переставлено, повторов нет
    await a.fill("#rt-morning", "05:45"); await a.dispatchEvent("#rt-morning", "change"); await W(a, 300);
    st = await a.evaluate(() => ({ n: __n.pending.length, uniq: new Set(__n.pending.map(x => x.id)).size, times: [...new Set(__n.pending.map(x => { const d = new Date(x.schedule.at); return d.getHours() + ":" + d.getMinutes(); }))] }));
    check(st.n === st.uniq && st.times.join() === "5:45", "после смены времени напоминания задвоились или время не то: " + JSON.stringify(st));
    // вечер тоже
    await a.click("#rs-evening"); await W(a, 300);
    check(await a.evaluate(() => __n.pending.filter(x => x.extra.open === "evening").length >= 29), "вечерние напоминания не поставлены");
    // утренние прочитаны → сегодняшнего утреннего напоминания нет, завтрашнее есть
    await a.evaluate(() => { const c = {}; setItems("morning").forEach(z => c["morning:" + z.id] = z.times); localStorage.setItem(KEY, JSON.stringify(c)); counts = c; updateHome(); });
    await W(a, 300);
    st = await a.evaluate(() => { const t = new Date(), same = d => d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
      const m = __n.pending.filter(x => x.extra.open === "morning").map(x => new Date(x.schedule.at));
      return { today: m.some(same), tomorrow: m.some(d => d.getDate() === new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getDate()) }; });
    check(!st.today && st.tomorrow, "после прочтения утренних сегодняшнее напоминание не убрано (или пропало завтрашнее): " + JSON.stringify(st));
    // нажали на уведомление — открылись вечерние азкары
    await a.evaluate(() => __n.listeners.localNotificationActionPerformed({ notification: { extra: { open: "evening" } } })); await W(a, 600);
    check(await a.locator("#reader").isVisible() && await a.evaluate(() => time === "evening"), "нажатие на уведомление не открыло вечерние азкары");
    // выключили утро — утренних не осталось
    await a.click("#back").catch(() => {}); await W(a, 300); await a.click("#tab-settings"); await W(a, 400);
    await a.click("#rs-morning"); await W(a, 300);
    check(await a.evaluate(() => !__n.pending.some(x => x.extra.open === "morning")), "после выключения утренние напоминания остались");
    // настройки сохраняются
    await a.reload(); await W(a, 400);
    check(await a.evaluate(() => !remind.morning.on && remind.morning.time === "05:45" && remind.evening.on), "настройки напоминаний не сохранились");
    await ctx.close();
  }

  section("Установка на телефон и работа без интернета");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const q = await ctx.newPage(); q.on("pageerror", e => errs.push(e.message));
    await q.goto(URL); await W(q, 1500);
    const name = await q.evaluate(async () => { const r = await fetch(document.querySelector("link[rel=manifest]").href); return r.ok ? (await r.json()).name : null; });
    check(name === "Hisn — азкары", "manifest не загрузился");
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
    await q.click("#tab-home"); await q.click("#go-quran"); await W(q, 800);
    await q.click('.q-row[data-s="112"]'); await W(q, 800);
    check((await q.locator(".q-ayah").count()) === 4, "без интернета сура не открылась");
    await ctx.close();
  }

  await browser.close();
  check(errs.length === 0, "ошибки JavaScript: " + errs.join("; "));
  console.log(fails.length ? "\nПРОБЛЕМЫ:\n - " + fails.join("\n - ") : "\nВСЁ В ПОРЯДКЕ");
  process.exit(fails.length ? 1 : 0);
})();
