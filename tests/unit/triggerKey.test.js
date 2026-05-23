/**
 * triggerKey.test.js
 *
 * Tests for checkTriggerKey(e) — decides whether the current modifier-key
 * state satisfies the configured trigger requirement.
 *
 * Modes:
 *   'None'      → always true (instant hover)
 *   'Shift'     → true only when shiftKey is pressed
 *   'Ctrl'      → true only when ctrlKey is pressed
 *   'Alt'       → true only when altKey is pressed
 *   'ShiftMute' → true when shiftKey is NOT pressed (show unless Shift held)
 */

'use strict';

const { loadContentScript } = require('./harness');

let checkTriggerKey;
let config;

/** Build a minimal mouse-event-like object. */
function fakeEvent({ shiftKey = false, ctrlKey = false, altKey = false } = {}) {
  return { shiftKey, ctrlKey, altKey };
}

beforeAll(() => {
  ({ helpers: { checkTriggerKey, config } } = loadContentScript());
});

describe('checkTriggerKey – "None" mode (always show)', () => {
  beforeEach(() => { config.triggerKey = 'None'; });

  test('returns true with no keys held', () => {
    expect(checkTriggerKey(fakeEvent())).toBe(true);
  });

  test('returns true with Shift held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true }))).toBe(true);
  });

  test('returns true with Ctrl held', () => {
    expect(checkTriggerKey(fakeEvent({ ctrlKey: true }))).toBe(true);
  });

  test('returns true with all keys held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true, ctrlKey: true, altKey: true }))).toBe(true);
  });
});

describe('checkTriggerKey – "Shift" mode', () => {
  beforeEach(() => { config.triggerKey = 'Shift'; });

  test('returns true when Shift is held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true }))).toBe(true);
  });

  test('returns false when Shift is not held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: false }))).toBe(false);
  });

  test('returns false when only Ctrl is held', () => {
    expect(checkTriggerKey(fakeEvent({ ctrlKey: true }))).toBe(false);
  });

  test('returns false when only Alt is held', () => {
    expect(checkTriggerKey(fakeEvent({ altKey: true }))).toBe(false);
  });

  test('returns true when Shift+Ctrl are both held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true, ctrlKey: true }))).toBe(true);
  });
});

describe('checkTriggerKey – "Ctrl" mode', () => {
  beforeEach(() => { config.triggerKey = 'Ctrl'; });

  test('returns true when Ctrl is held', () => {
    expect(checkTriggerKey(fakeEvent({ ctrlKey: true }))).toBe(true);
  });

  test('returns false when Ctrl is not held', () => {
    expect(checkTriggerKey(fakeEvent())).toBe(false);
  });

  test('returns false when only Shift is held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true }))).toBe(false);
  });

  test('returns false when only Alt is held', () => {
    expect(checkTriggerKey(fakeEvent({ altKey: true }))).toBe(false);
  });
});

describe('checkTriggerKey – "Alt" mode', () => {
  beforeEach(() => { config.triggerKey = 'Alt'; });

  test('returns true when Alt is held', () => {
    expect(checkTriggerKey(fakeEvent({ altKey: true }))).toBe(true);
  });

  test('returns false when Alt is not held', () => {
    expect(checkTriggerKey(fakeEvent())).toBe(false);
  });

  test('returns false when only Shift is held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true }))).toBe(false);
  });

  test('returns false when only Ctrl is held', () => {
    expect(checkTriggerKey(fakeEvent({ ctrlKey: true }))).toBe(false);
  });
});

describe('checkTriggerKey – "ShiftMute" mode (show unless Shift held)', () => {
  beforeEach(() => { config.triggerKey = 'ShiftMute'; });

  test('returns true when Shift is NOT held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: false }))).toBe(true);
  });

  test('returns false when Shift IS held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true }))).toBe(false);
  });

  test('returns true when Ctrl is held but not Shift', () => {
    expect(checkTriggerKey(fakeEvent({ ctrlKey: true, shiftKey: false }))).toBe(true);
  });

  test('returns false when Shift+Ctrl are both held', () => {
    expect(checkTriggerKey(fakeEvent({ shiftKey: true, ctrlKey: true }))).toBe(false);
  });
});
