import assert from 'node:assert/strict';
import test from 'node:test';
import { draftObservation } from '../server/ai-draft.mjs';

const apiKey = 'test-credential-placeholder';
const note = 'When the cut edge frays, reserve 5% per colourway for the trial cut.';
const extraction = {
  scope: 'trial-reserve',
  suggestedPercent: 5,
  evidenceQuote: note,
  questionCodes: ['evidence', 'stock'],
  counterexampleCode: 'stable',
};
const envelope = (content, status = 'completed') => ({
  status,
  output: [{ type: 'message', role: 'assistant', content }],
});
const responseFor = (result) =>
  Response.json(envelope([{ type: 'output_text', text: JSON.stringify(result) }]));
const ask = (text, result) =>
  draftObservation({ observation: text }, { apiKey, fetchImpl: async () => responseFor(result) });
const expectStatus = (code) => (err) => err.status === code && !err.message.includes(apiKey);

test('sends one server-authenticated strict JSON request and returns the grounded draft', async () => {
  let request;
  const result = await draftObservation(
    { observation: ' ' + note + ' ' },
    {
      apiKey,
      fetchImpl: async (url, init) => {
        request = { url, ...init, body: JSON.parse(init.body) };
        return responseFor(extraction);
      },
    },
  );
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'manual');
  assert.equal(request.headers.Authorization, 'Bearer ' + apiKey);
  assert.equal(request.body.store, false);
  assert.deepEqual(request.body.tools, []);
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, true);
  assert.equal(request.body.text.format.schema.additionalProperties, false);
  assert.deepEqual(request.body.input, [{ role: 'user', content: note }]);
  assert.equal(request.body.model, 'gpt-4.1-mini');
  assert.ok(request.body.max_output_tokens <= 1000);
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(JSON.stringify(request.body).includes(apiKey), false);
  assert.deepEqual(Object.keys(result).sort(), [
    'action',
    'condition',
    'counterexample',
    'evidenceQuote',
    'observation',
    'questions',
    'scope',
    'suggestedPercent',
  ]);
  assert.equal(result.suggestedPercent, 5);
  assert.equal(result.evidenceQuote, note);
  assert.match(result.action, /for review/);
  assert.ok(result.questions.every((item) => item.endsWith('?')));
});

test('model configuration chooses the deployed model and cannot replace the fixed endpoint', async () => {
  let usedModel;
  await draftObservation(
    { observation: note },
    {
      apiKey,
      model: 'configured-model',
      fetchImpl: async (url, options) => {
        assert.equal(url, 'https://api.openai.com/v1/responses');
        usedModel = JSON.parse(options.body).model;
        return responseFor(extraction);
      },
    },
  );
  assert.equal(usedModel, 'configured-model');
});

test('supports explicit digits with percent or per cent, and the inclusive endpoints', async () => {
  for (const [literal, amount] of [
    ['5 per cent', 5],
    ['5 percent', 5],
    ['0%', 0],
    ['20 %', 20],
  ]) {
    const text = note.replace('5%', literal);
    const draft = await ask(text, { ...extraction, suggestedPercent: amount, evidenceQuote: text });
    assert.equal(draft.suggestedPercent, amount);
  }
});

test('unrelated observations and missing evidence return a useful draft with no invented number', async () => {
  const currency = 'The showroom catalogue needs a new commercial price bands page.';
  const vague = 'Loose-weave edges need some extra material for a trial cut.';
  for (const [scope, text, code] of [
    ['out-of-scope', currency, 'scope'],
    ['needs-clarification', vague, 'amount'],
  ]) {
    const result = await ask(text, {
      ...extraction,
      scope,
      suggestedPercent: null,
      evidenceQuote: text,
      questionCodes: [code],
    });
    assert.equal(result.suggestedPercent, null);
    assert.equal(result.scope, scope);
    assert.equal(result.questions.length, 1);
  }
});

test('rejects fabricated evidence, undocumented numbers, multiple values, ranges and fractional rates', async () => {
  for (const literal of [
    'a little extra',
    '5% or 6%',
    '4 to 5%',
    '4–5%',
    '5% to 7',
    'about 5%',
    'at least 5%',
    '-5%',
    '−5%',
    '3.5%',
    '25%',
    'five per cent',
  ]) {
    const text = note.replace('5%', literal);
    await assert.rejects(ask(text, { ...extraction, evidenceQuote: text }), expectStatus(502));
  }
  for (const patch of [
    { suggestedPercent: 6 },
    { suggestedPercent: null },
    { suggestedPercent: '5' },
    { evidenceQuote: 'Make up a new production instruction.' },
    { evidenceQuote: '' },
    { evidenceQuote: '5%' },
    { evidenceQuote: 'When the cut edge frays' },
    { scope: 'needs-clarification' },
    { scope: 'out-of-scope' },
    { scope: 'unsupported' },
    { unsupported: 'new field' },
    { condition: 'Unverified source' },
    { counterexampleCode: ['stable'] },
    { counterexampleCode: 'invented plan' },
    { questionCodes: ['unknown'] },
    { questionCodes: ['amount', 'amount'] },
    { questionCodes: [] },
  ]) {
    await assert.rejects(ask(note, { ...extraction, ...patch }), expectStatus(502));
  }
});

test('input accepts only a synthetic observation, validates length and filters credential-like text before fetch', async () => {
  let calls = 0;
  const options = {
    apiKey,
    fetchImpl: async () => {
      calls += 1;
      return responseFor(extraction);
    },
  };
  for (const input of [
    null,
    [],
    'text',
    {},
    { observation: '' },
    { observation: 27 },
    { observation: 'x'.repeat(11) },
    { observation: 'x'.repeat(501) },
    { observation: note, apiKey: 'unused' },
    { observation: note, model: 'unused' },
    { observation: 'Please use ' + apiKey + ' in the note.' },
    { observation: 'Contact a.person@example.com about a trial.' },
    { observation: 'Sample key sk-madeupabcd123456 in this note.' },
    { observation: 'Manufacturing note\u0000 on a cut.' },
  ]) {
    await assert.rejects(draftObservation(input, options), expectStatus(400));
  }
  await assert.rejects(
    draftObservation({ observation: note }, { ...options, apiKey: undefined }),
    expectStatus(503),
  );
  assert.equal(calls, 0);
});

test('provider rate limits, unavailability, connectivity faults and timeouts expose only public messages', async () => {
  for (const [upstream, expected] of [
    [302, 502],
    [429, 429],
    [401, 503],
    [404, 503],
    [503, 503],
    [408, 504],
    [400, 502],
  ]) {
    await assert.rejects(
      draftObservation(
        { observation: note },
        {
          apiKey,
          fetchImpl: async () =>
            new Response('Private provider body ' + apiKey, { status: upstream }),
        },
      ),
      expectStatus(expected),
    );
  }
  for (const [name, status] of [
    ['TypeError', 502],
    ['TimeoutError', 504],
    ['AbortError', 504],
  ]) {
    const failure = Object.assign(new Error('Provider mentions ' + apiKey), { name });
    await assert.rejects(
      draftObservation(
        { observation: note },
        {
          apiKey,
          fetchImpl: async () => {
            throw failure;
          },
        },
      ),
      expectStatus(status),
    );
  }
  let calls = 0;
  await assert.rejects(
    draftObservation(
      { observation: note },
      {
        apiKey,
        signal: AbortSignal.abort(),
        fetchImpl: async () => {
          calls++;
        },
      },
    ),
    expectStatus(504),
  );
  assert.equal(calls, 0);
});

test('returns a generic refusal and rejects incomplete, empty, malformed or ambiguous responses', async () => {
  const checkPayload = (payload, status) =>
    assert.rejects(
      draftObservation(
        { observation: note },
        { apiKey, fetchImpl: async () => Response.json(payload) },
      ),
      expectStatus(status),
    );
  await checkPayload(
    envelope([{ type: 'refusal', refusal: 'Private provider reason ' + apiKey }]),
    422,
  );
  const good = { type: 'output_text', text: JSON.stringify(extraction) };
  for (const payload of [
    null,
    {},
    { status: 'completed', output: [] },
    envelope([good], 'incomplete'),
    envelope([]),
    envelope([good, good]),
    envelope([{ type: 'output_text', text: '{' }]),
    envelope([{ type: 'output_text', text: 'null' }]),
  ]) {
    await checkPayload(payload, 502);
  }
});
