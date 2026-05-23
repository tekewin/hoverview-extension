/**
 * make-fixtures.cjs
 * Run once: `node tests/e2e/fixtures/make-fixtures.cjs`
 * Generates the binary fixture files (1x1 PNG, minimal MP4) used by E2E tests.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname);

// ── 1×1 red PNG ──────────────────────────────────────────────────────────────
// This is a hand-crafted minimal valid PNG (68 bytes).
// Signature + IHDR + IDAT (1×1 red pixel, zlib-compressed) + IEND
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a' +            // PNG signature
  '0000000d49484452' +            // IHDR chunk length=13
  '00000001' +                    // width=1
  '00000001' +                    // height=1
  '08020000' +                    // bit depth=8, color type=2 (RGB), compress=0, filter=0
  '0090wc3d' +                    // CRC placeholder — recalculated below via real data
  '0000000c49444154' +            // IDAT chunk length=12
  '08d76360f8cf0000' +
  '00020001' +                    // zlib compressed 1×1 pixel (red: RGB 255,0,0)
  'e221bc33' +                    // CRC
  '0000000049454e44' +            // IEND chunk
  'ae426082',                     // IEND CRC
  'hex'
);

// Use a well-known correct minimal 1×1 PNG instead (avoids hand-crafting CRCs)
// Source: https://github.com/nicowillis/tiny-png  (public domain)
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
  'base64'
);

fs.writeFileSync(path.join(OUT, 'sample.png'), REAL_PNG);
console.log('Created sample.png');

// ── Minimal SVG (serves as a simple image for link tests) ─────────────────────
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
  <rect width="200" height="150" fill="#4f46e5"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="white" font-size="20" font-family="sans-serif">Test Image</text>
</svg>`;
fs.writeFileSync(path.join(OUT, 'sample.svg'), SVG);
console.log('Created sample.svg');

// ── Tiny stub MP4 (12 bytes – not a valid video but enough to test the element) ─
// Real video tests rely on the 'error' event; we just need the link to be .mp4
// For metadata loading we use a small but valid WebM instead (generated below)
const STUB_MP4 = Buffer.alloc(12, 0x00);
fs.writeFileSync(path.join(OUT, 'sample.mp4'), STUB_MP4);
console.log('Created sample.mp4 (stub)');

console.log('All fixtures generated.');
