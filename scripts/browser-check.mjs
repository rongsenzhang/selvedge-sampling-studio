import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { checkAiWorkshop } from './check-ai-workshop.mjs';

const timeout = 15_000;
const check = expect.configure({ timeout });
const browserErrors = [];
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const projectPath = '/selvedge-sampling-studio/';
const fileTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function pagesServer() {
  return createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!path.startsWith(projectPath)) {
      res.writeHead(404).end();
      return;
    }
    const asset = path.slice(projectPath.length) || 'index.html';
    const target = resolve(publicRoot, asset);
    if (!target.startsWith(resolve(publicRoot) + sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(target);
      res
        .writeHead(200, {
          'Content-Type': fileTypes[extname(target)] ?? 'application/octet-stream',
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

async function listen(server) {
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return 'http://127.0.0.1:' + server.address().port;
}

async function openContext(browser, mobile) {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: true,
  });
  context.setDefaultTimeout(timeout);
  context.setDefaultNavigationTimeout(timeout);
  context.on('page', (page) => {
    page.on('pageerror', (error) => browserErrors.push(page.url() + ' · ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(page.url() + ' · ' + message.text());
    });
  });
  return context;
}

async function openPlanner(context, base) {
  const page = await context.newPage();
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.ok(response?.ok(), 'Planner HTTP status: ' + response?.status());
  await check(page.locator('#plan-status')).toHaveText('Ready for review');
  await check(page.locator('#required')).toHaveText(/28\.8\s*m/);
  return page;
}

async function checkWidth(page, label) {
  const sizes = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    window: window.innerWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1, label + ' overflows: ' + JSON.stringify(sizes));
  // On a mobile browser a missing viewport declaration can make both DOM measures ~980 px.
  assert.ok(
    sizes.viewport <= page.viewportSize().width + 1,
    label + ' ignores the emulated viewport',
  );
}

async function downloadedJson(page, button) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    button.click(),
  ]);
  assert.match(download.suggestedFilename(), /\.json$/);
  const path = await download.path();
  assert.ok(path, 'Browser did not finish downloading ' + download.suggestedFilename());
  return JSON.parse(await readFile(path, 'utf8'));
}

async function workshop(page) {
  const link = page.locator('a[href="./workshop.html"]:visible').first();
  await check(link).toBeVisible();
  await link.click();
  await check(page.locator('#result-summary')).toContainText('3 of 3 checks passed');
  await checkWidth(page, 'Rule workshop');
  const threshold = page.locator('#reserve-percent');
  await threshold.fill('0');
  await page.locator('#test-proposal').click();
  await check(page.locator('#result-summary')).toContainText('2 of 3 checks passed');
  await check(page.locator('#case-boundary')).toHaveAttribute('data-passed', 'false');
  await check(page.locator('#case-short')).toHaveAttribute('data-passed', 'true');
  const rejected = await downloadedJson(page, page.locator('#download-proposal'));
  assert.equal(rejected.status, 'revision-required');
  assert.equal(rejected.appliedToWorkbench, false);
  await threshold.fill('5');
  await page.locator('#test-proposal').click();
  await check(page.locator('#case-boundary')).toHaveAttribute('data-passed', 'true');
  const proposal = await downloadedJson(page, page.locator('#download-proposal'));
  assert.equal(proposal.source, 'workshop exercise');
  assert.equal(proposal.status, 'awaiting-production-review');
  assert.equal(proposal.appliedToWorkbench, false);
  assert.equal(proposal.baseRulesVersion, '1.0.0');
}

async function verifyFlow(browser, target, serverMode, mobile) {
  const context = await openContext(browser, mobile);
  const isolated = await openContext(browser, false);
  const label =
    (serverMode ? 'HTTP/SQLite' : 'GitHub Pages layout') + ' · ' + (mobile ? 'mobile' : 'desktop');
  try {
    const page = await openPlanner(context, target);
    await check(page.locator('#storage-info')).toContainText(
      serverMode ? 'shared review log' : 'this browser',
    );
    await checkWidth(page, label);
    const observer = await openPlanner(serverMode ? isolated : context, target);
    await check(observer.locator('#record-count')).toHaveText('0');
    // Pages stays local to the profile. Separate profiles should share only in server mode.
    const separatePage = serverMode ? undefined : await openPlanner(isolated, target);
    if (!serverMode) {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
        timeout,
      });
      const health = await page.evaluate(async (limit) => {
        const response = await fetch('./api/v1/health', { signal: AbortSignal.timeout(limit) });
        return response.json();
      }, timeout);
      assert.equal(
        health.storage,
        'browser-indexeddb',
        'Pages service worker must serve the project-scoped API',
      );
    }
    await page.locator('#scenario').selectOption('short-roll');
    await check(page.locator('#plan-status')).toHaveText('On hold');
    await check(page.locator('#rule-checks')).toContainText('12.2 m');
    await page.locator('input[name="stockMetres"]').fill('49.2');
    await check(page.locator('#plan-status')).toHaveText('Ready for review');
    await page.locator('select[name="edge"]').selectOption('frays');
    await check(page.locator('#plan-status')).toHaveText('Review needed');
    await check(page.locator('#rule-checks')).toContainText('physical trial');
    await check(page.locator('#required')).toHaveText(/49\.2\s*m/);
    const note = 'Check the edge finish on a trial swatch.';
    await page.getByLabel('Reviewer note').fill(note);
    await page.locator('#save').click();
    await check(page.locator('#save-message')).toContainText('Review saved');
    await check(observer.locator('#record-count')).toHaveText('1');
    const exported = await downloadedJson(page, page.locator('#last-export'));
    assert.equal(exported.schema, 'selvedge.review.v1');
    const { record } = exported;
    assert.equal(record.note, note);
    assert.equal(record.brief.stockMetres, 49.2);
    assert.equal(record.brief.edge, 'frays');
    assert.equal(record.result.status, 'review');
    assert.equal(record.result.metres, 49.2);
    assert.equal(record.result.rulesVersion, '1.0.0');
    assert.equal(record.result.estimatePence, 109900);
    assert.ok(record.id && record.createdAt);
    if (separatePage) {
      await separatePage.reload({ waitUntil: 'domcontentloaded' });
      await separatePage.locator('#open-log').click();
      await check(separatePage.locator('#log-entries')).toContainText('No saved reviews');
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await check(page.locator('#record-count')).toHaveText('1');
    await page.locator('#open-log').click();
    await check(page.getByRole('dialog')).toBeVisible();
    await check(page.locator('#log-entries')).toContainText(note);
    assert.deepEqual(
      await downloadedJson(page, page.getByRole('button', { name: 'Download JSON' })),
      exported,
    );
    await page.locator('#close-log').click();
    await check(page.getByRole('dialog')).not.toBeVisible();
    if (!serverMode) await workshop(page);
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 740 });
      await checkWidth(page, '320 px rule workshop');
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await check(page.locator('#plan-status')).toHaveText('Ready for review');
      await checkWidth(page, '320 px planner');
    }
    assert.deepEqual(browserErrors, [], 'Browser console or uncaught page errors');
    console.log('PASS ' + label);
  } catch (cause) {
    throw new Error(label + ': ' + cause.message, { cause });
  } finally {
    await Promise.all([context.close(), isolated.close()]);
  }
}

async function run() {
  const launchOptions = process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {};
  const browser = await chromium.launch({ ...launchOptions, timeout });
  let staticServer, studio;
  try {
    let target = process.env.STUDIO_URL;
    if (!target) {
      staticServer = pagesServer();
      target = (await listen(staticServer)) + projectPath;
    }
    await verifyFlow(browser, target, false, false);
    if (!process.env.STUDIO_URL) {
      await checkAiWorkshop(browser, target, { checkWidth, downloadedJson });
      const { createStudio } = await import('../server/main.mjs');
      studio = createStudio(':memory:');
      await verifyFlow(browser, (await listen(studio.server)) + '/', true, false);
    }
    await verifyFlow(browser, target, false, true);
  } finally {
    await browser.close();
    if (studio) await studio.close();
    if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  }
}

try {
  await run();
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}
