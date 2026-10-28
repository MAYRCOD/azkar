"""
Скачивает разметку времени чтецов для всех 114 сур (запускается на сервере GitHub Actions —
из среды Claude эти сайты недоступны). Только стандартная библиотека Python.

Список чтецов берётся у Quran Foundation (api.quran.com/api/v4/resources/chapter_reciters) — все, у кого
есть записи целых сур с разметкой. Для каждого чтеца и суры:
api.quran.com/api/v4/chapter_recitations/<id>/<сура>?segments=true
→ src/quran-audio/<чтец>/<сура>.json:
  {"url": ссылка на mp3 всей суры, "size": размер файла в байтах, "ayahs": [[начало, конец], …]}  — мс.
Разметку отдельных слов не храним: подсвечивается только звучащий аят.
Сами записи не скачиваем: приложение берёт их с сервера чтецов (или из того, что человек скачал себе).
Список чтецов и общий размер — src/quran-audio/reciters.json; полный ответ Quran Foundation о чтецах —
src/quran-audio/qf-reciters.json; что пошло не так — src/quran-audio/fetch-problems.txt.
Запуск: python3 tools/fetch_audio.py
"""
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "quran-audio"
UA = {"User-Agent": "Mozilla/5.0 (Hisn azkar app; github.com/MAYRCOD/azkar)"}
LIST = "https://api.quran.com/api/v4/resources/chapter_reciters?language=en"
API = "https://api.quran.com/api/v4/chapter_recitations/{qf}/{s}?segments=true"

# Наши имена папок для уже добавленных чтецов (номер Quran Foundation → папка). Новые — «qf<номер>»
KNOWN = {7: "afasy", 2: "abdulbaset", 1: "abdulbaset-mujawwad", 6: "husary", 12: "husary-muallim", 9: "minshawi",
         3: "sudais", 10: "shuraym", 4: "shatri", 5: "rifai", 97: "dossary", 161: "tunaiji"}
# Русские имена и порядок в приложении задаются вручную в src/quran-audio/reciters.json после скачивания.
# Пропущены: 168 (аль-Миншави с детьми — разметка неполная), 173 (аль-Афаси «Streaming» — повтор, время сбито)


def request(url: str, method: str = "GET", tries: int = 5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA, method=method)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read() if method == "GET" else r.headers
        except Exception as e:   # сеть иногда сбоит — повторяем с паузой
            if i == tries - 1:
                raise
            print("повтор", url, e, flush=True)
            time.sleep(3 * (i + 1))


def fetch_reciter(r: dict, counts: list, problems: list) -> bool:
    folder = OUT / r["id"]
    folder.mkdir(parents=True, exist_ok=True)
    total, hosts, missing_words = 0, set(), 0
    for s in range(1, 115):
        f = json.loads(request(API.format(qf=r["qf"], s=s)))["audio_file"]
        stamps = sorted(f.get("timestamps") or [], key=lambda t: int(t["verse_key"].split(":")[1]))
        keys = [t["verse_key"] for t in stamps]
        if keys != [f"{s}:{k}" for k in range(1, counts[s - 1] + 1)]:
            problems.append(f"{r['id']} (qf {r['qf']}) сура {s}: разметка аятов неполная ({len(keys)} из {counts[s - 1]}) — чтец пропущен")
            return False
        ayahs = [[int(t["timestamp_from"]), int(t["timestamp_to"])] for t in stamps]
        if any(b <= a for a, b in ayahs) or any(ayahs[i][0] < ayahs[i - 1][0] for i in range(1, len(ayahs))):
            problems.append(f"{r['id']} (qf {r['qf']}) сура {s}: странное время аятов — чтец пропущен")
            return False
        missing_words += sum(1 for t in stamps if not t.get("segments"))
        # настоящий размер файла (в ответе API он бывает неточным)
        size = int(request(f["audio_url"], "HEAD").get("Content-Length") or f.get("file_size") or 0)
        total += size
        hosts.add(f["audio_url"].split("/")[2])
        data = {"url": f["audio_url"], "size": size, "ayahs": ayahs}
        (folder / f"{s}.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        print(r["id"], s, len(ayahs), size, flush=True)
    r["size"] = total
    r["hosts"] = sorted(hosts)
    r["no_word_marks"] = missing_words
    return True


def main() -> None:
    counts = [x["ayahs"] for x in json.loads((ROOT / "quran" / "index.json").read_text(encoding="utf-8"))["surahs"]]
    listing = json.loads(request(LIST))
    (OUT / "qf-reciters.json").write_text(json.dumps(listing, ensure_ascii=False, indent=1), encoding="utf-8")
    problems, done = [], []
    for x in sorted(listing.get("reciters") or listing.get("chapter_reciters") or [], key=lambda x: x["id"]):
        r = {"id": KNOWN.get(x["id"], f"qf{x['id']}"), "qf": x["id"], "name": x.get("name") or "",
             "style": (x.get("style") or {}).get("name") if isinstance(x.get("style"), dict) else x.get("style")}
        try:
            if fetch_reciter(r, counts, problems):
                done.append(r)
        except Exception as e:   # один чтец не скачался — остальные всё равно сохраняем
            problems.append(f"{r['id']} (qf {r['qf']}): ошибка {e!r} — чтец пропущен")
    (OUT / "reciters.json").write_text(json.dumps({
        "_": "Чтецы: разметка времени (мс) аятов — Quran Foundation (api.quran.com chapter_recitations); "
             "записи берутся с сервера чтецов (url в файле суры). size — общий размер записей всего Корана, байт.",
        "reciters": done,
        "surahs": list(range(1, 115)),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "fetch-problems.txt").write_text("\n".join(problems) + "\n", encoding="utf-8")
    print("чтецов:", len(done), "замечаний:", len(problems))


if __name__ == "__main__":
    main()
