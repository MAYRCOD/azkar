#!/usr/bin/env bash
# Запуск всех проверок: поднимает локальный сервер в корне репозитория,
# прогоняет tests/app.test.js и останавливает сервер.
# Первый раз нужно установить Playwright:  (cd tests && npm install)
set -e
cd "$(dirname "$0")/.."
PORT=8765
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
# В облачной среде Claude браузер лежит здесь; на своём компьютере Playwright найдёт его сам
[ -x /opt/pw-browsers/chromium ] && export CHROMIUM_PATH=/opt/pw-browsers/chromium
NODE_PATH="$(pwd)/tests/node_modules" node tests/app.test.js "http://localhost:$PORT/"
