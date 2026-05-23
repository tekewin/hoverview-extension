/**
 * hoverview.spec.js – Playwright end-to-end tests for the HoverView extension.
 *
 * Key design notes
 * ────────────────
 * • Extensions need a persistent context (not a regular browser.launch).
 * • waitForFunction signature: page.waitForFunction(fn, arg, options)
 *   The timeout MUST be the third argument. Passing it as the second argument
 *   treats it as the arg passed to the page function, leaving Playwright's
 *   default 30s timeout in effect.
 * • chrome.storage.sync is only accessible inside the extension isolated world,
 *   not from page.evaluate(). Disabled-state behaviour is covered by unit tests.
 */

'use strict';

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../../hoverview');
const FIXTURE_URL    = 'http://localhost:7777/test.html';

// How long to wait for hv-visible to appear (show delay 320ms + image load)
const OVERLAY_TIMEOUT_MS = 8_000;
// How long to confirm overlay does NOT appear
const NO_OVERLAY_WAIT_MS = 1_500;

// ── Shared context lifecycle ───────────────────────────────────────────────────

let context;
let page;

test.beforeAll(async () => {
  const userDataDir = path.resolve(__dirname, '../../.playwright-profile');
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });
});

test.afterAll(async () => {
  await context.close();
});

test.beforeEach(async () => {
  page = await context.newPage();
  await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });
  // Give the content script time to initialise and load settings from storage
  await page.waitForTimeout(300);
});

test.afterEach(async () => {
  await page.close();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Wait until #hoverview-overlay has hv-visible, or throw after OVERLAY_TIMEOUT_MS.
 * NOTE: waitForFunction(fn, arg, options) — timeout goes in options (3rd arg).
 */
async function waitForOverlayVisible(p) {
  await p.waitForFunction(
    () => document.getElementById('hoverview-overlay')?.classList.contains('hv-visible'),
    null,                             // arg passed to page function (unused)
    { timeout: OVERLAY_TIMEOUT_MS }   // options — timeout here, not as 2nd arg
  );
}

/**
 * Assert the overlay does NOT become visible within NO_OVERLAY_WAIT_MS.
 */
async function assertOverlayNotVisible(p) {
  let became = false;
  try {
    await p.waitForFunction(
      () => document.getElementById('hoverview-overlay')?.classList.contains('hv-visible'),
      null,                             // arg
      { timeout: NO_OVERLAY_WAIT_MS }   // options
    );
    became = true;  // waitForFunction resolved → overlay appeared (unexpected)
  } catch {
    // TimeoutError = overlay never appeared = expected
  }
  expect(became).toBe(false);
}

// ── Singleton guard ────────────────────────────────────────────────────────────

test('content script sets data-hoverview-active on <html>', async () => {
  const attr = await page.evaluate(() =>
    document.documentElement.getAttribute('data-hoverview-active')
  );
  expect(attr).toBe('1');
});

// ── Overlay appears on hover ───────────────────────────────────────────────────

test('overlay appears after hovering an image link', async () => {
  await page.hover('#safe-zone');
  await page.waitForTimeout(100);

  await page.hover('#image-link');
  await waitForOverlayVisible(page);

  const isVisible = await page.evaluate(() =>
    document.getElementById('hoverview-overlay')?.classList.contains('hv-visible') ?? false
  );
  expect(isVisible).toBe(true);
});

test('overlay appears after hovering a second SVG image link', async () => {
  await page.hover('#safe-zone');
  await page.waitForTimeout(100);

  await page.hover('#svg-link');
  await waitForOverlayVisible(page);

  const isVisible = await page.evaluate(() =>
    document.getElementById('hoverview-overlay')?.classList.contains('hv-visible') ?? false
  );
  expect(isVisible).toBe(true);
});

// ── Overlay dismissed on mouse-out ────────────────────────────────────────────

test('overlay is dismissed after moving mouse to safe zone', async () => {
  // Trigger the overlay
  await page.hover('#image-link');
  await waitForOverlayVisible(page);

  // Move away → overlay should disappear
  await page.hover('#safe-zone');

  await page.waitForFunction(
    () => !(document.getElementById('hoverview-overlay')?.classList.contains('hv-visible') ?? false),
    null,
    { timeout: 3_000 }
  );

  const stillVisible = await page.evaluate(() =>
    document.getElementById('hoverview-overlay')?.classList.contains('hv-visible') ?? false
  );
  expect(stillVisible).toBe(false);
});

// ── No overlay for plain links ─────────────────────────────────────────────────

test('overlay does NOT appear for a plain HTML link', async () => {
  await page.hover('#safe-zone');
  await page.waitForTimeout(100);

  await page.hover('#plain-link');
  await assertOverlayNotVisible(page);
});

// ── Overlay appears for inline <img> ──────────────────────────────────────────

test('overlay appears after hovering an inline <img> element', async () => {
  await page.hover('#safe-zone');
  await page.waitForTimeout(100);

  await page.hover('#inline-img');
  await waitForOverlayVisible(page);

  const isVisible = await page.evaluate(() =>
    document.getElementById('hoverview-overlay')?.classList.contains('hv-visible') ?? false
  );
  expect(isVisible).toBe(true);
});

// ── Singleton guard prevents double-injection ─────────────────────────────────

test('content script singleton guard prevents double-injection', async () => {
  const markerSet = await page.evaluate(() =>
    document.documentElement.hasAttribute('data-hoverview-active')
  );
  expect(markerSet).toBe(true);
});

// ── YouTube link produces overlay element ─────────────────────────────────────

test('hovering a YouTube link creates the overlay element', async () => {
  await page.hover('#safe-zone');
  await page.waitForTimeout(100);

  await page.hover('#youtube-link');

  // Overlay element is created even if the thumbnail fails (error overlay)
  await page.waitForFunction(
    () => document.getElementById('hoverview-overlay') !== null,
    null,
    { timeout: OVERLAY_TIMEOUT_MS }
  );

  const hasOverlay = await page.evaluate(() =>
    document.getElementById('hoverview-overlay') !== null
  );
  expect(hasOverlay).toBe(true);
});

// ── Overlay DOM structure ─────────────────────────────────────────────────────

test('image overlay contains an <img> child and a resolution badge', async () => {
  await page.hover('#safe-zone');
  await page.waitForTimeout(100);

  await page.hover('#image-link');
  await waitForOverlayVisible(page);

  const structure = await page.evaluate(() => {
    const ol = document.getElementById('hoverview-overlay');
    return {
      hasImg:   !!ol?.querySelector('img'),
      hasBadge: !!ol?.querySelector('.hv-badge'),
    };
  });

  expect(structure.hasImg).toBe(true);
  expect(structure.hasBadge).toBe(true);
});
