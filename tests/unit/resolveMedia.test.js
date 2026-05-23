/**
 * resolveMedia.test.js
 *
 * Tests for resolveMedia() — the core function that decides whether a hovered
 * element should trigger a preview and what kind.
 *
 * jsdom doesn't resolve relative hrefs, so we always use absolute URLs in
 * the fixture HTML to match what a real browser would pass to the function.
 */

'use strict';

const { loadContentScript } = require('./harness');

let resolveMedia;

beforeAll(() => {
  ({ helpers: { resolveMedia } } = loadContentScript());
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a detached element from an HTML string. */
function el(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

/** Attach el to document.body so ancestor walks can reach body. */
function attach(element) {
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ── Image links ──────────────────────────────────────────────────────────────

describe('resolveMedia – image links', () => {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tiff', 'ico'];

  imageExts.forEach((ext) => {
    test(`detects .${ext} link`, () => {
      const a = attach(el(`<a href="https://example.com/photo.${ext}">link</a>`));
      const result = resolveMedia(a);
      expect(result).not.toBeNull();
      expect(result.type).toBe('image');
      expect(result.url).toContain(`photo.${ext}`);
    });
  });

  test('detects image link with query string', () => {
    const a = attach(el('<a href="https://cdn.example.com/photo.jpg?w=800&h=600">img</a>'));
    expect(resolveMedia(a)).toMatchObject({ type: 'image' });
  });

  test('detects image link with fragment', () => {
    const a = attach(el('<a href="https://cdn.example.com/photo.png#main">img</a>'));
    expect(resolveMedia(a)).toMatchObject({ type: 'image' });
  });

  test('case-insensitive extension matching', () => {
    const a = attach(el('<a href="https://example.com/PHOTO.JPG">img</a>'));
    expect(resolveMedia(a)).toMatchObject({ type: 'image' });
  });
});

// ── Video links ───────────────────────────────────────────────────────────────

describe('resolveMedia – video links', () => {
  const videoExts = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v'];

  videoExts.forEach((ext) => {
    test(`detects .${ext} link`, () => {
      const a = attach(el(`<a href="https://example.com/clip.${ext}">video</a>`));
      const result = resolveMedia(a);
      expect(result).not.toBeNull();
      expect(result.type).toBe('video');
    });
  });
});

// ── YouTube links ─────────────────────────────────────────────────────────────

describe('resolveMedia – YouTube links', () => {
  test('detects youtube.com/watch URL', () => {
    const a = attach(el('<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">yt</a>'));
    const result = resolveMedia(a);
    expect(result).toMatchObject({ type: 'youtube' });
    expect(result.url).toContain('maxresdefault.jpg');
    expect(result.fallbackUrl).toContain('hqdefault.jpg');
    expect(result.url).toContain('dQw4w9WgXcQ');
  });

  test('detects youtu.be short link', () => {
    const a = attach(el('<a href="https://youtu.be/abc123XYZ">yt</a>'));
    const result = resolveMedia(a);
    expect(result).toMatchObject({ type: 'youtube' });
    expect(result.url).toContain('abc123XYZ');
  });

  test('detects youtube /shorts/ link', () => {
    const a = attach(el('<a href="https://www.youtube.com/shorts/abc123">short</a>'));
    expect(resolveMedia(a)).toMatchObject({ type: 'youtube' });
  });
});

// ── <img> elements ────────────────────────────────────────────────────────────

describe('resolveMedia – <img> elements', () => {
  test('resolves src of a standalone <img>', () => {
    const img = attach(el('<img src="https://example.com/photo.png" alt="test">'));
    const result = resolveMedia(img);
    expect(result).toMatchObject({ type: 'image', url: 'https://example.com/photo.png' });
  });

  test('resolves data-src lazy-load attribute on <img>', () => {
    // Create an img without a src attribute so resolveMedia falls through to
    // the dataset.src check. jsdom resolves src="" to http://localhost/ which
    // would be picked up first as a non-image URL, hiding the lazy-src path.
    const img = document.createElement('img');
    img.dataset.src = 'https://example.com/lazy.jpg';
    document.body.appendChild(img);
    const result = resolveMedia(img);
    expect(result).toMatchObject({ type: 'image' });
    expect(result.url).toContain('lazy.jpg');
  });

  test('resolves data-lazy-src attribute on <img>', () => {
    const img = attach(el('<img data-lazy-src="https://example.com/lazy2.webp" src="">'));
    // data-lazy-src maps to dataset.lazySrc
    const result = resolveMedia(img);
    expect(result).toMatchObject({ type: 'image' });
  });
});

// ── Lazy-load data attributes on non-img elements ─────────────────────────────

describe('resolveMedia – lazy-load data attributes', () => {
  test('resolves data-src on a <div>', () => {
    const div = attach(el('<div data-src="https://example.com/img.png"></div>'));
    expect(resolveMedia(div)).toMatchObject({ type: 'image' });
  });

  test('resolves data-original on a <span>', () => {
    const span = attach(el('<span data-original="https://example.com/img.gif"></span>'));
    expect(resolveMedia(span)).toMatchObject({ type: 'image' });
  });
});

// ── Ancestor walking ──────────────────────────────────────────────────────────

describe('resolveMedia – ancestor link walking', () => {
  test('finds image link on parent <a> when hovering a child <span>', () => {
    const container = attach(el(`
      <a href="https://example.com/photo.jpg">
        <span class="inner">text</span>
      </a>`));
    const span = container.querySelector('span');
    expect(resolveMedia(span)).toMatchObject({ type: 'image' });
  });

  test('finds image link two levels up', () => {
    const container = attach(el(`
      <a href="https://example.com/photo.png">
        <div><em>nested text</em></div>
      </a>`));
    const em = container.querySelector('em');
    expect(resolveMedia(em)).toMatchObject({ type: 'image' });
  });

  test('stops ancestor walk at document.body', () => {
    // A plain element with no media attributes that is a direct child of body
    const div = attach(el('<div>plain text</div>'));
    expect(resolveMedia(div)).toBeNull();
  });
});

// ── No-match cases ────────────────────────────────────────────────────────────

describe('resolveMedia – no match', () => {
  test('returns null for a plain link to an HTML page', () => {
    const a = attach(el('<a href="https://example.com/page.html">link</a>'));
    expect(resolveMedia(a)).toBeNull();
  });

  test('returns null for an anchor with no href', () => {
    const a = attach(el('<a name="section">anchor</a>'));
    expect(resolveMedia(a)).toBeNull();
  });

  test('returns null for a plain <div> with no relevant attributes', () => {
    const div = attach(el('<div class="wrapper">content</div>'));
    expect(resolveMedia(div)).toBeNull();
  });

  test('returns null for a <button>', () => {
    const btn = attach(el('<button type="button">Click me</button>'));
    expect(resolveMedia(btn)).toBeNull();
  });
});
