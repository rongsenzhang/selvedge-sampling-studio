import { makeRecord, checkReplay } from './records.mjs';

const dbName = 'selvedge-sampling-studio-v1';
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const reviews = request.result.createObjectStore('reviews', { keyPath: 'id' });
      reviews.createIndex('createdAt', 'createdAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error('Browser storage is unavailable. Enable local site storage to save a review.'),
      );
    request.onblocked = () => reject(new Error('Close other studio tabs and try again.'));
  });
}
export async function listLocal() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reviews', 'readonly');
    const request = tx.objectStore('reviews').index('createdAt').openCursor(null, 'prev');
    const records = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && records.length < 100) {
        records.push(cursor.value);
        cursor.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(records);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Reading reviews failed.'));
    };
  });
}
export async function saveLocal(input) {
  const proposed = makeRecord(input);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reviews', 'readwrite');
    const store = tx.objectStore('reviews');
    const read = store.get(proposed.id);
    let record = proposed,
      inserted = false,
      failure;
    read.onsuccess = () => {
      try {
        if (read.result) record = checkReplay(read.result, proposed);
        else {
          store.add(proposed);
          inserted = true;
        }
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      if (inserted && typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(dbName);
        channel.postMessage({ type: 'saved', id: record.id });
        channel.close();
      }
      resolve({ record, inserted });
    };
    tx.onabort = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error('Saving the review failed.'));
    };
  });
}
export function observeLocal(callback) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(dbName);
  channel.onmessage = callback;
  return () => channel.close();
}
