import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { handleGateway } from '../gateway/worker.mjs';
import { quotaSchema, reserveAttempt } from '../gateway/quota.mjs';

const service = 'https://example-worker.test';
const path = '/api/v1/ai/draft';
const published = 'https://rongsenzhang.github.io';
const observation = 'When the cut edge frays, add 5% material for a trial cut.';
const dummyKey = 'test-only-provider-fixture';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(quotaSchema);
  t.after(() => sqlite.close());
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return () => sqlite.prepare(sql).run(...values);
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((run) => ({
          success: true,
          meta: { changes: run().changes },
        }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, env: { OPENAI_API_KEY: dummyKey, DB } };
}

function post(options = {}) {
  const headers = new Headers({
    Origin: published,
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '192.0.2.12',
    ...options.headers,
  });
  for (const key of options.without ?? []) headers.delete(key);
  return new Request(service + path, {
    method: 'POST',
    headers,
    body: options.body ?? JSON.stringify({ observation }),
  });
}

function completion() {
  return Response.json({
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              scope: 'trial-reserve',
              suggestedPercent: 5,
              evidenceQuote: observation,
              questionCodes: ['stock'],
              counterexampleCode: 'stable',
            }),
          },
        ],
      },
    ],
  });
}

function total(sqlite) {
  return sqlite.prepare('SELECT COALESCE(SUM(admitted),0) AS n FROM ai_quota').get().n;
}

test('public health, routing and both permitted origins expose only the intended contract', async (t) => {
  const { env, sqlite } = fixture(t);
  const health = await worker.fetch(new Request(service + '/health'), env);
  assert.deepEqual(await health.json(), { configured: true, version: '1.1.0' });
  const unset = await worker.fetch(new Request(service + '/health'), {});
  assert.deepEqual(await unset.json(), { configured: false, version: '1.1.0' });
  for (const origin of [published, service]) {
    const response = await worker.fetch(
      new Request(service + path, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      }),
      env,
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.has('Access-Control-Allow-Credentials'), false);
  }
  for (const spoofed of ['null', published + '.other.example', 'https://another.github.io']) {
    const response = await worker.fetch(post({ headers: { Origin: spoofed } }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  }
  assert.equal((await worker.fetch(post({ without: ['Origin'] }), env)).status, 403);
  assert.equal(
    (await worker.fetch(new Request(service + path, { headers: { Origin: published } }), env))
      .status,
    405,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(service + '/api/v1/other', { headers: { Origin: published } }),
        env,
      )
    ).status,
    404,
  );
  const denied = await worker.fetch(
    new Request(service + path, {
      method: 'OPTIONS',
      headers: {
        Origin: published,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization',
      },
    }),
    env,
  );
  assert.equal(denied.status, 403);
  assert.equal(total(sqlite), 0);
});

test('byte size, input shape, private information and unavailable identity fail before quota or provider use', async (t) => {
  const { env, sqlite } = fixture(t);
  const rejects = [
    [post({ body: '{}' }), 400],
    [post({ body: '{' }), 400],
    [post({ body: JSON.stringify({ observation, model: 'override' }) }), 400],
    [post({ body: JSON.stringify({ observation: 'very short' }) }), 400],
    [post({ body: JSON.stringify({ observation: 'x'.repeat(501) }) }), 400],
    [post({ body: JSON.stringify({ observation: 'Write to synthetic@example.org' }) }), 400],
    [
      post({ body: JSON.stringify({ observation: 'Marker ' + dummyKey + ' in an observation' }) }),
      400,
    ],
    [post({ headers: { 'Content-Type': 'text/plain' } }), 415],
    [post({ headers: { 'Content-Length': '10000' } }), 413],
    [post({ body: ' '.repeat(4097) }), 413],
    [post({ body: new Uint8Array([255, 255, 255]) }), 400],
    [post({ without: ['CF-Connecting-IP'], headers: { 'X-Forwarded-For': '192.0.2.54' } }), 503],
  ];
  let calls = 0;
  for (const [request, status] of rejects) {
    const response = await handleGateway(request, env, async () => {
      calls++;
      return completion();
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), published);
  }
  assert.equal(calls, 0);
  assert.equal(total(sqlite), 0);
});

test('a real Worker handler calls the fixed adapter with a mock transport and shares a grounded result', async (t) => {
  const { env, sqlite } = fixture(t);
  let calls = 0;
  const response = await handleGateway(post(), env, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.headers.Authorization, 'Bearer ' + dummyKey);
    const payload = JSON.parse(init.body);
    assert.equal(payload.store, false);
    assert.deepEqual(payload.tools, []);
    return completion();
  });
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.equal(draft.evidenceQuote, observation);
  assert.equal(draft.scope, 'trial-reserve');
  assert.equal(draft.suggestedPercent, 5);
  assert.equal(calls, 1);
  const row = sqlite.prepare('SELECT * FROM ai_quota').get();
  assert.match(row.client_tag, /^[0-9a-f]{32}$/);
  assert.equal(row.admitted, 1);
  for (const secret of [dummyKey, observation, '192.0.2.12'])
    assert.ok(!JSON.stringify(row).includes(secret));
});

test('per-client and global ceilings survive simultaneous submissions and reset at UTC midnight', async (t) => {
  const { env, sqlite } = fixture(t);
  const now = new Date('2026-11-20T23:59:59.001Z');
  const reserve = (ip, clock = now) => reserveAttempt(env.DB, dummyKey, ip, clock);
  const oneClient = await Promise.all(Array.from({ length: 30 }, () => reserve('192.0.2.1')));
  assert.equal(oneClient.filter((result) => result.allowed).length, 10);
  assert.equal(oneClient[0].retryAfter, 1);
  const initialTag = sqlite.prepare('SELECT client_tag FROM ai_quota').get().client_tag;
  assert.equal(total(sqlite), 10);
  const others = await Promise.all(
    Array.from({ length: 140 }, (_, i) => reserve('192.0.2.' + (i + 2))),
  );
  assert.equal(others.filter((result) => result.allowed).length, 90);
  assert.equal(total(sqlite), 100);
  assert.equal((await reserve('198.51.100.3')).allowed, false);
  assert.equal((await reserve('192.0.2.1', new Date('2026-11-21T00:00:00Z'))).allowed, true);
  const next = sqlite.prepare('SELECT * FROM ai_quota').all();
  assert.equal(next.length, 1);
  assert.equal(next[0].utc_day, '2026-11-21');
  assert.notEqual(next[0].client_tag, initialTag);
  assert.equal(total(sqlite), 1);
});

test('admitted provider errors consume a slot, exhausted budgets and database outages never call upstream', async (t) => {
  const { env, sqlite } = fixture(t);
  let calls = 0;
  const upstream = async () => {
    calls++;
    return new Response(dummyKey, { status: 503 });
  };
  for (let i = 0; i < 10; i++) {
    const miss = await handleGateway(post(), env, upstream);
    assert.equal(miss.status, 503);
    assert.ok(!(await miss.text()).includes(dummyKey));
  }
  const exhausted = await handleGateway(post(), env, upstream);
  assert.equal(exhausted.status, 429);
  assert.ok(Number(exhausted.headers.get('Retry-After')) > 0);
  assert.equal(total(sqlite), 10);
  sqlite.exec('DROP TABLE ai_quota');
  const unavailable = await handleGateway(post(), env, upstream);
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes('sqlite'));
  assert.equal(calls, 10);
});
