"""
Скачивает разметку времени чтецов для всех 114 сур (запускается на сервере GitHub Actions —
из среды Claude эти сайты недоступны). Только стандартная библиотека Python.

Для каждого чтеца и суры: api.quran.com/api/v4/chapter_recitations/<id>/<сура>?segments=true
→ src/quran-audio/<чтец>/<сура>.json:
  {"url": ссылка на mp3 всей суры (download.quranicaudio.com), "size": размер файла в байтах,
   "ayahs": [[начало, конец, [[слово, начало, конец], …]], …]}   — время в миллисекундах.
Сами записи не скачиваем: приложение берёт их с сервера чтецов (или из того, что человек скачал себе).
Список чтецов и общий размер — src/quran-audio/reciters.json.
Запуск: python3 tools/fetch_audio.py
"""
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "quran-audio"
UA = {"User-Agent": "Mozilla/5.0 (Hisn azkar app; github.com/MAYRCOD/azkar)"}
API = "https://api.quran.com/api/v4/chapter_recitations/{qf}/{s}?segments=true"

# id — наше имя папки, qf — номер чтеца в Quran Foundation (все — муратталь)
RECITERS = [
    {"id": "afasy", "qf": 7, "name": "Мишари Рашид аль-Афаси"},
    {"id": "abdulbaset", "qf": 2, "name": "Абдуль-Басит Абдус-Самад"},
    {"id": "husary", "qf": 6, "name": "Махмуд Халиль аль-Хусари"},
    {"id": "minshawi", "qf": 9, "name": "Мухаммад Сиддик аль-Миншави"},
    {"id": "sudais", "qf": 3, "name": "Абдур-Рахман ас-Судейс"},
]


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


def main() -> None:
    counts = [x["ayahs"] for x in json.loads((ROOT / "quran" / "index.json").read_text(encoding="utf-8"))["surahs"]]
    problems = []
    for r in RECITERS:
        folder = OUT / r["id"]
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.mp3"):   # раньше запись ан-Нас лежала в проекте — теперь она с сервера
            old.unlink()
        total = 0
        for s in range(1, 115):
            f = json.loads(request(API.format(qf=r["qf"], s=s)))["audio_file"]
            stamps = sorted(f["timestamps"], key=lambda t: int(t["verse_key"].split(":")[1]))
            ayahs = []
            for k, t in enumerate(stamps, 1):
                assert t["verse_key"] == f"{s}:{k}", (r["id"], s, t["verse_key"])
                words = [[int(w[0]), int(w[1]), int(w[2])] for w in (t.get("segments") or [])
                         if len(w) >= 3 and all(isinstance(v, (int, float)) for v in w[:3])]
                ayahs.append([int(t["timestamp_from"]), int(t["timestamp_to"]), words])
            if len(ayahs) != counts[s - 1]:
                problems.append(f"{r['id']} {s}: аятов {len(ayahs)}, а должно быть {counts[s - 1]}")
            if any(not a[2] for a in ayahs):
                problems.append(f"{r['id']} {s}: у некоторых аятов нет разметки слов")
            # настоящий размер файла (в ответе API он бывает неточным)
            size = int(request(f["audio_url"], "HEAD").get("Content-Length") or f.get("file_size") or 0)
            total += size
            data = {"url": f["audio_url"], "size": size, "ayahs": ayahs}
            (folder / f"{s}.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            print(r["id"], s, len(ayahs), size, flush=True)
        r["size"] = total
    (OUT / "reciters.json").write_text(json.dumps({
        "_": "Чтецы: разметка времени (мс) аятов и слов — Quran Foundation (api.quran.com chapter_recitations, segments); "
             "записи берутся с download.quranicaudio.com. size — общий размер записей всего Корана, байт.",
        "reciters": RECITERS,
        "surahs": list(range(1, 115)),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "fetch-problems.txt").write_text("\n".join(problems) + "\n", encoding="utf-8")
    print("замечаний:", len(problems))


if __name__ == "__main__":
    main()
