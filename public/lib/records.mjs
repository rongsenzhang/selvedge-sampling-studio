import { evaluate, scenarios } from './engine.mjs';

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function readBrief(brief) {
  try {
    return evaluate(brief);
  } catch (error) {
    throw new RequestError(error.message, 422);
  }
}

export function makeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError('Supply a review object.');
  }
  const { brief, note = '', scenarioId, requestId } = input;
  if (typeof note !== 'string' || note.length > 500) {
    throw new RequestError('Use a note of at most 500 characters.', 422);
  }
  if (!scenarios.some((scenario) => scenario.id === scenarioId) && scenarioId !== 'custom') {
    throw new RequestError('Choose a known starting scenario or custom.', 422);
  }
  if (
    requestId !== undefined &&
    !/^[a-zA-Z0-9_-]{8,100}$/.test(typeof requestId === 'string' ? requestId : '')
  ) {
    throw new RequestError('Invalid request ID.', 422);
  }
  const result = readBrief(brief);
  const canonicalBrief = Object.fromEntries(
    Object.keys(scenarios[0].brief).map((key) => [key, brief[key]]),
  );
  return {
    id: requestId ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    scenarioId,
    note: note.trim(),
    brief: canonicalBrief,
    result,
  };
}

export function checkReplay(existing, proposed) {
  if (
    existing.note !== proposed.note ||
    existing.scenarioId !== proposed.scenarioId ||
    JSON.stringify(existing.brief) !== JSON.stringify(proposed.brief)
  ) {
    throw new RequestError('This request ID belongs to a different review.', 409);
  }
  return existing;
}
