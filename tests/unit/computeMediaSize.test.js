/**
 * computeMediaSize.test.js
 *
 * Tests for computeMediaSize(naturalW, naturalH) which scales media down to
 * fit within the viewport while enforcing a minimum dimension.
 *
 * Constants mirrored from content.js:
 *   MAX_W_FRAC     = 0.82
 *   MAX_H_FRAC     = 0.82
 *   OVERLAY_PADDING = 12
 *   MIN_DIMENSION   = 50
 */

'use strict';

const { loadContentScript } = require('./harness');

let computeMediaSize;

// jsdom defaults: innerWidth=1024, innerHeight=768
// availW = floor(1024 * 0.82) - 12 = 839 - 12 = 827
// availH = floor(768  * 0.82) - 12 = 629 - 12 = 617

const VP_W = 1024;
const VP_H = 768;
const MAX_W_FRAC = 0.82;
const MAX_H_FRAC = 0.82;
const PADDING = 12;
const MIN_DIM = 50;

function availW() { return Math.floor(VP_W * MAX_W_FRAC) - PADDING; }
function availH() { return Math.floor(VP_H * MAX_H_FRAC) - PADDING; }

beforeAll(() => {
  // jsdom sets window.innerWidth/Height; make sure values match our constants
  Object.defineProperty(window, 'innerWidth',  { writable: true, value: VP_W });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: VP_H });

  ({ helpers: { computeMediaSize } } = loadContentScript());
});

describe('computeMediaSize', () => {
  // ── No scale-up ──────────────────────────────────────────────────────────────
  test('does not scale up a small image that fits within available space', () => {
    const result = computeMediaSize(100, 80);
    expect(result).toEqual({ w: 100, h: 80 });
  });

  test('does not scale up a square image fitting the viewport', () => {
    const result = computeMediaSize(400, 400);
    expect(result).toEqual({ w: 400, h: 400 });
  });

  // ── Scale down (too wide) ────────────────────────────────────────────────────
  test('scales down a very wide image to fit available width', () => {
    // 3000×400: scale = 827/3000 = 0.276 → h = floor(400*0.276) = 110 > 50 ✓
    const natW = 3000;
    const natH = 400;
    const result = computeMediaSize(natW, natH);
    expect(result).not.toBeNull();
    expect(result.w).toBeLessThanOrEqual(availW());
    // Aspect ratio preserved: w/h ≈ natW/natH
    expect(result.w / result.h).toBeCloseTo(natW / natH, 0);
  });

  test('scales down a very tall image to fit available height', () => {
    // 400×3000: scale = 617/3000 = 0.206 → w = floor(400*0.206) = 82 > 50 ✓
    const natW = 400;
    const natH = 3000;
    const result = computeMediaSize(natW, natH);
    expect(result).not.toBeNull();
    expect(result.h).toBeLessThanOrEqual(availH());
    expect(result.w / result.h).toBeCloseTo(natW / natH, 0);
  });

  test('scales down a very large square image', () => {
    const result = computeMediaSize(10000, 10000);
    expect(result).not.toBeNull();
    expect(result.w).toBeLessThanOrEqual(availW());
    expect(result.h).toBeLessThanOrEqual(availH());
    // Must be square (aspect ratio 1:1)
    expect(result.w).toBe(result.h);
  });

  // ── Aspect ratio preservation ─────────────────────────────────────────────────
  test('preserves 16:9 landscape aspect ratio when scaling down', () => {
    // 3840×2160 → should scale to fit 827×617 space
    const natW = 3840;
    const natH = 2160;
    const result = computeMediaSize(natW, natH);
    expect(result).not.toBeNull();
    // ratio should be preserved within 1 pixel of rounding
    const ratio = result.w / result.h;
    expect(ratio).toBeCloseTo(16 / 9, 1);
  });

  test('preserves 9:16 portrait aspect ratio when scaling down', () => {
    const natW = 1080;
    const natH = 1920;
    const result = computeMediaSize(natW, natH);
    expect(result).not.toBeNull();
    const ratio = result.w / result.h;
    expect(ratio).toBeCloseTo(9 / 16, 1);
  });

  // ── Boundary: exactly fills available space ───────────────────────────────────
  test('image exactly matching available dimensions is not scaled', () => {
    const result = computeMediaSize(availW(), availH());
    expect(result).toEqual({ w: availW(), h: availH() });
  });

  // ── MIN_DIMENSION guard ───────────────────────────────────────────────────────
  test('returns null when natural width is below MIN_DIMENSION', () => {
    expect(computeMediaSize(10, 200)).toBeNull();
  });

  test('returns null when natural height is below MIN_DIMENSION', () => {
    expect(computeMediaSize(200, 10)).toBeNull();
  });

  test('returns null for a 1×1 pixel image', () => {
    expect(computeMediaSize(1, 1)).toBeNull();
  });

  test('returns null for a tiny wide image that would scale below MIN_DIMENSION height', () => {
    // natW=5000, natH=5 → scale = 827/5000 → h = floor(5 * 0.1654) = 0 → null
    expect(computeMediaSize(5000, 5)).toBeNull();
  });

  test('returns a result for an image just at MIN_DIMENSION', () => {
    // 50×50 is right at the boundary and should pass
    const result = computeMediaSize(MIN_DIM, MIN_DIM);
    expect(result).not.toBeNull();
    expect(result.w).toBe(MIN_DIM);
    expect(result.h).toBe(MIN_DIM);
  });

  test('returns null for an image just below MIN_DIMENSION', () => {
    expect(computeMediaSize(MIN_DIM - 1, MIN_DIM - 1)).toBeNull();
  });

  // ── Output is always integers ─────────────────────────────────────────────────
  test('output dimensions are integers (floor applied)', () => {
    const result = computeMediaSize(2000, 1500);
    if (result) {
      expect(Number.isInteger(result.w)).toBe(true);
      expect(Number.isInteger(result.h)).toBe(true);
    }
  });
});
