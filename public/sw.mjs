import { handleApi } from './lib/api.mjs';
import { listLocal, saveLocal } from './lib/browser-records.mjs';
const prefix = new URL('api/v1/', self.registration.scope).href;
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const { url } = event.request;
  if (url.startsWith(prefix)) {
    event.respondWith(
      handleApi(event.request, new URL(url).pathname.slice(new URL(prefix).pathname.length), {
        storage: 'browser-indexeddb',
        list: listLocal,
        save: saveLocal,
      }),
    );
  }
});
