import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStudio } from '../server/main.mjs';

const apiKey = 'unit-test-placeholder-credential';
const note = 'When the edge frays, allow 5% per colourway for the trial cut.';

function mockResponse(text = note) {
  const result = {
    scope: 'trial-reserve',
    suggestedPercent: 5,
    evidenceQuote: text,
    questionCodes: ['stock'],
    counterexampleCode: 'short',
  };
  return Response.json({
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(result) }],
      },
    ],
  });
}

async function start(t, options = {}, file = ':memory:') {
  const studio = createStudio(file, options);
  await new Promise((resolve) => studio.server.listen(0, '127.0.0.1', resolve));
  let open = true;
  const close = async () => {
    if (!open) return;
    open = false;
    await studio.close();
  };
  t.after(close);
  const base = 'http://127.0.0.1:' + studio.server.address().port;
  const send = (content, headers = {}) =>
    fetch(base + '/api/v1/ai/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: content,
    });
  return { base, send, close };
}

test('disabled studio keeps the manual workshop available and the default examples empty', async (t) => {
  const { base, send } = await start(t);
  const config = await fetch(base + '/ai-config.json');
  assert.deepEqual(await config.json(), { endpoint: null });
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await (await fetch(base + '/ai-examples.json')).json(), { examples: [] });
  assert.equal((await fetch(base + '/workshop.html')).status, 200);
  assert.equal((await send(JSON.stringify({ observation: note }))).status, 503);
});

test('configured studio exposes only a relative endpoint and submits one grounded request', async (t) => {
  let calls = 0;
  const { base, send } = await start(t, {
    apiKey,
    model: 'mock-model',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer ' + apiKey);
      assert.equal(JSON.parse(options.body).model, 'mock-model');
      return mockResponse();
    },
  });
  assert.deepEqual(await (await fetch(base + '/ai-config.json')).json(), {
    endpoint: './api/v1/ai/draft',
  });
  const head = await fetch(base + '/ai-config.json', { method: 'HEAD' });
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base + '/ai-config.json', { method: 'POST' })).status, 405);
  const response = await send(JSON.stringify({ observation: note }), { Origin: base });
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.equal(draft.suggestedPercent, 5);
  assert.equal(draft.evidenceQuote, note);
  assert.equal(JSON.stringify(draft).includes(apiKey), false);
  assert.equal(calls, 1);
});

test('method, origin, type, body size and invalid fields trigger no provider calls or quota charges', async (t) => {
  let calls = 0;
  const { base, send } = await start(t, {
    apiKey,
    fetchImpl: async () => {
      calls++;
      return mockResponse();
    },
  });
  const valid = JSON.stringify({ observation: note });
  assert.equal((await fetch(base + '/api/v1/ai/draft')).status, 405);
  assert.equal((await send(valid, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await send(valid, { Origin: 'null' })).status, 403);
  assert.equal((await send(valid, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await send(valid, { Origin: base.replace('http:', 'https:') })).status, 403);
  assert.equal((await send(valid, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await send('{')).status, 400);
  assert.equal((await send(JSON.stringify({ observation: 'x'.repeat(8192) }))).status, 413);
  assert.equal((await send(JSON.stringify({ observation: note, extra: true }))).status, 400);
  assert.equal((await send(JSON.stringify({ observation: 'too short' }))).status, 400);
  assert.equal(calls, 0);
  for (let i = 0; i < 4; i++) assert.equal((await send(valid)).status, 200);
  const denied = await send(valid);
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('retry-after')) > 0);
  assert.equal(calls, 4);
});

test('global daily budget persists across restarts and replenishes on the next UTC day', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-ai-budget-'));
  const file = join(dir, 'studio.sqlite');
  let clock = Date.UTC(2026, 10, 20, 8);
  let calls = 0;
  const options = {
    apiKey,
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return mockResponse();
    },
  };
  let studio = await start(t, options, file);
  const valid = JSON.stringify({ observation: note });
  try {
    for (let i = 0; i < 24; i++) {
      if (i && i % 4 === 0) clock += 60000;
      assert.equal((await studio.send(valid)).status, 200);
    }
    await studio.close();
    studio = await start(t, options, file);
    const denied = await studio.send(valid);
    assert.equal(denied.status, 429);
    assert.ok(Number(denied.headers.get('retry-after')) > 60);
    assert.equal(calls, 24);
    clock = Date.UTC(2026, 10, 21, 0);
    assert.equal((await studio.send(valid)).status, 200);
    assert.equal(calls, 25);
  } finally {
    await studio.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('provider problems return a redacted client error and consume a reserved attempt', async (t) => {
  let calls = 0;
  const { send } = await start(t, {
    apiKey,
    fetchImpl: async () => {
      calls++;
      return new Response(apiKey, { status: 429 });
    },
  });
  for (let i = 0; i < 4; i++) {
    const response = await send(JSON.stringify({ observation: note }));
    assert.equal(response.status, 429);
    assert.equal((await response.text()).includes(apiKey), false);
  }
  const limited = await send(JSON.stringify({ observation: note }));
  assert.equal(limited.status, 429);
  assert.equal(calls, 4);
});
