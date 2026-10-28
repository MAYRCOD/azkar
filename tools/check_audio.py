"""Проверка (на сервере GitHub): совпадает ли длина записей с разметкой. Для выбранных сур скачивает mp3,
меряет длину ffprobe (после полного декодирования) и сравнивает с концом последнего аята."""
import json, subprocess, sys, urllib.request, pathlib
CHECK = json.loads(sys.argv[1])   # [[папка, qf, сура], …]
API = "https://api.quran.com/api/v4/chapter_recitations/{qf}/{s}"
UA = {"User-Agent": "Mozilla/5.0 (Hisn azkar app; github.com/MAYRCOD/azkar)"}
out = []
for rec, qf, s in CHECK:
    f = json.loads(urllib.request.urlopen(urllib.request.Request(API.format(qf=qf, s=s), headers=UA), timeout=60).read())["audio_file"]
    end = max(int(t["timestamp_to"]) for t in f["timestamps"]) / 1000
    path = "/tmp/a.mp3"
    with urllib.request.urlopen(urllib.request.Request(f["audio_url"], headers=UA), timeout=300) as r, open(path, "wb") as o:
        o.write(r.read())
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "null", "-"], capture_output=True, text=True)
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,bit_rate", "-of", "json", path], capture_output=True, text=True)
    fmt = json.loads(p.stdout)["format"]
    real = float(fmt["duration"])
    line = f"{rec} {s}: запись {real:.1f} с, разметка до {end:.1f} с, разница {real - end:+.1f} с, {int(fmt.get('bit_rate', 0)) // 1000} кбит/с, {pathlib.Path(path).stat().st_size} байт" + (" ОШИБКИ ДЕКОДИРОВАНИЯ" if dec.stderr.strip() else "")
    print(line, flush=True); out.append(line)
pathlib.Path("audio-check.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
