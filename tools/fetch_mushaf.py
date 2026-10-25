"""
Скачивает данные режима «Мусхаф» для всех 604 страниц (запускается на сервере GitHub Actions —
из среды Claude эти сайты недоступны). Только стандартная библиотека Python.

  1) Раскладка «KFGQPC V4 layout (1441H print)» — qul.tarteel.ai/resources/mushaf-layout/19?page=N:
     15 строк страницы → src/quran-src/mushaf/layout-v4.json (формат описан в tools/make_mushaf.py).
  2) Шрифты страниц QCF V4 — verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/pN.woff2
     → src/mushaf-fonts/pN.woff2 (без изменений).
  3) src/quran-src/mushaf/fetch-manifest.json — размер и SHA-256 каждого файла.
Запуск: python3 tools/fetch_mushaf.py [первая последняя]
"""
import hashlib
import html.parser
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LAYOUT = ROOT / "src" / "quran-src" / "mushaf" / "layout-v4.json"
FONTS = ROOT / "src" / "mushaf-fonts"
UA = {"User-Agent": "Mozilla/5.0 (Hisn azkar app; github.com/MAYRCOD/azkar)"}


def get(url: str, tries: int = 5) -> bytes:
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception as e:   # сеть иногда сбоит — повторяем с паузой
            if i == tries - 1:
                raise
            print("повтор", url, e, flush=True)
            time.sleep(3 * (i + 1))


class PageParser(html.parser.HTMLParser):
    """Строки страницы: line-container[data-line] → line (классы line--surah-name / line--bismillah / line--center),
    слова — span.char с data-location, знак конца аята — класс char-end"""
    def __init__(self):
        super().__init__()
        self.lines, self.cur, self.span, self.text = [], None, None, ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs); cls = a.get("class", "") or ""
        if "line-container" in cls.split():
            self.cur = {"n": int(a["data-line"]), "cls": "", "words": [], "txt": ""}
            self.lines.append(self.cur)
        elif self.cur is not None and re.search(r"(^|\s)line(\s|$)", cls) and not self.cur["cls"]:
            self.cur["cls"] = cls
        elif tag == "span" and "char" in cls.split() and self.cur is not None:
            self.span = [None, a.get("data-location"), "e" if "char-end" in cls.split() else "w"]
            self.text = ""

    def handle_endtag(self, tag):
        if tag == "span" and self.span is not None:
            self.span[0] = self.text.strip()
            self.cur["words"].append(self.span)
            self.span = None

    def handle_data(self, data):
        if self.span is not None:
            self.text += data
        elif self.cur is not None:
            self.cur["txt"] += data


def page_layout(n: int) -> list:
    p = PageParser()
    p.feed(get(f"https://qul.tarteel.ai/resources/mushaf-layout/19?page={n}").decode("utf-8"))
    out = []
    for l in p.lines:
        cls = l["cls"].split()
        if "line--surah-name" in cls:
            out.append([l["n"], "h", int(re.search(r"surah(\d+)", l["txt"]).group(1))])
        elif "line--bismillah" in cls:
            out.append([l["n"], "b"])
        else:
            out.append([l["n"], "w", 1 if "line--center" in cls else 0, l["words"]])
    assert [x[0] for x in out] == list(range(1, 16)), f"стр. {n}: строк {len(out)}"
    for x in out:
        if x[1] == "w":
            for w in x[3]:
                assert w[0] and re.fullmatch(r"\d+:\d+:\d+", w[1] or ""), f"стр. {n}: слово {w}"
    return out


def main() -> None:
    first, last = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1, 604)
    layout = json.loads(LAYOUT.read_text(encoding="utf-8")) if LAYOUT.exists() else {}
    manifest = {}
    for n in range(first, last + 1):
        layout[str(n)] = page_layout(n)
        font = get(f"https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/p{n}.woff2")
        assert font[:4] == b"wOF2", f"стр. {n}: не woff2"
        (FONTS / f"p{n}.woff2").write_bytes(font)
        manifest[n] = {"font_bytes": len(font), "font_sha256": hashlib.sha256(font).hexdigest()}
        print(n, len(font), flush=True)
        time.sleep(0.2)   # бережно к чужим серверам
    layout = {k: layout[k] for k in sorted(layout, key=int)}
    text = json.dumps(layout, ensure_ascii=False)
    LAYOUT.write_text(text, encoding="utf-8")
    manifest["layout_sha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    (LAYOUT.parent / "fetch-manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    print("готово:", len(layout), "страниц")


if __name__ == "__main__":
    main()
