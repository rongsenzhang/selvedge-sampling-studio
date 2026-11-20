import { evaluate, rulesVersion, scenarios } from './engine.mjs';

export const ownerRoles = [
  'Production supervisor',
  'Sampling technologist',
  'Commercial estimator',
];
export const reviewActions = {
  'trial-cut': 'Request a measured trial cut',
  'stock-check': 'Ask production to confirm the reserve',
};
export const defaultDraft = {
  observation:
    'When we cut a book of loose-weave samples, allow a little more roll for the trial edge before promising the run.',
  reservePercent: 5,
  ownerRole: 'Production supervisor',
  reviewAction: 'trial-cut',
};

const base = scenarios[0].brief;
const acceptanceCases = [
  {
    id: 'stable',
    label: 'Stable cloth',
    expectation: 'Stable cloth keeps its original demand and decision.',
    brief: { ...base, stockMetres: 30 },
  },
  {
    id: 'boundary',
    label: 'Fraying edge, tight stock',
    expectation: 'Flag the trial reserve for review when a fraying run has only 1.20 m to spare.',
    brief: { ...base, edge: 'frays', stockMetres: 30 },
  },
  {
    id: 'short',
    label: 'Stock already short',
    expectation: 'Preserve the existing stock block, regardless of the proposed allowance.',
    brief: { ...base, edge: 'frays', stockMetres: 26 },
  },
];

function normalise(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('Enter a rule observation.');
  const { observation, reservePercent, ownerRole, reviewAction } = draft;
  if (typeof observation !== 'string' || !observation.trim() || observation.length > 500) {
    throw new Error('Enter an observation of up to 500 characters.');
  }
  if (!Number.isInteger(reservePercent) || reservePercent < 0 || reservePercent > 20) {
    throw new Error('Enter a whole percentage between 0 and 20.');
  }
  if (!ownerRoles.includes(ownerRole)) throw new Error('Select a review owner.');
  if (!Object.hasOwn(reviewActions, reviewAction)) throw new Error('Select a follow-up action.');
  return { observation: observation.trim(), reservePercent, ownerRole, reviewAction };
}

// The proposed allowance changes a trial stock check only. The base decision is immutable.
export function testDraftOnBrief(draftInput, brief) {
  const draft = normalise(draftInput);
  const baseResult = evaluate(brief);
  const before = { status: baseResult.status, metres: baseResult.metres };
  const after = { ...before, reserveMetres: null, reserveNeedsReview: false };
  if (before.metres !== null) {
    const selected = baseResult.layout.alternatives.find(
      (plan) => plan.orientation === baseResult.layout.orientation,
    );
    const perColourMm = Math.round(selected.perColourMetres * 1000);
    const extraMm =
      brief.edge === 'frays' ? Math.ceil((perColourMm * draft.reservePercent) / 100) : 0;
    after.reserveMetres = (extraMm * brief.colourways) / 1000;
    after.metres = ((perColourMm + extraMm) * brief.colourways) / 1000;
    after.reserveNeedsReview = after.reserveMetres > 0 && after.metres > brief.stockMetres;
    if (after.reserveNeedsReview && before.status === 'ready') after.status = 'review';
  }
  const afterAction =
    before.status === 'blocked'
      ? 'Resolve the underlying production block.'
      : after.reserveNeedsReview
        ? reviewActions[draft.reviewAction]
        : 'Keep the existing production checks.';
  return { before, after: { ...after, action: afterAction } };
}

export function createProposal(draftInput) {
  const draft = normalise(draftInput);
  const cases = acceptanceCases.map((item) => {
    const { before, after } = testDraftOnBrief(draft, item.brief);
    let passed;
    if (item.id === 'stable') {
      passed =
        after.status === before.status &&
        after.metres === before.metres &&
        !after.reserveNeedsReview;
    } else if (item.id === 'boundary') {
      passed =
        before.metres <= item.brief.stockMetres &&
        after.reserveNeedsReview &&
        after.status === 'review';
    } else {
      passed = before.status === 'blocked' && after.status === 'blocked';
    }
    return { ...item, brief: { ...item.brief }, before, after, passed };
  });
  const passedCount = cases.filter((item) => item.passed).length;
  return {
    schemaVersion: 1,
    type: 'sampling-rule-proposal',
    source: 'workshop exercise',
    baseRulesVersion: rulesVersion,
    proposalVersion: 'edge-trial-reserve/1',
    status: passedCount === cases.length ? 'awaiting-production-review' : 'revision-required',
    appliedToWorkbench: false,
    ...draft,
    proposedRule:
      'For a fraying edge, reserve ' +
      draft.reservePercent +
      '% of the planned length per colourway for a trial cut. When stock cannot cover this reserve, ' +
      reviewActions[draft.reviewAction].toLowerCase() +
      '. Keep existing production blocks.',
    measurement: 'Round additional length upwards to whole millimetres per colourway.',
    nextStep:
      'Ask the nominated owner to measure a physical trial and review the rule before any adoption.',
    passedCount,
    cases,
  };
}
