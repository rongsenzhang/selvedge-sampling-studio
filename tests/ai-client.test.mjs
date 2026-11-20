import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiWorkspace, requestAiDraft, validateDraft } from '../public/lib/ai-client.mjs';

const observation = 'For a fraying edge add 7% for a trial cut.';
const draft = {
  observation,
  scope: 'trial-reserve',
  suggestedPercent: 7,
  condition: 'A fraying edge needs a trial cut.',
  action: 'Measure one trial.',
  questions: ['Who will review the trial?'],
  counterexample: 'Check a stable edge.',
  evidenceQuote: 'fraying edge add 7% for a trial cut',
};

test('validates the exact input and the supported reserve range', () => {
  assert.deepEqual(validateDraft(draft, observation), draft);
  for (const change of [
    { observation: 'A separate observation.' },
    { suggestedPercent: 21 },
    { suggestedPercent: null },
    { scope: 'out-of-scope' },
    { evidenceQuote: 'another quote' },
    { action: '' },
    { questions: [] },
  ])
    assert.throws(() => validateDraft({ ...draft, ...change }, observation));
  assert.equal(
    validateDraft({ ...draft, scope: 'needs-clarification', suggestedPercent: null }, observation)
      .suggestedPercent,
    null,
  );
});

test('an unavailable deployment leaves a manual workspace', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Missing', { status: 404 }));
  assert.deepEqual(await getAiWorkspace(), { endpoint: null, examples: [] });
});

test('recorded examples must identify the model, time and source observation', async (t) => {
  const recorded = { ...draft, model: 'example-test-model', generatedAt: '2026-11-20T12:00:00Z' };
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json(
      url.pathname.endsWith('ai-config.json')
        ? { endpoint: 'https://example.invalid/draft' }
        : {
            examples: [
              recorded,
              { ...recorded, model: '' },
              { ...recorded, generatedAt: 'unknown' },
              { ...recorded, evidenceQuote: 'absent' },
            ],
          },
    ),
  );
  const workspace = await getAiWorkspace();
  assert.equal(workspace.endpoint.href, 'https://example.invalid/draft');
  assert.deepEqual(workspace.examples, [
    { draft, model: recorded.model, generatedAt: recorded.generatedAt },
  ]);
});

test('a live request transmits only the observation and surfaces a declined draft', async (t) => {
  let attempt = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://example.invalid/draft');
    assert.deepEqual(JSON.parse(options.body), { observation });
    assert.equal(options.credentials, 'omit');
    return ++attempt === 1
      ? Response.json(draft)
      : Response.json({ error: 'declined' }, { status: 422 });
  });
  assert.deepEqual(await requestAiDraft('https://example.invalid/draft', observation), draft);
  await assert.rejects(requestAiDraft('https://example.invalid/draft', observation), /declined/);
});
