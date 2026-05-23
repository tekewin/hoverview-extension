/**
 * getYouTubeVideoId.test.js
 *
 * Tests for the YouTube URL parsing helper in content.js.
 */

'use strict';

const { loadContentScript } = require('./harness');

let getYouTubeVideoId;

beforeAll(() => {
  ({ helpers: { getYouTubeVideoId } } = loadContentScript());
});

describe('getYouTubeVideoId', () => {
  // ── Standard watch URL ─────────────────────────────────────────────────────
  test('extracts ID from standard watch URL', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from watch URL without www', () => {
    expect(getYouTubeVideoId('https://youtube.com/watch?v=abc123XYZ'))
      .toBe('abc123XYZ');
  });

  test('extracts ID from watch URL with extra query params', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=abc123&t=42s&list=PL'))
      .toBe('abc123');
  });

  // ── Short URL ──────────────────────────────────────────────────────────────
  test('extracts ID from youtu.be short URL', () => {
    expect(getYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from youtu.be short URL with query string', () => {
    expect(getYouTubeVideoId('https://youtu.be/abc123?t=30')).toBe('abc123');
  });

  // ── Embed URL ──────────────────────────────────────────────────────────────
  test('extracts ID from /embed/ URL', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from /embed/ URL with query params', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/embed/abc123?autoplay=1'))
      .toBe('abc123');
  });

  // ── Shorts URL ─────────────────────────────────────────────────────────────
  test('extracts ID from /shorts/ URL', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'))
      .toBe('dQw4w9WgXcQ');
  });

  // ── Non-YouTube URLs ───────────────────────────────────────────────────────
  test('returns null for a non-YouTube URL', () => {
    expect(getYouTubeVideoId('https://vimeo.com/123456789')).toBeNull();
  });

  test('returns null for an unrelated HTTPS URL', () => {
    expect(getYouTubeVideoId('https://example.com/watch?v=whatever')).toBeNull();
  });

  test('returns null for a plain image URL', () => {
    expect(getYouTubeVideoId('https://example.com/photo.jpg')).toBeNull();
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  test('returns null for a malformed (non-parseable) URL', () => {
    expect(getYouTubeVideoId('not a url at all !@#$')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(getYouTubeVideoId('')).toBeNull();
  });

  test('returns null for youtube.com root with no v param', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/')).toBeNull();
  });

  test('returns null for youtube.com/watch with no v param', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch')).toBeNull();
  });
});
