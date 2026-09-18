const PROMO_KEY = "promoCleanerEnabled";
const ADS_KEY = "chatAdsCleanerEnabled";

/** @type {Set<number>} */
const twitchTabs = new Set();

const ICONS_BASE = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

const ICONS_ON = {
  16: "icons/icon16-on.png",
  32: "icons/icon32-on.png",
  48: "icons/icon48-on.png",
  128: "icons/icon128.png",
};

const ICONS_OFF = {
  16: "icons/icon16-off.png",
  32: "icons/icon32-off.png",
  48: "icons/icon48-off.png",
  128: "icons/icon128.png",
};

function isTwitchUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "twitch.tv" || host.endsWith(".twitch.tv");
  } catch {
    return false;
  }
}

async function getEnabled() {
  const result = await chrome.storage.sync.get({
    [PROMO_KEY]: true,
    [ADS_KEY]: true,
  });
  return result[PROMO_KEY] !== false || result[ADS_KEY] !== false;
}

async function setTabIcon(tabId, mode) {
  const path = mode === "on" ? ICONS_ON : mode === "off" ? ICONS_OFF : ICONS_BASE;
  try {
    await chrome.action.setIcon({ tabId, path });
  } catch {
    // Tab may have closed
  }
}

async function refreshTabIcon(tabId, url) {
  if (url !== undefined && !isTwitchUrl(url) && !twitchTabs.has(tabId)) {
    await setTabIcon(tabId, "base");
    return;
  }

  const onTwitch = twitchTabs.has(tabId) || isTwitchUrl(url);
  if (!onTwitch) {
    await setTabIcon(tabId, "base");
    return;
  }

  twitchTabs.add(tabId);
  const enabled = await getEnabled();
  await setTabIcon(tabId, enabled ? "on" : "off");
}

async function refreshAllTwitchIcons() {
  const enabled = await getEnabled();
  const mode = enabled ? "on" : "off";
  await Promise.all([...twitchTabs].map((tabId) => setTabIcon(tabId, mode)));
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get([PROMO_KEY, ADS_KEY]);
  const patch = {};
  if (current[PROMO_KEY] === undefined) patch[PROMO_KEY] = true;
  if (current[ADS_KEY] === undefined) patch[ADS_KEY] = true;
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  await chrome.action.setIcon({ path: ICONS_BASE });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TCPC_HELLO" && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    twitchTabs.add(tabId);
    refreshTabIcon(tabId, sender.tab.url).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await refreshTabIcon(tabId, tab.url);
  } catch {
    await setTabIcon(tabId, "base");
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" && changeInfo.url === undefined) return;

  if (tab.url && !isTwitchUrl(tab.url)) {
    twitchTabs.delete(tabId);
    await setTabIcon(tabId, "base");
    return;
  }

  if (twitchTabs.has(tabId) || isTwitchUrl(tab.url)) {
    await refreshTabIcon(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  twitchTabs.delete(tabId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" && area !== "local") return;
  if (!(PROMO_KEY in changes) && !(ADS_KEY in changes)) return;
  refreshAllTwitchIcons();
});
