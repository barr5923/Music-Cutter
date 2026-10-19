const CACHE = "music-cutter-v2";
const FILES = [
  "./", "index.html", "styles.css", "app.js", "audio.js", "cues.js",
  "icon.svg", "manifest.webmanifest", "example-cues.csv", "THIRD-PARTY-NOTICES.txt",
  "vendor/ffmpeg/ffmpeg.js", "vendor/ffmpeg/814.ffmpeg.js",
  "vendor/core/ffmpeg-core.js", "vendor/core/ffmpeg-core.wasm",
  "vendor/jszip/jszip.min.js", "vendor/exceljs/exceljs.min.js",
];
async function prepareOffline() {
  const cache = await caches.open(CACHE);
  const entries = await Promise.all(FILES.map(path => cache.match(new URL(path, self.location.href))));
  if (entries.some(entry => !entry)) await cache.addAll(FILES);
}
self.addEventListener("install", event => {
  event.waitUntil(prepareOffline());
});
self.addEventListener("message", event => {
  if (event.data !== "PREPARE_OFFLINE" || !event.ports[0]) return;
  event.waitUntil(prepareOffline().then(
    () => event.ports[0].postMessage({ ready: true }),
    error => event.ports[0].postMessage({ error: error.message }),
  ));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("music-cutter-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(event.request, { ignoreSearch: true });
    if (response) return response;
    return fetch(event.request);
  })());
});
