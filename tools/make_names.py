"""Собирает src/data/names.json (99 имён Аллаха) из tools/names-src/table.py и проверяет:
- арабские имена и их порядок — из ат-Тирмизи 3507 (sunnah.com; текст — tools/names-src/sources.json);
- каждое толкование дословно есть в книге «Прекрасные имена Аллаха и их краткое толкование»
  (Ахмад Абу Яхья аль-Ханафи, Даруль-Фикр, 2017; текст книги — tools/names-src/book.txt);
- порядок имён в книге совпадает с перечнем ат-Тирмизи.
Если что-то не сходится — печатает и выходит с ошибкой. Запуск: python3 tools/make_names.py"""
import json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "names-src"
sys.path.insert(0, str(SRC)); from table import T

H = re.compile("[ً-ٰٟـ‎‏‪-‮]")
def bare(x): return H.sub("", x).replace("ٱ", "ا").replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ؤو", "ءو").strip()
def norm(x): return re.sub(r"(\w)- (\w)", r"\1\2", re.sub(r"\s+", " ", x)).replace("ё", "е").strip()

# 1. Перечень ат-Тирмизи
W = json.load(open(SRC / "sources.json"))["tirmidhi"].split(); b = [H.sub("", w) for w in W]
s = b.index("الرحمن"); e = b.index("الصبور"); w = W[s:e + 1]; names = ["اللَّهُ"]; i = 0
while i < len(w):
    k = H.sub("", w[i])
    if k == "مالك": names.append(" ".join(w[i:i + 2])); i += 2
    elif k == "ذو": names.append(" ".join(w[i:i + 3])); i += 3
    else: names.append(w[i]); i += 1
assert len(names) == 99 and len(T) == 99, (len(names), len(T))

# 2. Книга: порядок заголовков (арабские строки перед названием) должен совпасть с перечнем
book = open(SRC / "book.txt", encoding="utf-8").read(); BN = norm(book)
heads = []
want = [bare(n).replace("ؤو", "ءو") for n in names]
lines = book.split("\n")
for j, l in enumerate(lines[:-1]):
    if re.search("[؀-ۿ]", l) and re.match(r"^(Аль|Ар|Ас|Аз|Аш|Ат|Ад|Ан)-|^Аллах$|^Малик аль|^Зуль-", lines[j + 1].strip()):
        g = [bare(x) for x in re.split(r"[–-]", l) if bare(x)]
        heads += sorted(g, key=lambda x: want.index(x) if x in want else 0) if len(g) == 2 else g   # пары в PDF идут справа налево
heads = [h for h in heads if h][:200]
errs = []
# в книге пары («القابض – الباسط») идут одним заголовком, а «الرحمن الرحيم» — одной строкой
flat = []
for h in heads:
    flat += h.split() if h in ("الرحمن الرحيم",) else [h]
for j, (a, c) in enumerate(zip(want, flat), 1):
    if a.replace(" ", "") != c.replace(" ", "") and not (a.startswith("ال") and a[2:] == c[2:]):
        errs.append(f"порядок: {j}: у ат-Тирмизи {a}, в книге {c}")

out = []
for t, nm in zip(T, names):
    for p in t["parts"]:
        if norm(p) not in BN: errs.append(f"{t['n']} {t['tr']}: в книге нет текста «{p}»")
    about = " ".join(p.rstrip(".") + "." for p in t["parts"])
    out.append({"n": t["n"], "ar": nm.replace("ى", "ي"), "tr": t["tr"], "about": about})
if errs:
    print("\n".join(errs[:40])); sys.exit(f"ошибок: {len(errs)}")
data = {"hadith": {"ru": "У Аллаха девяносто девять имён — сто без одного. Тот, кто сохранит их, войдёт в Рай.", "src": "аль-Бухари 2736, Муслим 2677"},
        "source": "Перечень имён — ат-Тирмизи 3507. Толкования — по книге Ахмада Абу Яхьи аль-Ханафи «Прекрасные имена Аллаха и их краткое толкование» (Даруль-Фикр, 2017), составленной по толкованию имама аль-Байхакы.",
        "names": out}
(ROOT / "src/data/names.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print("готово: 99 имён, все толкования найдены в книге, порядок совпадает с ат-Тирмизи")
