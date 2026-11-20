import { draftObservation, inputObservation } from '../server/ai-draft.mjs';
import { reserveAttempt } from './quota.mjs';

const publicOrigin = 'https://rongsenzhang.github.io';
const draftPath = '/api/v1/ai/draft';
const bodyLimit = 4096;
const version = '1.1.0';

function reject(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readInput(request) {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw reject(415, 'Send the observation as application/json.');
  }
  if (Number(request.headers.get('Content-Length')) > bodyLimit) {
    throw reject(413, 'The request exceeds the observation size limit.');
  }
  if (!request.body) throw reject(400, 'Send one observation as a JSON object.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0,
    text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > bodyLimit) {
        await reader.cancel();
        throw reject(413, 'The request exceeds the observation size limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error.status === 413) throw error;
    throw reject(400, 'Send one valid UTF-8 JSON object.');
  } finally {
    reader.releaseLock();
  }
}

function isConfigured(env) {
  return (
    typeof env.OPENAI_API_KEY === 'string' &&
    !!env.OPENAI_API_KEY.trim() &&
    !/[\r\n]/.test(env.OPENAI_API_KEY) &&
    typeof env.DB?.batch === 'function' &&
    typeof env.DB?.prepare === 'function'
  );
}

export async function handleGateway(request, env, fetchImpl = fetch) {
  const { origin, pathname } = new URL(request.url);
  const source = request.headers.get('Origin');
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  });
  const send = (body, status = 200) => Response.json(body, { status, headers });
  if (source && source !== origin && source !== publicOrigin)
    return send({ error: 'Origin unavailable.' }, 403);
  if (source) headers.set('Access-Control-Allow-Origin', source);
  if (pathname === '/health' && request.method === 'GET')
    return send({ configured: isConfigured(env), version });
  if (pathname !== draftPath) return send({ error: 'Route unavailable.' }, 404);
  if (!source) return send({ error: 'Use the published studio to request a draft.' }, 403);
  if (request.method === 'OPTIONS') {
    const requested =
      request.headers.get('Access-Control-Request-Headers')?.toLowerCase().split(',') ?? [];
    if (
      request.headers.get('Access-Control-Request-Method') !== 'POST' ||
      requested.some((header) => !['content-type', 'accept'].includes(header.trim()))
    ) {
      return send({ error: 'Requested method or headers unavailable.' }, 403);
    }
    headers.set('Access-Control-Allow-Methods', 'POST');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    headers.set('Access-Control-Max-Age', '600');
    headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    headers.set('Allow', 'POST, OPTIONS');
    return send({ error: 'Use POST for draft requests.' }, 405);
  }

  let observation;
  try {
    observation = inputObservation(await readInput(request));
  } catch (error) {
    return send({ error: error.message }, error.status ?? 400);
  }
  if (!isConfigured(env)) return send({ error: 'Live drafting is temporarily unavailable.' }, 503);
  const apiKey = env.OPENAI_API_KEY.trim();
  if (apiKey.length >= 8 && observation.includes(apiKey))
    return send({ error: 'Remove credentials from the observation.' }, 400);
  // The edge owns this header. Never take a client identifier from the form or
  // a user-controlled forwarding chain. Sites without this header fail closed.
  const address = request.headers.get('CF-Connecting-IP');
  if (!address || address.length > 45 || !/^[0-9a-f:.]+$/i.test(address)) {
    return send(
      { error: 'The gateway could not verify this request. Continue in the manual workshop.' },
      503,
    );
  }
  try {
    const { allowed, retryAfter } = await reserveAttempt(
      env.DB,
      env.QUOTA_HASH_SECRET || apiKey,
      address,
    );
    if (!allowed) {
      headers.set('Retry-After', String(retryAfter));
      headers.set('Access-Control-Expose-Headers', 'Retry-After');
      return send(
        {
          error: 'The daily drafting allowance has been reached. Continue in the manual workshop.',
        },
        429,
      );
    }
  } catch {
    return send({ error: 'The request allowance could not be checked. Please try later.' }, 503);
  }
  try {
    const draft = await draftObservation(
      { observation },
      {
        apiKey,
        model: env.OPENAI_MODEL || undefined,
        fetchImpl,
        signal: request.signal,
      },
    );
    return send(draft);
  } catch (error) {
    const status = [400, 422, 429, 502, 503, 504].includes(error.status) ? error.status : 502;
    // Provider details, credentials and observations do not belong in error logs.
    return send(
      {
        error:
          'The AI service could not provide a verified draft. Continue in the manual workshop.',
      },
      status,
    );
  }
}

export default {
  fetch(request, env) {
    return handleGateway(request, env);
  },
};
