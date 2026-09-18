(() => {
  "use strict";

  const PROMO_KEY = "promoCleanerEnabled";
  const ADS_KEY = "chatAdsCleanerEnabled";
  const PROMO_CLASS = "tcpc-enabled";
  const ADS_CLASS = "tcpc-ads-enabled";
  const PROMO_HIDDEN_ATTR = "data-tcpc-hidden";
  const ADS_HIDDEN_ATTR = "data-tcpc-ads-hidden";

  /**
   * Selectors for promo / channel-skin banners that sit above Twitch chat.
   * Prefer stable data-test-selector / data-a-target attributes over generated classes.
   */
  const PROMO_SELECTORS = [
    '[data-test-selector="channel-skins-shared-above-chat-v3"]',
    '[data-test-selector*="channel-skins-shared-above-chat"]',
    '[data-a-target="channel-skins-shared-above-chat"]',
    '[data-a-target*="channel-skins-shared-above-chat"]',
    ".channel-skins-shared-above-chat",
    '[class*="ChannelSkinsSharedAboveChat"]',
    '[class*="channel-skins-shared-above-chat"]',
  ];

  /**
   * Brand collaboration / "Anuncio" skins above chat.
   * Match the slot (`channel-skins-above-chat-v3`), not the brand name.
   * `^=` covers v2/v3/future versions and does not match the shared promo skins.
   */
  const AD_SELECTORS = [
    '[data-test-selector="channel-skins-above-chat-v3"]',
    '[data-test-selector^="channel-skins-above-chat"]',
    '[data-a-target^="channel-skins-above-chat"]',
    ".stream-chat-header:has([data-test-selector^='channel-skins-above-chat'])",
    '[class*="stream-chat-header"]:has([data-test-selector^="channel-skins-above-chat"])',
    '[data-test-selector="ad-banner"]',
    '[data-a-target="ad-banner"]',
    '[data-test-selector="display-ad"]',
    '[data-a-target="banner-ad-container"]',
    '[data-test-selector="onsite-ad"]',
    '[data-a-target="onsite-ad"]',
  ];

  let promoEnabled = true;
  let adsEnabled = true;
  let observer = null;

  function hideNode(el, attr) {
    el.setAttribute(attr, "1");
    el.style.setProperty("display", "none", "important");
  }

  function showNodes(attr) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      el.removeAttribute(attr);
      el.style.removeProperty("display");
    }
  }

  function queryAll(selectors, root = document) {
    const nodes = new Set();
    for (const selector of selectors) {
      try {
        root.querySelectorAll?.(selector)?.forEach((el) => nodes.add(el));
        if (root.matches?.(selector)) nodes.add(root);
      } catch {
        // Ignore invalid selectors in older browsers
      }
    }
    return [...nodes];
  }

  function findPromoNodes(root = document) {
    return queryAll(PROMO_SELECTORS, root);
  }

  function findAdNodes(root = document) {
    const nodes = new Set(queryAll(AD_SELECTORS, root));
    for (const el of [...nodes]) {
      const header = el.closest(
        ".stream-chat-header, [class*='stream-chat-header']"
      );
      if (header) nodes.add(header);
    }
    return [...nodes];
  }

  function hidePromos() {
    for (const el of findPromoNodes()) hideNode(el, PROMO_HIDDEN_ATTR);
  }

  function hideAds() {
    for (const el of findAdNodes()) hideNode(el, ADS_HIDDEN_ATTR);
  }

  function applyState() {
    document.documentElement.classList.toggle(PROMO_CLASS, promoEnabled);
    document.documentElement.classList.toggle(ADS_CLASS, adsEnabled);

    if (promoEnabled) hidePromos();
    else showNodes(PROMO_HIDDEN_ATTR);

    if (adsEnabled) hideAds();
    else showNodes(ADS_HIDDEN_ATTR);

    if (promoEnabled || adsEnabled) startObserver();
    else stopObserver();
  }

  function startObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver((mutations) => {
      if (!promoEnabled && !adsEnabled) return;

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
            mutation.attributeName === "class" ||
            mutation.attributeName === "aria-label")
        ) {
          shouldScan = true;
          break;
        }
      }

      if (!shouldScan) return;
      if (promoEnabled) hidePromos();
      if (adsEnabled) hideAds();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-test-selector",
        "data-a-target",
        "class",
        "aria-label",
      ],
    });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  async function loadPreference() {
    try {
      const result = await chrome.storage.sync.get({
        [PROMO_KEY]: true,
        [ADS_KEY]: true,
      });
      promoEnabled = result[PROMO_KEY] !== false;
      adsEnabled = result[ADS_KEY] !== false;
    } catch {
      promoEnabled = true;
      adsEnabled = true;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    let changed = false;
    if (PROMO_KEY in changes) {
      promoEnabled = changes[PROMO_KEY].newValue !== false;
      changed = true;
    }
    if (ADS_KEY in changes) {
      adsEnabled = changes[ADS_KEY].newValue !== false;
      changed = true;
    }
    if (changed) applyState();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TCPC_GET_STATE") {
      sendResponse({ enabled: promoEnabled, adsEnabled });
      return false;
    }
    if (message?.type === "TCPC_SET_ENABLED") {
      promoEnabled = Boolean(message.enabled);
      chrome.storage.sync.set({ [PROMO_KEY]: promoEnabled });
      applyState();
      sendResponse({ enabled: promoEnabled, adsEnabled });
      return false;
    }
    if (message?.type === "TCPC_SET_ADS_ENABLED") {
      adsEnabled = Boolean(message.enabled);
      chrome.storage.sync.set({ [ADS_KEY]: adsEnabled });
      applyState();
      sendResponse({ enabled: promoEnabled, adsEnabled });
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
