/**
 * setup.js – Jest global setup file (runs before each test file).
 *
 * jsdom ≥ 20 ships structuredClone; older builds do not. Polyfill just in case.
 */
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
