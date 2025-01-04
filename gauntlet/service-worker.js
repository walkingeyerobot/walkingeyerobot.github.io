self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open('gauntletV1').then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './index.js',
                './img.png',
                './manifest.json',
                './service-worker.js',
                './gauntletpwd.wasm',
                './wasm_exec.js',
                'https://cdn.jsdelivr.net/npm/beercss@3.7.12/dist/cdn/beer.min.css',
                'https://cdn.jsdelivr.net/npm/beercss@3.7.12/dist/cdn/beer.min.js',
                'https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.2/dist/cdn/material-dynamic-colors.min.js',
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});