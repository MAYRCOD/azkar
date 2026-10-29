"""Скачивает исходники для раздела «99 имён Аллаха» (запускается на GitHub: из среды Claude эти сайты недоступны).
- sunnah.com: ат-Тирмизи 3507 — сам список 99 имён (страница целиком, разбираем потом);
- quran.com: толкование ас-Саади на русском и перевод Кулиева (id 45) для аятов из tools/names-src/ayahs.txt.
Всё кладём как есть в tools/names-src/raw/, ничего не правим."""
import json, pathlib, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent / "names-src"
RAW = ROOT / "raw"; RAW.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (azkar app; contact via github MAYRCOD)", "Accept": "application/json, text/html"}

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception as e:
            print("  повтор", i + 1, url, e); time.sleep(2 + 3 * i)
    raise SystemExit("не скачалось: " + url)

(RAW / "tirmidhi-3507.html").write_bytes(get("https://sunnah.com/tirmidhi:3507"))
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
    out["ayahs"][k] = {"saadi": t.get("tafsir", t), "kuliev": tr}
    print(k, len(json.dumps(t, ensure_ascii=False)))
    time.sleep(0.4)
(RAW / "saadi-kuliev.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("готово:", len(keys), "аятов")
