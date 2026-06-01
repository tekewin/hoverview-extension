/**
 * HoverView — content script
 * Hover over an image or video link to preview it.
 * Move the mouse away to dismiss.
 */
(function () {
  'use strict';

  // Attribute used as a cross-world singleton lock (see below).
  const HV_MARKER = 'data-hoverview-active';

  // ─── Duplicate/Orphan Prevention ──────────────────────────────────────────

  // Same-world re-injection: tear down the previous instance of THIS script.
  if (window.__hoverview_cleanup__) {
    try {
      window.__hoverview_cleanup__();
    } catch (e) {
      console.warn('HoverView: Cleanup of previous instance failed:', e);
    }
  }

  // Cross-world guard: content scripts from separate extension installs run in
  // isolated JS worlds and cannot see each other's `window`, but they DO share
  // the DOM. A marker attribute on <html> guarantees only one HoverView
  // instance is ever active, even if the extension is loaded more than once.
  if (document.documentElement.hasAttribute(HV_MARKER)) {
    return;
  }
  document.documentElement.setAttribute(HV_MARKER, '1');

  // ─── Constants ────────────────────────────────────────────────────────────

  const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?|ico)(\?[^#]*)?(?:#.*)?$/i;
  const VIDEO_RE = /\.(mp4|webm|og[gv]|mov|avi|mkv|m4v)(\?[^#]*)?(?:#.*)?$/i;

  // Fraction of the viewport to use for the overlay
  const MAX_W_FRAC = 0.82;
  const MAX_H_FRAC = 0.82;

  // Overlay padding (must match CSS padding: 6px → 12px per axis)
  const OVERLAY_PADDING = 12;

  // Don't show a preview smaller than this in either dimension
  const MIN_DIMENSION = 50;

  // Offset from the cursor (px)
  const CURSOR_OFFSET = 18;

  // ─── State ────────────────────────────────────────────────────────────────

  let overlay = null;
  let spinner = null;
  let showTimer = null;
  let videoTimer = null;
  let activeTarget = null;   // the DOM element currently being hovered
  let mouseX = 0;
  let mouseY = 0;

  // Extension configuration state with defaults
  const config = {
    enabled: true,
    showDelay: 320,
    videoDuration: 10,
    videoMuted: true,
    triggerKey: 'None',
    blockedDomains: []
  };

  // ─── Orphaned Script Handling ─────────────────────────────────────────────

  function isOrphaned() {
    try {
      return typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id;
    } catch (e) {
      return true;
    }
  }

  function cleanupOrphan() {
    // Release the cross-world singleton lock so a fresh instance can take over.
    try {
      document.documentElement.removeAttribute(HV_MARKER);
    } catch (e) {}

    try {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    } catch (e) {}

    try {
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    } catch (e) {}

    clearTimeout(showTimer);
    clearTimeout(videoTimer);

    // Remove any and all hoverview elements from the DOM
    const overlays = document.querySelectorAll('#hoverview-overlay');
    overlays.forEach(function (ol) {
      try {
        const vid = ol.querySelector('video');
        if (vid) {
          vid.pause();
          vid.src = '';
          vid.load();
        }
      } catch (e) {}
      ol.remove();
    });

    const spinners = document.querySelectorAll('#hoverview-spinner');
    spinners.forEach(function (sp) {
      sp.remove();
    });
  }

  // Register cleanup function on global window object
  window.__hoverview_cleanup__ = cleanupOrphan;

  // ─── Options Management ───────────────────────────────────────────────────

  /**
   * Load current configuration from chrome storage sync.
   */
  function loadSettings() {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    if (!chrome.storage || !chrome.storage.sync) return;

    chrome.storage.sync.get({
      enabled: true,
      showDelay: 320,
      videoDuration: 10,
      videoMuted: true,
      triggerKey: 'None',
      blockedDomains: ''
    }, function (items) {
      config.enabled = items.enabled;
      config.showDelay = Number(items.showDelay);
      config.videoDuration = Number(items.videoDuration);
      config.videoMuted = items.videoMuted;
      config.triggerKey = items.triggerKey;

      if (items.blockedDomains) {
        config.blockedDomains = items.blockedDomains
          .split('\n')
          .map(d => d.trim().toLowerCase())
          .filter(d => d.length > 0);
      } else {
        config.blockedDomains = [];
      }

      // If disabled or domain is blocked, instantly dismiss any active overlay
      if (!config.enabled || isCurrentDomainBlocked()) {
        dismissOverlay();
      }
    });
  }

  // Load configuration on initialization
  loadSettings();

  // Listen for options changes and apply them dynamically
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  /**
   * Determine if the current website domain is on the blocklist.
   */
  function isCurrentDomainBlocked() {
    const host = window.location.hostname.toLowerCase();
    if (!host) return false;
    return config.blockedDomains.some(domain => {
      return host === domain || host.endsWith('.' + domain);
    });
  }

  /**
   * Check if required trigger modifier keys are currently pressed.
   */
  function checkTriggerKey(e) {
    if (config.triggerKey === 'None') return true;
    if (config.triggerKey === 'Shift' && e.shiftKey) return true;
    if (config.triggerKey === 'Ctrl' && e.ctrlKey) return true;
    if (config.triggerKey === 'Alt' && e.altKey) return true;
    if (config.triggerKey === 'ShiftMute' && !e.shiftKey) return true;
    return false;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Extract video ID from common YouTube URL formats.
   */
  function getYouTubeVideoId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith('youtube.com')) {
        if (parsed.pathname === '/watch') {
          return parsed.searchParams.get('v');
        }
        if (parsed.pathname.startsWith('/embed/')) {
          return parsed.pathname.substring(7);
        }
        if (parsed.pathname.startsWith('/shorts/')) {
          return parsed.pathname.substring(8);
        }
      } else if (parsed.hostname === 'youtu.be') {
        return parsed.pathname.substring(1);
      }
    } catch (err) {
      // Invalid URL syntax, ignore
    }
    return null;
  }

  /**
   * Walk up from `el` looking for a URL that points to an image or video.
   * Returns { url, fallbackUrl, type } or null.
   */
  function resolveMedia(el) {
    // 1. Check whether the element (or any ancestor <a>) href points at media
    let node = el;
    while (node && node !== document.body) {
      if (node.tagName === 'A' && node.href) {
        const href = node.href;
        if (IMAGE_RE.test(href)) return { url: href, type: 'image' };
        if (VIDEO_RE.test(href)) return { url: href, type: 'video' };
        
        // YouTube integration
        const ytId = getYouTubeVideoId(href);
        if (ytId) {
          return {
            url: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
            fallbackUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
            type: 'youtube'
          };
        }
      }
      node = node.parentElement;
    }

    // 2. The element itself is an <img>
    if (el.tagName === 'IMG') {
      const src = el.src || el.dataset.src || el.dataset.lazySrc || '';
      if (src) return { url: src, type: 'image' };
    }

    // 3. Check data-src / data-original on any element (lazy-load thumbnails)
    const lazySrc =
      el.dataset.src || el.dataset.original || el.dataset.lazySrc || '';
    if (lazySrc) {
      if (IMAGE_RE.test(lazySrc)) return { url: lazySrc, type: 'image' };
      if (VIDEO_RE.test(lazySrc)) return { url: lazySrc, type: 'video' };
    }

    return null;
  }

  /**
   * Compute the display size for media with the given natural dimensions,
   * constrained to fit entirely within the viewport.
   * Returns { w, h } in pixels, or null if the result would be too small.
   */
  function computeMediaSize(naturalW, naturalH) {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // Available pixels for the media content after overlay padding
    const availW = Math.floor(vpW * MAX_W_FRAC) - OVERLAY_PADDING;
    const availH = Math.floor(vpH * MAX_H_FRAC) - OVERLAY_PADDING;

    // Scale down proportionally to fit within available space (never scale up)
    const scale = Math.min(1, availW / naturalW, availH / naturalH);
    const w = Math.floor(naturalW * scale);
    const h = Math.floor(naturalH * scale);

    // Skip previews too small to be useful
    if (w < MIN_DIMENSION || h < MIN_DIMENSION) return null;

    return { w, h };
  }

  /**
   * Apply explicit pixel dimensions to the overlay and its media child,
   * guaranteeing it can never overflow the viewport.
   */
  function applyOverlaySize(mediaEl, w, h) {
    mediaEl.style.width  = w + 'px';
    mediaEl.style.height = h + 'px';
    // Size the overlay box to exactly wrap the media + padding
    overlay.style.width     = (w + OVERLAY_PADDING) + 'px';
    overlay.style.height    = (h + OVERLAY_PADDING) + 'px';
    overlay.style.maxWidth  = '';
    overlay.style.maxHeight = '';
  }

  /**
   * Position the overlay near the cursor, flipping sides if it would overflow.
   */
  function positionOverlay() {
    if (!overlay) return;

    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    const ow = overlay.offsetWidth;
    const oh = overlay.offsetHeight;

    // Prefer: right of and below the cursor
    let left = mouseX + CURSOR_OFFSET;
    let top  = mouseY + CURSOR_OFFSET;

    // Flip horizontally if it clips the right edge
    if (left + ow > vpW - 8) {
      left = mouseX - ow - CURSOR_OFFSET;
    }
    // Flip vertically if it clips the bottom edge
    if (top + oh > vpH - 8) {
      top = mouseY - oh - CURSOR_OFFSET;
    }

    // Clamp to viewport edges
    left = Math.max(8, left);
    top  = Math.max(8, top);

    // Convert to page coordinates
    overlay.style.left = (left + window.scrollX) + 'px';
    overlay.style.top  = (top  + window.scrollY) + 'px';
  }

  // ─── Overlay lifecycle ────────────────────────────────────────────────────

  function ensureOverlay() {
    if (!overlay) {
      overlay = document.getElementById('hoverview-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'hoverview-overlay';
        document.documentElement.appendChild(overlay);
      }
    }
    return overlay;
  }

  function ensureSpinner() {
    if (!spinner) {
      spinner = document.getElementById('hoverview-spinner');
      if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'hoverview-spinner';
        spinner.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="12" fill="none"
            stroke="rgba(255,255,255,0.85)" stroke-width="3"
            stroke-dasharray="56" stroke-dashoffset="14"
            stroke-linecap="round"/>
        </svg>`;
        document.documentElement.appendChild(spinner);
      }
    }
    return spinner;
  }

  function showSpinner() {
    const s = ensureSpinner();
    s.style.left = (mouseX + window.scrollX + CURSOR_OFFSET) + 'px';
    s.style.top  = (mouseY + window.scrollY + CURSOR_OFFSET) + 'px';
    s.classList.add('hv-visible');
  }

  function hideSpinner() {
    if (spinner) spinner.classList.remove('hv-visible');
  }

  function dismissOverlay() {
    clearTimeout(showTimer);
    clearTimeout(videoTimer);
    showTimer    = null;
    videoTimer   = null;
    activeTarget = null;

    hideSpinner();

    if (overlay) {
      overlay.classList.remove('hv-visible');
      // Stop any playing video to release resources
      const vid = overlay.querySelector('video');
      if (vid) {
        vid.pause();
        vid.src = '';
        vid.load();
      }
      overlay.innerHTML = '';
    }
  }

  // ─── Error State Display ──────────────────────────────────────────────────

  /**
   * Display a clean error message overlay on media loading failure.
   */
  function showError(message, detail = '') {
    const ol = ensureOverlay();
    ol.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'hv-error-container';

    const icon = document.createElement('div');
    icon.className = 'hv-error-icon';
    icon.textContent = '⚠️';

    const text = document.createElement('div');
    text.className = 'hv-error-text';
    text.textContent = message;

    const subtext = document.createElement('div');
    subtext.className = 'hv-error-subtext';
    // Trim protocols or long query strings for readable detail
    subtext.textContent = detail.replace(/^https?:\/\//i, '').split('?')[0];

    container.appendChild(icon);
    container.appendChild(text);
    container.appendChild(subtext);
    ol.appendChild(container);

    // Give the overlay fixed sizing for the error block
    overlay.style.width  = '252px'; // 240px + 12px padding
    overlay.style.height = '132px'; // 120px + 12px padding
    overlay.style.maxWidth  = '';
    overlay.style.maxHeight = '';

    ol.classList.add('hv-visible');
    positionOverlay();
  }

  // ─── Image preview ────────────────────────────────────────────────────────

  function showImage(url, fallbackUrl = null) {
    const expectedTarget = activeTarget;
    showSpinner();

    const img = new Image();

    img.onload = function () {
      if (activeTarget !== expectedTarget) return;  // user moved to a different target

      // Compute constrained display size — skip if too small to be useful
      const size = computeMediaSize(img.naturalWidth, img.naturalHeight);
      if (!size) {
        hideSpinner();
        return;
      }

      hideSpinner();

      const ol = ensureOverlay();
      ol.innerHTML = '';

      const imgEl = document.createElement('img');
      imgEl.src = url;

      // Badge showing original resolution
      if (img.naturalWidth > 0) {
        const badge = document.createElement('span');
        badge.className = 'hv-badge';
        badge.textContent = img.naturalWidth + ' × ' + img.naturalHeight;
        ol.appendChild(badge);
      }
      ol.appendChild(imgEl);

      // Apply explicit pixel dimensions — guarantees no overflow
      applyOverlaySize(imgEl, size.w, size.h);

      ol.classList.add('hv-visible');
      positionOverlay();
    };

    img.onerror = function () {
      if (activeTarget !== expectedTarget) return;
      if (fallbackUrl) {
        showImage(fallbackUrl);
      } else {
        hideSpinner();
        showError('Image failed to load', url);
      }
    };

    img.src = url;
  }

  // ─── Video preview ────────────────────────────────────────────────────────

  function showVideo(url) {
    const expectedTarget = activeTarget;
    showSpinner();

    const ol = ensureOverlay();
    ol.innerHTML = '';

    const vid = document.createElement('video');
    vid.src          = url;
    vid.muted        = config.videoMuted;
    vid.autoplay     = false;
    vid.controls     = false;
    vid.preload      = 'metadata';
    vid.playsInline  = true;
    vid.loop         = false;

    const badge = document.createElement('span');
    badge.className = 'hv-badge';
    badge.textContent = config.videoMuted ? '▶ video' : '🔊 video';
    ol.appendChild(badge);

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.className = 'hv-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'hv-progress-bar';
    progressWrap.appendChild(progressBar);
    ol.appendChild(progressWrap);

    ol.appendChild(vid);

    vid.addEventListener('loadedmetadata', function () {
      if (activeTarget !== expectedTarget) return;

      // Use video's intrinsic dimensions; fall back to a 16:9 default
      const natW = vid.videoWidth  || 640;
      const natH = vid.videoHeight || 360;
      const size = computeMediaSize(natW, natH);
      if (!size) {
        hideSpinner();
        return;
      }

      // Apply explicit pixel dimensions — guarantees no overflow
      applyOverlaySize(vid, size.w, size.h);

      hideSpinner();
      ol.classList.add('hv-visible');
      positionOverlay();

      // Guard: ignore re-entrant loadedmetadata firings (e.g. from seek)
      if (videoTimer !== null) return;

      const playDuration = Math.min(config.videoDuration, vid.duration || config.videoDuration);

      vid.currentTime = 0;
      vid.play().catch(() => {
        badge.textContent = '▶ (click to play)';
      });

      // Drive progress bar with a CSS animation
      progressBar.style.animationDuration = playDuration + 's';
      progressBar.classList.add('hv-progress-animate');

      videoTimer = setTimeout(function () {
        vid.pause();
        progressBar.classList.remove('hv-progress-animate');
        badge.textContent = '▶ video (paused)';
      }, playDuration * 1000);
    });

    vid.addEventListener('error', function () {
      if (activeTarget !== expectedTarget) return;
      hideSpinner();
      showError('Video failed to load', url);
    });
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────

  function handleMouseMove(e) {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (spinner && spinner.classList.contains('hv-visible')) {
      spinner.style.left = (mouseX + window.scrollX + CURSOR_OFFSET) + 'px';
      spinner.style.top  = (mouseY + window.scrollY + CURSOR_OFFSET) + 'px';
    }

    if (overlay && overlay.classList.contains('hv-visible')) {
      positionOverlay();
    }

    // Dismiss if modifier key is released while hovering
    if (activeTarget && !checkTriggerKey(e)) {
      dismissOverlay();
    }
  }

  function handleMouseOver(e) {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    if (!config.enabled || isCurrentDomainBlocked()) return;

    // Verify key binding is matched
    if (!checkTriggerKey(e)) return;

    const target = e.target;
    if (!target) return;

    const media = resolveMedia(target);
    if (!media) return;

    if (activeTarget === target) return;

    dismissOverlay();
    activeTarget = target;

    showTimer = setTimeout(function () {
      if (!activeTarget) return;

      if (media.type === 'image') {
        showImage(media.url);
      } else if (media.type === 'youtube') {
        showImage(media.url, media.fallbackUrl);
      } else if (media.type === 'video') {
        showVideo(media.url);
      }
    }, config.showDelay);
  }

  function handleMouseOut(e) {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    if (!activeTarget) return;

    let related = e.relatedTarget;
    while (related) {
      if (related === activeTarget) return;
      related = related.parentElement;
    }

    dismissOverlay();
  }

  function handleKeyDown(e) {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    if (!config.enabled || isCurrentDomainBlocked()) return;

    // Trigger overlay if hover matches trigger key dynamically
    if (!activeTarget) {
      const hoveredEl = document.elementFromPoint(mouseX, mouseY);
      if (hoveredEl && checkTriggerKey(e)) {
        const media = resolveMedia(hoveredEl);
        if (media) {
          activeTarget = hoveredEl;
          if (media.type === 'image') {
            showImage(media.url);
          } else if (media.type === 'youtube') {
            showImage(media.url, media.fallbackUrl);
          } else if (media.type === 'video') {
            showVideo(media.url);
          }
        }
      }
      return;
    }

    // Dismiss overlay if key constraint is broken
    if (!checkTriggerKey(e)) {
      dismissOverlay();
    }
  }

  function handleKeyUp(e) {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    if (activeTarget && !checkTriggerKey(e)) {
      dismissOverlay();
    }
  }

  function handleScroll() {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    dismissOverlay();
  }

  function handleResize() {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    dismissOverlay();
  }

  function handleStorageChange(changes, namespace) {
    if (isOrphaned()) {
      cleanupOrphan();
      return;
    }
    if (namespace === 'sync') {
      loadSettings();
    }
  }

  // Bind Event Listeners
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize, { passive: true });

})();