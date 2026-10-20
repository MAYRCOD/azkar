"""
Готовит данные раздела «Коран» из источников в src/quran-src/:

  hafsData_v18.json — текст Мединского мусхафа от Комплекса короля Фахда (KFGQPC), версия 18:
                      аят, номер страницы и строк в печатном мединском издании, джуз.
                      Текст берём КАК ЕСТЬ, ни одного символа не меняем (условие Комплекса).
                      Номер аята (١, ٢…) уже стоит в конце текста — шрифт рисует его в узорном кружке.
  chapters.json     — мекканская/мединская сура, аяты с земным поклоном (из fawazahmed0/quran-api)
  kuliev.json       — перевод Э. Кулиева по аятам (как на quran.com, перевод №45)
  names-ru.json     — русские названия сур (как в остальном приложении: «аль-Ихлас»)
  meanings-ru.json  — значение названия по-русски (с quran.com: «Весть», «Рассвет»)

Пишет src/data/quran/:
  index.json  — список сур (только те, у которых есть перевод) + басмала
  112.json …  — по файлу на суру: аяты с переводом, страница, строки, джуз

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


def main() -> None:
    ayahs = load("hafsData_v18.json")
    chapters = {c["n"]: c for c in load("chapters.json")}
    kuliev = load("kuliev.json")
    names = load("names-ru.json")
    meanings = load("meanings-ru.json")
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
                "page": a["page"],
                "lines": [a["line_start"], a["line_end"]],
                "juz": a["jozz"],
            } for i, a in enumerate(src)],
        }
        (OUT / f"{n}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        surahs.append({
            "n": n,
            "ru": names[str(n)],
            "meaning": meanings.get(str(n), ""),
            "ar": src[0]["sora_name_ar"],
            "ayahs": len(src),
            "place": chapters[n]["place"],
            "page": src[0]["page"],
            "juz": src[0]["jozz"],
            "sajda": chapters[n]["sajda"],
        })

    index = {"basmala": basmala, "surahs": surahs}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Коран: {len(surahs)} сур — " + ", ".join(str(s['n']) for s in surahs))


if __name__ == "__main__":
    main()
