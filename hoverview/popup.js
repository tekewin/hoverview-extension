document.addEventListener('DOMContentLoaded', function () {
  // Retrieve DOM elements
  const enabledToggle = document.getElementById('enabled-toggle');
  const delaySlider = document.getElementById('delay-slider');
  const delayVal = document.getElementById('delay-val');
  const durationSlider = document.getElementById('duration-slider');
  const durationVal = document.getElementById('duration-val');
  const muteToggle = document.getElementById('mute-toggle');
  const triggerSelect = document.getElementById('trigger-select');
  const blocklistTextarea = document.getElementById('blocklist-textarea');
  const statusMessage = document.getElementById('status-message');
  const versionLabel = document.getElementById('version-label');

  let statusTimeout = null;

  // Display the version straight from the manifest so it never drifts.
  if (versionLabel) {
    versionLabel.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  /**
   * Display visual saving confirmation badge.
   */
  function showStatus() {
    statusMessage.classList.add('show');
    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 1100);
  }

  /**
   * Load options from Chrome extension Storage Sync.
   */
  function loadSettings() {
    if (!chrome.storage || !chrome.storage.sync) return;

    chrome.storage.sync.get({
      enabled: true,
      showDelay: 320,
      videoDuration: 10,
      videoMuted: true,
      triggerKey: 'None',
      blockedDomains: ''
    }, function (items) {
      enabledToggle.checked = items.enabled;
      
      delaySlider.value = items.showDelay;
      delayVal.textContent = items.showDelay + 'ms';
      
      durationSlider.value = items.videoDuration;
      durationVal.textContent = items.videoDuration + 's';
      
      muteToggle.checked = items.videoMuted;
      triggerSelect.value = items.triggerKey;
      blocklistTextarea.value = items.blockedDomains;
    });
  }

  /**
   * Save configured values to Chrome extension Storage Sync.
   */
  function saveSettings() {
    if (!chrome.storage || !chrome.storage.sync) return;

    chrome.storage.sync.set({
      enabled: enabledToggle.checked,
      showDelay: Number(delaySlider.value),
      videoDuration: Number(durationSlider.value),
      videoMuted: muteToggle.checked,
      triggerKey: triggerSelect.value,
      blockedDomains: blocklistTextarea.value
    }, function () {
      showStatus();
    });
  }

  // Load current values
  loadSettings();

  // Attach immediate action listeners
  enabledToggle.addEventListener('change', saveSettings);
  muteToggle.addEventListener('change', saveSettings);
  triggerSelect.addEventListener('change', saveSettings);
  
  // Attach slide listeners with label tracking and save on release
  delaySlider.addEventListener('input', function () {
    delayVal.textContent = delaySlider.value + 'ms';
  });
  delaySlider.addEventListener('change', saveSettings);

  durationSlider.addEventListener('input', function () {
    durationVal.textContent = durationSlider.value + 's';
  });
  durationSlider.addEventListener('change', saveSettings);

  // Attach typing listener for blocklist with debounce
  let blocklistTimeout = null;
  blocklistTextarea.addEventListener('input', function () {
    clearTimeout(blocklistTimeout);
    blocklistTimeout = setTimeout(saveSettings, 600);
  });
});
