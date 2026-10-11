"""
Сборка приложения «Азкары».

Берёт исходник src/app.html, встраивает в него шрифты и картинки
(вместо меток __FONT__, __IMG_MORNING__ и т.д.) и записывает:

  index.html          — готовое приложение для GitHub Pages и телефона
  build/preview.html  — то же без «шапки» для телефона (для предпросмотра в Claude)

Запуск из корня репозитория:
  python3 tools/build.py              — просто собрать
  python3 tools/build.py --version 4  — собрать и поменять версию в sw.js
                                         (нужно при каждой публикации, иначе
                                         телефоны покажут старую версию)
"""
import argparse
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# метка в исходнике → файл, который встраиваем вместо неё
EMBED = {
    "__FONT__": SRC / "fonts" / "kfgqpc-hafs-uthmanic.otf",
    "__NEXA_REGULAR__": SRC / "fonts" / "nexa-regular.otf",
    "__NEXA_BOLD__": SRC / "fonts" / "nexa-bold.otf",
    "__IMG_MORNING__": SRC / "images" / "morning.jpg",
    "__IMG_EVENING__": SRC / "images" / "evening.jpg",
}

PWA_TAIL = """
<script>
  // Включаем офлайн-режим
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
</script>
</body>
</html>
"""


def build_preview() -> str:
    html = (SRC / "app.html").read_text(encoding="utf-8")
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
    if args.version:
        set_version(args.version)
    ver = re.search(r'azkar-v(\d+)', (ROOT / "sw.js").read_text(encoding="utf-8")).group(1)
    print(f"Собрано: index.html, build/preview.html | версия в sw.js: {ver}")


if __name__ == "__main__":
    main()
