#!/usr/bin/env bash
# Готовит папку www/ — то, что Capacitor кладёт внутрь iOS-приложения.
# Берём уже собранный index.html и иконки. Запускать после python3 tools/build.py.
set -e
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
cp index.html manifest.webmanifest icon-192.png icon-512.png apple-touch-icon.png www/
echo "Готово: www/ ($(du -sh www | cut -f1))"
