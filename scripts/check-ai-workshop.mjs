// Run only against the loopback static server. Block service workers and all external
// traffic, including any configured live gateway. Every draft response below is a test fixture.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';

const check = expect.configure({ timeout: 15_000 });
const numbered = 'For a fraying edge, reserve 7% of the planned length for a trial cut.';
const unquantified = 'For a fraying edge, reserve extra material for a trial cut.';
const supportedDraft = {
  observation: numbered,
  scope: 'trial-reserve',
  suggestedPercent: 7,
  evidenceQuote: 'fraying edge, reserve 7% of the planned length for a trial cut',
  condition: 'The sample has a fraying edge.',
  action: 'Verify a trial cut.',
  questions: ['Who measures the trial?'],
  counterexample: 'A stable edge can keep the original plan.',
};
const unclearDraft = {
  ...supportedDraft,
  observation: unquantified,
  scope: 'needs-clarification',
  suggestedPercent: null,
  evidenceQuote: 'reserve extra material for a trial cut',
  questions: ['What percentage of the cut length should the reserve use?'],
};

export async function checkAiWorkshop(browser, base, { checkWidth, downloadedJson }) {
  const root = new URL(base);
  assert.equal(root.hostname, '127.0.0.1', 'AI UI fixtures may run only against the local server');
  const endpoint = new URL('__test__/ai-draft', root);
  const configUrl = new URL('ai-config.json', root);
  const examplesUrl = new URL('ai-examples.json', root);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
    serviceWorkers: 'block',
  });
  context.setDefaultTimeout(15_000);
  const outbound = [];
  const calls = [];
  let configured = false;
  let reply = { json: supportedDraft };
  try {
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== root.origin) {
        outbound.push(url.origin);
        return route.abort();
      }
      if (url.href === configUrl.href) {
        return route.fulfill({ json: { endpoint: configured ? endpoint.href : null } });
      }
      if (url.href === examplesUrl.href) return route.fulfill({ json: { examples: [] } });
      if (url.href === endpoint.href) {
        assert.equal(request.method(), 'POST');
        calls.push(request.postDataJSON());
        return route.fulfill(reply);
      }
      if (request.method() !== 'GET') {
        outbound.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(new URL('workshop.html', root).href);
    await check(page.locator('#ai-mode')).toContainText('unavailable on this deployment');
    await check(page.locator('#ai-generate')).toBeHidden();
    await check(page.locator('#ai-examples')).toBeHidden();
    await check(page.locator('#test-proposal')).toBeEnabled();

    configured = true;
    await page.reload();
    const observation = page.locator('#observation');
    const reserve = page.locator('#reserve-percent');
    const generate = page.locator('#ai-generate');
    const adopt = page.locator('#ai-adopt');
    const output = page.locator('#ai-output');
    const message = page.locator('#ai-message');
    await check(generate).toBeVisible();
    await observation.fill(numbered);
    await generate.click();
    await check(page.locator('#ai-provenance')).toContainText('Live OpenAI response');
    await check(output).toContainText(supportedDraft.evidenceQuote);
    await check(adopt).toHaveText('Use 7% in the draft');
    await check(reserve).toHaveValue('5');
    await check(page.locator('#download-proposal')).toBeDisabled();
    await adopt.click();
    await check(reserve).toHaveValue('7');
    await check(page.locator('#download-proposal')).toBeDisabled();
    await page.locator('#test-proposal').click();
    const exported = await downloadedJson(page, page.locator('#download-proposal'));
    assert.equal(exported.draftingAssistance.origin, 'live');
    assert.equal(exported.draftingAssistance.draft.observation, numbered);
    assert.equal(exported.appliedToWorkbench, false);

    await observation.fill('');
    await check(output).toBeHidden();
    await generate.click();
    await check(message).toContainText('12 and 500');
    assert.equal(calls.length, 1);
    reply = { json: unclearDraft };
    await observation.fill(unquantified);
    await generate.click();
    await check(page.locator('#ai-source')).toHaveText('Clarification needed');
    await check(output).toContainText(unclearDraft.questions[0]);
    await check(adopt).toBeHidden();
    await check(reserve).toHaveValue('7');

    reply = { status: 422, json: { error: 'declined' } };
    await generate.click();
    await check(message).toContainText('declined');
    await check(observation).toHaveValue(unquantified);
    await check(output).toBeHidden();

    reply = { json: supportedDraft }; // Same UI, different observation than the request.
    await generate.click();
    await check(message).toContainText('inconsistent draft');
    await check(output).toBeHidden();
    await reserve.fill('4');
    await page.locator('#test-proposal').click();
    const manual = await downloadedJson(page, page.locator('#download-proposal'));
    assert.equal(manual.reservePercent, 4);
    assert.equal(manual.observation, unquantified);
    assert.equal(manual.draftingAssistance, undefined);

    await page.setViewportSize({ width: 320, height: 740 });
    reply = { json: unclearDraft };
    await generate.click();
    await check(output).toBeVisible();
    await checkWidth(page, '320 px expanded AI draft');
    assert.deepEqual(
      calls,
      [numbered, unquantified, unquantified, unquantified, unquantified].map((observation) => ({
        observation,
      })),
    );
    assert.deepEqual(
      outbound,
      [],
      'The fixture flow attempted an external call or an unexpected write',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS AI workshop · synthetic HTTP fixtures · manual, explicit adoption, refusal, evidence and 320 px',
    );
  } finally {
    await context.close();
  }
}
