"""
Готовит страницы режима «Мусхаф» — 604 страницы, как в печатном Мединском мусхафе.

Источники:
  src/quran-src/mushaf/words.json — для каждой страницы слова по порядку:
        [глиф, сура, аят, строка, тип]; тип "w" — слово, "e" — знак конца аята с номером.
        Глиф — символ из шрифта этой страницы (QCF V2, Комплекс короля Фахда, через Quran Foundation:
        api.quran.com /verses/by_page?mushaf=1, поле code_v2). Строка — 1…15, как в печатном издании.
  src/mushaf-fonts/pN.woff2 — шрифт страницы N (verses.quran.foundation/fonts/quran/hafs/v2/woff2/pN.woff2).
        Шрифты встраиваются только как часть приложения, при активном аккаунте разработчика
        Quran Foundation и с указанием источника (их условия). Файлы не меняем.
  src/quran-src/pages-tanzil.json — джуз для подписи страницы.

Пишет src/data/quran/mushaf/:
  index.json — какие страницы есть и с какого аята начинается каждая
  N.json     — 15 строк страницы: {"t":"w","w":[[глиф, сура, аят, тип], …]} — строка слов,
               {"t":"h","s":сура} — заголовок суры, {"t":"b"} — басмала.

Пустые строки в данных — это заголовки сур и басмала: перед первой строкой суры идут
заголовок и басмала (у 9-й суры — только заголовок; у 1-й басмала — первый аят).
Если сура начинается в самом верху страницы, её заголовок стоит внизу предыдущей.
Запуск: python3 tools/make_mushaf.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "quran-src"
OUT = ROOT / "src" / "data" / "quran" / "mushaf"


def main() -> None:
    words = json.loads((SRC / "mushaf" / "words.json").read_text(encoding="utf-8"))
    tanzil = json.loads((SRC / "pages-tanzil.json").read_text(encoding="utf-8"))["ayahs"]
    juz_of = {(int(s), i + 1): pj[1] for s, rows in tanzil.items() for i, pj in enumerate(rows)}
    page_of = {(int(s), i + 1): pj[0] for s, rows in tanzil.items() for i, pj in enumerate(rows)}
    fonts = {int(p.stem[1:]) for p in (ROOT / "src" / "mushaf-fonts").glob("p*.woff2")}

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    pages = sorted(int(p) for p in words)
    index = []
    for n in pages:
        assert n in fonts, f"нет шрифта для страницы {n}"
        ws = words[str(n)]
        # страница слов должна совпасть со страницей аята по Tanzil (кроме переноса аята на следующую страницу)
        assert page_of[(ws[0][1], ws[0][2])] in (n, n - 1), f"страница {n}: первый аят {ws[0][1]}:{ws[0][2]} не отсюда"
        lines = {}
        for c, s, a, l, t in ws:
            lines.setdefault(l, []).append([c, s, a, t])
        out = [None] * 16
        for l, row in lines.items():
            out[l] = {"t": "w", "w": row}
        # Заголовок и басмала перед каждой сурой, первый аят которой начинается на этой странице
        starts = {}
        for c, s, a, l, t in ws:
            if a == 1 and s not in starts:
                starts[s] = l
        for s, l in starts.items():
            if page_of[(s, 1)] != n:
                continue   # первый аят начался на прошлой странице — заголовок там
            need = ["h"] if s in (1, 9) else ["h", "b"]
            for slot, kind in zip(range(l - len(need), l), need):
                if slot >= 1:
                    assert out[slot] is None, f"страница {n}: строка {slot} занята"
                    out[slot] = {"t": kind, "s": s} if kind == "h" else {"t": "b"}
        # Пустые строки в конце страницы — заголовок (и басмала) суры, которая начинается на следующей
        last = max(lines)
        # (кроме страниц 1 и 2: на них по 8 строк посередине, в рамке)
        if n > 2 and last < 15 and n < 604 and str(n + 1) in words:
            nxt = words[str(n + 1)][0][1]
            tail = ["h"] if nxt == 9 else ["h", "b"]
            for slot, kind in zip(range(last + 1, 16), tail):
                out[slot] = {"t": kind, "s": nxt} if kind == "h" else {"t": "b"}
        empty = [l for l in range(1, 16) if out[l] is None]
        if n > 2:
            assert not empty, f"страница {n}: непонятные пустые строки {empty}"
        rows = out[1:9] if n <= 2 else out[1:]   # на 1-й и 2-й странице только 8 строк
        page = {"page": n, "juz": juz_of[(ws[0][1], ws[0][2])], "lines": [x or {"t": "x"} for x in rows]}
        (OUT / f"{n}.json").write_text(json.dumps(page, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index.append({"page": n, "s": ws[0][1], "a": ws[0][2]})
    (OUT / "index.json").write_text(json.dumps({"pages": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Мусхаф: {len(pages)} стр. — " + ", ".join(map(str, pages)))


if __name__ == "__main__":
    main()
