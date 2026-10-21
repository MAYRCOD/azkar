// Сохраняет приложение в телефоне, чтобы оно открывалось без интернета.
// Когда выкладываешь новую версию — поменяй число в VERSION, и телефоны обновятся.
const VERSION = "azkar-v49";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
// Файлы раздела «Коран» (суры и шрифт мусхафа) — список вписывает tools/build.py
const QURAN_FILES = ["./quran/1.json", "./quran/10.json", "./quran/100.json", "./quran/101.json", "./quran/102.json", "./quran/103.json", "./quran/104.json", "./quran/105.json", "./quran/106.json", "./quran/107.json", "./quran/108.json", "./quran/109.json", "./quran/11.json", "./quran/110.json", "./quran/111.json", "./quran/112.json", "./quran/113.json", "./quran/114.json", "./quran/12.json", "./quran/13.json", "./quran/14.json", "./quran/15.json", "./quran/16.json", "./quran/17.json", "./quran/18.json", "./quran/19.json", "./quran/2.json", "./quran/20.json", "./quran/21.json", "./quran/22.json", "./quran/23.json", "./quran/24.json", "./quran/25.json", "./quran/26.json", "./quran/27.json", "./quran/28.json", "./quran/29.json", "./quran/3.json", "./quran/30.json", "./quran/31.json", "./quran/32.json", "./quran/33.json", "./quran/34.json", "./quran/35.json", "./quran/36.json", "./quran/37.json", "./quran/38.json", "./quran/39.json", "./quran/4.json", "./quran/40.json", "./quran/41.json", "./quran/42.json", "./quran/43.json", "./quran/44.json", "./quran/45.json", "./quran/46.json", "./quran/47.json", "./quran/48.json", "./quran/49.json", "./quran/5.json", "./quran/50.json", "./quran/51.json", "./quran/52.json", "./quran/53.json", "./quran/54.json", "./quran/55.json", "./quran/56.json", "./quran/57.json", "./quran/58.json", "./quran/59.json", "./quran/6.json", "./quran/60.json", "./quran/61.json", "./quran/62.json", "./quran/63.json", "./quran/64.json", "./quran/65.json", "./quran/66.json", "./quran/67.json", "./quran/68.json", "./quran/69.json", "./quran/7.json", "./quran/70.json", "./quran/71.json", "./quran/72.json", "./quran/73.json", "./quran/74.json", "./quran/75.json", "./quran/76.json", "./quran/77.json", "./quran/78.json", "./quran/79.json", "./quran/8.json", "./quran/80.json", "./quran/81.json", "./quran/82.json", "./quran/83.json", "./quran/84.json", "./quran/85.json", "./quran/86.json", "./quran/87.json", "./quran/88.json", "./quran/89.json", "./quran/9.json", "./quran/90.json", "./quran/91.json", "./quran/92.json", "./quran/93.json", "./quran/94.json", "./quran/95.json", "./quran/96.json", "./quran/97.json", "./quran/98.json", "./quran/99.json", "./quran/index.json", "./quran/hafs18.ttf"];

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
