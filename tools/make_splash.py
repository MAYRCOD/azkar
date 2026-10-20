"""
Заставка при запуске приложения на iPhone (её показывает сам iOS, пока приложение грузится).

Рисует две квадратные картинки 2732×2732: значок приложения по центру
на фоне цвета приложения — светлую (#ffffff) и тёмную (#0e1310, как --bg в тёмной теме).
iPhone сам выбирает картинку по теме телефона и растягивает её на весь экран
с обрезкой краёв (scaleAspectFill), поэтому значок всегда остаётся по центру.

Запуск из корня репозитория (после смены иконки — тоже):
  python3 tools/make_splash.py
"""
import json
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICON = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
OUT = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset"
SIZE = 2732   # сторона картинки
LOGO = 300    # сторона значка: на iPhone 11 это ≈ 100 точек, как значок на экране «Домой»
BACKS = {"light": "#ffffff", "dark": "#0e1310"}


def rounded_icon() -> Image.Image:
    """Значок со скруглёнными углами, как на экране «Домой». Углы рисуем в 4 раза крупнее
    и уменьшаем — так край получается гладким, без «лесенки»."""
    k = 4
    mask = Image.new("L", (LOGO * k, LOGO * k), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, LOGO * k - 1, LOGO * k - 1), radius=int(LOGO * k * 0.225), fill=255)
    icon = Image.open(ICON).convert("RGBA").resize((LOGO, LOGO), Image.LANCZOS)
    icon.putalpha(mask.resize((LOGO, LOGO), Image.LANCZOS))
    return icon


def main() -> None:
    icon = rounded_icon()
    for old in OUT.glob("*.png"):
        old.unlink()
    images = []
    for theme, color in BACKS.items():
        img = Image.new("RGB", (SIZE, SIZE), color)
        img.paste(icon, ((SIZE - LOGO) // 2, (SIZE - LOGO) // 2), icon)
        # три размера (1x, 2x, 3x) — одна и та же картинка; Xcode требует отдельный файл на каждый
        for scale in ("1x", "2x", "3x"):
            name = f"splash-{theme}-{scale}.png"
            img.save(OUT / name, optimize=True)
            entry = {"idiom": "universal", "filename": name, "scale": scale}
            if theme == "dark":
                entry["appearances"] = [{"appearance": "luminosity", "value": "dark"}]
            images.append(entry)
    (OUT / "Contents.json").write_text(
        json.dumps({"images": images, "info": {"version": 1, "author": "xcode"}}, indent=2) + "\n")
    print("Заставка:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
