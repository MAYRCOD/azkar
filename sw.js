// Сохраняет приложение в телефоне, чтобы оно открывалось без интернета.
// Когда выкладываешь новую версию — поменяй число в VERSION, и телефоны обновятся.
const VERSION = "azkar-v48";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
// Файлы раздела «Коран» (суры и шрифт мусхафа) — список вписывает tools/build.py
const QURAN_FILES = ["./quran/100.json", "./quran/101.json", "./quran/102.json", "./quran/103.json", "./quran/104.json", "./quran/105.json", "./quran/106.json", "./quran/107.json", "./quran/108.json", "./quran/109.json", "./quran/110.json", "./quran/111.json", "./quran/112.json", "./quran/113.json", "./quran/114.json", "./quran/78.json", "./quran/79.json", "./quran/80.json", "./quran/81.json", "./quran/82.json", "./quran/83.json", "./quran/84.json", "./quran/85.json", "./quran/86.json", "./quran/87.json", "./quran/88.json", "./quran/89.json", "./quran/90.json", "./quran/91.json", "./quran/92.json", "./quran/93.json", "./quran/94.json", "./quran/95.json", "./quran/96.json", "./quran/97.json", "./quran/98.json", "./quran/99.json", "./quran/index.json", "./quran/hafs18.ttf"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.concat(QURAN_FILES))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Сначала пробуем интернет (чтобы получать обновления), без интернета — берём сохранённое
self.addEventListener("fetch", e => {
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
