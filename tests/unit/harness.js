/**
 * harness.js
 *
 * Exposes the private helper functions from content.js for unit testing.
 *
 * Strategy
 * --------
 * content.js is a self-executing IIFE.  Its inner helpers are never exported.
 * To test them without modifying production code we:
 *
 *   1. Install a minimal `chrome` mock on globalThis so the IIFE doesn't crash.
 *   2. Temporarily patch the IIFE source to assign the helpers we need onto a
 *      well-known object (`globalThis.__hv_test__`) *before* the closing `})()`
 *      bracket, then eval() the patched source in the current jsdom context.
 *   3. Return those helpers to the caller.
 *
 * The patching is done at the text level — a single sentinel comment
 * `// __TEST_EXPORTS_ANCHOR__` is injected just before the closing IIFE paren
 * so we can splice in the export block reliably.
 */

const fs = require('fs');
const path = require('path');

const CONTENT_JS = path.resolve(__dirname, '../../hoverview/content.js');

/**
 * Build and install a minimal chrome mock.
 * Returns the mock object so callers can adjust it per-test.
 */
function buildChromeMock() {
  const listeners = [];
  const mock = {
    runtime: {
      id: 'test-extension-id',
    },
    storage: {
      sync: {
        _data: {
          enabled: true,
          showDelay: 320,
          videoDuration: 10,
          videoMuted: true,
          triggerKey: 'None',
          blockedDomains: '',
        },
        get(defaults, callback) {
          const result = Object.assign({}, defaults, mock.storage.sync._data);
          // Only keep keys that were requested (same semantics as real Chrome)
          const out = {};
          for (const k of Object.keys(defaults)) {
            out[k] = result[k] !== undefined ? result[k] : defaults[k];
          }
          if (callback) callback(out);
        },
        set(values, callback) {
          Object.assign(mock.storage.sync._data, values);
          if (callback) callback();
        },
      },
      onChanged: {
        addListener(fn) { listeners.push(fn); },
        removeListener(fn) {
          const idx = listeners.indexOf(fn);
          if (idx !== -1) listeners.splice(idx, 1);
        },
      },
    },
  };
  return mock;
}

/**
 * Load and execute the content script in the current jsdom context,
 * intercepting the private helpers onto globalThis.__hv_test__.
 *
 * @param {object} [overrides]  Optional config overrides applied to the chrome
 *                              storage mock before the script runs.
 * @returns {{ helpers, chromeMock }}
 */
function loadContentScript(overrides = {}) {
  // Reset DOM state between test calls
  document.documentElement.removeAttribute('data-hoverview-active');
  delete globalThis.__hoverview_cleanup__;
  delete globalThis.__hv_test__;

  const chromeMock = buildChromeMock();
  Object.assign(chromeMock.storage.sync._data, overrides);
  globalThis.chrome = chromeMock;

  // Read source
  let src = fs.readFileSync(CONTENT_JS, 'utf8');

  // Strip the outermost IIFE wrapper so we can inject export lines before `})()`
  // The file ends with: `\n})();\n`
  // We replace the closing `})();` with our exports + `})();`
  const exportBlock = `
  // ── test-only exports (stripped in production) ──
  globalThis.__hv_test__ = {
    getYouTubeVideoId,
    resolveMedia,
    computeMediaSize,
    isCurrentDomainBlocked,
    checkTriggerKey,
    positionOverlay,
    config,
  };
`;

  // Insert just before the final closing `})();`
  // The pattern is very specific to avoid false matches in the middle of the file.
  src = src.replace(/\}\)\(\);\s*$/, exportBlock + '})();');

  // eslint-disable-next-line no-eval
  eval(src);

  return {
    helpers: globalThis.__hv_test__,
    chromeMock,
  };
}

module.exports = { loadContentScript, buildChromeMock };
