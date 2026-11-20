// Install this schema as a D1 migration before publishing the Worker.
export const quotaSchema = `CREATE TABLE ai_quota (
  utc_day TEXT NOT NULL,
  client_tag TEXT NOT NULL,
  admitted INTEGER NOT NULL CHECK (admitted > 0),
  PRIMARY KEY (utc_day, client_tag)
);`;

const dailyLimit = 100;
const clientLimit = 10;
const admission = `INSERT INTO ai_quota (utc_day, client_tag, admitted)
  SELECT ?1, ?2, 1
  WHERE COALESCE((SELECT SUM(admitted) FROM ai_quota WHERE utc_day = ?1), 0) < ?3
    AND COALESCE((SELECT admitted FROM ai_quota WHERE utc_day = ?1 AND client_tag = ?2), 0) < ?4
  ON CONFLICT (utc_day, client_tag) DO UPDATE SET admitted = ai_quota.admitted + 1`;

async function clientTag(secret, day, address) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode('selvedge-ai-quota/v1\n' + day + '\n' + address),
  );
  return Array.from(new Uint8Array(digest, 0, 16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function reserveAttempt(db, secret, address, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const tag = await clientTag(secret, day, address);
  // Each row holds one daily pseudonym. Both ceilings are checked inside the
  // INSERT statement, so a rejected request advances neither counter.
  const results = await db.batch([
    db.prepare('DELETE FROM ai_quota WHERE utc_day < ?1').bind(day),
    db.prepare(admission).bind(day, tag, dailyLimit, clientLimit),
  ]);
  const result = results[1];
  if (!results.every((part) => part.success) || ![0, 1].includes(result?.meta?.changes)) {
    throw new Error('Quota storage unavailable.');
  }
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return {
    allowed: result.meta.changes === 1,
    retryAfter: Math.max(1, Math.ceil((midnight - now.getTime()) / 1000)),
  };
}
