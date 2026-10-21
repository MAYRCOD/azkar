"""
Готовит данные раздела «Коран» из источников в src/quran-src/:

  hafsData_v18.json — текст Мединского мусхафа от Комплекса короля Фахда (KFGQPC), версия 18.
                      Текст берём КАК ЕСТЬ, ни одного символа не меняем (условие Комплекса).
                      Номер аята (١, ٢…) уже стоит в конце текста — шрифт рисует его в узорном кружке.
                      Страницы и джузы оттуда НЕ берём: джузы там поделены не по мединскому мусхафу
                      (3:92 в 4-м, 9:93 в 10-м), а у 56 аятов страница сдвинута на одну.
  pages-tanzil.json — страница и джуз мединского мусхафа для каждого аята (разметка Tanzil).
                      21.10.2026 сверено с quran.com: все 6236 аятов совпали. Данные quran.com
                      в проекте не храним (их условия ограничивают встраивание), только итог сверки —
                      начала 30 джузов ниже (JUZ_STARTS): если разметка с ними разойдётся, сборка остановится
  chapters.json     — аяты с земным поклоном (из fawazahmed0/quran-api; там же мекканская/мединская —
                      в приложении это не показываем, решение Майрбека 20.10.2026)
  kuliev.json       — перевод Э. Кулиева по аятам (как на quran.com, перевод №45)
  names-ru.json     — русские названия сур (как в остальном приложении: «аль-Ихлас»)
  meanings-ru.json  — значение названия по-русски (с quran.com: «Весть», «Рассвет»)

Пишет src/data/quran/:
  index.json  — список сур (только те, у которых есть перевод), басмала и начала 30 джузов
  112.json …  — по файлу на суру: аяты с переводом, страница, джуз

Сура попадает в приложение, только когда для неё есть перевод и название.
Запуск из корня репозитория:  python3 tools/make_quran.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "quran-src"
OUT = ROOT / "src" / "data" / "quran"


def load(name):
    return json.loads((SRC / name).read_text(encoding="utf-8"))


# Начала 30 джузов мединского мусхафа: (сура, аят, страница).
# Сверено с quran.com и Tanzil (21.10.2026); 4-й (3:93) и 11-й (9:93, стр. 201) проверил Майрбек
JUZ_STARTS = [
    (1, 1, 1), (2, 142, 22), (2, 253, 42), (3, 93, 62), (4, 24, 82), (4, 148, 102), (5, 82, 121),
    (6, 111, 142), (7, 88, 162), (8, 41, 182), (9, 93, 201), (11, 6, 222), (12, 53, 242), (15, 1, 262),
    (17, 1, 282), (18, 75, 302), (21, 1, 322), (23, 1, 342), (25, 21, 362), (27, 56, 382), (29, 46, 402),
    (33, 31, 422), (36, 28, 442), (39, 32, 462), (41, 47, 482), (46, 1, 502), (51, 31, 522), (58, 1, 542),
    (67, 1, 562), (78, 1, 582),
]


def main() -> None:
    ayahs = load("hafsData_v18.json")
    chapters = {c["n"]: c for c in load("chapters.json")}
    kuliev = load("kuliev.json")
    names = load("names-ru.json")
    meanings = load("meanings-ru.json")
    tanzil = load("pages-tanzil.json")["ayahs"]
    pj = {(int(s), i + 1): v for s, rows in tanzil.items() for i, v in enumerate(rows)}   # (сура, аят) → [стр., джуз]
    assert len(pj) == 6236
    assert len(ayahs) == 6236, "в тексте должно быть 6236 аятов"

    by_surah = {}
    for a in ayahs:
        by_surah.setdefault(a["sora"], []).append(a)

    # Басмала перед сурами — это первый аят «аль-Фатихи» без номера в конце (сам текст не трогаем)
    basmala = by_surah[1][0]["aya_text"].rsplit("\u00a0", 1)[0]
    assert basmala.startswith("بِسۡمِ") and not basmala[-1].isdigit()

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()

    surahs = []
    for n in sorted(int(k) for k in kuliev):
        src = by_surah[n]
        ru = kuliev[str(n)]
        assert len(ru) == len(src), f"сура {n}: аятов {len(src)}, а перевода {len(ru)}"
        assert [a["aya_no"] for a in src] == list(range(1, len(src) + 1))
        data = {
            "n": n,
            "ayahs": [{
                "ar": a["aya_text"],
                "ru": ru[i],
                "page": pj[(n, i + 1)][0],
                "juz": pj[(n, i + 1)][1],
            } for i, a in enumerate(src)],
        }
        (OUT / f"{n}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        surahs.append({
            "n": n,
            "ru": names[str(n)],
            "meaning": meanings.get(str(n), ""),
            "ar": src[0]["sora_name_ar"],
            "ayahs": len(src),
            "page": pj[(n, 1)][0],
            "juz": pj[(n, 1)][1],
            "sajda": chapters[n]["sajda"],
        })

    # Где начинается каждый из 30 джузов (сура, аят, страница) — для перехода по джузам
    juzs = []
    for a in ayahs:
        p, j = pj[(a["sora"], a["aya_no"])]
        if not juzs or juzs[-1]["n"] != j:
            juzs.append({"n": j, "s": a["sora"], "a": a["aya_no"], "page": p})
    assert [j["n"] for j in juzs] == list(range(1, 31)), "джузы должны идти 1…30 подряд"
    # Проверка: начала джузов — как в мединском мусхафе (JUZ_STARTS вверху)
    for j, (s, a, p) in zip(juzs, JUZ_STARTS):
        assert (j["s"], j["a"], j["page"]) == (s, a, p), f"джуз {j['n']}: {j['s']}:{j['a']} стр. {j['page']}, а должно {s}:{a} стр. {p}"

    index = {"basmala": basmala, "surahs": surahs, "juzs": juzs}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Коран: {len(surahs)} сур — " + ", ".join(str(s['n']) for s in surahs))


if __name__ == "__main__":
    main()
