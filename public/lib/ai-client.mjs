const publicRoot = new URL('../', import.meta.url);
const scopes = ['trial-reserve', 'out-of-scope', 'needs-clarification'];

function invalidDraft() {
  return new Error(
    'The assistant returned an incomplete or inconsistent draft. Try again or continue manually.',
  );
}

export function validateDraft(value, observation) {
  if (
    !value ||
    typeof observation !== 'string' ||
    observation.trim().length < 12 ||
    observation.length > 500 ||
    value.observation !== observation ||
    !scopes.includes(value.scope)
  ) {
    throw invalidDraft();
  }
  const { suggestedPercent } = value;
  if (value.scope === 'trial-reserve' && suggestedPercent === null) throw invalidDraft();
  if (
    suggestedPercent !== null &&
    (value.scope !== 'trial-reserve' ||
      !Number.isInteger(suggestedPercent) ||
      suggestedPercent < 0 ||
      suggestedPercent > 20)
  ) {
    throw invalidDraft();
  }
  for (const key of ['condition', 'action', 'counterexample', 'evidenceQuote']) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 2000)
      throw invalidDraft();
  }
  if (value.evidenceQuote && !observation.includes(value.evidenceQuote)) throw invalidDraft();
  if (
    !Array.isArray(value.questions) ||
    value.questions.length < 1 ||
    value.questions.length > 12 ||
    value.questions.some(
      (question) => typeof question !== 'string' || !question.trim() || question.length > 1000,
    )
  ) {
    throw invalidDraft();
  }
  return {
    observation,
    scope: value.scope,
    suggestedPercent,
    condition: value.condition,
    action: value.action,
    questions: [...value.questions],
    counterexample: value.counterexample,
    evidenceQuote: value.evidenceQuote,
  };
}

async function publicFile(name) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(new URL(name, publicRoot), {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('The deployment settings could not be loaded.');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function readEndpoint(config) {
  if (!config?.endpoint || typeof config.endpoint !== 'string') return null;
  const endpoint = new URL(config.endpoint, publicRoot);
  if (endpoint.username || endpoint.password || endpoint.hash) return null;
  if (
    endpoint.protocol !== 'https:' &&
    !(endpoint.protocol === 'http:' && endpoint.origin === publicRoot.origin)
  )
    return null;
  return endpoint;
}

export async function getAiWorkspace() {
  const [endpoint, examples] = await Promise.all([
    publicFile('ai-config.json')
      .then(readEndpoint)
      .catch(() => null),
    publicFile('ai-examples.json')
      .then((data) => {
        if (!Array.isArray(data?.examples)) return [];
        return data.examples.flatMap((item) => {
          if (
            typeof item?.model !== 'string' ||
            !item.model.trim() ||
            !Number.isFinite(Date.parse(item.generatedAt))
          )
            return [];
          try {
            const draft = validateDraft(item, item.observation);
            return [{ draft, model: item.model, generatedAt: item.generatedAt }];
          } catch {
            return [];
          }
        });
      })
      .catch(() => []),
  ]);
  return { endpoint, examples };
}

export async function requestAiDraft(endpoint, observation, signal) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ observation }),
    signal,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('The AI service did not return a readable response.');
  }
  if (!response.ok) {
    if (response.status === 400)
      throw new Error(
        'Use a fictional note of 12–500 characters without contact details or credentials.',
      );
    if (response.status === 422)
      throw new Error(
        'A draft was declined. Reword your synthetic observation or continue manually.',
      );
    if (response.status === 504)
      throw new Error('The AI request timed out. Try again or continue manually.');
    if (response.status === 429)
      throw new Error(
        'The live assistant has reached its request limit. Try later or continue manually.',
      );
    if (response.status === 503)
      throw new Error('Live drafting is temporarily unavailable on this deployment.');
    throw new Error('The AI service could not complete the request.');
  }
  return validateDraft(body, observation);
}
