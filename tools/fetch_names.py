"""Скачивает исходники для раздела «99 имён Аллаха» (запускается на GitHub: из среды Claude эти сайты недоступны).
- sunnah.com: ат-Тирмизи 3507 — сам список 99 имён (страница целиком, разбираем потом);
- quran.com: толкование ас-Саади на русском (и арабский оригинал — для сверки) и перевод Кулиева (id 45) для аятов из tools/names-src/ayahs.txt.
Всё кладём как есть в tools/names-src/raw/, ничего не правим."""
import json, pathlib, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent / "names-src"
RAW = ROOT / "raw"; RAW.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (azkar app; contact via github MAYRCOD)", "Accept": "application/json, text/html"}

LOG = []
def get(url, tries=4, must=True):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception as e:
            print("  повтор", i + 1, url, e); time.sleep(2 + 3 * i)
    LOG.append("не скачалось: " + url)
    if must: raise SystemExit("не скачалось: " + url)
    return None

(RAW / "tirmidhi-3507.html").write_bytes(get("https://sunnah.com/tirmidhi:3507"))
# хадисы для имён, которых нет в Коране: аль-Мукаддим/аль-Муаххир (1120), аль-Мани' (844), ас-Сабур (6099)
for h in ["bukhari:1120", "bukhari:844", "bukhari:6099", "muslim:771a", "muslim:2804"]:
    b = get("https://sunnah.com/" + h, must=False)
    if b: (RAW / (h.replace(":", "-") + ".html")).write_bytes(b)
res = json.loads(get("https://api.quran.com/api/v4/resources/tafsirs"))
(RAW / "tafsirs.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
ru = [t for t in res["tafsirs"] if t.get("language_name", "").lower() == "russian" or "ru-" in t.get("slug", "")]
print("русские тафсиры:", [(t["id"], t["slug"], t["name"]) for t in ru])
saadi = next(t for t in ru if "saddi" in t["slug"] or "sadi" in t["slug"] or "saadi" in t["slug"])
keys = [k for line in (ROOT / "ayahs.txt").read_text(encoding="utf-8").splitlines() if not line.startswith("#") for k in line.split()]
out = {"tafsir": saadi, "ayahs": {}}
for k in keys:
    t = json.loads(get(f"https://api.quran.com/api/v4/tafsirs/{saadi['id']}/by_ayah/{k}"))
    tr = json.loads(get(f"https://api.quran.com/api/v4/quran/translations/45?verse_key={k}"))
    ar = json.loads(get(f"https://api.quran.com/api/v4/tafsirs/91/by_ayah/{k}"))   # ас-Саади по-арабски — сверять русский перевод
    out["ayahs"][k] = {"saadi": t.get("tafsir", t), "saadi_ar": ar.get("tafsir", ar), "kuliev": tr}
    print(k, len(json.dumps(t, ensure_ascii=False)))
    time.sleep(0.4)
(RAW / "saadi-kuliev.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("готово:", len(keys), "аятов")

# Весь тафсир ас-Саади (русский 170 и арабский 91) — по сурам: в русском переводе толкование сокращено,
# поэтому объяснение имени ищем по всему тексту, а не только в одном аяте
for tid in (170, 91):
    full = {}
    for ch in range(1, 115):
        page = 1
        while True:
            b = get(f"https://api.quran.com/api/v4/tafsirs/{tid}/by_chapter/{ch}?per_page=50&page={page}", must=False)
            if not b: break
            r = json.loads(b)
            for t in r.get("tafsirs", []): full[t.get("verse_key") or f"{ch}:?{len(full)}"] = t.get("text", "")
            nxt = (r.get("pagination") or {}).get("next_page")
            if not nxt: break
            page = nxt; time.sleep(0.2)
        print("тафсир", tid, "сура", ch, len(full))
    (RAW / f"saadi-{tid}-full.json").write_text(json.dumps(full, ensure_ascii=False), encoding="utf-8")
(RAW / "log.txt").write_text("\n".join(LOG) or "без ошибок", encoding="utf-8")
