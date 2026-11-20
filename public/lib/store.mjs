import { readBrief } from './records.mjs';
import { listLocal, saveLocal, observeLocal } from './browser-records.mjs';

export const getMode = () =>
  document.documentElement.dataset.runtime === 'server' ? 'server' : 'browser';
const root = new URL('../', import.meta.url);
let workerSetup;
async function prepareWorker() {
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) return false;
  try {
    await navigator.serviceWorker.register(new URL('sw.mjs', root), {
      type: 'module',
      scope: root.pathname,
    });
    return navigator.serviceWorker.controller?.scriptURL === new URL('sw.mjs', root).href;
  } catch {
    return false;
  }
}
async function useHttp() {
  if (getMode() === 'server') return true;
  workerSetup ??= prepareWorker();
  await workerSetup;
  return navigator.serviceWorker?.controller?.scriptURL === new URL('sw.mjs', root).href;
}
async function request(route, input) {
  const response = await fetch(
    new URL('api/v1/' + route, root),
    input === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}
export async function analyse(brief) {
  return (await useHttp()) ? request('analyse', brief) : readBrief(brief);
}
export async function listRecords() {
  return (await useHttp()) ? request('reviews') : listLocal();
}
export async function saveRecord(input) {
  const payload = { ...input, requestId: input.requestId ?? crypto.randomUUID() };
  return (await useHttp()) ? request('reviews', payload) : (await saveLocal(payload)).record;
}
export function subscribeRecords(callback) {
  if (getMode() === 'browser') return observeLocal(callback);
  const stream = new EventSource(new URL('api/v1/events', root));
  stream.addEventListener('review', callback);
  return () => stream.close();
}
