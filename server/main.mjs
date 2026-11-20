import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleApi } from '../public/lib/api.mjs';
import { makeRecord, checkReplay } from '../public/lib/records.mjs';
import { draftObservation, inputObservation } from './ai-draft.mjs';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function createStudio(
  dbPath = ':memory:',
  { apiKey, model, fetchImpl = fetch, now = Date.now } = {},
) {
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, scenario_id TEXT NOT NULL,
      note TEXT NOT NULL, rules_version TEXT NOT NULL, brief_json TEXT NOT NULL,
      result_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','review','blocked')));
    CREATE INDEX IF NOT EXISTS by_review_date ON reviews(created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS ai_request_budget (utc_day TEXT PRIMARY KEY, used INTEGER NOT NULL);`);
  // The shared daily counter survives restarts with a file-backed studio database.
  const reserveDaily = db.prepare(`
    INSERT INTO ai_request_budget (utc_day, used) VALUES (?, 1)
    ON CONFLICT(utc_day) DO UPDATE SET used=used+1 WHERE used < 24`);
  let minuteStarts = [];
  function reserveAiRequest() {
    const time = now();
    minuteStarts = minuteStarts.filter((started) => started > time - 60000);
    if (minuteStarts.length >= 4) return Math.ceil((minuteStarts[0] + 60000 - time) / 1000);
    const utcDay = new Date(time).toISOString().slice(0, 10);
    if (!reserveDaily.run(utcDay).changes) return Math.ceil((86400000 - (time % 86400000)) / 1000);
    minuteStarts.push(time);
    return 0;
  }
  const aiEnabled = typeof apiKey === 'string' && Boolean(apiKey.trim()) && !/[\r\n]/.test(apiKey);
  const streams = new Set();
  const byId = db.prepare('SELECT * FROM reviews WHERE id=?');
  const insert = db.prepare(
    'INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
  );
  function decode(row) {
    return {
      id: row.id,
      createdAt: row.created_at,
      scenarioId: row.scenario_id,
      note: row.note,
      brief: JSON.parse(row.brief_json),
      result: JSON.parse(row.result_json),
    };
  }
  const repository = {
    storage: 'sqlite',
    list: () =>
      db
        .prepare('SELECT * FROM reviews ORDER BY created_at DESC,id DESC LIMIT 100')
        .all()
        .map(decode),
    save(input) {
      const record = makeRecord(input);
      const { id, createdAt, scenarioId, note, brief, result } = record;
      const write = insert.run(
        id,
        createdAt,
        scenarioId,
        note,
        result.rulesVersion,
        JSON.stringify(brief),
        JSON.stringify(result),
        result.status,
      );
      if (!write.changes)
        return { record: checkReplay(decode(byId.get(id)), record), inserted: false };
      for (const stream of streams)
        stream.write('event: review\ndata: ' + JSON.stringify({ id, createdAt }) + '\n\n');
      return { record, inserted: true };
    },
  };
  const server = createServer(async (req, res) => {
    const fail = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/ai-config.json') {
        if (!['GET', 'HEAD'].includes(req.method))
          return fail(405, 'Use GET for studio configuration.');
        res.writeHead(200, { 'Content-Type': types['.json'] });
        const config = { endpoint: aiEnabled ? './api/v1/ai/draft' : null };
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(config));
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const route = url.pathname.slice('/api/v1/'.length);
        const aiRoute = route === 'ai/draft';
        if (req.headers.origin) {
          let origin;
          try {
            origin = new URL(req.headers.origin);
          } catch {
            return fail(403, 'Use the same studio origin.');
          }
          if (
            origin.host !== req.headers.host ||
            !['http:', 'https:'].includes(origin.protocol) ||
            origin.origin !== req.headers.origin
          )
            return fail(403, 'Use the same studio origin.');
          // Same-origin fetch metadata also works behind the HTTPS Codespaces proxy.
          if (
            aiRoute &&
            origin.protocol !== 'http:' &&
            req.headers['sec-fetch-site'] !== 'same-origin'
          )
            return fail(403, 'Use the same studio origin.');
        }
        if (aiRoute) {
          const fetchSite = req.headers['sec-fetch-site'];
          if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')
            return fail(403, 'Use the same studio origin.');
          if (req.method !== 'POST') return fail(405, 'Use POST to draft a rule.');
          if (!aiEnabled) return fail(503, 'Live AI is not configured. Use the manual workshop.');
          if (
            req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json'
          )
            return fail(415, 'Send JSON with application/json.');
        }
        if (route === 'events' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(': connected\n\n');
          streams.add(res);
          const keepalive = setInterval(() => res.write(': heartbeat\n\n'), 20000);
          res.on('close', () => {
            streams.delete(res);
            clearInterval(keepalive);
          });
          return;
        }
        const bodyLimit = aiRoute ? 4096 : 32768;
        if (Number(req.headers['content-length']) > bodyLimit)
          return fail(413, 'Payload too large.');
        let size = 0;
        const parts = [];
        for await (const part of req) {
          size += part.length;
          if (size > bodyLimit) return fail(413, 'Payload too large.');
          parts.push(part);
        }
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(parts);
        if (aiRoute) {
          let input;
          try {
            input = JSON.parse(body.toString('utf8'));
          } catch {
            return fail(400, 'Invalid JSON.');
          }
          const disconnect = new AbortController();
          const onDisconnect = () => disconnect.abort();
          res.once('close', onDisconnect);
          try {
            const observation = inputObservation(input);
            const wait = reserveAiRequest();
            if (wait) {
              res.setHeader('Retry-After', String(wait));
              return fail(
                429,
                'The local studio AI request budget has been reached. Continue manually or try again later.',
              );
            }
            const draft = await draftObservation(
              { observation },
              { apiKey, model, fetchImpl, signal: disconnect.signal },
            );
            res.writeHead(200, { 'Content-Type': types['.json'] });
            return res.end(JSON.stringify(draft));
          } catch (error) {
            if (res.destroyed) return;
            const status = error.status;
            if ([400, 422, 429, 502, 503, 504].includes(status)) return fail(status, error.message);
            return fail(500, 'Could not prepare the AI draft. Use the manual workshop.');
          } finally {
            res.off('close', onDisconnect);
          }
        }
        const answer = await handleApi(
          new Request(url, { method: req.method, headers: req.headers, body }),
          route,
          repository,
        );
        res.writeHead(answer.status, Object.fromEntries(answer.headers));
        return res.end(await answer.text());
      }
      if (!['GET', 'HEAD'].includes(req.method)) return fail(405, 'Use GET for site assets.');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = resolve(publicRoot, '.' + relative);
      if (!target.startsWith(resolve(publicRoot) + sep)) return fail(404, 'Asset unavailable.');
      let data;
      try {
        data = await readFile(target);
      } catch {
        return fail(404, 'Asset unavailable.');
      }
      if (relative === '/index.html') {
        data = data
          .toString()
          .replace(
            /<html\b([^>]*)>/i,
            (_, attrs) =>
              '<html' + attrs.replace(/\sdata-runtime="[^"]*"/i, '') + ' data-runtime="server">',
          );
      }
      res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      if (!res.headersSent) fail(400, 'The request could not be processed.');
      else res.end();
    }
  });
  return {
    server,
    async close() {
      for (const stream of streams) stream.end();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const file = resolve(process.env.STUDIO_DB ?? 'data/studio.sqlite');
  await mkdir(dirname(file), { recursive: true });
  const studio = createStudio(file, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || undefined,
  });
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 4173);
  studio.server.listen(port, host, () =>
    console.log('Selvedge Studio listening on http://' + host + ':' + port),
  );
  process.on('SIGTERM', () => studio.close());
  process.on('SIGINT', () => studio.close());
}
