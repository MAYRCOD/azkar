"""
Готовит страницы режима «Мусхаф» — 604 страницы, как в печатном Мединском мусхафе издания 1441 г.

Источники:
  src/quran-src/mushaf/layout-v4.json — раскладка «KFGQPC V4 layout (1441H print)» с qul.tarteel.ai
        (resources/mushaf-layout/19): для каждой страницы 15 строк.
          [номер, "h", сура]                 — заголовок суры
          [номер, "b"]                       — басмала
          [номер, "w", центр, [[глиф, "сура:аят:слово", тип], …]] — строка слов;
                центр = 1 — строка стоит по центру (короткая), 0 — от края до края;
                тип "w" — слово, "e" — знак конца аята с номером.
        Глиф — символ шрифта этой страницы (QCF V4, Комплекс короля Фахда).
        Почему 1441, а не 1421 (V2): так выглядят современные приложения и новые печатные мусхафы —
        например, на стр. 602 знак 5-го аята аль-Ма'ун стоит в конце 10-й строки (в 1421 — в начале 11-й).
  src/mushaf-fonts/pN.woff2 — шрифт страницы N (verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/pN.woff2).
        Файлы не меняем. Встраиваются только как часть приложения, с указанием источника (условия Quran Foundation).
  src/quran-src/pages-tanzil.json — джуз для подписи страницы.

Пишет src/data/quran/mushaf/:
  index.json — какие страницы есть: {page, s, a — первый аят, который начинается на странице,
               es, ea — последний аят на странице (он может продолжаться на следующей)}
  N.json     — строки страницы: {"t":"w","c":0|1,"w":[[глиф, сура, аят, тип], …]}, {"t":"h","s":сура}, {"t":"b"}.
               На страницах 1–2 — только 8 строк (пустые хвостовые строки раскладки отброшены).
Проверки: на каждой странице 15 строк; каждая строка слов не пустая; аяты идут по порядку без пропусков;
все глифы есть в шрифте страницы.
Запуск: python3 tools/make_mushaf.py
"""
import json
import pathlib

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "quran-src"
OUT = ROOT / "src" / "data" / "quran" / "mushaf"


def main() -> None:
    layout = json.loads((SRC / "mushaf" / "layout-v4.json").read_text(encoding="utf-8"))
    tanzil = json.loads((SRC / "pages-tanzil.json").read_text(encoding="utf-8"))["ayahs"]
    juz_of = {(int(s), i + 1): pj[1] for s, rows in tanzil.items() for i, pj in enumerate(rows)}

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    pages, prev, last = [], None, None
    for p in sorted(layout, key=int):
        n = int(p)
        if last != n - 1:
            prev = None   # между страницами пропуск (их ещё нет) — непрерывность проверяем только у соседних
        last = n
        rows = layout[p]
        assert [r[0] for r in rows] == list(range(1, 16)), f"стр. {n}: должно быть 15 строк"
        cmap = TTFont(ROOT / "src" / "mushaf-fonts" / f"p{n}.woff2").getBestCmap()
        lines, first, start, end = [], None, None, None
        for r in rows:
            if r[1] == "h":
                lines.append({"t": "h", "s": r[2]})
            elif r[1] == "b":
                lines.append({"t": "b"})
            elif r[3]:
                ws = []
                for g, loc, t in r[3]:
                    s, a, wi = map(int, loc.split(":"))
                    assert all(ord(ch) in cmap for ch in g), f"стр. {n}: глифа {g!r} нет в шрифте"
                    if prev and (s, a) != prev:   # аяты по порядку: тот же или следующий
                        assert (s, a) in ((prev[0], prev[1] + 1), (prev[0] + 1, 1)), f"стр. {n}: пропуск после {prev}"
                    prev = (s, a)
                    first = first or (s, a)
                    if wi == 1:
                        start = start or (s, a)   # первый аят, который НАЧИНАЕТСЯ на этой странице
                    end = (s, a)
                    ws.append([g, s, a, t])
                lines.append({"t": "w", "c": r[2], "w": ws})
            else:
                assert n <= 2, f"стр. {n}, строка {r[0]}: пустая строка"
        s, a = first
        (OUT / f"{n}.json").write_text(json.dumps({"page": n, "juz": juz_of[(s, a)], "lines": lines},
                                                  ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        start = start or first   # страница целиком из продолжения аята (не бывает, но на всякий случай)
        pages.append({"page": n, "s": start[0], "a": start[1], "es": end[0], "ea": end[1]})
    (OUT / "index.json").write_text(json.dumps({"pages": pages}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Мусхаф: страницы", ", ".join(str(x["page"]) for x in pages))


if __name__ == "__main__":
    main()
