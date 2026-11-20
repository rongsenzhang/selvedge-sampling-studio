// Rebuild the optional recorded examples from genuine API responses.
// Node 24+: node --env-file=.env.local scripts/generate-ai-examples.mjs
import { writeFile, rename } from 'node:fs/promises';
import { draftObservation } from '../server/ai-draft.mjs';

const observations = [
  'When the cut edge frays, reserve 5% per colourway for the trial cut.',
  'If our swatches fray at the cut edge, set aside a little fabric for the trial cut.',
];
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('Configure OPENAI_API_KEY on the server before recording examples.');
const examples = [];
for (const observation of observations) {
  const draft = await draftObservation({ observation }, { apiKey: key, model });
  examples.push({ ...draft, model, generatedAt: new Date().toISOString() });
  console.log('Validated synthetic example:', draft.scope);
}
if (examples[0].suggestedPercent !== 5 || examples[1].suggestedPercent !== null) {
  throw new Error(
    'Review the generated examples before publication. Existing evidence was preserved.',
  );
}
const target = new URL('../public/ai-examples.json', import.meta.url);
const temp = new URL('../public/.ai-examples.tmp', import.meta.url);
await writeFile(temp, JSON.stringify({ examples }, null, 2) + '\n');
await rename(temp, target);
