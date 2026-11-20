import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const manifestPath = join(root, '.openai', 'hosting.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.project_id || manifest.d1 !== 'DB' || manifest.static != null) {
  throw new Error('The gateway needs a server-backed Sites manifest with the DB binding.');
}

const result = await build({
  absWorkingDir: root,
  entryPoints: ['gateway/worker.mjs'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  sourcemap: false,
  write: false,
  metafile: true,
});
const [entry] = Object.values(result.metafile.outputs);
if (result.outputFiles.length !== 1 || entry.imports.length || !entry.exports.includes('default')) {
  throw new Error('Sites needs one self-contained Worker with a default export.');
}

const journalPath = 'meta/_journal.json';
const journal = JSON.parse(await readFile(join(root, 'drizzle', journalPath), 'utf8'));
const migrations = [journalPath];
for (const item of journal.entries) {
  const prefix = String(item.idx).padStart(4, '0');
  if (!/^\d{4}_[a-z0-9_]+$/.test(item.tag) || !item.tag.startsWith(prefix + '_')) {
    throw new Error('Invalid migration tag in the SQLite journal.');
  }
  migrations.push(item.tag + '.sql', 'meta/' + prefix + '_snapshot.json');
}
if (!journal.entries.length) throw new Error('The quota database needs an initial migration.');

await rm(dist, { recursive: true, force: true });
const meta = join(dist, '.openai');
await mkdir(join(meta, 'drizzle', 'meta'), { recursive: true });
await mkdir(join(dist, 'server'), { recursive: true });
await writeFile(join(dist, 'server', 'index.js'), result.outputFiles[0].contents);
await copyFile(manifestPath, join(meta, 'hosting.json'));
for (const name of migrations) {
  await copyFile(join(root, 'drizzle', name), join(meta, 'drizzle', name));
}
console.log(
  'Built a standalone Worker and packaged ' + journal.entries.length + ' SQLite migration(s).',
);
