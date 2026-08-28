/**
 * Rasterize the icon SVGs in assets/icons/ to the PNGs the extension ships.
 *
 * Uses Playwright's Chromium so the icons are rasterized by the same engine
 * that will display them. Run with: npm run icons
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'icons');
const OUT_DIR = path.join(__dirname, '..', 'hoverview', 'icons');

// Small sizes use the hinted variant; large sizes use the full-detail master.
const TARGETS = [
  { size: 16,  src: 'viewfinder-small.svg', out: 'icon16.png'  },
  { size: 32,  src: 'viewfinder-small.svg', out: 'icon32.png'  },
  { size: 48,  src: 'viewfinder.svg',       out: 'icon48.png'  },
  { size: 128, src: 'viewfinder.svg',       out: 'icon128.png' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const { size, src, out } of TARGETS) {
    const svg = fs.readFileSync(path.join(SRC_DIR, src), 'utf8');

    // Size the SVG to the exact target so Chromium rasterizes the vector at
    // that resolution, rather than scaling a larger bitmap down.
    const sized = svg
      .replace(/\swidth="\d+"/, ` width="${size}"`)
      .replace(/\sheight="\d+"/, ` height="${size}"`);

    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block}</style>${sized}`
    );

    await page.screenshot({
      path: path.join(OUT_DIR, out),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });

    console.log(`  ${out.padEnd(13)} ${size}x${size}  <- ${src}`);
  }

  await browser.close();
  console.log('\nIcons written to hoverview/icons/');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
