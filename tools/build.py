"""
Сборка приложения «Азкары».

Берёт исходник src/app.html, встраивает в него тексты из src/data/*.json
(вместо меток __AZKAR_JSON__ и т.д.), шрифты и картинки (__FONT__, __IMG_MORNING__…)
и записывает:

  index.html          — готовое приложение для GitHub Pages и телефона
  quran/              — раздел «Коран»: по файлу на суру + шрифт мусхафа. Приложение
                        берёт их только при открытии суры, поэтому они не утяжеляют запуск
  build/preview.html  — то же без «шапки» для телефона
  build/standalone.html — предпросмотр одним файлом: Коран и его шрифт встроены внутрь
                        (отдельные файлы из одного HTML-файла не открыть)

Запуск из корня репозитория:
  python3 tools/build.py              — просто собрать
  python3 tools/build.py --version 4  — собрать и поменять версию в sw.js
                                         (нужно при каждой публикации, иначе
                                         телефоны покажут старую версию)
"""
import argparse
import base64
import json
import shutil
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# метка в исходнике → файл, который встраиваем вместо неё
EMBED = {
    "__FONT__": SRC / "fonts" / "kfgqpc-hafs-uthmanic.otf",
    "__GOLOS__": SRC / "fonts" / "golos-text.woff2",
    "__IMG_MORNING__": SRC / "images" / "morning.jpg",
    "__IMG_EVENING__": SRC / "images" / "evening.jpg",
}

# метка в исходнике → файл с данными (JSON), который вставляем как есть, текстом.
# JSON — это готовый кусок JavaScript, поэтому в app.html получается: const AYAT = [ ... ];
DATA = {
    "__AZKAR_JSON__": SRC / "data" / "azkar.json",
    "__AYAT_JSON__": SRC / "data" / "ayat.json",
    "__DUA_JSON__": SRC / "data" / "dua.json",
}

# Раздел «Коран»: данные (их готовит tools/make_quran.py) и шрифт Мединского мусхафа (KFGQPC Hafs v18)
QURAN_DATA = SRC / "data" / "quran"
QURAN_FONT = SRC / "fonts" / "kfgqpc-hafs-v18.ttf"
QURAN_OUT = ROOT / "quran"
# Режим «Мусхаф»: страницы (готовит tools/make_mushaf.py) и шрифты страниц QCF V2 — в quran/mushaf/.
# На сайте их не сохраняем заранее (604 шрифта — десятки МБ): страница кэшируется, когда её открыли.
# В приложении для iPhone они внутри сборки целиком
MUSHAF_DATA = SRC / "data" / "quran" / "mushaf"
MUSHAF_FONTS = SRC / "mushaf-fonts"

PWA_TAIL = """
<script>
  // Включаем офлайн-режим — только на сайте (http/https). Внутри iOS-приложения файла sw.js нет,
  // приложение и так работает без интернета; .catch — чтобы неудачная регистрация не давала ошибку
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
</script>
</body>
</html>
"""


def quran_inline() -> str:
    """Весь раздел «Коран» одним объектом — для предпросмотра одним файлом."""
    files = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(QURAN_DATA.glob("*.json"))}
    font = "data:font/ttf;base64," + base64.b64encode(QURAN_FONT.read_bytes()).decode()
    return json.dumps({"files": files, "font": font}, ensure_ascii=False, separators=(",", ":"))


def copy_quran() -> list:
    """Кладёт файлы Корана рядом с index.html (папка quran/). Возвращает их список для sw.js."""
    if QURAN_OUT.exists():
        shutil.rmtree(QURAN_OUT)
    QURAN_OUT.mkdir()
    names = []
    for p in sorted(QURAN_DATA.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))   # проверка + сжатие
        (QURAN_OUT / p.name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        names.append(p.name)
    shutil.copyfile(QURAN_FONT, QURAN_OUT / "hafs18.ttf")   # шрифт — без изменений (условие KFGQPC)
    names.append("hafs18.ttf")
    mus = QURAN_OUT / "mushaf"
    mus.mkdir()
    # Страницы мусхафа — блоками по 20 (pages-1.json = стр. 1–20 …): 31 файл вместо 604, меньше запросов
    (mus / "index.json").write_text(json.dumps(json.loads((MUSHAF_DATA / "index.json").read_text(encoding="utf-8")),
                                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    blocks = {}
    for f in MUSHAF_DATA.glob("[0-9]*.json"):
        n = int(f.stem)
        blocks.setdefault((n - 1) // 20 + 1, {})[n] = json.loads(f.read_text(encoding="utf-8"))
    # Шрифты страниц — тоже блоками: fonts-K.woff2 = файлы pN.woff2 этого блока подряд, без изменений (это не один
    # шрифт, а склейка; расширение .woff2 — чтобы любой сервер, и предпросмотр в Claude, отдавал файл как шрифт);
    # где какой шрифт лежит (смещение, длина) — в pages-K.json, поле "_f"
    for k, pages in blocks.items():
        out, pos, where = bytearray(), 0, {}
        for n in sorted(pages):
            font = (MUSHAF_FONTS / f"p{n}.woff2").read_bytes()
            where[str(n)] = [pos, len(font)]
            out += font
            pos += len(font)
        (mus / f"fonts-{k}.woff2").write_bytes(bytes(out))
        data = {str(n): pages[n] for n in sorted(pages)}
        data["_f"] = where
        (mus / f"pages-{k}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(SRC / "fonts" / "surah-header.woff2", mus / "surah-header.woff2")   # заголовки сур (QCF Surah Header)
    # Чтецы (пробно): записи сур и разметка времени аятов и слов (Quran Foundation, quranicaudio.com).
    # В sw.js заранее не сохраняем — запись сохраняется, когда её послушали
    if (SRC / "quran-audio").exists():
        shutil.copytree(SRC / "quran-audio", QURAN_OUT / "audio")
    return ["./quran/" + n for n in names]


def set_sw_quran(files: list) -> None:
    """Список файлов Корана в sw.js — чтобы сайт сохранил их и открывал суры без интернета."""
    sw = ROOT / "sw.js"
    text, count = re.subn(r"const QURAN_FILES = \[.*?\];", "const QURAN_FILES = " + json.dumps(files) + ";",
                          sw.read_text(encoding="utf-8"))
    assert count == 1, "в sw.js не найдена строка QURAN_FILES"
    sw.write_text(text, encoding="utf-8")


def build_preview(inline: bool = False) -> str:
    html = (SRC / "app.html").read_text(encoding="utf-8")
    html = html.replace("__QURAN_INLINE__", quran_inline() if inline else "null")
    for mark, path in DATA.items():
        assert mark in html, f"в src/app.html нет метки {mark}"
        text = path.read_text(encoding="utf-8")
        try:
            data = json.loads(text)   # проверяем файл до вставки: лишняя запятая или кавычка — понятная ошибка здесь,
        except json.JSONDecodeError as e:   # а не «белый экран» в приложении
            raise SystemExit(f"Ошибка в {path.relative_to(ROOT)}: строка {e.lineno}, столбец {e.colno}: {e.msg}")
        # в приложение — без отступов и переносов (файл меньше), сами тексты не меняются
        html = html.replace(mark, json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    for mark, path in EMBED.items():
        assert mark in html, f"в src/app.html нет метки {mark}"
        html = html.replace(mark, base64.b64encode(path.read_bytes()).decode())
    left = re.findall(r"__[A-Z_]+__", html)
    assert not left, f"остались невстроенные метки: {left}"
    return html


def build_pwa(preview: str) -> str:
    head = (SRC / "pwa-head.html").read_text(encoding="utf-8")
    # <title> и <style> приложения идут в <head>, всё остальное — в <body>
    cut = preview.index("</style>") + len("</style>")
    return head + preview[:cut] + "\n</head>\n<body>\n" + preview[cut:] + PWA_TAIL


def set_version(n: int) -> None:
    sw = ROOT / "sw.js"
    text, count = re.subn(r'const VERSION = "azkar-v\d+";', f'const VERSION = "azkar-v{n}";',
                          sw.read_text(encoding="utf-8"))
    assert count == 1, "в sw.js не найдена строка VERSION"
    sw.write_text(text, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Сборка приложения «Азкары»")
    ap.add_argument("--version", type=int, help="новая версия офлайн-кэша в sw.js")
    args = ap.parse_args()

    preview = build_preview()
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "build" / "preview.html").write_text(preview, encoding="utf-8")
    (ROOT / "index.html").write_text(build_pwa(preview), encoding="utf-8")
    set_sw_quran(copy_quran())
    # одним файлом, как полноценная страница (с viewport — иначе на телефоне всё мелкое)
    head = '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n' \
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    full = build_preview(inline=True)
    cut = full.index("</style>") + len("</style>")
    (ROOT / "build" / "standalone.html").write_text(
        head + full[:cut] + "\n</head>\n<body>\n" + full[cut:] + "\n</body>\n</html>\n", encoding="utf-8")
    if args.version:
        set_version(args.version)
    ver = re.search(r'azkar-v(\d+)', (ROOT / "sw.js").read_text(encoding="utf-8")).group(1)
    print(f"Собрано: index.html, build/preview.html | версия в sw.js: {ver}")


if __name__ == "__main__":
    main()
