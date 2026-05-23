/**
 * domainBlock.test.js
 *
 * Tests for isCurrentDomainBlocked() — the domain blocklist logic.
 *
 * We manipulate window.location.hostname (jsdom allows this) and mutate
 * config.blockedDomains directly to test each scenario without needing to go
 * through chrome.storage.
 */

'use strict';

const { loadContentScript } = require('./harness');

let isCurrentDomainBlocked;
let config;

// Helper: set the fake hostname and the blocklist, then re-test
function setup(hostname, blockedList) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { hostname },
  });
  // config is a direct reference to the live object inside the script
  config.blockedDomains = blockedList;
}

beforeAll(() => {
  ({ helpers: { isCurrentDomainBlocked, config } } = loadContentScript());
});

describe('isCurrentDomainBlocked', () => {
  // ── Exact match ───────────────────────────────────────────────────────────────
  test('blocks an exact match domain', () => {
    setup('reddit.com', ['reddit.com']);
    expect(isCurrentDomainBlocked()).toBe(true);
  });

  test('does not block an unrelated domain', () => {
    setup('example.com', ['reddit.com']);
    expect(isCurrentDomainBlocked()).toBe(false);
  });

  // ── Subdomain matching ────────────────────────────────────────────────────────
  test('blocks www.reddit.com when reddit.com is in the list', () => {
    setup('www.reddit.com', ['reddit.com']);
    expect(isCurrentDomainBlocked()).toBe(true);
  });

  test('blocks deep subdomain news.subdomain.example.com when example.com is blocked', () => {
    setup('news.subdomain.example.com', ['example.com']);
    expect(isCurrentDomainBlocked()).toBe(true);
  });

  test('does not confuse partialexample.com with example.com', () => {
    // "notexample.com" ends with "example.com" as a string but is not a subdomain
    setup('notexample.com', ['example.com']);
    // The domain check uses `host.endsWith('.' + domain)` so 'notexample.com'
    // ends with 'example.com' but NOT with '.example.com' → should NOT be blocked
    expect(isCurrentDomainBlocked()).toBe(false);
  });

  // ── Multiple domains in blocklist ─────────────────────────────────────────────
  test('blocks a domain that appears anywhere in the list', () => {
    setup('twitter.com', ['reddit.com', 'twitter.com', 'example.com']);
    expect(isCurrentDomainBlocked()).toBe(true);
  });

  test('passes when current domain matches none of the listed domains', () => {
    setup('google.com', ['reddit.com', 'twitter.com']);
    expect(isCurrentDomainBlocked()).toBe(false);
  });

  // ── Empty and blank lists ─────────────────────────────────────────────────────
  test('returns false for an empty blocklist array', () => {
    setup('reddit.com', []);
    expect(isCurrentDomainBlocked()).toBe(false);
  });

  // ── Case insensitivity ────────────────────────────────────────────────────────
  test('blocklist matching is case-insensitive (domain normalised to lowercase)', () => {
    // loadSettings normalises domains to lowercase; config.blockedDomains holds
    // already-normalised values.  Hostname is lowercased inside the function.
    setup('Reddit.Com', ['reddit.com']);
    expect(isCurrentDomainBlocked()).toBe(true);
  });

  // ── Empty hostname ────────────────────────────────────────────────────────────
  test('returns false when hostname is an empty string', () => {
    setup('', ['reddit.com']);
    expect(isCurrentDomainBlocked()).toBe(false);
  });
});
