/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['**/tests/unit/**/*.test.js'],
  // jsdom doesn't ship structuredClone on older versions; polyfill it
  setupFiles: ['./tests/unit/setup.js'],
};
