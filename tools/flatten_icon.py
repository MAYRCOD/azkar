"""Убирает прозрачность из иконки iOS: App Store отклоняет иконки с альфа-каналом."""
import pathlib
from PIL import Image

p = pathlib.Path(__file__).resolve().parent.parent / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
img = Image.open(p).convert("RGBA")
bg = Image.new("RGB", img.size, (255, 255, 255))
bg.paste(img, mask=img.split()[3])
bg.save(p)
print(f"{p.name}: {bg.size[0]}×{bg.size[1]}, без прозрачности")
