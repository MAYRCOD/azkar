"""Собирает src/data/names.json (99 имён Аллаха) из tools/names-src/table.py и проверяет:
- арабские имена и их порядок — из ат-Тирмизи 3507 (sunnah.com; текст — tools/names-src/sources.json);
- перевод имени (ru) взят из перевода смыслов Корана Э. Кулиева: слово kw есть в переводе аята ayah
  (src/data/quran). У имён, которых нет в Коране, аята нет — там перевод без этой проверки.
В приложение попадают только номер, арабское имя, транскрипция и перевод.
Если что-то не сходится — печатает и выходит с ошибкой. Запуск: python3 tools/make_names.py"""
import json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "names-src"
sys.path.insert(0, str(SRC)); from table import T

H = re.compile("[ً-ٰٟـ]")
W = json.load(open(SRC / "sources.json"))["tirmidhi"].split(); b = [H.sub("", w) for w in W]
s = b.index("الرحمن"); e = b.index("الصبور"); w = W[s:e + 1]; names = ["اللَّهُ"]; i = 0
while i < len(w):
    k = H.sub("", w[i])
    if k == "مالك": names.append(" ".join(w[i:i + 2])); i += 2
    elif k == "ذو": names.append(" ".join(w[i:i + 3])); i += 3
    else: names.append(w[i]); i += 1
assert len(names) == 99 and len(T) == 99, (len(names), len(T))

errs, out = [], []
for j, (t, nm) in enumerate(zip(T, names), 1):
    if t["n"] != j: errs.append(f"номер {t['n']} стоит на месте {j}")
    if t.get("ayah"):
        s_, a_ = map(int, t["ayah"].split(":"))
        ru = json.load(open(ROOT / f"src/data/quran/{s_}.json"))["ayahs"][a_ - 1]["ru"]
        if not re.search(t["kw"], ru): errs.append(f"{j}: в переводе Кулиева {t['ayah']} нет «{t['kw']}»")
    out.append({"n": j, "ar": nm.replace("ى", "ي"), "tr": t["tr"], "ru": t["ru"]})
if errs:
    print("\n".join(errs)); sys.exit(f"ошибок: {len(errs)}")
data = {"hadith": {"ru": "У Аллаха девяносто девять имён — сто без одного. Тот, кто сохранит их, войдёт в Рай.", "src": "аль-Бухари 2736, Муслим 2677"},
        "source": "Перечень имён — ат-Тирмизи 3507. Перевод — по переводу смыслов Корана Э. Кулиева.",
        "names": out}
(ROOT / "src/data/names.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print("готово: 99 имён (арабский, транскрипция, перевод)")
