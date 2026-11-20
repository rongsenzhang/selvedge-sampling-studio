import assert from 'node:assert/strict';
import test from 'node:test';
import { createProposal, defaultDraft, testDraftOnBrief } from '../public/lib/proposal.mjs';
import { scenarios, rulesVersion } from '../public/lib/engine.mjs';

test('a 5% proposal meets three independent acceptance examples and remains a draft', () => {
  const proposal = createProposal(defaultDraft);
  assert.equal(proposal.source, 'workshop exercise');
  assert.equal(proposal.baseRulesVersion, rulesVersion);
  assert.equal(proposal.appliedToWorkbench, false);
  assert.equal(proposal.status, 'awaiting-production-review');
  assert.equal(proposal.passedCount, 3);
  assert.deepEqual(
    proposal.cases.map((item) => [item.before.metres, item.after.metres]),
    [
      [28.8, 28.8],
      [28.8, 30.24],
      [28.8, 30.24],
    ],
  );
  assert.deepEqual(
    proposal.cases.map((item) => item.after.status),
    ['ready', 'review', 'blocked'],
  );
});

test('the boundary acceptance case can fail and the export records why', () => {
  for (const rate of [0, 4, 5, 20]) {
    const result = createProposal({ ...defaultDraft, reservePercent: rate });
    assert.equal(result.cases[1].passed, rate >= 5);
    assert.equal(result.passedCount, rate >= 5 ? 3 : 2);
    assert.equal(result.status, rate >= 5 ? 'awaiting-production-review' : 'revision-required');
  }
});

test('a blocked or impossible route never becomes releasable', () => {
  const blocked = { ...scenarios[0].brief, edge: 'frays', stockMetres: 0 };
  assert.equal(testDraftOnBrief(defaultDraft, blocked).after.status, 'blocked');
  const impossible = testDraftOnBrief(defaultDraft, { ...blocked, rollWidthMm: 100 });
  assert.equal(impossible.after.metres, null);
  assert.equal(impossible.after.status, 'blocked');
});

test('trial reserve rounds upwards in millimetres by colour without overcounting exact boundaries', () => {
  const brief = {
    ...scenarios[0].brief,
    swatchWidthMm: 101,
    swatchHeightMm: 103,
    colourways: 3,
    quantity: 1,
    edge: 'frays',
    grain: 'locked',
  };
  const result = testDraftOnBrief(
    { ...defaultDraft, reservePercent: 1 },
    { ...brief, stockMetres: 0.315 },
  );
  assert.equal(result.before.metres, 0.309);
  assert.equal(result.after.metres, 0.315);
  assert.equal(result.after.reserveMetres, 0.006);
  assert.equal(result.after.reserveNeedsReview, false);
});

test('the selected action and attributed observation survive a JSON round trip', () => {
  const result = createProposal({
    ...defaultDraft,
    observation: '  Measure the sample first.  ',
    ownerRole: 'Sampling technologist',
    reviewAction: 'stock-check',
  });
  const saved = JSON.parse(JSON.stringify(result));
  assert.equal(saved.observation, 'Measure the sample first.');
  assert.equal(saved.ownerRole, 'Sampling technologist');
  assert.equal(saved.cases[1].after.action, 'Ask production to confirm the reserve');
  assert.match(saved.proposedRule, /confirm the reserve/);
});

test('validation rejects invalid drafts, including inherited action keys', () => {
  for (const observation of [' ', null, 'x'.repeat(501)])
    assert.throws(() => createProposal({ ...defaultDraft, observation }));
  for (const reservePercent of [-1, 21, 2.5, '5', NaN, Infinity])
    assert.throws(() => createProposal({ ...defaultDraft, reservePercent }));
  assert.throws(() => createProposal({ ...defaultDraft, ownerRole: 'Unknown' }));
  assert.throws(() => createProposal({ ...defaultDraft, reviewAction: 'constructor' }));
});
