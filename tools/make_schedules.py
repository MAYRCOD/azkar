"""
Готовые («предустановленные») расписания намазов → src/data/schedules.json.

Откуда данные: таблицы по городам на 2026 год, скачаны из браузера (см. заметки проекта),
перенесены сжатыми с контрольной суммой и проверены: python3 tools/schedules_unpack.py pack*.txt
→ /tmp/.../data.json (минуты от полуночи, 365 дней × 6 времён: фаджр, восход, зухр, аср, магриб, иша).

Что делает этот скрипт:
  1. Приводит каждую таблицу к ПОСТОЯННОМУ сдвигу от Гринвича (off, в минутах):
     — Прага: в таблице летнее время включено не в те дни (25.03 и 28.10 вместо 29.03 и 25.10),
       поэтому летние дни переводим обратно в зимнее время (−60 мин), а переход делает сам телефон;
     — Алматы и Караганда: таблица по старому времени Казахстана UTC+6 (с 1 марта 2024 там UTC+5),
       поэтому off = 360, и телефон сам покажет время по текущему поясу.
  2. Сжимает: первый день целиком, дальше — изменение к предыдущему дню одной буквой (a = −12 … m = 0 … y = +12).
Запуск: python3 tools/make_schedules.py /путь/к/data.json
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
raw = json.load(open(sys.argv[1], encoding="utf-8"))

# id, город, широта, долгота, часовой пояс места, постоянный сдвиг таблицы (мин), кого покрывает
META = [
    ("grozny", "Грозный", 43.3178, 45.6949, "Europe/Moscow", 180, "region:Чеч"),   # одно расписание на всю Чечню
    ("makhachkala", "Махачкала", 42.9849, 47.5047, "Europe/Moscow", 180, "near"),
    ("moscow", "Москва", 55.7558, 37.6173, "Europe/Moscow", 180, "near"),
    ("kazan", "Казань", 55.7963, 49.1088, "Europe/Moscow", 180, "near"),
    ("volgograd", "Волгоград", 48.708, 44.5133, "Europe/Volgograd", 180, "near"),
    ("krasnodar", "Краснодар", 45.0355, 38.9753, "Europe/Moscow", 180, "near"),
    ("rostov", "Ростов-на-Дону", 47.2357, 39.7015, "Europe/Moscow", 180, "near"),
    ("stavropol", "Ставрополь", 45.0428, 41.9734, "Europe/Moscow", 180, "near"),
    ("sochi", "Сочи", 43.6028, 39.7342, "Europe/Moscow", 180, "near"),
    ("samara", "Самара", 53.1959, 50.1002, "Europe/Samara", 240, "near"),
    ("yekaterinburg", "Екатеринбург", 56.8389, 60.6057, "Asia/Yekaterinburg", 300, "near"),
    ("almaty", "Алматы", 43.2389, 76.8897, "Asia/Almaty", 360, "near"),
    ("karaganda", "Караганда", 49.8047, 73.1094, "Asia/Almaty", 360, "near"),
    ("prague", "Прага", 50.0755, 14.4378, "Europe/Prague", 60, "near"),
]

def pack(m):
    p = "".join(f"{x // 60:02d}{x % 60:02d}" for x in m[:6])
    for i in range(6, len(m)):
        d = m[i] - m[i - 6]
        assert -12 <= d <= 12, f"скачок {d} мин в дне {i // 6}"
        p += chr(109 + d)
    return p

out = []
for sid, name, lat, lng, tz, off, cover in META:
    m = list(raw[name])
    assert len(m) == 365 * 6
    if sid == "prague":
        # летние дни в таблице: с 25 марта (день 83) по 27 октября (день 299) включительно
        for day in range(83, 300):
            for k in range(6):
                m[day * 6 + k] -= 60
    out.append({"id": sid, "name": name, "lat": lat, "lng": lng, "tz": tz, "off": off, "cover": cover, "p": pack(m)})

dst = ROOT / "src" / "data" / "schedules.json"
dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{dst.relative_to(ROOT)}: {len(out)} расписаний, {dst.stat().st_size // 1024} КБ")
