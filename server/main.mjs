import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleApi } from '../public/lib/api.mjs';
import { makeRecord, checkReplay } from '../public/lib/records.mjs';

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

export function createStudio(dbPath = ':memory:') {
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, scenario_id TEXT NOT NULL,
      note TEXT NOT NULL, rules_version TEXT NOT NULL, brief_json TEXT NOT NULL,
      result_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','review','blocked')));
    CREATE INDEX IF NOT EXISTS by_review_date ON reviews(created_at DESC, id DESC);`);
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
      if (url.pathname.startsWith('/api/v1/')) {
        const route = url.pathname.slice('/api/v1/'.length);
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
          return fail(403, 'Use the same studio origin.');
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
        let size = 0;
        const parts = [];
        for await (const part of req) {
          size += part.length;
          if (size > 32768) return fail(413, 'Payload too large.');
          parts.push(part);
        }
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(parts);
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
  const studio = createStudio(file);
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 4173);
  studio.server.listen(port, host, () =>
    console.log('Selvedge Studio listening on http://' + host + ':' + port),
  );
  process.on('SIGTERM', () => studio.close());
  process.on('SIGINT', () => studio.close());
}
