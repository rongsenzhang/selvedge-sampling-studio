import { scenarios, rules, rulesVersion } from './engine.mjs';
import { readBrief, RequestError } from './records.mjs';

const json = (payload, status = 200) =>
  Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });

export async function handleApi(request, route, repository) {
  try {
    if (request.method === 'GET') {
      if (route === 'catalogue') return json({ rulesVersion, scenarios, rules });
      if (route === 'reviews') return json(await repository.list());
      if (route === 'health')
        return json({ version: '1.1.0', rulesVersion, storage: repository.storage });
    }
    if (request.method === 'POST' && (route === 'analyse' || route === 'reviews')) {
      if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
        throw new RequestError('Send JSON with application/json.', 415);
      }
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 32768)
        throw new RequestError('Payload too large.', 413);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new RequestError('Invalid JSON.');
      }
      if (route === 'analyse') return json(readBrief(data));
      const { record, inserted } = await repository.save(data);
      return json(record, inserted ? 201 : 200);
    }
    return json({ error: 'Route or method unavailable.' }, 404);
  } catch (error) {
    return json(
      {
        error: error instanceof RequestError ? error.message : 'Could not access the review store.',
      },
      error instanceof RequestError ? error.status : 500,
    );
  }
}
