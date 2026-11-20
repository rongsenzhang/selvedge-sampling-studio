import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudio } from '../server/main.mjs';
import { evaluate, scenarios } from '../public/lib/engine.mjs';

async function start(t, path) {
  const app = createStudio(path);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  let open = true;
  async function close() {
    if (open) {
      open = false;
      await app.close();
    }
  }
  t.after(close);
  const port = app.server.address().port;
  return { close, base: 'http://127.0.0.1:' + port + '/api/v1/' };
}
const post = (base, route, data) =>
  fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
const review = {
  scenarioId: scenarios[0].id,
  brief: scenarios[0].brief,
  note: 'Before the trial cut',
  requestId: 'api-test-01',
};
test('catalogue and all HTTP scenarios agree with the browser engine', async (t) => {
  const { base } = await start(t);
  assert.deepEqual((await (await fetch(base + 'catalogue')).json()).scenarios, scenarios);
  assert.equal((await (await fetch(base + 'health')).json()).storage, 'sqlite');
  for (const { brief } of scenarios)
    assert.deepEqual(await (await post(base, 'analyse', brief)).json(), evaluate(brief));
});
test('retry is idempotent, conflicting reuse is detected, snapshot survives restart', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'selvedge-test-'));
  try {
    const file = join(dir, 'test.sqlite');
    const one = await start(t, file);
    const saves = await Promise.all([
      post(one.base, 'reviews', review),
      post(one.base, 'reviews', review),
    ]);
    assert.deepEqual(saves.map((r) => r.status).sort(), [200, 201]);
    const expected = await saves[0].json();
    assert.equal((await post(one.base, 'reviews', { ...review, note: 'Different' })).status, 409);
    await one.close();
    const two = await start(t, file);
    assert.deepEqual(await (await fetch(two.base + 'reviews')).json(), [expected]);
    await two.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('invalid submissions never enter the review history', async (t) => {
  const { base } = await start(t);
  assert.equal((await post(base, 'reviews', { ...review, brief: {} })).status, 422);
  assert.equal((await post(base, 'reviews', { ...review, note: 'x'.repeat(501) })).status, 422);
  assert.equal((await post(base, 'reviews', { ...review, scenarioId: 'unknown' })).status, 422);
  assert.equal((await post(base, 'analyse', { ...review.brief, quantity: '180' })).status, 422);
  assert.equal((await fetch(base + 'analyse', { method: 'POST', body: 'x' })).status, 415);
  assert.equal(
    (
      await fetch(base + 'analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })
    ).status,
    400,
  );
  assert.equal((await post(base, 'reviews', { ...review, note: 'x'.repeat(40000) })).status, 413);
  assert.deepEqual(await (await fetch(base + 'reviews')).json(), []);
});
test('committed writes notify a connected integration client', async (t) => {
  const { base } = await start(t);
  const abort = new AbortController();
  const response = await fetch(base + 'events', { signal: abort.signal });
  const reader = response.body.getReader();
  try {
    await reader.read();
    await post(base, 'reviews', review);
    const update = await reader.read();
    assert.match(new TextDecoder().decode(update.value), /event: review\ndata: .*api-test-01/);
  } finally {
    abort.abort();
    await reader.cancel().catch(() => {});
  }
});
