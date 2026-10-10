// Делает иконки приложения из логотипа src/logo/logo.svg.
// Рисует SVG в настоящем браузере, поэтому иконки получаются чёткими в любом размере.
// Запуск из корня репозитория:  NODE_PATH=tests/node_modules node tools/make_icons.js
//
//   apple-touch-icon.png  180×180  — иконка на экране «Домой» iPhone
//   icon-192.png          192×192  — Android и manifest
//   icon-512.png          512×512  — Android, экран загрузки
//   ios/.../AppIcon-512@2x.png  1024×1024 — иконка iOS-приложения (Capacitor).
//     App Store не принимает иконку с прозрачностью, поэтому после этой команды
//     прозрачность убирается: python3 tools/flatten_icon.py

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "src/logo/logo.svg"), "utf8");
const SIZES = {
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png": 1024,
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const [name, size] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const scaled = svg.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`);
    await page.setContent(`<style>html,body{margin:0}</style>${scaled}`);
    await page.screenshot({ path: path.join(ROOT, name), omitBackground: false });
    await page.close();
    console.log(`${name}  ${size}×${size}`);
  }
  await browser.close();
})();
