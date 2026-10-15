"""Меняет иконку приложения (сайт + iOS) на один из сохранённых вариантов.

    python3 tools/set_icon.py hisn-c    — надпись «حصن» (вариант C), сейчас стоит она
    python3 tools/set_icon.py mosque    — прежняя иконка: полумесяц и мечеть

Варианты лежат в src/logo/<имя>/: AppIcon-1024.png (iOS) и три иконки сайта.
После смены: собрать сайт с новой версией (tools/build.py --version N), чтобы
телефоны обновили кэш, а для iPhone — запустить сборку TestFlight.
"""
import pathlib, shutil, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
name = sys.argv[1] if len(sys.argv) > 1 else ""
src = ROOT / "src/logo" / name
if not name or not src.is_dir():
    sys.exit("Укажи вариант: " + ", ".join(p.name for p in (ROOT / "src/logo").iterdir() if p.is_dir()))
TARGETS = {
    "AppIcon-1024.png": "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    "apple-touch-icon.png": "apple-touch-icon.png",
    "icon-192.png": "icon-192.png",
    "icon-512.png": "icon-512.png",
}
for f, dst in TARGETS.items():
    img = Image.open(src / f)
    assert img.mode == "RGB", f"{f}: App Store не принимает прозрачность"
    shutil.copyfile(src / f, ROOT / dst)
    print(f"{dst}  {img.size[0]}×{img.size[1]}")
