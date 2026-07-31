(() => {
  "use strict";

  const STORAGE_KEY = "promoCleanerEnabled";
  const ENABLED_CLASS = "tcpc-enabled";
  const HIDDEN_ATTR = "data-tcpc-hidden";

  /**
   * Selectors for promo / channel-skin banners that sit above Twitch chat.
   * Prefer stable data-test-selector / data-a-target attributes over generated classes.
   */
  const PROMO_SELECTORS = [
    '[data-test-selector="channel-skins-shared-above-chat-v3"]',
    '[data-test-selector="channel-skins-above-chat"]',
    '[data-a-target="channel-skins-shared-above-chat"]',
    '[data-a-target="channel-skins-above-chat"]',
    ".channel-skins-shared-above-chat",
    ".channel-skins-above-chat",
    '[class*="ChannelSkinsSharedAboveChat"]',
    '[class*="channel-skins-shared-above-chat"]',
  ];

  let enabled = true;
  let observer = null;

  function setDocumentEnabled(isEnabled) {
    document.documentElement.classList.toggle(ENABLED_CLASS, isEnabled);
  }

  function findPromoNodes(root = document) {
    const nodes = new Set();
    for (const selector of PROMO_SELECTORS) {
      try {
        root.querySelectorAll?.(selector)?.forEach((el) => nodes.add(el));
        if (root.matches?.(selector)) nodes.add(root);
      } catch {
        // Ignore invalid selectors in older browsers
      }
    }
    return [...nodes];
  }

  function hidePromos() {
    for (const el of findPromoNodes()) {
      el.setAttribute(HIDDEN_ATTR, "1");
      el.style.setProperty("display", "none", "important");
    }
  }

  function showPromos() {
    for (const el of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.removeProperty("display");
    }
  }

  function applyState() {
    setDocumentEnabled(enabled);
    if (enabled) {
      hidePromos();
      startObserver();
    } else {
      stopObserver();
      showPromos();
    }
  }

  function startObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver((mutations) => {
      if (!enabled) return;

      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length) {
          shouldScan = true;
          break;
        }
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "data-test-selector" ||
            mutation.attributeName === "data-a-target" ||
            mutation.attributeName === "class")
        ) {
          shouldScan = true;
          break;
        }
      }

      if (shouldScan) hidePromos();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-test-selector", "data-a-target", "class"],
    });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  async function loadPreference() {
    try {
      const result = await chrome.storage.sync.get({ [STORAGE_KEY]: true });
      enabled = result[STORAGE_KEY] !== false;
    } catch {
      enabled = true;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!(STORAGE_KEY in changes)) return;
    enabled = changes[STORAGE_KEY].newValue !== false;
    applyState();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TCPC_GET_STATE") {
      sendResponse({ enabled });
      return false;
    }
    if (message?.type === "TCPC_SET_ENABLED") {
      enabled = Boolean(message.enabled);
      chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
      applyState();
      sendResponse({ enabled });
      return false;
    }
    return false;
  });

  async function init() {
    try {
      await chrome.runtime.sendMessage({ type: "TCPC_HELLO" });
    } catch {
      // Service worker may be waking up
    }
    await loadPreference();
    applyState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
