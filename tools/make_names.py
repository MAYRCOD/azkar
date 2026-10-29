"""Собирает src/data/names.json (99 имён Аллаха) из tools/names-src/table.py и проверяет каждую строку:
- арабское имя и порядок — из ат-Тирмизи 3507 (sunnah.com, tools/names-src/raw/tirmidhi-3507.html);
- аят есть, выделяемое слово нашлось в арабском тексте, значение (kw) есть в переводе Кулиева этого аята;
- kind "k": текст толкования дословно есть в русском переводе тафсира ас-Саади к этому аяту (quran.com, id 170);
- kind "t": кусок арабского текста (sa) есть в арабском оригинале ас-Саади (quran.com, id 91).
Если что-то не сходится — печатает и выходит с ошибкой. Запуск: python3 tools/make_names.py

Исходники целиком (тафсир ас-Саади ~16 МБ) лежат только в служебной ветке names-fetch, в tools/names-src/raw/.
В основную ветку кладём выжимку — tools/names-src/sources.json (только нужные отрывки), и сверка идёт по ней."""
import html, json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "names-src"; RAW = SRC / "raw"
sys.path.insert(0, str(SRC)); from table import T

H = re.compile("[ً-ٰٟۖ-ۭـ]")
def bare(x): return H.sub("", re.sub("<[^>]+>", " ", x)).replace("ٱ", "ا").replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
def ws(x): return re.sub(r"\s+", " ", x).strip()
def rnorm(x): return ws(x).replace(" — ", " - ").replace("—", "-").replace("«", '"').replace("»", '"').rstrip('."').lower()

FULL = (RAW / "saadi-170-full.json").exists()
if FULL:
    page = open(RAW / "tirmidhi-3507.html", encoding="utf-8").read()
    ar = html.unescape(re.sub("<[^>]+>", "", re.search(r'class="arabic_hadith_full[^"]*"[^>]*>(.*?)</div>', page, re.S).group(1)))
    RU = json.load(open(RAW / "saadi-170-full.json")); ARS = json.load(open(RAW / "saadi-91-full.json"))
    HAD = {k: html.unescape(re.sub("<[^>]+>", " ", open(RAW / (k + ".html"), encoding="utf-8").read())) for k in ("bukhari-1120", "bukhari-6099", "bukhari-844")}
else:
    S0 = json.load(open(SRC / "sources.json")); ar = S0["tirmidhi"]; RU = S0["saadi_ru"]; ARS = S0["saadi_ar"]; HAD = S0["hadith"]
# 1. Список ат-Тирмизи
W = ar.split(); b = [H.sub("", w) for w in W]
s = b.index("الرحمن"); e = b.index("الصبور"); w = W[s:e + 1]; names = ["اللَّهُ"]; i = 0
while i < len(w):
    k = H.sub("", w[i])
    if k == "مالك": names.append(" ".join(w[i:i + 2])); i += 2
    elif k == "ذو": names.append(" ".join(w[i:i + 3])); i += 3
    else: names.append(w[i]); i += 1
assert len(names) == 99, len(names)

Q = {}
idx = {x["n"]: x["ru"] for x in json.load(open(ROOT / "src/data/quran/index.json"))["surahs"]}
def ayah(key):
    s, a = map(int, key.split(":"))
    if s not in Q: Q[s] = json.load(open(ROOT / f"src/data/quran/{s}.json"))["ayahs"]
    return Q[s][a - 1]

errs, out = [], []
for t, nm in zip(T, names):
    n = t["n"]; assert len(T) == 99 and n == T.index(t) + 1, n
    x = {"n": n, "ar": nm.replace("ى", "ي"), "tr": t["tr"], "ru": t["ru"]}
    if t.get("ayah"):
        k = t["ayah"]; a = ayah(k); words = a["ar"].replace(" ", " ").split(" ")
        hl = [j for j, wd in enumerate(words) if re.search(t["hl"], bare(wd))]
        if t.get("hl_first"): hl = hl[:t["hl_first"]]
        if not hl: errs.append(f"{n}: в аяте {k} не нашлось слово по шаблону {t['hl']}: {[bare(wd) for wd in words]}")
        if not re.search(t["kw"], a["ru"]): errs.append(f"{n}: в переводе Кулиева {k} нет «{t['kw']}»: {a['ru']}")
        s_, a_ = map(int, k.split(":"))
        x["ayah"] = {"s": s_, "a": a_, "sura": idx[s_], "ar": a["ar"], "ru": a["ru"], "hl": hl}
    if t.get("about"):
        k = t["src"]
        if t["kind"] == "k":
            if rnorm(t["about"]) not in rnorm(re.sub("<[^>]+>", " ", RU.get(k, ""))): errs.append(f"{n}: текста нет в русском ас-Саади к {k}: {t['about'][:80]}…")
        else:
            if ws(bare(t["sa"])) not in ws(bare(ARS.get(k, ""))): errs.append(f"{n}: арабского куска нет у ас-Саади к {k}: {t['sa']}")
        x["about"] = t["about"]; x["src"] = k; x["kind"] = t["kind"]
    if t.get("hadith"):
        h = t["hadith"]; hp = HAD[h["key"]]
        if ws(bare(h["ar"])) not in ws(bare(hp)): errs.append(f"{n}: в хадисе {h['src']} нет текста {h['ar']}")
        x["hadith"] = {"ar": h["ar"], "ru": h["ru"], "src": h["src"]}
    if t.get("note"): x["note"] = t["note"]
    if t.get("ru_note"): x["ruNote"] = t["ru_note"]
    out.append(x)

if errs:
    print("\n".join(errs)); sys.exit(f"ошибок: {len(errs)}")
if FULL:   # выжимка исходников для основной ветки
    used = sorted({t["src"] for t in T if t.get("about")}, key=lambda k: tuple(map(int, k.split(":"))))
    cut = lambda txt, n=40: txt
    (SRC / "sources.json").write_text(json.dumps({
        "about": "Отрывки исходников для tools/make_names.py: ат-Тирмизи 3507 (sunnah.com), тафсир ас-Саади к нужным аятам — русский (quran.com, id 170, перевод Кулиева) и арабский (id 91), хадисы аль-Бухари 1120, 6099, 844 (sunnah.com)",
        "tirmidhi": ar, "saadi_ru": {k: RU.get(k, "") for k in used}, "saadi_ar": {k: ARS.get(k, "") for k in used},
        "hadith": {k: v for k, v in HAD.items()}}, ensure_ascii=False, indent=0), encoding="utf-8")
data = {"hadith": {"ru": "У Аллаха девяносто девять имён — сто без одного. Тот, кто сохранит их, войдёт в Рай.", "src": "аль-Бухари 2736, Муслим 2677"},
        "list": "Перечень имён — ат-Тирмизи 3507. Сам хадис о 99 именах достоверный, а перечень многие учёные считают добавленным передатчиком.",
        "names": out}
(ROOT / "src/data/names.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
c = {"k": sum(1 for x in out if x.get("kind") == "k"), "t": sum(1 for x in out if x.get("kind") == "t")}
print(f"готово: 99 имён; толкование дословно по русскому переводу — {c['k']}, наш перевод с арабского — {c['t']}, без толкования — {99 - c['k'] - c['t']}")
